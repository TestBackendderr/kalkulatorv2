import React from "react";
import KartaKatalogowaOpenLink from "@/components/kalkulator/KartaKatalogowaOpenLink";

/** Komórka tabeli katalogu: link do PDF lub „—”. */
export default function KartaKatalogowaTableCell({ url }) {
  if (!url?.trim()) {
    return <td className="usk-td-karta">—</td>;
  }
  return (
    <td className="usk-td-karta">
      <KartaKatalogowaOpenLink url={url} />
    </td>
  );
}
