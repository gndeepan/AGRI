"""Variety lookup for names missing from the catalog: fuzzy match against names and aliases first,
then (only if nothing matches) ask Gemini for an explicitly unverified, AI-generated profile."""

import difflib
import logging
import re
import time
from typing import Literal, Protocol

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.errors import AppError
from app.modules.crops.models import CropCatalog, CropVariety

log = logging.getLogger(__name__)

MATCH_CUTOFF = 0.82
RETRIES = 2  # Gemini returns 503 "high demand" spikes that usually clear within seconds
RETRY_BACKOFF_S = 1.0


def normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def catalog_matches(query: str, varieties: list[CropVariety], limit: int = 5) -> list[tuple[CropVariety, float]]:
    """Ranks varieties by how well `query` matches their name or an alias (1.0 = exact)."""
    q = normalize(query)
    if not q:
        return []
    scored: list[tuple[CropVariety, float]] = []
    for v in varieties:
        best = 0.0
        # "Jyothi (PTB 39)" is also searchable as "Jyothi" and "PTB 39".
        parts = [p for p in re.split(r"[()]", v.name) if p.strip()]
        for label in [v.name, *parts, *((v.data or {}).get("aliases") or [])]:
            n = normalize(label)
            if not n:
                continue
            if n == q:
                score = 1.0
            elif len(q) >= 4 and (n.startswith(q) or q in n):
                score = 0.9
            else:
                score = difflib.SequenceMatcher(None, q, n).ratio()
            best = max(best, score)
        if best >= MATCH_CUTOFF:
            scored.append((v, best))
    scored.sort(key=lambda x: (-x[1], x[0].name))
    return scored[:limit]


class VarietyProfile(BaseModel):
    recognized: bool = Field(description="True only if this is a real, known variety of the crop")
    name: str = Field(description="Canonical variety name")
    aliases: list[str] = Field(default_factory=list)
    duration_days_min: int = Field(description="Typical seed-to-harvest days, lower bound")
    duration_days_max: int = Field(description="Typical seed-to-harvest days, upper bound")
    grain_type: str | None = Field(None, description="e.g. 'medium slender, white' or 'long bold, red'")
    typical_seasons: list[str] = Field(default_factory=list, description="Local season names, e.g. Samba, Kuruvai")
    regions: list[str] = Field(default_factory=list, description="States / regions where it is grown")
    releasing_institute: str | None = None
    notes: str = Field("", description="One or two short sentences for a farmer")
    confidence: Literal["low", "medium", "high"]
    caveats: list[str] = Field(default_factory=list)
    sources_hint: list[str] = Field(default_factory=list,
                                    description="Where a farmer could verify this (institutes, publications)")


SYSTEM = """You help Indian farmers identify crop varieties for a planning app.
Answer only from well-established knowledge. If you do not recognise the variety, set recognized=false,
confidence=low, and give the typical duration range for the crop instead. Never invent release years,
yields or institutes; leave fields empty when unsure. Durations are seed-to-harvest days.
Keep notes short and practical. Always remind that seed suppliers or the local agriculture officer
should confirm the details."""


class VarietyLLM(Protocol):
    model: str

    def profile(self, crop_name: str, variety_name: str, region: str | None) -> VarietyProfile: ...


class GeminiVarietyLLM:
    def __init__(self, api_key: str, model: str):
        from google import genai

        self.client = genai.Client(api_key=api_key)
        self.model = model

    def profile(self, crop_name: str, variety_name: str, region: str | None) -> VarietyProfile:
        from google.genai import errors, types

        prompt = f"Crop: {crop_name}\nVariety asked about: {variety_name}\nFarmer's region: {region or 'India'}"
        config = types.GenerateContentConfig(system_instruction=SYSTEM, temperature=0.1,
                                             response_mime_type="application/json", response_schema=VarietyProfile)
        for attempt in range(RETRIES + 1):
            try:
                resp = self.client.models.generate_content(model=self.model, contents=prompt, config=config)
                break
            except errors.APIError as exc:
                transient = getattr(exc, "code", None) in (429, 500, 503)
                if transient and attempt < RETRIES:
                    time.sleep(RETRY_BACKOFF_S * 2**attempt)
                    continue
                log.error("gemini variety lookup failed", extra={"error": str(exc)[:300]})
                raise AppError(502, "AI lookup failed. Please try again.", "assistant_error") from exc
        if isinstance(resp.parsed, VarietyProfile):
            return resp.parsed
        try:
            return VarietyProfile.model_validate_json(resp.text or "")
        except ValueError as exc:
            raise AppError(502, "AI lookup returned an unreadable answer.", "assistant_error") from exc


def get_variety_llm() -> VarietyLLM:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise AppError(503, "AI help is not configured (GEMINI_API_KEY missing).", "assistant_unavailable")
    return GeminiVarietyLLM(settings.gemini_api_key, settings.gemini_model)


def ai_suggestion(crop: CropCatalog, name: str, region: str | None, llm: VarietyLLM) -> dict:
    p = llm.profile(crop.name_en, name, region)
    lo, hi = sorted((max(30, p.duration_days_min), max(30, p.duration_days_max)))
    caveats = list(p.caveats)
    if not p.recognized:
        caveats.insert(0, "The AI did not recognise this name; the duration is the crop's typical range.")
    return {
        "kind": "ai_generated", "model": llm.model, "matched_catalog_variety_id": None,
        "name": p.name.strip() or name, "aliases": p.aliases, "duration_days_range": [lo, hi],
        "duration_group": duration_group(round((lo + hi) / 2)), "grain_type": p.grain_type,
        "typical_seasons": p.typical_seasons, "regions": p.regions, "institute": p.releasing_institute,
        "notes": p.notes, "confidence": "low" if not p.recognized else p.confidence, "caveats": caveats,
        "sources_hint": p.sources_hint, "recognized": p.recognized,
    }


def duration_group(days: int) -> str:
    return "short" if days <= 115 else "medium" if days <= 135 else "long"
