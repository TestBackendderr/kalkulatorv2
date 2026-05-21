const LS_DODATKOWE_PRODUKTY = "kalk-dodatkowe-produkty";

function readJson() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_DODATKOWE_PRODUKTY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function loadDodatkoweProdukty() {
  return readJson().map((item, i) => ({
    id: item.id ?? `dp${i}`,
    name: String(item.name ?? "").trim(),
    priceNetto: Number(item.priceNetto) || 0,
    isActive: item.isActive !== false,
  }));
}

export function saveDodatkoweProdukty(items) {
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_DODATKOWE_PRODUKTY, JSON.stringify(items));
  }
}

export function loadActiveDodatkoweProdukty() {
  return loadDodatkoweProdukty().filter((p) => p.isActive !== false && p.name);
}
