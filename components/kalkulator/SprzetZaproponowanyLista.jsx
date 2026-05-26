import React from "react";
import { collectSprzetZaproponowany } from "@/utils/sprzetZaproponowany";
import KartaKatalogowaOpenLink from "@/components/kalkulator/KartaKatalogowaOpenLink";

/**
 * Lista sprzętu zaproponowanego z linkami do kart katalogowych PDF.
 */
export default function SprzetZaproponowanyLista({
  data,
  className = "",
  subtitle = "Karty katalogowe — proponowany sprzęt",
}) {
  const items = collectSprzetZaproponowany(data).filter((item) =>
    Boolean(item.kartaKatalogowaUrl?.trim()),
  );
  if (!items.length) return null;

  return (
    <div className={`kalk-karty-box ${className}`.trim()}>
      <p className="kalk-karty-box-title">{subtitle}</p>
      <ul className="kalk-karty-list">
        {items.map((item, idx) => (
          <li key={`${item.typ}-${item.nazwa}-${idx}`} className="kalk-karty-card">
            <div className="kalk-karty-card-body">
              <span className="kalk-karty-typ">{item.typ}</span>
              <span className="kalk-karty-nazwa">{item.nazwa}</span>
              {item.szczegoly && (
                <span className="kalk-karty-szczegoly">{item.szczegoly}</span>
              )}
            </div>
            <KartaKatalogowaOpenLink
              url={item.kartaKatalogowaUrl}
              downloadFilename={`${item.nazwa || "karta"}.pdf`}
              asButton
              buttonClassName="kalk-karty-pdf-btn"
            >
              Pobierz PDF
            </KartaKatalogowaOpenLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
