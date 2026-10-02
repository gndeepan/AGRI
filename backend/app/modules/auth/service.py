import uuid
from datetime import UTC, datetime, timedelta

from fastapi import Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.email import send_email
from app.core.errors import AppError
from app.core.security import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    REFRESH_COOKIE_PATH,
    create_access_token,
    hash_password,
    hash_token,
    new_opaque_token,
)
from app.modules.users.models import EmailToken, RefreshToken, User, UserPreferences


def normalize_email(email: str) -> str:
    return email.strip().lower()


def find_active_user(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalize_email(email), User.deleted_at.is_(None)))


def create_user(db: Session, email: str, password: str, full_name: str, language: str = "en",
                role: str = "farmer") -> User:
    if find_active_user(db, email):
        raise AppError(409, "An account with this email already exists", "email_taken")
    user = User(email=normalize_email(email), password_hash=hash_password(password), full_name=full_name.strip(),
                role=role)
    user.preferences = UserPreferences(language=language)
    db.add(user)
    db.flush()
    return user


def issue_session(db: Session, user: User, response: Response, user_agent: str | None = None) -> None:
    settings = get_settings()
    refresh = new_opaque_token()
    db.add(RefreshToken(
        user_id=user.id, token_hash=hash_token(refresh), user_agent=(user_agent or "")[:300],
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
    ))
    common = {"httponly": True, "secure": settings.cookie_secure, "samesite": "lax"}
    response.set_cookie(ACCESS_COOKIE, create_access_token(user.id, user.role),
                        max_age=settings.access_token_minutes * 60, path="/", **common)
    response.set_cookie(REFRESH_COOKIE, refresh, max_age=settings.refresh_token_days * 86400,
                        path=REFRESH_COOKIE_PATH, **common)


def clear_session(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)


def rotate_refresh(db: Session, token: str | None) -> User:
    if not token:
        raise AppError(401, "Session expired", "not_authenticated")
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(token)))
    now = datetime.now(UTC)
    if row is None or row.expires_at < now:
        raise AppError(401, "Session expired", "not_authenticated")
    if row.revoked_at is not None:
        # Reuse of a rotated token: revoke every session of this user.
        db.execute(update(RefreshToken).where(RefreshToken.user_id == row.user_id, RefreshToken.revoked_at.is_(None))
                   .values(revoked_at=now))
        db.commit()
        raise AppError(401, "Session expired", "not_authenticated")
    row.revoked_at = now
    user = db.get(User, row.user_id)
    if user is None or user.deleted_at is not None or not user.is_active:
        raise AppError(401, "Session expired", "not_authenticated")
    return user


def revoke_refresh(db: Session, token: str | None) -> None:
    if token:
        db.execute(update(RefreshToken).where(RefreshToken.token_hash == hash_token(token))
                   .values(revoked_at=datetime.now(UTC)))


def revoke_all_sessions(db: Session, user_id: uuid.UUID) -> None:
    db.execute(update(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
               .values(revoked_at=datetime.now(UTC)))


def create_email_token(db: Session, user: User, purpose: str) -> str:
    token = new_opaque_token()
    hours = 1 if purpose == "reset" else get_settings().email_token_hours
    db.add(EmailToken(user_id=user.id, purpose=purpose, token_hash=hash_token(token),
                      expires_at=datetime.now(UTC) + timedelta(hours=hours)))
    return token


def consume_email_token(db: Session, token: str, purpose: str) -> User:
    row = db.scalar(select(EmailToken).where(EmailToken.token_hash == hash_token(token),
                                             EmailToken.purpose == purpose))
    now = datetime.now(UTC)
    if row is None or row.used_at is not None or row.expires_at < now:
        raise AppError(400, "This link is invalid or has expired", "invalid_token")
    row.used_at = now
    user = db.get(User, row.user_id)
    if user is None or user.deleted_at is not None:
        raise AppError(400, "This link is invalid or has expired", "invalid_token")
    return user


def send_verification(user: User, token: str) -> None:
    link = f"{get_settings().frontend_origin}/verify-email?token={token}"
    send_email(user.email, "Verify your Bhoomi AI email",
               f"Vanakkam {user.full_name},\n\nConfirm your email address:\n{link}\n\n"
               "If you did not create an account, ignore this message.")


def send_reset(user: User, token: str) -> None:
    link = f"{get_settings().frontend_origin}/reset-password?token={token}"
    send_email(user.email, "Reset your Bhoomi AI password",
               f"Vanakkam {user.full_name},\n\nReset your password (valid for 1 hour):\n{link}\n\n"
               "If you did not request this, you can ignore this message.")
