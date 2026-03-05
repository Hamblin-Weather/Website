# app.py
import json
from pathlib import Path
from typing import Dict, Any, List, Optional

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from nws import get_hourly, get_7day, get_alerts_for_counties, get_current_conditions
from cache import cache_get_json, cache_set_json

APP_TITLE = "Mid-South Weather Dashboard"

app = FastAPI(title=APP_TITLE)

BASE_DIR = Path(__file__).parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

COUNTIES_PATH = BASE_DIR / "counties.json"
COUNTIES: List[Dict[str, Any]] = json.loads(COUNTIES_PATH.read_text(encoding="utf-8"))

def find_county(key: str) -> Optional[Dict[str, Any]]:
    for c in COUNTIES:
        if c["key"] == key:
            return c
    return None

@app.get("/", response_class=HTMLResponse)
async def home(request: Request, county: Optional[str] = None):
    selected = find_county(county) if county else COUNTIES[0]

    cache_key = f"home::{selected['key']}"
    cached = cache_get_json(cache_key)
    if cached:
        ctx = cached
    else:
        hourly = await get_hourly(selected)
        seven = await get_7day(selected)
        current = await get_current_conditions(selected)
        ctx = {
            "selected": selected,
            "hourly": hourly,
            "seven": seven,
            "current": current,
        }
        cache_set_json(cache_key, ctx, ttl_seconds=900)

    return templates.TemplateResponse(
        "home.html",
        {
            "request": request,
            "title": APP_TITLE,
            "counties": COUNTIES,
            **ctx,
        },
    )

@app.get("/radar", response_class=HTMLResponse)
async def radar(request: Request, county: Optional[str] = None):
    selected = find_county(county) if county else COUNTIES[0]
    return templates.TemplateResponse(
        "radar.html",
        {
            "request": request,
            "title": f"Radar | {APP_TITLE}",
            "counties": COUNTIES,
            "selected": selected,
        },
    )

@app.get("/alerts", response_class=HTMLResponse)
async def alerts_page(request: Request):
    cache_key = "alerts::all"
    cached = cache_get_json(cache_key)
    if cached:
        alerts = cached
    else:
        alerts = await get_alerts_for_counties(COUNTIES)
        cache_set_json(cache_key, alerts, ttl_seconds=300)

    return templates.TemplateResponse(
        "alerts.html",
        {
            "request": request,
            "title": f"Alerts | {APP_TITLE}",
            "counties": COUNTIES,
            "alerts": alerts,
        },
    )

# JSON endpoints (optional, useful later)
@app.get("/api/hourly")
async def api_hourly(county: str):
    selected = find_county(county)
    if not selected:
        return JSONResponse({"error": "county not found"}, status_code=404)
    return await get_hourly(selected)

@app.get("/api/7day")
async def api_7day(county: str):
    selected = find_county(county)
    if not selected:
        return JSONResponse({"error": "county not found"}, status_code=404)
    return await get_7day(selected)
