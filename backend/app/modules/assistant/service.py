import json
import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.assistant.llm import AssistantReply, LLMClient
from app.modules.assistant.models import AIConversation, AIMessage
from app.modules.assistant.retrieval import Chunk, search
from app.modules.environment.models import SoilTest
from app.modules.environment.service import EnvironmentService
from app.modules.lands.models import LandProfile
from app.modules.planning import service as planning
from app.modules.planning.models import AgriculturalTask, CropCycle, FieldObservation
from app.modules.users.models import User
from app.modules.water.service import WaterService

log = logging.getLogger(__name__)
LANG_NAMES = {"en": "English", "ta": "Tamil"}

SYSTEM_PROMPT = """You are Bhoomi, an agriculture assistant for farmers in India (initially Tamil Nadu).
You answer using ONLY the FIELD CONTEXT and KNOWLEDGE snippets provided, plus general, widely accepted agronomy.

Rules:
- Be practical and concise. Reply in {language}. Use simple words.
- Clearly separate measured data, forecasts, model estimates and your own general guidance. Every value in the
  context carries a 'kind' (observed/forecast/climatology/modelled/model_output/user_entered); respect it.
  Never present crop-stage dates as observations of the actual plants — they are model estimates.
- State uncertainty. If information needed for a good answer is missing, say what is missing in
  `missing_information` and ask for it.
- NEVER give pesticide, fungicide or herbicide product doses or mixing ratios, and never recommend banned or
  unregistered chemicals. For pest/disease control, describe what to observe and tell the farmer to confirm with
  the local Agricultural Officer, Krishi Vigyan Kendra (KVK) or TNAU before spraying.
- Do not prescribe fertilizer quantities; point to the Soil Health Card / soil-test-based recommendation.
- For high-impact or uncertain decisions (crop choice, large spending, suspected serious disease, livestock or
  human health), recommend consulting a qualified local expert.
- You cannot change the farmer's plan. You may PROPOSE tasks in `suggested_tasks`; they are only added if the
  farmer confirms. Only propose tasks when clearly useful, with due dates on or after today ({today}).
- Cite knowledge snippets you relied on by their id in `cited_source_ids`. Do not invent sources or URLs.
- Do not invent weather numbers: use only the context. If weather data is unavailable, say so.
"""


def build_context(db: Session, user: User, land: LandProfile | None, cycle: CropCycle | None,
                  env: EnvironmentService | None = None) -> dict:
    today = date.today()
    ctx: dict = {"today": today.isoformat()}
    if cycle is not None and land is None:
        land = db.get(LandProfile, cycle.land_id)
    if land is not None:
        env = env or EnvironmentService(db)
        m = next(b for b in reversed(land.boundaries) if b.is_current).metrics
        ctx["field"] = {
            "name": land.name, "area_acres": m["area_acres"], "area_ha": m["area_ha"],
            "centroid": m["centroid"], "village": land.village, "district": land.district, "state": land.state,
            "note": "Boundary drawn by the farmer; not a legal survey.",
        }
        try:
            wx = env.weather_bundle(land.centroid_lat, land.centroid_lon, land.id)
            ctx["weather"] = {
                "provenance": {k: wx["provenance"][k] for k in ("provider", "retrieved_at", "cache_status")},
                "current": wx["current"],
                "next_days": [{k: d[k] for k in ("date", "tmin_c", "tmax_c", "precipitation_mm",
                                                  "precipitation_probability_pct", "wind_gusts_max_kmh", "kind")}
                              for d in wx["daily"] if d["date"] >= today.isoformat()][:7],
                "alerts": [{k: a[k] for k in ("title", "message", "starts")} for a in wx["alerts"]],
            }
        except AppError:
            ctx["weather"] = {"unavailable": True}
        # Water sources only from the cache (never a live provider call while chatting).
        water = WaterService().cached(land.id, next(b for b in reversed(land.boundaries) if b.is_current)
                                      .metrics["geojson"])
        if water is not None:
            ctx["nearby_water"] = {
                "kind": "estimate", "source": "OpenStreetMap", "radius_m": water["radius_m"],
                "nearest_by_kind": water["nearest_by_kind"], "counts_by_kind": water["counts_by_kind"],
                "caveat": "OSM coverage varies; mapped water bodies may be seasonal or dry.",
            }
        test = db.scalar(select(SoilTest).where(SoilTest.land_id == land.id, SoilTest.deleted_at.is_(None))
                         .order_by(SoilTest.sample_date.desc()).limit(1))
        if test is not None:
            ctx["soil_test"] = {"kind": "user_entered", "sample_date": test.sample_date.isoformat(), "ph": test.ph,
                                "ec_ds_m": test.ec_ds_m, "organic_carbon_pct": test.organic_carbon_pct,
                                "n_kg_ha": test.n_kg_ha, "p_kg_ha": test.p_kg_ha, "k_kg_ha": test.k_kg_ha,
                                "texture": test.texture}
        else:
            try:
                soil = env.soil_profile(land.centroid_lat, land.centroid_lon, land.id)
                ctx["soil_estimate"] = {"kind": "modelled", "source": "SoilGrids 250 m",
                                        "texture_class": soil["texture_class"], "top_layer": (soil["layers"] or [None])[0],
                                        "limitations": soil["limitations"][:2]}
            except AppError:
                ctx["soil_estimate"] = {"unavailable": True}
    if cycle is not None:
        detail = planning.cycle_out(db, cycle, today)
        ctx["crop_plan"] = {
            "crop": detail["crop"]["name"]["en"], "variety": (detail["variety"] or {}).get("name"),
            "method": cycle.method, "anchor": f"{cycle.anchor_type} on {cycle.anchor_date}", "status": cycle.status,
            "current": detail["current"],
            "stages": [{"key": s["key"], "start": s["start"]["expected"], "end": s["end"]["expected"],
                        "source": s["source"]} for s in detail["stages"]],
            "harvest_window": detail["harvest_window"],
            "model": {"name": detail["model"]["name"], "kind": "model_output",
                      "missing_inputs": detail["model"]["missing_inputs"]},
        }
        tasks = db.scalars(select(AgriculturalTask).where(
            AgriculturalTask.cycle_id == cycle.id, AgriculturalTask.deleted_at.is_(None),
            AgriculturalTask.status == "pending", AgriculturalTask.due_date <= today + timedelta(days=14))
            .order_by(AgriculturalTask.due_date).limit(12))
        ctx["upcoming_tasks"] = [{"title": t.title, "due": t.due_date, "category": t.category} for t in tasks]
        obs = db.scalars(select(FieldObservation).where(
            FieldObservation.cycle_id == cycle.id, FieldObservation.deleted_at.is_(None))
            .order_by(FieldObservation.observed_on.desc()).limit(5))
        ctx["recent_observations"] = [{"date": o.observed_on, "stage": o.stage_key, "notes": o.notes,
                                       "pest_or_disease": o.pest_or_disease, "severity": o.severity} for o in obs]
    return ctx


