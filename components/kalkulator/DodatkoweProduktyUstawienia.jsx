import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import {
  loadDodatkoweProdukty,
  saveDodatkoweProdukty,
} from "@/utils/dodatkoweProduktySettings";

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
    <div className="usk-overlay">
      <div className="usk-modal usk-modal--sm">
        <div className="usk-modal-head">
          <h3>Potwierdzenie</h3>
          <button type="button" className="usk-close" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="usk-modal-body">
          <p>{message}</p>
        </div>
        <div className="usk-modal-footer">
          <button type="button" className="usk-btn usk-btn--ghost" onClick={onCancel}>
            Anuluj
          </button>
          <button type="button" className="usk-btn usk-btn--danger" onClick={onConfirm}>
            Potwierdź
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DodatkoweProduktyUstawienia() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    try {
      const data = loadDodatkoweProdukty().sort((a, b) =>
        String(a.name).localeCompare(String(b.name), "pl"),
      );
      setItems(data);
      saveDodatkoweProdukty(data);
    } catch {
      toast.error("Nie udało się wczytać dodatkowych produktów");
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
      name: item.name,
      priceNetto: item.priceNetto ?? "",
      isActive: item.isActive,
    });
    setModal({ mode: "edit", id: item.id });
  };

  const closeModal = () => setModal(null);

  const validate = () => {
    if (!form.name.trim()) {
      toast.warn("Nazwa jest wymagana");
      return false;
    }
    const price = parseFloat(String(form.priceNetto).replace(",", "."));
    if (!Number.isFinite(price) || price < 0) {
      toast.warn("Cena musi być liczbą ≥ 0");
      return false;
    }
    return true;
  };

  const persist = (next) => {
    saveDodatkoweProdukty(next);
    setItems(next);
  };

  const handleSave = () => {
    if (!validate()) return;
    const price = parseFloat(String(form.priceNetto).replace(",", "."));
    const payload = {
      name: form.name.trim(),
      priceNetto: price,
      isActive: form.isActive,
    };

    if (modal.mode === "add") {
      const next = [
        ...items,
        { id: Date.now(), ...payload },
      ].sort((a, b) => String(a.name).localeCompare(String(b.name), "pl"));
      persist(next);
      toast.success("Produkt dodany");
    } else {
      const next = items
        .map((it) => (it.id === modal.id ? { ...it, ...payload } : it))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "pl"));
      persist(next);
      toast.success("Produkt zaktualizowany");
    }
    closeModal();
  };

  const handleDeactivate = () => {
    const next = items.map((it) =>
      it.id === confirm ? { ...it, isActive: false } : it,
    );
    persist(next);
    toast.success("Produkt dezaktywowany");
    setConfirm(null);
  };

  const handleActivate = (id) => {
    const next = items.map((it) => (it.id === id ? { ...it, isActive: true } : it));
    persist(next);
    toast.success("Produkt aktywowany");
  };

  return (
    <>
      <div className="usk-tab-header">
        <div>
          <h2 className="usk-tab-title">Dodatkowe produkty</h2>
          <p className="usk-panel-desc" style={{ margin: "6px 0 0" }}>
            Katalog dodatkowych produktów (nazwa + cena netto). Dane zapisane lokalnie w
            przeglądarce do czasu podłączenia API.
          </p>
        </div>
        <button type="button" className="usk-btn usk-btn--primary" onClick={openAdd}>
          + Dodaj produkt
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
                <th>Status</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="usk-empty">
                    Brak produktów — dodaj pierwszy
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id} className={item.isActive ? "" : "usk-row--inactive"}>
                  <td className={item.isActive ? "" : "usk-strikethrough"}>{item.name}</td>
                  <td>{fmt(item.priceNetto)} zł</td>
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
              <h3>{modal.mode === "add" ? "Dodaj produkt" : "Edytuj produkt"}</h3>
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
                placeholder="np. Optymalizator, Monitoring"
              />

              <label className="usk-label">Cena netto (zł) *</label>
              <input
                className="usk-input"
                type="number"
                min="0"
                step="0.01"
                value={form.priceNetto}
                onChange={(e) => setForm({ ...form, priceNetto: e.target.value })}
                placeholder="np. 1500"
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
              <button type="button" className="usk-btn usk-btn--primary" onClick={handleSave}>
                Zapisz
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm != null && (
        <ConfirmModal
          message="Czy na pewno chcesz dezaktywować ten produkt?"
          onConfirm={handleDeactivate}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
