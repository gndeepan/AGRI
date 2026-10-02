"""Curated crop catalog (seed v2). Ranges are general agronomic ranges compiled for planning
support, NOT field-validated thresholds. Every crop cites where to verify.
Only paddy has a variety-aware stage model; other crops use a preliminary stage-fraction template."""

from app.seed.rice_varieties import RICE_VARIETIES, TN_CPG_RICE

TNAU_RICE = {
    "title": "Rice — Crop Production Techniques (varieties, seasons)",
    "publisher": "TNAU Agritech Portal",
    "url": "https://agritech.tnau.ac.in/agriculture/agri_cereals_rice.html",
}
TNAU_SEASONS = TN_CPG_RICE
IRRI_GROWTH = {
    "title": "How to manage rice growth stages",
    "publisher": "IRRI Rice Knowledge Bank",
    "url": "http://www.knowledgebank.irri.org/step-by-step-production/growth",
}
TNAU_AGRI = {
    "title": "Crop Production Guide — Agriculture",
    "publisher": "TNAU Agritech Portal",
    "url": "https://agritech.tnau.ac.in/agriculture/agri_index.html",
}
TNAU_SUGARCANE = {
    "title": "Sugarcane — Crop Production Techniques",
    "publisher": "TNAU Agritech Portal",
    "url": "https://agritech.tnau.ac.in/agriculture/sugarcrops_sugarcane.html",
}

SEASONS = {
    "kuruvai": {"key": "kuruvai", "name": {"en": "Kuruvai", "ta": "குறுவை"},
                "sowing_window": {"start": "06-01", "end": "07-31"}},
    "samba": {"key": "samba", "name": {"en": "Samba", "ta": "சம்பா"},
              "sowing_window": {"start": "08-01", "end": "09-30"}},
    "thaladi": {"key": "thaladi", "name": {"en": "Thaladi", "ta": "தாளடி"},
                "sowing_window": {"start": "09-15", "end": "10-31"}},
    "navarai": {"key": "navarai", "name": {"en": "Navarai", "ta": "நவரை"},
                "sowing_window": {"start": "12-01", "end": "01-31"}},
    "kharif": {"key": "kharif", "name": {"en": "Kharif", "ta": "காரீப்"},
               "sowing_window": {"start": "06-01", "end": "08-15"}},
    "rabi": {"key": "rabi", "name": {"en": "Rabi", "ta": "ராபி"},
             "sowing_window": {"start": "09-15", "end": "11-30"}},
    "summer": {"key": "summer", "name": {"en": "Summer", "ta": "கோடை"},
               "sowing_window": {"start": "01-15", "end": "03-31"}},
}

RICE_STAGE_NAMES = {
    "nursery": ("Nursery", "நாற்றங்கால்"),
    "establishment": ("Establishment", "நடவு / முளைப்பு நிலை"),
    "tillering": ("Tillering", "தூர் கட்டும் பருவம்"),
    "panicle_initiation": ("Panicle initiation & booting", "கதிர் உருவாகும் பருவம்"),
    "flowering": ("Heading & flowering", "பூக்கும் பருவம்"),
    "grain_filling": ("Grain filling", "மணி பிடிக்கும் பருவம்"),
    "maturity": ("Maturity", "முதிர்ச்சி பருவம்"),
}

GENERIC_STAGE_NAMES = {
    "establishment": ("Establishment", "முளைப்பு நிலை"),
    "vegetative": ("Vegetative growth", "வளர்ச்சி பருவம்"),
    "flowering": ("Flowering", "பூக்கும் பருவம்"),
    "yield_formation": ("Yield formation", "காய் / மணி உருவாகும் பருவம்"),
    "maturity": ("Maturity", "முதிர்ச்சி பருவம்"),
}
# Fractions of total duration (preliminary template).
GENERIC_FRACTIONS = [
    ("establishment", 0.10), ("vegetative", 0.30), ("flowering", 0.15),
    ("yield_formation", 0.35), ("maturity", 0.10),
]
SUGARCANE_FRACTIONS = [
    ("establishment", 0.12), ("vegetative", 0.25), ("flowering", 0.0), ("yield_formation", 0.50),
    ("maturity", 0.13),
]
SUGARCANE_NAMES = {
    "establishment": ("Germination", "முளைப்பு"),
    "vegetative": ("Tillering", "தூர் கட்டுதல்"),
    "flowering": ("Flowering (rare, not modelled)", "பூத்தல்"),
    "yield_formation": ("Grand growth", "பெருவளர்ச்சி"),
    "maturity": ("Ripening", "முதிர்ச்சி"),
}

