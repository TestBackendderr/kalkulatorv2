import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import {
  loadMontazKwpTiers,
  saveMontazKwpTiers,
  formatMontazKwpZakres,
  DEFAULT_MONTAZ_KWP_TIERS,
} from "@/utils/montazKwpSettings";

const EMPTY_FORM = { odKwp: "", doKwp: "", cenaZaKwp: "" };

const fmt = (n) =>
  new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(n));

export default function MontazKwpUstawienia() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setItems(
      loadMontazKwpTiers().sort((a, b) => Number(a.odKwp) - Number(b.odKwp)),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const persist = (next) => {
    saveMontazKwpTiers(next);
    setItems(next);
  };

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setModal({ mode: "add" });
  };

  const openEdit = (item) => {
    setForm({
      odKwp: String(item.odKwp ?? ""),
      doKwp: String(item.doKwp ?? ""),
      cenaZaKwp: String(item.cenaZaKwp ?? ""),
    });
    setModal({ mode: "edit", item });
  };

  const closeModal = () => setModal(null);

  const validate = () => {
    const from = parseFloat(String(form.odKwp).replace(",", "."));
    const to = parseFloat(String(form.doKwp).replace(",", "."));
    const price = parseFloat(String(form.cenaZaKwp).replace(",", "."));
    if (!Number.isFinite(from) || from < 0) {
      toast.warn("Podaj poprawny zakres od (kWp)");
      return false;
    }
    if (!Number.isFinite(to) || to <= from) {
      toast.warn("Zakres do musi być większy niż od");
      return false;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.warn("Stawka musi być liczbą ≥ 0");
      return false;
    }
    return true;
  };

  const handleSave = () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const row = {
        odKwp: parseFloat(String(form.odKwp).replace(",", ".")),
        doKwp: parseFloat(String(form.doKwp).replace(",", ".")),
        cenaZaKwp: parseFloat(String(form.cenaZaKwp).replace(",", ".")),
        isActive: true,
      };
      if (modal.mode === "add") {
        persist(
          [...items, { ...row, id: `m${Date.now()}` }].sort(
            (a, b) => a.odKwp - b.odKwp,
          ),
        );
        toast.success("Zakres dodany");
      } else {
        persist(
          items
            .map((x) => (x.id === modal.item.id ? { ...x, ...row } : x))
            .sort((a, b) => a.odKwp - b.odKwp),
        );
        toast.success("Zakres zaktualizowany");
      }
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefaults = () => {
    if (!window.confirm("Przywrócić domyślny cennik montażu PV?")) return;
    persist(DEFAULT_MONTAZ_KWP_TIERS.map((t) => ({ ...t })));
    toast.success("Przywrócono domyślne wartości");
  };

  return (
    <div className="usk-przekopy-panel">
      <div className="usk-tab-header" style={{ marginBottom: 16 }}>
        <div>
          <h2 className="usk-tab-title">Montaż PV (kWp)</h2>
          <p className="usk-panel-desc" style={{ margin: "6px 0 0" }}>
            Stawka netto za kWp. W kalkulatorze:{" "}
            <strong>moc instalacji PV × stawka</strong> z jednego progu
            (np. 3,5 kWp × 600 zł = 2 100 zł).
          </p>
        </div>
        <div className="usk-przekop-actions">
          <button type="button" className="usk-btn usk-btn--ghost usk-btn--sm" onClick={handleRestoreDefaults}>
            Domyślne
          </button>
          <button type="button" className="usk-btn usk-btn--primary usk-btn--sm" onClick={openAdd}>
            + Dodaj zakres
          </button>
        </div>
      </div>

      <div className="usk-kopanie-table-wrap">
        <table className="usk-przewod-table usk-kopanie-table">
          <thead>
            <tr>
              <th>Zakres mocy PV</th>
              <th>Cena netto (zł / kWp)</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={item.isActive ? "" : "usk-row--inactive"}>
                <td className={item.isActive ? "usk-kopanie-zakres" : "usk-kopanie-zakres usk-strikethrough"}>
                  {formatMontazKwpZakres(item.odKwp, item.doKwp)}
                </td>
                <td>{fmt(item.cenaZaKwp)} zł</td>
                <td>
                  <span className={`usk-badge ${item.isActive ? "usk-badge--active" : "usk-badge--inactive"}`}>
                    {item.isActive ? "Aktywny" : "Nieaktywny"}
                  </span>
                </td>
                <td className="usk-actions">
                  <button type="button" className="usk-btn usk-btn--sm" onClick={() => openEdit(item)}>
                    Edytuj
                  </button>
                  {item.isActive ? (
                    <button
                      type="button"
                      className="usk-btn usk-btn--sm usk-btn--danger-outline"
                      onClick={() =>
                        persist(items.map((x) => (x.id === item.id ? { ...x, isActive: false } : x)))
                      }
                    >
                      Dezaktywuj
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="usk-btn usk-btn--sm usk-btn--primary"
                      onClick={() =>
                        persist(items.map((x) => (x.id === item.id ? { ...x, isActive: true } : x)))
                      }
                    >
                      Aktywuj
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="usk-overlay" onClick={closeModal}>
          <div className="usk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="usk-modal-head">
              <h3>{modal.mode === "add" ? "Dodaj zakres montażu" : "Edytuj zakres montażu"}</h3>
              <button type="button" className="usk-close" onClick={closeModal}>×</button>
            </div>
            <div className="usk-modal-body">
              <div className="usk-form-row">
                <div className="usk-form-col">
                  <label className="usk-label">Od (kWp) *</label>
                  <input
                    className="usk-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.odKwp}
                    onChange={(e) => setForm({ ...form, odKwp: e.target.value })}
                    disabled={saving}
                  />
                </div>
                <div className="usk-form-col">
                  <label className="usk-label">Do (kWp) *</label>
                  <input
                    className="usk-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.doKwp}
                    onChange={(e) => setForm({ ...form, doKwp: e.target.value })}
                    disabled={saving}
                  />
                </div>
              </div>
              <label className="usk-label">Cena netto za kWp (zł) *</label>
              <input
                className="usk-input"
                type="number"
                min="0"
                step="1"
                value={form.cenaZaKwp}
                onChange={(e) => setForm({ ...form, cenaZaKwp: e.target.value })}
                disabled={saving}
              />
              <p className="usk-hint">
                Zakres: <strong>{formatMontazKwpZakres(form.odKwp, form.doKwp)}</strong>
              </p>
            </div>
            <div className="usk-modal-footer">
              <button type="button" className="usk-btn usk-btn--ghost" onClick={closeModal}>Anuluj</button>
              <button type="button" className="usk-btn usk-btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? "Zapisywanie…" : "Zapisz"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
