/**
 * Nazwa pliku PDF wyceny — ta sama logika co na backendzie (kalkulator-wycena-filename.ts).
 * Format: wycena-{id}-{imie}-{nazwisko}-{dd-mm-rrrr}-{hhmm}.pdf
 */

const WARSAW_TZ = "Europe/Warsaw";

export function transliteratePlToAscii(s) {
  return String(s ?? "")
    .replace(/ą/g, "a").replace(/Ą/g, "A")
    .replace(/ę/g, "e").replace(/Ę/g, "E")
    .replace(/ó/g, "o").replace(/Ó/g, "O")
    .replace(/ś/g, "s").replace(/Ś/g, "S")
    .replace(/ź/g, "z").replace(/Ź/g, "Z")
    .replace(/ż/g, "z").replace(/Ż/g, "Z")
    .replace(/ć/g, "c").replace(/Ć/g, "C")
    .replace(/ń/g, "n").replace(/Ń/g, "N")
    .replace(/ł/g, "l").replace(/Ł/g, "L");
}

export function slugClientPart(value, fallback = "") {
  return transliteratePlToAscii(String(value || fallback))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatPdfDateParts(pdfDate) {
  const dateStr = pdfDate.toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: WARSAW_TZ,
  });
  const timeStr = pdfDate.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: WARSAW_TZ,
  });
  return { dateStr, timeStr };
}

export function buildKalkulatorWycenaFilename({ fileId, clientName, clientSurname, pdfDate }) {
  const uid =
    fileId != null ? String(fileId) : String(Math.floor(100000 + Math.random() * 900000));
  const imie = slugClientPart(clientName, "klient");
  const nazw = slugClientPart(clientSurname, "");
  const { dateStr, timeStr } = formatPdfDateParts(pdfDate ?? new Date());
  const datePart = dateStr.replace(/\./g, "-");
  const timePart = timeStr.replace(/:/g, "");
  return `wycena-${uid}-${imie}-${nazw}-${datePart}-${timePart}.pdf`;
}
