import api from "@/utils/axiosInstance";
import {
  saveYkyMatrix,
  saveYakyMatrix,
  saveYkyPrices,
  saveYakyPrices,
  syncKopaniePrzekopCache,
} from "@/utils/przekopSettings";
import { syncMontazKwpCache } from "@/utils/montazKwpSettings";
import { syncMarzaKoncowaCache } from "@/utils/marzaKoncowaSettings";

/** API matrix → { [dlugoscId]: { [kwp]: nazwa } } */
export function normalizeApiMatrix(apiMatrix) {
  if (!apiMatrix || typeof apiMatrix !== "object") return {};
  const result = {};
  for (const [dlugoscId, rowObj] of Object.entries(apiMatrix)) {
    result[dlugoscId] = {};
    for (const [kwpStr, name] of Object.entries(rowObj || {})) {
      result[dlugoscId][Number(kwpStr)] = name ?? "";
    }
  }
  return result;
}

function buildCablePricesMap(items) {
  const out = {};
  (items || []).forEach((p) => {
    if (p.isActive !== false && Number(p.cenaZaMetr) > 0) {
      out[p.name] = Number(p.cenaZaMetr);
    }
  });
  return out;
}

/**
 * Pobiera wszystkie dane z ustawień kalkulatora (backend) i synchronizuje cache
 * localStorage dla synchronicznych obliczeń (przekop / przewody).
 */
export async function syncKalkulatorCatalogFromApi() {
  const [
    fRes,
    pRes,
    mRes,
    kRes,
    optRes,
    ladowarkiRes,
    dodatkoweProduktyRes,
    lsRes,
    tmRes,
    kopRes,
    ykyMatRes,
    yakyMatRes,
    ykyPrRes,
    yakyPrRes,
    montazRes,
    marzaRes,
  ] = await Promise.all([
    api.get("/kalkulator/falowniki?onlyActive=true"),
    api.get("/kalkulator/panele?onlyActive=true"),
    api.get("/kalkulator/magazyny?onlyActive=true"),
    api.get("/kalkulator/klimatyzatory?onlyActive=true"),
    api.get("/optymalizatory?onlyActive=true"),
    api.get("/ladowarki-samochodowe?onlyActive=true"),
    api.get("/dodatkowe-produkty?onlyActive=true"),
    api.get("/lead-sources?onlyActive=true"),
    api.get("/typy-montazu?onlyActive=true"),
    api.get("/kopanie-transei?onlyActive=true"),
    api.get("/przewod-matryca/miedziane"),
    api.get("/przewod-matryca/aluminiowe"),
    api.get("/przewody/miedziane"),
    api.get("/przewody/aluminiowe"),
    api.get("/cena-montazu?onlyActive=true"),
    api.get("/marza-koncowa/aktualna").catch((err) =>
      err?.response?.status === 404 ? { data: null } : Promise.reject(err),
    ),
  ]);

  const ykyMatrix = normalizeApiMatrix(ykyMatRes.data?.matrix);
  const yakyMatrix = normalizeApiMatrix(yakyMatRes.data?.matrix);
  saveYkyMatrix(ykyMatrix);
  saveYakyMatrix(yakyMatrix);
  saveYkyPrices(buildCablePricesMap(ykyPrRes.data));
  saveYakyPrices(buildCablePricesMap(yakyPrRes.data));

  const kopanieRanges = kopRes.data || [];
  syncKopaniePrzekopCache(kopanieRanges);

  const montazRanges = montazRes.data || [];
  syncMontazKwpCache(montazRanges);

  if (marzaRes.data) {
    syncMarzaKoncowaCache(marzaRes.data);
  } else {
    syncMarzaKoncowaCache({ wartosc: 0 });
  }

  return {
    falowniki: fRes.data || [],
    panele: pRes.data || [],
    magazyny: mRes.data || [],
    klimatyzatory: kRes.data || [],
    optymalizatory: optRes.data || [],
    ladowarkiSamochodowe: ladowarkiRes.data || [],
    dodatkoweProdukty: dodatkoweProduktyRes.data || [],
    leadSources: lsRes.data || [],
    typyMontazu: tmRes.data || [],
    kopanieRanges,
    montazRanges,
    marzaKoncowa: marzaRes.data,
  };
}
