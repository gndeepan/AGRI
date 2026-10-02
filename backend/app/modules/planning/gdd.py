"""Growing degree days. GDD = max(0, min(Tmean, T_upper) - T_base)."""

RICE_BASE_C = 10.0
RICE_UPPER_C = 35.0
REFERENCE_TMEAN_C = 28.0


def daily_gdd(tmean_c: float, base_c: float = RICE_BASE_C, upper_c: float = RICE_UPPER_C) -> float:
    return max(0.0, min(tmean_c, upper_c) - base_c)


def reference_gdd_per_day(base_c: float = RICE_BASE_C, upper_c: float = RICE_UPPER_C) -> float:
    return daily_gdd(REFERENCE_TMEAN_C, base_c, upper_c)


def tmean_of(row: dict | None) -> float | None:
    if not row:
        return None
    if row.get("tmean_c") is not None:
        return float(row["tmean_c"])
    if row.get("tmin_c") is not None and row.get("tmax_c") is not None:
        return (float(row["tmin_c"]) + float(row["tmax_c"])) / 2
    return None
