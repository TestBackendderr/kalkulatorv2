/**
 * Pobieranie PDF wyceny z backendu (generacja po stronie serwera).
 */

import api from "@/utils/axiosInstance";
import { buildKalkulatorWycenaFilename } from "@/utils/kalkulatorWycenaFilename";

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "wycena.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getHeader(response, name) {
  const headers = response?.headers;
  if (!headers) return null;
  const lower = name.toLowerCase();
  if (typeof headers.get === "function") {
    return headers.get(name) || headers.get(lower) || null;
  }
  return headers[name] ?? headers[lower] ?? null;
}

function filenameFromResponse(response) {
  const fromCustom = getHeader(response, "X-Filename");
  if (fromCustom) return String(fromCustom);

  const cd = getHeader(response, "Content-Disposition");
  if (cd) {
    const utf = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    if (utf?.[1]) return decodeURIComponent(utf[1]);
    const ascii = /filename="([^"]+)"/i.exec(cd);
    if (ascii?.[1]) return ascii[1];
  }
  return null;
}

async function readBlobErrorMessage(blob) {
  try {
    const text = await blob.text();
    const json = JSON.parse(text);
    return json.message || json.error || text;
  } catch {
    return null;
  }
}

async function handlePdfResponse(response, fallbackFilename) {
  const contentType = getHeader(response, "Content-Type") || "";
  if (contentType.includes("application/json")) {
    const msg = await readBlobErrorMessage(response.data);
    throw new Error(msg || "Nie udało się wygenerować PDF");
  }
  const filename = filenameFromResponse(response) || fallbackFilename || "wycena.pdf";
  triggerBlobDownload(new Blob([response.data], { type: "application/pdf" }), filename);
}

/** Zapisuje kalkulację i pobiera PDF (POST /kalkulator/wyceny/generuj-pdf). */
export async function saveWycenaAndDownloadPdf(payload) {
  const fallbackFilename = buildKalkulatorWycenaFilename({
    fileId: null,
    clientName: payload.klientImie,
    clientSurname: payload.klientNazwisko,
    pdfDate: new Date(),
  });

  try {
    const response = await api.post("/kalkulator/wyceny/generuj-pdf", payload, {
      responseType: "blob",
    });
    const wycenaId = getHeader(response, "X-Wycena-Id");
    const filenameWithId =
      wycenaId != null
        ? buildKalkulatorWycenaFilename({
            fileId: Number(wycenaId) || wycenaId,
            clientName: payload.klientImie,
            clientSurname: payload.klientNazwisko,
            pdfDate: new Date(),
          })
        : fallbackFilename;
    await handlePdfResponse(response, filenameWithId);
    return wycenaId != null ? Number(wycenaId) || wycenaId : null;
  } catch (e) {
    if (e.response?.data instanceof Blob) {
      const msg = await readBlobErrorMessage(e.response.data);
      if (msg) throw new Error(msg);
    }
    throw e;
  }
}

/** PDF dla zapisanej wyceny (GET /kalkulator/wyceny/:id/pdf). */
export async function downloadWycenaPdf(wycenaId, clientHint = {}) {
  const fallbackFilename = buildKalkulatorWycenaFilename({
    fileId: wycenaId,
    clientName: clientHint.klientImie,
    clientSurname: clientHint.klientNazwisko,
    pdfDate: new Date(),
  });

  try {
    const response = await api.get(`/kalkulator/wyceny/${wycenaId}/pdf`, {
      responseType: "blob",
    });
    await handlePdfResponse(response, fallbackFilename);
  } catch (e) {
    if (e.response?.data instanceof Blob) {
      const msg = await readBlobErrorMessage(e.response.data);
      if (msg) throw new Error(msg);
    }
    throw e;
  }
}
