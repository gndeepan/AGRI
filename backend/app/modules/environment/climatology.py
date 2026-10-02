"""Day-of-year climatology from a multi-year daily series. Used only beyond the forecast
horizon and always labelled `climatology`."""

from collections import defaultdict
from datetime import date, timedelta
from statistics import fmean

CLIM_FIELDS = [
    "tmin_c", "tmax_c", "tmean_c", "precipitation_mm", "wind_speed_max_kmh", "wind_gusts_max_kmh",
    "humidity_mean_pct", "cloud_cover_mean_pct", "et0_mm",
]


def doy_key(d: date) -> str:
    return "02-28" if (d.month, d.day) == (2, 29) else d.strftime("%m-%d")


def build_climatology(rows: list[dict]) -> dict[str, dict[str, float | None]]:
    buckets: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for row in rows:
        key = doy_key(date.fromisoformat(row["date"]))
        for f in CLIM_FIELDS:
            v = row.get(f)
            if v is not None:
                buckets[key][f].append(float(v))
    clim: dict[str, dict[str, float | None]] = {}
    for key, fields in buckets.items():
        clim[key] = {f: (round(fmean(fields[f]), 2) if fields.get(f) else None) for f in CLIM_FIELDS}
        clim[key]["years"] = float(len(fields.get("tmax_c", [])))
    return clim


def climatology_day(clim: dict[str, dict], d: date) -> dict | None:
    stats = clim.get(doy_key(d))
    if stats is None:
        return None
    row = {f: stats.get(f) for f in CLIM_FIELDS}
    row.update({
        "date": d.isoformat(), "precipitation_probability_pct": None, "precipitation_hours": None,
        "wind_direction_dominant_deg": None,
        "sunrise": None, "sunset": None, "weather_code": None, "kind": "climatology",
    })
    return row


def climatology_period(today: date, years: int) -> tuple[date, date]:
    """Whole years ending ~a week ago (archive lag)."""
    end = today - timedelta(days=7)
    return date(end.year - years, end.month, min(end.day, 28)), end
