const LS_MARZA_KONCOWA = "kalk-marza-koncowa";

export const DEFAULT_MARZA_KONCOWA_PERCENT = 0;

function readJson(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Zapis po pobraniu z API (GET /marza-koncowa/aktualna). */
export function syncMarzaKoncowaCache(record) {
  const percent = record != null ? Number(record.wartosc ?? record.percent) : 0;
  const payload = {
    percent: Number.isFinite(percent) && percent >= 0 ? percent : 0,
    id: record?.id ?? null,
  };
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_MARZA_KONCOWA, JSON.stringify(payload));
  }
  return payload;
}

export function loadMarzaKoncowaPercent() {
  if (typeof window === "undefined") return DEFAULT_MARZA_KONCOWA_PERCENT;
  const raw = localStorage.getItem(LS_MARZA_KONCOWA);
  if (raw === null) return DEFAULT_MARZA_KONCOWA_PERCENT;
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && data.percent != null) {
      const n = Number(data.percent);
      return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MARZA_KONCOWA_PERCENT;
    }
    const n = parseFloat(String(data).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MARZA_KONCOWA_PERCENT;
  } catch {
    return DEFAULT_MARZA_KONCOWA_PERCENT;
  }
}

export function loadMarzaKoncowaMeta() {
  const data = readJson(LS_MARZA_KONCOWA);
  if (data && typeof data === "object") {
    return { id: data.id ?? null, percent: loadMarzaKoncowaPercent() };
  }
  return { id: null, percent: DEFAULT_MARZA_KONCOWA_PERCENT };
}

export function computeMarzaKoncowa(baseNetto) {
  const base = Number(baseNetto) || 0;
  const percent = loadMarzaKoncowaPercent();
  if (percent <= 0 || base <= 0) {
    return { percent: 0, kwota: 0, razemPoMarzy: base };
  }
  const kwota = Math.round((base * percent) / 100 * 100) / 100;
  return {
    percent,
    kwota,
    razemPoMarzy: Math.round((base + kwota) * 100) / 100,
  };
}
