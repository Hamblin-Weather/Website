/* Hamblin Weather Dashboard
   Two-column county list + forecast/hourly panel
   Requirements:
   - counties.json in same folder
   - logo.png in same folder (or rename to match index.html)
*/

"use strict";

/* =========================
   DOM
========================= */
const el = (id) => document.getElementById(id);

const $search = el("search");
const $stateFilter = el("stateFilter");
const $reload = el("reload");

const $countyList = el("countyList");
const $countShown = el("countShown");
const $countLoaded = el("countLoaded");

const $selTitle = el("selTitle");
const $selMeta = el("selMeta");

const $btnForecast = el("btnForecast");
const $btnHourly = el("btnHourly");
const $btnNws = el("btnNws");

const $status = el("status");

const $tabForecast = el("tabForecast");
const $tabHourly = el("tabHourly");
const $cards = el("cards");

/* =========================
   STATE
========================= */
let allCounties = [];
let filteredCounties = [];

let selected = null; // county object
let activeTab = "forecast"; // "forecast" | "hourly"

let lastForecast = null; // NWS forecast JSON
let lastHourly = null;   // NWS hourly JSON

/* =========================
   CONFIG
========================= */
const COUNTIES_URL = "./counties.json";

// NWS likes a real User-Agent, but browser fetch does not let you set it.
// Accept header is fine.
const FETCH_HEADERS = {
  "Accept": "application/geo+json, application/json"
};

// How many rows to render per tab (keeps UI snappy)
const MAX_FORECAST_CARDS = 20;
const MAX_HOURLY_CARDS = 36;

