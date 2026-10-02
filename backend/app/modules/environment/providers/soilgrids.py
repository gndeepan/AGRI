"""ISRIC SoilGrids v2.0 adapter. Values are 250 m modelled estimates (CC BY 4.0), not lab tests."""

from datetime import UTC, datetime
from typing import Any

from app.core.config import get_settings
from app.core.http import ProviderError, ResilientClient
from app.modules.environment.providers.base import ProviderResult

PROPERTIES = ["sand", "silt", "clay", "phh2o", "soc", "cec", "bdod"]
DEPTHS = ["0-5cm", "5-15cm", "15-30cm"]
DEPTH_WEIGHTS = {"0-5cm": 5, "5-15cm": 10, "15-30cm": 15}
FIELD_MAP = {
    "sand": "sand_pct", "silt": "silt_pct", "clay": "clay_pct", "phh2o": "ph",
    "soc": "soc_g_per_kg", "cec": "cec_cmol_per_kg", "bdod": "bulk_density",
}


def usda_texture_class(sand: float, silt: float, clay: float) -> str:
    total = sand + silt + clay
    if total <= 0:
        raise ValueError("sand+silt+clay must be positive")
    sand, silt, clay = (100 * v / total for v in (sand, silt, clay))
    if silt + 1.5 * clay < 15:
        return "sand"
    if silt + 2 * clay < 30:
        return "loamy sand"
    if (7 <= clay < 20 and sand > 52) or (clay < 7 and silt < 50):
        return "sandy loam"
    if 7 <= clay < 27 and 28 <= silt < 50 and sand <= 52:
        return "loam"
    if (silt >= 50 and 12 <= clay < 27) or (50 <= silt < 80 and clay < 12):
        return "silt loam"
    if silt >= 80 and clay < 12:
        return "silt"
    if 20 <= clay < 35 and silt < 28 and sand > 45:
        return "sandy clay loam"
    if 27 <= clay < 40 and 20 < sand <= 45:
        return "clay loam"
    if 27 <= clay < 40 and sand <= 20:
        return "silty clay loam"
    if clay >= 35 and sand > 45:
        return "sandy clay"
    if clay >= 40 and silt >= 40:
        return "silty clay"
    return "clay"


def drainage_hint(texture: str | None) -> str | None:
    if texture is None:
        return None
    if texture in {"clay", "silty clay", "sandy clay"}:
        return "Heavy texture: likely slow internal drainage; suits puddled paddy, risk of waterlogging for upland crops."
    if texture in {"sand", "loamy sand"}:
        return "Light texture: likely rapid drainage and low water-holding capacity."
    return "Medium texture: drainage likely moderate."


def irrigation_suitability(texture: str | None) -> str | None:
    if texture is None:
        return None
    if texture in {"sand", "loamy sand", "sandy loam"}:
        return "Frequent, light irrigations (drip/sprinkler) suit this texture; flooding loses water to percolation."
    if texture in {"clay", "silty clay", "clay loam", "silty clay loam", "sandy clay"}:
        return "Retains water well; suits flood/AWD for paddy. Avoid over-irrigating upland crops."
    return "Suitable for furrow, drip or AWD depending on crop."


def normalize(payload: dict[str, Any]) -> dict[str, Any]:
    layers: dict[str, dict[str, float | None]] = {d: {"depth": d} for d in DEPTHS}  # type: ignore[misc]
    for layer in payload.get("properties", {}).get("layers", []):
        field = FIELD_MAP.get(layer.get("name"))
        if not field:
            continue
        d_factor = (layer.get("unit_measure") or {}).get("d_factor") or 1
        for depth in layer.get("depths", []):
            label = depth.get("label")
            if label not in layers:
                continue
            mean = (depth.get("values") or {}).get("mean")
            layers[label][field] = round(mean / d_factor, 2) if mean is not None else None
    ordered = [layers[d] for d in DEPTHS]
    for row in ordered:
        for f in FIELD_MAP.values():
            row.setdefault(f, None)

    limitations: list[str] = [
        "SoilGrids values are 250 m gridded model estimates, not measurements from this field.",
        "Use a Soil Health Card or lab test for fertilizer decisions.",
    ]
    texture = None
    usable = [r for r in ordered if None not in (r["sand_pct"], r["silt_pct"], r["clay_pct"])]
    if usable:
        weight = sum(DEPTH_WEIGHTS[r["depth"]] for r in usable)

        def wavg(k: str) -> float:
            return sum(r[k] * DEPTH_WEIGHTS[r["depth"]] for r in usable) / weight

        texture = usda_texture_class(wavg("sand_pct"), wavg("silt_pct"), wavg("clay_pct"))
    else:
        limitations.append("No soil estimate at this point (often water bodies, urban or rocky areas).")
    return {
        "texture_class": texture,
        "layers": ordered,
        "drainage_hint": drainage_hint(texture),
        "irrigation_suitability": irrigation_suitability(texture),
        "limitations": limitations,
    }


class SoilGridsProvider:
    name = "soilgrids"

    def __init__(self, client: ResilientClient | None = None):
        self.settings = get_settings()
        # SoilGrids is a fair-use beta service: fewer retries, longer timeout.
        self.client = client or ResilientClient(self.name, retries=2, backoff_base_s=2.0, timeout_s=30)

    def profile(self, lat: float, lon: float) -> ProviderResult:
        params: list[tuple[str, Any]] = [("lon", lon), ("lat", lat), ("value", "mean")]
        params += [("property", p) for p in PROPERTIES] + [("depth", d) for d in DEPTHS]
        payload = self.client.get_json(self.settings.soilgrids_url, params)
        if "properties" not in payload:
            raise ProviderError(self.name, "unexpected SoilGrids payload")
        return ProviderResult(
            normalized=normalize(payload), raw=payload, provider=self.name, dataset="ISRIC SoilGrids v2.0",
            retrieved_at=datetime.now(UTC), resolution="250 m", license="CC BY 4.0",
            attribution="ISRIC — World Soil Information, SoilGrids 2.0",
        )
