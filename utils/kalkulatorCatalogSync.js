import api from "@/utils/axiosInstance";
import {
  saveYkyMatrix,
  saveYakyMatrix,
  saveYkyPrices,
  saveYakyPrices,
  syncKopaniePrzekopCache,
} from "@/utils/przekopSettings";

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
    lsRes,
    tmRes,
    kopRes,
    ykyMatRes,
    yakyMatRes,
    ykyPrRes,
    yakyPrRes,
  ] = await Promise.all([
    api.get("/kalkulator/falowniki?onlyActive=true"),
    api.get("/kalkulator/panele?onlyActive=true"),
    api.get("/kalkulator/magazyny?onlyActive=true"),
    api.get("/kalkulator/klimatyzatory?onlyActive=true"),
    api.get("/lead-sources?onlyActive=true"),
    api.get("/typy-montazu?onlyActive=true"),
    api.get("/kopanie-transei?onlyActive=true"),
    api.get("/przewod-matryca/miedziane"),
    api.get("/przewod-matryca/aluminiowe"),
    api.get("/przewody/miedziane"),
    api.get("/przewody/aluminiowe"),
  ]);

  const ykyMatrix = normalizeApiMatrix(ykyMatRes.data?.matrix);
  const yakyMatrix = normalizeApiMatrix(yakyMatRes.data?.matrix);
  saveYkyMatrix(ykyMatrix);
  saveYakyMatrix(yakyMatrix);
  saveYkyPrices(buildCablePricesMap(ykyPrRes.data));
  saveYakyPrices(buildCablePricesMap(yakyPrRes.data));

  const kopanieRanges = kopRes.data || [];
  syncKopaniePrzekopCache(kopanieRanges);

  return {
    falowniki: fRes.data || [],
    panele: pRes.data || [],
    magazyny: mRes.data || [],
    klimatyzatory: kRes.data || [],
    leadSources: lsRes.data || [],
    typyMontazu: tmRes.data || [],
    kopanieRanges,
  };
}