def _knowledge_block(chunks: list[Chunk]) -> str:
    return "\n\n".join(f"[{c.id}] {c.title} — {c.heading} ({c.publisher})\n{c.text}" for c in chunks)


def answer(db: Session, user: User, conv: AIConversation, content: str, llm: LLMClient,
           env: EnvironmentService | None = None) -> tuple[AIMessage, AIMessage]:
    land = db.get(LandProfile, conv.land_id) if conv.land_id else None
    cycle = db.get(CropCycle, conv.cycle_id) if conv.cycle_id else None
    context = build_context(db, user, land, cycle, env)
    crop_hint = (context.get("crop_plan") or {}).get("crop", "")
    chunks = search(f"{content} {crop_hint}", k=4)
    language = LANG_NAMES.get(user.preferences.language if user.preferences else "en", "English")
    system = SYSTEM_PROMPT.format(language=language, today=context["today"])
    history = [(m.role, m.content) for m in conv.messages[-10:]]
    prompt = (f"FIELD CONTEXT (JSON):\n{json.dumps(context, default=str)}\n\n"
              f"KNOWLEDGE:\n{_knowledge_block(chunks) or '(no matching snippets)'}\n\n"
              f"FARMER'S QUESTION:\n{content}")

    user_msg = AIMessage(conversation_id=conv.id, role="user", content=content)
    db.add(user_msg)
    db.flush()
    reply: AssistantReply = llm.generate(system, history, prompt)

    by_id = {c.id: c for c in chunks}
    sources, seen = [], set()
    for cid in reply.cited_source_ids:
        c = by_id.get(cid)
        if c and c.url not in seen:
            seen.add(c.url)
            sources.append({"title": c.title, "publisher": c.publisher, "url": c.url})
    actions = []
    if cycle is not None:
        for t in reply.suggested_tasks:
            try:
                due = date.fromisoformat(t.due_date)
            except ValueError:
                continue
            if due >= date.today():
                actions.append({"type": "create_task", "payload": {**t.model_dump(), "due_date": due.isoformat()}})
    text = reply.answer
    if reply.missing_information:
        text += "\n\n**Information that would help:**\n" + "\n".join(f"- {m}" for m in reply.missing_information)
    assistant_msg = AIMessage(
        conversation_id=conv.id, role="assistant", content=text, sources=sources, suggested_actions=actions,
        model=llm.model, context={
            "land": land.name if land else None, "cycle": str(cycle.id) if cycle else None,
            "weather_kind": "unavailable" if (context.get("weather") or {}).get("unavailable") else
            ("forecast" if "weather" in context else None),
            "knowledge_ids": [c.id for c in chunks],
        })
    db.add(assistant_msg)
    if conv.title == "New conversation":
        conv.title = content[:80]
    db.flush()
    return user_msg, assistant_msg


def message_out(m: AIMessage) -> dict:
    return {"id": m.id, "role": m.role, "content": m.content, "sources": m.sources, "context": m.context,
            "suggested_actions": m.suggested_actions, "confirmed_actions": m.confirmed_actions,
            "created_at": m.created_at}
