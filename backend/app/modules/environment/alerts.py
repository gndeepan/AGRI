"""Rule-based alerts from forecast thresholds. These are Bhoomi rules, NOT official IMD warnings.
Thresholds follow IMD's published rainfall intensity categories."""

from datetime import date

HEAVY_RAIN_MM = 64.5        # IMD "heavy rain" lower bound (24 h)
VERY_HEAVY_RAIN_MM = 115.6  # IMD "very heavy rain" lower bound
STRONG_GUST_KMH = 50.0
HIGH_TEMP_C = 40.0
DISCLAIMER = "Rule-based Bhoomi alert from forecast data — not an official IMD warning."


def forecast_alerts(daily: list[dict], today: date, days: int = 7) -> list[dict]:
    alerts: list[dict] = []
    for row in daily:
        d = date.fromisoformat(row["date"])
        if row.get("kind") != "forecast" or d < today or (d - today).days >= days:
            continue
        rain = row.get("precipitation_mm") or 0.0
        gust = row.get("wind_gusts_max_kmh") or 0.0
        tmax = row.get("tmax_c")
        if rain >= VERY_HEAVY_RAIN_MM:
            alerts.append(_alert(d, "warning", "rain", "Very heavy rain forecast",
                                 f"{rain:.0f} mm forecast. Check field drainage and bunds; postpone spraying and fertilizer."))
        elif rain >= HEAVY_RAIN_MM:
            alerts.append(_alert(d, "watch", "rain", "Heavy rain forecast",
                                 f"{rain:.0f} mm forecast. Avoid fertilizer/pesticide application before the rain."))
        if gust >= STRONG_GUST_KMH:
            alerts.append(_alert(d, "watch", "wind", "Strong wind gusts forecast",
                                 f"Gusts up to {gust:.0f} km/h. Tall or mature crops may lodge; avoid spraying."))
        if tmax is not None and tmax >= HIGH_TEMP_C:
            alerts.append(_alert(d, "watch", "heat", "High temperature forecast",
                                 f"Maximum {tmax:.0f} °C. Plan irrigation for early morning or evening."))
    return alerts


def _alert(d: date, severity: str, kind: str, title: str, message: str) -> dict:
    return {
        "id": f"bhoomi-{kind}-{d.isoformat()}",
        "severity": severity,
        "title": title,
        "message": f"{message} {DISCLAIMER}",
        "starts": d.isoformat(),
        "ends": None,
        "source": "bhoomi_rules",
        "kind": "forecast",
    }
