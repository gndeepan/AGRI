import uuid
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AppError
from app.core.security import ACCESS_COOKIE, decode_access_token
from app.modules.users.models import User

DB = Annotated[Session, Depends(get_db)]


def get_current_user(request: Request, db: DB) -> User:
    token = request.cookies.get(ACCESS_COOKIE)
    auth = request.headers.get("authorization", "")
    if not token and auth.lower().startswith("bearer "):
        token = auth[7:]
    payload = decode_access_token(token) if token else None
    if payload is None:
        raise AppError(401, "Not authenticated", "not_authenticated")
    user = db.scalar(select(User).where(User.id == uuid.UUID(payload["sub"]), User.deleted_at.is_(None)))
    if user is None or not user.is_active:
        raise AppError(401, "Not authenticated", "not_authenticated")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(user: CurrentUser) -> User:
    if user.role != "admin":
        raise AppError(403, "Administrator access required", "forbidden")
    return user


AdminUser = Annotated[User, Depends(require_admin)]