CROPS = [
    {
        "slug": "paddy", "name_en": "Paddy (Rice)", "name_ta": "நெல்", "scientific_name": "Oryza sativa",
        "category": "cereal", "image_url": "/images/crops/paddy.jpg", "confidence": "data_backed",
        "model_key": "rice_phenology",
        "data": {
            "seasons": ["kuruvai", "samba", "thaladi", "navarai"],
            "duration_days": [95, 160], "water_requirement_mm": [1000, 1800],
            "temp_optimal_c": [20, 35], "ph_range": [5.0, 8.0],
            "suitable_textures": ["clay", "silty clay", "clay loam", "silty clay loam", "sandy clay", "loam",
                                  "silt loam"],
            "methods": ["transplanting", "direct_seeding_wet", "direct_seeding_dry"],
            "water_need": "high",
            "description": {
                "en": "Tamil Nadu's principal food crop, grown in Kuruvai, Samba, Thaladi and Navarai seasons. "
                      "Needs assured irrigation or reliable monsoon rains and soils that hold standing water.",
                "ta": "தமிழ்நாட்டின் முதன்மை உணவுப் பயிர். குறுவை, சம்பா, தாளடி, நவரை பருவங்களில் "
                      "பயிரிடப்படுகிறது. உறுதியான பாசனம் அல்லது நம்பகமான பருவமழை தேவை.",
            },
            "references": [TNAU_RICE, TNAU_SEASONS, IRRI_GROWTH],
        },
        "stages": [(k, *v) for k, v in RICE_STAGE_NAMES.items()],
        "varieties": RICE_VARIETIES,
        "rules": [
            {"season_key": s, "region": "IN-TN", "notes": "TNAU season window; check district advisory."}
            for s in ["kuruvai", "samba", "thaladi", "navarai"]
        ],
    },
    {
        "slug": "groundnut", "name_en": "Groundnut", "name_ta": "நிலக்கடலை", "scientific_name": "Arachis hypogaea",
        "category": "oilseed", "image_url": "/images/crops/groundnut.jpg", "confidence": "preliminary",
        "model_key": "stage_fraction",
        "data": {
            "seasons": ["kharif", "rabi", "summer"], "duration_days": [100, 130],
            "water_requirement_mm": [450, 700], "temp_optimal_c": [24, 32], "ph_range": [6.0, 7.5],
            "suitable_textures": ["sandy loam", "loamy sand", "loam", "sandy clay loam"],
            "methods": ["sowing"], "water_need": "medium",
            "description": {"en": "Oilseed suited to light, well-drained red and sandy loam soils.",
                            "ta": "இலேசான, நன்கு வடிகால் உள்ள செம்மண் மற்றும் மணல் கலந்த மண்ணுக்கு ஏற்ற எண்ணெய் வித்துப் பயிர்."},
            "references": [TNAU_AGRI],
        },
        "stages": [(k, *v) for k, v in GENERIC_STAGE_NAMES.items()], "fractions": GENERIC_FRACTIONS,
        "varieties": [], "rules": [{"season_key": s, "region": "IN-TN"} for s in ["kharif", "rabi", "summer"]],
    },
    {
        "slug": "black-gram", "name_en": "Black gram (Urad)", "name_ta": "உளுந்து", "scientific_name": "Vigna mungo",
        "category": "pulse", "image_url": "/images/crops/black-gram.jpg", "confidence": "preliminary",
        "model_key": "stage_fraction",
        "data": {
            "seasons": ["kharif", "rabi", "summer"], "duration_days": [65, 90],
            "water_requirement_mm": [300, 450], "temp_optimal_c": [25, 35], "ph_range": [6.0, 7.8],
            "suitable_textures": ["loam", "clay loam", "sandy loam", "silt loam", "clay"],
            "methods": ["sowing"], "water_need": "low",
            "description": {"en": "Short pulse crop; widely grown in rice fallows of the Cauvery delta on residual moisture.",
                            "ta": "குறுகிய கால பயறு வகைப் பயிர்; காவிரி டெல்டாவில் நெல் தரிசில் எஞ்சிய ஈரப்பதத்தில் பயிரிடப்படுகிறது."},
            "references": [TNAU_AGRI],
        },
        "stages": [(k, *v) for k, v in GENERIC_STAGE_NAMES.items()], "fractions": GENERIC_FRACTIONS,
        "varieties": [], "rules": [{"season_key": s, "region": "IN-TN"} for s in ["kharif", "rabi", "summer"]],
    },
    {
        "slug": "green-gram", "name_en": "Green gram (Moong)", "name_ta": "பாசிப்பயறு", "scientific_name": "Vigna radiata",
        "category": "pulse", "image_url": "/images/crops/green-gram.jpg", "confidence": "preliminary",
        "model_key": "stage_fraction",
        "data": {
            "seasons": ["kharif", "rabi", "summer"], "duration_days": [60, 75],
            "water_requirement_mm": [300, 400], "temp_optimal_c": [25, 35], "ph_range": [6.2, 7.5],
            "suitable_textures": ["loam", "sandy loam", "clay loam", "silt loam"],
            "methods": ["sowing"], "water_need": "low",
            "description": {"en": "Short-duration pulse; sensitive to waterlogging.",
                            "ta": "குறுகிய கால பயறு வகை; நீர் தேக்கத்தைத் தாங்காது."},
            "references": [TNAU_AGRI],
        },
        "stages": [(k, *v) for k, v in GENERIC_STAGE_NAMES.items()], "fractions": GENERIC_FRACTIONS,
        "varieties": [], "rules": [{"season_key": s, "region": "IN-TN"} for s in ["kharif", "rabi", "summer"]],
    },
    {
        "slug": "maize", "name_en": "Maize", "name_ta": "மக்காச்சோளம்", "scientific_name": "Zea mays",
        "category": "cereal", "image_url": "/images/crops/maize.jpg", "confidence": "preliminary",
        "model_key": "stage_fraction",
        "data": {
            "seasons": ["kharif", "rabi", "summer"], "duration_days": [95, 120],
            "water_requirement_mm": [500, 800], "temp_optimal_c": [21, 32], "ph_range": [5.5, 7.5],
            "suitable_textures": ["loam", "sandy loam", "clay loam", "silt loam", "sandy clay loam"],
            "methods": ["sowing"], "water_need": "medium",
            "description": {"en": "Grain and fodder cereal for well-drained soils; sensitive to waterlogging.",
                            "ta": "நன்கு வடிகால் உள்ள மண்ணுக்கு ஏற்ற தானியம் மற்றும் தீவனப் பயிர்."},
            "references": [TNAU_AGRI],
        },
        "stages": [(k, *v) for k, v in GENERIC_STAGE_NAMES.items()], "fractions": GENERIC_FRACTIONS,
        "varieties": [], "rules": [{"season_key": s, "region": "IN-TN"} for s in ["kharif", "rabi", "summer"]],
    },
    {
        "slug": "cotton", "name_en": "Cotton", "name_ta": "பருத்தி", "scientific_name": "Gossypium hirsutum",
        "category": "fibre", "image_url": "/images/crops/cotton.jpg", "confidence": "preliminary",
        "model_key": "stage_fraction",
        "data": {
            "seasons": ["kharif", "summer"], "duration_days": [150, 180],
            "water_requirement_mm": [700, 1200], "temp_optimal_c": [21, 32], "ph_range": [6.0, 8.0],
            "suitable_textures": ["clay", "clay loam", "loam", "silty clay"],
            "methods": ["sowing"], "water_need": "medium",
            "description": {"en": "Fibre crop, traditionally on black cotton soils with good moisture retention.",
                            "ta": "நார்ப் பயிர்; ஈரப்பதம் தக்கவைக்கும் கரிசல் மண்ணில் பாரம்பரியமாக பயிரிடப்படுகிறது."},
            "references": [TNAU_AGRI],
        },
        "stages": [(k, *v) for k, v in GENERIC_STAGE_NAMES.items()], "fractions": GENERIC_FRACTIONS,
        "varieties": [], "rules": [{"season_key": s, "region": "IN-TN"} for s in ["kharif", "summer"]],
    },
    {
        "slug": "sugarcane", "name_en": "Sugarcane", "name_ta": "கரும்பு", "scientific_name": "Saccharum officinarum",
        "category": "cash", "image_url": "/images/crops/sugarcane.jpg", "confidence": "preliminary",
        "model_key": "stage_fraction",
        "data": {
            "seasons": ["summer"], "duration_days": [300, 420],
            "water_requirement_mm": [1500, 2500], "temp_optimal_c": [20, 35], "ph_range": [6.0, 8.0],
            "suitable_textures": ["loam", "clay loam", "silty clay loam", "sandy clay loam"],
            "methods": ["sowing"], "water_need": "high",
            "description": {"en": "Long-duration cash crop needing assured irrigation; planted Dec–May in Tamil Nadu.",
                            "ta": "உறுதியான பாசனம் தேவைப்படும் நீண்டகால பணப் பயிர்."},
            "references": [TNAU_SUGARCANE],
        },
        "stages": [(k, *v) for k, v in SUGARCANE_NAMES.items()], "fractions": SUGARCANE_FRACTIONS,
        "varieties": [], "rules": [{"season_key": "summer", "region": "IN-TN", "sowing_start": "12-01",
                                    "sowing_end": "05-31"}],
    },
    {
        "slug": "finger-millet", "name_en": "Finger millet (Ragi)", "name_ta": "கேழ்வரகு", "scientific_name": "Eleusine coracana",
        "category": "millet", "image_url": "/images/crops/finger-millet.jpg", "confidence": "preliminary",
        "model_key": "stage_fraction",
        "data": {
            "seasons": ["kharif", "rabi"], "duration_days": [90, 120],
            "water_requirement_mm": [350, 500], "temp_optimal_c": [20, 32], "ph_range": [5.0, 8.2],
            "suitable_textures": ["sandy loam", "loam", "loamy sand", "sandy clay loam", "clay loam"],
            "methods": ["sowing", "transplanting"], "water_need": "low",
            "description": {"en": "Hardy, drought-tolerant millet for red and lateritic soils.",
                            "ta": "வறட்சியைத் தாங்கும் சிறுதானியம்; செம்மண்ணுக்கு ஏற்றது."},
            "references": [TNAU_AGRI],
        },
        "stages": [(k, *v) for k, v in GENERIC_STAGE_NAMES.items()], "fractions": GENERIC_FRACTIONS,
        "varieties": [], "rules": [{"season_key": s, "region": "IN-TN"} for s in ["kharif", "rabi"]],
    },
]

