# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Bhoomi AI is an agriculture companion for farmers, focused on Tamil Nadu paddy. It has field mapping, environmental data with provenance, crop planning driven by a transparent phenology model, a 3D virtual field, and a Gemini-powered assistant. The UI is in English and Tamil (`en`/`ta`).

- `docs/ARCHITECTURE.md` is the **source of truth for the API contract**, shared by the backend and the frontend. Change the contract there first, then in code. Sections 7–9 hold additive notes such as stage keys, the live sky and water sources.
- `docs/DATA_SOURCES.md` lists the providers, their licences and their limits.

## Commands

The whole stack runs in Docker: `cp .env.example .env` (set `SECRET_KEY` and `GEMINI_API_KEY`), then `make up`.
- Web: http://localhost:5173. API docs: http://localhost:8000/api/docs. Mailpit (verification/reset emails): http://localhost:8025.
- On start the `api` container runs `alembic upgrade head && python -m app.seed`, then serves uvicorn with `--reload`. The backend is bind-mounted, so code edits hot-reload.
- `make logs`, `make migrate`, `make seed`, `make shell-db` (psql), `make down`.

### Backend (`backend/`, Python 3.12)
```bash
make test-backend                                  # pytest inside the api container against the bhoomi_test DB
docker compose exec -e DATABASE_URL=postgresql+psycopg://bhoomi:bhoomi_dev@db:5432/bhoomi_test api pytest -q tests/test_engine.py::test_name
.venv/bin/pytest -q tests/test_geo.py -k area      # local venv; DB tests auto-skip if Postgres is unreachable
ruff check .                                       # line-length 130; alembic/versions excluded
alembic revision -m "..."                          # migrations are hand-numbered: 0001_initial, 0002_variety_catalog, ...
```
CI also runs `alembic upgrade head && alembic downgrade base && alembic upgrade head`, so every migration needs a working `downgrade`.

### Frontend (`frontend/`, Node 24)
```bash
npm run dev                  # proxies /api to VITE_API_PROXY or http://localhost:8000
npm run typecheck && npm run lint
npm test -- --run            # Vitest (jsdom) + Testing Library + MSW
npx vitest run src/lib/timeline.test.ts     # single file; add -t "name" for a single test
npm run build                # tsc -b && vite build
npm run e2e                  # Playwright, desktop + mobile projects; needs the full stack up
```
CI runs, in order: typecheck → lint → test → build for the frontend, and ruff → migration round-trip → pytest for the backend.

## Backend architecture

FastAPI modular monolith on PostgreSQL 16 + PostGIS and Redis. A separate `worker` process (`app/worker.py`) runs the hourly jobs: refresh, recompute, notifications, provider-health snapshots and retention purge.

- **Modules** are in `app/modules/<domain>/`, each with `models.py`, `schemas.py`, `service.py` and `router.py`. Cross-module calls go through **services**, never through another module's router. Routers are registered under `/api/v1` in `app/main.py`.
- **New ORM models must be imported in `app/models.py`.** That file builds `Base.metadata` for Alembic and the tests.
- **Dependencies** in `app/core/deps.py` are `DB`, `CurrentUser` and `AdminUser` (Annotated types). Every land/cycle/record/conversation query filters on `owner_id`. Another user's resource returns **404, never 403**.
- **CSRF**: middleware in `main.py` rejects POST/PUT/PATCH/DELETE under `/api/` without the `X-Requested-With: bhoomi` header. Tests and API clients must send it.
- **Errors**: raise `AppError` (`app/core/errors.py`) with `status_code`, `detail` and an optional machine-readable `code`. The response is `{"detail", "code"}`.
- **External providers** (Open-Meteo, SoilGrids, Nominatim, Overpass, Gemini) are called server-side only, through `app/core/http.py`. That client has retries with backoff and a circuit breaker that trips after 5 failures and cools down for 60 s. Environment providers implement the Protocols in `modules/environment/providers/base.py`. A provider failure must **degrade, not crash**: serve the last stored data marked `stale`, fall back from forecast → archive → climatology, or return an empty result plus a `limitations` entry.
- **Provenance and data kinds** are a product requirement. Every environmental value carries a `Provenance` with a `kind` of `observed | forecast | climatology | modelled | user_entered | simulated | model_output`. Raw provider payloads (`raw` columns) are kept apart from normalized values and from model output (`crop_stage_predictions`).
- **Crop model** (`modules/planning/`): `gdd.py` and `engine.py` implement `bhoomi-rice-phenology 0.1`. It uses GDD = max(0, min(Tmean, 35) − 10) and a 28 °C reference. The uncertainty band widens with the share of days that use climatology. Farmer observations with a `stage_key` re-anchor the model. Non-rice crops use preliminary stage-fraction templates. Template tasks must never include fertilizer or pesticide doses.
- **Assistant** (`modules/assistant/`):
  - `llm.py` defines an `LLMClient` Protocol with a `GeminiClient`; tests use a fake.
  - `retrieval.py` runs BM25 over `knowledge/*.md`.
  - Replies are JSON-schema structured. Citations not found in the retrieved snippets are dropped.
  - Suggested tasks change data **only** through `POST /assistant/actions/confirm`.
  - With no `GEMINI_API_KEY`, the assistant returns 503 `assistant_unavailable`.
