/** Polskie etykiety pól z API (class-validator). */
const FIELD_LABELS_PL = {
  name: "Nazwa",
  compatibility: "Kompatybilność",
  capacityKwh: "Pojemność (kWh)",
  powerKw: "Moc (kW)",
  powerW: "Moc (W)",
  priceNetto: "Cena netto",
  wagaKg: "Waga (kg)",
  typ: "Typ",
  step: "Krok cennika",
  cennikProgowy: "Cennik progowy",
  falownikiIds: "Falowniki",
  isActive: "Status",
};

/**
 * Tłumaczy pojedynczą linię błędu walidacji NestJS (class-validator) na polski.
 * Zwraca null dla zduplikowanych / technicznych komunikatów (np. "conforming to constraints").
 */
function translateValidationLine(line) {
  const s = String(line ?? "").trim();
  if (!s) return null;

  const mustBe = /^(\w+)\s+must be\s+(.+)$/i.exec(s);
  if (mustBe) {
    const fieldKey = mustBe[1];
    const field = FIELD_LABELS_PL[fieldKey] || fieldKey;
    const constraint = mustBe[2].toLowerCase();

    if (constraint.includes("positive")) {
      return `${field}: podaj wartość większą od 0`;
    }
    if (constraint.includes("not be empty") || constraint.includes("should not be empty")) {
      return `${field}: pole wymagane`;
    }
    if (constraint.includes("conforming to the specified constraints")) {
      return `${field}: podaj poprawną liczbę`;
    }
    return `${field}: nieprawidłowa wartość`;
  }

  if (/should not be empty/i.test(s)) {
    const emptyField = /^(\w+)\s+should not be empty/i.exec(s);
    if (emptyField) {
      const field = FIELD_LABELS_PL[emptyField[1]] || emptyField[1];
      return `${field}: pole wymagane`;
    }
  }

  return s;
}

/**
 * Czytelny komunikat z odpowiedzi API (400 walidacja, 409, itd.).
 * @param {unknown} error — błąd z axios
 * @param {string} fallback — domyślny tekst
 */
export function formatApiErrorMessage(error, fallback = "Wystąpił błąd") {
  if (!error) return fallback;

  const data = error?.response?.data;
  const message = data?.message ?? data?.error;

  if (Array.isArray(message)) {
    const translated = message.map(translateValidationLine).filter(Boolean);
    const byField = new Map();
    for (const line of translated) {
      const fieldKey = line.split(":")[0];
      if (!byField.has(fieldKey)) byField.set(fieldKey, line);
    }
    const unique = [...byField.values()];
    if (unique.length) return unique.join(". ");
  }

  if (typeof message === "string" && message.trim()) {
    const one = translateValidationLine(message);
    return one || message;
  }

  if (typeof error?.message === "string" && error.message && !error.response) {
    return error.message;
  }

  return fallback;
}
