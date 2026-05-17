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

const LS_YKY_MATRIX  = "kalk-przekop-matrix-yky";
const LS_YAKY_MATRIX = "kalk-przekop-matrix-yaky";
const LS_YKY_PRICES  = "kalk-przewod-prices-yky";
const LS_YAKY_PRICES = "kalk-przewod-prices-yaky";

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function mergeMatrix(defaults, saved) {
  const out = deepClone(defaults);
  if (!saved || typeof saved !== "object") return out;
  for (const rowId of Object.keys(out)) {
    if (!saved[rowId]) continue;
    for (const kwp of PRZEKOP_POWER_KWP) {
      if (saved[rowId][kwp] !== undefined) {
        out[rowId][kwp] = saved[rowId][kwp] ?? "";
      }
    }
  }
  return out;
}

function mergePrices(defaults, saved) {
  const out = { ...defaults };
  if (!saved || typeof saved !== "object") return out;
  for (const key of Object.keys(out)) {
    if (saved[key] !== undefined && saved[key] !== null && saved[key] !== "") {
      out[key] = Number(saved[key]);
    }
  }
  return out;
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
  return mergeMatrix(DEFAULT_YKY_MATRIX, readJson(LS_YKY_MATRIX));
}

export function loadYakyMatrix() {
  return mergeMatrix(DEFAULT_YAKY_MATRIX, readJson(LS_YAKY_MATRIX));
}

export function loadYkyPrices() {
  return mergePrices(DEFAULT_YKY_PRICES, readJson(LS_YKY_PRICES));
}

export function loadYakyPrices() {
  return mergePrices(DEFAULT_YAKY_PRICES, readJson(LS_YAKY_PRICES));
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

/** Usługa kopania (netto) wg długości przekopu [m]. */
export function calcKopaniePrzekop(metry) {
  const m = Number(metry) || 0;
  if (m <= 0) return 0;
  if (m <= 10) return 700 + m * 30;
  if (m <= 25) return 1000 + m * 35;
  if (m <= 50) return 1700;
  return 1700 + (m - 50) * 35;
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
