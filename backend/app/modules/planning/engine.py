"""Transparent crop-development model (pure, deterministic).

bhoomi-rice-phenology 0.1 — see docs/ARCHITECTURE.md §5. Stage reference lengths come
from the IRRI rule of thumb (reproductive ≈35 d, ripening ≈30 d; vegetative absorbs
variety differences), converted to thermal time at a 28 °C reference mean; dates come
from accumulating GDD on the supplied daily weather series."""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, timedelta

from app.modules.planning.gdd import RICE_BASE_C, RICE_UPPER_C, daily_gdd, reference_gdd_per_day, tmean_of

RICE_MODEL = ("bhoomi-rice-phenology", "0.1")
FRACTION_MODEL = ("bhoomi-stage-fraction", "0.1")
DEFAULT_NURSERY_DAYS = {"short": 18, "medium": 25, "long": 30}
MAX_SIM_DAYS = 600

# lookup(date) -> (weather row or None)
WeatherLookup = Callable[[date], dict | None]


@dataclass(frozen=True)
class StageDef:
    key: str
    ref_days: float


@dataclass
class StageResult:
    key: str
    order: int
    start: date
    end: date
    start_margin: int
    end_margin: int
    gdd_start: float
    gdd_end: float
    source: str = "model_output"
    observed_on: date | None = None

    def window(self, which: str) -> dict[str, date]:
        d, m = (self.start, self.start_margin) if which == "start" else (self.end, self.end_margin)
        return {"earliest": d - timedelta(days=m), "expected": d, "latest": d + timedelta(days=m)}


@dataclass
class Prediction:
    model_name: str
    model_version: str
    base_temp_c: float
    stages: list[StageResult]
    assumptions: list[str] = field(default_factory=list)
    missing_inputs: list[str] = field(default_factory=list)
    daily_gdd: dict[date, float] = field(default_factory=dict)

    @property
    def start(self) -> date:
        return self.stages[0].start

    @property
    def harvest(self) -> StageResult:
        return self.stages[-1]

    def harvest_window(self) -> dict[str, date]:
        return self.harvest.window("end")


def rice_stage_defs(duration_days: int, transplanted: bool, nursery_days: int) -> list[StageDef]:
    """Stage reference lengths in days. `duration_days` is seed-to-maturity (as varieties are listed)."""
    field_days = duration_days - nursery_days if transplanted else duration_days
    maturity = float(field_days)
    pi_start = maturity - 65  # reproductive (35) + ripening (30)
    est_end = max(5.0, min(15.0, pi_start - 5))
    stages = []
    if transplanted:
        stages.append(StageDef("nursery", float(nursery_days)))
    stages += [
        StageDef("establishment", est_end),
        StageDef("tillering", max(1.0, pi_start - est_end)),
        StageDef("panicle_initiation", 30.0),
        StageDef("flowering", 10.0),
        StageDef("grain_filling", 18.0),
        StageDef("maturity", 7.0),
    ]
    return stages


def fraction_stage_defs(duration_days: int, fractions: list[tuple[str, float]]) -> list[StageDef]:
    return [StageDef(k, duration_days * f) for k, f in fractions if f > 0]


def _margin(clim_share: float, variety_known: bool, extra: int = 0) -> int:
    return round(2 + 5 * clim_share) + (0 if variety_known else 5) + extra


def predict(stage_defs: list[StageDef], start: date, lookup: WeatherLookup, *,
            observed_starts: dict[str, date] | None = None, variety_known: bool = True,
            extra_margin_days: int = 0,
            base_c: float = RICE_BASE_C, upper_c: float = RICE_UPPER_C,
            model: tuple[str, str] = RICE_MODEL) -> Prediction:
    observed_starts = observed_starts or {}
    ref = reference_gdd_per_day(base_c, upper_c)
    gdd_by_day: dict[date, float] = {}
    estimate_days = 0  # days driven by climatology or missing data
    total_days = 0
    cumulative = 0.0
    cursor = start
    results: list[StageResult] = []

    def step(d: date) -> float:
        nonlocal estimate_days, total_days
        row = lookup(d)
        tmean = tmean_of(row)
        total_days += 1
        if tmean is None or (row or {}).get("kind") == "climatology":
            estimate_days += 1
        g = daily_gdd(tmean, base_c, upper_c) if tmean is not None else ref
        gdd_by_day[d] = g
        return g

    for order, sdef in enumerate(stage_defs):
        observed = observed_starts.get(sdef.key)
        if observed is not None:
            # Observation overrides the model: advance (or rewind) to the observed date.
            while cursor < observed:
                cumulative += step(cursor)
                cursor += timedelta(days=1)
            if cursor > observed:
                cumulative = sum(g for d, g in gdd_by_day.items() if d < observed)
                cursor = observed
            if results:
                results[-1].end = max(observed, results[-1].start)
                results[-1].end_margin = 0
        stage_start, gdd_start = cursor, cumulative
        start_margin = 0 if observed else _margin(estimate_days / max(total_days, 1), variety_known, extra_margin_days)
        target = cumulative + sdef.ref_days * ref
        guard = 0
        while cumulative < target and guard < MAX_SIM_DAYS:
            cumulative += step(cursor)
            cursor += timedelta(days=1)
            guard += 1
        results.append(StageResult(
            key=sdef.key, order=order, start=stage_start, end=cursor, start_margin=start_margin,
            end_margin=_margin(estimate_days / max(total_days, 1), variety_known, extra_margin_days),
            gdd_start=round(gdd_start, 1), gdd_end=round(cumulative, 1),
            source="user_entered" if observed else "model_output", observed_on=observed,
        ))

    if model == RICE_MODEL:
        assumptions = [
            "Reproductive phase ≈35 days and ripening ≈30 days at a 28 °C reference mean (IRRI rule of thumb).",
            f"Thermal time: GDD = max(0, min(Tmean, {upper_c:.0f} °C) − {base_c:.0f} °C).",
            "Photoperiod sensitivity is not modelled; long-duration Samba varieties may flower on a fixed calendar window.",
            "Transplanting shock and water/nutrient stress are not modelled.",
        ]
    else:
        assumptions = [
            "Preliminary template: stage lengths are fixed fractions of the crop's typical duration.",
            f"Thermal time with base {base_c:.0f} °C scales stage lengths to temperature.",
        ]
    missing = [] if variety_known else ["Variety not specified — typical crop duration used; uncertainty widened by ±5 days."]
    if estimate_days:
        assumptions.append(
            f"{estimate_days} of {total_days} simulated days use climatology or reference temperatures "
            "(beyond the forecast horizon or missing data)."
        )
    return Prediction(model[0], model[1], base_c, results, assumptions, missing, gdd_by_day)


def stage_on(prediction: Prediction, d: date) -> tuple[StageResult, float]:
    """Stage containing date d (clamped to the cycle) and progress through it (0..1)."""
    stages = prediction.stages
    if d < stages[0].start:
        return stages[0], 0.0
    for s in stages:
        if s.start <= d < s.end:
            span = max((s.end - s.start).days, 1)
            return s, min(1.0, (d - s.start).days / span)
    return stages[-1], 1.0


def cycle_progress(prediction: Prediction, d: date) -> float:
    total = max((prediction.harvest.end - prediction.start).days, 1)
    return min(1.0, max(0.0, (d - prediction.start).days / total))


def gdd_until(prediction: Prediction, d: date) -> float:
    return round(sum(g for day, g in prediction.daily_gdd.items() if day < d), 1)
