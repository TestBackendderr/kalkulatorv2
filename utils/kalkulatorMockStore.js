const KEYS = {
  falowniki: "k2_falowniki",
  panele: "k2_panele",
  magazyny: "k2_magazyny",
  klimatyzatory: "k2_klimatyzatory",
  leadSources: "k2_lead_sources",
  wyceny: "k2_wyceny",
  counters: "k2_counters",
  seeded: "k2_seeded",
};

function read(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function nextId(counterKey) {
  const counters = read(KEYS.counters, {});
  const id = (counters[counterKey] || 0) + 1;
  counters[counterKey] = id;
  write(KEYS.counters, counters);
  return id;
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem("kalkulatorv2_user");
    if (!raw) return { name: "Demo", email: "demo@sunfee.pl", role: "Handlowiec" };
    return JSON.parse(raw);
  } catch {
    return { name: "Demo", email: "demo@sunfee.pl", role: "Handlowiec" };
  }
}

const SEED_FALOWNIKI = [
  { id: 1, name: "Deye SUN-5K-G03", powerKw: 5, priceNetto: 4500, isActive: true },
  { id: 2, name: "Deye SUN-8K-G03", powerKw: 8, priceNetto: 6200, isActive: true },
  { id: 3, name: "Huawei SUN2000-6KTL", powerKw: 6, priceNetto: 5100, isActive: true },
];

const SEED_PANELE = [
  { id: 1, name: "Jinko Tiger Neo 420W", powerW: 420, priceNetto: 380, isActive: true },
  { id: 2, name: "JA Solar 450W", powerW: 450, priceNetto: 410, isActive: true },
  { id: 3, name: "Trina Vertex 400W", powerW: 400, priceNetto: 350, isActive: true },
];

const SEED_KLIMATYZATORY = [
  { id: 1, name: "Daikin Perfera 3,5 kW", priceNetto: 5500, isActive: true },
  { id: 2, name: "Mitsubishi MSZ-AP35", priceNetto: 4800, isActive: true },
  { id: 3, name: "Samsung WindFree Elite", priceNetto: 5200, isActive: true },
];

const SEED_LEAD_SOURCES = [
  { id: 1, name: "Facebook / Meta", marketingCost: 6000, isActive: true },
  { id: 2, name: "Google Ads", marketingCost: 5500, isActive: true },
  { id: 3, name: "Polecenie", marketingCost: 3000, isActive: true },
  { id: 4, name: "Targi / event", marketingCost: 8000, isActive: true },
];

function seedMagazyny(falowniki) {
  const f1 = falowniki.find((f) => f.id === 1) || falowniki[0];
  const f2 = falowniki.find((f) => f.id === 2) || falowniki[1];
  return [
    {
      id: 1,
      name: "DEYE SG-G5 Pro-B",
      compatibility: "Deye",
      capacityKwh: 5.12,
      powerKw: 2.56,
      wagaKg: 52,
      priceTiers: [3000, 2950, 2940, 2930, 2920, 2910, 2900, 2890],
      priceNetto: 3000,
      falowniki: f1 ? [{ id: f1.id, name: f1.name }] : [],
      isActive: true,
    },
    {
      id: 2,
      name: "Deye SE-G10.2",
      compatibility: "Deye",
      capacityKwh: 10.24,
      powerKw: 5.12,
      wagaKg: 98,
      priceTiers: [22000, 21500, 21000, 20500],
      priceNetto: 22000,
      falowniki: [f1, f2].filter(Boolean).map((f) => ({ id: f.id, name: f.name })),
      isActive: true,
    },
  ];
}

export function ensureSeeded() {
  if (typeof window === "undefined") return;
  if (read(KEYS.seeded, false)) return;

  write(KEYS.falowniki, SEED_FALOWNIKI);
  write(KEYS.panele, SEED_PANELE);
  write(KEYS.leadSources, SEED_LEAD_SOURCES);
  write(KEYS.magazyny, seedMagazyny(SEED_FALOWNIKI));
  write(KEYS.klimatyzatory, SEED_KLIMATYZATORY);
  write(KEYS.wyceny, []);
  write(KEYS.counters, {
    falowniki: 3,
    panele: 3,
    magazyny: 2,
    klimatyzatory: 3,
    leadSources: 4,
    wyceny: 0,
  });
  write(KEYS.seeded, true);
}

