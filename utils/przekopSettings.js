/** Długość przekopu (wiersze macierzy) */
export const PRZEKOP_LENGTH_ROWS = [
  { id: "do-10",       label: "do 10m" },
  { id: "10-20",       label: "od 10 do 20 m" },
  { id: "20-30",       label: "od 20 do 30 m" },
  { id: "30-40",       label: "od 30 do 40 m" },
  { id: "40-50",       label: "od 40 do 50 m" },
  { id: "50-100",      label: "od 50 do 100 m" },
];

/** Moc instalacji (kWp) — kolumny macierzy */
export const PRZEKOP_POWER_KWP = [5, 10, 20, 30, 40, 50];

const row = (v5, v10, v20, v30, v40, v50) => ({
  5: v5, 10: v10, 20: v20, 30: v30, 40: v40, 50: v50,
});

export const DEFAULT_YKY_MATRIX = {
  "do-10":  row("YKY 5x4",  "YKY 5x6",  "YKY 5x10", "YKY 5x16", "YKY 5x25", "YKY 5x35"),
  "10-20":  row("YKY 5x4",  "YKY 5x6",  "YKY 5x10", "YKY 5x16", "YKY 5x25", "YKY 5x35"),
  "20-30":  row("YKY 5x4",  "YKY 5x6",  "YKY 5x10", "YKY 5x16", "YKY 5x25", "YKY 5x35"),
  "30-40":  row("YKY 5x6",  "YKY 5x10", "YKY 5x16", "YKY 5x25", "YKY 5x35", "YKY 5x50"),
  "40-50":  row("YKY 5x6",  "YKY 5x10", "YKY 5x16", "YKY 5x25", "YKY 5x35", "YKY 5x50"),
  "50-100": row("YKY 5x10", "YKY 5x16", "YKY 5x25", "YKY 5x35", "YKY 5x50", "YKY 5x70"),
};

export const DEFAULT_YAKY_MATRIX = {
  "do-10":  row("", "", "YAKY 5x25", "YAKY 5x35", "YAKY 5x50", "YAKY 5x70"),
  "10-20":  row("", "", "YAKY 5x25", "YAKY 5x35", "YAKY 5x50", "YAKY 5x70"),
  "20-30":  row("", "", "YAKY 5x25", "YAKY 5x35", "YAKY 5x50", "YAKY 5x70"),
  "30-40":  row("YAKY 5x10", "YAKY 5x16", "YAKY 5x25", "YAKY 5x35", "YAKY 5x50", "YAKY 5x70"),
  "40-50":  row("YAKY 5x10", "YAKY 5x16", "YAKY 5x25", "YAKY 5x35", "YAKY 5x50", "YAKY 5x70"),
  "50-100": row("YAKY 5x16", "YAKY 5x25", "YAKY 5x35", "YAKY 5x50", "YAKY 5x70", "YAKY 5x95"),
};

/** Ceny za metr — przewody miedziane (YKY) */
export const DEFAULT_YKY_PRICES = {
  "YKY 5x4":  12.22,
  "YKY 5x6":  18.25,
  "YKY 5x10": 25.96,
  "YKY 5x16": 40.93,
  "YKY 5x25": 66,
  "YKY 5x35": 91.83,
  "YKY 5x50": 122.9,
  "YKY 5x70": 179.53,
};

/** Ceny za metr — przewody aluminiowe (YAKY) */
export const DEFAULT_YAKY_PRICES = {
  "YAKY 5x10": 0,
  "YAKY 5x16": 9.2,
  "YAKY 5x25": 13.68,
  "YAKY 5x35": 21.43,
  "YAKY 5x50": 20.64,
  "YAKY 5x70": 31.99,
  "YAKY 5x95": 38.64,
};

const LS_YKY_MATRIX       = "kalk-przekop-matrix-yky";
const LS_YAKY_MATRIX      = "kalk-przekop-matrix-yaky";
const LS_YKY_PRICES       = "kalk-przewod-prices-yky";
const LS_YAKY_PRICES      = "kalk-przewod-prices-yaky";
const LS_KOPANIE_PRZEKOP  = "kalk-kopanie-przekop";

/** Domyślny cennik kopania (zakresy długości → cena netto). */
export const DEFAULT_KOPANIE_PRZEKOP = [
  { id: "k1", odMetrow: 0,  doMetrow: 10, priceNetto: 700 },
  { id: "k2", odMetrow: 10, doMetrow: 20, priceNetto: 1000 },
  { id: "k3", odMetrow: 20, doMetrow: 30, priceNetto: 1400 },
  { id: "k4", odMetrow: 30, doMetrow: 40, priceNetto: 1700 },
  { id: "k5", odMetrow: 40, doMetrow: 50, priceNetto: 2000 },
  { id: "k6", odMetrow: 50, doMetrow: 80, priceNetto: 2600 },
];

