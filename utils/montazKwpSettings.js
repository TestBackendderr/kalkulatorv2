const LS_MONTAZ_KWP = "kalk-montaz-kwp-tiers";

export const DEFAULT_MONTAZ_KWP_TIERS = [
  { id: "m1", odKwp: 0, doKwp: 1, cenaZaKwp: 1000, isActive: true },
  { id: "m2", odKwp: 1.01, doKwp: 3, cenaZaKwp: 700, isActive: true },
  { id: "m3", odKwp: 3.01, doKwp: 5, cenaZaKwp: 600, isActive: true },
  { id: "m4", odKwp: 5.01, doKwp: 10, cenaZaKwp: 500, isActive: true },
  { id: "m5", odKwp: 10.01, doKwp: 999, cenaZaKwp: 450, isActive: true },
];

function readJson(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Mapowanie z API CenaMontazu (odKw, doKw, priceNetto). */
export function normalizeMontazKwpFromApi(rows) {
  return (rows || []).map((r) => ({
    id: r.id,
    odKwp: Number(r.odKw ?? r.odKwp) ?? 0,
    doKwp: Number(r.doKw ?? r.doKwp) ?? 0,
    cenaZaKwp: Number(r.priceNetto ?? r.cenaZaKwp) ?? 0,
    isActive: r.isActive !== false,
  }));
}

export function syncMontazKwpCache(apiRows) {
  const normalized = normalizeMontazKwpFromApi(apiRows);
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_MONTAZ_KWP, JSON.stringify(normalized));
  }
  return normalized;
}

export function loadMontazKwpTiers() {
  if (typeof window === "undefined") return DEFAULT_MONTAZ_KWP_TIERS.map((t) => ({ ...t }));
  const raw = localStorage.getItem(LS_MONTAZ_KWP);
  if (raw === null) return DEFAULT_MONTAZ_KWP_TIERS.map((t) => ({ ...t }));
  try {
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return [];
    return saved.map((t, i) => ({
      id: t.id ?? `m${i}`,
      odKwp: Number(t.odKwp ?? t.odKw) ?? 0,
      doKwp: Number(t.doKwp ?? t.doKw) ?? 0,
      cenaZaKwp: Number(t.cenaZaKwp ?? t.priceNetto) ?? 0,
      isActive: t.isActive !== false,
    }));
  } catch {
    return [];
  }
}

function fmtKwpNum(n) {
  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatMontazKwpZakres(odKwp, doKwp) {
  const from = Number(odKwp);
  const to = Number(doKwp);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "—";
  if (from === 0) return `do ${fmtKwpNum(to)} kWp`;
  return `${fmtKwpNum(from)}–${fmtKwpNum(to)} kWp`;
}

function matchesKwpRange(odKwp, doKwp, kwp) {
  const from = Number(odKwp);
  const to = Number(doKwp);
  const k = Number(kwp);
  if (from === 0) return k >= 0 && k <= to;
  return k > from && k <= to;
}

/** Montaż PV = kWp × stawka z jednego progu (bez dzielenia progowo). */
export function computeMontazKwpQuote(kwp) {
  const k = Number(kwp) || 0;
  if (k <= 0) {
    return { kwp: 0, cenaZaKwp: 0, total: 0, zakresLabel: null, isValid: false };
  }

  const tiers = loadMontazKwpTiers()
    .filter((t) => t.isActive !== false)
    .sort((a, b) => Number(a.odKwp) - Number(b.odKwp));

  const match = tiers.find((t) => matchesKwpRange(t.odKwp, t.doKwp, k));
  if (!match) {
    return { kwp: k, cenaZaKwp: 0, total: 0, zakresLabel: null, isValid: false };
  }

  const cenaZaKwp = Number(match.cenaZaKwp) || 0;
  const total = Math.round(k * cenaZaKwp * 100) / 100;

  return {
    kwp: k,
    cenaZaKwp,
    total,
    zakresLabel: formatMontazKwpZakres(match.odKwp, match.doKwp),
    isValid: cenaZaKwp > 0,
  };
}
