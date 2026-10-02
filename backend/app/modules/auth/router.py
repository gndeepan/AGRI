from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request, Response, status

from app.core.audit import audit
from app.core.deps import DB, CurrentUser
from app.core.errors import AppError
from app.core.ratelimit import RateLimit
from app.core.security import REFRESH_COOKIE, hash_password, verify_password
from app.modules.auth import service
from app.modules.auth.schemas import EmailIn, LoginIn, RegisterIn, ResetPasswordIn, TokenIn
from app.modules.users.schemas import UserOut, user_out

router = APIRouter(prefix="/auth", tags=["auth"])
auth_limit = Depends(RateLimit("auth", limit=20, window_s=60))
email_limit = Depends(RateLimit("auth-email", limit=5, window_s=600))


@router.post("/register", response_model=UserOut, status_code=201, dependencies=[auth_limit])
def register(body: RegisterIn, request: Request, response: Response, db: DB) -> UserOut:
    user = service.create_user(db, body.email, body.password, body.full_name, body.language)
    token = service.create_email_token(db, user, "verify")
    service.issue_session(db, user, response, request.headers.get("user-agent"))
    audit(db, "user.register", user_id=user.id, request=request, entity_type="user", entity_id=user.id)
    db.commit()
    service.send_verification(user, token)
    return user_out(user)


@router.post("/login", response_model=UserOut, dependencies=[auth_limit])
def login(body: LoginIn, request: Request, response: Response, db: DB) -> UserOut:
    user = service.find_active_user(db, body.email)
    if user is None or not user.is_active or not verify_password(body.password, user.password_hash):
        audit(db, "user.login_failed", request=request, email_domain=body.email.split("@")[-1])
        db.commit()
        raise AppError(401, "Incorrect email or password", "invalid_credentials")
    service.issue_session(db, user, response, request.headers.get("user-agent"))
    audit(db, "user.login", user_id=user.id, request=request)
    db.commit()
    return user_out(user)


@router.post("/logout", status_code=204)
def logout(request: Request, db: DB) -> Response:
    service.revoke_refresh(db, request.cookies.get(REFRESH_COOKIE))
    db.commit()
    response = Response(status_code=204)
    service.clear_session(response)
    return response


@router.post("/refresh", response_model=UserOut, dependencies=[auth_limit])
def refresh(request: Request, response: Response, db: DB) -> UserOut:
    user = service.rotate_refresh(db, request.cookies.get(REFRESH_COOKIE))
    service.issue_session(db, user, response, request.headers.get("user-agent"))
    db.commit()
    return user_out(user)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return user_out(user)


@router.post("/verify-email", response_model=UserOut, dependencies=[auth_limit])
def verify_email(body: TokenIn, db: DB) -> UserOut:
    user = service.consume_email_token(db, body.token, "verify")
    user.email_verified_at = user.email_verified_at or datetime.now(UTC)
    db.commit()
    return user_out(user)


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED, dependencies=[email_limit])
def resend_verification(user: CurrentUser, db: DB) -> dict:
    if user.email_verified_at is None:
        token = service.create_email_token(db, user, "verify")
        db.commit()
        service.send_verification(user, token)
    return {"status": "accepted"}


@router.post("/request-password-reset", status_code=status.HTTP_202_ACCEPTED, dependencies=[email_limit])
def request_password_reset(body: EmailIn, request: Request, db: DB) -> dict:
    user = service.find_active_user(db, body.email)
    if user is not None:
        token = service.create_email_token(db, user, "reset")
        audit(db, "user.password_reset_requested", user_id=user.id, request=request)
        db.commit()
        service.send_reset(user, token)
    return {"status": "accepted"}  # same response whether or not the account exists


@router.post("/reset-password", status_code=204, dependencies=[auth_limit])
def reset_password(body: ResetPasswordIn, request: Request, db: DB) -> Response:
    user = service.consume_email_token(db, body.token, "reset")
    user.password_hash = hash_password(body.new_password)
    service.revoke_all_sessions(db, user.id)
    audit(db, "user.password_reset", user_id=user.id, request=request)
    db.commit()
    return Response(status_code=204)
