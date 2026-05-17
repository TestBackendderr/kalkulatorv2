/**
 * Cennik progowy falownika + sumowanie mocy (Moc łącznie).
 */

import {
  normalizePriceTiers,
  getTierUnitPrices,
  formatTierBreakdown,
  formatTierCatalogLines,
} from "./magazynPricing";

export { normalizePriceTiers, formatTierBreakdown };

export function getFalownikUnitMocKw(falownikMocPaneliKw, falownikData) {
  const p = parseFloat(String(falownikMocPaneliKw ?? "").replace(",", "."));
  if (Number.isFinite(p) && p > 0) return p;
  return Number(falownikData?.powerKw) || 0;
}

export function computeFalownikLine(falownik, quantity, unitMocKw) {
  const qty = Math.max(1, parseInt(String(quantity), 10) || 1);
  const unitPowerKw = Number(falownik?.powerKw) || 0;
  const mocUnit = Number(unitMocKw) > 0 ? Number(unitMocKw) : unitPowerKw;
  const unitPrices = getTierUnitPrices(falownik, qty);
  const totalPrice = unitPrices.reduce((s, p) => s + p, 0);

  return {
    quantity: qty,
    unitPowerKw,
    unitMocKw: mocUnit,
    totalPowerKw: Math.round(mocUnit * qty * 100) / 100,
    unitPrices,
    totalPrice,
    priceTiers: normalizePriceTiers(falownik),
    firstUnitPrice: normalizePriceTiers(falownik)[0] ?? 0,
  };
}

export function normalizeFalownikRecord(falownik) {
  if (!falownik) return falownik;
  const priceTiers = normalizePriceTiers(falownik);
  return {
    ...falownik,
    priceTiers,
    priceNetto: priceTiers[0] ?? (Number(falownik.priceNetto) || 0),
  };
}

export function formatFalownikTierCatalogLines(falownik, fmt, maxLines = 12) {
  return formatTierCatalogLines(falownik, fmt, maxLines, "falownik");
}
