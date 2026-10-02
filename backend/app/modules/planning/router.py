import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.audit import audit
from app.core.deps import DB, CurrentUser
from app.core.errors import AppError, not_found
from app.modules.crops.service import resolve_variety
from app.modules.planning import service
from app.modules.planning.models import AgriculturalTask, CropCycle
from app.modules.planning.schemas import CycleCreate, CyclePatch, CycleStatus, TaskIn, TaskOut, TaskPatch

router = APIRouter(tags=["planning"])


@router.get("/cycles")
def list_cycles(user: CurrentUser, db: DB, land_id: uuid.UUID | None = None,
                status: CycleStatus | None = None) -> list[dict]:
    q = (select(CropCycle).options(selectinload(CropCycle.predictions))
         .where(CropCycle.owner_id == user.id, CropCycle.deleted_at.is_(None)))
    if land_id:
        q = q.where(CropCycle.land_id == land_id)
    if status:
        q = q.where(CropCycle.status == status)
    return [service.cycle_out(db, c) for c in db.scalars(q.order_by(CropCycle.anchor_date.desc()))]


@router.post("/cycles", status_code=201)
def create_cycle(body: CycleCreate, request: Request, user: CurrentUser, db: DB) -> dict:
    cycle = service.create_cycle(db, user, body)
    audit(db, "cycle.create", user_id=user.id, request=request, entity_type="cycle", entity_id=cycle.id)
    db.commit()
    return service.cycle_out(db, cycle)


@router.get("/cycles/{cycle_id}")
def get_cycle(cycle_id: uuid.UUID, user: CurrentUser, db: DB) -> dict:
    return service.cycle_out(db, service.get_owned_cycle(db, user, cycle_id))


@router.patch("/cycles/{cycle_id}")
def patch_cycle(cycle_id: uuid.UUID, body: CyclePatch, request: Request, user: CurrentUser, db: DB) -> dict:
    cycle = service.get_owned_cycle(db, user, cycle_id)
    changes = body.model_dump(exclude_unset=True)
    if "variety_id" in changes and changes["variety_id"] is not None:
        resolve_variety(db, user, service.get_crop_by_id(db, cycle.crop_id), changes["variety_id"])
    for key, value in changes.items():
        setattr(cycle, key, value)
    if cycle.nursery_sowing_date and cycle.nursery_sowing_date >= cycle.anchor_date:
        raise AppError(422, "Nursery sowing must be before transplanting", "invalid_dates")
    if changes.keys() & {"variety_id", "anchor_date", "nursery_sowing_date", "water_availability"}:
        service.compute(db, cycle)
    audit(db, "cycle.update", user_id=user.id, request=request, entity_type="cycle", entity_id=cycle.id,
          fields=sorted(changes))
    db.commit()
    return service.cycle_out(db, cycle)


@router.delete("/cycles/{cycle_id}", status_code=204)
def delete_cycle(cycle_id: uuid.UUID, request: Request, user: CurrentUser, db: DB) -> Response:
    cycle = service.get_owned_cycle(db, user, cycle_id)
    cycle.deleted_at = datetime.now(UTC)
    audit(db, "cycle.delete", user_id=user.id, request=request, entity_type="cycle", entity_id=cycle.id)
    db.commit()
    return Response(status_code=204)


@router.post("/cycles/{cycle_id}/recompute")
def recompute(cycle_id: uuid.UUID, user: CurrentUser, db: DB) -> dict:
    cycle = service.get_owned_cycle(db, user, cycle_id)
    service.compute(db, cycle)
    db.commit()
    return service.cycle_out(db, cycle)


@router.get("/cycles/{cycle_id}/timeline")
def timeline(cycle_id: uuid.UUID, user: CurrentUser, db: DB, start: date | None = Query(None),
             end: date | None = Query(None)) -> list[dict]:
    cycle = service.get_owned_cycle(db, user, cycle_id)
    return service.timeline(db, cycle, start, end)


@router.get("/cycles/{cycle_id}/tasks", response_model=list[TaskOut])
def list_tasks(cycle_id: uuid.UUID, user: CurrentUser, db: DB) -> list[dict]:
    cycle = service.get_owned_cycle(db, user, cycle_id)
    tasks = db.scalars(select(AgriculturalTask).where(AgriculturalTask.cycle_id == cycle.id,
                                                      AgriculturalTask.deleted_at.is_(None))
                       .order_by(AgriculturalTask.due_date))
    return [service.task_out(t) for t in tasks]


@router.post("/cycles/{cycle_id}/tasks", response_model=TaskOut, status_code=201)
def create_task(cycle_id: uuid.UUID, body: TaskIn, user: CurrentUser, db: DB) -> dict:
    cycle = service.get_owned_cycle(db, user, cycle_id)
    task = AgriculturalTask(cycle_id=cycle.id, owner_id=user.id, source="user", **body.model_dump())
    db.add(task)
    db.commit()
    return service.task_out(task)


def _owned_task(db: DB, user, task_id: uuid.UUID) -> AgriculturalTask:
    task = db.scalar(select(AgriculturalTask).where(AgriculturalTask.id == task_id, AgriculturalTask.owner_id == user.id,
                                                    AgriculturalTask.deleted_at.is_(None)))
    if task is None:
        raise not_found("Task")
    return task


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def patch_task(task_id: uuid.UUID, body: TaskPatch, user: CurrentUser, db: DB) -> dict:
    task = _owned_task(db, user, task_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(task, key, value)
    if body.status is not None:
        task.completed_at = datetime.now(UTC) if body.status == "done" else None
    db.commit()
    return service.task_out(task)


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: uuid.UUID, user: CurrentUser, db: DB) -> Response:
    task = _owned_task(db, user, task_id)
    task.deleted_at = datetime.now(UTC)
    db.commit()
    return Response(status_code=204)
