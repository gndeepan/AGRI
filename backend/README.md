# Bhoomi AI — backend

FastAPI modular monolith on PostgreSQL/PostGIS and Redis. The API contract is in [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) and the data sources are in [`../docs/DATA_SOURCES.md`](../docs/DATA_SOURCES.md).

```
app/
  core/            config, db, redis, security (argon2, JWT), resilient HTTP client + circuit breaker,
                   rate limiting, audit, email, JSON logging
  modules/
    auth/ users/   register/login/refresh/verify/reset, preferences, account deletion
    lands/         geo.py (validation + geodesic metrics), geocoding.py (Nominatim proxy), versioned boundaries
    environment/   providers/ (Open-Meteo forecast/archive/elevation, SoilGrids), climatology, rule alerts, service
    crops/         catalog, recommend.py (transparent scoring)
    planning/      gdd.py, engine.py (bhoomi-rice-phenology 0.1), task templates, cycles/timeline/tasks
    records/       observations, irrigation, inputs, PDF export
    dashboard/ notifications/ admin/
    assistant/     Gemini client, BM25 retrieval over knowledge/*.md, grounded context, confirm-to-apply actions
  seed/            curated crop catalog + data-source metadata (python -m app.seed)
  worker.py        hourly refresh, recompute, notifications, provider-health snapshot, retention purge
alembic/           0001_initial (all tables, PostGIS, GIST index)
tests/             unit tests (no DB) + @pytest.mark.db integration tests
```

## Run with Docker (recommended)

From the repo root:

```bash
cp .env.example .env        # then set SECRET_KEY and GEMINI_API_KEY
docker compose up -d --build
open http://localhost:8000/api/docs   # OpenAPI UI
open http://localhost:8025            # Mailpit: verification/reset emails
make test-backend                     # full suite incl. PostGIS tests against bhoomi_test
```

The `api` container runs `alembic upgrade head` and `python -m app.seed` on start.

## Run locally without Docker

You still need PostgreSQL with PostGIS, and Redis.

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
export DATABASE_URL=postgresql+psycopg://bhoomi:bhoomi_dev@localhost:5432/bhoomi REDIS_URL=redis://localhost:6379/0
.venv/bin/alembic upgrade head && .venv/bin/python -m app.seed
.venv/bin/uvicorn app.main:app --reload
.venv/bin/python -m app.worker        # separate terminal
```

## Tests

```bash
.venv/bin/pytest -q          # DB tests auto-skip if DATABASE_URL (default: localhost bhoomi_test) is unreachable
.venv/bin/ruff check app tests
```

* Unit tests need no network or database. They use fakeredis, respx and **synthetic** fixtures (`tests/fakes.py`). None of those values are real observations.
* DB tests run `alembic downgrade base && upgrade head` once per session. They then cover auth, cross-user isolation (404), land CRUD with a PostGIS `ST_Area(geography)` cross-check, environment endpoints, cycle → timeline → observation re-anchoring → PDF, and the assistant (with a fake LLM).

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ENVIRONMENT` | `development` | `production` for prod behaviour |
| `SECRET_KEY` | dev value | JWT signing key. **Set a long random value.** |
| `DATABASE_URL` | `postgresql+psycopg://bhoomi:bhoomi_dev@localhost:5432/bhoomi` | SQLAlchemy URL |
| `REDIS_URL` | `redis://localhost:6379/0` | cache, rate limits, worker lock, provider health |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS origin and base for email links |
| `COOKIE_SECURE` | `false` | set `true` behind HTTPS |
| `ACCESS_TOKEN_MINUTES` / `REFRESH_TOKEN_DAYS` | 15 / 30 | session lifetimes |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Mailpit | outgoing email |
| `GEMINI_API_KEY` | – | Google AI Studio key. The assistant returns 503 `assistant_unavailable` without it. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model id |
| `HTTP_USER_AGENT` | `BhoomiAI/0.1 (...)` | Required by the Nominatim policy. Put a real contact here. |
| `OPEN_METEO_API_KEY` | – | Commercial Open-Meteo plan. The free tier is non-commercial. |
| `NOMINATIM_URL`, `SOILGRIDS_URL`, `OPEN_METEO_*_URL` | public endpoints | swap for self-hosted or commercial endpoints |
| `WEATHER_CACHE_MINUTES` / `SOIL_CACHE_DAYS` / `CLIMATOLOGY_YEARS` | 30 / 30 / 10 | caching and climatology window |
| `WORKER_INTERVAL_S` | 3600 | worker pass interval |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | – | optional admin created by the seed |

## Design notes

* **Mutating requests** must send `X-Requested-With: bhoomi`. This is a CSRF guard on top of SameSite=Lax cookies. Bearer tokens are also accepted for API clients.
* **Ownership.** Every land, cycle, record and conversation query filters on the owner. Another user's resource returns 404.
* **Provider failures** degrade instead of crashing:
  * Weather falls back to the last stored forecast and marks it `stale`.
  * The daily series falls back through bundle → archive → climatology.
  * When soil data is unavailable the endpoint returns an empty profile with a limitation, and soil tests still work.
  * Retries use exponential backoff. A circuit breaker trips after 5 consecutive failed calls, with a 60 s cool-down.
* **Data kinds.** `observed` (Open-Meteo past days and ERA5 reanalysis), `forecast` (≤16 days), `climatology` (10-year mean), `modelled` (SoilGrids), `user_entered`, `model_output`. Raw provider payloads are stored apart from normalized values (`raw` columns) and from predictions (`crop_stage_predictions`).
* **Crop model.**
  * Paddy uses `bhoomi-rice-phenology 0.1` (see ARCHITECTURE §5). Other crops use a preliminary stage-fraction template.
  * Farmer observations with a `stage_key` re-anchor the model.
  * Template reminders never include fertilizer or pesticide doses.
* **Assistant.**
  * Gemini answers with a JSON schema: answer, citations, missing info and suggested tasks.
  * Citations are kept only if they match retrieved snippets.
  * Suggested tasks are stored, and become real tasks only via `POST /assistant/actions/confirm`.

### Known limitations
* PDF export is English-only for now, because no Tamil font is embedded. The `₹` glyph may render as a box with the base fonts.
* Photo upload (`crop_photos` table) has a schema but no upload endpoint or object storage yet.
* IMD official warnings are not integrated. Alerts are rule-based and labelled `bhoomi_rules`.
