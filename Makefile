.PHONY: up down logs test test-backend test-frontend migrate seed shell-db
up:            ; docker compose up -d --build
down:          ; docker compose down
logs:          ; docker compose logs -f api worker web
migrate:       ; docker compose exec api alembic upgrade head
seed:          ; docker compose exec api python -m app.seed
test-backend:  ; docker compose exec -e DATABASE_URL=postgresql+psycopg://bhoomi:bhoomi_dev@db:5432/bhoomi_test api pytest -q
test-frontend: ; cd frontend && npm test -- --run
test: test-backend test-frontend
shell-db:      ; docker compose exec db psql -U bhoomi bhoomi
