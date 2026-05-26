/**
 * Zbiera listę sprzętu zaproponowanego w zapisanej wycenie (do oferty / PDF).
 * @param {object} data — pole `data` z KalkulatorWycena
 * @returns {{ typ: string, nazwa: string, szczegoly?: string, kartaKatalogowaUrl?: string }[]}
 */
export function collectSprzetZaproponowany(data) {
  if (!data || typeof data !== "object") return [];

  const out = [];
  const push = (typ, nazwa, szczegoly, kartaKatalogowaUrl) => {
    const name = String(nazwa ?? "").trim();
    if (!name) return;
    out.push({
      typ,
      nazwa: name,
      ...(szczegoly ? { szczegoly: String(szczegoly) } : {}),
      ...(kartaKatalogowaUrl ? { kartaKatalogowaUrl: String(kartaKatalogowaUrl) } : {}),
    });
  };

  const panele = data.panele;
  if (panele?.opcja && panele.opcja !== "none") {
    if (panele.panel?.nazwa) {
      push(
        "Panel PV",
        panele.panel.nazwa,
        panele.liczba ? `${panele.liczba} szt.` : undefined,
        panele.panel.kartaKatalogowaUrl,
      );
    } else if (panele.panelWlasny) {
      const nazwa =
        panele.panelWlasny.nazwa?.trim() ||
        (panele.panelWlasny.mocW ? `Panel ${panele.panelWlasny.mocW} W` : "Panel własny");
      push(
        "Panel PV",
        nazwa,
        panele.liczba ? `${panele.liczba} szt.` : undefined,
        panele.panelWlasny.kartaKatalogowaUrl,
      );
    }
    const opt = panele.optymalizator;
    if (opt?.nazwa && (opt.ilosc ?? 0) > 0) {
      push(
        "Optymalizator",
        opt.nazwa,
        `${opt.ilosc} szt.`,
        opt.kartaKatalogowaUrl,
      );
    }
  }

  const f = data.falownik;
  if (f?.falownik?.nazwa) {
    push(
      "Falownik",
      f.falownik.nazwa,
      f.iloscSzt ? `${f.iloscSzt} szt.` : undefined,
      f.falownik.kartaKatalogowaUrl,
    );
  }

  const me = data.magazynEnergii;
  if (me?.nazwa) {
    push(
      "Magazyn energii",
      me.nazwa,
      me.ilosc ? `${me.ilosc} szt.` : undefined,
      me.kartaKatalogowaUrl,
    );
  }

  const kd = data.kosztDodatkowe;
  if (kd?.klimatyzator?.montaz === "tak" && Array.isArray(kd.klimatyzator.urzadzenia)) {
    for (const u of kd.klimatyzator.urzadzenia) {
      push(
        "Klimatyzator",
        u.nazwa,
        u.ilosc ? `${u.ilosc} szt.` : undefined,
        u.kartaKatalogowaUrl,
      );
    }
  }
  if (kd?.ladowarkaSamochodowa?.montaz === "tak" && Array.isArray(kd.ladowarkaSamochodowa.urzadzenia)) {
    for (const u of kd.ladowarkaSamochodowa.urzadzenia) {
      push(
        "Ładowarka samochodowa",
        u.nazwa,
        u.ilosc ? `${u.ilosc} szt.` : undefined,
        u.kartaKatalogowaUrl,
      );
    }
  }
  if (kd?.dodatkoweProdukty?.wybor === "tak" && Array.isArray(kd.dodatkoweProdukty.pozycje)) {
    for (const p of kd.dodatkoweProdukty.pozycje) {
      push(
        "Dodatkowy produkt",
        p.nazwa,
        p.ilosc ? `${p.ilosc} szt.` : undefined,
        p.kartaKatalogowaUrl,
      );
    }
  }

  if (Array.isArray(data.sprzetZaproponowany) && data.sprzetZaproponowany.length > 0) {
    return data.sprzetZaproponowany;
  }

  return out;
}
