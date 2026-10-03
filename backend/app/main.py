import logging
import time

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.errors import AppError
from app.core.logging import configure_logging
from app.core.redis import get_redis
from app.modules.admin.router import router as admin_router
from app.modules.assistant.router import router as assistant_router
from app.modules.auth.router import router as auth_router
from app.modules.crops.router import router as crops_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.environment.router import router as environment_router
from app.modules.lands.router import geo_router
from app.modules.lands.router import router as lands_router
from app.modules.notifications.router import router as notifications_router
from app.modules.planning.router import router as planning_router
from app.modules.records.router import router as records_router
from app.modules.users.router import router as users_router
from app.modules.water.router import router as water_router

log = logging.getLogger("bhoomi.api")
MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    app = FastAPI(title="Bhoomi AI API", version="0.1.0", openapi_url="/api/v1/openapi.json",
                  docs_url="/api/docs", redoc_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_origin], allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])

    @app.middleware("http")
    async def guard_and_log(request: Request, call_next):
        start = time.perf_counter()
        if (request.method in MUTATING and request.url.path.startswith("/api/")
                and request.headers.get("x-requested-with") != "bhoomi"):
            return JSONResponse({"detail": "Missing X-Requested-With header", "code": "csrf"}, status_code=403)
        response = await call_next(request)
        log.info("request", extra={"method": request.method, "path": request.url.path,
                                   "status": response.status_code,
                                   "ms": round((time.perf_counter() - start) * 1000, 1)})
        return response

    @app.exception_handler(AppError)
    async def app_error(_: Request, exc: AppError) -> JSONResponse:
        body = {"detail": exc.detail}
        if exc.code:
            body["code"] = exc.code
        return JSONResponse(body, status_code=exc.status_code, headers=exc.headers)

    api = APIRouter(prefix="/api/v1")
    for r in (auth_router, users_router, geo_router, lands_router, environment_router, crops_router,
              planning_router, records_router, dashboard_router, assistant_router, notifications_router,
              admin_router, water_router):
        api.include_router(r)

    @api.get("/health", tags=["health"])
    def health() -> dict:
        db_ok = redis_ok = False
        try:
            with SessionLocal() as db:
                db.execute(text("SELECT 1"))
            db_ok = True
        except Exception:  # noqa: BLE001 - health must never raise
            pass
        try:
            redis_ok = bool(get_redis().ping())
        except Exception:  # noqa: BLE001
            pass
        return {"status": "ok" if db_ok and redis_ok else "degraded", "db": db_ok, "redis": redis_ok}

    app.include_router(api)
    return app


app = create_app()
