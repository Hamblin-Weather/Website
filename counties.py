import csv
import io
import json
import time
import zipfile
from typing import Dict, Any, List, Tuple

import httpx

# =========================
# CONFIG
# =========================
USER_AGENT = "MidSouthWxDashboard/1.0 (contact: your-email@example.com)"  # CHANGE THIS
OUT_FILE = "counties.json"

GAZETTEER_ZIP_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_counties_national.zip"
)

TARGETS: List[Tuple[str, str]] = [
    
    ("TN", "Shelby"),
    ("TN", "Tipton"),
    ("TN", "Fayette"),
    ("TN", "Haywood"),
    ("TN", "Madison"),
    ("TN", "Lauderdale"),
    ("TN", "Crockett"),
    ("TN", "Dyer"),
    ("TN", "Gibson"),
    ("TN", "Carroll"),
    ("TN", "Lake"),
    ("TN", "Obion"),
    ("TN", "Weakley"),
    ("TN", "Henry"),
    
]

# =========================
# HELPERS
# =========================
def norm(name: str) -> str:
    return name.lower().replace(" county", "").strip()

def download_gazetteer() -> str:
    headers = {"User-Agent": USER_AGENT}
    with httpx.Client(headers=headers, follow_redirects=True, timeout=60) as client:
        r = client.get(GAZETTEER_ZIP_URL)
        r.raise_for_status()

    zbytes = io.BytesIO(r.content)
    with zipfile.ZipFile(zbytes) as z:
        # Find the counties file
        for name in z.namelist():
            if "counties" in name.lower() and name.lower().endswith(".txt"):
                return z.read(name).decode("utf-8-sig")

    raise RuntimeError("Could not find counties file in Gazetteer ZIP")

def parse_gazetteer(text: str) -> List[Dict[str, Any]]:
    f = io.StringIO(text)
    reader = csv.DictReader(f, delimiter="|")

    rows = []
    for r in reader:
        try:
            rows.append({
                "state": r["USPS"].strip(),
                "county": r["NAME"].replace(" County", "").strip(),
                "geoid": r["GEOID"].strip(),
                "lat": float(r["INTPTLAT"]),
                "lon": float(r["INTPTLONG"]),
            })
        except Exception:
            continue

    return rows

def nws_points(lat: float, lon: float) -> Dict[str, Any]:
    # NWS sometimes redirects if you send too many decimals
    lat_s = f"{float(lat):.4f}"
    lon_s = f"{float(lon):.4f}"

    url = f"https://api.weather.gov/points/{lat_s},{lon_s}"
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/geo+json, application/json",
    }
    with httpx.Client(headers=headers, follow_redirects=True, timeout=30) as client:
        r = client.get(url)
        r.raise_for_status()
        data = r.json()

    if "properties" not in data:
        # Print a short preview so you can see what NWS returned
        preview = json.dumps(data)[:400]
        raise RuntimeError(f"NWS points response missing 'properties'. Preview: {preview}")

    return data

# =========================
# MAIN BUILD
# =========================
def build():
    print("Downloading Census Gazetteer...")
    gaz_text = download_gazetteer()
    gaz_rows = parse_gazetteer(gaz_text)

    target_set = {(st, norm(cty)) for st, cty in TARGETS}

    matched = [
        r for r in gaz_rows
        if (r["state"], norm(r["county"])) in target_set
    ]

    print(f"Matched {len(matched)} counties")

    out = []
    for r in matched:
        print(f"Processing {r['county']}, {r['state']}")
        p = nws_points(r["lat"], r["lon"])
        props = p["properties"]

        out.append({
            "id": r["geoid"],
            "key": f"{r['county']}|{r['state']}",
            "county": r["county"],
            "state": r["state"],
            "centroid": {"lat": r["lat"], "lon": r["lon"]},
            "nws": {
                "cwa": props.get("cwa"),
                "gridId": props.get("gridId"),
                "gridX": props.get("gridX"),
                "gridY": props.get("gridY"),
                "forecast": props.get("forecast"),
                "forecastHourly": props.get("forecastHourly"),
                "forecastGridData": props.get("forecastGridData"),
                "observationStations": props.get("observationStations"),
            }
        })

        time.sleep(0.25)  # be polite to NWS

    out.sort(key=lambda x: (x["state"], x["county"]))

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)

    print(f"Wrote {len(out)} counties to {OUT_FILE}")

# =========================
# RUN
# =========================
if __name__ == "__main__":
    build()
