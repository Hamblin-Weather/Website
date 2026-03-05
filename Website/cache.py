# cache.py
import json
import time
from pathlib import Path
from typing import Any, Optional

CACHE_DIR = Path(".cache")
CACHE_DIR.mkdir(exist_ok=True)

def _path(key: str) -> Path:
    safe = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in key)
    return CACHE_DIR / f"{safe}.json"

def cache_get_json(key: str) -> Optional[Any]:
    p = _path(key)
    if not p.exists():
        return None
    try:
        obj = json.loads(p.read_text(encoding="utf-8"))
        if obj.get("_expires", 0) < time.time():
            return None
        return obj.get("data")
    except Exception:
        return None

def cache_set_json(key: str, data: Any, ttl_seconds: int) -> None:
    p = _path(key)
    payload = {"_expires": time.time() + ttl_seconds, "data": data}
    p.write_text(json.dumps(payload), encoding="utf-8")
