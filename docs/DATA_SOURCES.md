# Data-source plan

Each source sits behind an adapter in `backend/app/modules/environment/providers/`
(or `lands/geocoding.py`). Check the terms again before going to production. Usage
terms change, and commercial use often needs a paid plan.

| Domain | Source (adapter) | What we use | Coverage / horizon | Licence & attribution | Limits & notes |
|---|---|---|---|---|---|
| Weather forecast | **Open-Meteo Forecast API** (`open_meteo.py`) | current, hourly 48 h, daily 16 d: temp, RH, precip + probability, cloud, wind/gusts/dir, pressure, sunrise/sunset, ET₀ | Global. Mixes models such as ECMWF IFS, GFS and ICON. 16-day horizon | CC BY 4.0, "Weather data by Open-Meteo.com" | Free API is non-commercial with about 10k calls/day. Commercial use needs an API key plan (`OPEN_METEO_API_KEY` + customer URL). We cache for 30 min per rounded lat/lon (0.01°). |
| Weather history | **Open-Meteo Historical (archive) API** | daily observed series for past dates (reanalysis, ERA5 / ERA5-Land) | 1940 to about 5 days ago | CC BY 4.0 | This is reanalysis, not a station record. We label it `observed (reanalysis)`. |
| Climatology | Derived from the archive API: 10-year mean per calendar day (`climatology.py`) | Tmin/Tmax/precip beyond the forecast horizon | Global | CC BY 4.0 | Labelled `climatology`. Shown as an estimate and never as a forecast. Cached for 30 days. |
| Elevation | **Open-Meteo Elevation API** (Copernicus GLO-90 DEM) | elevation at the centroid and the vertices, plus approximate relief and slope | Global, 90 m | Copernicus DEM licence | A 90 m grid cannot resolve slope within a small field. We label the result *approximate*. |
| Soil | **ISRIC SoilGrids v2.0 REST** (`soilgrids.py`) | sand, silt, clay, pH(H₂O), SOC, CEC, bulk density at 0–5, 5–15 and 15–30 cm | Global, 250 m modelled grid | CC BY 4.0, ISRIC | The REST API is a **beta, fair-use** service, documented at about 5 calls/min. Values are **model estimates**, not lab tests. We cache for 30 days and invite farmers to enter Soil Health Card results. |
| Geocoding | **OSM Nominatim** (proxied by the backend) | search and reverse lookup for village, district and state | Global | ODbL, "© OpenStreetMap contributors" | Max 1 req/s. A valid User-Agent is required and so is caching. For production, self-host the service or use a commercial provider. |
| Basemaps (browser) | Esri World Imagery (satellite), OpenFreeMap / OSM (streets), OpenTopoMap (terrain) | raster/vector tiles | Global | Attribution is shown in the map control | Esri imagery needs an ArcGIS account for production volume. OSM's tile servers are not meant for heavy production use. |
| Crop calendars & agronomy | Curated seed data (`backend/app/seed/crops.py`) referencing **TNAU Agritech Portal**, **IRRI Rice Knowledge Bank** and the **ICAR-IIRR** variety notes | seasons (Kuruvai, Samba, Thaladi, Navarai), duration groups, stage rules | Tamil Nadu first | Each entry links to its reference | Hand-curated and versioned. Entries without a district-level advisory are labelled `preliminary`. |
| Weather warnings (official) | IMD district warnings. **Not integrated**: no stable public JSON API without registration | – | – | – | For now, `bhoomi_rules` alerts come from forecast thresholds (heavy rain, strong wind, heat) and are labelled as rule-based, *not* official IMD warnings. |
| AI assistant | **Google Gemini** via AI Studio key (`google-genai`) | grounded chat | – | Google AI terms | The key stays server-side. Free-tier prompts may be used by Google to improve its products, so use a paid tier for real farmer data. |
