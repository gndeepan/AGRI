from datetime import UTC, datetime

from fastapi import APIRouter, Request, Response
from sqlalchemy import update

from app.core.audit import audit
from app.core.deps import DB, CurrentUser
from app.core.errors import AppError
from app.core.security import verify_password
from app.modules.auth.service import clear_session, revoke_all_sessions
from app.modules.lands.models import LandProfile
from app.modules.users.models import UserPreferences
from app.modules.users.schemas import DeleteAccount, UserOut, UserPatch, user_out

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me", response_model=UserOut)
def update_me(body: UserPatch, user: CurrentUser, db: DB) -> UserOut:
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.preferences is not None:
        if user.preferences is None:
            user.preferences = UserPreferences()
        for key, value in body.preferences.model_dump(exclude_unset=True).items():
            if value is not None or key == "region":
                setattr(user.preferences, key, value)
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.delete("/me", status_code=204)
def delete_me(body: DeleteAccount, request: Request, user: CurrentUser, db: DB) -> Response:
    if not verify_password(body.password, user.password_hash):
        raise AppError(403, "Password is incorrect", "invalid_credentials")
    now = datetime.now(UTC)
    # Soft-delete and anonymize now; the worker purges owned data after the retention window.
    db.execute(update(LandProfile).where(LandProfile.owner_id == user.id, LandProfile.deleted_at.is_(None))
               .values(deleted_at=now))
    user.deleted_at = now
    user.is_active = False
    user.email = f"deleted-{user.id}@deleted.invalid"
    user.full_name = "Deleted user"
    revoke_all_sessions(db, user.id)
    audit(db, "user.delete", user_id=user.id, request=request)
    db.commit()
    response = Response(status_code=204)
    clear_session(response)
    return response
