import uuid
from datetime import UTC, datetime

from fastapi import APIRouter
from sqlalchemy import select

from app.core.deps import DB, CurrentUser
from app.core.errors import not_found
from app.modules.users.models import Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _out(n: Notification) -> dict:
    return {"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "link": n.link,
            "read_at": n.read_at, "created_at": n.created_at}


@router.get("")
def list_notifications(user: CurrentUser, db: DB, unread_only: bool = False) -> list[dict]:
    q = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        q = q.where(Notification.read_at.is_(None))
    return [_out(n) for n in db.scalars(q.order_by(Notification.created_at.desc()).limit(100))]


@router.post("/{notification_id}/read")
def mark_read(notification_id: uuid.UUID, user: CurrentUser, db: DB) -> dict:
    n = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if n is None:
        raise not_found("Notification")
    n.read_at = n.read_at or datetime.now(UTC)
    db.commit()
    return _out(n)
