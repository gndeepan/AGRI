import uuid
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.audit import audit
from app.core.deps import DB, CurrentUser
from app.core.errors import AppError, not_found
from app.core.ratelimit import RateLimit
from app.modules.assistant import service
from app.modules.assistant.llm import get_llm
from app.modules.assistant.models import AIConversation, AIMessage
from app.modules.lands.service import get_owned_land
from app.modules.planning.models import AgriculturalTask
from app.modules.planning.service import get_owned_cycle, task_out

router = APIRouter(prefix="/assistant", tags=["assistant"])


class ConversationIn(BaseModel):
    land_id: uuid.UUID | None = None
    cycle_id: uuid.UUID | None = None
    title: str | None = Field(default=None, max_length=200)


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class ConfirmIn(BaseModel):
    message_id: uuid.UUID
    action_index: int = Field(ge=0)


def _conv_out(c: AIConversation, with_messages: bool = False) -> dict:
    out = {"id": c.id, "title": c.title, "land_id": c.land_id, "cycle_id": c.cycle_id,
           "created_at": c.created_at, "updated_at": c.updated_at}
    if with_messages:
        out["messages"] = [service.message_out(m) for m in c.messages]
    return out


def _owned_conv(db: DB, user, conv_id: uuid.UUID) -> AIConversation:
    conv = db.scalar(select(AIConversation).options(selectinload(AIConversation.messages))
                     .where(AIConversation.id == conv_id, AIConversation.user_id == user.id,
                            AIConversation.deleted_at.is_(None)))
    if conv is None:
        raise not_found("Conversation")
    return conv


@router.get("/conversations")
def list_conversations(user: CurrentUser, db: DB) -> list[dict]:
    convs = db.scalars(select(AIConversation).where(AIConversation.user_id == user.id,
                                                    AIConversation.deleted_at.is_(None))
                       .order_by(AIConversation.updated_at.desc()).limit(50))
    return [_conv_out(c) for c in convs]


@router.post("/conversations", status_code=201)
def create_conversation(body: ConversationIn, user: CurrentUser, db: DB) -> dict:
    land_id = body.land_id
    if body.cycle_id:
        cycle = get_owned_cycle(db, user, body.cycle_id)
        land_id = land_id or cycle.land_id
        if land_id != cycle.land_id:
            raise AppError(422, "Cycle does not belong to this land", "invalid_context")
    if land_id:
        get_owned_land(db, user, land_id)
    conv = AIConversation(user_id=user.id, land_id=land_id, cycle_id=body.cycle_id,
                          title=body.title or "New conversation")
    db.add(conv)
    db.commit()
    return _conv_out(conv, with_messages=True)


@router.get("/conversations/{conv_id}")
def get_conversation(conv_id: uuid.UUID, user: CurrentUser, db: DB) -> dict:
    return _conv_out(_owned_conv(db, user, conv_id), with_messages=True)


@router.post("/conversations/{conv_id}/messages",
             dependencies=[Depends(RateLimit("assistant", limit=20, window_s=300))])
def send_message(conv_id: uuid.UUID, body: MessageIn, user: CurrentUser, db: DB) -> dict:
    conv = _owned_conv(db, user, conv_id)
    llm = get_llm()
    user_msg, assistant_msg = service.answer(db, user, conv, body.content.strip(), llm)
    db.commit()
    return {"user_message": service.message_out(user_msg), "assistant_message": service.message_out(assistant_msg)}


@router.post("/actions/confirm")
def confirm_action(body: ConfirmIn, user: CurrentUser, db: DB) -> dict:
    msg = db.scalar(select(AIMessage).join(AIConversation).where(
        AIMessage.id == body.message_id, AIConversation.user_id == user.id, AIConversation.deleted_at.is_(None)))
    if msg is None or msg.role != "assistant":
        raise not_found("Message")
    if body.action_index >= len(msg.suggested_actions):
        raise AppError(422, "No such suggested action", "invalid_action")
    if body.action_index in msg.confirmed_actions:
        raise AppError(409, "This suggestion was already added", "already_confirmed")
    conv = db.get(AIConversation, msg.conversation_id)
    assert conv is not None
    if conv.cycle_id is None:
        raise AppError(422, "This conversation is not linked to a crop plan", "invalid_action")
    cycle = get_owned_cycle(db, user, conv.cycle_id)
    action = msg.suggested_actions[body.action_index]
    if action.get("type") != "create_task":
        raise AppError(422, "Unsupported action", "invalid_action")
    p = action["payload"]
    task = AgriculturalTask(
        cycle_id=cycle.id, owner_id=user.id, title=p["title"][:200], description=p.get("description", "")[:4000],
        category=p.get("category", "custom"), due_date=date.fromisoformat(p["due_date"]),
        source="assistant_suggested",
    )
    db.add(task)
    msg.confirmed_actions = [*msg.confirmed_actions, body.action_index]
    audit(db, "assistant.action_confirmed", user_id=user.id, entity_type="task", message_id=str(msg.id))
    db.commit()
    return {"task": task_out(task)}
