import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import api from "@/utils/axiosInstance";
import { useAuth } from "@/context/AuthContext";
import { saveWycenaAndDownloadPdf } from "@/utils/kalkulatorPdfApi";
import { computeEffectivePower } from "@/utils/mocPrzylaczeniowaSheet";
import {
  computePrzekopQuote,
  computeTrasaKablowaQuote,
  getCablePriceForType,
  listYakyCableOptions,
  listYkyCableOptions,
  PRZEKOP_PRZEWOD_LABELS,
  formatKopanieZakres,
} from "@/utils/przekopSettings";
import { syncKalkulatorCatalogFromApi } from "@/utils/kalkulatorCatalogSync";
import { computeMontazKwpQuote } from "@/utils/montazKwpSettings";
import { computeMarzaKoncowa } from "@/utils/marzaKoncowaSettings";
import { loadActiveDodatkoweProdukty } from "@/utils/dodatkoweProduktySettings";
import { computeMagazynLine, formatTierBreakdown, normalizePriceTiers } from "@/utils/magazynPricing";
import {
  computeFalownikLine,
  getFalownikUnitMocKw,
  normalizeFalownikRecord,
} from "@/utils/falownikPricing";

/** Koszty bez endpointu w API */
const FIXED = {
  montazME:      2000,
  rozdzielnica:  1500,
};

/** Minimalna liczba paneli przy budowie nowego łańcucha */
const MIN_PANELS_NEW_CHAIN = 7;

const FALOWNIK_TYP_FILTER_OPTIONS = [
  { value: "", label: "Wszystkie typy" },
  { value: "Niskopradowy", label: "Niskonapięciowy" },
  { value: "Wysokopradowy", label: "Wysokonapięciowy" },
];

function falownikCardTitle(f) {
  const name = String(f?.name ?? "").trim();
  const brand = f?.brand != null ? String(f.brand).trim() : "";
  if (!brand) return name;
  if (!name) return brand;
  if (name.toLowerCase().startsWith(brand.toLowerCase())) return name;
  return `${brand} ${name}`;
}

/** Domyślna wartość pola WM (0,1 = +100 zł netto) */
const DEFAULT_WM = "15";

/** Transport paneli spoza listy — brak endpointu w API */
const CUSTOM_PANEL_TRANSPORT = 500;

