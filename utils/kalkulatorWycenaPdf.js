/**
 * Wspólna generacja PDF wyceny kalkulatora (jsPDF) — formularz + zapisana kalkulacja z API.
 */

import { computeEffectivePower } from "./mocPrzylaczeniowaSheet.js";

const fmtPdf = (n) =>
  new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));

function pl(s) {
  return String(s ?? "")
    .replace(/ą/g, "a").replace(/Ą/g, "A").replace(/ę/g, "e").replace(/Ę/g, "E")
    .replace(/ó/g, "o").replace(/Ó/g, "O").replace(/ś/g, "s").replace(/Ś/g, "S")
    .replace(/ź/g, "z").replace(/Ź/g, "Z").replace(/ż/g, "z").replace(/Ż/g, "Z")
    .replace(/ć/g, "c").replace(/Ć/g, "C").replace(/ń/g, "n").replace(/Ń/g, "N")
    .replace(/ł/g, "l").replace(/Ł/g, "L");
}

/** Pusty / same myślniki — traktuj jak brak źródła (do podmiany z linii marketingu). */
function isBlankLeadSourceName(v) {
  const t = String(v ?? "").trim();
  if (!t) return true;
  return /^[—–\-−\s]+$/u.test(t);
}

/** Z JSON / API: string albo `{ name: "…" }`, nigdy "[object Object]". */
function coerceLeadSourceName(v) {
  if (v == null) return null;
  if (typeof v === "object" && v !== null && typeof v.name === "string") {
    const n = v.name.trim();
    return n || null;
  }
  const s = String(v).trim();
  if (!s || s === "[object Object]") return null;
  return s;
}

/**
 * Z linii wyceny: tekst po "Koszty marketingowe" i opcjonalnym `(50% – brak ME)`.
 * Obrywamy **tylko pierwszy** separator (opcj. spacje, myślnik en/em/ASCII/minus, opcj. spacje) —
 * reszta to już nazwa (może zawierać ` – ` lub ` - ` w środku, np. "CC - Nano Media D2D").
 */
function marketingLeadNameFromLines(lines) {
  if (!Array.isArray(lines)) return null;
  const hit = lines.find((l) => /koszty\s+marketingowe/i.test(String(l?.label ?? "")));
  if (!hit) return null;
  const label = String(hit.label);
  let tail = label.replace(/^[\s\S]*?Koszty\s+marketingowe\s*/i, "").trim();
  tail = tail.replace(/^\([^)]+\)\s*/, "").trim();
  tail = tail
    .replace(/^[\s\u00a0\u202f]*[\u2013\u2014\u002d\u2212][\s\u00a0\u202f]*/u, "")
    .trim();

  return tail || null;
}

function effectiveLeadSourceNameForPdf(leadSourceName, lines) {
  const direct = coerceLeadSourceName(leadSourceName);
  const fromLines = marketingLeadNameFromLines(lines);

  if (isBlankLeadSourceName(direct)) return fromLines || null;
  if (!fromLines) return direct;

  const d = direct.trim();
  const f = fromLines.trim();
  if (f === d) return direct;
  // Pełna etykieta z wiersza (np. "CC - …") zawiera zapisane w meta krótsze źródło.
  if (f.includes(d)) return fromLines;

  return direct;
}

