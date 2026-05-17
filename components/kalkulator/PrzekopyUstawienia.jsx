import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import api from "@/utils/axiosInstance";
import {
  syncKopaniePrzekopCache,
  formatKopanieZakres,
} from "@/utils/przekopSettings";

const EMPTY_FORM = { odMetrow: "", doMetrow: "", priceNetto: "" };

function extractApiError(err, fallback) {
  const msg = err?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === "string") return msg;
  return fallback;
}

export default function PrzekopyPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/kopanie-transei");
      const data = (res.data || []).sort(
        (a, b) => Number(a.odMetrow) - Number(b.odMetrow),
      );
      setItems(data);
      syncKopaniePrzekopCache(data);
    } catch {
      toast.error("Nie udało się pobrać cennika przekopów");
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
      odMetrow: String(item.odMetrow ?? ""),
      doMetrow: String(item.doMetrow ?? ""),
      priceNetto: String(item.priceNetto ?? ""),
    });
    setModal({ mode: "edit", item });
  };

  const closeModal = () => setModal(null);

  const validate = () => {
    const from = parseFloat(form.odMetrow);
    const to = parseFloat(form.doMetrow);
    const price = parseFloat(String(form.priceNetto).replace(",", "."));
    if (!Number.isFinite(from) || from < 0) {
      toast.warn("Podaj poprawny zakres od (m)");
      return false;
    }
    if (!Number.isFinite(to) || to <= from) {
      toast.warn("Zakres do musi być większy niż od");
      return false;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.warn("Cena musi być liczbą ≥ 0");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        odMetrow: parseFloat(form.odMetrow),
        doMetrow: parseFloat(form.doMetrow),
        priceNetto: parseFloat(String(form.priceNetto).replace(",", ".")),
      };
      if (modal.mode === "add") {
        await api.post("/kopanie-transei", payload);
        toast.success("Zakres dodany");
      } else {
        await api.patch(`/kopanie-transei/${modal.item.id}`, payload);
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
      await api.delete(`/kopanie-transei/${item.id}`);
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
      await api.patch(`/kopanie-transei/${item.id}/activate`);
      toast.success("Zakres aktywowany");
      load();
    } catch (err) {
      toast.error(extractApiError(err, "Błąd aktywacji"));
    } finally {
      setBusyId(null);
    }
  };

  const fmt = (n) =>
    new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 0 }).format(Number(n));

  return (
    <div className="usk-przekopy-panel">
      <div className="usk-tab-header" style={{ marginBottom: 16 }}>
        <div>
          <h2 className="usk-tab-title">Przekopy</h2>
          <p className="usk-panel-desc" style={{ margin: "6px 0 0" }}>
            Cennik kopania wg długości przekopu (zł netto). Dane zapisane w bazie — używane w
            kalkulatorze przy koszcie przekopu.
          </p>
        </div>
        <div className="usk-przekop-actions">
          <button type="button" className="usk-btn usk-btn--primary usk-btn--sm" onClick={openAdd}>
            + Dodaj zakres
          </button>
        </div>
      </div>

      {loading ? (
        <div className="usk-loading" style={{ padding: "24px 0" }}>
          Ładowanie…
        </div>
      ) : (
        <div className="usk-kopanie-table-wrap">
          <table className="usk-przewod-table usk-kopanie-table">
            <thead>
              <tr>
                <th>Zakres długości</th>
                <th>Cena netto (zł)</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="usk-empty">
                    Brak zakresów — dodaj pierwszy zakres
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id} className={item.isActive ? "" : "usk-row--inactive"}>
                  <td
                    className={
                      item.isActive ? "usk-kopanie-zakres" : "usk-kopanie-zakres usk-strikethrough"
                    }
                  >
                    {formatKopanieZakres(item.odMetrow, item.doMetrow)}
                  </td>
                  <td>{fmt(item.priceNetto)} zł</td>
                  <td>
                    <span
                      className={`usk-badge ${item.isActive ? "usk-badge--active" : "usk-badge--inactive"}`}
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
              <h3>{modal.mode === "add" ? "Dodaj zakres kopania" : "Edytuj zakres kopania"}</h3>
              <button type="button" className="usk-close" onClick={closeModal}>
                ×
              </button>
            </div>
            <div className="usk-modal-body">
              <div className="usk-form-row">
                <div className="usk-form-col">
                  <label className="usk-label">Od (m) *</label>
                  <input
                    className="usk-input"
                    type="number"
                    min="0"
                    step="1"
                    value={form.odMetrow}
                    onChange={(e) => setForm({ ...form, odMetrow: e.target.value })}
                    placeholder="np. 0"
                    disabled={saving}
                  />
                </div>
                <div className="usk-form-col">
                  <label className="usk-label">Do (m) *</label>
                  <input
                    className="usk-input"
                    type="number"
                    min="1"
                    step="1"
                    value={form.doMetrow}
                    onChange={(e) => setForm({ ...form, doMetrow: e.target.value })}
                    placeholder="np. 10"
                    disabled={saving}
                  />
                </div>
              </div>
              <label className="usk-label">Cena netto (zł) *</label>
              <input
                className="usk-input"
                type="number"
                min="0"
                step="1"
                value={form.priceNetto}
                onChange={(e) => setForm({ ...form, priceNetto: e.target.value })}
                placeholder="np. 700"
                disabled={saving}
              />
              <p className="usk-hint">
                Zakres: <strong>{formatKopanieZakres(form.odMetrow, form.doMetrow)}</strong>
                {" "}
                (metraż &gt; {form.odMetrow || "od"} m i ≤ {form.doMetrow || "do"} m, przy od=0: 0–do m).
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
