# Bhoomi AI — web app

React 19 + TypeScript + Vite + Tailwind v4. It talks to the FastAPI backend through `/api` (Vite proxies it in dev).

```bash
npm install
npm run dev          # http://localhost:5173 (proxy → VITE_API_PROXY or http://localhost:8000)
npm run typecheck
npm run lint
npm test -- --run    # Vitest + Testing Library + MSW (synthetic fixtures only)
npm run build
npm run e2e          # Playwright; needs the full stack up (docker compose up)
```

Layout:
- `src/api`: typed client (cookies, CSRF header, refresh-on-401), endpoints and TanStack Query hooks
- `src/pages`: route screens
- `src/features/map`: MapLibre and terra-draw field drawing
- `src/features/timeline`: scroll-driven timeline and 2D fallback field
- `src/features/field3d`: R3F virtual paddy field
- `src/lib/timeline.ts`: deterministic timeline → `FieldVisualState` interpolation (no network calls while scrubbing)
- `src/i18n/locales/{en,ta}.json`: a test enforces key parity and coverage of every static `t()` key