TN_CPG_AGRI = {
    "title": "Crop Production Guide — Agriculture (field crops)",
    "publisher": "Department of Agriculture, Tamil Nadu & TNAU",
    "url": "https://agritech.tnau.ac.in/pdf/AGRICULTURE.pdf",
}
TN_CPG_HORTI = {
    "title": "Crop Production Guide — Horticulture",
    "publisher": "Department of Horticulture, Tamil Nadu & TNAU",
    "url": "https://agritech.tnau.ac.in/pdf/HORTICULTURE.pdf",
}
FIELD_SEASONS = ["kharif", "rabi", "summer"]


def _crop(slug: str, en: str, ta: str, sci: str, category: str, *, seasons: list[str], duration: list[int],
          water: list[int], temp: list[int], ph: list[float], textures: list[str], methods: list[str],
          water_need: str, desc_en: str, desc_ta: str, ref: dict, plannable: bool = True,
          fractions: list | None = None) -> dict:
    """Preliminary crop entry: general agronomic ranges for planning, to be checked against the cited guide."""
    data = {
        "seasons": seasons, "duration_days": duration, "water_requirement_mm": water, "temp_optimal_c": temp,
        "ph_range": ph, "suitable_textures": textures, "methods": methods, "water_need": water_need,
        "description": {"en": desc_en, "ta": desc_ta}, "references": [ref], "plannable": plannable,
    }
    return {
        "slug": slug, "name_en": en, "name_ta": ta, "scientific_name": sci, "category": category,
        "image_url": f"/images/crops/{slug}.jpg", "confidence": "preliminary", "model_key": "stage_fraction",
        "data": data, "stages": [(k, *v) for k, v in GENERIC_STAGE_NAMES.items()],
        "fractions": fractions or GENERIC_FRACTIONS, "varieties": [],
        "rules": [{"season_key": k, "region": "IN-TN"} for k in seasons] if plannable else [],
    }


