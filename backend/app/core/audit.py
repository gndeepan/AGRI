import ipaddress
import uuid
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.modules.users.models import AuditLog


def audit(db: Session, action: str, *, user_id: uuid.UUID | None = None, request: Request | None = None,
          entity_type: str | None = None, entity_id: Any = None, **details: Any) -> None:
    """Adds an audit row to the session; the caller commits."""
    db.add(AuditLog(user_id=user_id, action=action, entity_type=entity_type,
                    entity_id=str(entity_id) if entity_id is not None else None, ip=client_ip(request), details=details))


def client_ip(request: Request | None) -> str | None:
    """Best-effort client address; None unless it parses as an IP (the column is inet, and
    X-Forwarded-For is client-controlled)."""
    if request is None:
        return None
    raw = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else "")
    try:
        return str(ipaddress.ip_address(raw))
    except ValueError:
        return None
