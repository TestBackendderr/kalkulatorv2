/**
 * Cennik progowy falowników — persystencja po stronie frontu (API trzyma tylko priceNetto).
 */

const STORAGE_KEY = "kalk_falownik_price_tiers_v1";

function readMap() {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getStoredFalownikTiers(id) {
  const tiers = readMap()[String(id)];
  if (!Array.isArray(tiers)) return null;
  return tiers.map((p) => Number(p)).filter((n) => Number.isFinite(n) && n > 0);
}

export function saveFalownikPriceTiers(id, tiers) {
  const map = readMap();
  const normalized = (tiers || []).map((p) => Number(p)).filter((n) => n > 0);
  if (!normalized.length) {
    delete map[String(id)];
  } else {
    map[String(id)] = normalized;
  }
  writeMap(map);
}

export function mergeFalownikCatalogItem(item) {
  if (!item?.id) return item;
  const stored = getStoredFalownikTiers(item.id);
  if (stored?.length) {
    return { ...item, priceTiers: stored };
  }
  return item;
}

export function mergeFalownikCatalog(items) {
  return (items || []).map(mergeFalownikCatalogItem);
}
