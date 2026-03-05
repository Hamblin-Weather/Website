# nws.py
from typing import Dict, Any, List
import httpx

USER_AGENT = "MidSouthWxDashboard/1.0 (contact: your-email@example.com)"  # change

async def _get_json(url: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}) as client:
        r = await client.get(url, timeout=30)
        r.raise_for_status()
        return r.json()

async def get_hourly(county: Dict[str, Any]) -> Dict[str, Any]:
    url = county["nws"]["forecastHourly"]
    data = await _get_json(url)
    return data.get("properties", {})

async def get_7day(county: Dict[str, Any]) -> Dict[str, Any]:
    url = county["nws"]["forecast"]
    data = await _get_json(url)
    return data.get("properties", {})

async def get_current_conditions(county: Dict[str, Any]) -> Dict[str, Any]:
    # Get station list, then read the most recent observation from the first station
    stations_url = county["nws"]["observationStations"]
    stations = await _get_json(stations_url)
    features = stations.get("features", [])
    if not features:
        return {"error": "no stations found"}
    station_id = features[0]["properties"]["stationIdentifier"]
    obs_url = f"https://api.weather.gov/stations/{station_id}/observations/latest"
    obs = await _get_json(obs_url)
    return {
        "station": station_id,
        "properties": obs.get("properties", {}),
    }

async def get_alerts_for_counties(counties: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    # Simplest county filter for now: filter by state and then match county names in the alert areaDesc.
    # Next step later: polygon intersection, but this works well for a first version.
    states = sorted({c["state"] for c in counties})
    county_names = {f"{c['county']}": c["state"] for c in counties}

    alerts: List[Dict[str, Any]] = []
    for st in states:
        url = f"https://api.weather.gov/alerts/active?area={st}"
        data = await _get_json(url)
        for feat in data.get("features", []):
            props = feat.get("properties", {})
            area_desc = (props.get("areaDesc") or "").lower()
            if any((name.lower() in area_desc) for name in county_names.keys()):
                alerts.append(props)

    # sort by severity then sent time if present
    def sev_rank(s: str) -> int:
        order = {"Extreme": 0, "Severe": 1, "Moderate": 2, "Minor": 3, "Unknown": 4}
        return order.get(s or "Unknown", 4)

    alerts.sort(key=lambda a: (sev_rank(a.get("severity")), a.get("sent") or ""))
    return alerts
