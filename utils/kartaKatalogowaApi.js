import api from "@/utils/axiosInstance";
import { formatApiErrorMessage } from "@/utils/apiError";

/**
 * @param {string} entityType falownik|panel|magazyn|klimatyzator|optymalizator|ladowarka|dodatkowy-produkt
 * @param {number} entityId
 * @param {File} file
 */
export async function uploadKartaKatalogowa(entityType, entityId, file) {
  const form = new FormData();
  form.append("file", file);
  form.append("entityType", entityType);
  form.append("entityId", String(entityId));
  const res = await api.post("/storage/karta-katalogowa", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function clearKartaKatalogowa(entityType, entityId) {
  await api.delete("/storage/karta-katalogowa", {
    data: { entityType, entityId },
  });
}

export function extractApiError(err, fallback) {
  return formatApiErrorMessage(err, fallback);
}

function parseFilenameFromContentDisposition(header) {
  if (!header) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1].trim());
    } catch {
      return utf8[1].trim();
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

/** Pobiera PDF z API i zapisuje na dysk użytkownika. */
export async function downloadKartaKatalogowaUrl(storedUrl, filenameHint) {
  if (!storedUrl?.trim()) return;

  const res = await api.get("/storage/karta-katalogowa/download", {
    params: { url: storedUrl.trim() },
    responseType: "blob",
  });

  const fromHeader = parseFilenameFromContentDisposition(
    res.headers["content-disposition"],
  );
  const filename = fromHeader || filenameHint || "karta-katalogowa.pdf";

  const blob = new Blob([res.data], { type: "application/pdf" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

/** @deprecated użyj downloadKartaKatalogowaUrl */
export async function openKartaKatalogowaUrl(storedUrl, filenameHint) {
  return downloadKartaKatalogowaUrl(storedUrl, filenameHint);
}
