import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import api from "@/utils/axiosInstance";
import { useAuth } from "@/context/AuthContext";
import {
  buildPdfContextFromLiveCalculator,
  renderKalkulatorWycenaPdfAndSave,
} from "@/utils/kalkulatorWycenaPdf";
import { computeEffectivePower } from "@/utils/mocPrzylaczeniowaSheet";
import { computeMagazynLine, formatTierBreakdown, normalizePriceTiers } from "@/utils/magazynPricing";
import {
  computeFalownikLine,
  getFalownikUnitMocKw,
  normalizeFalownikRecord,
} from "@/utils/falownikPricing";
import { mergeFalownikCatalog } from "@/utils/falownikTiersStorage";

const CONSTRUCTION = { grunt: 450, dach: 350 };

const LABOR_TIERS = [
  { max: 2,        pricePerPanel: 850 },
  { max: 4,        pricePerPanel: 650 },
  { max: 6,        pricePerPanel: 550 },
  { max: 10,       pricePerPanel: 500 },
  { max: Infinity, pricePerPanel: 450 },
];

const FIXED = {
  marketing:     6000,
  admin:         5000,
  montazME:      2000,
  rozdzielnica:  1500,
  // przekop prices are range-based — see calcPrzekop()
};

/**
 * Przekop cost based on range:
 *   Robocizna (jednorazowa): 1–10 m → 700 zł | 10–25 m → 1 000 zł | 25–50 m → 1 300 zł
 *   Materiał (za metr):      1–10 m → 30 zł  | 10–25 m → 35 zł    | 25–50 m → 40 zł
 */
function calcPrzekop(metry) {
  if (metry <= 0) return 0;
  let jednorazowa, perM;
  if (metry <= 10) {
    jednorazowa = 700;  perM = 30;
  } else if (metry <= 25) {
    jednorazowa = 1000; perM = 35;
  } else {
    jednorazowa = 1300; perM = 40;
  }
  return jednorazowa + metry * perM;
}

function przekopLabel(metry) {
  if (metry <= 0) return "";
  if (metry <= 10)  return `${metry} m (700 + ${metry}×30)`;
  if (metry <= 25)  return `${metry} m (1 000 + ${metry}×35)`;
  return                  `${metry} m (1 300 + ${metry}×40)`;
}

/** Minimalna liczba paneli przy budowie nowego łańcucha */
const MIN_PANELS_NEW_CHAIN = 7;

/** Domyślna wartość pola WM (0,1 = +100 zł netto) */
const DEFAULT_WM = "15";

/** Transport + zamówienie przy panelach spoza listy (jednorazowo) */
const CUSTOM_PANEL_TRANSPORT = 500;

