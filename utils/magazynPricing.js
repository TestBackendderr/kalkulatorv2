/**
 * Cennik progowy magazynu/falownika.
 *
 * cennikProgowy: step = od której sztuki obowiązuje cena (np. step 12 → od 12. falownika).
 * priceTiers (legacy): cena za 1., 2., 3. … sztukę po kolei; brakujące = ostatnia cena.
 */

/** Zwraca posortowany cennik progowy lub null, gdy go nie ma. */
export function normalizeCennikProgowy(item) {
  if (!item || !Array.isArray(item.cennikProgowy) || item.cennikProgowy.length === 0) {
    return null;
  }
  return [...item.cennikProgowy]
    .map((t) => ({
      step: parseInt(String(t.step), 10),
      priceNetto: Number(t.priceNetto),
    }))
    .filter((t) => t.step >= 1 && Number.isFinite(t.priceNetto) && t.priceNetto > 0)
    .sort((a, b) => a.step - b.step);
}

/** Płaska lista cen (do podglądu „od X zł”, stary format). */
export function normalizePriceTiers(item) {
  if (!item) return [];

  const prog = normalizeCennikProgowy(item);
  if (prog) return prog.map((t) => t.priceNetto);

  if (Array.isArray(item.priceTiers) && item.priceTiers.length > 0) {
    return item.priceTiers
      .map((p) => Number(p))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  const single = Number(item.priceNetto);
  return Number.isFinite(single) && single > 0 ? [single] : [];
}

/**
 * Cena za sztukę na pozycji `position` (1-based).
 * cennikProgowy: ostatni próg z step ≤ position.
 * priceTiers: cena dla N-tej sztuki (indeks N-1, potem ostatnia).
 */
export function getUnitPriceAtStep(item, position) {
  if (position < 1) return 0;

  const prog = normalizeCennikProgowy(item);
  if (prog) {
    let price = prog[0].priceNetto;
    for (const t of prog) {
      if (t.step <= position) price = t.priceNetto;
      else break;
    }
    return price;
  }

  const tiers = normalizePriceTiers(item);
  if (!tiers.length) return 0;
  const idx = Math.min(position - 1, tiers.length - 1);
  return tiers[idx];
}

/** @deprecated Użyj getUnitPriceAtStep(item, position) */
export function getUnitPriceAtPosition(tiers, position) {
  return getUnitPriceAtStep({ priceTiers: tiers }, position);
}

/** Ceny za każdą sztukę (długość = quantity). */
export function getTierUnitPrices(item, quantity) {
  const qty = Math.max(0, parseInt(String(quantity), 10) || 0);
  if (qty < 1) return [];
  return Array.from({ length: qty }, (_, i) => getUnitPriceAtStep(item, i + 1));
}

export function calcTieredTotal(magazyn, quantity) {
  return getTierUnitPrices(magazyn, quantity).reduce((s, p) => s + p, 0);
}

/** Lista pozycji cennika do UI. */
export function formatTierCatalogLines(item, fmt, maxLines = 12, unitLabel = "bateria") {
  const prog = normalizeCennikProgowy(item);
  if (prog) {
    const limit = Math.min(prog.length, maxLines);
    return prog.slice(0, limit).map((t) => ({
      position: t.step,
      price: t.priceNetto,
      label: fmt
        ? `od ${t.step}. ${unitLabel} — ${fmt(t.priceNetto)} zł`
        : `od ${t.step}. ${unitLabel} — ${t.priceNetto} zł`,
    }));
  }

  const tiers = normalizePriceTiers(item);
  const limit = Math.min(tiers.length, maxLines);
  return tiers.slice(0, limit).map((price, index) => ({
    position: index + 1,
    price,
    label: fmt
      ? `${index + 1}. ${unitLabel} — ${fmt(price)} zł`
      : `${index + 1}. ${unitLabel} — ${price} zł`,
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