export function formatKopanieZakres(odMetrow, doMetrow) {
  const from = Number(odMetrow);
  const to = Number(doMetrow);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "—";
  if (from === 0) return `Do ${to} m`;
  return `${from}–${to} m`;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function readJson(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadYkyMatrix() {
  const saved = readJson(LS_YKY_MATRIX);
  if (saved === null) return deepClone(DEFAULT_YKY_MATRIX);
  return typeof saved === "object" ? saved : deepClone(DEFAULT_YKY_MATRIX);
}

export function loadYakyMatrix() {
  const saved = readJson(LS_YAKY_MATRIX);
  if (saved === null) return deepClone(DEFAULT_YAKY_MATRIX);
  return typeof saved === "object" ? saved : deepClone(DEFAULT_YAKY_MATRIX);
}

export function loadYkyPrices() {
  const saved = readJson(LS_YKY_PRICES);
  if (saved === null) return deepClone(DEFAULT_YKY_PRICES);
  return typeof saved === "object" ? saved : deepClone(DEFAULT_YKY_PRICES);
}

export function loadYakyPrices() {
  const saved = readJson(LS_YAKY_PRICES);
  if (saved === null) return deepClone(DEFAULT_YAKY_PRICES);
  return typeof saved === "object" ? saved : deepClone(DEFAULT_YAKY_PRICES);
}

export function saveYkyMatrix(matrix) {
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_YKY_MATRIX, JSON.stringify(matrix));
  }
}

export function saveYakyMatrix(matrix) {
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_YAKY_MATRIX, JSON.stringify(matrix));
  }
}

export function saveYkyPrices(prices) {
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_YKY_PRICES, JSON.stringify(prices));
  }
}

export function saveYakyPrices(prices) {
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_YAKY_PRICES, JSON.stringify(prices));
  }
}

/** Zapis cennika kopania (frontend / localStorage). */
export function saveKopaniePrzekop(ranges) {
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_KOPANIE_PRZEKOP, JSON.stringify(ranges));
  }
}

/** @deprecated alias */
export function saveKopanieTransei(ranges) {
  saveKopaniePrzekop(ranges);
}

export function loadKopaniePrzekop() {
  if (typeof window === "undefined") return deepClone(DEFAULT_KOPANIE_PRZEKOP);
  const raw = localStorage.getItem(LS_KOPANIE_PRZEKOP);
  if (raw === null) return deepClone(DEFAULT_KOPANIE_PRZEKOP);
  try {
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return [];
    return saved.map((r, i) => ({
      id: r.id ?? `k${i}`,
      odMetrow: Number(r.odMetrow) ?? 0,
      doMetrow: Number(r.doMetrow) ?? 0,
      priceNetto: Number(r.priceNetto) ?? 0,
      isActive: r.isActive !== false,
    }));
  } catch {
    return [];
  }
}

/** Zapisuje aktywne zakresy do cache (localStorage) — po pobraniu z API. */
export function syncKopaniePrzekopCache(ranges) {
  const active = (ranges || []).filter((r) => r.isActive !== false);
  saveKopaniePrzekop(active);
}

function matchesKopanieRange(odMetrow, doMetrow, metraz) {
  const from = Number(odMetrow);
  const to = Number(doMetrow);
  const m = Number(metraz);
  if (from === 0) return m >= 0 && m <= to;
  return m > from && m <= to;
}

/** @deprecated alias */
export function loadKopanieTransei() {
  return loadKopaniePrzekop();
}

/** Zwraca etykietę przewodu YKY dla długości (m) i mocy (kWp). */
export function lookupYkyCable(lengthM, powerKwp) {
  const matrix = loadYkyMatrix();
  const rowId = lengthMToRowId(lengthM);
  const col = snapPowerKwp(powerKwp);
  return matrix[rowId]?.[col] ?? "";
}

/** Zwraca etykietę przewodu YAKY (pusty string = brak). */
export function lookupYakyCable(lengthM, powerKwp) {
  const matrix = loadYakyMatrix();
  const rowId = lengthMToRowId(lengthM);
  const col = snapPowerKwp(powerKwp);
  const v = matrix[rowId]?.[col] ?? "";
  return v === "." ? "" : v;
}

export function getCablePricePerMeter(cableLabel) {
  if (!cableLabel || cableLabel === ".") return 0;
  const yky = loadYkyPrices();
  const yaky = loadYakyPrices();
  if (yky[cableLabel] != null && yky[cableLabel] > 0) return yky[cableLabel];
  if (yaky[cableLabel] != null && yaky[cableLabel] > 0) return yaky[cableLabel];
  return 0;
}