- **Crop catalogue**: seeded from `app/seed/` (`crops.py`, `rice_varieties.py`) by `python -m app.seed`, which must stay idempotent.

### Backend tests
- `tests/conftest.py` swaps in **fakeredis** for every test (autouse) and resets the circuit breakers.
- HTTP providers are mocked with **respx**. Fixtures in `tests/fakes.py` are synthetic, not real observations.
- Tests marked `@pytest.mark.db` need PostGIS. They migrate `bhoomi_test` once per session (downgrade base → upgrade head) and are skipped when the DB is unreachable.

## Frontend architecture

React 19 + TypeScript + Vite + Tailwind v4, with shadcn-style primitives in `src/components/ui`. Imports use the `@/` alias for `src/`.

- **API layer** (`src/api`):
  - `client.ts` handles cookie auth, adds the `X-Requested-With: bhoomi` header, and does a single shared refresh-on-401 retry.
  - `endpoints.ts` holds the typed calls, `queries.ts` the TanStack Query hooks, and `types.ts` mirrors the ARCHITECTURE.md schemas. Keep `types.ts` in sync with the contract.
- **State**: server state lives in TanStack Query. Zustand stores in `src/stores` hold auth, UI state and the timeline simulation.
- **Routing**: `src/app/router.tsx` lazy-loads every page, with guards from `guards.tsx`. `/dev/sky` and the login-scene preview exist only in dev builds.
- **Timeline / virtual field**: the cycle timeline is fetched **once** at daily resolution. `src/lib/timeline.ts` interpolates it deterministically into a `FieldVisualState`. Scrubbing or animating must not trigger network calls.
- **3D** (`src/features/field3d`, `src/components/auth/login3d`):
  - Built with React Three Fiber + drei + postprocessing and lazy-loaded.
  - `WebGLBoundary` and `features/timeline/Field2D.tsx` are the non-WebGL fallback. `quality.ts` and `tier.ts` handle device quality tiers.
  - Randomness goes through the seeded `prng.ts`, so scenes are deterministic and testable.
  - Pure logic (growth, sky, landscape, bird and farmer paths) sits in plain `.ts` files with unit tests, separate from the components.
- **Live sky** (`src/features/sky`): `toSkyParams` is pure. `createSkyRenderer` is a headless WebGL2 renderer whose `lightProbe` also lights the 3D field. Lightning is drawn only for WMO codes 95/96/99. There is at most one flash per 2.4 s, and none under `prefers-reduced-motion`.
- **Maps**: MapLibre + terra-draw (`src/features/map`, `src/features/water`).
- **i18n**: `src/i18n/locales/{en,ta}.json`. `i18n.test.ts` enforces key parity and checks that every static `t()` key exists, so **add new strings to both files**.
- **Tests**:
  - MSW runs with `onUnhandledRequest: 'error'`, so any component test that hits a new endpoint needs a handler in `src/test/server.ts` and data in `src/test/fixtures`.
  - `ResizeObserver` and `matchMedia` are stubbed in `src/test/setup.ts`.

## Product honesty rules (keep these when changing the UI or the API)

- Every environmental value shows its data kind, its source and when it was retrieved (`DataKindBadge`).
- SoilGrids values are labelled as 250 m model estimates. Farmers can enter lab or Soil Health Card results instead.
- Stage dates appear as ranges and carry the model name and version.
- The virtual field visualises the crop model, not the real field. Simulated effects are labelled `simulated`.
- Field polygons are for planning only, not legal boundaries. Area and perimeter are geodesic: pyproj `Geod` in Python, cross-checked with PostGIS `ST_Area(geography)`.
- The assistant never gives pesticide doses beyond label or official guidance. For high-impact decisions it refers farmers to the Agricultural Officer, KVK or TNAU.
