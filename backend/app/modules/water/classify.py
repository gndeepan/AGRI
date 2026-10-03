"""Classify OpenStreetMap water features into farmer-facing kinds (pure, no I/O).

Tamil Nadu irrigation tanks are usually mapped as natural=water (sometimes water=reservoir or
landuse=reservoir) with names ending in Eri / Kanmai (Kammai) / Tank; village ponds as Kulam /
Ooruni / Thangal. Names are checked in English, Tamil and transliterated forms.
"""

import re
from typing import Any

KINDS = ("river", "canal", "stream", "drain", "tank", "pond", "lake", "well")

TANK_NAME = re.compile(
    r"(\b(eri|ery|kanmai|kanmoi|kammai|kammoi|kanmaai|tank|anicut|anaicut)\b|ஏரி|கண்மாய்|கம்மாய்)", re.IGNORECASE)
POND_NAME = re.compile(
    r"(kulam|ooruni|oorani|ooranі|urani|thangal|theppakulam|teppakulam|pond|pokhar|குளம்|ஊருணி|தாங்கல்)",
    re.IGNORECASE)

EXCLUDED_WATER = {"wastewater", "swimming_pool", "fountain", "reflecting_pool", "salt_pool"}
EXCLUDED_LEISURE = {"swimming_pool", "water_park"}
UNDERGROUND = {"yes", "culvert", "flooded", "building_passage"}

EXCLUDED_NAME = re.compile(r"(swimming|water\s*park|pool\b|aquarium|fountain|sewage|stp\b)", re.IGNORECASE)

POND_MAX_M2 = 20_000  # < 2 ha: village pond / kulam
LAKE_MIN_M2 = 2_000_000  # > 2 km²: large lake or reservoir


def names(tags: dict[str, str]) -> str:
    return " ".join(tags.get(k, "") for k in ("name", "name:en", "name:ta", "alt_name", "old_name"))


def is_excluded(tags: dict[str, str]) -> bool:
    """Not a usable surface water source: pools, water parks, wastewater, culverted channels."""
    if tags.get("leisure") in EXCLUDED_LEISURE or tags.get("amenity") == "swimming_pool":
        return True
    if tags.get("sport") == "swimming":
        return True
    if tags.get("water") in EXCLUDED_WATER:
        return True
    if EXCLUDED_NAME.search(names(tags)):
        return True
    return "waterway" in tags and tags.get("tunnel") in UNDERGROUND


def is_seasonal(tags: dict[str, str]) -> bool:
    return tags.get("intermittent") == "yes" or tags.get("seasonal") not in (None, "no")


def classify(tags: dict[str, str], area_m2: float | None = None) -> str | None:
    """Return one of KINDS, or None if the feature is not a water source we show."""
    if is_excluded(tags):
        return None
    if tags.get("man_made") == "water_well":
        return "well"
    waterway = tags.get("waterway")
    if waterway == "river":
        return "river"
    if waterway == "canal":
        return "canal"
    if waterway == "stream":
        return "stream"
    if waterway in ("drain", "ditch"):
        return "drain"

    label = names(tags)
    water = tags.get("water")
    if water in ("river", "oxbow"):
        return "river"
    if water in ("canal", "ditch"):
        return "canal"
    if water in ("pond", "fishpond"):
        return "pond"
    if water == "lake":
        return "lake" if area_m2 is None or area_m2 >= POND_MAX_M2 else "pond"
    if TANK_NAME.search(label):
        return "tank"
    if POND_NAME.search(label):
        return "pond"
    if tags.get("natural") == "water" or tags.get("landuse") in ("reservoir", "basin") or water in (
            "reservoir", "basin", "lagoon"):
        if area_m2 is None:
            return "tank"
        if area_m2 < POND_MAX_M2:
            return "pond"
        return "lake" if area_m2 >= LAKE_MIN_M2 else "tank"
    return None


def compass(bearing_deg: float) -> str:
    points = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")
    return points[round((bearing_deg % 360) / 45) % 8]


def has_tamil_name(tags: dict[str, Any]) -> bool:
    return bool(tags.get("name:ta"))
