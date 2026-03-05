import json
import geopandas as gpd

COUNTIES_JSON = "counties.json"
TIGER_ZIP = "tl_2024_us_county.zip"
OUT_GEOJSON = "counties.geojson"

def main():
    with open(COUNTIES_JSON, "r", encoding="utf-8") as f:
        counties = json.load(f)

    geoids = sorted({str(c["id"]).zfill(5) for c in counties})

    gdf = gpd.read_file(TIGER_ZIP)

    # TIGER county GEOID is 5-digit string
    if "GEOID" not in gdf.columns:
        raise RuntimeError("Expected GEOID column not found in TIGER file.")

    gdf["GEOID"] = gdf["GEOID"].astype(str).str.zfill(5)
    gdf = gdf[gdf["GEOID"].isin(geoids)].copy()

    if len(gdf) == 0:
        raise RuntimeError("Filtered to 0 features. GEOIDs may not match your counties.json.")

    # Keep only what we need
    keep_cols = [c for c in ["GEOID", "NAME", "STATEFP", "geometry"] if c in gdf.columns]
    gdf = gdf[keep_cols]

    gdf.to_file(OUT_GEOJSON, driver="GeoJSON")
    print(f"Wrote {len(gdf)} counties to {OUT_GEOJSON}")

if __name__ == "__main__":
    main()