/** Odpowiedź GET /kalkulator/wyceny/:id */
export function buildPdfContextFromSavedRecord(record, showAllPrices) {
  const d = record?.data;
  const w = d?.wycena;
  const ins = d?.instalacjaIstniejaca || {};
  const p = d?.panele || {};
  const f = d?.falownik || {};
  const k = d?.kosztDodatkowe || {};
  const leadSourceName = coerceLeadSourceName(
    d?.meta?.leadSourceName ??
      d?.meta?.leadSource?.name ??
      (typeof d?.meta?.leadSource === "string" ? d.meta.leadSource : null) ??
      d?.leadSourceName ??
      record?.leadSource?.name ??
      null
  );

  let hasPv = d?.meta?.hasPv;
  if (hasPv !== "tak" && hasPv !== "nie") {
    const anyExisting =
      Number(ins.mocPvKwp) > 0 ||
      Number(ins.magazynMocKw) > 0 ||
      Number(ins.magazynPojemnoscKwh) > 0;
    hasPv = anyExisting ? "tak" : "nie";
  }

  let panelData = null;
  if (p.panel)
    panelData = {
      name: p.panel.nazwa,
      powerW: p.panel.mocW,
      priceNetto: p.panel.cenaNetto,
    };
  else if (p.panelWlasny)
    panelData = {
      name: p.panelWlasny.nazwa
        ? String(p.panelWlasny.nazwa)
        : `Panel wlasny ${p.panelWlasny.mocW}W`,
      powerW: p.panelWlasny.mocW,
      priceNetto: p.panelWlasny.cenaNettoPrzyliczona,
    };

  const falownikData = f.falownik
    ? { name: f.falownik.nazwa, powerKw: f.falownik.mocKw, priceNetto: f.falownik.cenaNetto }
    : null;
  const magazynData = d?.magazynEnergii
    ? {
        name: d.magazynEnergii.nazwa,
        capacityKwh: d.magazynEnergii.pojemnoscKwh,
        powerKw: d.magazynEnergii.mocKw,
        priceNetto: d.magazynEnergii.cenaNetto,
        ilosc: d.magazynEnergii.ilosc ?? 1,
        jednostka: d.magazynEnergii.jednostka ?? "szt.",
      }
    : null;

  const vatRate = w?.vatProcent ?? 23;
  const rabatBrutto = Number(w?.rabatBrutto) || 0;
  const vatM = 1 + vatRate / 100;
  const rabatNetto =
    w?.rabatNetto != null ? Number(w.rabatNetto) : rabatBrutto > 0 ? rabatBrutto / vatM : 0;
  const totalBrutto = Number(w?.razemBrutto) || 0;
  const finalBrutto =
    w?.finalnaKlientBrutto != null
      ? Number(w.finalnaKlientBrutto)
      : totalBrutto - rabatBrutto;
  const wmExtra = Number(w?.marzaWmNetto) || 0;
  const adjustedWmNetto =
    w?.marzaWmPoRabacieNetto != null
      ? Number(w.marzaWmPoRabacieNetto)
      : wmExtra - rabatNetto;

  const lines = (w?.pozycje || []).map((x) => ({
    label: x.nazwa,
    value: x.kwotaNetto,
    note: x.notatka,
  }));

  const salesperson =
    record.createdBy?.name || record.createdBy?.email || "—";

  return {
    clientName: record.klientImie || "",
    clientSurname: record.klientNazwisko || "",
    salesperson,
    pdfDate: record.createdAt ? new Date(record.createdAt) : new Date(),
    fileId: record.id,
    offerNumber: record.numerOferty || (record.id != null ? `#${record.id}` : "—"),
    leadSourceName,
    hasPv,
    existingPvKwp: String(ins.mocPvKwp ?? ""),
    existingMePowerKw: String(ins.magazynMocKw ?? ""),
    existingMeCapacityKwh: String(ins.magazynPojemnoscKwh ?? ""),
    connectionKw: String(ins.mocPrzylaczeniowa ?? ""),
    panelOption: p.opcja ?? "",
    panelCount: String(p.liczba ?? ""),
    mountType: p.typMontazu || "dach",
    panelData,
    falownikAction: f.akcja || "",
    falownikData,
    magazynData,
    rozdzielnica: k.rozdzielnica || "nie",
    przekop: k.przekop || "nie",
    przekopMetry: String(k.przekopMetry ?? ""),
    klimatyzatorMontaz: k.klimatyzator?.montaz || "nie",
    klimatyzatorUrzadzenia: k.klimatyzator?.urzadzenia || [],
    wm: String(p.wm ?? ""),
    showAllPrices: !!showAllPrices,
    lines,
    total: Number(w?.razemNetto) || 0,
    wmExtra,
    vatRate,
    totalBrutto,
    rabatBrutto,
    rabatNetto,
    finalBrutto,
    adjustedWmNetto,
    connKw: Number(ins.mocPrzylaczeniowa) || 0,
    ...(() => {
      const connKwSaved = Number(ins.mocPrzylaczeniowa) || 0;
      const meSzt = magazynData ? Math.max(1, Number(magazynData.ilosc ?? 1) || 1) : 0;
      const { effectivePower, willSum, a8, b8, c8 } = computeEffectivePower({
        existingPvKwp: String(ins.mocPvKwp ?? ""),
        panelCount: String(p.liczba ?? ""),
        panelData,
        falownikMocPaneliKw: String(f.falownik?.mocKw ?? ""),
        falownikData,
        magazynData,
        magazynIlosc: meSzt,
      });
      return {
        effectivePower,
        willSum,
        pvKwpCalc: a8,
        falKwCalc: b8,
        meKwCalc: c8,
        canInstallWithoutUpgrade: connKwSaved > 0 ? effectivePower <= connKwSaved : null,
      };
    })(),
    falownikIloscSzt:
      Number(f?.iloscSzt) > 0 ? Number(f.iloscSzt) : 1,
  };
}