function attachFalownikiToMagazyn(magazyn, falownikiIds, allFalowniki) {
  const ids = Array.isArray(falownikiIds) ? falownikiIds : [];
  const falowniki = ids
    .map((id) => allFalowniki.find((f) => f.id === id))
    .filter(Boolean)
    .map((f) => ({ id: f.id, name: f.name }));
  return { ...magazyn, falowniki };
}

function buildOfferNumber(user) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.name ||
    user?.email ||
    "XX";
  const parts = name.split(/\s+/).filter(Boolean);
  const initials =
    parts.length > 0
      ? parts.map((p) => p[0]?.toUpperCase() || "").join("")
      : "XX";
  const wyceny = read(KEYS.wyceny, []);
  const prefix = `${initials}/${year}/${month}/`;
  const sameMonth = wyceny
    .map((w) => w.numerOferty)
    .filter((n) => typeof n === "string" && n.startsWith(prefix));
  let seq = 1;
  for (const n of sameMonth) {
    const m = n.match(/\/(\d+)$/);
    if (m) seq = Math.max(seq, Number(m[1]) + 1);
  }
  return `${prefix}${seq}`;
}

export const mockStore = {
  getFalowniki(onlyActive) {
    ensureSeeded();
    let list = read(KEYS.falowniki, []);
    if (onlyActive) list = list.filter((f) => f.isActive !== false);
    return list;
  },

  createFalownik(payload) {
    ensureSeeded();
    const list = read(KEYS.falowniki, []);
    const item = { id: nextId("falowniki"), ...payload, isActive: payload.isActive !== false };
    list.push(item);
    write(KEYS.falowniki, list);
    return item;
  },

  updateFalownik(id, payload) {
    const list = read(KEYS.falowniki, []);
    const idx = list.findIndex((f) => f.id === id);
    if (idx < 0) throw new Error("Nie znaleziono");
    list[idx] = { ...list[idx], ...payload };
    write(KEYS.falowniki, list);
    return list[idx];
  },

  deactivateFalownik(id) {
    return this.updateFalownik(id, { isActive: false });
  },

  getPanele(onlyActive) {
    ensureSeeded();
    let list = read(KEYS.panele, []);
    if (onlyActive) list = list.filter((p) => p.isActive !== false);
    return list;
  },

  createPanel(payload) {
    ensureSeeded();
    const list = read(KEYS.panele, []);
    const item = { id: nextId("panele"), ...payload, isActive: payload.isActive !== false };
    list.push(item);
    write(KEYS.panele, list);
    return item;
  },

  updatePanel(id, payload) {
    const list = read(KEYS.panele, []);
    const idx = list.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error("Nie znaleziono");
    list[idx] = { ...list[idx], ...payload };
    write(KEYS.panele, list);
    return list[idx];
  },

  deactivatePanel(id) {
    return this.updatePanel(id, { isActive: false });
  },

  getMagazyny(onlyActive) {
    ensureSeeded();
    let list = read(KEYS.magazyny, []);
    list = list.map((m) => {
      const tiers = Array.isArray(m.priceTiers) && m.priceTiers.length
        ? m.priceTiers.map(Number).filter((n) => n > 0)
        : Number(m.priceNetto) > 0
          ? [Number(m.priceNetto)]
          : [];
      return { ...m, priceTiers: tiers, priceNetto: tiers[0] ?? m.priceNetto };
    });
    if (onlyActive) list = list.filter((m) => m.isActive !== false);
    return list;
  },

  createMagazyn(payload) {
    ensureSeeded();
    const allF = read(KEYS.falowniki, []);
    const list = read(KEYS.magazyny, []);
    const { falownikiIds, ...rest } = payload;
    let item = { id: nextId("magazyny"), ...rest, isActive: rest.isActive !== false };
    item = attachFalownikiToMagazyn(item, falownikiIds, allF);
    list.push(item);
    write(KEYS.magazyny, list);
    return item;
  },

  updateMagazyn(id, payload) {
    const allF = read(KEYS.falowniki, []);
    const list = read(KEYS.magazyny, []);
    const idx = list.findIndex((m) => m.id === id);
    if (idx < 0) throw new Error("Nie znaleziono");
    const { falownikiIds, ...rest } = payload;
    let item = { ...list[idx], ...rest };
    if (falownikiIds != null) {
      item = attachFalownikiToMagazyn(item, falownikiIds, allF);
    }
    list[idx] = item;
    write(KEYS.magazyny, list);
    return list[idx];
  },

  deactivateMagazyn(id) {
    return this.updateMagazyn(id, { isActive: false });
  },

  getLeadSources(onlyActive) {
    ensureSeeded();
    let list = read(KEYS.leadSources, []);
    if (onlyActive) list = list.filter((s) => s.isActive !== false);
    return list;
  },

  createLeadSource(payload) {
    ensureSeeded();
    const list = read(KEYS.leadSources, []);
    const item = { id: nextId("leadSources"), ...payload, isActive: payload.isActive !== false };
    list.push(item);
    write(KEYS.leadSources, list);
    return item;
  },

  updateLeadSource(id, payload) {
    const list = read(KEYS.leadSources, []);
    const idx = list.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error("Nie znaleziono");
    list[idx] = { ...list[idx], ...payload };
    write(KEYS.leadSources, list);
    return list[idx];
  },

  deactivateLeadSource(id) {
    return this.updateLeadSource(id, { isActive: false });
  },

  activateLeadSource(id) {
    return this.updateLeadSource(id, { isActive: true });
  },

  getNextOfferNumber() {
    const user = getCurrentUser();
    return { numerOferty: buildOfferNumber(user) };
  },

  listWyceny({ page = 1, limit = 20, klient = "", handlowiec = "" }) {
    ensureSeeded();
    let list = [...read(KEYS.wyceny, [])].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );

    const kl = klient.trim().toLowerCase();
    if (kl) {
      list = list.filter((w) => {
        const s = `${w.klientImie || ""} ${w.klientNazwisko || ""}`.toLowerCase();
        return s.includes(kl);
      });
    }

    const ha = handlowiec.trim().toLowerCase();
    if (ha) {
      list = list.filter((w) => {
        const s = `${w.createdBy?.name || ""} ${w.createdBy?.email || ""}`.toLowerCase();
        return s.includes(ha);
      });
    }

    const total = list.length;
    const start = (page - 1) * limit;
    const data = list.slice(start, start + limit);
    return { data, total };
  },

  getWycena(id) {
    const list = read(KEYS.wyceny, []);
    const item = list.find((w) => w.id === id);
    if (!item) throw new Error("Nie znaleziono kalkulacji");
    return item;
  },

  createWycena(payload) {
    ensureSeeded();
    const user = getCurrentUser();
    const list = read(KEYS.wyceny, []);
    const id = nextId("wyceny");
    const numerOferty = buildOfferNumber(user);
    const item = {
      id,
      numerOferty,
      klientImie: payload.klientImie,
      klientNazwisko: payload.klientNazwisko,
      razemNetto: payload.razemNetto,
      razemBrutto: payload.razemBrutto,
      finalnaKlientBrutto: payload.finalnaKlientBrutto,
      data: payload.data,
      createdAt: new Date().toISOString(),
      createdBy: {
        name: user.name || user.email,
        email: user.email,
      },
    };
    list.push(item);
    write(KEYS.wyceny, list);
    return item;
  },

  deleteWycena(id) {
    const list = read(KEYS.wyceny, []).filter((w) => w.id !== id);
    write(KEYS.wyceny, list);
    return { ok: true };
  },

  getKlimatyzatory(onlyActive) {
    ensureSeeded();
    if (read(KEYS.klimatyzatory, null) == null) {
      write(KEYS.klimatyzatory, SEED_KLIMATYZATORY);
      const counters = read(KEYS.counters, {});
      if (!counters.klimatyzatory) {
        counters.klimatyzatory = SEED_KLIMATYZATORY.length;
        write(KEYS.counters, counters);
      }
    }
    let list = read(KEYS.klimatyzatory, []);
    if (onlyActive) list = list.filter((k) => k.isActive !== false);
    return list;
  },

  createKlimatyzator(payload) {
    ensureSeeded();
    const list = read(KEYS.klimatyzatory, []);
    const item = {
      id: nextId("klimatyzatory"),
      name: payload.name.trim(),
      priceNetto: +payload.priceNetto,
      isActive: payload.isActive !== false,
    };
    list.push(item);
    write(KEYS.klimatyzatory, list);
    return item;
  },

  updateKlimatyzator(id, payload) {
    const list = read(KEYS.klimatyzatory, []);
    const idx = list.findIndex((k) => k.id === id);
    if (idx < 0) throw new Error("Nie znaleziono");
    list[idx] = { ...list[idx], ...payload, name: payload.name?.trim() ?? list[idx].name };
    write(KEYS.klimatyzatory, list);
    return list[idx];
  },

  deactivateKlimatyzator(id) {
    return this.updateKlimatyzator(id, { isActive: false });
  },
};
