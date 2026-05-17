const LS_MARZA_KONCOWA = "kalk-marza-koncowa-percent";

export const DEFAULT_MARZA_KONCOWA_PERCENT = 0;

export function loadMarzaKoncowaPercent() {
  if (typeof window === "undefined") return DEFAULT_MARZA_KONCOWA_PERCENT;
  try {
    const raw = localStorage.getItem(LS_MARZA_KONCOWA);
    if (raw === null || raw === "") return DEFAULT_MARZA_KONCOWA_PERCENT;
    const n = parseFloat(String(raw).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MARZA_KONCOWA_PERCENT;
  } catch {
    return DEFAULT_MARZA_KONCOWA_PERCENT;
  }
}

export function saveMarzaKoncowaPercent(percent) {
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_MARZA_KONCOWA, String(percent));
  }
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
