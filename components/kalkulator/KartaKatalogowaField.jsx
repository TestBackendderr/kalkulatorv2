import React, { useRef } from "react";
import { toast } from "react-toastify";
import KartaKatalogowaOpenLink from "@/components/kalkulator/KartaKatalogowaOpenLink";

/**
 * Pole wyboru karty katalogowej PDF (jak w mockupie: „Wybierz PDF” + podpowiedź).
 */
export default function KartaKatalogowaField({
  url,
  onUrlChange,
  pendingFile,
  onPendingFileChange,
  onRemove,
  disabled = false,
}) {
  const inputRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.warn("Dozwolony jest tylko plik PDF");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.warn("Plik PDF może mieć maks. 15 MB");
      return;
    }
    onPendingFileChange?.(file);
  };

  const handleClear = () => {
    onPendingFileChange?.(null);
    onUrlChange?.(null);
    onRemove?.();
  };

  const fileLabel = pendingFile?.name || (url ? "Karta katalogowa.pdf" : null);

  return (
    <div className="usk-karta-field">
      <label className="usk-label">Karta katalogowa (PDF)</label>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="usk-karta-input-hidden"
        onChange={handleFile}
        disabled={disabled}
      />

      <div className="usk-karta-picker">
        <button
          type="button"
          className="usk-karta-pick-btn"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Wybierz PDF
        </button>
        {fileLabel && (
          <div className="usk-karta-selected">
            {url && !pendingFile ? (
              <KartaKatalogowaOpenLink
                url={url}
                className="usk-karta-selected-name"
              >
                {fileLabel}
              </KartaKatalogowaOpenLink>
            ) : (
              <span className="usk-karta-selected-name">{fileLabel}</span>
            )}
            {!disabled && (
              <button
                type="button"
                className="usk-karta-clear"
                onClick={handleClear}
                aria-label="Usuń PDF"
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      <p className="usk-karta-hint">możesz wybrać przed zapisem (max 15 MB)</p>
    </div>
  );
}