LIGHT = ["sandy loam", "loamy sand", "loam", "sandy clay loam"]
MEDIUM_SOILS = ["loam", "clay loam", "sandy loam", "silt loam", "sandy clay loam"]
HEAVY = ["clay", "clay loam", "silty clay", "loam"]

CROPS += [
    _crop("sorghum", "Sorghum (Cholam)", "சோளம்", "Sorghum bicolor", "millet", seasons=FIELD_SEASONS,
          duration=[95, 110], water=[400, 600], temp=[26, 33], ph=[6.0, 8.5], textures=HEAVY + ["sandy loam"],
          methods=["sowing"], water_need="low", ref=TN_CPG_AGRI,
          desc_en="Grain and fodder millet for rainfed black and red soils; Adi and Purattasi pattam.",
          desc_ta="மானாவாரி கரிசல் மற்றும் செம்மண்ணுக்கு ஏற்ற தானியம் மற்றும் தீவனப் பயிர்."),
    _crop("pearl-millet", "Pearl millet (Cumbu)", "கம்பு", "Pennisetum glaucum", "millet", seasons=FIELD_SEASONS,
          duration=[75, 90], water=[300, 450], temp=[25, 35], ph=[6.0, 8.0], textures=LIGHT, methods=["sowing"],
          water_need="low", ref=TN_CPG_AGRI,
          desc_en="Hardy, drought-tolerant millet for light soils and low rainfall.",
          desc_ta="குறைந்த மழை மற்றும் இலேசான மண்ணுக்கு ஏற்ற வறட்சியைத் தாங்கும் சிறுதானியம்."),
    _crop("foxtail-millet", "Foxtail millet (Thinai)", "தினை", "Setaria italica", "millet", seasons=["kharif", "rabi"],
          duration=[75, 90], water=[250, 400], temp=[20, 32], ph=[5.5, 8.0], textures=LIGHT, methods=["sowing"],
          water_need="low", ref=TN_CPG_AGRI,
          desc_en="Short-duration small millet for rainfed uplands.",
          desc_ta="மானாவாரி மேட்டு நிலங்களுக்கு ஏற்ற குறுகிய கால சிறுதானியம்."),
    _crop("little-millet", "Little millet (Samai)", "சாமை", "Panicum sumatrense", "millet", seasons=["kharif", "rabi"],
          duration=[75, 90], water=[250, 400], temp=[20, 32], ph=[5.5, 8.0], textures=LIGHT, methods=["sowing"],
          water_need="low", ref=TN_CPG_AGRI,
          desc_en="Small millet tolerant of poor soils and drought; common in hill and tribal areas.",
          desc_ta="வறட்சி மற்றும் வளம் குறைந்த மண்ணைத் தாங்கும் சிறுதானியம்."),
    _crop("kodo-millet", "Kodo millet (Varagu)", "வரகு", "Paspalum scrobiculatum", "millet", seasons=["kharif", "rabi"],
          duration=[105, 120], water=[300, 450], temp=[20, 32], ph=[5.5, 8.0], textures=LIGHT + ["clay loam"],
          methods=["sowing"], water_need="low", ref=TN_CPG_AGRI,
          desc_en="Long-duration small millet for rainfed red soils.",
          desc_ta="மானாவாரி செம்மண்ணுக்கு ஏற்ற நீண்டகால சிறுதானியம்."),
    _crop("red-gram", "Red gram (Thuvarai)", "துவரை", "Cajanus cajan", "pulse", seasons=["kharif", "rabi"],
          duration=[120, 180], water=[350, 600], temp=[20, 30], ph=[6.0, 8.0], textures=MEDIUM_SOILS,
          methods=["sowing", "transplanting"], water_need="low", ref=TN_CPG_AGRI,
          desc_en="Deep-rooted pulse, sole crop or intercrop; sensitive to waterlogging.",
          desc_ta="ஆழ வேர் கொண்ட பயறு வகை; தனிப்பயிராகவோ ஊடுபயிராகவோ பயிரிடலாம்; நீர் தேக்கத்தைத் தாங்காது."),
    _crop("bengal-gram", "Bengal gram (Chickpea)", "கொண்டைக்கடலை", "Cicer arietinum", "pulse", seasons=["rabi"],
          duration=[85, 100], water=[250, 400], temp=[18, 28], ph=[6.0, 8.0], textures=HEAVY, methods=["sowing"],
          water_need="low", ref=TN_CPG_AGRI,
          desc_en="Cool-season pulse on residual moisture of black soils (rabi).",
          desc_ta="கரிசல் மண்ணின் எஞ்சிய ஈரப்பதத்தில் குளிர் பருவத்தில் பயிரிடப்படும் பயறு."),
    _crop("cowpea", "Cowpea (Thattaipayaru)", "தட்டைப்பயறு", "Vigna unguiculata", "pulse", seasons=FIELD_SEASONS,
          duration=[70, 90], water=[300, 450], temp=[24, 35], ph=[5.5, 7.5], textures=LIGHT, methods=["sowing"],
          water_need="low", ref=TN_CPG_AGRI,
          desc_en="Grain, vegetable and fodder pulse for light soils.",
          desc_ta="இலேசான மண்ணுக்கு ஏற்ற தானியம், காய்கறி மற்றும் தீவனப் பயறு."),
    _crop("sesame", "Sesame (Gingelly)", "எள்", "Sesamum indicum", "oilseed", seasons=FIELD_SEASONS,
          duration=[75, 90], water=[300, 400], temp=[25, 32], ph=[5.5, 8.0], textures=LIGHT, methods=["sowing"],
          water_need="low", ref=TN_CPG_AGRI,
          desc_en="Short oilseed, often grown in rice fallows (Masi pattam); very sensitive to waterlogging.",
          desc_ta="குறுகிய கால எண்ணெய் வித்து; நெல் தரிசில் மாசிப் பட்டத்தில் பயிரிடப்படுகிறது; நீர் தேக்கம் கூடாது."),
    _crop("sunflower", "Sunflower", "சூரியகாந்தி", "Helianthus annuus", "oilseed", seasons=FIELD_SEASONS,
          duration=[85, 95], water=[400, 600], temp=[20, 30], ph=[6.0, 8.0], textures=MEDIUM_SOILS,
          methods=["sowing"], water_need="medium", ref=TN_CPG_AGRI,
          desc_en="Photo-insensitive oilseed that fits all three seasons under irrigation.",
          desc_ta="பாசனத்தில் மூன்று பருவங்களிலும் பயிரிடக்கூடிய எண்ணெய் வித்துப் பயிர்."),
    _crop("castor", "Castor", "ஆமணக்கு", "Ricinus communis", "oilseed", seasons=["kharif"],
          duration=[140, 180], water=[400, 600], temp=[20, 30], ph=[5.5, 8.0], textures=LIGHT + ["clay loam"],
          methods=["sowing"], water_need="low", ref=TN_CPG_AGRI,
          desc_en="Hardy non-edible oilseed for rainfed red soils.",
          desc_ta="மானாவாரி செம்மண்ணுக்கு ஏற்ற உண்ணா எண்ணெய் வித்து."),
    _crop("banana", "Banana", "வாழை", "Musa spp.", "fruit", seasons=["kharif", "rabi", "summer"],
          duration=[300, 420], water=[1200, 2200], temp=[20, 35], ph=[6.0, 7.5], textures=MEDIUM_SOILS + ["clay loam"],
          methods=["sowing"], water_need="high", ref=TN_CPG_HORTI,
          fractions=[("establishment", 0.10), ("vegetative", 0.45), ("flowering", 0.10), ("yield_formation", 0.30),
                     ("maturity", 0.05)],
          desc_en="Planted from suckers or tissue-culture plants; 12–14 month crop needing assured irrigation.",
          desc_ta="கன்று அல்லது திசு வளர்ப்பு நாற்றுகளால் நடவு; உறுதியான பாசனம் தேவைப்படும் 12–14 மாத பயிர்."),
    _crop("turmeric", "Turmeric", "மஞ்சள்", "Curcuma longa", "spice", seasons=["kharif"],
          duration=[240, 270], water=[1200, 1800], temp=[20, 30], ph=[5.5, 7.5], textures=["loam", "sandy loam",
                                                                                         "clay loam"],
          methods=["sowing"], water_need="high", ref=TN_CPG_HORTI,
          desc_en="Rhizome spice planted May–June (Erode, Salem belt); needs well-drained loam and irrigation.",
          desc_ta="மே–ஜூன் மாதத்தில் கிழங்கு நடவு; நன்கு வடிகால் உள்ள மண் மற்றும் பாசனம் தேவை."),
    _crop("small-onion", "Small onion (Aggregatum)", "சின்ன வெங்காயம்", "Allium cepa var. aggregatum",
          "vegetable", seasons=FIELD_SEASONS, duration=[60, 75], water=[350, 550], temp=[13, 30], ph=[6.0, 7.5],
          textures=["sandy loam", "loam", "clay loam"], methods=["sowing"], water_need="medium", ref=TN_CPG_HORTI,
          desc_en="Planted from bulbs; short crop for well-drained soils with light, frequent irrigation.",
          desc_ta="விதை வெங்காயம் நடவு; நன்கு வடிகால் உள்ள மண்ணில் அடிக்கடி இலேசான பாசனம் தேவை."),
    _crop("tomato", "Tomato", "தக்காளி", "Solanum lycopersicum", "vegetable", seasons=FIELD_SEASONS,
          duration=[120, 140], water=[400, 600], temp=[20, 30], ph=[6.0, 7.5], textures=MEDIUM_SOILS,
          methods=["transplanting"], water_need="medium", ref=TN_CPG_HORTI,
          desc_en="Transplanted vegetable; flowering and fruit set suffer in very hot or very wet weather.",
          desc_ta="நாற்று நடவு காய்கறி; கடும் வெப்பம் அல்லது மழையில் பூ மற்றும் காய் பிடிப்பு குறையும்."),
    _crop("brinjal", "Brinjal (Eggplant)", "கத்தரி", "Solanum melongena", "vegetable", seasons=FIELD_SEASONS,
          duration=[130, 160], water=[500, 700], temp=[21, 32], ph=[5.5, 7.5], textures=MEDIUM_SOILS,
          methods=["transplanting"], water_need="medium", ref=TN_CPG_HORTI,
          desc_en="Transplanted vegetable with several harvests; watch for shoot and fruit borer.",
          desc_ta="பல அறுவடைகள் தரும் நாற்று நடவு காய்கறி; தண்டு மற்றும் காய்ப்புழுவைக் கண்காணிக்கவும்."),
    _crop("chilli", "Chilli", "மிளகாய்", "Capsicum annuum", "spice", seasons=["kharif", "rabi"],
          duration=[150, 210], water=[500, 800], temp=[20, 30], ph=[6.0, 7.5], textures=MEDIUM_SOILS + ["clay loam"],
          methods=["transplanting"], water_need="medium", ref=TN_CPG_HORTI,
          desc_en="Transplanted spice crop (Ramanathapuram, Virudhunagar belt); dislikes waterlogging.",
          desc_ta="நாற்று நடவு மிளகாய்; நீர் தேக்கத்தைத் தாங்காது."),
    _crop("bhendi", "Bhendi (Okra)", "வெண்டை", "Abelmoschus esculentus", "vegetable", seasons=FIELD_SEASONS,
          duration=[90, 100], water=[350, 500], temp=[22, 32], ph=[6.0, 7.5], textures=MEDIUM_SOILS,
          methods=["sowing"], water_need="medium", ref=TN_CPG_HORTI,
          desc_en="Direct-sown warm-season vegetable with frequent pickings.",
          desc_ta="நேரடி விதைப்பு வெப்பப் பருவக் காய்கறி; அடிக்கடி அறுவடை."),
    _crop("tapioca", "Tapioca (Cassava)", "மரவள்ளி", "Manihot esculenta", "tuber", seasons=["kharif", "rabi"],
          duration=[240, 300], water=[1000, 1500], temp=[25, 30], ph=[5.0, 7.0], textures=LIGHT,
          methods=["sowing"], water_need="medium", ref=TN_CPG_HORTI,
          desc_en="Planted from stem cuttings (setts); 8–10 month tuber crop for light, well-drained soils.",
          desc_ta="தண்டுக் கரணைகளால் நடவு; இலேசான மண்ணுக்கு ஏற்ற 8–10 மாத கிழங்குப் பயிர்."),
    _crop("coconut", "Coconut", "தென்னை", "Cocos nucifera", "plantation", seasons=[],
          duration=[365, 365], water=[1300, 2300], temp=[20, 32], ph=[5.2, 8.0], textures=LIGHT + ["clay loam"],
          methods=["sowing"], water_need="high", ref=TN_CPG_HORTI, plannable=False,
          desc_en="Perennial plantation palm. Bhoomi's crop-stage model covers seasonal crops only, so coconut "
                  "can be recorded but not planned stage by stage yet.",
          desc_ta="பல்லாண்டு தென்னந்தோப்பு. பருவப் பயிர்களுக்கான மாதிரி மட்டுமே உள்ளதால் தென்னைக்கு நிலை வாரியான "
                  "திட்டம் இன்னும் இல்லை."),
]