/** Automatyczna cena jednostkowa dla paneli spoza listy */
function calcCustomPanelUnitPrice(powerW) {
  if (powerW <= 400) return 450;
  return powerW * 1.2;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function laborPrice(count) {
  const tier = LABOR_TIERS.find((t) => count <= t.max);
  const ppp  = tier ? tier.pricePerPanel : 450;
  return count * ppp;
}

function fmt(n) {
  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Format kWp (e.g. 2,5) for panel power preview */
function fmtKwp(n) {
  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(n);
}

function getInitialsFromUser(user) {
  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.name ||
    user?.email ||
    "";
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "XX";
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "XX";
}

function buildFallbackOfferNumber(lastNumer, user) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const initials = getInitialsFromUser(user);
  let seq = 1;

  if (typeof lastNumer === "string") {
    const m = lastNumer.match(/^(.+)\/(\d{4})\/(\d{2})\/(\d+)$/);
    if (m) {
      const lastYear = Number(m[2]);
      const lastMonth = m[3];
      const lastSeq = Number(m[4]);
      if (lastYear === year && lastMonth === month && Number.isFinite(lastSeq)) {
        seq = lastSeq + 1;
      }
    }
  }

  return `${initials}/${year}/${month}/${seq}`;
}

// ─── Steps ───────────────────────────────────────────────────────────────────

const STEPS = ["Instalacja", "Panele", "Falownik", "Magazyn", "Koszty dodatkowe", "Wycena"];

// ─── Main component ──────────────────────────────────────────────────────────

export default function SunFeeKalkulator() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [vatRate, setVatRate] = useState(8);

  // Client & offer
  const [clientName,    setClientName]    = useState("");
  const [clientSurname, setClientSurname] = useState("");
  const [rabat,         setRabat]         = useState("");

  const { user } = useAuth();
  const isHandlowiec = user?.role === "Handlowiec";
  const isAdmin = user?.role === "Administrator";
  const showAllPrices = isAdmin || !isHandlowiec;
  const vatMultiplier = 1 + vatRate / 100;
  const offerNumberFromQuery = useMemo(() => {
    const q = router?.query || {};
    const raw =
      q.offerNumber ??
      q.numerOferty ??
      q.numerUmowy ??
      q.umowaNumber ??
      null;
    if (Array.isArray(raw)) return raw[0] || null;
    return raw != null ? String(raw) : null;
  }, [router?.query]);
  const [previewOfferNumber, setPreviewOfferNumber] = useState(null);

  useEffect(() => {
    if (offerNumberFromQuery) {
      setPreviewOfferNumber(null);
      return;
    }
    let alive = true;
    api
      .get("/kalkulator/wyceny/next-number")
      .then((res) => {
        if (!alive) return;
        const val = res?.data?.numerOferty;
        setPreviewOfferNumber(val != null ? String(val) : null);
      })
      .catch(async () => {
        if (!alive) return;
        try {
          const r = await api.get("/kalkulator/wyceny?page=1&limit=1");
          const last = Array.isArray(r?.data)
            ? r.data?.[0]?.numerOferty
            : r?.data?.data?.[0]?.numerOferty ?? r?.data?.items?.[0]?.numerOferty;
          if (!alive) return;
          setPreviewOfferNumber(buildFallbackOfferNumber(last, user));
        } catch {
          if (!alive) return;
          setPreviewOfferNumber(buildFallbackOfferNumber(null, user));
        }
      });
    return () => {
      alive = false;
    };
  }, [offerNumberFromQuery, user]);

  const liveOfferNumber = offerNumberFromQuery || previewOfferNumber;

  // ── Catalogue data from API ───────────────────────────────────────────────
  const [falownikiList,      setFalownikiList]      = useState([]);
  const [paneleList,         setPaneleList]         = useState([]);
  const [magazynyList,       setMagazynyList]       = useState([]);
  const [klimatyzatoryList,  setKlimatyzatoryList]  = useState([]);
  const [leadSources,        setLeadSources]        = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError,   setCatalogError]   = useState("");

  // Step 0 – lead source
  const [selectedLeadSourceId, setSelectedLeadSourceId] = useState(null);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const [fRes, pRes, mRes, kRes, lsRes] = await Promise.all([
        api.get("/kalkulator/falowniki"),
        api.get("/kalkulator/panele"),
        api.get("/kalkulator/magazyny"),
        api.get("/kalkulator/klimatyzatory"),
        api.get("/lead-sources?onlyActive=true"),
      ]);
      const activeFalowniki = mergeFalownikCatalog(
        (fRes.data || []).filter((f) => f.isActive !== false),
      ).map(normalizeFalownikRecord);
      const activePanele    = (pRes.data || []).filter((p) => p.isActive !== false);
      const activeMagazyny  = (mRes.data || []).filter((m) => m.isActive !== false);
      const activeKlimatyzatory = (kRes.data || []).filter((k) => k.isActive !== false);
      const activeSources   = (lsRes.data || []).filter((s) => s.isActive !== false);

      setFalownikiList(activeFalowniki);
      setPaneleList(activePanele);
      setMagazynyList(activeMagazyny);
      setKlimatyzatoryList(activeKlimatyzatory);
      setLeadSources(activeSources);

      if (activePanele.length > 0)    setSelectedPanel(activePanele[0].id);
      if (activeFalowniki.length > 0) setSelectedFalownik(activeFalowniki[0].id);
    } catch {
      setCatalogError("Nie udało się załadować danych katalogowych");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  // Step 0 – existing installation
  const [hasPv,                 setHasPv]                 = useState(""); // "tak" | "nie"
  const [existingPvKwp,         setExistingPvKwp]         = useState("");
  const [existingMePowerKw,     setExistingMePowerKw]     = useState("");
  const [existingMeCapacityKwh, setExistingMeCapacityKwh] = useState("");
  const [connectionKw,          setConnectionKw]          = useState("");

  // Step 1 – panels
  const [wm,               setWm]               = useState(DEFAULT_WM);
  const [panelOption,      setPanelOption]      = useState("");
  const [panelSource,      setPanelSource]      = useState("list");
  const [selectedPanel,    setSelectedPanel]    = useState(null);
  const [customPanelW,     setCustomPanelW]     = useState("");
  const [customPanelNazwa, setCustomPanelNazwa] = useState("");
  const [customPanelPrice, setCustomPanelPrice] = useState("");
  const [panelCount,       setPanelCount]       = useState("");
  const [mountType,        setMountType]        = useState("dach");

  // Step 2 – inverter
  const [falownikAction,   setFalownikAction]   = useState("");
  const [falownikSource,   setFalownikSource]   = useState("list");
  const [selectedFalownik, setSelectedFalownik] = useState(null);

  useEffect(() => {
    if (falownikAction === "istnieje") {
      setFalownikAction("bez_wymiany");
      setFalownikSource("list");
    }
  }, [falownikAction]);

  // Step 3 – energy storage
  const [magazynId, setMagazynId] = useState("none");

  /** Ilość magazynów energii (edytowalna przy wyborze z listy). */
  const [magazynIlosc, setMagazynIlosc] = useState("1");

  /** Ilość falowników (edytowalna); moc „z falownika” bierzemy z katalogu (powerKw). */
  const [falownikIlosc, setFalownikIlosc] = useState("1");

  /** Moc paneli (kW) z falownika — edycja; domyślnie synchronizowana z katalogiem. */
  const [falownikMocPaneliKw, setFalownikMocPaneliKw] = useState("");

  // Step 4 – additional costs
  const [rozdzielnica, setRozdzielnica] = useState("");
  const [przekop,      setPrzekop]      = useState("");
  const [przekopMetry, setPrzekopMetry] = useState("");
  const [klimatyzatorMontaz, setKlimatyzatorMontaz] = useState("");
  const [selectedKlimatyzatorIds, setSelectedKlimatyzatorIds] = useState([]);

  // ── Derived data ─────────────────────────────────────────────────────────

  const panelData = useMemo(() => {
    if (panelSource === "custom") {
      const pw = parseFloat(customPanelW) || 0;
      if (!pw) return null;
      const unitPrice = calcCustomPanelUnitPrice(pw);
      const label = customPanelNazwa.trim() || `Panel własny ${pw}W`;
      return { powerW: pw, price: unitPrice, name: label };
    }
    const found = paneleList.find((p) => p.id === selectedPanel);
    return found ? { ...found, price: found.priceNetto } : null;
  }, [panelSource, selectedPanel, customPanelW, customPanelNazwa, paneleList]);

  const falownikData = useMemo(() => {
    if (falownikSource === "custom") return null;
    const found = falownikiList.find((f) => String(f.id) === String(selectedFalownik));
    if (!found) return null;
    const tiers = normalizePriceTiers(found);
    return { ...found, priceTiers: tiers, price: tiers[0] ?? found.priceNetto };
  }, [falownikSource, selectedFalownik, falownikiList]);

  const falownikUnitMocKw = useMemo(
    () => getFalownikUnitMocKw(falownikMocPaneliKw, falownikData),
    [falownikMocPaneliKw, falownikData],
  );

  const falownikLine = useMemo(() => {
    if (!falownikData) return null;
    const qty = Math.max(1, parseInt(String(falownikIlosc), 10) || 1);
    return computeFalownikLine(falownikData, qty, falownikUnitMocKw);
  }, [falownikData, falownikIlosc, falownikUnitMocKw]);

  const falownikCatalogPowerKw = useMemo(() => {
    if (falownikSource === "custom") return null;
    const f = falownikiList.find((x) => String(x.id) === String(selectedFalownik));
    return f?.powerKw != null ? Number(f.powerKw) : null;
  }, [falownikSource, selectedFalownik, falownikiList]);

  useEffect(() => {
    if (falownikSource === "custom") return;
    if (falownikCatalogPowerKw == null) {
      setFalownikMocPaneliKw("");
      return;
    }
    setFalownikMocPaneliKw(String(falownikCatalogPowerKw));
  }, [falownikSource, selectedFalownik, falownikCatalogPowerKw]);

  // Compatibility: magazyn is compatible if its falowniki array contains the selected falownik id
  const compatibleMagazyny = useMemo(() => {
    if (falownikSource === "custom") return [];
    if (!selectedFalownik) return [];
    return magazynyList.filter((m) =>
      (m.falowniki || []).some((f) => String(f.id) === String(selectedFalownik))
    );
  }, [falownikSource, selectedFalownik, magazynyList]);

  const magazynData = useMemo(() => {
    if (magazynId === "none") return null;
    const found = magazynyList.find((m) => String(m.id) === String(magazynId));
    if (!found) return null;
    const tiers = normalizePriceTiers(found);
    return { ...found, priceTiers: tiers, price: tiers[0] ?? found.priceNetto };
  }, [magazynId, magazynyList]);

  const magazynLine = useMemo(() => {
    if (!magazynData) return null;
    const qty = Math.max(1, parseInt(String(magazynIlosc), 10) || 1);
    return computeMagazynLine(magazynData, qty);
  }, [magazynData, magazynIlosc]);

  useEffect(() => {
    if (magazynId === "none") setMagazynIlosc("1");
  }, [magazynId]);

  /** Liczba × moc panela (W) → kWp — podgląd na kroku „Panele” */
  const panelsKwpPreview = useMemo(() => {
    if (panelOption === "" || panelOption === "none") return null;
    const n = parseInt(panelCount, 10);
    if (!n || n < 1) return null;
    let powerW = 0;
    if (panelSource === "list") {
      const p = paneleList.find((x) => x.id === selectedPanel);
      powerW = p?.powerW ?? 0;
    } else {
      powerW = parseFloat(customPanelW) || 0;
    }
    if (!powerW || powerW <= 0) return null;
    const kwp = (n * powerW) / 1000;
    return { n, powerW, kwp };
  }, [
    panelOption,
    panelSource,
    panelCount,
    selectedPanel,
    customPanelW,
    paneleList,
  ]);

  // ── Calculation ───────────────────────────────────────────────────────────

  const calc = useMemo(() => {
    const pvKwp   = parseFloat(existingPvKwp) || 0;
    const connKw  = parseFloat(connectionKw)  || 0;
    const wmVal   = parseFloat(wm)            || 0;
    const count   = parseInt(panelCount, 10)  || 0;

    const lines = [];
    let total = 0;

    const add = (label, value, note) => {
      lines.push({ label, value, note });
      total += value;
    };

    // Panels
    if (panelOption !== "none" && panelOption !== "" && count > 0 && panelData) {
      const panelCost     = count * panelData.price;
      const constructCost = count * CONSTRUCTION[mountType];
      const ppp           = LABOR_TIERS.find((t) => count <= t.max)?.pricePerPanel ?? 450;
      const labor         = count * ppp;

      add(`Panele (${count} × ${fmt(panelData.price)} zł)`, panelCost);
      add(`Konstrukcja – ${mountType} (${count} × ${fmt(CONSTRUCTION[mountType])} zł)`, constructCost);
      add(`Robocizna PV (${count} × ${fmt(ppp)} zł/panel)`, labor);

      if (panelSource === "custom") {
        add("Transport i zamówienie paneli spoza listy", CUSTOM_PANEL_TRANSPORT);
      }
    }

    // Inverter — cennik progowy (1. + 2. + 3. falownik…)
    if (falownikAction === "wymiana" && falownikData && falownikLine) {
      const falSzt = falownikLine.quantity;
      const breakdown = formatTierBreakdown(falownikLine.unitPrices, fmt);
      const falLabel =
        falSzt > 1
          ? `Falownik ${falownikData.name} (${falSzt} szt., ${falownikLine.totalPowerKw} kW)`
          : `Falownik ${falownikData.name}`;
      const priceNote = falSzt > 1 && breakdown ? ` (${breakdown} zł)` : "";
      add(`${falLabel}${priceNote}`, falownikLine.totalPrice);
    }

    // Energy storage (cennik progowy: 1. + 2. + 3. bateria…)
    const meSzt = magazynLine?.quantity ?? 0;
    if (magazynData && magazynLine && meSzt > 0) {
      const breakdown = formatTierBreakdown(magazynLine.unitPrices, fmt);
      const meLabel =
        meSzt > 1
          ? `Magazyn energii – ${magazynData.name} (${meSzt} szt., ${magazynLine.totalCapacityKwh} kWh / ${magazynLine.totalPowerKw} kW)`
          : `Magazyn energii – ${magazynData.name}`;
      const priceNote =
        meSzt > 1 && breakdown ? ` (${breakdown} zł)` : "";
      add(`${meLabel}${priceNote}`, magazynLine.totalPrice);
      add(
        meSzt > 1 ? `Montaż magazynu energii (${meSzt} szt.)` : "Montaż magazynu energii",
        FIXED.montazME * meSzt
      );
    }

    // Rozdzielnica
    if (rozdzielnica === "tak") {
      add("Przebudowa rozdzielnicy", FIXED.rozdzielnica);
    }

    // Przekop
    const metry = parseInt(przekopMetry, 10) || 0;
    if (przekop === "tak") {
      add(`Przekop ${przekopLabel(metry)}`, calcPrzekop(metry));
    }

    if (klimatyzatorMontaz === "tak") {
      selectedKlimatyzatorIds.forEach((kid) => {
        const k = klimatyzatoryList.find((x) => String(x.id) === String(kid));
        if (k) add(`Klimatyzator – ${k.name}`, Number(k.priceNetto) || 0);
      });
    }

    // Fixed — 50% if no energy storage (panels/inverter only)
    const fixedRate = magazynData ? 1 : 0.5;
    const selectedLeadSrc = leadSources.find((s) => s.id === selectedLeadSourceId);
    const marketingCost = selectedLeadSrc?.marketingCost ?? FIXED.marketing;
    add(
      `Koszty marketingowe${fixedRate < 1 ? " (50% – brak ME)" : ""}${selectedLeadSrc ? ` – ${selectedLeadSrc.name}` : ""}`,
      marketingCost * fixedRate
    );
    add(
      `Koszty administracyjne${fixedRate < 1 ? " (50% – brak ME)" : ""}`,
      FIXED.admin * fixedRate
    );

    // WM margin
    const wmExtra = Math.round(wmVal / 0.1) * 100;
    if (wmExtra > 0) {
      add(`WM (${wmVal} × 1 000 zł)`, wmExtra);
    }

    // ── Power check: JEŻELI(LUB(A8<B8; A8<C8); A8+C8; A8) ──────────────────────
    const {
      effectivePower,
      willSum,
      a8: pvKwpCalc,
      b8: falKwCalc,
      c8: meKwCalc,
    } = computeEffectivePower({
      existingPvKwp,
      panelCount,
      panelData,
      falownikMocPaneliKw,
      falownikData,
      falownikIlosc,
      magazynData,
      magazynIlosc,
    });

    const canInstallWithoutUpgrade = connKw > 0 ? effectivePower <= connKw : null;

    return {
      lines, total, canInstallWithoutUpgrade,
      effectivePower, connKw, wmExtra,
      willSum, pvKwpCalc, falKwCalc, meKwCalc,
    };
  }, [
    existingPvKwp, connectionKw, wm,
    panelOption, panelData, panelCount, mountType, panelSource,
    falownikAction, falownikData, falownikLine, falownikMocPaneliKw, falownikSource, falownikIlosc,
    magazynData, magazynIlosc, magazynLine,
    rozdzielnica,
    przekop, przekopMetry,
    klimatyzatorMontaz, selectedKlimatyzatorIds, klimatyzatoryList,
    selectedLeadSourceId, leadSources,
  ]);

  // ── Configuration issues for summary step ────────────────────────────────
  const configIssues = useMemo(() => {
    const issues = [];
    if (calc.canInstallWithoutUpgrade === false) {
      issues.push(
        `Efektywna moc instalacji (${calc.effectivePower.toFixed(2)} kW) przekracza moc przyłączeniową (${calc.connKw} kW). Konieczne zwiększenie mocy przyłączeniowej.`
      );
    }
    if (falownikSource === "custom") {
      issues.push("Falownik spoza listy – dobór magazynu energii nie jest możliwy.");
    }
    if (panelOption === "new_chain" && parseInt(panelCount, 10) > 0 && parseInt(panelCount, 10) < MIN_PANELS_NEW_CHAIN) {
      issues.push(`Nowy łańcuch wymaga minimum ${MIN_PANELS_NEW_CHAIN} paneli.`);
    }
    return issues;
  }, [calc, falownikSource, panelOption, panelCount]);

  // ── Step validation: all required fields must be filled ─────────────────

  const isNum = (v) => v !== "" && v !== null && v !== undefined && !Number.isNaN(Number(v));
  const numOk = (v, min = 0) => isNum(v) && Number(v) >= min;

  const canNext = () => {
    if (step === 0) {
      if (selectedLeadSourceId == null) return false;
      if (hasPv === "") return false;
      if (!numOk(connectionKw, 0)) return false;
      if (hasPv === "tak") {
        return (
          numOk(existingPvKwp, 0) &&
          numOk(existingMePowerKw, 0) &&
          numOk(existingMeCapacityKwh, 0)
        );
      }
      return true;
    }
    if (step === 1) {
      if (!numOk(wm, 0)) return false;
      // gdy hasPv === "nie", panelOption jest auto-ustawione na "new_chain"
      if (hasPv !== "nie" && panelOption === "") return false;
      if (panelOption !== "none") {
        const cnt = parseInt(panelCount, 10);
        if (!panelCount || cnt < 1) return false;
        if (panelOption === "new_chain" && cnt < MIN_PANELS_NEW_CHAIN) return false;
        if (panelSource === "list") {
          if (paneleList.length === 0 || selectedPanel == null) return false;
        }
        if (panelSource === "custom") {
          if (!numOk(customPanelW, 0.0001)) return false;
          if (!String(customPanelNazwa).trim()) return false;
        }
      }
      return true;
    }
    if (step === 2) {
      if (falownikAction === "") return false;
      if (!numOk(falownikIlosc, 1) || !Number.isInteger(Number(falownikIlosc))) return false;
      if (falownikAction === "wymiana") {
        if (falownikSource === "list") {
          if (falownikiList.length === 0 || selectedFalownik == null) return false;
          if (falownikData) {
            const p = parseFloat(String(falownikMocPaneliKw).replace(",", "."));
            if (!Number.isFinite(p) || p <= 0) return false;
          }
          return true;
        }
        if (falownikSource === "custom") {
          const p = parseFloat(String(falownikMocPaneliKw).replace(",", "."));
          return Number.isFinite(p) && p > 0;
        }
        return true;
      }
      if (falownikAction === "bez_wymiany") {
        if (falownikSource === "list") {
          if (falownikiList.length === 0 || selectedFalownik == null) return false;
          if (falownikData) {
            const p = parseFloat(String(falownikMocPaneliKw).replace(",", "."));
            if (!Number.isFinite(p) || p <= 0) return false;
          }
          return true;
        }
        if (falownikSource === "custom") {
          const p = parseFloat(String(falownikMocPaneliKw).replace(",", "."));
          return Number.isFinite(p) && p > 0;
        }
        return true;
      }
      return false;
    }
    if (step === 3) {
      if (magazynId !== "none") {
        if (!numOk(magazynIlosc, 1) || !Number.isInteger(Number(magazynIlosc))) return false;
      }
      return true;
    }
    if (step === 4) {
      if (rozdzielnica === "" || przekop === "") return false;
      if (przekop === "tak" && (!przekopMetry || parseInt(przekopMetry, 10) < 1)) return false;
      if (klimatyzatorMontaz === "") return false;
      if (klimatyzatorMontaz === "tak" && selectedKlimatyzatorIds.length === 0) return false;
      return true;
    }
    return true;
  };

  const validationToast = () => {
    if (step === 0) {
      if (selectedLeadSourceId == null) {
        toast.warn("Wybierz źródło klienta.");
      } else if (hasPv === "") {
        toast.warn("Zaznacz czy klient ma już instalację fotowoltaiczną.");
      } else if (!numOk(connectionKw, 0)) {
        toast.warn("Podaj moc przyłączeniową instalacji PV.");
      } else {
        toast.warn("Uzupełnij wszystkie pola dotyczące istniejącej instalacji.");
      }
      return;
    } else if (step === 1) {
      if (
        panelOption === "new_chain" &&
        panelCount !== "" &&
        !Number.isNaN(parseInt(panelCount, 10)) &&
        parseInt(panelCount, 10) >= 1 &&
        parseInt(panelCount, 10) < MIN_PANELS_NEW_CHAIN
      ) {
        toast.warn(
          `Nie ma możliwości zbudowania nowego łańcucha dla mniej niż ${MIN_PANELS_NEW_CHAIN} paneli. Minimum: ${MIN_PANELS_NEW_CHAIN} paneli.`
        );
      } else if (
        panelOption !== "" &&
        panelOption !== "none" &&
        panelSource === "custom" &&
        !String(customPanelNazwa).trim()
      ) {
        toast.warn("Podaj nazwę panelu (Spoza listy).");
      } else if (
        panelOption !== "" &&
        panelOption !== "none" &&
        panelSource === "custom" &&
        !numOk(customPanelW, 0.0001)
      ) {
        toast.warn("Podaj moc panela (W) — wartość większa od zera.");
      } else {
        toast.warn("Uzupełnij WM oraz wybór dotyczący paneli (jeśli dokładasz panele — uzupełnij wszystkie pola paneli).");
      }
    } else if (step === 2) {
      if (falownikAction === "") {
        toast.warn("Wybierz opcję falownika.");
      } else if (!numOk(falownikIlosc, 1) || !Number.isInteger(Number(falownikIlosc))) {
        toast.warn("Podaj całkowitą ilość falowników (minimum 1).");
      } else if (falownikSource === "list" && (falownikiList.length === 0 || selectedFalownik == null)) {
        toast.warn("Wybierz model falownika z katalogu.");
      } else if (falownikSource === "custom") {
        const p = parseFloat(String(falownikMocPaneliKw).replace(",", "."));
        if (!Number.isFinite(p) || p <= 0) {
          toast.warn("Podaj moc paneli (kW) z falownika — liczba większa od zera.");
        }
      } else if (falownikSource === "list" && falownikData) {
        const p = parseFloat(String(falownikMocPaneliKw).replace(",", "."));
        if (!Number.isFinite(p) || p <= 0) {
          toast.warn("Podaj moc paneli (kW) z falownika — liczba większa od zera.");
        }
      } else {
        toast.warn("Wybierz opcję falownika i — przy wyborze z listy — wskaż model z katalogu.");
      }
    } else if (step === 3) {
      if (!numOk(magazynIlosc, 1) || !Number.isInteger(Number(magazynIlosc))) {
        toast.warn("Podaj całkowitą ilość magazynów energii (minimum 1).");
      }
    } else if (step === 4) {
      if (klimatyzatorMontaz === "") {
        toast.warn("Odpowiedz na pytania o rozdzielnicę, przekop i klimatyzator.");
      } else if (klimatyzatorMontaz === "tak" && selectedKlimatyzatorIds.length === 0) {
        toast.warn("Wybierz co najmniej jedno urządzenie z listy klimatyzatorów.");
      } else {
        toast.warn("Odpowiedz na pytania o rozdzielnicę i przekop; przy przekopie podaj długość w metrach.");
      }
    }
  };

  // ── Rabat (discount) calculations ────────────────────────────────────────
  const rabatBrutto      = parseFloat(rabat) || 0;
  const rabatNetto       = rabatBrutto / vatMultiplier;
  const totalBrutto      = calc.total * vatMultiplier;
  const finalBrutto      = totalBrutto - rabatBrutto;
  const adjustedWmNetto  = calc.wmExtra - rabatNetto;

  // ── Save calculation to backend ──────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  const clientDataOk = () => clientName.trim() !== "" && clientSurname.trim() !== "";

  const saveKalkulation = async () => {
    if (!clientDataOk()) {
      toast.warn("Podaj imię i nazwisko klienta przed zapisaniem.");
      return;
    }
    if (selectedLeadSourceId == null) {
      toast.warn("Wybierz źródło klienta przed zapisaniem.");
      return;
    }
    setSaving(true);
    try {
      // ── Wyciągnięte pola do szybkiego wyszukiwania (top-level) ──────────
      const razemNetto        = parseFloat(calc.total.toFixed(2));
      const razemBruttoVal    = parseFloat(totalBrutto.toFixed(2));
      const finalnaKlientBrutto = parseFloat((rabatBrutto > 0 ? finalBrutto : totalBrutto).toFixed(2));

      // ── Pełny snapshot kalkulacji → pole `data` na backendzie ───────────
      const selectedLeadSrc = leadSources.find((s) => s.id === selectedLeadSourceId) || null;

      const data = {
        meta: {
          hasPv,
          leadSourceId: selectedLeadSrc?.id ?? null,
          leadSourceName: selectedLeadSrc?.name ?? null,
        },
        klient: {
          imie:     clientName.trim()    || null,
          nazwisko: clientSurname.trim() || null,
        },
        instalacjaIstniejaca: {
          mocPvKwp:            parseFloat(existingPvKwp)         || 0,
          magazynMocKw:        parseFloat(existingMePowerKw)     || 0,
          magazynPojemnoscKwh: parseFloat(existingMeCapacityKwh) || 0,
          mocPrzylaczeniowa:   parseFloat(connectionKw)          || 0,
        },
        panele: {
          wm:         parseFloat(wm) || 0,
          opcja:      panelOption,
          zrodlo:     panelOption !== "none" ? panelSource : null,
          liczba:     panelOption !== "none" ? (parseInt(panelCount, 10) || 0) : 0,
          typMontazu: panelOption !== "none" ? mountType : null,
          panel: panelOption !== "none" && panelSource === "list"
            ? { id: selectedPanel, nazwa: panelData?.name, mocW: panelData?.powerW, cenaNetto: panelData?.price }
            : null,
          panelWlasny: panelOption !== "none" && panelSource === "custom"
            ? {
                nazwa: String(customPanelNazwa).trim(),
                mocW: parseFloat(customPanelW) || 0,
                cenaNettoPrzyliczona: panelData?.price || 0,
              }
            : null,
        },
        falownik: {
          akcja:  falownikAction,
          zrodlo: falownikSource,
          iloscSzt: falownikLine?.quantity ?? Math.max(1, parseInt(falownikIlosc, 10) || 1),
          falownik: falownikData && falownikLine
            ? {
                id: selectedFalownik,
                nazwa: falownikData.name,
                mocJednostkowaKw: falownikLine.unitMocKw,
                mocKw: falownikLine.totalPowerKw,
                cenaNetto: falownikLine.totalPrice,
                cenyPozycji: falownikLine.unitPrices,
              }
            : falownikSource === "custom"
              ? {
                  mocJednostkowaKw: falownikUnitMocKw,
                  mocKw:
                    falownikUnitMocKw *
                    Math.max(1, parseInt(falownikIlosc, 10) || 1),
                }
              : null,
        },
        magazynEnergii: magazynData && magazynLine
          ? {
              id: magazynData.id,
              nazwa: magazynData.name,
              pojemnoscJednostkowaKwh: magazynLine.unitCapacityKwh,
              mocJednostkowaKw: magazynLine.unitPowerKw,
              pojemnoscKwh: magazynLine.totalCapacityKwh,
              mocKw: magazynLine.totalPowerKw,
              cenaNetto: magazynLine.totalPrice,
              cenyPozycji: magazynLine.unitPrices,
              ilosc: magazynLine.quantity,
              jednostka: "szt.",
            }
          : null,
        kosztDodatkowe: {
          rozdzielnica: rozdzielnica,
          przekop:      przekop,
          przekopMetry: przekop === "tak" ? (parseInt(przekopMetry, 10) || 0) : 0,
          klimatyzator: {
            montaz: klimatyzatorMontaz,
            urzadzenia:
              klimatyzatorMontaz === "tak"
                ? selectedKlimatyzatorIds
                    .map((kid) => klimatyzatoryList.find((x) => String(x.id) === String(kid)))
                    .filter(Boolean)
                    .map((k) => ({
                      id: k.id,
                      nazwa: k.name,
                      cenaNetto: k.priceNetto,
                    }))
                : [],
          },
        },
        wycena: {
          vatProcent:            vatRate,
          razemNetto,
          razemBrutto:           razemBruttoVal,
          rabatBrutto:           rabatBrutto > 0 ? parseFloat(rabatBrutto.toFixed(2)) : null,
          rabatNetto:            rabatBrutto > 0 ? parseFloat(rabatNetto.toFixed(2))  : null,
          finalnaKlientBrutto,
          marzaWmNetto:          parseFloat(calc.wmExtra.toFixed(2)),
          marzaWmPoRabacieNetto: rabatBrutto > 0 ? parseFloat(adjustedWmNetto.toFixed(2)) : null,
          mocEfektywnaKw:        parseFloat(calc.effectivePower.toFixed(2)),
          czyBezZwiekszeniaMocy: calc.canInstallWithoutUpgrade,
          pozycje: calc.lines.map((l) => ({
            nazwa:      l.label,
            kwotaNetto: parseFloat(l.value.toFixed(2)),
            ...(l.note ? { notatka: l.note } : {}),
          })),
        },
      };

      const payload = {
        klientImie:           data.klient.imie,
        klientNazwisko:       data.klient.nazwisko,
        razemNetto,
        razemBrutto:          razemBruttoVal,
        finalnaKlientBrutto,
        data,
      };

      await api.post("/kalkulator/wyceny", payload);
      toast.success("Kalkulacja zapisana");
    } catch (e) {
      toast.error(e.response?.data?.message || "Błąd zapisu kalkulacji");
    } finally {
      setSaving(false);
    }
  };

  // ── PDF generation ────────────────────────────────────────────────────────
  const generatePdf = async () => {
    if (!clientDataOk()) {
      toast.warn("Podaj imię i nazwisko klienta przed generowaniem PDF.");
      return;
    }
    if (selectedLeadSourceId == null) {
      toast.warn("Wybierz źródło klienta przed generowaniem PDF.");
      return;
    }
    try {
      const ctx = buildPdfContextFromLiveCalculator({
        user,
        offerNumber: liveOfferNumber,
        clientName,
        clientSurname,
        hasPv,
        leadSourceName: leadSources.find((s) => s.id === selectedLeadSourceId)?.name || null,
        existingPvKwp,
        existingMePowerKw,
        existingMeCapacityKwh,
        connectionKw,
        panelOption,
        panelCount,
        mountType,
        panelData,
        falownikAction,
        falownikData:
          falownikData && falownikLine
            ? {
                ...falownikData,
                powerKw: falownikLine.totalPowerKw,
                unitPowerKw: falownikLine.unitMocKw,
                priceNetto: falownikLine.totalPrice,
                unitPrices: falownikLine.unitPrices,
                ilosc: falownikLine.quantity,
              }
            : null,
        magazynData: magazynData && magazynLine
          ? {
              ...magazynData,
              capacityKwh: magazynLine.totalCapacityKwh,
              powerKw: magazynLine.totalPowerKw,
              unitCapacityKwh: magazynLine.unitCapacityKwh,
              unitPowerKw: magazynLine.unitPowerKw,
              priceNetto: magazynLine.totalPrice,
              unitPrices: magazynLine.unitPrices,
              ilosc: magazynLine.quantity,
              jednostka: "szt.",
            }
          : null,
        rozdzielnica,
        przekop,
        przekopMetry,
        klimatyzatorMontaz,
        klimatyzatorUrzadzenia:
          klimatyzatorMontaz === "tak"
            ? selectedKlimatyzatorIds
                .map((kid) => klimatyzatoryList.find((x) => String(x.id) === String(kid)))
                .filter(Boolean)
                .map((k) => ({ nazwa: k.name, cenaNetto: k.priceNetto }))
            : [],
        wm,
        showAllPrices,
        calc,
        vatRate,
        totalBrutto,
        rabatBrutto,
        rabatNetto,
        finalBrutto,
        adjustedWmNetto,
        falownikIloscSzt: Math.max(1, parseInt(falownikIlosc, 10) || 1),
      });
      await renderKalkulatorWycenaPdfAndSave(ctx);
    } catch (e) {
      console.error(e);
      toast.error("Nie udało się wygenerować PDF.");
    }
  };

  const next = () => {
    if (!canNext()) {
      validationToast();
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const prev = () => setStep((s) => Math.max(s - 1, 0));
  const reset = () => {
    setStep(0);
    setSelectedLeadSourceId(null);
    setHasPv("");
    setExistingPvKwp(""); setExistingMePowerKw(""); setExistingMeCapacityKwh(""); setConnectionKw("");
    setWm(DEFAULT_WM); setPanelOption(""); setPanelSource("list");
    setSelectedPanel(paneleList[0]?.id ?? null); setCustomPanelW(""); setCustomPanelNazwa(""); setCustomPanelPrice("");
    setPanelCount(""); setMountType("dach");
    setFalownikAction(""); setFalownikSource("list"); setSelectedFalownik(falownikiList[0]?.id ?? null);
    setMagazynId("none");
    setMagazynIlosc("1");
    setFalownikIlosc("1");
    setFalownikMocPaneliKw("");
    setRozdzielnica(""); setPrzekop(""); setPrzekopMetry("");
    setKlimatyzatorMontaz(""); setSelectedKlimatyzatorIds([]);
    setClientName(""); setClientSurname(""); setRabat(""); setVatRate(23);
  };

  const toggleKlimatyzator = (id) => {
    setSelectedKlimatyzatorIds((prev) =>
      prev.some((x) => String(x) === String(id))
        ? prev.filter((x) => String(x) !== String(id))
        : [...prev, id],
    );
  };

  const renderPriorSummary = () => {
    if (step <= 0) return null;

    const safeText = (v, fallback = "—") => (v === "" || v === null || v === undefined ? fallback : v);

    const panelOptionLabel = hasPv === "nie"
      ? "Nowa instalacja PV"
      : ({
          none: "Nie dokładamy",
          existing_chain: "Dokładamy na istniejącym łańcuchu",
          new_chain: "Dokładamy nowego łańcucha",
        }[panelOption] || "—");

    const mountLabel = mountType === "grunt" ? "Grunt" : "Dach";

    const selectedPanelObj = panelSource === "custom"
      ? null
      : paneleList.find((p) => p.id === selectedPanel) || null;

    const inverterLabel = falownikAction === "wymiana"
      ? (hasPv === "nie" ? "Montaż nowego falownika" : "Wymiana falownika")
      : falownikAction === "bez_wymiany"
        ? "Nie wymieniamy falownika"
        : "—";

    const selectedInverterObj = falownikiList.find((f) => String(f.id) === String(selectedFalownik)) || null;

    const falPodgladMocKw =
      falownikLine?.totalPowerKw ??
      (falownikUnitMocKw > 0
        ? Math.round(
            falownikUnitMocKw * Math.max(1, parseInt(falownikIlosc, 10) || 1) * 100,
          ) / 100
        : null);

    const selectedStorageObj =
      magazynyList.find((m) => String(m.id) === String(magazynId)) || null;

    const wmVal = parseFloat(wm);
    const wmExtra = Number.isFinite(wmVal) ? Math.round((wmVal || 0) / 0.1) * 100 : 0;

    const blocks = [];

    // Step 0 (Instalacja)
    if (step > 0) {
      const leadSrcName = leadSources.find((s) => s.id === selectedLeadSourceId)?.name || "—";
      blocks.push(
        <div key="s0">
          <div style={{ fontWeight: 700 }}>Krok 1: Instalacja</div>
          <div style={{ marginTop: 4, lineHeight: 1.4 }}>
            <div>Źródło umowy: {leadSrcName}</div>
            <div>Istniejąca instalacja PV: {hasPv === "tak" ? "Tak" : "Nie"}</div>
            {hasPv === "tak" && (
              <>
                <div>Moc PV: {safeText(existingPvKwp)} kWp</div>
                <div>Moc magazynu: {safeText(existingMePowerKw)} kW / {safeText(existingMeCapacityKwh)} kWh</div>
              </>
            )}
            <div>Moc przyłączeniowa: {safeText(connectionKw)} kW</div>
          </div>
        </div>
      );
    }

    // Step 1 (Panele)
    if (step > 1) {
      blocks.push(
        <div key="s1" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 700 }}>Krok 2: Panele</div>
          <div style={{ marginTop: 4, lineHeight: 1.4 }}>
            <div>WM: {safeText(wm)}</div>
            <div>Opcja paneli: {panelOptionLabel}</div>
            {panelOption !== "none" && panelOption !== "" && (
              <>
                <div>Ilość paneli: {safeText(panelCount)}</div>
                <div>Montaż: {mountLabel}</div>
                {panelSource === "custom" ? (
                  <div>
                    <div>Nazwa: {safeText(customPanelNazwa.trim() || null)}</div>
                    <div>
                      Moc: {safeText(customPanelW)} W
                    {showAllPrices && customPanelW && parseFloat(customPanelW) > 0 && (
                      <>
                        {" "}
                        — Cena: {fmt(calcCustomPanelUnitPrice(parseFloat(customPanelW)))} zł/szt.
                        {" "}+ {fmt(CUSTOM_PANEL_TRANSPORT)} zł transport
                      </>
                    )}
                    </div>
                  </div>
                ) : (
                  <div>
                    Panel: {selectedPanelObj?.name || "—"}{" "}
                    {selectedPanelObj ? `(${selectedPanelObj.powerW}W)` : ""}
                    {showAllPrices && selectedPanelObj && (
                      <> — {fmt(selectedPanelObj.priceNetto)} zł/szt.</>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      );
    }

    // Step 2 (Falownik)
    if (step > 2) {
      blocks.push(
        <div key="s2" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 700 }}>Krok 3: Falownik</div>
          <div style={{ marginTop: 4, lineHeight: 1.4 }}>
            <div>Tryb: {inverterLabel}</div>
            {falownikAction === "wymiana" || falownikAction === "bez_wymiany" ? (
              falownikSource === "custom" ? (
                <div>Źródło: Spoza Listy</div>
              ) : (
                <div>
                  {selectedInverterObj ? (
                    <>
                      {selectedInverterObj.name} ({selectedInverterObj.powerKw} kW)
                      {showAllPrices && (
                        <> — {fmt(selectedInverterObj.priceNetto)} zł</>
                      )}
                    </>
                  ) : (
                    "Wybierz Falownik"
                  )}
                </div>
              )
            ) : null}
            {falPodgladMocKw != null && (
              <div>
                Moc łącznie (falownik): {falPodgladMocKw} kW
                {falownikLine && falownikLine.quantity > 1 && falownikUnitMocKw > 0 && (
                  <> ({falownikUnitMocKw} kW × {falownikLine.quantity})</>
                )}
              </div>
            )}
            {showAllPrices && falownikLine && (
              <div>
                {formatTierBreakdown(falownikLine.unitPrices, fmt)} zł = {fmt(falownikLine.totalPrice)} zł
              </div>
            )}
          </div>
        </div>
      );
    }

    // Step 3 (Magazyn)
    if (step > 3) {
      blocks.push(
        <div key="s3" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 700 }}>Krok 4: Magazyn Energii</div>
          <div style={{ marginTop: 4, lineHeight: 1.4 }}>
            {magazynId === "none" ? (
              <div>Bez magazynu energii</div>
            ) : (
              <>
                <div>{selectedStorageObj?.name || "—"}</div>
                <div>Ilość: {magazynLine?.quantity ?? magazynIlosc} szt.</div>
                <div>
                  {magazynLine
                    ? `Razem: ${magazynLine.totalCapacityKwh} kWh · ${magazynLine.totalPowerKw} kW${
                        magazynLine.quantity > 1 && selectedStorageObj
                          ? ` (${selectedStorageObj.capacityKwh} kWh / ${selectedStorageObj.powerKw} kW × ${magazynLine.quantity})`
                          : ""
                      }`
                    : ""}
                </div>
                {showAllPrices && magazynLine && (
                  <div>{formatTierBreakdown(magazynLine.unitPrices, fmt)} zł = {fmt(magazynLine.totalPrice)} zł</div>
                )}
              </>
            )}
          </div>
        </div>
      );
    }

    // Step 4 (Koszty dodatkowe)
    if (step > 4) {
      const rozdzielnicaIsTak = rozdzielnica === "tak";
      const przekopIsTak = przekop === "tak";
      const metry = parseInt(przekopMetry, 10) || 0;
      const przekopCost = calcPrzekop(metry);
      const klimaTak = klimatyzatorMontaz === "tak";
      const selectedKlima = klimatyzatoryList.filter((k) =>
        selectedKlimatyzatorIds.some((id) => String(id) === String(k.id)),
      );
      const klimaSum = selectedKlima.reduce((s, k) => s + (Number(k.priceNetto) || 0), 0);

      blocks.push(
        <div key="s4" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 700 }}>Krok 5: Koszty Dodatkowe</div>
          <div style={{ marginTop: 4, lineHeight: 1.4 }}>
            <div>
              Przebudowa rozdzielnicy:{" "}
              {rozdzielnicaIsTak ? "TAK" : rozdzielnica === "nie" ? "NIE" : "—"}
              {showAllPrices && rozdzielnicaIsTak && (
                <> (+{fmt(FIXED.rozdzielnica)} zł netto)</>
              )}
            </div>
            <div>
              Przekop: {przekopIsTak ? "TAK" : przekop === "nie" ? "NIE" : "—"}
              {przekopIsTak && (
                <>
                  {" "}
                  {safeText(przekopMetry)} mb
                  {showAllPrices && (
                    <> — {fmt(przekopCost)} zł netto</>
                  )}
                </>
              )}
            </div>
            <div>
              Klimatyzator: {klimaTak ? "TAK" : klimatyzatorMontaz === "nie" ? "NIE" : "—"}
              {klimaTak && selectedKlima.length > 0 && (
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {selectedKlima.map((k) => (
                    <li key={k.id}>
                      {k.name}
                      {showAllPrices && <> — {fmt(k.priceNetto)} zł netto</>}
                    </li>
                  ))}
                </ul>
              )}
              {showAllPrices && klimaTak && selectedKlima.length > 0 && (
                <span style={{ display: "block", marginTop: 4 }}>Razem klimatyzatory: {fmt(klimaSum)} zł netto</span>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="kalk-info-box kalk-info-box--info" style={{ marginBottom: 16 }}>
        <strong>Wybrane parametry</strong>
        <div style={{ marginTop: 8 }}>{blocks}</div>
        {showAllPrices && step > 1 && wmExtra > 0 && (
          <div style={{ marginTop: 10 }}>
            WM: +{fmt(wmExtra)} zł netto
          </div>
        )}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (catalogLoading) {
    return (
      <div className="kalk-wrapper">
        <div className="kalk-loading-catalog">Ładowanie danych katalogowych...</div>
      </div>
    );
  }

  if (catalogError) {
    return (
      <div className="kalk-wrapper">
        <div className="kalk-info-box kalk-info-box--warn">
          {catalogError}
          <button className="kalk-btn kalk-btn--ghost" style={{ marginLeft: 12 }} onClick={loadCatalog}>
            Spróbuj ponownie
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="kalk-wrapper">
      <div className="kalk-header">
        <div className="kalk-title">
          <h1>Kalkulator</h1>
        </div>
        <p className="kalk-subtitle">Wycena instalacji fotowoltaicznych i magazynów energii</p>
      </div>

      {/* Progress bar */}
      <div className="kalk-progress">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <button
              className={`kalk-step-btn${i === step ? " active" : ""}${i < step ? " done" : ""}`}
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
            >
              <span className="kalk-step-num">{i < step ? "+" : i + 1}</span>
              <span className="kalk-step-label">{s}</span>
            </button>
            {i < STEPS.length - 1 && <div className={`kalk-step-line${i < step ? " done" : ""}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Card */}
      <div className="kalk-card">
        {renderPriorSummary()}

        {/* ── Step 0: Istniejąca instalacja ── */}
        {step === 0 && (
          <div className="kalk-section">
            <h2 className="kalk-section-title">Informacje wstępne</h2>

            {/* ── Zrodlo umowy ── */}
            <label className="kalk-label">
              Zrodlo umowy
              <span className="kalk-badge required">wymagane</span>
            </label>
            {leadSources.length === 0 ? (
              <div className="kalk-info-box kalk-info-box--info">
                Brak aktywnych źródeł leadów. Dodaj je w Ustawieniach kalkulatora.
              </div>
            ) : (
              <div className="kalk-radio-group">
                {leadSources.map((src) => (
                  <label
                    key={src.id}
                    className={`kalk-radio-card${selectedLeadSourceId === src.id ? " selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="leadSource"
                      value={src.id}
                      checked={selectedLeadSourceId === src.id}
                      onChange={() => setSelectedLeadSourceId(src.id)}
                    />
                    <span>{src.name}</span>
                    {showAllPrices && src.marketingCost != null && (
                      <span className="kalk-input-hint" style={{ marginTop: 2 }}>
                        {fmt(src.marketingCost)} zł netto
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}

            <div className="kalk-divider" />

            {/* ── Pytanie wstępne: czy klient ma PV ── */}
            <label className="kalk-label">
              Czy klient ma już instalację fotowoltaiczną?
              <span className="kalk-badge required">wymagane</span>
            </label>
            <div className="kalk-radio-group">
              {[
                { val: "tak", label: "Tak — klient ma istniejącą instalację PV" },
                { val: "nie", label: "Nie — nowa instalacja od podstaw" },
              ].map(({ val, label }) => (
                <label key={val} className={`kalk-radio-card${hasPv === val ? " selected" : ""}`}>
                  <input
                    type="radio" name="hasPv" value={val}
                    checked={hasPv === val}
                    onChange={() => {
                      setHasPv(val);
                      if (val === "nie") {
                        setExistingPvKwp("0");
                        setExistingMePowerKw("0");
                        setExistingMeCapacityKwh("0");
                        // nowa instalacja — panele zawsze montujemy (nowy łańcuch)
                        setPanelOption("new_chain");
                        // reset opcji falownika niekompatybilnych z nową instalacją
                        if (falownikAction === "bez_wymiany") {
                          setFalownikAction("");
                          setSelectedFalownik(falownikiList[0]?.id ?? null);
                        }
                      } else {
                        setExistingPvKwp("");
                        setExistingMePowerKw("");
                        setExistingMeCapacityKwh("");
                        // reset wyboru paneli żeby nie zostało "new_chain" z poprzedniego wyboru
                        setPanelOption("");
                      }
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>

            {hasPv !== "" && (
              <>
                <div className="kalk-divider" />

                {hasPv === "tak" && (
                  <>
                    <p className="kalk-section-desc">Podaj parametry obecnej instalacji klienta</p>

                    <label className="kalk-label">
                      Moc istniejącej instalacji PV przyłączonej do OSD (kWp)
                      <span className="kalk-badge required">wymagane</span>
                    </label>
                    <input
                      type="number" min="0" step="0.1"
                      className="kalk-input"
                      placeholder="np. 10"
                      value={existingPvKwp}
                      onChange={(e) => setExistingPvKwp(e.target.value)}
                    />

                    <label className="kalk-label">
                      Moc istniejącego magazynu energii (kW)
                      <span className="kalk-badge required">wymagane</span>
                    </label>
                    <div className="kalk-input-hint">Moc w kilowatach — nie mylić z pojemnością (kWh).</div>
                    <input
                      type="number" min="0" step="0.1"
                      className="kalk-input"
                      placeholder="np. 2,5 (wpisz 0 jeśli brak magazynu)"
                      value={existingMePowerKw}
                      onChange={(e) => setExistingMePowerKw(e.target.value)}
                    />

                    <label className="kalk-label">
                      Pojemność istniejącego magazynu energii (kWh)
                      <span className="kalk-badge required">wymagane</span>
                    </label>
                    <div className="kalk-input-hint">Pole nie wpływa na wycenę — wykorzystane w przyszłych komunikatach.</div>
                    <input
                      type="number" min="0" step="0.01"
                      className="kalk-input"
                      placeholder="np. 5 (wpisz 0 jeśli brak magazynu)"
                      value={existingMeCapacityKwh}
                      onChange={(e) => setExistingMeCapacityKwh(e.target.value)}
                    />
                  </>
                )}

                <label className="kalk-label">
                  Moc przyłączeniowa instalacji PV (kW)
                  <span className="kalk-badge required">wymagane</span>
                </label>
                <input
                  type="number" min="0" step="0.1"
                  className="kalk-input"
                  placeholder="np. 10"
                  value={connectionKw}
                  onChange={(e) => setConnectionKw(e.target.value)}
                />
              </>
            )}
          </div>
        )}

        {/* ── Step 1: Panele ── */}
        {step === 1 && (
          <div className="kalk-section">
            <h2 className="kalk-section-title">Panele fotowoltaiczne</h2>

            <label className="kalk-label">
              WM
              <span className="kalk-badge required">wymagane</span>
            </label>
            <div className="kalk-input-hint">Każde 0,1 = +100 zł netto (wpisz 0 jeśli brak)</div>
            <input
              type="number" min="0" step="0.1"
              className="kalk-input kalk-input--short"
              placeholder="np. 15"
              required
              value={wm}
              onChange={(e) => setWm(e.target.value)}
            />

            <div className="kalk-divider" />

            {hasPv === "nie" ? (
              <div className="kalk-info-box kalk-info-box--info">
                <strong>Nowa instalacja</strong> — panele fotowoltaiczne są zawsze montowane od podstaw.
                Wymagane minimum {MIN_PANELS_NEW_CHAIN} paneli.
              </div>
            ) : (
              <>
                <label className="kalk-label">
                  Czy montujemy panele?
                  <span className="kalk-badge required">wymagane</span>
                </label>
                <div className="kalk-radio-group">
                  {[
                    { val: "none",           label: "Nie dokładamy" },
                    { val: "existing_chain", label: "Dokładamy na istniejącym łańcuchu" },
                    { val: "new_chain",      label: "Dokładamy nowego łańcucha" },
                  ].map(({ val, label }) => (
                    <label key={val} className={`kalk-radio-card${panelOption === val ? " selected" : ""}`}>
                      <input type="radio" name="panelOption" value={val}
                        checked={panelOption === val}
                        onChange={() => setPanelOption(val)} />
                      {label}
                    </label>
                  ))}
                </div>

                {panelOption === "new_chain" && (
                  <div className="kalk-info-box kalk-info-box--info">
                    Przy budowie <strong>nowego łańcucha</strong> wymagane jest minimum {MIN_PANELS_NEW_CHAIN}{" "}
                    paneli — mniejsza liczba nie pozwala przejść dalej.
                  </div>
                )}
              </>
            )}

            {panelOption !== "" && panelOption !== "none" && (
              <>
                <div className="kalk-divider" />
                <label className="kalk-label">Wybierz panele</label>
                <div className="kalk-radio-group">
                  <label className={`kalk-radio-card${panelSource === "list" ? " selected" : ""}`}>
                    <input type="radio" name="panelSource" value="list"
                      checked={panelSource === "list"}
                      onChange={() => setPanelSource("list")} />
                    Z listy
                  </label>
                  <label className={`kalk-radio-card${panelSource === "custom" ? " selected" : ""}`}>
                    <input type="radio" name="panelSource" value="custom"
                      checked={panelSource === "custom"}
                      onChange={() => setPanelSource("custom")} />
                    Spoza listy
                  </label>
                </div>

                {panelSource === "list" && (
                  paneleList.length === 0 ? (
                    <div className="kalk-info-box kalk-info-box--info">Brak aktywnych paneli w katalogu.</div>
                  ) : (
                    <select className="kalk-select" value={selectedPanel ?? ""}
                      onChange={(e) => setSelectedPanel(Number(e.target.value))}>
                      {paneleList.map((p) => (
                        <option key={p.id} value={p.id}>
                      {p.name} – {p.powerW}W
                      {showAllPrices ? ` – ${fmt(p.priceNetto)} zł/szt.` : ""}
                        </option>
                      ))}
                    </select>
                  )
                )}

                {panelSource === "custom" && (
                  <>
                    <div className="kalk-col" style={{ marginTop: 4 }}>
                      <label className="kalk-label kalk-label--sm">
                        Nazwa
                        <span className="kalk-badge required">wymagane</span>
                      </label>
                      <input
                        type="text"
                        className="kalk-input"
                        placeholder="np. Jinko Tiger Neo"
                        value={customPanelNazwa}
                        onChange={(e) => setCustomPanelNazwa(e.target.value)}
                      />
                    </div>
                    <div className="kalk-col" style={{ marginTop: 4 }}>
                      <label className="kalk-label kalk-label--sm">
                        Moc panela (W)
                        <span className="kalk-badge required">wymagane</span>
                      </label>
                      <input
                        type="number" min="1" step="1"
                        className="kalk-input"
                        placeholder="np. 450"
                        required
                        value={customPanelW}
                        onChange={(e) => setCustomPanelW(e.target.value)}
                      />
                    </div>
                    {showAllPrices && customPanelW && parseFloat(customPanelW) > 0 && (
                      <div className="kalk-custom-price-preview">
                        <span>Cena za sztukę:</span>
                        <strong>{fmt(calcCustomPanelUnitPrice(parseFloat(customPanelW)))} zł/szt.</strong>
                        <span className="kalk-custom-price-preview__rule">
                          {parseFloat(customPanelW) <= 400
                            ? "(≤ 400W → 450 zł/szt.)"
                            : `(${parseFloat(customPanelW)} W × 1,2 zł)`}
                        </span>
                        <span className="kalk-custom-price-preview__transport">
                          + {fmt(CUSTOM_PANEL_TRANSPORT)} zł transport i zamówienie (jednorazowo)
                        </span>
                      </div>
                    )}
                  </>
                )}

                <div className="kalk-row kalk-row--top">
                  <div className="kalk-col">
                    <label className="kalk-label kalk-label--sm">Liczba paneli</label>
                    <input
                      type="number"
                      min={panelOption === "new_chain" ? MIN_PANELS_NEW_CHAIN : 1}
                      className="kalk-input"
                      placeholder={panelOption === "new_chain" ? `min. ${MIN_PANELS_NEW_CHAIN}` : "np. 8"}
                      required={panelOption !== "none" && panelOption !== ""}
                      value={panelCount}
                      onChange={(e) => setPanelCount(e.target.value)}
                    />
                  </div>
                  <div className="kalk-col">
                    <label className="kalk-label kalk-label--sm">Typ montażu</label>
                    <select className="kalk-select" value={mountType}
                      onChange={(e) => setMountType(e.target.value)}>
                      <option value="dach">{showAllPrices ? `Dach – ${fmt(CONSTRUCTION.dach)} zł/panel` : "Dach"}</option>
                      <option value="grunt">{showAllPrices ? `Grunt – ${fmt(CONSTRUCTION.grunt)} zł/panel` : "Grunt"}</option>
                    </select>
                  </div>
                </div>

                {panelOption === "new_chain" &&
                  panelCount !== "" &&
                  parseInt(panelCount, 10) >= 1 &&
                  parseInt(panelCount, 10) < MIN_PANELS_NEW_CHAIN && (
                    <div className="kalk-info-box kalk-info-box--warn">
                      Nie ma możliwości zbudowania nowego łańcucha dla mniej niż {MIN_PANELS_NEW_CHAIN} paneli.
                      Wpisz co najmniej {MIN_PANELS_NEW_CHAIN} paneli, aby przejść dalej.
                    </div>
                  )}

                {panelsKwpPreview && (
                  <div className="kalk-kwp-preview" role="status">
                    <span className="kalk-kwp-preview__eq">
                      {panelsKwpPreview.n} × {panelsKwpPreview.powerW} W ={" "}
                      <strong>{fmtKwp(panelsKwpPreview.kwp)} kWp</strong> instalacji
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Step 2: Falownik (Krok 3 w pasku postępu) ── */}
        {step === 2 && (
          <div className="kalk-section">
            <h2 className="kalk-section-title">Falownik</h2>

            <div className="kalk-radio-group">
              <label className={`kalk-radio-card${falownikAction === "wymiana" ? " selected" : ""}`}>
                <input type="radio" name="falownikAction" value="wymiana"
                  checked={falownikAction === "wymiana"}
                  onChange={() => setFalownikAction("wymiana")} />
                {hasPv === "nie" ? "Montaż nowego falownika" : "Wymiana falownika"}
              </label>
              {hasPv !== "nie" && (
                <>
                  <label className={`kalk-radio-card${falownikAction === "bez_wymiany" ? " selected" : ""}`}>
                    <input type="radio" name="falownikAction" value="bez_wymiany"
                      checked={falownikAction === "bez_wymiany"}
                      onChange={() => setFalownikAction("bez_wymiany")} />
                    Nie wymieniamy falownika
                  </label>
                </>
              )}
            </div>

            {falownikAction === "wymiana" && (
              <>
                <div className="kalk-divider" />
                <label className="kalk-label">Wybierz Falownik</label>
                <div className="kalk-radio-group">
                  <label className={`kalk-radio-card${falownikSource === "list" ? " selected" : ""}`}>
                    <input type="radio" name="falownikSource" value="list"
                      checked={falownikSource === "list"}
                      onChange={() => setFalownikSource("list")} />
                    Z Listy
                  </label>
                  <label className={`kalk-radio-card${falownikSource === "custom" ? " selected" : ""}`}>
                    <input type="radio" name="falownikSource" value="custom"
                      checked={falownikSource === "custom"}
                      onChange={() => setFalownikSource("custom")} />
                    Spoza Listy
                  </label>
                </div>

                {falownikSource === "list" && (
                  falownikiList.length === 0 ? (
                    <div className="kalk-info-box kalk-info-box--info">Brak aktywnych falowników w katalogu.</div>
                  ) : (
                    <div className="kalk-falownik-grid">
                      {falownikiList.map((f) => (
                        <label key={f.id}
                          className={`kalk-falownik-card${String(selectedFalownik) === String(f.id) ? " selected" : ""}`}>
                          <input type="radio" name="selectedFalownik" value={f.id}
                            checked={String(selectedFalownik) === String(f.id)}
                            onChange={() => setSelectedFalownik(f.id)} />
                          <span className="kf-name">{f.name}</span>
                          <span className="kf-power">{f.powerKw} kW</span>
                          {showAllPrices && (
                            <span className="kf-price">
                              od {fmt(normalizePriceTiers(f)[0] ?? f.priceNetto)} zł
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  )
                )}

                {falownikSource === "custom" && (
                  <div className="kalk-info-box kalk-info-box--warn">
                    Wybór falownika spoza listy uniemożliwia dobór magazynu energii.
                    Na kolejnym kroku podamy orientacyjną cenę za ME.
                  </div>
                )}
              </>
            )}

            {falownikAction === "bez_wymiany" && (
              <>
                <div className="kalk-divider" />
                <label className="kalk-label">Istniejący Falownik</label>
                <div className="kalk-radio-group">
                  <label className={`kalk-radio-card${falownikSource === "list" ? " selected" : ""}`}>
                    <input type="radio" name="falownikSource" value="list"
                      checked={falownikSource === "list"}
                      onChange={() => setFalownikSource("list")} />
                    Z Listy
                  </label>
                  <label className={`kalk-radio-card${falownikSource === "custom" ? " selected" : ""}`}>
                    <input type="radio" name="falownikSource" value="custom"
                      checked={falownikSource === "custom"}
                      onChange={() => setFalownikSource("custom")} />
                    Spoza Listy
                  </label>
                </div>

                {falownikSource === "list" && (
                  falownikiList.length === 0 ? (
                    <div className="kalk-info-box kalk-info-box--info">Brak aktywnych falowników w katalogu.</div>
                  ) : (
                    <select className="kalk-select" value={selectedFalownik != null ? String(selectedFalownik) : ""}
                      onChange={(e) => {
                        const id = e.target.value;
                        const f = falownikiList.find((x) => String(x.id) === String(id));
                        setSelectedFalownik(f?.id ?? null);
                      }}>
                      {falownikiList.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} – {f.powerKw} kW
                        </option>
                      ))}
                    </select>
                  )
                )}

                {falownikSource === "custom" && (
                  <div className="kalk-info-box kalk-info-box--warn">
                    Falownik spoza listy – wybór baterii nie jest możliwy. Nie dołożymy ME do istniejącej instalacji. Możliwe dołożenie tylko paneli PV.
                  </div>
                )}
              </>
            )}

            {falownikAction !== "" && (
              <>
                <div className="kalk-divider" />
                <label className="kalk-label">Dane Falownika</label>
                <div className="kalk-input-hint">
                  Moc paneli (kW) z falownika: możesz wpisać własną wartość. Przy wyborze z listy domyślnie
                  podpowiadana jest moc z katalogu; przy falowniku spoza listy — wpisz moc ręcznie (kW).
                </div>
                <div className="kalk-row kalk-row--top">
                  <div className="kalk-col">
                    <label className="kalk-label kalk-label--sm" htmlFor="kalk-fal-ilosc">
                      Ilość Falowników
                    </label>
                    <input
                      id="kalk-fal-ilosc"
                      type="number"
                      min={1}
                      step={1}
                      className="kalk-input"
                      value={falownikIlosc}
                      onChange={(e) => setFalownikIlosc(e.target.value)}
                    />
                  </div>
                  <div className="kalk-col">
                    <label className="kalk-label kalk-label--sm" htmlFor="kalk-fal-moc-paneli">
                      Moc Paneli (kW) – Z Falownika
                    </label>
                    <input
                      id="kalk-fal-moc-paneli"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      disabled={!(falownikData || falownikSource === "custom")}
                      className="kalk-input"
                      placeholder="np. 12,5"
                      value={falownikData || falownikSource === "custom" ? falownikMocPaneliKw : "—"}
                      onChange={(e) =>
                        setFalownikMocPaneliKw(e.target.value.replace(/[^\d.,]/g, ""))
                      }
                    />
                  </div>
                  <div className="kalk-col">
                    <label className="kalk-label kalk-label--sm">Moc łącznie</label>
                    <input
                      type="text"
                      readOnly
                      className="kalk-input kalk-input--short"
                      value={
                        falownikLine
                          ? `${falownikLine.totalPowerKw} kW`
                          : falownikUnitMocKw > 0
                            ? `${(
                                Math.round(
                                  falownikUnitMocKw *
                                    Math.max(1, parseInt(falownikIlosc, 10) || 1) *
                                    100,
                                ) / 100
                              )} kW`
                            : "—"
                      }
                    />
                  </div>
                </div>
                {showAllPrices && falownikLine && falownikData && (
                  <div className="kalk-tier-list" style={{ marginTop: 8 }}>
                    {falownikLine.unitPrices.map((p, i) => (
                      <div key={i}>
                        {i + 1}. falownik — {fmt(p)} zł
                      </div>
                    ))}
                    <div className="kalk-tier-list-total">
                      Razem: {formatTierBreakdown(falownikLine.unitPrices, fmt)} zł = {fmt(falownikLine.totalPrice)} zł
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Step 3: Magazyn energii ── */}
        {step === 3 && (
          <div className="kalk-section">
            <h2 className="kalk-section-title">Magazyn energii</h2>

            <label className="kalk-label">Bateria × ilość</label>
            <div className="kalk-input-hint">
              Wybierz model baterii i liczbę sztuk. Pojemność i moc sumują się automatycznie. Cena netto to suma
              cennika progowego (1. bateria + 2. bateria + …).
            </div>
            <div className="kalk-row kalk-row--top">
              <div className="kalk-col">
                <label className="kalk-label kalk-label--sm">Nazwa</label>
                <input
                  type="text"
                  readOnly
                  className="kalk-input"
                  value={magazynData?.name ?? ""}
                  placeholder="—"
                />
              </div>
              <div className="kalk-col">
                <label className="kalk-label kalk-label--sm">Ilość baterii</label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  disabled={magazynId === "none"}
                  className="kalk-input kalk-input--short"
                  value={magazynId !== "none" ? magazynIlosc : ""}
                  onChange={(e) => setMagazynIlosc(e.target.value.replace(/[^\d]/g, ""))}
                />
              </div>
              <div className="kalk-col">
                <label className="kalk-label kalk-label--sm">Pojemność łącznie</label>
                <input
                  type="text"
                  readOnly
                  className="kalk-input kalk-input--short"
                  value={magazynLine ? `${magazynLine.totalCapacityKwh} kWh` : "—"}
                />
              </div>
              <div className="kalk-col">
                <label className="kalk-label kalk-label--sm">Moc łącznie</label>
                <input
                  type="text"
                  readOnly
                  className="kalk-input kalk-input--short"
                  value={magazynLine ? `${magazynLine.totalPowerKw} kW` : "—"}
                />
              </div>
            </div>

            {falownikSource === "custom" ? (
              <div className="kalk-info-box kalk-info-box--warn">
                Falownik spoza listy – wybór baterii nie jest możliwy. Nie dołożymy ME do istniejącej instalacji. Możliwe dołożenie tylko paneli PV.
              </div>
            ) : compatibleMagazyny.length === 0 ? (
              <div className="kalk-info-box kalk-info-box--info">
                Brak kompatybilnych magazynów energii dla wybranego falownika.
              </div>
            ) : (
              <>
                <div className="kalk-divider" />
                <p className="kalk-section-desc">Wybierz z listy kompatybilnych urządzeń lub pomiń</p>
                <div className="kalk-magazyn-grid">
                  <label className={`kalk-magazyn-card${magazynId === "none" ? " selected" : ""}`}>
                    <input type="radio" name="magazynId" value="none"
                      checked={magazynId === "none"}
                      onChange={() => setMagazynId("none")} />
                    <span className="km-name">Bez magazynu energii</span>
                    <span className="km-price">—</span>
                  </label>
                  {compatibleMagazyny.map((m) => {
                    const isSelected = String(magazynId) === String(m.id);
                    return (
                    <label key={m.id}
                      className={`kalk-magazyn-card${isSelected ? " selected" : ""}`}>
                      <input type="radio" name="magazynId" value={m.id}
                        checked={isSelected}
                        onChange={() => setMagazynId(m.id)} />
                      <span className="km-name">{m.name}</span>
                      <span className="km-specs">{m.capacityKwh} kWh · {m.powerKw} kW</span>
                      {m.wagaKg != null && (
                        <span className="km-weight">{m.wagaKg} kg</span>
                      )}
                      {showAllPrices && !isSelected && (
                        <span className="km-price">
                          od {fmt(normalizePriceTiers(m)[0] ?? m.priceNetto)} zł
                        </span>
                      )}
                    </label>
                    );
                  })}
                </div>

                {magazynId !== "none" && magazynLine && showAllPrices && (
                  <div className="kalk-info-box kalk-info-box--info" style={{ marginTop: 16 }}>
                    <strong>Koszt magazynu ({magazynLine.quantity} szt.)</strong>
                    <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.55 }}>
                      <strong>{fmt(magazynLine.totalPrice)} zł netto</strong>
                    </p>
                  </div>
                )}

                {/* Weight warning for selected storage */}
                {magazynId !== "none" && (() => {
                  const sel = compatibleMagazyny.find((m) => String(m.id) === String(magazynId));
                  if (!sel) return null;
                  if (sel.wagaKg != null) {
                    return (
                      <div className="kalk-info-box kalk-info-box--warn" style={{ marginTop: 16 }}>
                        <strong>Uwaga – waga magazynu: {magazynLine?.totalWeightKg ?? sel.wagaKg} kg</strong>
                        <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.55 }}>
                          Zwróć uwagę na miejsce montażu. Magazyn o łącznej wadze ok. <strong>{magazynLine?.totalWeightKg ?? sel.wagaKg} kg</strong> musi być łatwy do wniesienia i zamontowania.
                          Upewnij się, że trasa wniesienia (schody, drzwi, przejścia) pozwala na transport gabarytu tej wagi.
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="kalk-info-box kalk-info-box--info" style={{ marginTop: 16 }}>
                      <strong>Sprawdź wagę i gabaryt magazynu</strong>
                      <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.55 }}>
                        Waga tego modelu nie jest określona w katalogu. Przed montażem sprawdź specyfikację techniczną urządzenia
                        i upewnij się, że trasa wniesienia oraz miejsce montażu pozwalają na bezpieczną instalację.
                      </p>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* ── Step 4: Koszty dodatkowe ── */}
        {step === 4 && (
          <div className="kalk-section">
            <h2 className="kalk-section-title">Koszty dodatkowe</h2>

            <label className="kalk-label">Czy wymaga przebudowy rozdzielnicy?</label>
            <div className="kalk-radio-group">
              <label className={`kalk-radio-card${rozdzielnica === "nie" ? " selected" : ""}`}>
                <input type="radio" name="rozdzielnica" value="nie"
                  checked={rozdzielnica === "nie"}
                  onChange={() => setRozdzielnica("nie")} />
                NIE
              </label>
              <label className={`kalk-radio-card kalk-radio-card--warn${rozdzielnica === "tak" ? " selected" : ""}`}>
                <input type="radio" name="rozdzielnica" value="tak"
                  checked={rozdzielnica === "tak"}
                  onChange={() => setRozdzielnica("tak")} />
                {showAllPrices ? `TAK – +${fmt(FIXED.rozdzielnica)} zł netto` : "TAK"}
              </label>
            </div>

            <div className="kalk-divider" />

            <label className="kalk-label">Czy wymagany jest przekop?</label>
            <div className="kalk-radio-group">
              <label className={`kalk-radio-card${przekop === "nie" ? " selected" : ""}`}>
                <input type="radio" name="przekop" value="nie"
                  checked={przekop === "nie"}
                  onChange={() => setPrzekop("nie")} />
                NIE
              </label>
              <label className={`kalk-radio-card kalk-radio-card--warn${przekop === "tak" ? " selected" : ""}`}>
                <input type="radio" name="przekop" value="tak"
                  checked={przekop === "tak"}
                  onChange={() => setPrzekop("tak")} />
                {showAllPrices ? "TAK – cena wg zakresu" : "TAK"}
              </label>
            </div>

            {przekop === "tak" && (
              <>
                <div className="kalk-inline">
                  <label className="kalk-label kalk-label--sm">Długość przekopu (m)</label>
                  <input type="number" min="1" max="50" className="kalk-input kalk-input--short"
                    placeholder="np. 20"
                    required={przekop === "tak"}
                    value={przekopMetry}
                    onChange={(e) => setPrzekopMetry(e.target.value)} />
                  {showAllPrices && przekopMetry && (
                    <span className="kalk-calc-hint">
                      = {fmt(calcPrzekop(parseInt(przekopMetry) || 0))} zł netto
                    </span>
                  )}
                </div>
                {showAllPrices && (
                  <div className="kalk-info-box kalk-info-box--info" style={{ marginTop: 12 }}>
                    <strong>Cennik przekopu</strong>
                    <table style={{ marginTop: 8, width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign:"left", paddingBottom:4, fontWeight:600 }}>Zakres</th>
                          <th style={{ textAlign:"right", paddingBottom:4, fontWeight:600 }}>Oplata jednorazowa</th>
                          <th style={{ textAlign:"right", paddingBottom:4, fontWeight:600 }}>Cena za 1m</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[["1–10 m", "700,00 zł", "30,00 zł"], ["10–25 m", "1 000,00 zł", "35,00 zł"], ["25–50 m", "1 300,00 zł", "40,00 zł"]].map(([r, j, m]) => (
                          <tr key={r}>
                            <td style={{ padding:"2px 0" }}>{r}</td>
                            <td style={{ textAlign:"right" }}>{j}</td>
                            <td style={{ textAlign:"right" }}>{m}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            <div className="kalk-divider" />

            <label className="kalk-label">Czy chcesz zamontować dodatkowy klimatyzator?</label>
            <div className="kalk-radio-group">
              <label className={`kalk-radio-card${klimatyzatorMontaz === "nie" ? " selected" : ""}`}>
                <input
                  type="radio"
                  name="klimatyzatorMontaz"
                  value="nie"
                  checked={klimatyzatorMontaz === "nie"}
                  onChange={() => {
                    setKlimatyzatorMontaz("nie");
                    setSelectedKlimatyzatorIds([]);
                  }}
                />
                NIE
              </label>
              <label className={`kalk-radio-card kalk-radio-card--warn${klimatyzatorMontaz === "tak" ? " selected" : ""}`}>
                <input
                  type="radio"
                  name="klimatyzatorMontaz"
                  value="tak"
                  checked={klimatyzatorMontaz === "tak"}
                  onChange={() => setKlimatyzatorMontaz("tak")}
                />
                TAK
              </label>
            </div>

            {klimatyzatorMontaz === "tak" && (
              <>
                <div className="kalk-divider" />
                <p className="kalk-section-desc">Wybierz urządzenia z listy</p>
                {klimatyzatoryList.length === 0 ? (
                  <div className="kalk-info-box kalk-info-box--warn">
                    Brak aktywnych klimatyzatorów w katalogu. Dodaj je w Ustawieniach kalkulatora.
                  </div>
                ) : (
                  <div className="kalk-magazyn-grid">
                    {klimatyzatoryList.map((k) => {
                      const selected = selectedKlimatyzatorIds.some((id) => String(id) === String(k.id));
                      return (
                        <label
                          key={k.id}
                          className={`kalk-magazyn-card${selected ? " selected" : ""}`}
                          style={{ cursor: "pointer" }}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleKlimatyzator(k.id)}
                            style={{ marginRight: 8 }}
                          />
                          <span className="km-name">{k.name}</span>
                          {showAllPrices && <span className="km-price">{fmt(k.priceNetto)} zł</span>}
                        </label>
                      );
                    })}
                  </div>
                )}
              </>
            )}

          </div>
        )}

        {/* ── Step 5: Wycena (summary) ── */}
        {step === 5 && (
          <div className="kalk-section">
            <h2 className="kalk-section-title">Podsumowanie wyceny</h2>

            {/* ── Dane klienta ── */}
            <div className="kalk-divider" style={{ marginTop: 0 }} />
            <label className="kalk-label">Dane klienta</label>
            <div className="kalk-row">
              <div className="kalk-col">
                <label className="kalk-label kalk-label--sm">
                  Imię <span className="kalk-required">*</span>
                </label>
                <input
                  type="text"
                  className={`kalk-input${clientName.trim() === "" ? " kalk-input--error" : ""}`}
                  placeholder="np. Jan"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>
              <div className="kalk-col">
                <label className="kalk-label kalk-label--sm">
                  Nazwisko <span className="kalk-required">*</span>
                </label>
                <input
                  type="text"
                  className={`kalk-input${clientSurname.trim() === "" ? " kalk-input--error" : ""}`}
                  placeholder="np. Kowalski"
                  value={clientSurname}
                  onChange={(e) => setClientSurname(e.target.value)}
                />
              </div>
            </div>
            <div className="kalk-divider" />

            {calc.lines.length === 0 ? (
              <div className="kalk-info-box kalk-info-box--info">
                Brak elementów do wyceny. Wróć i uzupełnij parametry.
              </div>
            ) : (
              <>
                {showAllPrices ? (
                  <table className="kalk-table">
                    <thead>
                      <tr>
                        <th>Pozycja</th>
                        <th>Kwota netto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calc.lines.map((l, i) => (
                        <tr key={i} className={l.note ? "kalk-row-margin" : ""}>
                          <td>
                            {l.label}
                            {l.note && <span className="kalk-note"> ({l.note})</span>}
                          </td>
                          <td className="kalk-td-price">{fmt(l.value)} zł</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="kalk-total-row">
                        <td>Razem netto</td>
                        <td className="kalk-td-price">{fmt(calc.total)} zł</td>
                      </tr>
                      <tr className="kalk-brutto-row">
                        <td>Razem brutto ({vatRate}% VAT)</td>
                        <td className="kalk-td-price">{fmt(totalBrutto)} zł</td>
                      </tr>
                    </tfoot>
                  </table>
                ) : (
                  <table className="kalk-table">
                    <thead><tr><th>Razem</th><th>Kwota</th></tr></thead>
                    <tfoot>
                      <tr className="kalk-total-row">
                        <td>Razem netto</td>
                        <td className="kalk-td-price">{fmt(calc.total)} zł</td>
                      </tr>
                      <tr className="kalk-brutto-row">
                        <td>Razem brutto ({vatRate}% VAT)</td>
                        <td className="kalk-td-price">{fmt(totalBrutto)} zł</td>
                      </tr>
                    </tfoot>
                  </table>
                )}

                {/* Stawka VAT */}
                <div className="kalk-divider" />
                <label className="kalk-label">Stawka VAT</label>
                <div className="kalk-radio-group">
                <label className={`kalk-radio-card${vatRate === 8 ? " selected" : ""}`}>
                    <input type="radio" name="vatRate" value="8" checked={vatRate === 8} onChange={() => setVatRate(8)} />
                    8%
                  </label>
                  <label className={`kalk-radio-card${vatRate === 23 ? " selected" : ""}`}>
                    <input type="radio" name="vatRate" value="23" checked={vatRate === 23} onChange={() => setVatRate(23)} />
                    23%
                  </label>
                </div>

                {/* Rabat */}
                <div className="kalk-divider" />
                <label className="kalk-label">Rabat (brutto)</label>
                <div className="kalk-input-hint">Wpisz kwotę rabatu w zł brutto. Zostanie przeliczony na netto i odjęty od WM.</div>
                <div className="kalk-inline">
                  <input
                    type="number" min="0" step="1"
                    className="kalk-input kalk-input--short"
                    placeholder="np. 550"
                    value={rabat}
                    onChange={(e) => setRabat(e.target.value)}
                  />
                  {rabatBrutto > 0 && (
                    <span className="kalk-calc-hint">
                      = {fmt(rabatNetto)} zł netto
                    </span>
                  )}
                </div>

                {rabatBrutto > 0 && (
                  <div className="kalk-rabat-box">
                    <div className="kalk-rabat-row">
                      <span>Cena brutto ({vatRate}% VAT)</span>
                      <strong>{fmt(totalBrutto)} zł</strong>
                    </div>
                    <div className="kalk-rabat-row kalk-rabat-row--discount">
                      <span>Rabat</span>
                      <strong>- {fmt(rabatBrutto)} zł</strong>
                    </div>
                    <div className="kalk-rabat-row kalk-rabat-row--final">
                      <span>Finalna cena dla klienta (brutto)</span>
                      <strong>{fmt(finalBrutto)} zł</strong>
                    </div>
                    <div className="kalk-rabat-divider" />
                    <div className="kalk-rabat-row kalk-rabat-row--sm">
                      <span>Rabat netto (przy {vatRate}% VAT)</span>
                      <span>{fmt(rabatNetto)} zł</span>
                    </div>
                    <div className="kalk-rabat-row kalk-rabat-row--sm">
                      <span>WM przed rabatem</span>
                      <span>{fmt(calc.wmExtra)} zł netto</span>
                    </div>
                    <div className="kalk-rabat-row kalk-rabat-row--sm kalk-rabat-row--wm">
                      <span>WM po rabacie</span>
                      <strong style={{ color: adjustedWmNetto < 0 ? "#c00" : "inherit" }}>
                        {fmt(adjustedWmNetto)} zł netto
                      </strong>
                    </div>
                  </div>
                )}

                {/* Power check */}
                <div className="kalk-divider" />
                <div className="kalk-results-grid">
                  <div className={`kalk-result-card ${calc.canInstallWithoutUpgrade === true ? "kalk-result-card--ok" : calc.canInstallWithoutUpgrade === false ? "kalk-result-card--err" : "kalk-result-card--na"}`}>
                    <div className={`kalk-result-dot ${calc.canInstallWithoutUpgrade === true ? "dot--ok" : calc.canInstallWithoutUpgrade === false ? "dot--err" : "dot--na"}`} />
                    <div className="kalk-result-body">
                      <strong>Moc przyłączeniowa</strong>
                      {calc.canInstallWithoutUpgrade === null ? (
                        <p>Nie podano mocy przyłączeniowej – wróć do kroku 1.</p>
                      ) : (
                        <>
                          <p style={{ margin: "4px 0 2px" }}>
                            Moc PV : <b>{calc.pvKwpCalc?.toFixed(2)} kWp</b>
                            {" · "}Inwerter : <b>{calc.falKwCalc?.toFixed(2)} kW</b>
                            {calc.meKwCalc > 0 && <>{" · "}Magazyn : <b>{calc.meKwCalc?.toFixed(2)} kW</b></>}
                          </p>
                          <p style={{ margin: "2px 0 4px", fontWeight: 600, color: calc.willSum ? "#b45309" : "#15803d" }}>
                            {calc.willSum
                              ? "⚠ Nastąpi zsumowanie mocy PV i magazynu energii"
                              : "✓ Nie nastąpi zsumowanie mocy instalacji PV i magazynu energii"}
                          </p>
                          {calc.canInstallWithoutUpgrade === true && (
                            <p>Instalacja może być zamontowana bez zwiększania mocy przyłączeniowej.<br />
                              Efektywna moc: <b>{calc.effectivePower.toFixed(2)} kW</b> &le; limit {calc.connKw} kW</p>
                          )}
                          {calc.canInstallWithoutUpgrade === false && (
                            <p>Wymagane zwiększenie mocy przyłączeniowej.<br />
                              Efektywna moc: <b>{calc.effectivePower.toFixed(2)} kW</b> &gt; limit {calc.connKw} kW</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {configIssues.length > 0 && (
                    <div className="kalk-result-card kalk-result-card--err">
                      <div className="kalk-result-dot dot--err" />
                      <div className="kalk-result-body">
                        <strong>Zmiany do oferty</strong>
                        <ul style={{ margin: "8px 0 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
                          {configIssues.map((issue, idx) => (
                            <li key={idx}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="kalk-actions-row">
              <button className="kalk-btn kalk-btn--ghost" onClick={reset}>
                Nowa kalkulacja
              </button>
              {calc.lines.length > 0 && (
                <>
                  <button className="kalk-btn kalk-btn--secondary" onClick={saveKalkulation} disabled={saving || !clientDataOk()}>
                    {saving ? "Zapisywanie..." : "Zapisz kalkulację"}
                  </button>
                  <button className="kalk-btn kalk-btn--primary" onClick={generatePdf} disabled={!clientDataOk()}>
                    Generuj PDF
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        {step < STEPS.length - 1 && (
          <div className="kalk-nav">
            {step > 0 && (
              <button className="kalk-btn kalk-btn--ghost" onClick={prev}>← Wróć</button>
            )}
            <button
              className="kalk-btn kalk-btn--primary"
              onClick={next}
              disabled={!canNext()}
            >
              {step === STEPS.length - 2 ? "Oblicz wycenę →" : "Dalej →"}
            </button>
          </div>
        )}
        {step === STEPS.length - 1 && step > 0 && (
          <div className="kalk-nav">
            <button className="kalk-btn kalk-btn--ghost" onClick={prev}>← Wróć</button>
          </div>
        )}
      </div>
    </div>
  );
}
