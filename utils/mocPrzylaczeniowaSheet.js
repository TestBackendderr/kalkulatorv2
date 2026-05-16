/**
 * Formuła z arkusza „Kalkulator-sumowania-mocy.xlsx" (komórka A10):
 *   JEŻELI(LUB(A8 < B8; A8 < C8); A8 + C8; A8)
 *
 * A8 — moc instalacji fotowoltaicznej (kWp): istniejące kWp + nowe panele
 * B8 — moc zainstalowanego inwertera (kW)
 * C8 — moc zainstalowanego magazynu energii (kW) = moc jednostki × ilość
 *
 * Wynik (A10) = efektywna moc do porównania z limitem mocy przyłączeniowej.
 * D10: "NASTĄPI ZSUMOWANIE…" gdy wynik = A8 + C8, inaczej "NIE NASTĄPI…"
 */

/**
 * @param {number} pvKwp   — A8
 * @param {number} invKw   — B8
 * @param {number} storKw  — C8
 * @returns {{ effectivePower: number, willSum: boolean }}
 */
export function calcEffectivePower(pvKwp, invKw, storKw) {
  const a8 = Number(pvKwp) || 0;
  const b8 = Number(invKw) || 0;
  const c8 = Number(storKw) || 0;
  const willSum = a8 < b8 || a8 < c8;
  const effectivePower = willSum ? a8 + c8 : a8;
  return { effectivePower, willSum, a8, b8, c8 };
}

/**
 * Buduje A8/B8/C8 z danych kalkulatora i liczy efektywną moc.
 */
export function computeEffectivePower({
  existingPvKwp,
  panelCount,
  panelData,
  falownikMocPaneliKw,
  falownikData,
  magazynData,
  magazynIlosc,
}) {
  const pvKwp = parseFloat(String(existingPvKwp ?? "").replace(",", ".")) || 0;
  const count = parseInt(String(panelCount ?? ""), 10) || 0;
  const newPanelsKwp =
    count > 0 && panelData ? (count * (Number(panelData.powerW) || 0)) / 1000 : 0;
  const a8 = pvKwp + newPanelsKwp;

  const falParsed = parseFloat(String(falownikMocPaneliKw ?? "").replace(",", "."));
  const b8 =
    Number.isFinite(falParsed) && falParsed > 0
      ? falParsed
      : Number(falownikData?.powerKw) || 0;

  const meSzt = magazynData ? Math.max(1, parseInt(String(magazynIlosc ?? 1), 10) || 1) : 0;
  const unitMeKw =
    Number(magazynData?.unitPowerKw ?? magazynData?.mocJednostkowaKw) ||
    Number(magazynData?.powerKw) ||
    0;
  const c8 = magazynData && meSzt > 0 ? unitMeKw * meSzt : 0;

  return { ...calcEffectivePower(a8, b8, c8), a8, b8, c8, newPanelsKwp, pvKwp };
}
