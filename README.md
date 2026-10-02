# Bhoomi AI

Bhoomi AI is an agriculture companion for farmers. It covers field mapping, environmental intelligence with clear data sources, crop planning with a transparent crop-development model, an immersive virtual paddy field, and an AI assistant powered by Gemini.

* Architecture and API contract: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
* Data sources, licences and limits: [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)
* Backend details: [backend/README.md](backend/README.md)

## Run locally (Docker)

Prerequisites: Docker Desktop or OrbStack.

```bash
cp .env.example .env        # set SECRET_KEY, and GEMINI_API_KEY from Google AI Studio
make up                     # db (PostGIS), redis, mailpit, api, worker, web
```

| Service | URL |
|---|---|
| Web app | http://localhost:5173 |
| API + OpenAPI docs | http://localhost:8000/api/docs |
| Dev mail inbox (verification/reset emails) | http://localhost:8025 |

On start, the API container applies migrations and seeds the crop catalogue.
Run the tests with `make test`.

## Honesty rules built into the product

* Every environmental value shows what kind of data it is: observed, forecast, climatology, modelled, user-entered or simulated. It also shows its source and when it was retrieved.
* SoilGrids values are labelled as 250 m model estimates. Farmers can enter lab or Soil Health Card results instead.
* Stage dates are shown as ranges and carry the model name and version.
* The virtual field visualises the crop model. It is not an observation of the real field.
* Field polygons are for planning only and are not legal survey boundaries.
