import React, { useState } from "react";
import { toast } from "react-toastify";
import { downloadKartaKatalogowaUrl } from "@/utils/kartaKatalogowaApi";

/**
 * Link / przycisk pobierający kartę PDF (przez API + S3).
 */
export default function KartaKatalogowaOpenLink({
  url,
  downloadFilename,
  className = "usk-karta-table-link",
  children = "PDF",
  asButton = false,
  buttonClassName = "usk-btn usk-btn--sm usk-btn--primary",
}) {
  const [busy, setBusy] = useState(false);

  const handleClick = async (e) => {
    e.preventDefault();
    if (!url || busy) return;
    setBusy(true);
    try {
      await downloadKartaKatalogowaUrl(url, downloadFilename);
    } catch (err) {
      toast.error(err?.message || "Nie udało się pobrać karty PDF");
    } finally {
      setBusy(false);
    }
  };

  if (asButton) {
    return (
      <button
        type="button"
        className={buttonClassName}
        disabled={busy}
        onClick={handleClick}
      >
        {busy ? "Pobieranie…" : children}
      </button>
    );
  }

  return (
    <a
      href={url}
      className={className}
      onClick={handleClick}
      title="Pobierz kartę katalogową"
    >
      {busy ? "…" : children}
    </a>
  );
}
