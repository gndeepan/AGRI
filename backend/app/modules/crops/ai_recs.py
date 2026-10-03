"""AI crop recommendations grounded in one field's real data.

The model only sees facts retrieved for this field (location, terrain, soil, forecast,
climatology, irrigation), the transparent rule-engine shortlist and the curated catalog.
Its answer is validated before anyone sees it: crops and varieties outside the catalog are
dropped, and any sentence quoting a number that is not in the field's facts is removed.
When data or the model is unavailable we say so; we never fall back to invented text.
"""

import hashlib
import json
import logging
import re
import time
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.http import ProviderError
from app.core.redis import cache_get_json, cache_set_json
from app.modules.crops import service
from app.modules.crops.models import CropCatalog
from app.modules.crops.recommend import SiteContext, recommend
from app.modules.environment.service import EnvironmentService
from app.modules.lands.models import LandProfile
from app.modules.lands.service import current_boundary
from app.modules.users.models import User
from app.seed.crops import SEASONS

log = logging.getLogger(__name__)

CACHE_TTL_S = 24 * 3600
CACHE_VERSION = "v1"
SEASON_DAYS = 120  # climatology window summarised for the model
SHORTLIST = 12
RETRIES = 2
RETRY_BACKOFF_S = 1.0
NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)?")

DISCLAIMER = ("AI-generated from this field's data. Verify with your local agriculture officer, KVK or "
              "seed supplier before deciding.")


# ---------- model I/O ----------

class AIRec(BaseModel):
    crop_slug: str = Field(description="Exact slug from the catalog")
    rank: int
    fit: Literal["strong", "moderate", "weak"]
    varieties: list[str] = Field(default_factory=list, description="Exact variety names from the catalog for this crop")
    why: list[str] = Field(description="2-4 short field-specific reasons quoting the provided numbers")
    risks: list[str] = Field(default_factory=list, description="Field-specific risks")
    sowing_window: str | None = Field(None, description="e.g. '01 Oct – 31 Oct'")
    water_plan: str = Field("", description="One sentence on irrigation for this field")
    confidence: Literal["low", "medium", "high"]


class AIRecsOut(BaseModel):
    summary: str = Field(description="Two sentences about what this field suits right now")
    recommendations: list[AIRec]
    data_gaps: list[str] = Field(default_factory=list, description="Missing data that would change the advice")


SYSTEM = """You are an agronomy assistant for farmers in Tamil Nadu, India, inside a planning app.
You receive FACTS retrieved for ONE specific field, a rule-based SHORTLIST, and a CATALOG.
Rules:
- Recommend 3 to 6 crops for this field and sowing date, ranked best first.
- Use ONLY crop slugs and variety names that appear in the CATALOG, spelled exactly.
- Every reason must be specific to this field and may only quote numbers that appear in FACTS
  (soil percentages, pH, rainfall, temperatures, elevation, forecast totals). Never invent numbers.
- Consider season timing, temperature, rainfall plus the stated irrigation availability, soil texture and
  pH, drainage/waterlogging, elevation, and the short-term forecast.
- Prefer varieties whose duration and season fit the sowing date. Leave varieties empty if unsure.
- Do not give fertilizer or pesticide doses. Do not promise yields.
- List data_gaps honestly (e.g. no lab soil test, no nearby water source data).
- Write in the requested language. Keep sentences short and practical."""


class RecsLLM(Protocol):
    model: str

    def recommend(self, prompt: str) -> AIRecsOut: ...


class GeminiRecsLLM:
    def __init__(self, api_key: str, model: str):
        from google import genai

        self.client = genai.Client(api_key=api_key)
        self.model = model

    def recommend(self, prompt: str) -> AIRecsOut:
        from google.genai import errors, types

        config = types.GenerateContentConfig(system_instruction=SYSTEM, temperature=0.2,
                                             response_mime_type="application/json", response_schema=AIRecsOut)
        for attempt in range(RETRIES + 1):
            try:
                resp = self.client.models.generate_content(model=self.model, contents=prompt, config=config)
                break
            except errors.APIError as exc:
                transient = getattr(exc, "code", None) in (429, 500, 503)
                if transient and attempt < RETRIES:
                    time.sleep(RETRY_BACKOFF_S * 2**attempt)
                    continue
                log.error("gemini crop recommendations failed", extra={"error": str(exc)[:300]})
                raise AppError(502, "The AI service failed to answer.", "assistant_error") from exc
        if isinstance(resp.parsed, AIRecsOut):
            return resp.parsed
        try:
            return AIRecsOut.model_validate_json(resp.text or "")
        except ValueError as exc:
            raise AppError(502, "The AI service returned an unreadable answer.", "assistant_error") from exc


