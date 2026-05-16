import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import api from "@/utils/axiosInstance";
import { normalizePriceTiers } from "@/utils/magazynPricing";
import {
  mergeFalownikCatalog,
  saveFalownikPriceTiers,
} from "@/utils/falownikTiersStorage";

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { key: "falowniki",      label: "Falowniki" },
  { key: "panele",         label: "Panele fotowoltaiczne" },
  { key: "magazyny",       label: "Magazyny energii" },
  { key: "klimatyzatory",  label: "Klimatyzatory" },
  { key: "lead-sources",   label: "Koszty marketingowe" },
];

const EMPTY_FALOWNIK = {
  name: "",
  powerKw: "",
  priceTiers: ["3000", "2950", "2940", "2930"],
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
  priceTiers: ["3000", "2950", "2940", "2930"],
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

// ─── Falowniki tab ────────────────────────────────────────────────────────────

function FalownikiTab() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null); // null | { mode: "add"|"edit", data: {} }
  const [form,    setForm]    = useState(EMPTY_FALOWNIK);
  const [saving,  setSaving]  = useState(false);
  const [confirm, setConfirm] = useState(null); // id to deactivate

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/kalkulator/falowniki");
      setItems(mergeFalownikCatalog(res.data));
    } catch {
      toast.error("Nie udało się pobrać falowników");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setForm(EMPTY_FALOWNIK); setModal({ mode: "add" }); };
  const openEdit = (item) => {
    setForm({
      name: item.name,
      powerKw: item.powerKw,
      priceTiers: normalizePriceTiers(item).map(String),
      isActive: item.isActive,
    });
    setModal({ mode: "edit", id: item.id });
  };
  const closeModal = () => setModal(null);

  const setTierPrice = (index, value) => {
    setForm((prev) => {
      const tiers = [...(prev.priceTiers || [])];
      tiers[index] = value;
      return { ...prev, priceTiers: tiers };
    });
  };

  const addTier = () => {
    setForm((prev) => {
      const tiers = [...(prev.priceTiers || [])];
      const last = tiers.length ? tiers[tiers.length - 1] : "";
      tiers.push(last);
      return { ...prev, priceTiers: tiers };
    });
  };

  const removeTier = (index) => {
    setForm((prev) => {
      const tiers = (prev.priceTiers || []).filter((_, i) => i !== index);
      return { ...prev, priceTiers: tiers.length ? tiers : [""] };
    });
  };

  const validate = () => {
    if (!form.name.trim())               { toast.warn("Nazwa jest wymagana"); return false; }
    if (!form.powerKw || +form.powerKw <= 0) { toast.warn("Moc musi być większa od 0"); return false; }
    const tiers = (form.priceTiers || []).map((p) => +p).filter((n) => n > 0);
    if (!tiers.length) { toast.warn("Podaj co najmniej jedną cenę w cenniku progowym"); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const tiers = (form.priceTiers || []).map((p) => +p).filter((n) => n > 0);
      const payload = {
        name: form.name.trim(),
        powerKw: +form.powerKw,
        priceNetto: tiers[0],
        isActive: form.isActive,
      };
      if (modal.mode === "add") {
        const res = await api.post("/kalkulator/falowniki", payload);
        if (res.data?.id) saveFalownikPriceTiers(res.data.id, tiers);
        toast.success("Falownik dodany");
      } else {
        await api.patch(`/kalkulator/falowniki/${modal.id}`, payload);
        saveFalownikPriceTiers(modal.id, tiers);
        toast.success("Falownik zaktualizowany");
      }
      closeModal();
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || "Błąd zapisu");
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
      toast.error(e.response?.data?.message || "Błąd dezaktywacji");
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
                <th>Moc (kW)</th>
                <th>Cennik progowy (zł)</th>
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
                  <td>{item.powerKw}</td>
                  <td>
                    {normalizePriceTiers(item).slice(0, 4).map((p, i) => (
                      <span key={i} className="usk-chip" style={{ marginRight: 4 }}>
                        {i + 1}.: {fmt(p)}
                      </span>
                    ))}
                    {normalizePriceTiers(item).length > 4 && "…"}
                  </td>
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
              <h3>{modal.mode === "add" ? "Dodaj falownik" : "Edytuj falownik"}</h3>
              <button className="usk-close" onClick={closeModal}>×</button>
            </div>
            <div className="usk-modal-body">
              <label className="usk-label">Nazwa *</label>
              <input className="usk-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="np. Deye 5" />

              <label className="usk-label">Moc (kW) *</label>
              <input className="usk-input" type="number" min="0.1" step="0.1" value={form.powerKw} onChange={(e) => setForm({ ...form, powerKw: e.target.value })} placeholder="np. 5" />

              <label className="usk-label">Cennik progowy (zł netto) *</label>
              <p className="usk-hint" style={{ marginTop: 0 }}>
                Cena za 1., 2., 3. … falownik. Przy większej ilości ostatnia zdefiniowana cena powtarza się.
              </p>
              {(form.priceTiers || []).map((tier, index) => (
                <div key={index} className="usk-form-row" style={{ alignItems: "center", marginBottom: 8 }}>
                  <span className="usk-label" style={{ minWidth: 100, marginBottom: 0 }}>
                    {index + 1}. falownik
                  </span>
                  <input
                    className="usk-input"
                    type="number"
                    min="1"
                    step="1"
                    value={tier}
                    onChange={(e) => setTierPrice(index, e.target.value)}
                    placeholder="np. 3000"
                  />
                  {(form.priceTiers || []).length > 1 && (
                    <button
                      type="button"
                      className="usk-btn usk-btn--sm usk-btn--danger-outline"
                      onClick={() => removeTier(index)}
                    >
                      Usuń
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="usk-btn usk-btn--sm" style={{ marginBottom: 16 }} onClick={addTier}>
                + Kolejna pozycja cennika
              </button>

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
      toast.error(e.response?.data?.message || "Błąd zapisu");
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
      toast.error(e.response?.data?.message || "Błąd dezaktywacji");
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
      toast.error(e.response?.data?.message || "Błąd zapisu");
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
      toast.error(e.response?.data?.message || "Błąd dezaktywacji");
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
  const [items,       setItems]       = useState([]);
  const [falowniki,   setFalowniki]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [modal,       setModal]       = useState(null);
  const [form,        setForm]        = useState(EMPTY_MAGAZYN);
  const [saving,      setSaving]      = useState(false);
  const [confirm,     setConfirm]     = useState(null);

  const loadFalowniki = useCallback(async () => {
    try {
      const res = await api.get("/kalkulator/falowniki?onlyActive=true");
      setFalowniki(mergeFalownikCatalog(res.data));
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

  const openAdd = () => {
    setForm(EMPTY_MAGAZYN);
    setModal({ mode: "add" });
  };

  const openEdit = (item) => {
    setForm({
      name:          item.name,
      compatibility: item.compatibility,
      capacityKwh:   item.capacityKwh,
      powerKw:       item.powerKw,
      wagaKg:        item.wagaKg != null ? String(item.wagaKg) : "",
      priceTiers:    normalizePriceTiers(item).map(String),
      falownikiIds:  (item.falowniki || []).map((f) => f.id),
      isActive:      item.isActive,
    });
    setModal({ mode: "edit", id: item.id });
  };

  const setTierPrice = (index, value) => {
    setForm((prev) => {
      const tiers = [...(prev.priceTiers || [])];
      tiers[index] = value;
      return { ...prev, priceTiers: tiers };
    });
  };

  const addTier = () => {
    setForm((prev) => {
      const tiers = [...(prev.priceTiers || [])];
      const last = tiers.length ? tiers[tiers.length - 1] : "";
      tiers.push(last);
      return { ...prev, priceTiers: tiers };
    });
  };

  const removeTier = (index) => {
    setForm((prev) => {
      const tiers = (prev.priceTiers || []).filter((_, i) => i !== index);
      return { ...prev, priceTiers: tiers.length ? tiers : [""] };
    });
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
    if (!form.name.trim())          { toast.warn("Nazwa jest wymagana"); return false; }
    if (!form.compatibility.trim()) { toast.warn("Kompatybilność jest wymagana"); return false; }
    const tiers = (form.priceTiers || []).map((p) => +p).filter((n) => n > 0);
    if (!tiers.length) { toast.warn("Podaj co najmniej jedną cenę w cenniku progowym"); return false; }
    if (form.wagaKg !== "" && Number(form.wagaKg) < 0) { toast.warn("Waga nie może być ujemna"); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const tiers = (form.priceTiers || []).map((p) => +p).filter((n) => n > 0);
      const payload = {
        name:          form.name.trim(),
        compatibility: form.compatibility.trim(),
        capacityKwh:   form.capacityKwh !== "" ? +form.capacityKwh : undefined,
        powerKw:       form.powerKw     !== "" ? +form.powerKw     : undefined,
        wagaKg:        form.wagaKg === "" ? null : +form.wagaKg,
        priceTiers:    tiers,
        priceNetto:    tiers[0],
        falownikiIds:  form.falownikiIds,
        isActive:      form.isActive,
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
      toast.error(e.response?.data?.message || "Błąd zapisu");
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
      toast.error(e.response?.data?.message || "Błąd dezaktywacji");
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
                <th>Cennik progowy (zł)</th>
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
              {items.map((item) => (
                <tr key={item.id} className={item.isActive ? "" : "usk-row--inactive"}>
                  <td className={item.isActive ? "" : "usk-strikethrough"}>{item.name}</td>
                  <td>{item.capacityKwh ?? "—"}</td>
                  <td>{item.powerKw ?? "—"}</td>
                  <td>{item.wagaKg != null ? `${item.wagaKg} kg` : "—"}</td>
                  <td>
                    {normalizePriceTiers(item).slice(0, 4).map((p, i) => (
                      <span key={i} className="usk-chip" style={{ marginRight: 4 }}>
                        {i + 1}.: {fmt(p)}
                      </span>
                    ))}
                    {normalizePriceTiers(item).length > 4 && "…"}
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
              ))}
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
              <input className="usk-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="np. Deye 5,12 kWh" />

              <label className="usk-label">Marka kompatybilnych falowników *</label>
              <input className="usk-input" value={form.compatibility} onChange={(e) => setForm({ ...form, compatibility: e.target.value })} placeholder="np. Deye" />

              <div className="usk-form-row">
                <div className="usk-form-col">
                  <label className="usk-label">Pojemność (kWh)</label>
                  <input className="usk-input" type="number" min="0" step="0.01" value={form.capacityKwh} onChange={(e) => setForm({ ...form, capacityKwh: e.target.value })} placeholder="np. 5.12" />
                </div>
                <div className="usk-form-col">
                  <label className="usk-label">Moc (kW)</label>
                  <input className="usk-input" type="number" min="0" step="0.01" value={form.powerKw} onChange={(e) => setForm({ ...form, powerKw: e.target.value })} placeholder="np. 2.56" />
                </div>
              </div>

              <label className="usk-label">Waga (kg)</label>
              <input
                className="usk-input"
                type="number"
                min="0"
                step="0.1"
                value={form.wagaKg}
                onChange={(e) => setForm({ ...form, wagaKg: e.target.value })}
                placeholder="np. 100 (opcjonalnie, puste = brak w katalogu)"
              />
              <p className="usk-hint">Używana w kalkulatorze przy ostrzeżeniu o transporcie i montażu.</p>

              <label className="usk-label">Cennik progowy (zł netto) *</label>
              <p className="usk-hint" style={{ marginTop: 0 }}>
                Cena za 1., 2., 3. … baterię. Przy większej ilości ostatnia zdefiniowana cena powtarza się.
              </p>
              {(form.priceTiers || []).map((tier, index) => (
                <div key={index} className="usk-form-row" style={{ alignItems: "center", marginBottom: 8 }}>
                  <span className="usk-label" style={{ minWidth: 100, marginBottom: 0 }}>
                    {index + 1}. bateria
                  </span>
                  <input
                    className="usk-input"
                    type="number"
                    min="1"
                    step="1"
                    value={tier}
                    onChange={(e) => setTierPrice(index, e.target.value)}
                    placeholder="np. 3000"
                  />
                  {(form.priceTiers || []).length > 1 && (
                    <button
                      type="button"
                      className="usk-btn usk-btn--sm usk-btn--danger-outline"
                      onClick={() => removeTier(index)}
                    >
                      Usuń
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="usk-btn usk-btn--sm" style={{ marginBottom: 16 }} onClick={addTier}>
                + Kolejna pozycja cennika
              </button>

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
      toast.error(e.response?.data?.message || "Błąd zapisu");
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
      toast.error(e.response?.data?.message || "Błąd dezaktywacji");
    }
  };

  const handleActivate = async (id) => {
    try {
      await api.patch(`/lead-sources/${id}/activate`);
      toast.success("Źródło leadu aktywowane");
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || "Błąd aktywacji");
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

      <div className="usk-tab-content">
        {activeTab === "falowniki"    && <FalownikiTab />}
        {activeTab === "panele"       && <PaneleTab />}
        {activeTab === "magazyny"      && <MagazynyTab />}
        {activeTab === "klimatyzatory" && <KlimatyzatoryTab />}
        {activeTab === "lead-sources"  && <LeadSourcesTab />}
      </div>
    </div>
  );
}