export async function renderKalkulatorWycenaPdfAndSave(ctx) {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const LM = 14;
  const RM = 196;
  const PW = RM - LM;
  let y = 18;

  const checkPage = (needed = 10) => {
    if (y + needed > 272) {
      doc.addPage();
      y = 18;
    }
  };

  const hd = (text, sz = 12) => {
    checkPage(sz * 0.5 + 5);
    doc.setFontSize(sz);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(pl(text), LM, y);
    y += sz * 0.5 + 3;
  };

  const rule = (color = [209, 213, 219]) => {
    checkPage(6);
    doc.setDrawColor(...color);
    doc.line(LM, y, RM, y);
    y += 4;
  };

  const row = (left, right, { bold = false, bg = null, leftColor = null, rightColor = null } = {}) => {
    const rh = 7;
    checkPage(rh);
    if (bg) {
      doc.setFillColor(...bg);
      doc.rect(LM, y - 5.2, PW, rh, "F");
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...(leftColor || [55, 65, 81]));
    doc.text(pl(String(left)), LM + 2, y);
    doc.setTextColor(...(rightColor || [55, 65, 81]));
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(pl(String(right)), RM - 2, y, { align: "right" });
    doc.setTextColor(55, 65, 81);
    y += rh;
  };

  // draw a form-style field box at an explicit position (for multi-column layout)
  const drawFieldAt = (label, value, x, fw, fy) => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(209, 213, 219);
    doc.roundedRect(x, fy - 4, fw, 12, 1, 1, "FD");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128);
    doc.text(pl(String(label)), x + 2, fy + 0.5);
    if (value) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39);
      doc.text(pl(String(value)), x + 2, fy + 7);
    }
  };

  const {
    clientName,
    clientSurname,
    salesperson,
    pdfDate,
    fileId,
    offerNumber,
    hasPv,
    leadSourceName,
    existingPvKwp,
    connectionKw,
    panelCount,
    mountType,
    panelData,
    falownikAction,
    falownikData,
    magazynData,
    rozdzielnica,
    przekop,
    przekopMetry,
    klimatyzatorMontaz,
    klimatyzatorUrzadzenia,
    panelOption,
    existingMePowerKw,
    existingMeCapacityKwh,
    showAllPrices,
    lines,
    total,
    wmExtra,
    vatRate,
    totalBrutto,
    rabatBrutto,
    rabatNetto,
    finalBrutto,
    adjustedWmNetto,
    canInstallWithoutUpgrade,
    effectivePower,
    connKw,
    willSum,
    pvKwpCalc,
    falKwCalc,
    meKwCalc,
    falownikIloscSzt,
  } = ctx;

  const displayLeadSource = effectiveLeadSourceNameForPdf(leadSourceName, lines) || null;

  const dateStr = pdfDate.toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = pdfDate.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

  const panelCountNum = parseInt(panelCount, 10) || 0;
  const panelPowerWNum = panelData?.powerW != null ? Number(panelData.powerW) : 0;
  const falIl = Math.max(1, parseInt(String(falownikIloscSzt ?? 1), 10) || 1);

  // =====================================================
  // PAGES 1-2: WYCENA
  // =====================================================

  // Header
  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(17, 24, 39);
  doc.text("Wycena instalacji fotowoltaicznej", LM, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(107, 114, 128);
  doc.text(`Data: ${dateStr}  ${timeStr}`, LM, y);
  doc.text(pl(`Nr oferty: ${offerNumber || "—"}`), RM, y, { align: "right" });
  doc.text(pl(`Źródło umowy: ${displayLeadSource || "—"}`), RM, y + 4, { align: "right" });
  y += 10;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(55, 65, 81);
  doc.text(pl(`Klient: ${clientName || "—"} ${clientSurname || ""}`), LM, y);
  doc.text(pl(`Handlowiec: ${salesperson}`), RM, y, { align: "right" });
  y += 6;
  rule();

  // ---- Wybrane parametry (compact krok style) ----
  hd("Wybrane parametry", 11);

  // krok sub-header: subtle gray band + bold label
  const krokHd = (title) => {
    checkPage(9);
    doc.setFillColor(235, 237, 242);
    doc.rect(LM, y - 5.5, PW, 7.5, "F");
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(pl(title), LM + 3, y);
    y += 8;
  };

  // compact info line
  const krokLine = (text) => {
    checkPage(5.5);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(55, 65, 81);
    doc.text(pl(text), LM + 5, y);
    y += 5.5;
  };

  const falActionLabel =
    falownikAction === "wymiana"
      ? (hasPv === "nie" ? "Montaż nowego falownika" : "Wymiana falownika")
      : falownikAction === "bez_wymiany"
        ? "Nie wymieniamy falownika"
        : "—";

  // Krok 1: Instalacja
  krokHd("Krok 1: Instalacja");
  if (displayLeadSource) krokLine(`Źródło umowy: ${displayLeadSource}`);
  krokLine(`Istniejąca instalacja PV: ${hasPv === "tak" ? "Tak" : "Nie"}`);
  if (hasPv === "tak") {
    if (existingPvKwp) krokLine(`Moc PV: ${existingPvKwp} kWp`);
    if (existingMePowerKw && existingMeCapacityKwh)
      krokLine(`Moc magazynu: ${existingMePowerKw} kW / ${existingMeCapacityKwh} kWh`);
  }
  krokLine(`Moc przyłączeniowa: ${connectionKw} kW`);
  y += 2;

  // Krok 2: Panele
  krokHd("Krok 2: Panele");
  const panelOptionLabel = {
    none: "Nie dokładamy",
    existing_chain: "Dokładamy na istniejącym łańcuchu",
    new_chain: "Dokładamy nowego łańcucha",
  }[panelOption] || panelOption;
  if (panelOption && panelOption !== "none") krokLine(`Opcja paneli: ${panelOptionLabel}`);
  krokLine(`Ilość paneli: ${panelCountNum || "—"}`);
  krokLine(`Montaż: ${mountType === "dach" ? "Dach" : mountType === "grunt" ? "Grunt" : mountType || "—"}`);
  if (panelData) {
    const pricePart = showAllPrices && panelData.priceNetto ? ` — ${fmtPdf(panelData.priceNetto)} zł/szt.` : "";
    krokLine(`Panel: ${panelData.name} (${panelData.powerW}W)${pricePart}`);
  }
  y += 2;

  // Krok 3: Falownik
  krokHd("Krok 3: Falownik");
  krokLine(`Tryb: ${falActionLabel}`);
  if (falownikData) {
    const fPrice = showAllPrices && falownikData.priceNetto ? ` — ${fmtPdf(falownikData.priceNetto)} zł` : "";
    krokLine(`${falownikData.name} (${falownikData.powerKw} kW)${fPrice}`);
    krokLine(`Moc falownika: ${falownikData.powerKw} kW`);
  }
  y += 2;

  // Krok 4: Magazyn Energii (opcjonalny)
  let krokN = 4;
  if (magazynData) {
    krokHd(`Krok ${krokN++}: Magazyn Energii`);
    krokLine(`${magazynData.name} x${magazynData.ilosc ?? 1}`);
    krokLine(`Ilość: ${magazynData.ilosc ?? 1} szt.`);
    if (magazynData.capacityKwh != null && magazynData.powerKw != null)
      krokLine(`Pojemność: ${magazynData.capacityKwh} kWh  Moc: ${magazynData.powerKw} kW`);
    if (showAllPrices && magazynData.priceNetto) krokLine(`${fmtPdf(magazynData.priceNetto)} zł`);
    y += 2;
  }

  // Krok 5 (lub 4): Koszty Dodatkowe
  krokHd(`Krok ${krokN}: Koszty Dodatkowe`);
  krokLine(`Przebudowa rozdzielnicy: ${rozdzielnica === "tak" ? "TAK" : "NIE"}`);
  krokLine(`Przekop: ${przekop === "tak" ? `TAK - ${przekopMetry} mb` : "NIE"}`);
  krokLine(`Klimatyzator: ${klimatyzatorMontaz === "tak" ? "TAK" : "NIE"}`);
  if (klimatyzatorMontaz === "tak" && Array.isArray(klimatyzatorUrzadzenia)) {
    klimatyzatorUrzadzenia.forEach((u) => {
      const name = u.nazwa || u.name || "—";
      const price = u.cenaNetto != null ? ` — ${fmtPdf(u.cenaNetto)} zł netto` : "";
      krokLine(`  • ${name}${price}`);
    });
  }

  y += 5;
  rule();

  // ---- Wycena ----
  hd("Wycena", 11);
  const wycenaLines = lines.filter((l) => !/^WM\s*\(/i.test(String(l?.label ?? "").trim()));
  if (showAllPrices) {
    row("Pozycja", "Kwota netto", { bold: true, bg: [219, 234, 254] });
    wycenaLines.forEach((l, i) =>
      row(
        `${l.label}${l.note ? ` (${l.note})` : ""}`,
        `${fmtPdf(l.value)} zl`,
        { bg: i % 2 === 0 ? [249, 250, 251] : null },
      ),
    );
    y += 1;
  }
  row("Razem netto", `${fmtPdf(total)} zł`, { bold: true, bg: [243, 244, 246] });
  row(`Razem brutto (${vatRate}% VAT)`, `${fmtPdf(totalBrutto)} zł`, {
    bold: true,
    bg: [243, 244, 246],
  });
  if (rabatBrutto > 0) {
    row("Rabat (brutto)", `- ${fmtPdf(rabatBrutto)} zł`, {
      bold: true,
      bg: [254, 242, 242],
      leftColor: [185, 28, 28],
      rightColor: [185, 28, 28],
    });
    row("Finalna cena dla klienta (brutto)", `${fmtPdf(finalBrutto)} zł`, {
      bold: true,
      bg: [240, 253, 244],
      leftColor: [21, 128, 61],
      rightColor: [21, 128, 61],
    });
  }

  // Marża WM przed/po rabacie (Handlowiec i Administrator)
  if (wmExtra > 0 || rabatBrutto > 0) {
    y += 2;
    row("WM przed rabatem", `${fmtPdf(wmExtra)} zł netto`, { bg: [249, 250, 251] });
    row("WM po rabacie", `${fmtPdf(adjustedWmNetto)} zł netto`, {
      bold: true,
      bg: [240, 253, 244],
      leftColor: [21, 128, 61],
      rightColor: [21, 128, 61],
    });
  }

  // ---- Rozliczenie rabatu (tylko Administrator) ----
  if (showAllPrices && rabatBrutto > 0) {
    y += 3;
    rule();
    hd("Rozliczenie rabatu", 11);
    const rd = [
      ["Rabat brutto", `${fmtPdf(rabatBrutto)} zł`],
      [`Rabat netto (przy ${vatRate}% VAT)`, `${fmtPdf(rabatNetto)} zł`],
    ];
    rd.forEach(([k, v], i) =>
      row(k, v, { bg: i % 2 === 0 ? [249, 250, 251] : null }),
    );
  }

  // ---- Moc przyłączeniowa (formuła: JEŻELI(LUB(A8<B8; A8<C8); A8+C8; A8)) ----
  y += 3;
  rule();
  hd("Moc przyłączeniowa", 11);
  checkPage(30);

  // Linia z wartościami A8 / B8 / C8
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(75, 85, 99);
  const meInfo = meKwCalc > 0 ? `  |  Magazyn : ${Number(meKwCalc).toFixed(2)} kW` : "";
  doc.text(
    pl(`Moc PV : ${Number(pvKwpCalc).toFixed(2)} kWp  |  Inwerter : ${Number(falKwCalc).toFixed(2)} kW${meInfo}`),
    LM, y,
  );
  y += 5.5;

  // Wynik zsumowania
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  if (willSum) {
    doc.setTextColor(180, 83, 9);
    doc.text(pl("Nastąpi zsumowanie mocy instalacji PV i magazynu energii."), LM, y);
  } else {
    doc.setTextColor(21, 128, 61);
    doc.text(pl("Nie nastąpi zsumowanie mocy instalacji PV i magazynu energii."), LM, y);
  }
  y += 6;

  // Wynik: instalacja OK / wymagane zwiększenie
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (canInstallWithoutUpgrade === true) {
    doc.setTextColor(21, 128, 61);
    doc.text(pl("Instalacja może być zamontowana bez zwiększania mocy przyłączeniowej."), LM, y);
    y += 6;
    doc.text(pl(`Efektywna moc: ${Number(effectivePower).toFixed(2)} kW <= limit ${Number(connKw)} kW`), LM, y);
    y += 6;
  } else if (canInstallWithoutUpgrade === false) {
    doc.setTextColor(185, 28, 28);
    doc.text(pl("Wymagane zwiększenie mocy przyłączeniowej."), LM, y);
    y += 6;
    doc.text(pl(`Efektywna moc: ${Number(effectivePower).toFixed(2)} kW > limit ${Number(connKw)} kW`), LM, y);
    y += 6;
  } else {
    doc.setTextColor(107, 114, 128);
    doc.text(pl("Nie podano mocy przyłączeniowej – wróć do kroku 1."), LM, y);
    y += 6;
  }

  // =====================================================
  // PAGE 3: PARAMETRY DO DODANIA UMOWY
  // =====================================================
  doc.addPage();
  y = 18;

  // Page title
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(17, 24, 39);
  doc.text("PARAMETRY DO DODANIA UMOWY", LM, y);
  y += 12;

  // Layout constants
  const FIELD_GAP = 15;
  const LBL_W = 68;           // label column width
  const INP_X = LM + LBL_W;  // input box start x
  const INP_W = RM - INP_X;   // input box width

  // ---- Helper: label + bordered input row ----
  const formRow = (label, value) => {
    const rowH = 10;
    checkPage(rowH + 3);
    // Label
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(75, 85, 99);
    doc.text(pl(label), LM, y);
    // Input box
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(209, 213, 219);
    doc.roundedRect(INP_X, y - 6.5, INP_W, rowH, 1, 1, "FD");
    if (value) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39);
      doc.text(pl(String(value)), INP_X + 3, y - 0.5);
    }
    y += rowH + 3;
  };

  // ---- Helper: section header row ----
  const secHeader = (text) => {
    checkPage(10);
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(pl(text), LM, y);
    y += 8;
  };

  // ---- Helper: full-width colored button ----
  const fwButton = (text, fillColor) => {
    checkPage(13);
    doc.setFillColor(...fillColor);
    doc.roundedRect(LM, y - 5, PW, 9, 2, 2, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(pl(text), LM + PW / 2, y + 1, { align: "center" });
    y += 13;
  };

  // ---- Single bordered block: Fotowoltaika + Pozostałe elementy ----
  const blockBorderStartY = y - 2;

  y += 3; // inner top padding

  // "Wybierz rodzaj instalacji" label + Fotowoltaika input field (left side)
  {
    const fieldW = 80;
    checkPage(14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(75, 85, 99);
    doc.text(pl("Wybierz rodzaj instalacji:"), LM, y);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.4);
    doc.roundedRect(LM, y + 2, fieldW, 9, 1.5, 1.5, "FD");
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(pl("Fotowoltaika"), LM + 4, y + 8);
    y += 18;
  }

  fwButton("Dodaj komponenty ręcznie", [22, 163, 74]);

  formRow("Model paneli", panelData?.name || "—");
  formRow("Moc pojedynczego panelu [W]", panelPowerWNum ? `${panelPowerWNum} W` : "—");
  formRow("Ilość paneli", panelCountNum ? String(panelCountNum) : "—");
  formRow("Model falownika", falownikData?.name || "—");
  formRow("Ilość falowników", String(falIl));
  const mocPaneliSumaKw =
    panelPowerWNum > 0 && panelCountNum > 0 ? (panelPowerWNum * panelCountNum) / 1000 : null;
  formRow(
    "Moc paneli [kW]",
    mocPaneliSumaKw != null
      ? `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(mocPaneliSumaKw)} kW`
      : "—",
  );

  y += 4;

  // ---- Section 2: Pozostale elementy zestawu (opcjonalnie) ----
  secHeader("Pozostałe elementy zestawu (opcjonalnie):");

  if (magazynData) {
    formRow("Typ", "Magazyn energii");
    formRow("Nazwa", pl(magazynData.name || "—"));
    formRow("Ilość", String(magazynData.ilosc ?? 1));
    formRow("Jednostka", String(magazynData.jednostka || "szt."));
  } else {
    formRow("Typ", "—");
    formRow("Nazwa", "—");
    formRow("Ilość", "—");
    formRow("Jednostka", "—");
  }

  // Small right-aligned "Zapisz" button
  {
    const btnW = 70;
    const btnH = 8;
    checkPage(btnH + 6);
    y += 4;
    doc.setFillColor(249, 115, 22);
    doc.roundedRect(RM - btnW, y - 5, btnW, btnH, 2, 2, "F");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(pl("Zapisz pozostały element zestawu"), RM - btnW / 2, y - 0.5, { align: "center" });
    y += btnH + 4;
  }

  // Draw gray border around the whole block (stroke only – drawn last so it sits on top)
  {
    const PAD = 4;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.8); // ~3px
    doc.roundedRect(LM - PAD, blockBorderStartY, PW + PAD * 2, y - blockBorderStartY, 3, 3, "S");
    doc.setLineWidth(0.4);
  }

  y += 4;

  // ---- Section 3: Recznie wprowadzone ceny z umowy ----
  secHeader("Ręcznie wprowadzone ceny z umowy:");

  const cenaBrutto = rabatBrutto > 0 ? finalBrutto : totalBrutto;
  const THIRD_W = (PW - 12) / 3;
  const priceFields = [
    ["Cena netto", `${fmtPdf(total)} zł`],
    ["VAT", `${vatRate}%`],
    ["Cena brutto", `${fmtPdf(cenaBrutto)} zł`],
  ];
  checkPage(16);
  priceFields.forEach(([lbl, val], i) => {
    const fx = LM + i * (THIRD_W + 6);
    drawFieldAt(lbl, val, fx, THIRD_W, y);
  });
  y += FIELD_GAP;

  // ---- Section 4: Wybierz rodzaj instalacji – Magazyn energii (new page) ----
  if (magazynData) {
    doc.addPage();
    y = 18;

    const magBlockStartY = y - 2;
    y += 3;

    secHeader("Wybierz rodzaj instalacji:");

    // small left-aligned "Magazyn energii" input field
    {
      const fieldW = 80;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(209, 213, 219);
      doc.setLineWidth(0.4);
      doc.roundedRect(LM, y - 4, fieldW, 9, 1.5, 1.5, "FD");
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39);
      doc.text(pl("Magazyn energii"), LM + 4, y + 1.5);
      y += 13;
    }

    // Green "Dodaj komponenty ręcznie" button below the input
    fwButton("Dodaj komponenty ręcznie", [22, 163, 74]);

    formRow("Typ", "Magazyn energii");
    formRow("Nazwa", pl(magazynData.name || "—"));
    formRow("Ilość", String(magazynData.ilosc ?? 1));
    formRow("Jednostka", String(magazynData.jednostka || "szt."));

    // Small right-aligned "Zapisz" button
    {
      const btnW = 70;
      const btnH = 8;
      y += 4;
      doc.setFillColor(249, 115, 22);
      doc.roundedRect(RM - btnW, y - 5, btnW, btnH, 2, 2, "F");
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(pl("Zapisz pozostały element zestawu"), RM - btnW / 2, y - 0.5, { align: "center" });
      y += btnH + 4;
    }

    // Gray border around the whole magazyn block
    {
      const PAD = 4;
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.8);
      doc.roundedRect(LM - PAD, magBlockStartY, PW + PAD * 2, y - magBlockStartY, 3, 3, "S");
      doc.setLineWidth(0.4);
    }
  }

  // =====================================================
  // INSTRUKCJA – pinned to the absolute bottom of the current page
  // =====================================================
  {
    const BOX_H = 24;
    const BOX_Y = 297 - 14 - BOX_H; // 14 mm bottom margin
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(251, 191, 36);
    doc.setLineWidth(0.4);
    doc.roundedRect(LM - 2, BOX_Y, PW + 4, BOX_H, 2, 2, "FD");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(92, 47, 6);
    doc.text(
      pl('JEŻELI PO DODANIU UMOWY W SEKCJI "ZESTAW"'),
      LM + 2,
      BOX_Y + 8,
    );
    doc.text(
      pl("NIE MA DODANEGO SPRZĘTU - DODAJ GO RĘCZNIE"),
      LM + 2,
      BOX_Y + 16,
    );
  }

  // =====================================================
  // NOWA STRONA: 3 DODAJ ELEMENT BLOCKS
  // =====================================================
  doc.addPage();
  y = 18;

  // 3 "Dodaj element zestawu" blocks – pre-filled with data
  const BLK_HW = (PW - 4) / 2;

  const blokiDanych = [
    {
      typ: "Magazyn energii",
      nazwa: magazynData ? pl(magazynData.name || "—") : "—",
      ilosc: magazynData ? String(magazynData.ilosc ?? 1) : "—",
      jednostka: magazynData ? String(magazynData.jednostka || "szt.") : "—",
    },
    {
      typ: "Panele fotowoltaiczne",
      nazwa: panelData ? pl(panelData.name || "—") : "—",
      ilosc: panelCountNum ? String(panelCountNum) : "—",
      jednostka: "szt.",
    },
    {
      typ: "Falownik fotowoltaiczny",
      nazwa: falownikData ? pl(falownikData.name || "—") : "—",
      ilosc: String(falIl),
      jednostka: "szt.",
    },
  ];

  // label-left + input-right row reused from page 3 style
  const blkFormRow = (label, value) => {
    const rowH = 10;
    checkPage(rowH + 3);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(75, 85, 99);
    doc.text(pl(label), LM + 2, y);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(209, 213, 219);
    doc.roundedRect(LM + LBL_W, y - 6.5, INP_W, rowH, 1, 1, "FD");
    if (value) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39);
      doc.text(pl(String(value)), LM + LBL_W + 3, y - 0.5);
    }
    y += rowH + 3;
  };

  blokiDanych.forEach(({ typ, nazwa, ilosc, jednostka }) => {
    const blockH = 11 + 4 * 13 + 16; // title + 4 rows + buttons = 79
    checkPage(blockH);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1.5);
    doc.roundedRect(LM - 2, y - 5, PW + 4, blockH, 2, 2, "FD");
    doc.setLineWidth(0.4); // restore default

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text("Dodaj element zestawu", LM + 2, y + 3);
    y += 11;

    blkFormRow("Typ", typ);
    blkFormRow("Nazwa", nazwa);
    blkFormRow("Ilość", ilosc);
    blkFormRow("Jednostka", jednostka);

    // Anuluj / Zapisz buttons — right-aligned
    const btnW = 30;
    const zapisz_x = RM - btnW;
    const anuluj_x = zapisz_x - btnW - 4;

    doc.setFillColor(243, 244, 246);
    doc.setDrawColor(209, 213, 219);
    doc.roundedRect(anuluj_x, y - 3, btnW, 8, 1, 1, "FD");
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128);
    doc.text(pl("Anuluj"), anuluj_x + btnW / 2, y + 2, { align: "center" });

    doc.setFillColor(249, 115, 22);
    doc.roundedRect(zapisz_x, y - 3, btnW, 8, 1, 1, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(pl("Zapisz"), zapisz_x + btnW / 2, y + 2, { align: "center" });

    y += 16;
  });

  const uid = fileId != null ? String(fileId) : String(Math.floor(100000 + Math.random() * 900000));
  const imie = (clientName || "klient").toLowerCase().replace(/\s+/g, "-");
  const nazw = (clientSurname || "").toLowerCase().replace(/\s+/g, "-");
  const datePart = dateStr.replace(/\./g, "-");
  const timePart = timeStr.replace(/:/g, "");
  doc.save(`wycena-${uid}-${imie}-${nazw}-${datePart}-${timePart}.pdf`);
}