def get_recs_llm() -> RecsLLM | None:
    settings = get_settings()
    if not settings.gemini_api_key:
        return None
    return GeminiRecsLLM(settings.gemini_api_key, settings.gemini_model)


# ---------- facts about this field ----------

def _monthly_climate(clim: dict[str, dict], start: date, days: int) -> list[dict]:
    buckets: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    order: list[str] = []
    for i in range(days):
        d = start + timedelta(days=i)
        row = clim.get("02-28" if (d.month, d.day) == (2, 29) else d.strftime("%m-%d"))
        if not row:
            continue
        month = d.strftime("%b")
        if month not in order:
            order.append(month)
        for k in ("tmean_c", "tmax_c", "tmin_c", "precipitation_mm"):
            if row.get(k) is not None:
                buckets[month][k].append(row[k])
    out = []
    for month in order:
        b = buckets[month]
        out.append({
            "month": month,
            "mean_temp_c": round(sum(b["tmean_c"]) / len(b["tmean_c"]), 1) if b["tmean_c"] else None,
            "mean_max_c": round(sum(b["tmax_c"]) / len(b["tmax_c"]), 1) if b["tmax_c"] else None,
            "rain_mm": round(sum(b["precipitation_mm"])) if b["precipitation_mm"] else None,
        })
    return out


def _forecast_summary(bundle: dict) -> dict | None:
    rows = [r for r in bundle.get("daily", []) if r.get("kind") == "forecast"]
    if not rows:
        return None
    rain = [r.get("precipitation_mm") or 0 for r in rows]
    tmax = [r["tmax_c"] for r in rows if r.get("tmax_c") is not None]
    tmin = [r["tmin_c"] for r in rows if r.get("tmin_c") is not None]
    cur = bundle.get("current") or {}
    return {
        "days": len(rows), "from": rows[0]["date"], "to": rows[-1]["date"],
        "total_rain_mm": round(sum(rain), 1), "rainy_days_2_5mm": sum(1 for x in rain if x >= 2.5),
        "mean_max_c": round(sum(tmax) / len(tmax), 1) if tmax else None,
        "mean_min_c": round(sum(tmin) / len(tmin), 1) if tmin else None,
        "now_temp_c": cur.get("temperature_c"), "now_humidity_pct": cur.get("humidity_pct"),
    }


def _terrain(db: Session, land: LandProfile, env: EnvironmentService) -> dict | None:
    if land.terrain:
        return land.terrain
    try:
        ring = current_boundary(land).metrics["geojson"]["coordinates"][0][:-1]
        land.terrain = env.terrain((land.centroid_lat, land.centroid_lon), [(p[1], p[0]) for p in ring])
        db.commit()
        return land.terrain
    except (ProviderError, AppError, KeyError, TypeError) as exc:
        log.info("terrain unavailable for AI recommendations", extra={"error": str(exc)[:200]})
        return None


