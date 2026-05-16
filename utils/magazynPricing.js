/**
 * Cennik progowy magazynu: cena za 1., 2., 3. … baterię.
 * Brakujące pozycje = ostatnia zdefiniowana cena.
 */

export function normalizePriceTiers(magazyn) {
  if (!magazyn) return [];
  const raw = magazyn.priceTiers;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((p) => Number(p)).filter((n) => Number.isFinite(n) && n > 0);
  }
  const single = Number(magazyn.priceNetto);
  return Number.isFinite(single) && single > 0 ? [single] : [];
}

export function getUnitPriceAtPosition(tiers, position) {
  const list = normalizePriceTiers({ priceTiers: tiers });
  if (!list.length || position < 1) return 0;
  const idx = Math.min(position - 1, list.length - 1);
  return list[idx];
}

/** Ceny za każdą sztukę (długość = quantity). */
export function getTierUnitPrices(magazyn, quantity) {
  const tiers = normalizePriceTiers(magazyn);
  const qty = Math.max(0, parseInt(String(quantity), 10) || 0);
  if (!tiers.length || qty < 1) return [];
  return Array.from({ length: qty }, (_, i) => getUnitPriceAtPosition(tiers, i + 1));
}

export function calcTieredTotal(magazyn, quantity) {
  return getTierUnitPrices(magazyn, quantity).reduce((s, p) => s + p, 0);
}

/** Lista pozycji cennika do UI: „1. bateria — 3 000 zł”. */
export function formatTierCatalogLines(magazyn, fmt, maxLines = 12) {
  const tiers = normalizePriceTiers(magazyn);
  const limit = Math.min(tiers.length, maxLines);
  return tiers.slice(0, limit).map((price, index) => ({
    position: index + 1,
    price,
    label: fmt
      ? `${index + 1}. bateria — ${fmt(price)} zł`
      : `${index + 1}. bateria — ${price} zł`,
  }));
}

export function formatTierBreakdown(unitPrices, fmt) {
  if (!unitPrices.length) return "";
  if (typeof fmt !== "function") {
    return unitPrices.map((p) => String(p)).join(" + ");
  }
  return unitPrices.map((p) => fmt(p)).join(" + ");
}

export function computeMagazynLine(magazyn, quantity) {
  const qty = Math.max(1, parseInt(String(quantity), 10) || 1);
  const unitCapacity = Number(magazyn?.capacityKwh) || 0;
  const unitPower = Number(magazyn?.powerKw) || 0;
  const unitWeight = magazyn?.wagaKg != null ? Number(magazyn.wagaKg) : null;
  const unitPrices = getTierUnitPrices(magazyn, qty);
  const totalPrice = unitPrices.reduce((s, p) => s + p, 0);

  return {
    quantity: qty,
    unitCapacityKwh: unitCapacity,
    unitPowerKw: unitPower,
    unitWeightKg: unitWeight,
    totalCapacityKwh: Math.round(unitCapacity * qty * 100) / 100,
    totalPowerKw: Math.round(unitPower * qty * 100) / 100,
    totalWeightKg: unitWeight != null ? Math.round(unitWeight * qty * 10) / 10 : null,
    unitPrices,
    totalPrice,
    priceTiers: normalizePriceTiers(magazyn),
    firstUnitPrice: normalizePriceTiers(magazyn)[0] ?? 0,
  };
}

export function normalizeMagazynRecord(magazyn) {
  if (!magazyn) return magazyn;
  const priceTiers = normalizePriceTiers(magazyn);
  return {
    ...magazyn,
    priceTiers,
    priceNetto: priceTiers[0] ?? (Number(magazyn.priceNetto) || 0),
  };
}
