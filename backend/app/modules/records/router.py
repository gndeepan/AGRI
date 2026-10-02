import re
import uuid

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.core.deps import DB, CurrentUser
from app.modules.lands.service import get_owned_land, land_payload
from app.modules.planning import service as planning
from app.modules.planning.models import AgriculturalTask, FieldObservation, InputApplication, IrrigationRecord
from app.modules.planning.schemas import (
    InputIn,
    InputOut,
    IrrigationIn,
    IrrigationOut,
    ObservationIn,
    ObservationOut,
)
from app.modules.records.pdf import cycle_pdf

router = APIRouter(prefix="/cycles/{cycle_id}", tags=["records"])


def _list(db: DB, model, cycle_id: uuid.UUID, order_col) -> list:
    return list(db.scalars(select(model).where(model.cycle_id == cycle_id, model.deleted_at.is_(None))
                           .order_by(order_col)))


@router.get("/observations", response_model=list[ObservationOut])
def list_observations(cycle_id: uuid.UUID, user: CurrentUser, db: DB) -> list:
    cycle = planning.get_owned_cycle(db, user, cycle_id)
    return _list(db, FieldObservation, cycle.id, FieldObservation.observed_on)


@router.post("/observations", response_model=ObservationOut, status_code=201)
def add_observation(cycle_id: uuid.UUID, body: ObservationIn, user: CurrentUser, db: DB) -> FieldObservation:
    cycle = planning.get_owned_cycle(db, user, cycle_id)
    obs = FieldObservation(cycle_id=cycle.id, owner_id=user.id, **body.model_dump())
    db.add(obs)
    db.flush()
    if body.stage_key and body.stage_key in {p.stage_key for p in cycle.predictions}:
        planning.compute(db, cycle)  # observed stage dates override the model
    db.commit()
    db.refresh(obs)
    return obs


@router.get("/irrigation", response_model=list[IrrigationOut])
def list_irrigation(cycle_id: uuid.UUID, user: CurrentUser, db: DB) -> list:
    cycle = planning.get_owned_cycle(db, user, cycle_id)
    return _list(db, IrrigationRecord, cycle.id, IrrigationRecord.date)


@router.post("/irrigation", response_model=IrrigationOut, status_code=201)
def add_irrigation(cycle_id: uuid.UUID, body: IrrigationIn, user: CurrentUser, db: DB) -> IrrigationRecord:
    cycle = planning.get_owned_cycle(db, user, cycle_id)
    rec = IrrigationRecord(cycle_id=cycle.id, owner_id=user.id, **body.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.get("/inputs", response_model=list[InputOut])
def list_inputs(cycle_id: uuid.UUID, user: CurrentUser, db: DB) -> list:
    cycle = planning.get_owned_cycle(db, user, cycle_id)
    return _list(db, InputApplication, cycle.id, InputApplication.date)


@router.post("/inputs", response_model=InputOut, status_code=201)
def add_input(cycle_id: uuid.UUID, body: InputIn, user: CurrentUser, db: DB) -> InputApplication:
    cycle = planning.get_owned_cycle(db, user, cycle_id)
    rec = InputApplication(cycle_id=cycle.id, owner_id=user.id, **body.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.get("/export.pdf")
def export_pdf(cycle_id: uuid.UUID, user: CurrentUser, db: DB) -> Response:
    cycle = planning.get_owned_cycle(db, user, cycle_id)
    land = get_owned_land(db, user, cycle.land_id)
    tasks = [planning.task_out(t) for t in _list(db, AgriculturalTask, cycle.id, AgriculturalTask.due_date)]
    obs = [ObservationOut.model_validate(o, from_attributes=True).model_dump()
           for o in _list(db, FieldObservation, cycle.id, FieldObservation.observed_on)]
    inputs = [InputOut.model_validate(i, from_attributes=True).model_dump()
              for i in _list(db, InputApplication, cycle.id, InputApplication.date)]
    pdf = cycle_pdf(planning.cycle_out(db, cycle), land_payload(land, None), tasks, obs, inputs)
    slug = re.sub(r"[^a-z0-9]+", "-", land.name.lower()).strip("-") or "field"
    filename = f"bhoomi-plan-{slug}-{cycle.anchor_date}.pdf"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})