def build_facts(db: Session, land: LandProfile, ctx: SiteContext, env: EnvironmentService,
                irrigation: str) -> tuple[dict, list[dict], list[str]]:
    """Returns (facts for the model, inputs panel for the UI, data gaps)."""
    gaps: list[str] = []
    inputs: list[dict] = []
    area_ha = round(current_boundary(land).area_m2 / 10000, 2)
    place = ", ".join(p for p in (land.village, land.district, land.state) if p)
    facts: dict[str, Any] = {
        "field": {"name": land.name, "area_ha": area_ha, "lat": round(land.centroid_lat, 4),
                  "lon": round(land.centroid_lon, 4), "village": land.village, "district": land.district,
                  "state": land.state},
        "sowing_date": ctx.sowing_date.isoformat(),
        "irrigation": irrigation,
    }
    inputs.append({"key": "location", "label": "Location",
                   "value": f"{place or 'Unknown place'} · {facts['field']['lat']}, {facts['field']['lon']} · "
                            f"{area_ha} ha", "provenance": None})
    if not land.state:
        gaps.append("District/state not resolved, so the regional planting calendar could not be applied.")

    terrain = _terrain(db, land, env)
    if terrain and terrain.get("elevation_m") is not None:
        facts["terrain"] = {"elevation_m": terrain["elevation_m"], "slope_deg": terrain.get("slope_deg")}
        inputs.append({"key": "terrain", "label": "Elevation", "value": f"{round(terrain['elevation_m'])} m",
                       "provenance": terrain.get("provenance")})
    else:
        gaps.append("Elevation not available.")

    soil_prov = ctx.provenance.get("soil")
    if ctx.texture or ctx.ph is not None:
        soil: dict[str, Any] = {"source": ctx.soil_label, "texture": ctx.texture, "ph": ctx.ph}
        if ctx.soil_source == "soilgrids":
            try:
                profile = env.soil_profile(land.centroid_lat, land.centroid_lon, land.id)
                layers = profile.get("layers", [])
                for key, out_key in (("clay_pct", "clay_pct"), ("sand_pct", "sand_pct"), ("silt_pct", "silt_pct"),
                                     ("soc_g_per_kg", "organic_carbon_g_per_kg"), ("cec_cmol_per_kg", "cec_cmol_per_kg")):
                    soil[out_key] = service.topsoil_average(layers, key)
                soil["drainage_hint"] = profile.get("drainage_hint")
            except AppError:
                pass
        facts["soil"] = soil
        parts = [p for p in (ctx.texture, f"clay {soil.get('clay_pct'):.0f} %" if soil.get("clay_pct") else None,
                             f"pH {ctx.ph}" if ctx.ph is not None else None,
                             f"SOC {soil.get('organic_carbon_g_per_kg')} g/kg" if soil.get("organic_carbon_g_per_kg")
                             else None) if p]
        inputs.append({"key": "soil", "label": "Soil", "value": f"{' · '.join(parts)} ({ctx.soil_label})",
                       "provenance": soil_prov})
        if ctx.soil_source != "soil_test":
            gaps.append("No lab soil test for this field; soil values are 250 m model estimates.")
    else:
        gaps.append("No soil data for this field.")

    if ctx.climate:
        months = _monthly_climate(ctx.climate, ctx.sowing_date, SEASON_DAYS)
        facts["season_climatology"] = {"years": ctx.climate_years, "window_days": SEASON_DAYS, "months": months}
        rain_total = sum(m["rain_mm"] or 0 for m in months)
        temps = [m["mean_temp_c"] for m in months if m["mean_temp_c"] is not None]
        span = f"{months[0]['month']}–{months[-1]['month']}" if months else ""
        facts["season_climatology"]["total_rain_mm"] = round(rain_total)
        inputs.append({"key": "climate", "label": "Typical season",
                       "value": f"{span}: ~{round(rain_total)} mm rain, ~"
                                f"{round(sum(temps) / len(temps), 1) if temps else '?'} °C mean "
                                f"({ctx.climate_years}-yr climatology)",
                       "provenance": ctx.provenance.get("climate")})
    else:
        gaps.append("Climatology unavailable for this location.")

    try:
        bundle = env.weather_bundle(land.centroid_lat, land.centroid_lon, land.id)
        fc = _forecast_summary(bundle)
        if fc:
            facts["forecast_16d"] = fc
            inputs.append({"key": "forecast", "label": "Next 16 days",
                           "value": f"{fc['total_rain_mm']} mm rain on {fc['rainy_days_2_5mm']} days · "
                                    f"{fc['mean_max_c']}/{fc['mean_min_c']} °C",
                           "provenance": bundle.get("provenance")})
    except (AppError, ProviderError):
        gaps.append("Weather forecast unavailable right now.")

    inputs.append({"key": "irrigation", "label": "Irrigation", "value": irrigation, "provenance": None})
    gaps.append("Nearby water sources and canal schedules are not included.")
    return facts, inputs, gaps


def _catalog(crops: list[CropCatalog], own: dict) -> list[dict]:
    out = []
    for c in crops:
        varieties = [*c.varieties, *own.get(c.id, [])]
        out.append({"slug": c.slug, "name": c.name_en,
                    "varieties": [{"name": v.name, "days": v.duration_days, "seasons": v.seasons}
                                  for v in varieties]})
    return out


def _numbers(text: str) -> list[float]:
    return [float(n.replace(",", "")) for n in NUMBER_RE.findall(text)]


def _grounded(sentence: str, allowed: list[float]) -> bool:
    """True when every number in the sentence is close to a number present in the field's facts."""
    for n in _numbers(sentence):
        if n <= 12 and n.is_integer():  # counts, months, splits
            continue
        if not any(abs(n - a) <= max(1.0, 0.03 * abs(a)) for a in allowed):
            return False
    return True


