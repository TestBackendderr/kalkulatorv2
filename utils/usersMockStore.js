const USERS_KEY = "k2_users";
const USERS_COUNTER = "k2_users_counter";
const USERS_SEEDED = "k2_users_seeded";

const ROLES = ["Handlowiec", "Administrator"];

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

function nextId() {
  const id = (read(USERS_COUNTER, 0) || 0) + 1;
  write(USERS_COUNTER, id);
  return id;
}

function toSessionUser(record) {
  return {
    id: record.id,
    email: record.email,
    role: record.role,
    name: [record.imie, record.nazwisko].filter(Boolean).join(" ").trim() || record.email,
    firstName: record.imie,
    lastName: record.nazwisko,
  };
}

const SEED_USERS = [
  {
    id: 1,
    imie: "Admin",
    nazwisko: "System",
    email: "admin@sunfee.pl",
    haslo: "admin",
    role: "Administrator",
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    imie: "Jan",
    nazwisko: "Kowalski",
    email: "handlowiec@sunfee.pl",
    haslo: "handlowiec",
    role: "Handlowiec",
    createdAt: new Date().toISOString(),
  },
];

export function ensureUsersSeeded() {
  if (typeof window === "undefined") return;
  if (read(USERS_SEEDED, false)) return;
  write(USERS_KEY, SEED_USERS);
  write(USERS_COUNTER, 2);
  write(USERS_SEEDED, true);
}

export function getAllUsers() {
  ensureUsersSeeded();
  return read(USERS_KEY, []);
}

export function authenticateUser(email, password) {
  ensureUsersSeeded();
  const normalized = String(email || "").trim().toLowerCase();
  const pass = String(password || "");
  const found = getAllUsers().find(
    (u) => u.email.trim().toLowerCase() === normalized && u.haslo === pass,
  );
  return found ? toSessionUser(found) : null;
}

export function createUser({ imie, nazwisko, email, haslo, role }) {
  ensureUsersSeeded();
  const list = getAllUsers();
  const normalized = String(email || "").trim().toLowerCase();

  if (list.some((u) => u.email.trim().toLowerCase() === normalized)) {
    throw new Error("Użytkownik z tym adresem email już istnieje");
  }

  if (!ROLES.includes(role)) {
    throw new Error("Nieprawidłowa rola");
  }

  const item = {
    id: nextId(),
    imie: String(imie || "").trim(),
    nazwisko: String(nazwisko || "").trim(),
    email: String(email || "").trim(),
    haslo: String(haslo || ""),
    role,
    createdAt: new Date().toISOString(),
  };

  list.push(item);
  write(USERS_KEY, list);
  return item;
}

export function searchUsers(query) {
  const q = String(query || "").trim().toLowerCase();
  const list = getAllUsers();
  if (!q) return list;

  return list.filter((u) => {
    const hay = [
      u.imie,
      u.nazwisko,
      u.email,
      u.role,
      `${u.imie} ${u.nazwisko}`,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function getRoleLabel(role) {
  if (role === "Handlowiec") return "Dział Handlowy";
  if (role === "Administrator") return "Administrator";
  return role;
}