/* =========================
   UTIL
========================= */
function setStatus(msg, kind = "") {
  $status.classList.remove("danger", "ok");
  if (kind === "danger") $status.classList.add("danger");
  if (kind === "ok") $status.classList.add("ok");
  $status.textContent = msg || "";
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function fmtLatLon(lat, lon) {
  const a = safeNum(lat);
  const b = safeNum(lon);
  if (a === null || b === null) return "---, ---";
  return `${a.toFixed(4)}, ${b.toFixed(4)}`;
}

function mapClickUrlFromCentroid(centroid) {
  const lat = centroid && safeNum(centroid.lat);
  const lon = centroid && safeNum(centroid.lon);
  if (lat === null || lon === null) return null;
  // This is the real NWS human page, not API raw JSON
  return `https://forecast.weather.gov/MapClick.php?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
}

function fmtDowShortFromISO(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function fmtMonDayFromISO(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtHourLabelFromISO(isoString) {
  // Pull hour directly from ISO string to avoid timezone shift
  if (!isoString || typeof isoString !== "string") return "Time";

  const match = isoString.match(/T(\d{2}):(\d{2})/);
  if (!match) return "Time";

  let hour = Number(match[1]);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;

  return `${hour} ${ampm}`;
}

function fmtTimeStampFromISO(isoString) {
  const dow = fmtDowShortFromISO(isoString);
  const md = fmtMonDayFromISO(isoString);
  const hr = fmtHourLabelFromISO(isoString);

  // Example: Tue, Dec 23 · 6 PM
  const left = [dow, md].filter(Boolean).join(", ");
  return left ? `${left} · ${hr}` : hr;
}


function escapeText(s) {
  return String(s ?? "");
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: FETCH_HEADERS, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return await res.json();
}

/* =========================
   LOAD COUNTIES
========================= */
async function loadCounties() {
  setStatus("Loading counties...");
  selected = null;
  lastForecast = null;
  lastHourly = null;
  renderSelectedHeader();
  renderCardsEmpty();

  try {
    const data = await fetchJson(COUNTIES_URL);
    if (!Array.isArray(data)) throw new Error("counties.json is not an array");

    allCounties = data;
    $countLoaded.textContent = String(allCounties.length);

    buildStateFilter(allCounties);
    applyFilters();

    setStatus("Ready.", "ok");
  } catch (e) {
    console.error(e);
    setStatus("Failed to load counties.json. Make sure it exists next to index.html.", "danger");
    allCounties = [];
    filteredCounties = [];
    renderCountyList();
    $countLoaded.textContent = "0";
    $countShown.textContent = "0";
  }
}

function buildStateFilter(counties) {
  const states = new Set();
  for (const c of counties) {
    if (c && c.state) states.add(String(c.state).toUpperCase());
  }
  const list = Array.from(states).sort();

  // Preserve selection if possible
  const prev = $stateFilter.value || "ALL";

  $stateFilter.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "ALL";
  optAll.textContent = "All states";
  $stateFilter.appendChild(optAll);

  for (const st of list) {
    const opt = document.createElement("option");
    opt.value = st;
    opt.textContent = st;
    $stateFilter.appendChild(opt);
  }

  if (list.includes(prev)) $stateFilter.value = prev;
  else $stateFilter.value = "ALL";
}

/* =========================
   FILTER + RENDER LIST
========================= */
function applyFilters() {
  const q = ($search.value || "").trim().toLowerCase();
  const st = ($stateFilter.value || "ALL").toUpperCase();

  filteredCounties = allCounties.filter((c) => {
    if (!c) return false;

    const stateOk = (st === "ALL") ? true : (String(c.state).toUpperCase() === st);
    if (!stateOk) return false;

    if (!q) return true;

    const name = `${c.county || ""} ${c.state || ""}`.toLowerCase();
    return name.includes(q);
  });

  $countShown.textContent = String(filteredCounties.length);
  renderCountyList();
}

function renderCountyList() {
  $countyList.innerHTML = "";

  if (!filteredCounties.length) {
    const div = document.createElement("div");
    div.style.padding = "14px";
    div.style.color = "rgba(255,255,255,.65)";
    div.textContent = "No counties found.";
    $countyList.appendChild(div);
    return;
  }

  for (const c of filteredCounties) {
    const row = document.createElement("div");
    row.className = "countyRow" + (selected && selected.id === c.id ? " active" : "");
    row.addEventListener("click", () => selectCounty(c));

    const left = document.createElement("div");
    left.className = "countyLeft";

    const name = document.createElement("div");
    name.className = "countyName";
    name.textContent = `${c.county} County`;

    const sub = document.createElement("div");
    sub.className = "countySub";
    const latlon = fmtLatLon(c?.centroid?.lat, c?.centroid?.lon);
    sub.textContent = `${c.state} · ${latlon}`;

    left.appendChild(name);
    left.appendChild(sub);

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = String(c.state || "").toUpperCase();

    row.appendChild(left);
    row.appendChild(pill);

    $countyList.appendChild(row);
  }
}

/* =========================
   SELECT COUNTY
========================= */
function selectCounty(c) {
  selected = c;
  lastForecast = null;
  lastHourly = null;

  // Enable buttons if we have endpoints
  const hasForecast = !!(c?.nws?.forecast);
  const hasHourly = !!(c?.nws?.forecastHourly);
  const hasMapClick = !!mapClickUrlFromCentroid(c?.centroid);

  $btnForecast.disabled = !hasForecast;
  $btnHourly.disabled = !hasHourly;
  $btnNws.disabled = !hasMapClick;

  renderSelectedHeader();
  renderCountyList(); // update active highlight

  // Default behavior: show forecast tab, but do not auto fetch
  setTab("forecast");
  renderCardsEmpty();

  setStatus("Pick Forecast or Hourly.", "");
}

function renderSelectedHeader() {
  if (!selected) {
    $selTitle.textContent = "Select a county";
    $selMeta.textContent = "FIPS: n/a · ---, ---";
    $btnForecast.disabled = true;
    $btnHourly.disabled = true;
    $btnNws.disabled = true;
    return;
  }

  $selTitle.textContent = `${selected.county} County, ${selected.state}`;

  const fips = selected.id ? String(selected.id) : "n/a";
  const latlon = fmtLatLon(selected?.centroid?.lat, selected?.centroid?.lon);

  $selMeta.textContent = `FIPS: ${fips} · ${latlon}`;
}

function renderCardsEmpty() {
  $cards.innerHTML = "";
  const c = document.createElement("div");
  c.style.padding = "10px 2px";
  c.style.color = "rgba(255,255,255,.65)";
  c.textContent = selected ? "No data yet. Click Get forecast or Get hourly." : "Pick a county to begin.";
  $cards.appendChild(c);
}

/* =========================
   TABS
========================= */
function setTab(name) {
  activeTab = name;

  $tabForecast.classList.toggle("active", name === "forecast");
  $tabHourly.classList.toggle("active", name === "hourly");

  // Render whatever we have for the tab
  if (name === "forecast") {
    if (lastForecast) renderForecastCards(lastForecast);
    else renderCardsEmpty();
  } else {
    if (lastHourly) renderHourlyCards(lastHourly);
    else renderCardsEmpty();
  }
}

/* =========================
   FETCH + RENDER FORECAST
========================= */
async function getForecast() {
  if (!selected?.nws?.forecast) return;

  setStatus("Fetching forecast...");
  try {
    const data = await fetchJson(selected.nws.forecast);
    lastForecast = data;
    setStatus("Forecast loaded.", "ok");
    setTab("forecast");
    renderForecastCards(data);
  } catch (e) {
    console.error(e);
    setStatus(`Forecast failed (${e.status || "error"})`, "danger");
  }
}

function renderForecastCards(json) {
  const periods = json?.properties?.periods;
  if (!Array.isArray(periods) || periods.length === 0) {
    setStatus("No forecast periods returned.", "danger");
    renderCardsEmpty();
    return;
  }

  $cards.innerHTML = "";

  const use = periods.slice(0, MAX_FORECAST_CARDS);
  for (const p of use) {
    const card = document.createElement("div");
    card.className = "card";

    const left = document.createElement("div");
    left.className = "cardL";

    const title = document.createElement("div");
    title.className = "cardTitle";
    title.textContent = escapeText(p.name || "Forecast");

    const desc = document.createElement("div");
    desc.className = "cardDesc";
    desc.textContent = escapeText(p.detailedForecast || p.shortForecast || "");

    left.appendChild(title);
    left.appendChild(desc);

    const right = document.createElement("div");
    right.className = "cardR";

    const t = document.createElement("div");
    t.className = "temp";
    if (Number.isFinite(p.temperature)) {
      const unit = p.temperatureUnit ? String(p.temperatureUnit) : "F";
      t.textContent = `${p.temperature}°${unit}`;
    } else {
      t.textContent = "";
    }

    const mini = document.createElement("div");
    mini.className = "mini";
    const wind = (p.windSpeed || p.windDirection) ? `${p.windDirection || ""} ${p.windSpeed || ""}`.trim() : "";
    mini.textContent = wind;

    right.appendChild(t);
    right.appendChild(mini);

    card.appendChild(left);
    card.appendChild(right);

    $cards.appendChild(card);
  }
}

/* =========================
   FETCH + RENDER HOURLY
========================= */
async function getHourly() {
  if (!selected?.nws?.forecastHourly) return;

  setStatus("Fetching hourly...");
  try {
    const data = await fetchJson(selected.nws.forecastHourly);
    lastHourly = data;
    setStatus("Hourly loaded.", "ok");
    setTab("hourly");
    renderHourlyCards(data);
  } catch (e) {
    console.error(e);
    setStatus(`Hourly failed (${e.status || "error"})`, "danger");
  }
}

function renderHourlyCards(json) {
  const periods = json?.properties?.periods;
  if (!Array.isArray(periods) || periods.length === 0) {
    setStatus("No hourly periods returned.", "danger");
    renderCardsEmpty();
    return;
  }

  $cards.innerHTML = "";

  const use = periods.slice(0, MAX_HOURLY_CARDS);

  for (const p of use) {
    const card = document.createElement("div");
    card.className = "card";

    const left = document.createElement("div");
    left.className = "cardL";

    // Hour label requirement
    const when = p.startTime
  ? fmtTimeStampFromISO(p.startTime)
  : "Time";


    const title = document.createElement("div");
    title.className = "cardTitle";
    title.textContent = when;

    const desc = document.createElement("div");
    desc.className = "cardDesc";

    // Keep it clean but useful
    const parts = [];
    if (p.shortForecast) parts.push(p.shortForecast);
    if (p.windSpeed || p.windDirection) parts.push(`Wind: ${(p.windDirection || "").trim()} ${(p.windSpeed || "").trim()}`.trim());
    if (Number.isFinite(p.probabilityOfPrecipitation?.value)) parts.push(`Rain chance: ${p.probabilityOfPrecipitation.value}%`);

    desc.textContent = parts.join(" · ");

    left.appendChild(title);
    left.appendChild(desc);

    const right = document.createElement("div");
    right.className = "cardR";

    const t = document.createElement("div");
    t.className = "temp";
    if (Number.isFinite(p.temperature)) {
      const unit = p.temperatureUnit ? String(p.temperatureUnit) : "F";
      t.textContent = `${p.temperature}°${unit}`;
    } else {
      t.textContent = "";
    }

    const mini = document.createElement("div");
    mini.className = "mini";
    if (p.relativeHumidity && Number.isFinite(p.relativeHumidity.value)) {
      mini.textContent = `RH ${p.relativeHumidity.value}%`;
    } else {
      mini.textContent = "";
    }

    right.appendChild(t);
    right.appendChild(mini);

    card.appendChild(left);
    card.appendChild(right);

    $cards.appendChild(card);
  }
}

/* =========================
   OPEN NWS
========================= */
function openOnNws() {
  if (!selected) return;
  const url = mapClickUrlFromCentroid(selected.centroid);
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

/* =========================
   EVENTS
========================= */
$search.addEventListener("input", () => applyFilters());
$stateFilter.addEventListener("change", () => applyFilters());
$reload.addEventListener("click", () => loadCounties());

$btnForecast.addEventListener("click", () => getForecast());
$btnHourly.addEventListener("click", () => getHourly());
$btnNws.addEventListener("click", () => openOnNws());

$tabForecast.addEventListener("click", () => setTab("forecast"));
$tabHourly.addEventListener("click", () => setTab("hourly"));

/* =========================
   START
========================= */
loadCounties();
