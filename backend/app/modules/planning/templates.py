"""Plan task templates. Reminders deliberately carry no fertilizer or pesticide doses:
farmers are pointed to soil-test-based and official recommendations instead."""

from datetime import date, timedelta

from app.modules.planning.engine import Prediction

SOIL_TEST_NOTE = ("Use the dose from your Soil Health Card / soil-test-based recommendation or your local "
                  "Agricultural Officer; Bhoomi does not prescribe doses.")
PEST_NOTE = ("Record what you see. Act only on economic-threshold advice from the Agricultural Officer/KVK and "
             "follow label instructions for any product.")


def _task(key: str, title: str, category: str, due: date, desc: str = "", window_days: int | None = None,
          weather_sensitive: bool = False) -> dict:
    return {
        "template_key": key, "title": title, "description": desc, "category": category, "due_date": due,
        "window_end": due + timedelta(days=window_days) if window_days else None,
        "weather_sensitive": weather_sensitive, "source": "plan_template",
    }


def rice_tasks(pred: Prediction, anchor: date, method: str, water_availability: str) -> list[dict]:
    st = {s.key: s for s in pred.stages}
    est, till, pi, fl, mat = (st[k] for k in ("establishment", "tillering", "panicle_initiation", "flowering", "maturity"))
    harvest = pred.harvest.end
    transplanted = method == "transplanting"
    tasks = []
    if "nursery" in st:
        tasks.append(_task("nursery_sow", "Prepare nursery and sow seed", "field_prep", st["nursery"].start,
                           "Prepare a raised, well-levelled nursery bed close to a water source.",
                           weather_sensitive=True))
    tasks.append(_task("field_prep", "Prepare main field (ploughing, puddling, levelling)", "field_prep",
                       anchor - timedelta(days=7), "Level the field well so water spreads evenly.", 6))
    tasks.append(_task("basal_nutrients", "Basal nutrient application", "nutrient", anchor - timedelta(days=1),
                       SOIL_TEST_NOTE, weather_sensitive=True))
    tasks.append(_task("establish", "Transplant seedlings" if transplanted else "Sow seed (direct seeding)",
                       "field_prep", anchor, "Avoid days with heavy rain forecast.", weather_sensitive=True))
    tasks.append(_task("water_shallow", "Maintain shallow water (2–5 cm) during establishment", "irrigation",
                       est.start + timedelta(days=3), "Keep the field moist; avoid deep flooding of young plants.",
                       max((est.end - est.start).days - 3, 1)))
    if water_availability != "assured":
        tasks.append(_task("awd", "Consider alternate wetting and drying (AWD)", "irrigation", till.start,
                           "Re-flood when field water drops about 15 cm below the soil surface (check with a "
                           "field water tube). Do not use AWD from panicle initiation to flowering.",
                           max((pi.start - till.start).days, 1)))
    tasks.append(_task("weed_1", "First weed scouting and management", "weed", anchor + timedelta(days=15),
                       "Weeds compete most during the first 30–40 days.", 10))
    tasks.append(_task("weed_2", "Second weed scouting", "weed", anchor + timedelta(days=35), "", 10))
    tasks.append(_task("topdress_tillering", "Top-dressing at active tillering", "nutrient",
                       till.start + timedelta(days=7), SOIL_TEST_NOTE, 5, weather_sensitive=True))
    tasks.append(_task("scout_stem_borer", "Scout for stem borer (dead hearts) and leaf folder", "pest_scouting",
                       till.start + timedelta(days=5), PEST_NOTE, 7))
    tasks.append(_task("scout_disease", "Check for blast and sheath blight symptoms", "pest_scouting",
                       till.start + (till.end - till.start) / 2, PEST_NOTE, 7))
    tasks.append(_task("topdress_pi", "Top-dressing at panicle initiation", "nutrient", pi.start, SOIL_TEST_NOTE, 5,
                       weather_sensitive=True))
    tasks.append(_task("water_critical", "Keep standing water from panicle initiation to flowering", "irrigation",
                       pi.start, "Water stress now reduces grain number — the most sensitive period.",
                       (fl.end - pi.start).days))
    tasks.append(_task("scout_bph", "Scout for brown planthopper at the base of hills", "pest_scouting",
                       pi.start + timedelta(days=10), PEST_NOTE, 10))
    tasks.append(_task("scout_flowering", "Observe flowering and record any pest/disease", "observation", fl.start,
                       "Recording the actual flowering date improves the harvest prediction.", 7))
    tasks.append(_task("drain", "Drain the field before harvest", "irrigation", harvest - timedelta(days=12),
                       "Stop irrigation about 10–15 days before harvest for uniform ripening.", 4))
    tasks.append(_task("harvest", "Harvest when ~80% of grains turn straw-coloured", "harvest", mat.start,
                       "Check grain moisture and the weather forecast before harvesting.",
                       (harvest - mat.start).days + 5, weather_sensitive=True))
    return tasks


def generic_tasks(pred: Prediction, anchor: date, water_availability: str) -> list[dict]:
    st = {s.key: s for s in pred.stages}
    tasks = [
        _task("field_prep", "Prepare the field", "field_prep", anchor - timedelta(days=7), "", 6),
        _task("basal_nutrients", "Basal nutrient application", "nutrient", anchor - timedelta(days=1),
              SOIL_TEST_NOTE, weather_sensitive=True),
        _task("establish", "Sow seed", "field_prep", anchor, "Sow into adequate soil moisture.",
              weather_sensitive=True),
        _task("weed_1", "Weed scouting and management", "weed", anchor + timedelta(days=20), "", 10),
    ]
    if "flowering" in st:
        tasks.append(_task("scout_flowering", "Scout for pests and diseases at flowering", "pest_scouting",
                           st["flowering"].start, PEST_NOTE, 7))
        if water_availability != "rainfed":
            tasks.append(_task("water_critical", "Avoid water stress during flowering", "irrigation",
                               st["flowering"].start, "Flowering and early yield formation are moisture-sensitive.",
                               (st["flowering"].end - st["flowering"].start).days))
    tasks.append(_task("harvest", "Harvest at maturity", "harvest", st["maturity"].start, "",
                       (pred.harvest.end - st["maturity"].start).days + 5, weather_sensitive=True))
    return tasks