DATA_SOURCES = [
    {"key": "open-meteo-forecast", "name": "Open-Meteo Forecast API", "provider": "Open-Meteo",
     "url": "https://open-meteo.com/en/docs", "license": "CC BY 4.0", "attribution": "Weather data by Open-Meteo.com",
     "coverage": "Global", "resolution": "1–11 km (model dependent)", "update_frequency": "Hourly",
     "rate_limit": "Free tier: non-commercial, ~10k calls/day"},
    {"key": "open-meteo-archive", "name": "Open-Meteo Historical Weather API", "provider": "Open-Meteo",
     "url": "https://open-meteo.com/en/docs/historical-weather-api", "license": "CC BY 4.0",
     "attribution": "Weather data by Open-Meteo.com", "coverage": "Global, 1940–present (~5 day lag)",
     "resolution": "ERA5 ~25 km / ERA5-Land ~9 km", "update_frequency": "Daily", "rate_limit": "Shared with forecast"},
    {"key": "open-meteo-elevation", "name": "Open-Meteo Elevation API (Copernicus GLO-90)",
     "provider": "Open-Meteo", "url": "https://open-meteo.com/en/docs/elevation-api",
     "license": "Copernicus DEM licence", "attribution": "Copernicus DEM", "coverage": "Global", "resolution": "90 m",
     "update_frequency": "Static", "rate_limit": "Shared with forecast"},
    {"key": "soilgrids", "name": "ISRIC SoilGrids v2.0", "provider": "ISRIC", "url": "https://rest.isric.org",
     "license": "CC BY 4.0", "attribution": "ISRIC — World Soil Information", "coverage": "Global",
     "resolution": "250 m", "update_frequency": "Static (2020 release)",
     "rate_limit": "Beta fair-use API (~5 requests/minute)",
     "notes": "Modelled estimates; not a substitute for laboratory soil tests."},
    {"key": "nominatim", "name": "OpenStreetMap Nominatim", "provider": "OpenStreetMap Foundation",
     "url": "https://nominatim.org", "license": "ODbL", "attribution": "© OpenStreetMap contributors",
     "coverage": "Global", "resolution": None, "update_frequency": "Continuous",
     "rate_limit": "Max 1 request/second; caching required"},
    {"key": "gemini", "name": "Google Gemini API", "provider": "Google AI Studio", "url": "https://ai.google.dev",
     "license": "Google API terms", "attribution": None, "coverage": None, "resolution": None,
     "update_frequency": None, "rate_limit": "Per API key quota"},
]