function lengthMToRowId(m) {
  const n = Number(m) || 0;
  if (n <= 10) return "do-10";
  if (n <= 20) return "10-20";
  if (n <= 30) return "20-30";
  if (n <= 40) return "30-40";
  if (n <= 50) return "40-50";
  return "50-100";
}

/**
 * Kolumna tabeli (5, 10, 20, 30, 40, 50 kWp) — zaokrąglenie w górę:
 * np. 35 kWp → 40 kWp (nie 30), żeby dobrać przewód o wystarczającej przekroju.
 */
export function snapPowerKwp(kwp) {
  const n = Number(kwp) || 0;
  const cols = PRZEKOP_POWER_KWP;
  if (n <= 0) return cols[0];
  for (let i = 0; i < cols.length; i++) {
    if (n <= cols[i]) return cols[i];
  }
  return cols[cols.length - 1];
}

/** Usługa kopania (netto) wg długości przekopu [m] — logika jak w backendzie. */
export function calcKopaniePrzekop(metry) {
  const m = Number(metry) || 0;
  if (m <= 0) return 0;

  const sorted = loadKopaniePrzekop()
    .filter((r) => r.isActive !== false)
    .sort((a, b) => Number(a.odMetrow) - Number(b.odMetrow));

  const match = sorted.find((r) =>
    matchesKopanieRange(r.odMetrow, r.doMetrow, m),
  );
  return match ? Number(match.priceNetto) || 0 : 0;
}

export function getCablePriceForType(cableLabel, cableType) {
  if (!cableLabel || cableLabel === ".") return 0;
  const prices =
    cableType === "miedz" ? loadYkyPrices() : loadYakyPrices();
  const p = prices[cableLabel];
  return Number.isFinite(p) && p > 0 ? p : 0;
}

/**
 * @param {{ lengthM: number, powerKwp: number, cableType: 'miedz'|'aluminium' }} params
 */
export function computePrzekopQuote({ lengthM, powerKwp, cableType }) {
  const metry = Math.max(0, Number(lengthM) || 0);
  const kwpUsed = snapPowerKwp(powerKwp);
  const cableLabel =
    cableType === "miedz"
      ? lookupYkyCable(metry, kwpUsed)
      : lookupYakyCable(metry, kwpUsed);
  const pricePerM = getCablePriceForType(cableLabel, cableType);
  const cableCost = Math.round(pricePerM * metry * 100) / 100;
  const kopanieCost = calcKopaniePrzekop(metry);
  const totalCost = Math.round((cableCost + kopanieCost) * 100) / 100;

  return {
    cableLabel: cableLabel || "",
    cableType,
    powerKwpUsed: kwpUsed,
    powerKwpActual: Number(powerKwp) || 0,
    lengthM: metry,
    pricePerM,
    cableCost,
    kopanieCost,
    totalCost,
    isValid: Boolean(cableLabel) && pricePerM > 0 && metry > 0,
  };
}

export const PRZEKOP_PRZEWOD_LABELS = {
  miedz: "Przewód miedziany (YKY)",
  aluminium: "Przewód aluminiowy (YAKY)",
};

/** Aktywne przewody YKY z cennika (miedziane) — do ręcznego wyboru. */
export function listYkyCableOptions() {
  const prices = loadYkyPrices();
  return Object.keys(prices)
    .filter((name) => Number(prices[name]) > 0)
    .sort((a, b) => a.localeCompare(b, "pl"));
}

/**
 * Dodatkowa trasa kablowa — tylko przewód miedziany (YKY), bez kopania.
 * @param {{ lengthM: number, powerKwp: number, mode: 'tabela'|'reczny', manualCableLabel?: string }} params
 */
export function computeTrasaKablowaQuote({
  lengthM,
  powerKwp,
  mode,
  manualCableLabel,
}) {
  const metry = Math.max(0, Number(lengthM) || 0);
  const kwpUsed = snapPowerKwp(powerKwp);
  const cableLabel =
    mode === "reczny"
      ? String(manualCableLabel ?? "").trim()
      : lookupYkyCable(metry, kwpUsed);
  const pricePerM = getCablePriceForType(cableLabel, "miedz");
  const cableCost = Math.round(pricePerM * metry * 100) / 100;

  return {
    cableLabel: cableLabel || "",
    powerKwpUsed: kwpUsed,
    powerKwpActual: Number(powerKwp) || 0,
    lengthM: metry,
    pricePerM,
    cableCost,
    mode,
    isValid: Boolean(cableLabel) && pricePerM > 0 && metry > 0,
  };
}
