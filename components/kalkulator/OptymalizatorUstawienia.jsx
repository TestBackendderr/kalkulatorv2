import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import api from "@/utils/axiosInstance";
import { formatApiErrorMessage } from "@/utils/apiError";
import KartaKatalogowaField from "@/components/kalkulator/KartaKatalogowaField";
import KartaKatalogowaTableCell from "@/components/kalkulator/KartaKatalogowaTableCell";
import { applyKartaKatalogowaAfterSave } from "@/utils/kartaKatalogowaSave";

const EMPTY_FORM = { name: "", priceNetto: "", isActive: true };

const fmt = (n) =>
  new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n));

function StatusBadge({ isActive }) {
  return (
    <span className={`usk-badge ${isActive ? "usk-badge--active" : "usk-badge--inactive"}`}>
      {isActive ? "Aktywny" : "Nieaktywny"}
    </span>
  );
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="usk-overlay" onClick={onCancel}>
      <div className="usk-modal usk-modal--sm" onClick={(e) => e.stopPropagation()}>
        <p className="usk-confirm-msg">{message}</p>
        <div className="usk-modal-footer">
          <button type="button" className="usk-btn usk-btn--ghost" onClick={onCancel}>
            Anuluj
          </button>
          <button type="button" className="usk-btn usk-btn--danger" onClick={onConfirm}>
            Dezaktywuj
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OptymalizatorUstawienia() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [kartaUrl, setKartaUrl] = useState(null);
  const [pendingPdf, setPendingPdf] = useState(null);
  const [removeKarta, setRemoveKarta] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/optymalizatory");
      setItems(res.data || []);
    } catch (e) {
      toast.error(formatApiErrorMessage(e, "Nie udało się pobrać optymalizatorów"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetKartaState = () => {
    setKartaUrl(null);
    setPendingPdf(null);
    setRemoveKarta(false);
  };

  const openAdd = () => {
    setForm(EMPTY_FORM);
    resetKartaState();
    setModal({ mode: "add" });
  };

  const openEdit = (item) => {
    setForm({
      name: item.name,
      priceNetto: item.priceNetto ?? "",
      isActive: item.isActive,
    });
    setKartaUrl(item.kartaKatalogowaUrl ?? null);
    setPendingPdf(null);
    setRemoveKarta(false);
    setModal({ mode: "edit", id: item.id });
  };

  const closeModal = () => {
    setModal(null);
    resetKartaState();
  };

  const validate = () => {
    if (!form.name.trim()) {
      toast.warn("Nazwa jest wymagana");
      return false;
    }
    const price = parseFloat(String(form.priceNetto).replace(",", "."));
    if (!Number.isFinite(price) || price <= 0) {
      toast.warn("Cena musi być liczbą większą od 0");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        priceNetto: parseFloat(String(form.priceNetto).replace(",", ".")),
        isActive: form.isActive,
      };
      let entityId = modal.id;
      if (modal.mode === "add") {
        const res = await api.post("/optymalizatory", payload);
        entityId = res.data?.id;
        toast.success("Optymalizator dodany");
      } else {
        await api.patch(`/optymalizatory/${modal.id}`, payload);
        toast.success("Optymalizator zaktualizowany");
      }
      if (entityId) {
        await applyKartaKatalogowaAfterSave({
          entityType: "optymalizator",
          entityId,
          pendingFile: pendingPdf,
          previousUrl: kartaUrl,
          cleared: removeKarta,
        });
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
      await api.delete(`/optymalizatory/${confirm}`);
      toast.success("Optymalizator dezaktywowany");
      setConfirm(null);
      load();
    } catch (e) {
      toast.error(formatApiErrorMessage(e, "Błąd dezaktywacji"));
    }
  };

  const handleActivate = async (id) => {
    try {
      await api.patch(`/optymalizatory/${id}/activate`);
      toast.success("Optymalizator aktywowany");
      load();
    } catch (e) {
      toast.error(formatApiErrorMessage(e, "Błąd aktywacji"));
    }
  };

  return (
    <>
      <div className="usk-tab-header">
        <div>
          <h2 className="usk-tab-title">Optymalizator</h2>
          <p className="usk-panel-desc" style={{ margin: "6px 0 0" }}>
            Katalog optymalizatorów (nazwa + cena netto).
          </p>
        </div>
        <button type="button" className="usk-btn usk-btn--primary" onClick={openAdd}>
          + Dodaj optymalizator
        </button>
      </div>

      {loading ? (
        <div className="usk-loading">Ładowanie…</div>
      ) : (
        <div className="usk-table-wrap">
          <table className="usk-table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Cena netto (zł)</th>
                <th>Karta PDF</th>
                <th>Status</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="usk-empty">
                    Brak optymalizatorów — dodaj pierwszy
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id} className={item.isActive ? "" : "usk-row--inactive"}>
                  <td className={item.isActive ? "" : "usk-strikethrough"}>{item.name}</td>
                  <td>{fmt(item.priceNetto)} zł</td>
                  <KartaKatalogowaTableCell url={item.kartaKatalogowaUrl} />
                  <td>
                    <StatusBadge isActive={item.isActive} />
                  </td>
                  <td className="usk-actions">
                    <button
                      type="button"
                      className="usk-btn usk-btn--sm"
                      onClick={() => openEdit(item)}
                    >
                      Edytuj
                    </button>
                    {item.isActive ? (
                      <button
                        type="button"
                        className="usk-btn usk-btn--sm usk-btn--danger-outline"
                        onClick={() => setConfirm(item.id)}
                      >
                        Dezaktywuj
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="usk-btn usk-btn--sm usk-btn--primary"
                        onClick={() => handleActivate(item.id)}
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
              <h3>{modal.mode === "add" ? "Dodaj optymalizator" : "Edytuj optymalizator"}</h3>
              <button type="button" className="usk-close" onClick={closeModal}>
                ×
              </button>
            </div>
            <div className="usk-modal-body">
              <label className="usk-label">Nazwa *</label>
              <input
                className="usk-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="np. Optymalizator Huawei"
              />

              <label className="usk-label">Cena netto (zł) *</label>
              <input
                className="usk-input"
                type="number"
                min="0.01"
                step="0.01"
                value={form.priceNetto}
                onChange={(e) => setForm({ ...form, priceNetto: e.target.value })}
                placeholder="np. 250"
              />

              <KartaKatalogowaField
                url={removeKarta ? null : kartaUrl}
                onUrlChange={setKartaUrl}
                pendingFile={pendingPdf}
                onPendingFileChange={(f) => {
                  setPendingPdf(f);
                  if (f) setRemoveKarta(false);
                }}
                onRemove={() => setRemoveKarta(true)}
                disabled={saving}
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

      {confirm != null && (
        <ConfirmModal
          message="Czy na pewno chcesz dezaktywować ten optymalizator?"
          onConfirm={handleDeactivate}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
