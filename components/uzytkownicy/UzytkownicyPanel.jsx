import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-toastify";
import api from "@/utils/axiosInstance";

const ROLE_LABELS = {
  Administrator: "Administrator",
  Handlowiec: "Dział Handlowy",
};

function getRoleLabel(role) {
  return ROLE_LABELS[role] || role || "—";
}

function extractListFromResponse(payload) {
  if (Array.isArray(payload)) return { items: payload, total: payload.length };
  if (Array.isArray(payload?.data)) {
    return {
      items: payload.data,
      total: payload.meta?.total ?? payload.total ?? payload.data.length,
    };
  }
  if (Array.isArray(payload?.items)) {
    return {
      items: payload.items,
      total: payload.total ?? payload.items.length,
    };
  }
  return { items: [], total: 0 };
}

function extractApiError(err, fallback) {
  const msg = err?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === "string" && msg.trim()) return msg;
  return fallback;
}

const EMPTY_FORM = {
  imie: "",
  nazwisko: "",
  email: "",
  haslo: "",
  rola: "Handlowiec",
};

const SEARCH_DEBOUNCE_MS = 350;

export default function UzytkownicyPanel() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const debounceRef = useRef(null);

  const load = useCallback(async (szukaj) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("strona", "1");
      params.set("naStronie", "100");
      const trimmed = (szukaj || "").trim();
      if (trimmed) params.set("szukaj", trimmed);

      const res = await api.get(`/users?${params.toString()}`);
      const { items } = extractListFromResponse(res.data);
      setUsers(items);
    } catch (err) {
      toast.error(extractApiError(err, "Nie udało się pobrać użytkowników"));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  const triggerSearch = (value) => {
    setSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      load(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const validate = () => {
    if (!form.imie.trim()) {
      toast.warn("Imię jest wymagane");
      return false;
    }
    if (!form.nazwisko.trim()) {
      toast.warn("Nazwisko jest wymagane");
      return false;
    }
    if (!form.email.trim()) {
      toast.warn("Email jest wymagany");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast.warn("Nieprawidłowy adres email");
      return false;
    }
    if (!form.haslo.trim()) {
      toast.warn("Hasło jest wymagane");
      return false;
    }
    if (form.haslo.length < 8) {
      toast.warn("Hasło musi mieć co najmniej 8 znaków");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      await api.post("/users", {
        imie: form.imie.trim(),
        nazwisko: form.nazwisko.trim(),
        email: form.email.trim(),
        haslo: form.haslo,
        rola: form.rola,
      });
      toast.success("Użytkownik utworzony");
      setForm(EMPTY_FORM);
      load(search);
    } catch (err) {
      toast.error(extractApiError(err, "Błąd tworzenia użytkownika"));
    } finally {
      setSaving(false);
    }
  };

  const isUserBlocked = (u) =>
    u?.zablokowany === true || u?.isBlocked === true;

  const handleToggleBlock = async (u) => {
    setBusyId(u.id);
    try {
      await api.patch(`/users/${u.id}/blokada`);
      toast.success(
        isUserBlocked(u) ? "Użytkownik odblokowany" : "Użytkownik zablokowany",
      );
      load(search);
    } catch (err) {
      toast.error(extractApiError(err, "Nie udało się zmienić statusu"));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (u) => {
    if (
      !window.confirm(
        `Usunąć użytkownika ${u.imie || ""} ${u.nazwisko || ""}? Operacja jest nieodwracalna.`,
      )
    ) {
      return;
    }
    setBusyId(u.id);
    try {
      await api.delete(`/users/${u.id}`);
      toast.success("Użytkownik usunięty");
      load(search);
    } catch (err) {
      toast.error(extractApiError(err, "Nie udało się usunąć użytkownika"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="uz-wrapper">
      <div className="uz-header">
        <div>
          <h1 className="uz-title">Użytkownicy</h1>
          <p className="uz-subtitle">
            Zarządzanie kontami Handlowiec i Administrator
          </p>
        </div>
      </div>

      <section className="uz-card">
        <h2 className="uz-card-title">Nowy użytkownik</h2>
        <form className="uz-form" onSubmit={handleSubmit}>
          <div className="uz-form-grid">
            <div className="uz-field">
              <label htmlFor="uz-imie">Imię *</label>
              <input
                id="uz-imie"
                type="text"
                value={form.imie}
                onChange={handleChange("imie")}
                placeholder="np. Jan"
                disabled={saving}
              />
            </div>
            <div className="uz-field">
              <label htmlFor="uz-nazwisko">Nazwisko *</label>
              <input
                id="uz-nazwisko"
                type="text"
                value={form.nazwisko}
                onChange={handleChange("nazwisko")}
                placeholder="np. Kowalski"
                disabled={saving}
              />
            </div>
            <div className="uz-field">
              <label htmlFor="uz-email">Email *</label>
              <input
                id="uz-email"
                type="email"
                value={form.email}
                onChange={handleChange("email")}
                placeholder="np. jan@sunfee.pl"
                disabled={saving}
              />
            </div>
            <div className="uz-field">
              <label htmlFor="uz-haslo">Hasło *</label>
              <input
                id="uz-haslo"
                type="password"
                value={form.haslo}
                onChange={handleChange("haslo")}
                placeholder="min. 8 znaków"
                disabled={saving}
              />
            </div>
            <div className="uz-field">
              <label htmlFor="uz-rola">Rola *</label>
              <select
                id="uz-rola"
                value={form.rola}
                onChange={handleChange("rola")}
                disabled={saving}
              >
                <option value="Handlowiec">Handlowiec</option>
                <option value="Administrator">Administrator</option>
              </select>
            </div>
          </div>
          <div className="uz-form-actions">
            <button
              type="submit"
              className="uz-btn uz-btn--primary"
              disabled={saving}
            >
              {saving ? "Zapisywanie…" : "Utwórz użytkownika"}
            </button>
          </div>
        </form>
      </section>

      <section className="uz-card uz-card--list">
        <div className="uz-list-header">
          <h2 className="uz-card-title">
            Lista użytkowników ({users.length})
          </h2>
          <input
            className="uz-search"
            type="search"
            placeholder="Szukaj (imię, nazwisko, email)…"
            value={search}
            onChange={(e) => triggerSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="uz-empty">Ładowanie…</p>
        ) : users.length === 0 ? (
          <p className="uz-empty">
            {search
              ? "Brak użytkowników pasujących do wyszukiwania."
              : "Brak użytkowników."}
          </p>
        ) : (
          <div className="uz-table-wrap">
            <table className="uz-table">
              <thead>
                <tr>
                  <th>Imię</th>
                  <th>Nazwisko</th>
                  <th>Email</th>
                  <th>Rola</th>
                  <th>Status</th>
                  <th>Utworzono</th>
                  <th>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isBlocked = isUserBlocked(u);
                  const created =
                    u.createdAt || u.utworzonyAt || u.created_at || null;
                  return (
                    <tr key={u.id}>
                      <td>{u.imie}</td>
                      <td>{u.nazwisko}</td>
                      <td>{u.email}</td>
                      <td>
                        <span
                          className={`uz-role uz-role--${
                            u.rola === "Administrator" ? "admin" : "handl"
                          }`}
                        >
                          {getRoleLabel(u.rola)}
                        </span>
                      </td>
                      <td>
                        {isBlocked ? (
                          <span className="uz-role uz-role--handl">
                            Zablokowany
                          </span>
                        ) : (
                          <span className="uz-role uz-role--admin">
                            Aktywny
                          </span>
                        )}
                      </td>
                      <td className="uz-td-date">
                        {created
                          ? new Date(created).toLocaleString("pl-PL", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="uz-btn uz-btn--primary"
                          style={{ marginRight: 8 }}
                          disabled={busyId === u.id}
                          onClick={() => handleToggleBlock(u)}
                        >
                          {isBlocked ? "Odblokuj" : "Zablokuj"}
                        </button>
                        <button
                          type="button"
                          className="uz-btn"
                          disabled={busyId === u.id}
                          onClick={() => handleDelete(u)}
                        >
                          Usuń
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
