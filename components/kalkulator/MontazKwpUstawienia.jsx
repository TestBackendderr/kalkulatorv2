import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import api from "@/utils/axiosInstance";
import {
  syncMontazKwpCache,
  formatMontazKwpZakres,
} from "@/utils/montazKwpSettings";

const EMPTY_FORM = { odKw: "", doKw: "", priceNetto: "" };

function extractApiError(err, fallback) {
  const msg = err?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === "string") return msg;
  return fallback;
}

const fmt = (n) =>
  new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(n));

export default function MontazKwpUstawienia() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/cena-montazu");
      const data = (res.data || []).sort(
        (a, b) => Number(a.odKw) - Number(b.odKw),
      );
      setItems(data);
      syncMontazKwpCache(data);
    } catch {
      toast.error("Nie udało się pobrać cennika montażu PV");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setModal({ mode: "add" });
  };

  const openEdit = (item) => {
    setForm({
      odKw: String(item.odKw ?? ""),
      doKw: String(item.doKw ?? ""),
      priceNetto: String(item.priceNetto ?? ""),
    });
    setModal({ mode: "edit", item });
  };

  const closeModal = () => setModal(null);

  const validate = () => {
    const from = parseFloat(String(form.odKw).replace(",", "."));
    const to = parseFloat(String(form.doKw).replace(",", "."));
    const price = parseFloat(String(form.priceNetto).replace(",", "."));
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

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        odKw: parseFloat(String(form.odKw).replace(",", ".")),
        doKw: parseFloat(String(form.doKw).replace(",", ".")),
        priceNetto: parseFloat(String(form.priceNetto).replace(",", ".")),
      };
      if (modal.mode === "add") {
        await api.post("/cena-montazu", payload);
        toast.success("Zakres dodany");
      } else {
        await api.patch(`/cena-montazu/${modal.item.id}`, payload);
        toast.success("Zakres zaktualizowany");
      }
      closeModal();
      load();
    } catch (err) {
      toast.error(extractApiError(err, "Błąd zapisu"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (item) => {
    setBusyId(item.id);
    try {
      await api.delete(`/cena-montazu/${item.id}`);
      toast.success("Zakres dezaktywowany");
      load();
    } catch (err) {
      toast.error(extractApiError(err, "Błąd dezaktywacji"));
    } finally {
      setBusyId(null);
    }
  };

  const handleActivate = async (item) => {
    setBusyId(item.id);
    try {
      await api.patch(`/cena-montazu/${item.id}/activate`);
      toast.success("Zakres aktywowany");
      load();
    } catch (err) {
      toast.error(extractApiError(err, "Błąd aktywacji"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="usk-przekopy-panel">
      <div className="usk-tab-header" style={{ marginBottom: 16 }}>
        <div>
          <h2 className="usk-tab-title">Montaż PV (kWp)</h2>
          <p className="usk-panel-desc" style={{ margin: "6px 0 0" }}>
            Cennik montażu PV wg mocy instalacji (kWp). W kalkulatorze:{" "}
            <strong>moc instalacji PV × stawka zł/kWp</strong> z jednego progu.
          </p>
        </div>
        <div className="usk-przekop-actions">
          <button type="button" className="usk-btn usk-btn--primary usk-btn--sm" onClick={openAdd}>
            + Dodaj zakres
          </button>
        </div>
      </div>

      {loading ? (
        <div className="usk-loading" style={{ padding: "24px 0" }}>Ładowanie…</div>
      ) : (
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
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="usk-empty">Brak zakresów — dodaj pierwszy</td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id} className={item.isActive ? "" : "usk-row--inactive"}>
                  <td
                    className={
                      item.isActive ? "usk-kopanie-zakres" : "usk-kopanie-zakres usk-strikethrough"
                    }
                  >
                    {formatMontazKwpZakres(item.odKw, item.doKw)}
                  </td>
                  <td>{fmt(item.priceNetto)} zł</td>
                  <td>
                    <span
                      className={`usk-badge ${
                        item.isActive ? "usk-badge--active" : "usk-badge--inactive"
                      }`}
                    >
                      {item.isActive ? "Aktywny" : "Nieaktywny"}
                    </span>
                  </td>
                  <td className="usk-actions">
                    <button
                      type="button"
                      className="usk-btn usk-btn--sm"
                      disabled={busyId === item.id}
                      onClick={() => openEdit(item)}
                    >
                      Edytuj
                    </button>
                    {item.isActive ? (
                      <button
                        type="button"
                        className="usk-btn usk-btn--sm usk-btn--danger-outline"
                        disabled={busyId === item.id}
                        onClick={() => handleDeactivate(item)}
                      >
                        Dezaktywuj
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="usk-btn usk-btn--sm usk-btn--primary"
                        disabled={busyId === item.id}
                        onClick={() => handleActivate(item)}
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
      )}

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
                    value={form.odKw}
                    onChange={(e) => setForm({ ...form, odKw: e.target.value })}
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
                    value={form.doKw}
                    onChange={(e) => setForm({ ...form, doKw: e.target.value })}
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
                value={form.priceNetto}
                onChange={(e) => setForm({ ...form, priceNetto: e.target.value })}
                disabled={saving}
              />
              <p className="usk-hint">
                Zakres: <strong>{formatMontazKwpZakres(form.odKw, form.doKw)}</strong>
              </p>
            </div>
            <div className="usk-modal-footer">
              <button type="button" className="usk-btn usk-btn--ghost" onClick={closeModal}>
                Anuluj
              </button>
              <button
                type="button"
                className="usk-btn usk-btn--primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Zapisywanie…" : "Zapisz"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