def validate(raw: AIRecsOut, catalog: dict[str, CropCatalog], own: dict, context_text: str) -> tuple[list[dict], int]:
    allowed = _numbers(context_text)
    dropped = 0
    recs: list[dict] = []
    seen: set[str] = set()
    for r in sorted(raw.recommendations, key=lambda x: x.rank):
        crop = catalog.get(r.crop_slug)
        if crop is None or r.crop_slug in seen:
            dropped += 1
            continue
        seen.add(r.crop_slug)
        by_name = {v.name.lower(): v for v in [*crop.varieties, *own.get(crop.id, [])]}
        varieties = []
        for name in r.varieties:
            v = by_name.get(name.strip().lower())
            if v is None:
                dropped += 1
            elif v not in varieties:
                varieties.append(v)
        why = [s for s in r.why if _grounded(s, allowed)]
        risks = [s for s in r.risks if _grounded(s, allowed)]
        water = r.water_plan if _grounded(r.water_plan, allowed) else ""
        dropped += (len(r.why) - len(why)) + (len(r.risks) - len(risks)) + (1 if r.water_plan and not water else 0)
        if not why:
            dropped += 1
            continue
        recs.append({
            "crop": service.crop_out(crop), "rank": len(recs) + 1, "fit": r.fit,
            "varieties": [service.variety_out(v) for v in varieties[:4]], "why": why, "risks": risks,
            "sowing_window": r.sowing_window, "water_plan": water, "confidence": r.confidence,
        })
    return recs, dropped


def ai_recommendations(db: Session, user: User, land: LandProfile, sowing_date: date, irrigation: str,
                       llm: RecsLLM | None, env: EnvironmentService | None = None) -> dict:
    env = env or EnvironmentService(db)
    crops = [c for c in service.list_crops(db) if c.data.get("plannable", True)]
    own = service.own_varieties(db, user, [c.id for c in crops])
    ctx = service.site_context(db, land, sowing_date, irrigation, env)
    facts, inputs, gaps = build_facts(db, land, ctx, env, irrigation)
    language = (user.preferences.language if user.preferences else "en") or "en"
    base = {
        "kind": "ai_generated", "land": {"id": str(land.id), "name": land.name},
        "sowing_date": sowing_date.isoformat(), "irrigation": irrigation, "inputs": inputs,
        "data_gaps": gaps, "recommendations": [], "summary": None, "model": None, "generated_at": None,
        "cached": False, "dropped_claims": 0, "disclaimer": DISCLAIMER,
    }
    missing = [g for g in gaps if g.startswith(("No soil data", "Climatology unavailable"))]
    if missing:
        return {**base, "status": "insufficient_data",
                "reason": "Key data for this field is missing, so AI recommendations were not generated.",
                "missing": missing}
    if llm is None:
        return {**base, "status": "unavailable",
                "reason": "AI recommendations are not configured on this server (no Gemini API key)."}

    shortlist = [{"slug": r["crop_slug"], "score": r["score"], "suitability": r["suitability"],
                  "season": (r["season"] or {}).get("key"), "reasons": r["reasons"][:3], "risks": r["risks"][:3]}
                 for r in recommend([service._scoring_dict(c) for c in crops], ctx, SEASONS)[:SHORTLIST]]
    payload = {"FACTS": facts, "SHORTLIST": shortlist, "CATALOG": _catalog(crops, own),
               "LANGUAGE": "Tamil" if language == "ta" else "English"}
    context_text = json.dumps({"FACTS": facts, "SHORTLIST": shortlist}, ensure_ascii=False, default=str)
    digest = hashlib.sha1(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:16]
    key = f"ai_recs:{CACHE_VERSION}:{land.id}:{sowing_date}:{irrigation}:{language}:{llm.model}:{digest}"
    if cached := cache_get_json(key):
        return {**cached, "cached": True}

    try:
        raw = llm.recommend(json.dumps(payload, ensure_ascii=False, default=str))
    except AppError as exc:
        return {**base, "status": "unavailable", "reason": f"{exc.detail} AI recommendations are unavailable right now."}
    catalog = {c.slug: c for c in crops}
    recs, dropped = validate(raw, catalog, own, context_text)
    if not recs:
        return {**base, "status": "unavailable", "dropped_claims": dropped,
                "reason": "The AI answer did not pass validation against this field's data, so it is not shown."}
    model_gaps = [g for g in raw.data_gaps if g and g not in gaps]
    result = {**base, "status": "ok", "reason": None, "recommendations": recs, "summary": raw.summary
              if _grounded(raw.summary, _numbers(context_text)) else None,
              "data_gaps": gaps + model_gaps[:4], "model": llm.model,
              "generated_at": datetime.now(UTC).isoformat(), "dropped_claims": dropped}
    cache_set_json(key, result, CACHE_TTL_S)
    return result
