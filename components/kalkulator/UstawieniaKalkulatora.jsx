import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import api from "@/utils/axiosInstance";
import { formatApiErrorMessage } from "@/utils/apiError";
import { PrzekopUstawieniaPanel, PrzewodyCenyPanel } from "@/components/kalkulator/PrzekopPrzewodyUstawienia";
import PrzekopyPanel from "@/components/kalkulator/PrzekopyUstawienia";
import MontazKwpUstawienia from "@/components/kalkulator/MontazKwpUstawienia";
import MarzaKoncowaUstawienia from "@/components/kalkulator/MarzaKoncowaUstawienia";
import DodatkoweProduktyUstawienia from "@/components/kalkulator/DodatkoweProduktyUstawienia";

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { key: "falowniki",      label: "Falowniki" },
  { key: "panele",         label: "Panele fotowoltaiczne" },
  { key: "magazyny",       label: "Magazyny energii" },
  { key: "klimatyzatory",  label: "Klimatyzatory" },
  { key: "lead-sources",   label: "Koszty marketingowe" },
  { key: "dodatkowe-produkty", label: "Dodatkowe produkty" },
  { key: "typy-montazu",       label: "Typy montażu" },
  { key: "przewody",   label: "Przewody" },
  { key: "przekopy",   label: "Przekopy" },
  { key: "montaz-kwp", label: "Montaż PV (kWp)" },
  { key: "marza-koncowa", label: "Marża końcowa" },
];

const FALOWNIK_TYP_OPTIONS = [
  { value: "Niskopradowy", label: "Niskonapięciowy" },
  { value: "Wysokopradowy", label: "Wysokonapięciowy" },
];

function formatFalownikTyp(typ) {
  return FALOWNIK_TYP_OPTIONS.find((o) => o.value === typ)?.label ?? typ ?? "—";
}

const EMPTY_FALOWNIK = {
  name: "",
  typ: "Niskopradowy",
  powerKw: "",
  priceNetto: "",
  cennikProgowy: [{ step: "1", priceNetto: "" }],
  isActive: true,
};
const EMPTY_PANEL    = { name: "", powerW: "",  priceNetto: "", isActive: true };
const EMPTY_KLIMATYZATOR = { name: "", priceNetto: "", isActive: true };
const EMPTY_MAGAZYN  = {
  name: "",
  compatibility: "",
  capacityKwh: "",
  powerKw: "",
  wagaKg: "",
  priceNetto: "",
  cennikProgowy: [{ step: "1", priceNetto: "" }],
  falownikiIds: [],
  isActive: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) =>
  new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 0 }).format(Number(n));

function StatusBadge({ isActive }) {
  return (
    <span className={`usk-badge ${isActive ? "usk-badge--active" : "usk-badge--inactive"}`}>
      {isActive ? "Aktywny" : "Nieaktywny"}
    </span>
  );
}

// ─── Confirm modal ────────────────────────────────────────────────────────────

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="usk-overlay" onClick={onCancel}>
      <div className="usk-modal usk-modal--sm" onClick={(e) => e.stopPropagation()}>
        <p className="usk-confirm-msg">{message}</p>
        <div className="usk-modal-footer">
          <button className="usk-btn usk-btn--ghost" onClick={onCancel}>Anuluj</button>
          <button className="usk-btn usk-btn--danger" onClick={onConfirm}>Dezaktywuj</button>
        </div>
      </div>
    </div>
  );
}

// ─── CennikProgowyEditor ──────────────────────────────────────────────────────

/**
 * Edytor cennika progowego.
 * tiers: [{ step: string|number, priceNetto: string|number }]
 * onChange(newTiers)
 */
