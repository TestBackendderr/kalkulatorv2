import { mockStore } from "./kalkulatorMockStore";

const delay = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function parseUrl(url) {
  const [path, queryStr] = String(url).split("?");
  const params = new URLSearchParams(queryStr || "");
  return { path, params };
}

function parseId(path, prefix) {
  const m = path.match(new RegExp(`^${prefix}/(\\d+)$`));
  return m ? Number(m[1]) : null;
}

async function handleRequest(method, url, body) {
  await delay();
  const { path, params } = parseUrl(url);
  const onlyActive = params.get("onlyActive") === "true";

  try {
    // ── Wyceny ──
    if (method === "GET" && path === "/kalkulator/wyceny/next-number") {
      return { data: mockStore.getNextOfferNumber() };
    }

    if (method === "GET" && path === "/kalkulator/wyceny") {
      const page = Number(params.get("page")) || 1;
      const limit = Number(params.get("limit")) || 20;
      const klient = params.get("klient") || "";
      const handlowiec = params.get("handlowiec") || "";
      return { data: mockStore.listWyceny({ page, limit, klient, handlowiec }) };
    }

    const wycenaId = parseId(path, "/kalkulator/wyceny");
    if (method === "GET" && wycenaId) {
      return { data: mockStore.getWycena(wycenaId) };
    }
    if (method === "POST" && path === "/kalkulator/wyceny") {
      return { data: mockStore.createWycena(body) };
    }
    if (method === "DELETE" && wycenaId) {
      return { data: mockStore.deleteWycena(wycenaId) };
    }

    // ── Falowniki ──
    if (path === "/kalkulator/falowniki") {
      if (method === "GET") return { data: mockStore.getFalowniki(onlyActive) };
      if (method === "POST") return { data: mockStore.createFalownik(body) };
    }
    const falId = parseId(path, "/kalkulator/falowniki");
    if (falId) {
      if (method === "PATCH") return { data: mockStore.updateFalownik(falId, body) };
      if (method === "DELETE") return { data: mockStore.deactivateFalownik(falId) };
    }

    // ── Panele ──
    if (path === "/kalkulator/panele") {
      if (method === "GET") return { data: mockStore.getPanele(onlyActive) };
      if (method === "POST") return { data: mockStore.createPanel(body) };
    }
    const panelId = parseId(path, "/kalkulator/panele");
    if (panelId) {
      if (method === "PATCH") return { data: mockStore.updatePanel(panelId, body) };
      if (method === "DELETE") return { data: mockStore.deactivatePanel(panelId) };
    }

    // ── Magazyny ──
    if (path === "/kalkulator/magazyny") {
      if (method === "GET") return { data: mockStore.getMagazyny(onlyActive) };
      if (method === "POST") return { data: mockStore.createMagazyn(body) };
    }
    const magId = parseId(path, "/kalkulator/magazyny");
    if (magId) {
      if (method === "PATCH") return { data: mockStore.updateMagazyn(magId, body) };
      if (method === "DELETE") return { data: mockStore.deactivateMagazyn(magId) };
    }

    // ── Klimatyzatory ──
    if (path === "/kalkulator/klimatyzatory") {
      if (method === "GET") return { data: mockStore.getKlimatyzatory(onlyActive) };
      if (method === "POST") return { data: mockStore.createKlimatyzator(body) };
    }
    const klimId = parseId(path, "/kalkulator/klimatyzatory");
    if (klimId) {
      if (method === "PATCH") return { data: mockStore.updateKlimatyzator(klimId, body) };
      if (method === "DELETE") return { data: mockStore.deactivateKlimatyzator(klimId) };
    }

    // ── Lead sources ──
    if (path === "/lead-sources") {
      if (method === "GET") return { data: mockStore.getLeadSources(onlyActive) };
      if (method === "POST") return { data: mockStore.createLeadSource(body) };
    }
    const lsActivate = path.match(/^\/lead-sources\/(\d+)\/activate$/);
    if (lsActivate && method === "PATCH") {
      return { data: mockStore.activateLeadSource(Number(lsActivate[1])) };
    }
    const lsId = parseId(path, "/lead-sources");
    if (lsId) {
      if (method === "PATCH") return { data: mockStore.updateLeadSource(lsId, body) };
      if (method === "DELETE") return { data: mockStore.deactivateLeadSource(lsId) };
    }

    const err = new Error(`Mock API: nieobsługiwane ${method} ${path}`);
    err.response = { status: 404, data: { message: err.message } };
    throw err;
  } catch (e) {
    if (e.response) throw e;
    const err = new Error(e.message || "Błąd mock API");
    err.response = { status: 400, data: { message: err.message } };
    throw err;
  }
}

export function createMockApi() {
  const api = {
    get: (url, config) => handleRequest("GET", url, config?.data),
    post: (url, data, config) => handleRequest("POST", url, data ?? config?.data),
    patch: (url, data, config) => handleRequest("PATCH", url, data ?? config?.data),
    delete: (url, config) => handleRequest("DELETE", url, config?.data),
    interceptors: {
      request: { use: () => {} },
      response: { use: () => {} },
    },
  };
  return api;
}
