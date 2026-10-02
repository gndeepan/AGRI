import app.models  # noqa: F401 - register every table for FK resolution
from app.core.db import SessionLocal
from app.core.logging import configure_logging
from app.seed import run_seed

if __name__ == "__main__":
    configure_logging()
    with SessionLocal() as db:
        run_seed(db)
    print("seed complete")