function CennikProgowyEditor({ tiers, onChange }) {
  const setRow = (idx, field, value) => {
    const next = tiers.map((t, i) => (i === idx ? { ...t, [field]: value } : t));
    onChange(next);
  };

  const addRow = () => {
    const maxStep = tiers.reduce((m, t) => Math.max(m, Number(t.step) || 0), 0);
    onChange([...tiers, { step: String(maxStep + 1), priceNetto: "" }]);
  };

  const removeRow = (idx) => {
    const next = tiers.filter((_, i) => i !== idx);
    onChange(next.length ? next : [{ step: "1", priceNetto: "" }]);
  };

  const steps = tiers.map((t) => String(t.step).trim()).filter(Boolean);
  const hasDuplicates = steps.length !== new Set(steps).size;

  return (
    <div>
      {hasDuplicates && (
        <p className="usk-hint" style={{ color: "#ef4444" }}>
          Numery kroków muszą być unikalne.
        </p>
      )}
      {tiers.map((tier, idx) => (
        <div key={idx} className="usk-form-row" style={{ alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
            <span className="usk-label" style={{ minWidth: 50, marginBottom: 0 }}>
              Krok
            </span>
            <input
              className="usk-input"
              type="number"
              min="1"
              step="1"
              style={{ width: 72 }}
              value={tier.step}
              onChange={(e) => setRow(idx, "step", e.target.value)}
              placeholder="1"
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
            <span className="usk-label" style={{ minWidth: 80, marginBottom: 0 }}>
              Cena netto
            </span>
            <input
              className="usk-input"
              type="number"
              min="1"
              step="1"
              value={tier.priceNetto}
              onChange={(e) => setRow(idx, "priceNetto", e.target.value)}
              placeholder="np. 5000"
            />
          </div>
          {tiers.length > 1 && (
            <button
              type="button"
              className="usk-btn usk-btn--sm usk-btn--danger-outline"
              onClick={() => removeRow(idx)}
            >
              Usuń
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="usk-btn usk-btn--sm"
        style={{ marginBottom: 16 }}
        onClick={addRow}
      >
        + Kolejna pozycja
      </button>
    </div>
  );
}

/** Konwertuje cennikProgowy z backendu (lub priceTiers) na format edytora. */
function parseCennikProgowy(item) {
  if (Array.isArray(item?.cennikProgowy) && item.cennikProgowy.length > 0) {
    return [...item.cennikProgowy]
      .sort((a, b) => (a.step ?? 0) - (b.step ?? 0))
      .map((t) => ({ step: String(t.step ?? ""), priceNetto: String(t.priceNetto ?? "") }));
  }
  // fallback: stary priceTiers
  if (Array.isArray(item?.priceTiers) && item.priceTiers.length > 0) {
    return item.priceTiers
      .map((p, i) => ({ step: String(i + 1), priceNetto: String(p) }));
  }
  // fallback: priceNetto
  const p = Number(item?.priceNetto);
  if (p > 0) return [{ step: "1", priceNetto: String(p) }];
  return [{ step: "1", priceNetto: "" }];
}

/** Валидация и сборка массива для отправки на бекенд. */
function buildCennikProgowy(tiers) {
  const rows = tiers
    .map((t) => ({ step: parseInt(t.step, 10), priceNetto: +t.priceNetto }))
    .filter((t) => t.step >= 1 && t.priceNetto > 0);

  if (!rows.length) return null; // пустой — не отправляем

  const steps = rows.map((r) => r.step);
  if (steps.length !== new Set(steps).size) {
    throw new Error("Numery kroków w cenniku muszą być unikalne");
  }

  return rows.sort((a, b) => a.step - b.step);
}

// ─── Falowniki tab ────────────────────────────────────────────────────────────

function FalownikiTab() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null);
  const [form,    setForm]    = useState(EMPTY_FALOWNIK);
  const [saving,  setSaving]  = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/kalkulator/falowniki");
      setItems(res.data);
    } catch {
      toast.error("Nie udało się pobrać falowników");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm(EMPTY_FALOWNIK); setModal({ mode: "add" }); };
  const openEdit = (item) => {
    setForm({
      name:          item.name,
      typ:           item.typ || "Niskopradowy",
      powerKw:       item.powerKw,
      priceNetto:    item.priceNetto ?? "",
      cennikProgowy: parseCennikProgowy(item),
      isActive:      item.isActive,
    });
    setModal({ mode: "edit", id: item.id });
  };
  const closeModal = () => setModal(null);

  const validate = () => {
    if (!form.name.trim())                   { toast.warn("Nazwa jest wymagana"); return false; }
    if (!FALOWNIK_TYP_OPTIONS.some((o) => o.value === form.typ)) {
      toast.warn("Wybierz typ falownika");
      return false;
    }
    if (!form.powerKw || +form.powerKw <= 0) { toast.warn("Moc musi być większa od 0"); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      let cennikProgowy;
      try { cennikProgowy = buildCennikProgowy(form.cennikProgowy); }
      catch (e) { toast.warn(e.message); setSaving(false); return; }

      const firstPrice = cennikProgowy?.[0]?.priceNetto ?? (+form.priceNetto || undefined);

      const payload = {
        name:     form.name.trim(),
        typ:      form.typ,
        powerKw:  +form.powerKw,
        isActive: form.isActive,
        ...(firstPrice > 0 && { priceNetto: firstPrice }),
        ...(cennikProgowy && { cennikProgowy }),
      };

      if (modal.mode === "add") {
        await api.post("/kalkulator/falowniki", payload);
        toast.success("Falownik dodany");
      } else {
        await api.patch(`/kalkulator/falowniki/${modal.id}`, payload);
        toast.success("Falownik zaktualizowany");
      }
      closeModal();
      load();
    } catch (e) {
      toast.error(formatApiErrorMessage(e, "Nie udało się zapisać falownika"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      await api.delete(`/kalkulator/falowniki/${confirm}`);
      toast.success("Falownik dezaktywowany");
      setConfirm(null);
      load();
    } catch (e) {
      toast.error(formatApiErrorMessage(e, "Błąd dezaktywacji"));
    }
  };

  return (
    <>
      <div className="usk-tab-header">
        <h2 className="usk-tab-title">Falowniki</h2>
        <button className="usk-btn usk-btn--primary" onClick={openAdd}>+ Dodaj</button>
      </div>

      {loading ? (
        <div className="usk-loading">Ładowanie...</div>
      ) : (
        <div className="usk-table-wrap">
          <table className="usk-table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Typ</th>
                <th>Moc (kW)</th>
                <th>Cennik progowy (zł netto)</th>
                <th>Status</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={6} className="usk-empty">Brak danych</td></tr>
              )}
              {items.map((item) => {
                const tiers = parseCennikProgowy(item);
                return (
                  <tr key={item.id} className={item.isActive ? "" : "usk-row--inactive"}>
                    <td className={item.isActive ? "" : "usk-strikethrough"}>{item.name}</td>
                    <td>{formatFalownikTyp(item.typ)}</td>
                    <td>{item.powerKw}</td>
                    <td>
                      {tiers.length > 1
                        ? tiers.slice(0, 4).map((t, i) => (
                            <span key={i} className="usk-chip" style={{ marginRight: 4 }}>
                              {t.step}.: {fmt(t.priceNetto)}
                            </span>
                          ))
                        : `${fmt(tiers[0]?.priceNetto ?? item.priceNetto)} zł`}
                      {tiers.length > 4 && " …"}
                    </td>
                    <td><StatusBadge isActive={item.isActive} /></td>
                    <td className="usk-actions">
                      <button className="usk-btn usk-btn--sm" onClick={() => openEdit(item)}>Edytuj</button>
                      <button className="usk-btn usk-btn--sm usk-btn--danger-outline" onClick={() => setConfirm(item.id)}>Dezaktywuj</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="usk-overlay" onClick={closeModal}>
          <div className="usk-modal usk-modal--lg" onClick={(e) => e.stopPropagation()}>
            <div className="usk-modal-head">
              <h3>{modal.mode === "add" ? "Dodaj falownik" : "Edytuj falownik"}</h3>
              <button className="usk-close" onClick={closeModal}>×</button>
            </div>
            <div className="usk-modal-body">
              <label className="usk-label">Nazwa *</label>
              <input
                className="usk-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="np. Deye SUN-8K"
              />

              <label className="usk-label">Typ *</label>
              <select
                className="usk-input"
                value={form.typ}
                onChange={(e) => setForm({ ...form, typ: e.target.value })}
              >
                {FALOWNIK_TYP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              <label className="usk-label">Moc (kW) *</label>
              <input
                className="usk-input"
                type="number"
                min="0.1"
                step="0.1"
                value={form.powerKw}
                onChange={(e) => setForm({ ...form, powerKw: e.target.value })}
                placeholder="np. 8"
              />

              <label className="usk-label">Cennik progowy (zł netto)</label>
              <p className="usk-hint" style={{ marginTop: 0 }}>
                Cena netto od danej sztuki (np. krok 1 = od 1. falownika, krok 12 = od 12.). Kroki unikalne, min. 1.
              </p>
              <CennikProgowyEditor
                tiers={form.cennikProgowy}
                onChange={(t) => setForm({ ...form, cennikProgowy: t })}
              />

              <label className="usk-checkbox-label">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Aktywny
              </label>
            </div>
            <div className="usk-modal-footer">
              <button className="usk-btn usk-btn--ghost" onClick={closeModal}>Anuluj</button>
              <button className="usk-btn usk-btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? "Zapisywanie..." : "Zapisz"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          message="Czy na pewno chcesz dezaktywować ten element?"
          onConfirm={handleDeactivate}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// ─── Klimatyzatory tab ────────────────────────────────────────────────────────

function KlimatyzatoryTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_KLIMATYZATOR);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/kalkulator/klimatyzatory");
      setItems(res.data);
    } catch {
      toast.error("Nie udało się pobrać klimatyzatorów");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm(EMPTY_KLIMATYZATOR); setModal({ mode: "add" }); };
  const openEdit = (item) => {
    setForm({ name: item.name, priceNetto: item.priceNetto, isActive: item.isActive });
    setModal({ mode: "edit", id: item.id });
  };
  const closeModal = () => setModal(null);

  const validate = () => {
    if (!form.name.trim()) { toast.warn("Nazwa jest wymagana"); return false; }
    if (!form.priceNetto || +form.priceNetto <= 0) { toast.warn("Cena musi być większa od 0"); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), priceNetto: +form.priceNetto, isActive: form.isActive };
      if (modal.mode === "add") {
        await api.post("/kalkulator/klimatyzatory", payload);
        toast.success("Klimatyzator dodany");
      } else {
        await api.patch(`/kalkulator/klimatyzatory/${modal.id}`, payload);
        toast.success("Klimatyzator zaktualizowany");
      }
      closeModal();
      load();
    } catch (e) {
      toast.error(formatApiErrorMessage(e, "Błąd zapisu"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      await api.delete(`/kalkulator/klimatyzatory/${confirm}`);
      toast.success("Klimatyzator dezaktywowany");
      setConfirm(null);
      load();
    } catch (e) {
      toast.error(formatApiErrorMessage(e, "Błąd dezaktywacji"));
    }
  };

  return (
    <>
      <div className="usk-tab-header">
        <h2 className="usk-tab-title">Klimatyzatory</h2>
        <button type="button" className="usk-btn usk-btn--primary" onClick={openAdd}>+ Dodaj</button>
      </div>

      {loading ? (
        <div className="usk-loading">Ładowanie...</div>
      ) : (
        <div className="usk-table-wrap">
          <table className="usk-table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Cena netto (zł)</th>
                <th>Status</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={4} className="usk-empty">Brak danych</td></tr>
              )}
              {items.map((item) => (
                <tr key={item.id} className={item.isActive ? "" : "usk-row--inactive"}>
                  <td className={item.isActive ? "" : "usk-strikethrough"}>{item.name}</td>
                  <td>{fmt(item.priceNetto)} zł</td>
                  <td><StatusBadge isActive={item.isActive} /></td>
                  <td className="usk-actions">
                    <button type="button" className="usk-btn usk-btn--sm" onClick={() => openEdit(item)}>Edytuj</button>
                    <button type="button" className="usk-btn usk-btn--sm usk-btn--danger-outline" onClick={() => setConfirm(item.id)}>Dezaktywuj</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="usk-overlay" onClick={closeModal}>
          <div className="usk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="usk-modal-head">
              <h3>{modal.mode === "add" ? "Dodaj klimatyzator" : "Edytuj klimatyzator"}</h3>
              <button type="button" className="usk-close" onClick={closeModal}>×</button>
            </div>
            <div className="usk-modal-body">
              <label className="usk-label">Nazwa *</label>
              <input className="usk-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="np. Daikin Perfera 3,5 kW" />
              <label className="usk-label">Cena netto (zł) *</label>
              <input className="usk-input" type="number" min="1" step="1" value={form.priceNetto} onChange={(e) => setForm({ ...form, priceNetto: e.target.value })} placeholder="np. 5500" />
              <label className="usk-checkbox-label">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Aktywny
              </label>
            </div>
            <div className="usk-modal-footer">
              <button type="button" className="usk-btn usk-btn--ghost" onClick={closeModal}>Anuluj</button>
              <button type="button" className="usk-btn usk-btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? "Zapisywanie..." : "Zapisz"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          message="Czy na pewno chcesz dezaktywować ten klimatyzator?"
          onConfirm={handleDeactivate}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// ─── Panele tab ───────────────────────────────────────────────────────────────

function PaneleTab() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null);
  const [form,    setForm]    = useState(EMPTY_PANEL);
  const [saving,  setSaving]  = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/kalkulator/panele");
      setItems(res.data);
    } catch {
      toast.error("Nie udało się pobrać paneli");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setForm(EMPTY_PANEL); setModal({ mode: "add" }); };
  const openEdit = (item) => { setForm({ name: item.name, powerW: item.powerW, priceNetto: item.priceNetto, isActive: item.isActive }); setModal({ mode: "edit", id: item.id }); };
  const closeModal = () => setModal(null);

  const validate = () => {
    if (!form.name.trim())                   { toast.warn("Nazwa jest wymagana"); return false; }
    if (!form.powerW || +form.powerW <= 0)   { toast.warn("Moc musi być większa od 0"); return false; }
    if (!form.priceNetto || +form.priceNetto <= 0) { toast.warn("Cena musi być większa od 0"); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), powerW: +form.powerW, priceNetto: +form.priceNetto, isActive: form.isActive };
      if (modal.mode === "add") {
        await api.post("/kalkulator/panele", payload);
        toast.success("Panel dodany");
      } else {
        await api.patch(`/kalkulator/panele/${modal.id}`, payload);
        toast.success("Panel zaktualizowany");
      }
      closeModal();
      load();
    } catch (e) {
      toast.error(formatApiErrorMessage(e, "Błąd zapisu"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      await api.delete(`/kalkulator/panele/${confirm}`);
      toast.success("Panel dezaktywowany");
      setConfirm(null);
      load();
    } catch (e) {
      toast.error(formatApiErrorMessage(e, "Błąd dezaktywacji"));
    }
  };

  return (
    <>
      <div className="usk-tab-header">
        <h2 className="usk-tab-title">Panele fotowoltaiczne</h2>
        <button className="usk-btn usk-btn--primary" onClick={openAdd}>+ Dodaj</button>
      </div>

      {loading ? (
        <div className="usk-loading">Ładowanie...</div>
      ) : (
        <div className="usk-table-wrap">
          <table className="usk-table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Moc panelu (W)</th>
                <th>Cena netto (zł)</th>
                <th>Status</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={5} className="usk-empty">Brak danych</td></tr>
              )}
              {items.map((item) => (
                <tr key={item.id} className={item.isActive ? "" : "usk-row--inactive"}>
                  <td className={item.isActive ? "" : "usk-strikethrough"}>{item.name}</td>
                  <td>{item.powerW} W</td>
                  <td>{fmt(item.priceNetto)} zł</td>
                  <td><StatusBadge isActive={item.isActive} /></td>
                  <td className="usk-actions">
                    <button className="usk-btn usk-btn--sm" onClick={() => openEdit(item)}>Edytuj</button>
                    <button className="usk-btn usk-btn--sm usk-btn--danger-outline" onClick={() => setConfirm(item.id)}>Dezaktywuj</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="usk-overlay" onClick={closeModal}>
          <div className="usk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="usk-modal-head">
              <h3>{modal.mode === "add" ? "Dodaj panel" : "Edytuj panel"}</h3>
              <button className="usk-close" onClick={closeModal}>×</button>
            </div>
            <div className="usk-modal-body">
              <label className="usk-label">Nazwa *</label>
              <input className="usk-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="np. Ja Solar 500W czarna rama" />

              <label className="usk-label">Moc panelu (W) *</label>
              <input className="usk-input" type="number" min="1" step="1" value={form.powerW} onChange={(e) => setForm({ ...form, powerW: e.target.value })} placeholder="np. 500" />

              <label className="usk-label">Cena netto za sztukę (zł) *</label>
              <input className="usk-input" type="number" min="1" step="1" value={form.priceNetto} onChange={(e) => setForm({ ...form, priceNetto: e.target.value })} placeholder="np. 300" />

              <label className="usk-checkbox-label">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Aktywny
              </label>
            </div>
            <div className="usk-modal-footer">
              <button className="usk-btn usk-btn--ghost" onClick={closeModal}>Anuluj</button>
              <button className="usk-btn usk-btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? "Zapisywanie..." : "Zapisz"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          message="Czy na pewno chcesz dezaktywować ten element?"
          onConfirm={handleDeactivate}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// ─── Magazyny tab ─────────────────────────────────────────────────────────────

function MagazynyTab() {
  const [items,     setItems]     = useState([]);
  const [falowniki, setFalowniki] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(null);
  const [form,      setForm]      = useState(EMPTY_MAGAZYN);
  const [saving,    setSaving]    = useState(false);
  const [confirm,   setConfirm]   = useState(null);

  const loadFalowniki = useCallback(async () => {
    try {
      const res = await api.get("/kalkulator/falowniki?onlyActive=true");
      setFalowniki(res.data);
    } catch {
      toast.error("Nie udało się pobrać falowników");
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/kalkulator/magazyny");
      setItems(res.data);
    } catch {
      toast.error("Nie udało się pobrać magazynów");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadFalowniki();
  }, [load, loadFalowniki]);

  const openAdd = () => { setForm(EMPTY_MAGAZYN); setModal({ mode: "add" }); };

  const openEdit = (item) => {
    setForm({
      name:          item.name,
      compatibility: item.compatibility,
      capacityKwh:   item.capacityKwh ?? "",
      powerKw:       item.powerKw ?? "",
      wagaKg:        item.wagaKg != null ? String(item.wagaKg) : "",
      priceNetto:    item.priceNetto ?? "",
      cennikProgowy: parseCennikProgowy(item),
      falownikiIds:  (item.falowniki || []).map((f) => f.id),
      isActive:      item.isActive,
    });
    setModal({ mode: "edit", id: item.id });
  };

  const closeModal = () => setModal(null);

  const toggleFalownik = (id) => {
    setForm((prev) => ({
      ...prev,
      falownikiIds: prev.falownikiIds.includes(id)
        ? prev.falownikiIds.filter((x) => x !== id)
        : [...prev.falownikiIds, id],
    }));
  };

  const validate = () => {
    if (!form.name.trim()) {
      toast.warn("Nazwa jest wymagana");
      return false;
    }
    if (!form.compatibility.trim()) {
      toast.warn("Kompatybilność jest wymagana");
      return false;
    }
    if (form.capacityKwh === "" || Number(form.capacityKwh) <= 0) {
      toast.warn("Pojemność (kWh) musi być większa od 0");
      return false;
    }
    if (form.powerKw === "" || Number(form.powerKw) <= 0) {
      toast.warn("Moc (kW) musi być większa od 0");
      return false;
    }
    if (form.wagaKg !== "" && Number(form.wagaKg) < 0) {
      toast.warn("Waga nie może być ujemna");
      return false;
    }
    try {
      const cennik = buildCennikProgowy(form.cennikProgowy);
      const firstPrice = cennik?.[0]?.priceNetto ?? (+form.priceNetto || 0);
      if (!firstPrice || firstPrice <= 0) {
        toast.warn("Podaj cenę netto w cenniku progowym (min. jedna pozycja z ceną > 0)");
        return false;
      }
    } catch (e) {
      toast.warn(e.message);
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      let cennikProgowy;
      try {
        cennikProgowy = buildCennikProgowy(form.cennikProgowy);
      } catch (e) {
        toast.warn(e.message);
        setSaving(false);
        return;
      }

      const firstPrice = cennikProgowy?.[0]?.priceNetto ?? (+form.priceNetto || 0);

      const payload = {
        name: form.name.trim(),
        compatibility: form.compatibility.trim(),
        capacityKwh: +form.capacityKwh,
        powerKw: +form.powerKw,
        wagaKg: form.wagaKg === "" ? null : +form.wagaKg,
        falownikiIds: form.falownikiIds,
        isActive: form.isActive,
        priceNetto: firstPrice,
        ...(cennikProgowy && { cennikProgowy }),
      };

      if (modal.mode === "add") {
        await api.post("/kalkulator/magazyny", payload);
        toast.success("Magazyn dodany");
      } else {
        await api.patch(`/kalkulator/magazyny/${modal.id}`, payload);
        toast.success("Magazyn zaktualizowany");
      }
      closeModal();
      load();
    } catch (e) {
      toast.error(formatApiErrorMessage(e, "Nie udało się zapisać magazynu"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      await api.delete(`/kalkulator/magazyny/${confirm}`);
      toast.success("Magazyn dezaktywowany");
      setConfirm(null);
      load();
    } catch (e) {
      toast.error(formatApiErrorMessage(e, "Błąd dezaktywacji"));
    }
  };

  return (
    <>
      <div className="usk-tab-header">
        <h2 className="usk-tab-title">Magazyny energii</h2>
        <button className="usk-btn usk-btn--primary" onClick={openAdd}>+ Dodaj</button>
      </div>

      {loading ? (
        <div className="usk-loading">Ładowanie...</div>
      ) : (
        <div className="usk-table-wrap">
          <table className="usk-table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Pojemność (kWh)</th>
                <th>Moc (kW)</th>
                <th>Waga (kg)</th>
                <th>Cennik progowy (zł netto)</th>
                <th>Kompatybilność</th>
                <th>Falowniki</th>
                <th>Status</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={9} className="usk-empty">Brak danych</td></tr>
              )}
              {items.map((item) => {
                const tiers = parseCennikProgowy(item);
                return (
                  <tr key={item.id} className={item.isActive ? "" : "usk-row--inactive"}>
                    <td className={item.isActive ? "" : "usk-strikethrough"}>{item.name}</td>
                    <td>{item.capacityKwh ?? "—"}</td>
                    <td>{item.powerKw ?? "—"}</td>
                    <td>{item.wagaKg != null ? `${item.wagaKg} kg` : "—"}</td>
                    <td>
                      {tiers.length > 1
                        ? tiers.slice(0, 4).map((t, i) => (
                            <span key={i} className="usk-chip" style={{ marginRight: 4 }}>
                              {t.step}.: {fmt(t.priceNetto)}
                            </span>
                          ))
                        : `${fmt(tiers[0]?.priceNetto ?? item.priceNetto)} zł`}
                      {tiers.length > 4 && " …"}
                    </td>
                    <td>{item.compatibility}</td>
                    <td>
                      <div className="usk-chips">
                        {(item.falowniki || []).length === 0
                          ? <span className="usk-chip usk-chip--empty">—</span>
                          : (item.falowniki || []).map((f) => (
                              <span key={f.id} className="usk-chip">{f.name}</span>
                            ))
                        }
                      </div>
                    </td>
                    <td><StatusBadge isActive={item.isActive} /></td>
                    <td className="usk-actions">
                      <button className="usk-btn usk-btn--sm" onClick={() => openEdit(item)}>Edytuj</button>
                      <button className="usk-btn usk-btn--sm usk-btn--danger-outline" onClick={() => setConfirm(item.id)}>Dezaktywuj</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="usk-overlay" onClick={closeModal}>
          <div className="usk-modal usk-modal--lg" onClick={(e) => e.stopPropagation()}>
            <div className="usk-modal-head">
              <h3>{modal.mode === "add" ? "Dodaj magazyn energii" : "Edytuj magazyn energii"}</h3>
              <button className="usk-close" onClick={closeModal}>×</button>
            </div>
            <div className="usk-modal-body">
              <label className="usk-label">Nazwa *</label>
              <input
                className="usk-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="np. Deye 5,12 kWh"
              />

              <label className="usk-label">Marka kompatybilnych falowników *</label>
              <input
                className="usk-input"
                value={form.compatibility}
                onChange={(e) => setForm({ ...form, compatibility: e.target.value })}
                placeholder="np. Deye"
              />

              <div className="usk-form-row">
                <div className="usk-form-col">
                  <label className="usk-label">Pojemność (kWh) *</label>
                  <input
                    className="usk-input"
                    type="number" min="0.01" step="0.01" required
                    value={form.capacityKwh}
                    onChange={(e) => setForm({ ...form, capacityKwh: e.target.value })}
                    placeholder="np. 5.12"
                  />
                </div>
                <div className="usk-form-col">
                  <label className="usk-label">Moc (kW) *</label>
                  <input
                    className="usk-input"
                    type="number" min="0.01" step="0.01" required
                    value={form.powerKw}
                    onChange={(e) => setForm({ ...form, powerKw: e.target.value })}
                    placeholder="np. 2.56"
                  />
                </div>
              </div>

              <label className="usk-label">Waga (kg)</label>
              <input
                className="usk-input"
                type="number" min="0" step="0.1"
                value={form.wagaKg}
                onChange={(e) => setForm({ ...form, wagaKg: e.target.value })}
                placeholder="np. 100 (opcjonalnie)"
              />
              <p className="usk-hint">Używana w kalkulatorze przy ostrzeżeniu o transporcie i montażu.</p>

              <label className="usk-label">Cennik progowy (zł netto) *</label>
              <p className="usk-hint" style={{ marginTop: 0 }}>
                Cena netto od danej sztuki (np. krok 1 = od 1. baterii, krok 3 = od 3.). Kroki unikalne, min. 1 pozycja z ceną &gt; 0.
              </p>
              <CennikProgowyEditor
                tiers={form.cennikProgowy}
                onChange={(t) => setForm({ ...form, cennikProgowy: t })}
              />

              <label className="usk-label">Kompatybilne falowniki</label>
              {falowniki.length === 0 ? (
                <p className="usk-hint">Brak aktywnych falowników</p>
              ) : (
                <div className="usk-checkbox-grid">
                  {falowniki.map((f) => (
                    <label key={f.id} className="usk-checkbox-item">
                      <input
                        type="checkbox"
                        checked={form.falownikiIds.includes(f.id)}
                        onChange={() => toggleFalownik(f.id)}
                      />
                      {f.name} ({f.powerKw} kW)
                    </label>
                  ))}
                </div>
              )}

              <label className="usk-checkbox-label">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Aktywny
              </label>
            </div>
            <div className="usk-modal-footer">
              <button className="usk-btn usk-btn--ghost" onClick={closeModal}>Anuluj</button>
              <button className="usk-btn usk-btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? "Zapisywanie..." : "Zapisz"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          message="Czy na pewno chcesz dezaktywować ten element?"
          onConfirm={handleDeactivate}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// ─── Typy montażu tab ─────────────────────────────────────────────────────────

const EMPTY_TYP_MONTAZU = { name: "", priceNetto: "", isActive: true };

function TypMontazuTab() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null);
  const [form,    setForm]    = useState(EMPTY_TYP_MONTAZU);
  const [saving,  setSaving]  = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/typy-montazu");
      setItems(res.data);
    } catch {
      toast.error("Nie udało się pobrać typów montażu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm(EMPTY_TYP_MONTAZU); setModal({ mode: "add" }); };
  const openEdit = (item) => {
    setForm({ name: item.name, priceNetto: item.priceNetto ?? "", isActive: item.isActive });
    setModal({ mode: "edit", id: item.id });
  };
  const closeModal = () => setModal(null);

  const validate = () => {
    if (!form.name.trim()) { toast.warn("Nazwa jest wymagana"); return false; }
    if (!form.priceNetto || +form.priceNetto <= 0) { toast.warn("Cena musi być większa od 0"); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), priceNetto: +form.priceNetto, isActive: form.isActive };
      if (modal.mode === "add") {
        await api.post("/typy-montazu", payload);
        toast.success("Typ montażu dodany");
      } else {
        await api.patch(`/typy-montazu/${modal.id}`, payload);
        toast.success("Typ montażu zaktualizowany");
      }
      closeModal();
      load();
    } catch (e) {
      toast.error(formatApiErrorMessage(e, "Błąd zapisu"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      await api.delete(`/typy-montazu/${confirm}`);
      toast.success("Typ montażu dezaktywowany");
      setConfirm(null);
      load();
    } catch (e) {
      toast.error(formatApiErrorMessage(e, "Błąd dezaktywacji"));
    }
  };

  const handleActivate = async (id) => {
    try {
      await api.patch(`/typy-montazu/${id}/activate`);
      toast.success("Typ montażu aktywowany");
      load();
    } catch (e) {
      toast.error(formatApiErrorMessage(e, "Błąd aktywacji"));
    }
  };

  return (
    <>
      <div className="usk-tab-header">
        <h2 className="usk-tab-title">Typy montażu</h2>
        <button type="button" className="usk-btn usk-btn--primary" onClick={openAdd}>+ Dodaj</button>
      </div>

      {loading ? (
        <div className="usk-loading">Ładowanie...</div>
      ) : (
        <div className="usk-table-wrap">
          <table className="usk-table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Cena netto (zł)</th>
                <th>Status</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={4} className="usk-empty">Brak danych</td></tr>
              )}
              {items.map((item) => (
                <tr key={item.id} className={item.isActive ? "" : "usk-row--inactive"}>
                  <td className={item.isActive ? "" : "usk-strikethrough"}>{item.name}</td>
                  <td>{fmt(item.priceNetto)} zł</td>
                  <td><StatusBadge isActive={item.isActive} /></td>
                  <td className="usk-actions">
                    <button type="button" className="usk-btn usk-btn--sm" onClick={() => openEdit(item)}>Edytuj</button>
                    {item.isActive ? (
                      <button type="button" className="usk-btn usk-btn--sm usk-btn--danger-outline" onClick={() => setConfirm(item.id)}>
                        Dezaktywuj
                      </button>
                    ) : (
                      <button type="button" className="usk-btn usk-btn--sm usk-btn--primary" onClick={() => handleActivate(item.id)}>
                        Aktywuj
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="usk-overlay" onClick={closeModal}>
          <div className="usk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="usk-modal-head">
              <h3>{modal.mode === "add" ? "Dodaj typ montażu" : "Edytuj typ montażu"}</h3>
              <button type="button" className="usk-close" onClick={closeModal}>×</button>
            </div>
            <div className="usk-modal-body">
              <label className="usk-label">Nazwa *</label>
              <input
                className="usk-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="np. Montaż na dachu skośnym"
              />
              <label className="usk-label">Cena netto (zł) / panel *</label>
              <input
                className="usk-input"
                type="number"
                min="1"
                step="1"
                value={form.priceNetto}
                onChange={(e) => setForm({ ...form, priceNetto: e.target.value })}
                placeholder="np. 1200"
              />
              <label className="usk-checkbox-label">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Aktywny
              </label>
            </div>
            <div className="usk-modal-footer">
              <button type="button" className="usk-btn usk-btn--ghost" onClick={closeModal}>Anuluj</button>
              <button type="button" className="usk-btn usk-btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? "Zapisywanie..." : "Zapisz"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          message="Czy na pewno chcesz dezaktywować ten typ montażu?"
          onConfirm={handleDeactivate}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// ─── Przewody tab ─────────────────────────────────────────────────────────────

function PrzewodyTab() {
  return (
    <div className="usk-przewody-tab-layout">
      <div className="usk-przewody-tab-col usk-przewody-tab-col--macierz">
        <PrzekopUstawieniaPanel />
      </div>
      <div className="usk-przewody-tab-col usk-przewody-tab-col--ceny">
        <PrzewodyCenyPanel />
      </div>
    </div>
  );
}

// ─── Lead Sources (Koszty marketingowe) tab ───────────────────────────────────

const EMPTY_LEAD_SOURCE = { name: "", marketingCost: "", isActive: true };

function LeadSourcesTab() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null);
  const [form,    setForm]    = useState(EMPTY_LEAD_SOURCE);
  const [saving,  setSaving]  = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/lead-sources");
      setItems(res.data);
    } catch {
      toast.error("Nie udało się pobrać źródeł leadów");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setForm(EMPTY_LEAD_SOURCE); setModal({ mode: "add" }); };
  const openEdit = (item) => {
    setForm({ name: item.name, marketingCost: item.marketingCost ?? "", isActive: item.isActive });
    setModal({ mode: "edit", id: item.id });
  };
  const closeModal = () => setModal(null);

  const validate = () => {
    if (!form.name.trim()) { toast.warn("Nazwa jest wymagana"); return false; }
    if (!form.marketingCost || +form.marketingCost <= 0) { toast.warn("Koszt marketingowy musi być większy od 0"); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name:          form.name.trim(),
        marketingCost: +form.marketingCost,
        isActive:      form.isActive,
      };
      if (modal.mode === "add") {
        await api.post("/lead-sources", payload);
        toast.success("Źródło leadu dodane");
      } else {
        await api.patch(`/lead-sources/${modal.id}`, payload);
        toast.success("Źródło leadu zaktualizowane");
      }
      closeModal();
      load();
    } catch (e) {
      toast.error(formatApiErrorMessage(e, "Błąd zapisu"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      await api.delete(`/lead-sources/${confirm}`);
      toast.success("Źródło leadu dezaktywowane");
      setConfirm(null);
      load();
    } catch (e) {
      toast.error(formatApiErrorMessage(e, "Błąd dezaktywacji"));
    }
  };

  const handleActivate = async (id) => {
    try {
      await api.patch(`/lead-sources/${id}/activate`);
      toast.success("Źródło leadu aktywowane");
      load();
    } catch (e) {
      toast.error(formatApiErrorMessage(e, "Błąd aktywacji"));
    }
  };

  return (
    <>
      <div className="usk-tab-header">
        <h2 className="usk-tab-title">Koszty marketingowe</h2>
        <button className="usk-btn usk-btn--primary" onClick={openAdd}>+ Dodaj</button>
      </div>

      {loading ? (
        <div className="usk-loading">Ładowanie...</div>
      ) : (
        <div className="usk-table-wrap">
          <table className="usk-table">
            <thead>
              <tr>
                <th>Nazwa źródła leadu</th>
                <th>Koszt netto (zł)</th>
                <th>Status</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={4} className="usk-empty">Brak danych</td></tr>
              )}
              {items.map((item) => (
                <tr key={item.id} className={item.isActive ? "" : "usk-row--inactive"}>
                  <td className={item.isActive ? "" : "usk-strikethrough"}>{item.name}</td>
                  <td>{item.marketingCost != null ? `${fmt(item.marketingCost)} zł` : "—"}</td>
                  <td><StatusBadge isActive={item.isActive} /></td>
                  <td className="usk-actions">
                    <button className="usk-btn usk-btn--sm" onClick={() => openEdit(item)}>Edytuj</button>
                    {item.isActive ? (
                      <button className="usk-btn usk-btn--sm usk-btn--danger-outline" onClick={() => setConfirm(item.id)}>
                        Dezaktywuj
                      </button>
                    ) : (
                      <button className="usk-btn usk-btn--sm usk-btn--primary" onClick={() => handleActivate(item.id)}>
                        Aktywuj
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="usk-overlay" onClick={closeModal}>
          <div className="usk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="usk-modal-head">
              <h3>{modal.mode === "add" ? "Dodaj źródło leadu" : "Edytuj źródło leadu"}</h3>
              <button className="usk-close" onClick={closeModal}>×</button>
            </div>
            <div className="usk-modal-body">
              <label className="usk-label">Nazwa *</label>
              <input
                className="usk-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="np. CC, Klient SunFee"
              />

              <label className="usk-label">Koszt marketingowy netto (zł) *</label>
              <input
                className="usk-input"
                type="number"
                min="1"
                step="1"
                value={form.marketingCost}
                onChange={(e) => setForm({ ...form, marketingCost: e.target.value })}
                placeholder="np. 6000"
              />
              <p className="usk-hint">Koszt marketingowy doliczany do kalkulacji dla tego źródła leadu.</p>

              <label className="usk-checkbox-label">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Aktywny
              </label>
            </div>
            <div className="usk-modal-footer">
              <button className="usk-btn usk-btn--ghost" onClick={closeModal}>Anuluj</button>
              <button className="usk-btn usk-btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? "Zapisywanie..." : "Zapisz"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          message="Czy na pewno chcesz dezaktywować to źródło leadu?"
          onConfirm={handleDeactivate}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function UstawieniaKalkulatora() {
  const [activeTab, setActiveTab] = useState("falowniki");

  return (
    <div className="usk-wrapper">
      <div className="usk-page-header">
        <h1 className="usk-page-title">Ustawienia kalkulatora</h1>
        <p className="usk-page-subtitle">Zarządzanie katalogami produktów używanych w kalkulatorze Sun Fee</p>
      </div>

      <div className="usk-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`usk-tab${activeTab === t.key ? " usk-tab--active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={`usk-tab-content${activeTab === "przewody" || activeTab === "przekopy" || activeTab === "montaz-kwp" ? " usk-tab-content--wide" : ""}`}>
        {activeTab === "falowniki"         && <FalownikiTab />}
        {activeTab === "panele"            && <PaneleTab />}
        {activeTab === "magazyny"           && <MagazynyTab />}
        {activeTab === "klimatyzatory"      && <KlimatyzatoryTab />}
        {activeTab === "lead-sources"       && <LeadSourcesTab />}
        {activeTab === "dodatkowe-produkty" && <DodatkoweProduktyUstawienia />}
        {activeTab === "typy-montazu"       && <TypMontazuTab />}
        {activeTab === "przewody"           && <PrzewodyTab />}
        {activeTab === "przekopy"           && <PrzekopyPanel />}
        {activeTab === "montaz-kwp"         && <MontazKwpUstawienia />}
        {activeTab === "marza-koncowa"      && <MarzaKoncowaUstawienia />}
      </div>
    </div>
  );
}
