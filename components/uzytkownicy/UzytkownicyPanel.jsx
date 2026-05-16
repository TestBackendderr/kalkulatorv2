import React, { useState, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import {
  createUser,
  searchUsers,
  getRoleLabel,
} from "@/utils/usersMockStore";

const EMPTY_FORM = {
  imie: "",
  nazwisko: "",
  email: "",
  haslo: "",
  role: "Handlowiec",
};

export default function UzytkownicyPanel() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [tick, setTick] = useState(0);

  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    setUsers(searchUsers(search));
  }, [search, tick]);

  const totalCount = useMemo(() => searchUsers("").length, [tick]);

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
    if (form.haslo.length < 4) {
      toast.warn("Hasło musi mieć co najmniej 4 znaki");
      return false;
    }
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      createUser({
        imie: form.imie,
        nazwisko: form.nazwisko,
        email: form.email,
        haslo: form.haslo,
        role: form.role,
      });
      toast.success("Użytkownik utworzony");
      setForm(EMPTY_FORM);
      reload();
    } catch (err) {
      toast.error(err.message || "Błąd tworzenia użytkownika");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="uz-wrapper">
      <div className="uz-header">
        <div>
          <h1 className="uz-title">Użytkownicy</h1>
          <p className="uz-subtitle">Zarządzanie kontami Handlowiec i Administrator</p>
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
              />
            </div>
            <div className="uz-field">
              <label htmlFor="uz-haslo">Hasło *</label>
              <input
                id="uz-haslo"
                type="password"
                value={form.haslo}
                onChange={handleChange("haslo")}
                placeholder="min. 4 znaki"
              />
            </div>
            <div className="uz-field">
              <label htmlFor="uz-rola">Rola *</label>
              <select id="uz-rola" value={form.role} onChange={handleChange("role")}>
                <option value="Handlowiec">Handlowiec</option>
                <option value="Administrator">Administrator</option>
              </select>
            </div>
          </div>
          <div className="uz-form-actions">
            <button type="submit" className="uz-btn uz-btn--primary" disabled={saving}>
              {saving ? "Zapisywanie…" : "Utwórz użytkownika"}
            </button>
          </div>
        </form>
      </section>

      <section className="uz-card uz-card--list">
        <div className="uz-list-header">
          <h2 className="uz-card-title">
            Lista użytkowników ({users.length}
            {search ? ` / ${totalCount}` : ""})
          </h2>
          <input
            className="uz-search"
            type="search"
            placeholder="Szukaj (imię, nazwisko, email, rola)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {users.length === 0 ? (
          <p className="uz-empty">
            {search ? "Brak użytkowników pasujących do wyszukiwania." : "Brak użytkowników."}
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
                  <th>Utworzono</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.imie}</td>
                    <td>{u.nazwisko}</td>
                    <td>{u.email}</td>
                    <td>
                      <span
                        className={`uz-role uz-role--${
                          u.role === "Administrator" ? "admin" : "handl"
                        }`}
                      >
                        {getRoleLabel(u.role)}
                      </span>
                    </td>
                    <td className="uz-td-date">
                      {new Date(u.createdAt).toLocaleString("pl-PL", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