/** Automatyczna cena jednostkowa dla paneli spoza listy */
function calcCustomPanelUnitPrice(powerW) {
  if (powerW <= 400) return 450;
  return powerW * 1.2;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  const [optymalizatoryList, setOptymalizatoryList] = useState([]);
  const [dodatkoweProduktyList, setDodatkoweProduktyList] = useState([]);
  const [leadSources,        setLeadSources]        = useState([]);
  const [typyMontazuList,    setTypyMontazuList]    = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError,   setCatalogError]   = useState("");
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [kopanieRanges,  setKopanieRanges]  = useState([]);

  // Step 0 – lead source
  const [selectedLeadSourceId, setSelectedLeadSourceId] = useState(null);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const catalog = await syncKalkulatorCatalogFromApi();

      const activeFalowniki = (catalog.falowniki || [])
        .filter((f) => f.isActive !== false)
        .map(normalizeFalownikRecord);
      const activePanele = (catalog.panele || []).filter((p) => p.isActive !== false);
      const activeMagazyny = (catalog.magazyny || []).filter((m) => m.isActive !== false);
      const activeKlimatyzatory = (catalog.klimatyzatory || []).filter(
        (k) => k.isActive !== false,
      );
      const activeSources = (catalog.leadSources || []).filter((s) => s.isActive !== false);
      const activeTypy = (catalog.typyMontazu || []).filter((t) => t.isActive !== false);
      const activeKopanie = (catalog.kopanieRanges || []).filter((r) => r.isActive !== false);

      setFalownikiList(activeFalowniki);
      setPaneleList(activePanele);
      setMagazynyList(activeMagazyny);
      setKlimatyzatoryList(activeKlimatyzatory);
      const activeOptymalizatory = (catalog.optymalizatory || []).filter(
        (o) => o.isActive !== false,
      );
      setOptymalizatoryList(activeOptymalizatory);
      if (activeOptymalizatory.length > 0) {
        setSelectedOptymalizatorId((prev) =>
          prev != null && activeOptymalizatory.some((o) => o.id === prev)
            ? prev
            : activeOptymalizatory[0].id,
        );
      }
      setDodatkoweProduktyList(loadActiveDodatkoweProdukty());
      setLeadSources(activeSources);
      setTypyMontazuList(activeTypy);
      setKopanieRanges(
        [...activeKopanie].sort((a, b) => Number(a.odMetrow) - Number(b.odMetrow)),
      );
      setCatalogVersion((v) => v + 1);

      if (activePanele.length > 0) setSelectedPanel(activePanele[0].id);
      if (activeFalowniki.length > 0) setSelectedFalownik(activeFalowniki[0].id);
      if (activeTypy.length > 0) setMountType(activeTypy[0].id);
    } catch {
      setCatalogError("Nie udało się załadować danych katalogowych");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  useEffect(() => {
    if (step === 4) setDodatkoweProduktyList(loadActiveDodatkoweProdukty());
  }, [step]);

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
  const [mountType,        setMountType]        = useState(null); // ID of selected TypMontazu
  const [optymalizatorCount, setOptymalizatorCount] = useState("0");
  const [selectedOptymalizatorId, setSelectedOptymalizatorId] = useState(null);

  // Step 2 – inverter
  const [falownikAction,   setFalownikAction]   = useState("");
  const [falownikSource,   setFalownikSource]   = useState("list");
  const [selectedFalownik, setSelectedFalownik] = useState(null);
  const [falownikFilterTyp, setFalownikFilterTyp] = useState("");
  const [falownikFilterBrand, setFalownikFilterBrand] = useState("");

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
  const [przekop,           setPrzekop]           = useState("");
  const [przekopMetry,      setPrzekopMetry]      = useState("");
  const [przekopPrzewodTyp, setPrzekopPrzewodTyp] = useState("");
  const [przekopPrzewodReczny, setPrzekopPrzewodReczny] = useState("");
  const [trasaKablowa,           setTrasaKablowa]           = useState("");
  const [trasaKablowaMetry,      setTrasaKablowaMetry]      = useState("");
  const [trasaKablowaReczny,     setTrasaKablowaReczny]     = useState("");
  const [klimatyzatorMontaz, setKlimatyzatorMontaz] = useState("");
  /** id klimatyzatora → ilość (tylko zaznaczone pozycje) */
  const [klimatyzatorQty, setKlimatyzatorQty] = useState({});
  const [dodatkoweProduktyWybor, setDodatkoweProduktyWybor] = useState("");
  /** id produktu → ilość (tylko zaznaczone pozycje) */
  const [dodatkoweProduktyQty, setDodatkoweProduktyQty] = useState({});

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

  const falownikMocLacznieKw = useMemo(() => {
    if (falownikLine?.totalPowerKw > 0) return falownikLine.totalPowerKw;
    if (falownikUnitMocKw > 0) {
      const qty = Math.max(1, parseInt(falownikIlosc, 10) || 1);
      return Math.round(falownikUnitMocKw * qty * 100) / 100;
    }
    return null;
  }, [falownikLine, falownikUnitMocKw, falownikIlosc]);

  const falownikProposal = useMemo(() => {
    if (falownikAction === "" || falownikSource === "custom") return null;
    const qty = Math.max(1, parseInt(String(falownikIlosc), 10) || 1);
    if (!falownikData) {
      return { name: null, qty, totalKw: null };
    }
    return {
      name: falownikData.name,
      qty,
      totalKw: falownikMocLacznieKw,
    };
  }, [falownikAction, falownikSource, falownikData, falownikIlosc, falownikMocLacznieKw]);

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

  const falownikBrandOptions = useMemo(() => {
    const brands = new Set();
    falownikiList.forEach((f) => {
      const b = f.brand != null ? String(f.brand).trim() : "";
      if (b) brands.add(b);
    });
    return [...brands].sort((a, b) => a.localeCompare(b, "pl"));
  }, [falownikiList]);

  const falownikiFiltered = useMemo(() => {
    return falownikiList.filter((f) => {
      if (falownikFilterTyp && f.typ !== falownikFilterTyp) return false;
      if (falownikFilterBrand) {
        const b = f.brand != null ? String(f.brand).trim() : "";
        if (b !== falownikFilterBrand) return false;
      }
      return true;
    });
  }, [falownikiList, falownikFilterTyp, falownikFilterBrand]);

  useEffect(() => {
    if (falownikSource !== "list") return;
    if (selectedFalownik == null) return;
    const visible = falownikiFiltered.some((f) => String(f.id) === String(selectedFalownik));
    if (!visible) {
      setSelectedFalownik(falownikiFiltered[0]?.id ?? null);
    }
  }, [falownikSource, selectedFalownik, falownikiFiltered]);

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

  const magazynRazemZKlientem = useMemo(() => {
    if (magazynId === "none" || !magazynLine) return null;
    const clientKwh =
      hasPv === "tak" ? parseFloat(String(existingMeCapacityKwh).replace(",", ".")) || 0 : 0;
    const clientKw =
      hasPv === "tak" ? parseFloat(String(existingMePowerKw).replace(",", ".")) || 0 : 0;
    return {
      clientKwh,
      clientKw,
      totalKwh: Math.round((magazynLine.totalCapacityKwh + clientKwh) * 100) / 100,
      totalKw: Math.round((magazynLine.totalPowerKw + clientKw) * 100) / 100,
    };
  }, [
    magazynId,
    magazynLine,
    hasPv,
    existingMeCapacityKwh,
    existingMePowerKw,
  ]);

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

  const przekopPvKwp = useMemo(() => {
    const { a8 } = computeEffectivePower({
      existingPvKwp,
      panelCount,
      panelData,
      falownikMocPaneliKw,
      falownikData,
      falownikIlosc,
      magazynData,
      magazynIlosc,
    });
    return a8;
  }, [
    existingPvKwp,
    panelCount,
    panelData,
    falownikMocPaneliKw,
    falownikData,
    falownikIlosc,
    magazynData,
    magazynIlosc,
  ]);

  /** YAKY — od 20 kWp w górę; poniżej 20 kWp opcja widoczna, ale zablokowana */
  const PRZEKOP_ALUMINIUM_MIN_KWP = 20;
  const przekopAluminiumZablokowany = przekopPvKwp < PRZEKOP_ALUMINIUM_MIN_KWP;

  useEffect(() => {
    if (przekop === "tak" && przekopAluminiumZablokowany && przekopPrzewodTyp === "aluminium") {
      setPrzekopPrzewodTyp("miedz");
    }
  }, [przekop, przekopAluminiumZablokowany, przekopPrzewodTyp]);

  const przekopRecommendedCable = useMemo(() => {
    if (przekop !== "tak" || !przekopPrzewodTyp) return "";
    const metry = parseInt(przekopMetry, 10) || 0;
    if (metry < 1) return "";
    return (
      computePrzekopQuote({
        lengthM: metry,
        powerKwp: przekopPvKwp,
        cableType: przekopPrzewodTyp,
      }).cableLabel || ""
    );
  }, [przekop, przekopMetry, przekopPrzewodTyp, przekopPvKwp, catalogVersion]);

  const przekopCableOptions = useMemo(() => {
    if (przekopPrzewodTyp === "miedz") return listYkyCableOptions();
    if (przekopPrzewodTyp === "aluminium") return listYakyCableOptions();
    return [];
  }, [przekopPrzewodTyp, catalogVersion]);

  useEffect(() => {
    if (przekop !== "tak" || !przekopPrzewodTyp) {
      setPrzekopPrzewodReczny("");
      return;
    }
    const metry = parseInt(przekopMetry, 10) || 0;
    if (metry < 1) {
      setPrzekopPrzewodReczny("");
      return;
    }
    setPrzekopPrzewodReczny((prev) => {
      if (prev && przekopCableOptions.includes(prev)) return prev;
      return przekopRecommendedCable || "";
    });
  }, [
    przekop,
    przekopMetry,
    przekopPrzewodTyp,
    przekopRecommendedCable,
    przekopCableOptions,
  ]);

  const przekopQuote = useMemo(() => {
    if (przekop !== "tak" || !przekopPrzewodTyp) return null;
    const metry = parseInt(przekopMetry, 10) || 0;
    if (metry < 1) return null;
    return computePrzekopQuote({
      lengthM: metry,
      powerKwp: przekopPvKwp,
      cableType: przekopPrzewodTyp,
      manualCableLabel: przekopPrzewodReczny,
    });
  }, [
    przekop,
    przekopMetry,
    przekopPrzewodTyp,
    przekopPrzewodReczny,
    przekopPvKwp,
    catalogVersion,
  ]);

  const ykyCableOptions = useMemo(
    () => listYkyCableOptions(),
    [catalogVersion],
  );

  const trasaKablowaQuote = useMemo(() => {
    if (trasaKablowa !== "tak") return null;
    const metry = parseInt(trasaKablowaMetry, 10) || 0;
    if (metry < 1) return null;
    const { a8 } = computeEffectivePower({
      existingPvKwp,
      panelCount,
      panelData,
      falownikMocPaneliKw,
      falownikData,
      falownikIlosc,
      magazynData,
      magazynIlosc,
    });
    return computeTrasaKablowaQuote({
      lengthM: metry,
      powerKwp: a8,
      mode: "reczny",
      manualCableLabel: trasaKablowaReczny,
    });
  }, [
    trasaKablowa,
    trasaKablowaMetry,
    trasaKablowaReczny,
    existingPvKwp,
    panelCount,
    panelData,
    falownikMocPaneliKw,
    falownikData,
    falownikIlosc,
    magazynData,
    magazynIlosc,
    catalogVersion,
  ]);

  const klimatyzatoryWybrane = useMemo(() => {
    if (klimatyzatorMontaz !== "tak") return [];
    return klimatyzatoryList
      .map((k) => {
        const qty = Math.max(0, parseInt(String(klimatyzatorQty[k.id]), 10) || 0);
        if (qty < 1) return null;
        const unit = Number(k.priceNetto) || 0;
        return { ...k, qty, lineTotal: unit * qty };
      })
      .filter(Boolean);
  }, [klimatyzatorMontaz, klimatyzatorQty, klimatyzatoryList]);

  const klimatyzatorySuma = useMemo(
    () => klimatyzatoryWybrane.reduce((s, k) => s + k.lineTotal, 0),
    [klimatyzatoryWybrane],
  );

  const dodatkoweProduktyWybrane = useMemo(() => {
    if (dodatkoweProduktyWybor !== "tak") return [];
    return dodatkoweProduktyList
      .map((p) => {
        const qty = Math.max(0, parseInt(String(dodatkoweProduktyQty[p.id]), 10) || 0);
        if (qty < 1) return null;
        const unit = Number(p.priceNetto) || 0;
        return { ...p, qty, lineTotal: unit * qty };
      })
      .filter(Boolean);
  }, [dodatkoweProduktyWybor, dodatkoweProduktyQty, dodatkoweProduktyList]);

  const dodatkoweProduktySuma = useMemo(
    () => dodatkoweProduktyWybrane.reduce((s, p) => s + p.lineTotal, 0),
    [dodatkoweProduktyWybrane],
  );

  const maxOptymalizatorow = useMemo(() => {
    if (panelOption === "none" || panelOption === "") return 0;
    return Math.max(0, parseInt(panelCount, 10) || 0);
  }, [panelOption, panelCount]);

  const selectedOptymalizator = useMemo(
    () => optymalizatoryList.find((o) => o.id === selectedOptymalizatorId) ?? null,
    [optymalizatoryList, selectedOptymalizatorId],
  );

  const optymalizatorIloscNum = useMemo(
    () => Math.max(0, parseInt(optymalizatorCount, 10) || 0),
    [optymalizatorCount],
  );

  const optymalizatorKwota = useMemo(() => {
    if (optymalizatorIloscNum < 1 || !selectedOptymalizator) return 0;
    return optymalizatorIloscNum * (Number(selectedOptymalizator.priceNetto) || 0);
  }, [optymalizatorIloscNum, selectedOptymalizator]);

  useEffect(() => {
    const n = parseInt(optymalizatorCount, 10);
    if (optymalizatorCount === "" || !Number.isFinite(n) || n < 0) {
      setOptymalizatorCount("0");
      return;
    }
    if (n > maxOptymalizatorow) {
      setOptymalizatorCount(String(maxOptymalizatorow));
    }
  }, [optymalizatorCount, maxOptymalizatorow]);

  useEffect(() => {
    if (optymalizatorIloscNum > 0 && selectedOptymalizatorId == null && optymalizatoryList.length > 0) {
      setSelectedOptymalizatorId(optymalizatoryList[0].id);
    }
  }, [optymalizatorIloscNum, selectedOptymalizatorId, optymalizatoryList]);

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

    const {
      effectivePower,
      willSum,
      a8: pvKwpCalc,
      b8: falKwCalc,
      c8: meKwCalc,
      newPanelsKwp,
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

    // Panels
    const selectedTypMontazuObj = typyMontazuList.find((t) => t.id === mountType) ?? null;
    const constructPricePerPanel = Number(selectedTypMontazuObj?.priceNetto) || 0;
    const constructLabel = selectedTypMontazuObj?.name ?? "Montaż";

    if (panelOption !== "none" && panelOption !== "" && count > 0 && panelData) {
      const panelCost     = count * panelData.price;
      const constructCost = count * constructPricePerPanel;

      add(`Panele (${count} × ${fmt(panelData.price)} zł)`, panelCost);
      add(`Konstrukcja – ${constructLabel} (${count} × ${fmt(constructPricePerPanel)} zł)`, constructCost);

      // Montaż PV — tylko nowa/rozbudowa (bez mocy istniejącej instalacji klienta)
      const montazKwp = computeMontazKwpQuote(newPanelsKwp);
      if (montazKwp.isValid) {
        add(
          `Montaż PV (${fmtKwp(montazKwp.kwp)} kWp × ${fmt(montazKwp.cenaZaKwp)} zł/kWp)`,
          montazKwp.total,
        );
      }

      if (panelSource === "custom") {
        add("Transport i zamówienie paneli spoza listy", CUSTOM_PANEL_TRANSPORT);
      }
    }

    if (optymalizatorIloscNum > 0 && selectedOptymalizator) {
      const unit = Number(selectedOptymalizator.priceNetto) || 0;
      add(
        `Optymalizator – ${selectedOptymalizator.name} (${optymalizatorIloscNum} szt. × ${fmt(unit)} zł)`,
        optymalizatorIloscNum * unit,
      );
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
      add("Montaż magazynu energii", FIXED.montazME);
    }

    // Rozdzielnica
    if (rozdzielnica === "tak") {
      add("Przebudowa rozdzielnicy", FIXED.rozdzielnica);
    }

    // Przekop — przewód + kopanie
    if (przekop === "tak" && przekopQuote?.isValid) {
      add(
        `Przewód ${przekopQuote.cableLabel} (${przekopQuote.lengthM} m × ${fmt(przekopQuote.pricePerM)} zł)`,
        przekopQuote.cableCost,
      );
      add(`Kopanie – przekop ${przekopQuote.lengthM} m`, przekopQuote.kopanieCost);
    }

    if (trasaKablowa === "tak" && trasaKablowaQuote?.isValid) {
      add(
        `Dodatkowa trasa kablowa – ${trasaKablowaQuote.cableLabel} (${trasaKablowaQuote.lengthM} m × ${fmt(trasaKablowaQuote.pricePerM)} zł/m)`,
        trasaKablowaQuote.cableCost,
      );
    }

    if (klimatyzatorMontaz === "tak") {
      klimatyzatoryWybrane.forEach((k) => {
        add(
          `Klimatyzator – ${k.name} (${k.qty} szt. × ${fmt(k.priceNetto)} zł)`,
          k.lineTotal,
        );
      });
    }

    if (dodatkoweProduktyWybor === "tak") {
      dodatkoweProduktyWybrane.forEach((p) => {
        add(
          `Dodatkowy produkt – ${p.name} (${p.qty} szt. × ${fmt(p.priceNetto)} zł)`,
          p.lineTotal,
        );
      });
    }

    // Fixed — 50% if no energy storage (panels/inverter only)
    const fixedRate = magazynData ? 1 : 0.5;
    const selectedLeadSrc = leadSources.find((s) => s.id === selectedLeadSourceId);
    const marketingCost = Number(selectedLeadSrc?.marketingCost) || 0;
    add(
      `Koszty marketingowe${fixedRate < 1 ? " (50% – brak ME)" : ""}${selectedLeadSrc ? ` – ${selectedLeadSrc.name}` : ""}`,
      marketingCost * fixedRate
    );

    // WM margin
    const wmExtra = Math.round(wmVal / 0.1) * 100;
    if (wmExtra > 0) {
      add(`WM (${wmVal} × 1 000 zł)`, wmExtra);
    }

    const razemNettoBazowe = total;
    const marza = computeMarzaKoncowa(razemNettoBazowe);
    if (marza.kwota > 0) {
      add(`Marża końcowa (${marza.percent}%)`, marza.kwota);
    }

    const canInstallWithoutUpgrade = connKw > 0 ? effectivePower <= connKw : null;

    return {
      lines,
      total,
      razemNettoBazowe,
      marzaKoncowaPercent: marza.percent,
      marzaKoncowaKwota: marza.kwota,
      canInstallWithoutUpgrade,
      effectivePower,
      connKw,
      wmExtra,
      willSum,
      pvKwpCalc,
      falKwCalc,
      meKwCalc,
    };
  }, [
    existingPvKwp, connectionKw, wm,
    panelOption, panelData, panelCount, mountType, panelSource,
    optymalizatorIloscNum, selectedOptymalizator,
    typyMontazuList,
    falownikAction, falownikData, falownikLine, falownikMocPaneliKw, falownikSource, falownikIlosc,
    magazynData, magazynIlosc, magazynLine,
    rozdzielnica,
    przekop, przekopMetry, przekopQuote,
    trasaKablowa, trasaKablowaQuote,
    klimatyzatorMontaz, klimatyzatoryWybrane,
    dodatkoweProduktyWybor, dodatkoweProduktyWybrane,
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
      const optCnt = Math.max(0, parseInt(optymalizatorCount, 10) || 0);
      if (optCnt < 0 || optCnt > maxOptymalizatorow) return false;
      if (optCnt > 0) {
        if (optymalizatoryList.length === 0 || selectedOptymalizatorId == null) return false;
        if (!selectedOptymalizator) return false;
      }
      return true;
    }
    if (step === 2) {
      if (falownikAction === "") return false;
      if (!numOk(falownikIlosc, 1) || !Number.isInteger(Number(falownikIlosc))) return false;
      if (falownikAction === "wymiana") {
        if (falownikSource === "list") {
          return (
            falownikiFiltered.length > 0 &&
            selectedFalownik != null &&
            falownikiFiltered.some((f) => String(f.id) === String(selectedFalownik))
          );
        }
        return true;
      }
      if (falownikAction === "bez_wymiany") {
        if (falownikSource === "list") {
          return (
            falownikiFiltered.length > 0 &&
            selectedFalownik != null &&
            falownikiFiltered.some((f) => String(f.id) === String(selectedFalownik))
          );
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
      if (rozdzielnica === "" || przekop === "" || trasaKablowa === "") return false;
      if (przekop === "tak") {
        if (!przekopMetry || parseInt(przekopMetry, 10) < 1) return false;
        if (!przekopPrzewodTyp) return false;
        if (!przekopPrzewodReczny) return false;
        if (!przekopQuote?.isValid) return false;
      }
      if (trasaKablowa === "tak") {
        if (!trasaKablowaMetry || parseInt(trasaKablowaMetry, 10) < 1) return false;
        if (!trasaKablowaReczny) return false;
        if (!trasaKablowaQuote?.isValid) return false;
      }
      if (klimatyzatorMontaz === "") return false;
      if (klimatyzatorMontaz === "tak" && klimatyzatoryWybrane.length === 0) return false;
      if (dodatkoweProduktyWybor === "") return false;
      if (dodatkoweProduktyWybor === "tak" && dodatkoweProduktyWybrane.length === 0) return false;
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
      } else if (
        Math.max(0, parseInt(optymalizatorCount, 10) || 0) >
        maxOptymalizatorow
      ) {
        toast.warn(
          maxOptymalizatorow === 0
            ? "Liczba optymalizatorów może być większa od 0 tylko gdy montujesz panele (podaj ilość paneli)."
            : `Liczba optymalizatorów nie może przekraczać liczby paneli (maks. ${maxOptymalizatorow}).`,
        );
      } else if (
        Math.max(0, parseInt(optymalizatorCount, 10) || 0) > 0 &&
        (optymalizatoryList.length === 0 || !selectedOptymalizator)
      ) {
        toast.warn("Wybierz typ optymalizatora z katalogu (Ustawienia → Optymalizator).");
      } else {
        toast.warn("Uzupełnij WM oraz wybór dotyczący paneli (jeśli dokładasz panele — uzupełnij wszystkie pola paneli).");
      }
    } else if (step === 2) {
      if (falownikAction === "") {
        toast.warn("Wybierz opcję falownika.");
      } else if (!numOk(falownikIlosc, 1) || !Number.isInteger(Number(falownikIlosc))) {
        toast.warn("Podaj całkowitą ilość falowników (minimum 1).");
      } else if (
        falownikSource === "list" &&
        (falownikiFiltered.length === 0 || selectedFalownik == null)
      ) {
        toast.warn(
          falownikiList.length === 0
            ? "Wybierz model falownika z katalogu."
            : "Wybierz model falownika z katalogu (dostosuj filtry marki lub typu).",
        );
      } else {
        toast.warn("Wybierz opcję falownika i — przy wyborze z listy — wskaż model z katalogu.");
      }
    } else if (step === 3) {
      if (!numOk(magazynIlosc, 1) || !Number.isInteger(Number(magazynIlosc))) {
        toast.warn("Podaj całkowitą ilość magazynów energii (minimum 1).");
      }
    } else if (step === 4) {
      if (rozdzielnica === "" || przekop === "" || trasaKablowa === "") {
        toast.warn(
          "Odpowiedz na pytania o rozdzielnicę, przekop, trasę kablową, klimatyzator i dodatkowe produkty.",
        );
      } else if (trasaKablowa === "tak" && (!trasaKablowaMetry || parseInt(trasaKablowaMetry, 10) < 1)) {
        toast.warn("Podaj długość dodatkowej trasy kablowej (min. 1 m).");
      } else if (trasaKablowa === "tak" && !trasaKablowaReczny) {
        toast.warn("Wybierz przewód miedziany (YKY) z cennika.");
      } else if (trasaKablowa === "tak" && !trasaKablowaQuote?.isValid) {
        toast.warn(
          "Nie udało się wycenić trasy kablowej — wybierz przewód YKY z cennika i podaj długość trasy.",
        );
      } else if (klimatyzatorMontaz === "") {
        toast.warn("Odpowiedz na pytanie o klimatyzator.");
      } else if (klimatyzatorMontaz === "tak" && klimatyzatoryWybrane.length === 0) {
        toast.warn("Wybierz co najmniej jedno urządzenie z listy klimatyzatorów.");
      } else if (dodatkoweProduktyWybor === "") {
        toast.warn("Odpowiedz na pytanie o dodatkowe produkty.");
      } else if (dodatkoweProduktyWybor === "tak" && dodatkoweProduktyWybrane.length === 0) {
        toast.warn("Zaznacz co najmniej jeden dodatkowy produkt i podaj ilość (min. 1 szt.).");
      } else if (przekop === "tak" && !przekopPrzewodReczny) {
        toast.warn("Wybierz przewód z listy w sekcji Dobór przewodu (przekop).");
      } else if (przekop === "tak" && !przekopQuote?.isValid) {
        toast.warn(
          "Przy przekopie podaj długość, typ przewodu i wybierz przewód z cennika (posortowane wg przekroju).",
        );
      }
    }
  };

  // ── Rabat (discount) calculations ────────────────────────────────────────
  const rabatBrutto      = parseFloat(rabat) || 0;
  const rabatNetto       = rabatBrutto / vatMultiplier;
  const totalBrutto      = calc.total * vatMultiplier;
  const finalBrutto      = totalBrutto - rabatBrutto;
  const adjustedWmNetto  = calc.wmExtra - rabatNetto;

  const [pdfGenerating, setPdfGenerating] = useState(false);

  const clientDataOk = () => clientName.trim() !== "" && clientSurname.trim() !== "";

  const buildWycenaPayload = () => {
    const razemNetto = parseFloat(calc.total.toFixed(2));
    const razemBruttoVal = parseFloat(totalBrutto.toFixed(2));
    const finalnaKlientBrutto = parseFloat((rabatBrutto > 0 ? finalBrutto : totalBrutto).toFixed(2));
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
          typMontazuId:   panelOption !== "none" ? mountType : null,
          typMontazuName: panelOption !== "none" ? (typyMontazuList.find((t) => t.id === mountType)?.name ?? null) : null,
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
          optymalizator:
            optymalizatorIloscNum > 0 && selectedOptymalizator
              ? {
                  id: selectedOptymalizator.id,
                  nazwa: selectedOptymalizator.name,
                  cenaNetto: selectedOptymalizator.priceNetto,
                  ilosc: optymalizatorIloscNum,
                  kwotaNetto: parseFloat(optymalizatorKwota.toFixed(2)),
                }
              : {
                  ilosc: optymalizatorIloscNum,
                  id: null,
                  nazwa: null,
                  cenaNetto: null,
                  kwotaNetto: 0,
                },
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
          przekopPrzewodTyp: przekop === "tak" ? przekopPrzewodTyp : null,
          przekopPrzewod:     przekopQuote?.cableLabel ?? null,
          przewodCenaZaMetr:  przekopQuote?.pricePerM ?? null,
          przewodKwotaNetto:  przekopQuote?.cableCost ?? null,
          kopanieKwotaNetto:  przekopQuote?.kopanieCost ?? null,
          mocPvKwp:           przekopQuote?.powerKwpActual ?? null,
          mocPvKwpTabela:     przekopQuote?.powerKwpUsed ?? null,
          trasaKablowa:           trasaKablowa,
          trasaKablowaMetry:      trasaKablowa === "tak" ? (parseInt(trasaKablowaMetry, 10) || 0) : 0,
          trasaKablowaTryb:       trasaKablowa === "tak" ? "reczny" : null,
          trasaKablowaPrzewod:    trasaKablowaQuote?.cableLabel ?? null,
          trasaKablowaCenaZaMetr: trasaKablowaQuote?.pricePerM ?? null,
          trasaKablowaKwotaNetto: trasaKablowaQuote?.cableCost ?? null,
          klimatyzator: {
            montaz: klimatyzatorMontaz,
            urzadzenia:
              klimatyzatorMontaz === "tak"
                ? klimatyzatoryWybrane.map((k) => ({
                    id: k.id,
                    nazwa: k.name,
                    cenaNetto: k.priceNetto,
                    ilosc: k.qty,
                    kwotaNetto: parseFloat(k.lineTotal.toFixed(2)),
                  }))
                : [],
            sumaNetto:
              klimatyzatorMontaz === "tak" && klimatyzatorySuma > 0
                ? parseFloat(klimatyzatorySuma.toFixed(2))
                : null,
          },
          dodatkoweProdukty: {
            wybor: dodatkoweProduktyWybor,
            pozycje:
              dodatkoweProduktyWybor === "tak"
                ? dodatkoweProduktyWybrane.map((p) => ({
                    id: p.id,
                    nazwa: p.name,
                    cenaNetto: p.priceNetto,
                    ilosc: p.qty,
                    kwotaNetto: parseFloat(p.lineTotal.toFixed(2)),
                  }))
                : [],
            sumaNetto:
              dodatkoweProduktyWybor === "tak" && dodatkoweProduktySuma > 0
                ? parseFloat(dodatkoweProduktySuma.toFixed(2))
                : null,
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
          razemNettoBazowe:      parseFloat((calc.razemNettoBazowe ?? calc.total).toFixed(2)),
          marzaKoncowaProcent:   calc.marzaKoncowaPercent > 0 ? calc.marzaKoncowaPercent : null,
          marzaKoncowaNetto:    calc.marzaKoncowaKwota > 0 ? parseFloat(calc.marzaKoncowaKwota.toFixed(2)) : null,
          mocEfektywnaKw:        parseFloat(calc.effectivePower.toFixed(2)),
          czyBezZwiekszeniaMocy: calc.canInstallWithoutUpgrade,
          pozycje: calc.lines.map((l) => ({
            nazwa:      l.label,
            kwotaNetto: parseFloat(l.value.toFixed(2)),
            ...(l.note ? { notatka: l.note } : {}),
          })),
        },
      };

    return {
      klientImie: data.klient.imie,
      klientNazwisko: data.klient.nazwisko,
      razemNetto,
      razemBrutto: razemBruttoVal,
      finalnaKlientBrutto,
      data,
    };
  };

  const generatePdf = async () => {
    if (!clientDataOk()) {
      toast.warn("Podaj imię i nazwisko klienta przed generowaniem PDF.");
      return;
    }
    if (selectedLeadSourceId == null) {
      toast.warn("Wybierz źródło klienta przed generowaniem PDF.");
      return;
    }
    setPdfGenerating(true);
    try {
      await saveWycenaAndDownloadPdf(buildWycenaPayload());
      toast.success("Kalkulacja zapisana i PDF pobrany");
    } catch (e) {
      console.error(e);
      toast.error(e.message || e.response?.data?.message || "Nie udało się wygenerować PDF.");
    } finally {
      setPdfGenerating(false);
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
    setPanelCount(""); setMountType(typyMontazuList[0]?.id ?? null);
    setOptymalizatorCount("0");
    setSelectedOptymalizatorId(optymalizatoryList[0]?.id ?? null);
    setFalownikAction(""); setFalownikSource("list");
    setFalownikFilterTyp(""); setFalownikFilterBrand("");
    setSelectedFalownik(falownikiList[0]?.id ?? null);
    setMagazynId("none");
    setMagazynIlosc("1");
    setFalownikIlosc("1");
    setFalownikMocPaneliKw("");
    setRozdzielnica(""); setPrzekop(""); setPrzekopMetry(""); setPrzekopPrzewodTyp("");
    setPrzekopPrzewodReczny("");
    setTrasaKablowa(""); setTrasaKablowaMetry(""); setTrasaKablowaReczny("");
    setKlimatyzatorMontaz(""); setKlimatyzatorQty({});
    setDodatkoweProduktyWybor(""); setDodatkoweProduktyQty({});
    setClientName(""); setClientSurname(""); setRabat(""); setVatRate(23);
  };

  const isKlimatyzatorSelected = (id) => {
    const q = klimatyzatorQty[id];
    return q !== undefined && q !== "" && Math.max(0, parseInt(String(q), 10) || 0) >= 1;
  };

  const toggleKlimatyzator = (id) => {
    setKlimatyzatorQty((prev) => {
      const next = { ...prev };
      if (isKlimatyzatorSelected(id)) {
        delete next[id];
      } else {
        next[id] = "1";
      }
      return next;
    });
  };

  const setKlimatyzatorQtyField = (id, raw) => {
    const cleaned = raw.replace(/[^\d]/g, "");
    setKlimatyzatorQty((prev) => {
      const next = { ...prev };
      if (!cleaned) {
        delete next[id];
        return next;
      }
      next[id] = cleaned;
      return next;
    });
  };

  const isDodatkowyProduktSelected = (id) => {
    const q = dodatkoweProduktyQty[id];
    return q !== undefined && q !== "" && Math.max(0, parseInt(String(q), 10) || 0) >= 1;
  };

  const toggleDodatkowyProdukt = (id) => {
    setDodatkoweProduktyQty((prev) => {
      const next = { ...prev };
      if (isDodatkowyProduktSelected(id)) {
        delete next[id];
      } else {
        next[id] = "1";
      }
      return next;
    });
  };

  const setDodatkowyProduktQty = (id, raw) => {
    const cleaned = raw.replace(/[^\d]/g, "");
    setDodatkoweProduktyQty((prev) => {
      const next = { ...prev };
      if (!cleaned) {
        delete next[id];
        return next;
      }
      next[id] = cleaned;
      return next;
    });
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

    const mountLabel = typyMontazuList.find((t) => t.id === mountType)?.name ?? mountType ?? "—";

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
                {panelsKwpPreview && (
                  <div>
                    Moc instalacji (z paneli): <strong>{fmtKwp(panelsKwpPreview.kwp)} kWp</strong>
                    {" "}
                    ({panelsKwpPreview.n} × {panelsKwpPreview.powerW} W)
                  </div>
                )}
              </>
            )}
            <div>
              Optymalizatory: {optymalizatorIloscNum}
              {optymalizatorIloscNum > 0 && selectedOptymalizator && (
                <>
                  {" "}
                  — {selectedOptymalizator.name}
                  {showAllPrices && (
                    <>
                      {" "}
                      ({optymalizatorIloscNum} szt. × {fmt(selectedOptymalizator.priceNetto)} zł ={" "}
                      {fmt(optymalizatorKwota)} zł netto)
                    </>
                  )}
                </>
              )}
            </div>
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
                Moc Falownika: {falPodgladMocKw} kW
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
      const pq = przekopQuote;
      const tq = trasaKablowaQuote;
      const trasaTak = trasaKablowa === "tak";
      const klimaTak = klimatyzatorMontaz === "tak";
      const dpTak = dodatkoweProduktyWybor === "tak";

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
                  {safeText(przekopMetry)} m
                  {przekopPrzewodTyp && (
                    <> · {PRZEKOP_PRZEWOD_LABELS[przekopPrzewodTyp] ?? przekopPrzewodTyp}</>
                  )}
                  {pq?.cableLabel && <> · {pq.cableLabel}</>}
                  {showAllPrices && pq?.isValid && (
                    <>
                      {" "}
                      — przewód {fmt(pq.cableCost)} zł + kopanie {fmt(pq.kopanieCost)} zł ={" "}
                      {fmt(pq.totalCost)} zł netto
                    </>
                  )}
                </>
              )}
            </div>
            <div>
              Dodatkowa trasa kablowa:{" "}
              {trasaTak ? "TAK" : trasaKablowa === "nie" ? "NIE" : "—"}
              {trasaTak && (
                <>
                  {" "}
                  {safeText(trasaKablowaMetry)} m
                  {tq?.cableLabel && <> · {tq.cableLabel}</>}
                  {showAllPrices && tq?.isValid && (
                    <> — {fmt(tq.cableCost)} zł netto</>
                  )}
                </>
              )}
            </div>
            <div>
              Klimatyzator: {klimaTak ? "TAK" : klimatyzatorMontaz === "nie" ? "NIE" : "—"}
              {klimaTak && klimatyzatoryWybrane.length > 0 && (
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {klimatyzatoryWybrane.map((k) => (
                    <li key={k.id}>
                      {k.name} — {k.qty} szt.
                      {showAllPrices && (
                        <>
                          {" "}
                          × {fmt(k.priceNetto)} zł = {fmt(k.lineTotal)} zł netto
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {showAllPrices && klimaTak && klimatyzatorySuma > 0 && (
                <span style={{ display: "block", marginTop: 4 }}>
                  Razem klimatyzatory: {fmt(klimatyzatorySuma)} zł netto
                </span>
              )}
            </div>
            <div>
              Dodatkowe produkty:{" "}
              {dpTak ? "TAK" : dodatkoweProduktyWybor === "nie" ? "NIE" : "—"}
              {dpTak && dodatkoweProduktyWybrane.length > 0 && (
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {dodatkoweProduktyWybrane.map((p) => (
                    <li key={p.id}>
                      {p.name} — {p.qty} szt.
                      {isAdmin && (
                        <>
                          {" "}
                          ({fmt(p.priceNetto)} zł/szt. = {fmt(p.lineTotal)} zł)
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {isAdmin && dpTak && dodatkoweProduktySuma > 0 && (
                <span style={{ display: "block", marginTop: 4 }}>
                  Razem dodatkowe produkty: {fmt(dodatkoweProduktySuma)} zł netto
                </span>
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
                    <select
                      className="kalk-select"
                      value={mountType ?? ""}
                      onChange={(e) => setMountType(Number(e.target.value) || e.target.value)}
                    >
                      {typyMontazuList.length === 0 && (
                        <option value="">Brak typów montażu</option>
                      )}
                      {typyMontazuList.map((t) => (
                        <option key={t.id} value={t.id}>
                          {showAllPrices ? `${t.name} – ${fmt(t.priceNetto)} zł/panel` : t.name}
                        </option>
                      ))}
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

            <div className="kalk-divider" />

            <label className="kalk-label kalk-label--sm">Liczba optymalizatorów</label>
            <input
              type="number"
              min="0"
              max={maxOptymalizatorow}
              step="1"
              className="kalk-input kalk-input--short"
              placeholder="0"
              value={optymalizatorCount}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d]/g, "");
                setOptymalizatorCount(raw === "" ? "0" : raw);
              }}
            />
            <p className="kalk-input-hint" style={{ marginTop: 4, marginBottom: 12 }}>
              Domyślnie 0. Maksymalnie tyle, ile paneli
              {maxOptymalizatorow > 0 ? ` (${maxOptymalizatorow})` : " (0 — najpierw podaj panele w ofercie)"}.
            </p>

            <label className="kalk-label kalk-label--sm">Typ optymalizatora (z katalogu)</label>
            {optymalizatoryList.length === 0 ? (
              <div className="kalk-info-box kalk-info-box--warn">
                Brak aktywnych optymalizatorów w katalogu. Dodaj je w{" "}
                <strong>Ustawieniach kalkulatora → Optymalizator</strong>.
              </div>
            ) : (
              <select
                className="kalk-select"
                value={selectedOptymalizatorId ?? ""}
                disabled={optymalizatorIloscNum < 1 || maxOptymalizatorow < 1}
                onChange={(e) =>
                  setSelectedOptymalizatorId(Number(e.target.value) || null)
                }
              >
                {optymalizatoryList.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {showAllPrices ? ` — ${fmt(o.priceNetto)} zł/szt.` : ""}
                  </option>
                ))}
              </select>
            )}
            {optymalizatoryList.length > 0 && optymalizatorIloscNum < 1 && maxOptymalizatorow > 0 && (
              <p className="kalk-input-hint" style={{ marginTop: 4 }}>
                Wybierz typ z listy i wpisz liczbę optymalizatorów &gt; 0, aby doliczyć koszt.
              </p>
            )}
            {optymalizatorIloscNum > 0 && selectedOptymalizator && showAllPrices && (
              <div className="kalk-info-box kalk-info-box--info" style={{ marginTop: 8 }}>
                Koszt optymalizatorów:{" "}
                <strong>
                  {optymalizatorIloscNum} × {fmt(selectedOptymalizator.priceNetto)} zł ={" "}
                  {fmt(optymalizatorKwota)} zł netto
                </strong>
              </div>
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
                    <>
                      <div className="kalk-falownik-filters kalk-row kalk-row--top">
                        <div className="kalk-col">
                          <label className="kalk-label kalk-label--sm">Marka</label>
                          <select
                            className="kalk-select"
                            value={falownikFilterBrand}
                            onChange={(e) => setFalownikFilterBrand(e.target.value)}
                          >
                            <option value="">Wszystkie marki</option>
                            {falownikBrandOptions.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="kalk-col">
                          <label className="kalk-label kalk-label--sm">Typ</label>
                          <select
                            className="kalk-select"
                            value={falownikFilterTyp}
                            onChange={(e) => setFalownikFilterTyp(e.target.value)}
                          >
                            {FALOWNIK_TYP_FILTER_OPTIONS.map((o) => (
                              <option key={o.value || "all"} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {falownikiFiltered.length === 0 ? (
                        <div className="kalk-info-box kalk-info-box--warn" style={{ marginTop: 8 }}>
                          Brak falowników dla wybranych filtrów marki i typu.
                        </div>
                      ) : (
                        <div className="kalk-falownik-grid">
                          {falownikiFiltered.map((f) => (
                            <label
                              key={f.id}
                              className={`kalk-falownik-card${String(selectedFalownik) === String(f.id) ? " selected" : ""}`}
                            >
                              <input
                                type="radio"
                                name="selectedFalownik"
                                value={f.id}
                                checked={String(selectedFalownik) === String(f.id)}
                                onChange={() => setSelectedFalownik(f.id)}
                              />
                              <span className="kf-name">{falownikCardTitle(f)}</span>
                              <span className="kf-power">
                                {new Intl.NumberFormat("pl-PL", {
                                  maximumFractionDigits: 2,
                                  minimumFractionDigits: 0,
                                }).format(Number(f.powerKw) || 0)}{" "}
                                kW
                              </span>
                              {showAllPrices && (
                                <span className="kf-price">
                                  {fmt(normalizePriceTiers(f)[0] ?? f.priceNetto)} zł
                                </span>
                              )}
                            </label>
                          ))}
                        </div>
                      )}
                    </>
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
                    <>
                      <div className="kalk-falownik-filters kalk-row kalk-row--top">
                        <div className="kalk-col">
                          <label className="kalk-label kalk-label--sm">Marka</label>
                          <select
                            className="kalk-select"
                            value={falownikFilterBrand}
                            onChange={(e) => setFalownikFilterBrand(e.target.value)}
                          >
                            <option value="">Wszystkie marki</option>
                            {falownikBrandOptions.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="kalk-col">
                          <label className="kalk-label kalk-label--sm">Typ</label>
                          <select
                            className="kalk-select"
                            value={falownikFilterTyp}
                            onChange={(e) => setFalownikFilterTyp(e.target.value)}
                          >
                            {FALOWNIK_TYP_FILTER_OPTIONS.map((o) => (
                              <option key={o.value || "all"} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {falownikiFiltered.length === 0 ? (
                        <div className="kalk-info-box kalk-info-box--warn">
                          Brak falowników dla wybranych filtrów marki i typu.
                        </div>
                      ) : (
                        <select
                          className="kalk-select"
                          value={selectedFalownik != null ? String(selectedFalownik) : ""}
                          onChange={(e) => {
                            const id = e.target.value;
                            const f = falownikiFiltered.find((x) => String(x.id) === String(id));
                            setSelectedFalownik(f?.id ?? null);
                          }}
                        >
                          {falownikiFiltered.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </>
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
                  <div className="kalk-col" style={{ display: "none" }} aria-hidden="true">
                    <label className="kalk-label kalk-label--sm">Moc łącznie</label>
                    <input
                      type="text"
                      readOnly
                      className="kalk-input kalk-input--short"
                      tabIndex={-1}
                      value={
                        falownikMocLacznieKw != null ? `${fmtKwp(falownikMocLacznieKw)} kW` : "—"
                      }
                    />
                  </div>
                </div>
                {falownikProposal && (
                  <div
                    className="kalk-info-box kalk-info-box--info"
                    style={{ marginTop: 16, lineHeight: 1.5 }}
                  >
                    <p style={{ margin: 0 }}>
                      {falownikProposal.name ? (
                        <>
                          Proponujesz u klienta zamontowanie{" "}
                          <strong>{falownikProposal.name}</strong> w ilości{" "}
                          <strong>{falownikProposal.qty}</strong> sztuk
                          {falownikProposal.totalKw != null ? (
                            <>
                              {" "}
                              co da łączną moc{" "}
                              <strong>{fmtKwp(falownikProposal.totalKw)} kW</strong>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <>Wybierz falownik z listy, aby policzyć łączną moc.</>
                      )}
                    </p>
                  </div>
                )}
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
                          {fmt(normalizePriceTiers(m)[0] ?? m.priceNetto)} zł
                        </span>
                      )}
                    </label>
                    );
                  })}
                </div>

                {magazynId !== "none" && magazynData && (
                  <>
                    <div className="kalk-divider" style={{ marginTop: 20 }} />
                    <div className="kalk-row kalk-row--top">
                      <div className="kalk-col">
                        <label className="kalk-label kalk-label--sm">Nazwa</label>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          className="kalk-input kalk-input--readonly"
                          value={magazynData.name ?? ""}
                          placeholder="—"
                        />
                      </div>
                      <div className="kalk-col">
                        <label className="kalk-label kalk-label--sm">Pojemność łącznie</label>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          className="kalk-input kalk-input--short kalk-input--readonly"
                          value={magazynLine ? `${magazynLine.totalCapacityKwh} kWh` : "—"}
                        />
                      </div>
                      <div className="kalk-col">
                        <label className="kalk-label kalk-label--sm">Moc łącznie</label>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          className="kalk-input kalk-input--short kalk-input--readonly"
                          value={magazynLine ? `${magazynLine.totalPowerKw} kW` : "—"}
                        />
                      </div>
                    </div>

                    <label className="kalk-label" htmlFor="kalk-magazyn-ilosc" style={{ marginTop: 16 }}>
                      Wybierz ilość baterii
                    </label>
                    <input
                      id="kalk-magazyn-ilosc"
                      type="number"
                      min="1"
                      max="99"
                      className="kalk-input kalk-input--short"
                      value={magazynIlosc}
                      onChange={(e) => setMagazynIlosc(e.target.value.replace(/[^\d]/g, ""))}
                    />
                    <p className="kalk-input-hint" style={{ marginTop: 6 }}>
                      Pojemność i moc sumują się automatycznie według wybranej liczby sztuk.
                    </p>

                    {magazynLine && (
                      <div
                        className="kalk-info-box kalk-info-box--info"
                        style={{ marginTop: 16, lineHeight: 1.5 }}
                      >
                        <p style={{ margin: 0 }}>
                          Proponujesz u klienta zamontowanie{" "}
                          <strong>{magazynData.name}</strong> w ilości{" "}
                          <strong>{magazynLine.quantity}</strong> sztuk co da łączną pojemność{" "}
                          <strong>{magazynLine.totalCapacityKwh} kWh</strong> oraz moc{" "}
                          <strong>{magazynLine.totalPowerKw} kW</strong>
                        </p>
                        {magazynRazemZKlientem && (
                          <p style={{ margin: "10px 0 0" }}>
                            Łączna pojemność baterii proponowanych + baterie klienta to{" "}
                            <strong>{magazynRazemZKlientem.totalKwh} kWh</strong> oraz moc{" "}
                            <strong>{magazynRazemZKlientem.totalKw} kW</strong>
                            {hasPv === "tak" &&
                              (magazynRazemZKlientem.clientKwh > 0 ||
                                magazynRazemZKlientem.clientKw > 0) && (
                                <>
                                  {" "}
                                  (u klienta: {magazynRazemZKlientem.clientKwh} kWh /{" "}
                                  {magazynRazemZKlientem.clientKw} kW)
                                </>
                              )}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

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
                    const wagaIlosc = magazynLine?.quantity ?? Math.max(1, parseInt(magazynIlosc, 10) || 1);
                    const wagaJednostkowa = Number(sel.wagaKg);
                    const wagaLacznie =
                      magazynLine?.totalWeightKg ??
                      Math.round(wagaJednostkowa * wagaIlosc * 10) / 10;
                    return (
                      <div className="kalk-info-box kalk-info-box--warn" style={{ marginTop: 16 }}>
                        <strong>
                          Uwaga – waga magazynu: {wagaIlosc} × {wagaJednostkowa} kg
                        </strong>
                        <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.55 }}>
                          Zwróć uwagę na miejsce montażu. Magazyn o łącznej wadze ok.{" "}
                          <strong>{wagaLacznie} kg</strong> ({wagaIlosc} × {wagaJednostkowa} kg) musi być łatwy do
                          wniesienia i zamontowania. Upewnij się, że trasa wniesienia (schody, drzwi, przejścia)
                          pozwala na transport gabarytu tej wagi.
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
                  onChange={() => {
                    setPrzekop("nie");
                    setPrzekopPrzewodTyp("");
                    setPrzekopPrzewodReczny("");
                  }} />
                NIE
              </label>
              <label className={`kalk-radio-card kalk-radio-card--warn${przekop === "tak" ? " selected" : ""}`}>
                <input type="radio" name="przekop" value="tak"
                  checked={przekop === "tak"}
                  onChange={() => setPrzekop("tak")} />
                {showAllPrices ? "TAK – przewód + kopanie" : "TAK"}
              </label>
            </div>

            {przekop === "tak" && (
              <>
                <label className="kalk-label kalk-label--sm" style={{ marginTop: 12 }}>Typ przewodu</label>
                <div className="kalk-radio-group">
                  <label className={`kalk-radio-card${przekopPrzewodTyp === "miedz" ? " selected" : ""}`}>
                    <input
                      type="radio"
                      name="przekopPrzewodTyp"
                      value="miedz"
                      checked={przekopPrzewodTyp === "miedz"}
                      onChange={() => setPrzekopPrzewodTyp("miedz")}
                    />
                    Miedziany (YKY)
                  </label>
                  <label
                    className={`kalk-radio-card${przekopPrzewodTyp === "aluminium" ? " selected" : ""}${
                      przekopAluminiumZablokowany ? " kalk-radio-card--disabled" : ""
                    }`}
                    title={
                      przekopAluminiumZablokowany
                        ? "Dostępne od 20 kWp mocy instalacji PV"
                        : undefined
                    }
                  >
                    <input
                      type="radio"
                      name="przekopPrzewodTyp"
                      value="aluminium"
                      checked={przekopPrzewodTyp === "aluminium"}
                      disabled={przekopAluminiumZablokowany}
                      onChange={() => setPrzekopPrzewodTyp("aluminium")}
                    />
                    Aluminiowy (YAKY)
                    {przekopAluminiumZablokowany && (
                      <span className="kalk-radio-card-note">(od 20 kWp)</span>
                    )}
                  </label>
                </div>
                {przekopAluminiumZablokowany && (
                  <p className="kalk-input-hint" style={{ marginTop: 6 }}>
                    Przewód aluminiowy (YAKY) jest dostępny dla instalacji 20 kWp+ (moc instalacji PV:{" "}
                    {fmt(przekopPvKwp)} kWp).
                  </p>
                )}

                <div className="kalk-inline">
                  <label className="kalk-label kalk-label--sm">Długość przekopu (m)</label>
                  <input type="number" min="1" max="100" className="kalk-input kalk-input--short"
                    placeholder="np. 35"
                    required={przekop === "tak"}
                    value={przekopMetry}
                    onChange={(e) => setPrzekopMetry(e.target.value)} />
                </div>
                {przekop === "tak" && (parseInt(przekopMetry, 10) || 0) > 70 && (
                  <div className="kalk-info-box kalk-info-box--warn" style={{ marginTop: 10 }}>
                    Przekop powyżej 70 m na zamowienie
                  </div>
                )}
                {przekopPrzewodTyp && (parseInt(przekopMetry, 10) || 0) >= 1 && (
                  <div className="kalk-info-box kalk-info-box--info" style={{ marginTop: 12 }}>
                    <strong>Dobór przewodu</strong>
                    <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
                      Moc instalacji PV: {fmt(przekopPvKwp)} kWp
                      {przekopQuote &&
                        przekopQuote.powerKwpUsed !== przekopQuote.powerKwpActual && (
                          <> (tabela: {przekopQuote.powerKwpUsed} kWp)</>
                        )}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <label className="kalk-label kalk-label--sm">Przewód</label>
                      <select
                        className="kalk-select"
                        value={przekopPrzewodReczny}
                        onChange={(e) => setPrzekopPrzewodReczny(e.target.value)}
                      >
                        <option value="">— wybierz przewód —</option>
                        {przekopCableOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                            {showAllPrices &&
                              ` — ${fmt(getCablePriceForType(name, przekopPrzewodTyp))} zł/m`}
                          </option>
                        ))}
                      </select>
                    </div>
                    {przekopQuote?.isValid && (
                      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5 }}>
                        {showAllPrices && (
                          <>
                            Przewód: {fmt(przekopQuote.pricePerM)} zł/m × {przekopQuote.lengthM} m ={" "}
                            <strong>{fmt(przekopQuote.cableCost)} zł</strong>
                            <br />
                            Kopanie: <strong>{fmt(przekopQuote.kopanieCost)} zł</strong>
                            <br />
                            Razem: <strong>{fmt(przekopQuote.totalCost)} zł netto</strong>
                          </>
                        )}
                      </div>
                    )}
                    {przekopPrzewodReczny && przekopQuote && !przekopQuote.isValid && (
                      <span style={{ display: "block", marginTop: 8, fontSize: 13, color: "#b45309" }}>
                        Wybierz przewód z cennika lub sprawdź macierz w ustawieniach (Przewody / Przekopy).
                      </span>
                    )}
                    {!przekopRecommendedCable && !przekopPrzewodReczny && (
                      <span style={{ display: "block", marginTop: 8, fontSize: 13, color: "#b45309" }}>
                        Brak rekomendowanego przewodu dla podanej mocy instalacji i długości przekopu.
                        Wybierz przewód z listy (posortowane wg przekroju).
                      </span>
                    )}
                  </div>
                )}

                {showAllPrices && (
                  <div className="kalk-info-box" style={{ marginTop: 10, fontSize: 12 }}>
                    <strong>Cennik kopania</strong>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      {kopanieRanges.map((r) => (
                        <li key={r.id}>
                          {formatKopanieZakres(r.odMetrow, r.doMetrow)} — {fmt(r.priceNetto)} zł
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            <div className="kalk-divider" />

            <label className="kalk-label">Czy jest wymagana dodatkowa trasa kablowa?</label>
            <div className="kalk-radio-group">
              <label className={`kalk-radio-card${trasaKablowa === "nie" ? " selected" : ""}`}>
                <input
                  type="radio"
                  name="trasaKablowa"
                  value="nie"
                  checked={trasaKablowa === "nie"}
                  onChange={() => {
                    setTrasaKablowa("nie");
                    setTrasaKablowaMetry("");
                    setTrasaKablowaReczny("");
                  }}
                />
                NIE
              </label>
              <label className={`kalk-radio-card kalk-radio-card--warn${trasaKablowa === "tak" ? " selected" : ""}`}>
                <input
                  type="radio"
                  name="trasaKablowa"
                  value="tak"
                  checked={trasaKablowa === "tak"}
                  onChange={() => setTrasaKablowa("tak")}
                />
                {showAllPrices ? "TAK – przewód miedziany (YKY)" : "TAK"}
              </label>
            </div>

            {trasaKablowa === "tak" && (
              <>
                <div className="kalk-inline" style={{ marginTop: 12 }}>
                  <label className="kalk-label kalk-label--sm">Długość trasy (m)</label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    className="kalk-input kalk-input--short"
                    placeholder="np. 25"
                    required={trasaKablowa === "tak"}
                    value={trasaKablowaMetry}
                    onChange={(e) => setTrasaKablowaMetry(e.target.value)}
                  />
                </div>

                <div style={{ marginTop: 10 }}>
                  <label className="kalk-label kalk-label--sm">Przewód z cennika (YKY, miedziany)</label>
                  <select
                    className="kalk-select"
                    value={trasaKablowaReczny}
                    onChange={(e) => setTrasaKablowaReczny(e.target.value)}
                  >
                    <option value="">— wybierz przewód —</option>
                    {ykyCableOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                        {showAllPrices && ` — ${fmt(getCablePriceForType(name, "miedz"))} zł/m`}
                      </option>
                    ))}
                  </select>
                </div>

                {trasaKablowaQuote && trasaKablowaMetry && trasaKablowaReczny && (
                  <div className="kalk-info-box kalk-info-box--info" style={{ marginTop: 12 }}>
                    {trasaKablowaQuote.isValid ? (
                      <>
                        <strong>Dobór przewodu — dodatkowa trasa</strong>
                        <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
                          Przewód: <strong>{trasaKablowaQuote.cableLabel}</strong>
                          {showAllPrices && (
                            <>
                              <br />
                              {fmt(trasaKablowaQuote.pricePerM)} zł/m × {trasaKablowaQuote.lengthM} m ={" "}
                              <strong>{fmt(trasaKablowaQuote.cableCost)} zł netto</strong>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <span style={{ fontSize: 13, color: "#b45309" }}>
                        Wybierz przewód YKY z cennika i podaj długość trasy.
                      </span>
                    )}
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
                    setKlimatyzatorQty({});
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
                <p className="kalk-section-desc" style={{ marginTop: 10 }}>
                  Zaznacz produkty z listy i podaj ilość (szt.)
                </p>
                {klimatyzatoryList.length === 0 ? (
                  <div className="kalk-info-box kalk-info-box--warn">
                    Brak aktywnych klimatyzatorów w katalogu. Dodaj je w Ustawieniach kalkulatora.
                  </div>
                ) : (
                  <div className="kalk-dp-panel">
                    <div className="kalk-dp-grid">
                      {klimatyzatoryList.map((k) => {
                        const selected = isKlimatyzatorSelected(k.id);
                        const qtyVal = klimatyzatorQty[k.id] ?? "";
                        const qtyNum = Math.max(1, parseInt(String(qtyVal), 10) || 1);
                        const lineTotal =
                          selected && qtyVal
                            ? (Number(k.priceNetto) || 0) * qtyNum
                            : 0;
                        return (
                          <div
                            key={k.id}
                            className={`kalk-dp-card${selected ? " selected" : ""}`}
                          >
                            <label className="kalk-dp-card-top">
                              <input
                                type="checkbox"
                                className="kalk-dp-card-input"
                                checked={selected}
                                onChange={() => toggleKlimatyzator(k.id)}
                              />
                              <span className="kalk-dp-card-mark" aria-hidden="true" />
                              <span className="kalk-dp-card-info">
                                <span className="kalk-dp-card-name">{k.name}</span>
                                {showAllPrices && (
                                  <span className="kalk-dp-card-price">
                                    {fmt(k.priceNetto)} zł / szt.
                                  </span>
                                )}
                              </span>
                            </label>
                            {selected && (
                              <div
                                className="kalk-dp-card-footer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="kalk-dp-card-footer-label">Ilość</span>
                                <div className="kalk-dp-stepper">
                                  <button
                                    type="button"
                                    className="kalk-dp-stepper-btn"
                                    aria-label="Zmniejsz ilość"
                                    disabled={qtyNum <= 1}
                                    onClick={() =>
                                      setKlimatyzatorQtyField(k.id, String(Math.max(1, qtyNum - 1)))
                                    }
                                  >
                                    −
                                  </button>
                                  <input
                                    id={`klima-qty-${k.id}`}
                                    type="number"
                                    min="1"
                                    max="999"
                                    className="kalk-dp-stepper-input"
                                    value={qtyVal}
                                    onChange={(e) => setKlimatyzatorQtyField(k.id, e.target.value)}
                                  />
                                  <button
                                    type="button"
                                    className="kalk-dp-stepper-btn"
                                    aria-label="Zwiększ ilość"
                                    disabled={qtyNum >= 999}
                                    onClick={() =>
                                      setKlimatyzatorQtyField(k.id, String(Math.min(999, qtyNum + 1)))
                                    }
                                  >
                                    +
                                  </button>
                                </div>
                                {showAllPrices && lineTotal > 0 && (
                                  <span className="kalk-dp-card-total">
                                    {fmt(lineTotal)} zł netto
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {showAllPrices && klimatyzatorySuma > 0 && (
                      <div className="kalk-dp-sum">
                        <strong>Razem klimatyzatory:</strong> {fmt(klimatyzatorySuma)} zł netto
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="kalk-divider" />

            <label className="kalk-label">Czy chesz zamontować ładowarkę samochodową ?</label>
            <div className="kalk-radio-group">
              <label className={`kalk-radio-card${dodatkoweProduktyWybor === "nie" ? " selected" : ""}`}>
                <input
                  type="radio"
                  name="dodatkoweProduktyWybor"
                  value="nie"
                  checked={dodatkoweProduktyWybor === "nie"}
                  onChange={() => {
                    setDodatkoweProduktyWybor("nie");
                    setDodatkoweProduktyQty({});
                  }}
                />
                NIE
              </label>
              <label
                className={`kalk-radio-card kalk-radio-card--warn${
                  dodatkoweProduktyWybor === "tak" ? " selected" : ""
                }`}
              >
                <input
                  type="radio"
                  name="dodatkoweProduktyWybor"
                  value="tak"
                  checked={dodatkoweProduktyWybor === "tak"}
                  onChange={() => setDodatkoweProduktyWybor("tak")}
                />
                TAK
              </label>
            </div>

            {dodatkoweProduktyWybor === "tak" && (
              <>
                <p className="kalk-section-desc" style={{ marginTop: 10 }}>
                  Zaznacz produkty z listy i podaj ilość (szt.)
                </p>
                {dodatkoweProduktyList.length === 0 ? (
                  <div className="kalk-info-box kalk-info-box--warn">
                    Brak aktywnych dodatkowych produktów. Dodaj je w Ustawieniach kalkulatora →
                    Dodatkowe produkty.
                  </div>
                ) : (
                  <div className="kalk-dp-panel">
                    <div className="kalk-dp-grid">
                    {dodatkoweProduktyList.map((p) => {
                      const selected = isDodatkowyProduktSelected(p.id);
                      const qtyVal = dodatkoweProduktyQty[p.id] ?? "";
                      const qtyNum = Math.max(1, parseInt(String(qtyVal), 10) || 1);
                      const lineTotal =
                        selected && qtyVal
                          ? (Number(p.priceNetto) || 0) * qtyNum
                          : 0;
                      return (
                        <div
                          key={p.id}
                          className={`kalk-dp-card${selected ? " selected" : ""}`}
                        >
                          <label className="kalk-dp-card-top">
                            <input
                              type="checkbox"
                              className="kalk-dp-card-input"
                              checked={selected}
                              onChange={() => toggleDodatkowyProdukt(p.id)}
                            />
                            <span className="kalk-dp-card-mark" aria-hidden="true" />
                            <span className="kalk-dp-card-info">
                              <span className="kalk-dp-card-name">{p.name}</span>
                              {showAllPrices && (
                                <span className="kalk-dp-card-price">
                                  {fmt(p.priceNetto)} zł / szt.
                                </span>
                              )}
                            </span>
                          </label>
                          {selected && (
                            <div
                              className="kalk-dp-card-footer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="kalk-dp-card-footer-label">Ilość</span>
                              <div className="kalk-dp-stepper">
                                <button
                                  type="button"
                                  className="kalk-dp-stepper-btn"
                                  aria-label="Zmniejsz ilość"
                                  disabled={qtyNum <= 1}
                                  onClick={() =>
                                    setDodatkowyProduktQty(p.id, String(Math.max(1, qtyNum - 1)))
                                  }
                                >
                                  −
                                </button>
                                <input
                                  id={`dp-qty-${p.id}`}
                                  type="number"
                                  min="1"
                                  max="999"
                                  className="kalk-dp-stepper-input"
                                  value={qtyVal}
                                  onChange={(e) => setDodatkowyProduktQty(p.id, e.target.value)}
                                />
                                <button
                                  type="button"
                                  className="kalk-dp-stepper-btn"
                                  aria-label="Zwiększ ilość"
                                  disabled={qtyNum >= 999}
                                  onClick={() =>
                                    setDodatkowyProduktQty(p.id, String(Math.min(999, qtyNum + 1)))
                                  }
                                >
                                  +
                                </button>
                              </div>
                              {showAllPrices && lineTotal > 0 && (
                                <span className="kalk-dp-card-total">
                                  {fmt(lineTotal)} zł netto
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    </div>
                    {showAllPrices && dodatkoweProduktySuma > 0 && (
                      <div className="kalk-dp-sum">
                        <strong>Razem dodatkowe produkty:</strong> {fmt(dodatkoweProduktySuma)} zł netto
                      </div>
                    )}
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
                      {calc.marzaKoncowaKwota > 0 && (
                        <tr className="kalk-subtotal-row">
                          <td>Suma przed marżą końcową</td>
                          <td className="kalk-td-price">{fmt(calc.razemNettoBazowe)} zł</td>
                        </tr>
                      )}
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
                      {calc.marzaKoncowaKwota > 0 && !isHandlowiec && (
                        <tr className="kalk-subtotal-row">
                          <td>Suma przed marżą końcową</td>
                          <td className="kalk-td-price">{fmt(calc.razemNettoBazowe)} zł</td>
                        </tr>
                      )}
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
                    {!isHandlowiec && (
                      <div className="kalk-rabat-row kalk-rabat-row--sm">
                        <span>WM przed rabatem</span>
                        <span>{fmt(calc.wmExtra)} zł netto</span>
                      </div>
                    )}
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
                <button
                  className="kalk-btn kalk-btn--primary"
                  onClick={generatePdf}
                  disabled={pdfGenerating || !clientDataOk()}
                >
                  {pdfGenerating ? "Generowanie PDF…" : "Generuj i zapisz PDF"}
                </button>
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