export function buildPdfContextFromLiveCalculator({
  user,
  offerNumber,
  clientName,
  clientSurname,
  hasPv,
  leadSourceName,
  existingPvKwp,
  existingMePowerKw,
  existingMeCapacityKwh,
  connectionKw,
  panelOption,
  panelCount,
  mountType,
  panelData,
  falownikAction,
  falownikData,
  magazynData,
  rozdzielnica,
  przekop,
  przekopMetry,
  klimatyzatorMontaz,
  klimatyzatorUrzadzenia,
  wm,
  showAllPrices,
  calc,
  vatRate,
  totalBrutto,
  rabatBrutto,
  rabatNetto,
  finalBrutto,
  adjustedWmNetto,
  falownikIloscSzt,
}) {
  const salesperson =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.name || user?.email || "—";

  return {
    clientName,
    clientSurname,
    salesperson,
    pdfDate: new Date(),
    fileId: null,
    offerNumber: offerNumber || null,
    hasPv,
    leadSourceName: coerceLeadSourceName(leadSourceName),
    existingPvKwp,
    existingMePowerKw,
    existingMeCapacityKwh,
    connectionKw,
    panelOption,
    panelCount,
    mountType,
    panelData: panelData
      ? { name: panelData.name, powerW: panelData.powerW, priceNetto: panelData.priceNetto ?? panelData.price }
      : null,
    falownikAction,
    falownikData: falownikData
      ? { name: falownikData.name, powerKw: falownikData.powerKw, priceNetto: falownikData.priceNetto ?? falownikData.price }
      : null,
    magazynData: magazynData
      ? {
          name: magazynData.name,
          capacityKwh: magazynData.capacityKwh,
          powerKw: magazynData.powerKw,
          priceNetto: magazynData.priceNetto ?? magazynData.price,
          ilosc: magazynData.ilosc ?? 1,
          jednostka: magazynData.jednostka ?? "szt.",
        }
      : null,
    rozdzielnica,
    przekop,
    przekopMetry,
    klimatyzatorMontaz: klimatyzatorMontaz || "nie",
    klimatyzatorUrzadzenia: klimatyzatorUrzadzenia || [],
    wm,
    showAllPrices,
    lines: calc.lines.map((l) => ({ label: l.label, value: l.value, note: l.note })),
    total: calc.total,
    wmExtra: calc.wmExtra,
    vatRate,
    totalBrutto,
    rabatBrutto,
    rabatNetto,
    finalBrutto,
    adjustedWmNetto,
    connKw: calc.connKw,
    canInstallWithoutUpgrade: calc.canInstallWithoutUpgrade,
    effectivePower: calc.effectivePower,
    willSum: calc.willSum ?? false,
    pvKwpCalc: calc.pvKwpCalc ?? 0,
    falKwCalc: calc.falKwCalc ?? 0,
    meKwCalc: calc.meKwCalc ?? 0,
    falownikIloscSzt: Math.max(1, parseInt(String(falownikIloscSzt ?? 1), 10) || 1),
  };
}
