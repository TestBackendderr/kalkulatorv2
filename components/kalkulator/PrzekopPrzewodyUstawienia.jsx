import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import api from "@/utils/axiosInstance";
import {
  PRZEKOP_LENGTH_ROWS,
  PRZEKOP_POWER_KWP,
  saveYkyMatrix,
  saveYakyMatrix,
  saveYkyPrices,
  saveYakyPrices,
  saveKopanieTransei,
} from "@/utils/przekopSettings";

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

/**
 * Normalize API matrix response so keys are numbers matching PRZEKOP_POWER_KWP.
 * API returns { "5": "YKY 5x4", ... }, frontend uses numeric kwp keys.
 */
function normalizeApiMatrix(apiMatrix) {
  if (!apiMatrix || typeof apiMatrix !== "object") return {};
  const result = {};
  for (const [dlugoscId, rowObj] of Object.entries(apiMatrix)) {
    result[dlugoscId] = {};
    for (const [kwpStr, name] of Object.entries(rowObj || {})) {
      result[dlugoscId][Number(kwpStr)] = name ?? "";
    }
  }
  return result;
}

function PrzekopMatrix({ title, subtitle, typ, matrix, lengthRows, powerKwp, onSaved, loading }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [saving, setSaving] = useState(false);

  const current = editing ? draft : matrix;

  const setCell = (rowId, kwp, value) => {
    setDraft((prev) => ({
      ...prev,
      [rowId]: { ...prev[rowId], [kwp]: value },
    }));
  };

  const startEdit = () => {
    const copy = cloneData(matrix);
    setSnapshot(copy);
    setDraft(copy);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(null);
    setSnapshot(null);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const patches = [];
      for (const row of lengthRows) {
        for (const kwp of powerKwp) {
          const newVal = draft[row.id]?.[kwp] ?? "";
          const oldVal = snapshot[row.id]?.[kwp] ?? "";
          if (newVal !== oldVal) {
            patches.push({ dlugoscId: row.id, kwp, nazwaPrzewodu: newVal || null });
          }
        }
      }
      if (patches.length === 0) {
        toast.info("Brak zmian");
        cancelEdit();
        return;
      }
      await Promise.all(
        patches.map(({ dlugoscId, kwp, nazwaPrzewodu }) =>
          api.patch(`/przewod-matryca/${typ}/${dlugoscId}/${kwp}`, { nazwaPrzewodu }),
        ),
      );
      toast.success(`Macierz ${typ === "Miedziany" ? "YKY" : "YAKY"} zapisana (${patches.length} zmian)`);
      onSaved(draft);
      setEditing(false);
      setDraft(null);
      setSnapshot(null);
    } catch (err) {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg || "Błąd zapisu macierzy");
    } finally {
      setSaving(false);
    }
  };

  const cellDisplay = (val) => {
    const v = val ?? "";
    if (!v || v === ".") return "·";
    return v;
  };

  return (
    <div className={`usk-przekop-block${editing ? " usk-przekop-block--editing" : ""}`}>
      <div className="usk-przekop-block-head">
        <div>
          <h3 className="usk-przekop-title">{title}</h3>
          {subtitle && <p className="usk-przekop-sub">{subtitle}</p>}
        </div>
        <div className="usk-przekop-actions">
          {editing ? (
            <>
              <button type="button" className="usk-btn usk-btn--ghost usk-btn--sm" onClick={cancelEdit} disabled={saving}>
                Anuluj
              </button>
              <button type="button" className="usk-btn usk-btn--primary usk-btn--sm" onClick={saveEdit} disabled={saving}>
                {saving ? "Zapisywanie…" : "Zapisz"}
              </button>
            </>
          ) : (
            <button type="button" className="usk-btn usk-btn--primary usk-btn--sm" onClick={startEdit} disabled={loading}>
              Edytuj
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="usk-loading" style={{ padding: "12px 0" }}>Ładowanie…</div>
      ) : (
        <div className="usk-matrix-wrap">
          <table className="usk-matrix">
            <thead>
              <tr>
                <th className="usk-matrix-corner">
                  Długość przekopu ↓
                  <span className="usk-matrix-corner-sub">Moc instalacji →</span>
                </th>
                {powerKwp.map((k) => (
                  <th key={k}>{k} kWp</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lengthRows.map((row) => (
                <tr key={row.id}>
                  <th className="usk-matrix-row-label">{row.label}</th>
                  {powerKwp.map((kwp) => (
                    <td key={kwp}>
                      {editing ? (
                        <input
                          type="text"
                          className="usk-matrix-cell"
                          value={current[row.id]?.[kwp] ?? ""}
                          placeholder="."
                          onChange={(e) => setCell(row.id, kwp, e.target.value)}
                        />
                      ) : (
                        <span className="usk-matrix-cell-readonly">
                          {cellDisplay(current[row.id]?.[kwp])}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const fmtPrice = (price) => {
  if (!price || price === 0) return "—";
  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
};

function extractApiError(err, fallback) {
  const msg = err?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === "string" && msg.trim()) return msg;
  return fallback;
}

const EMPTY_FORM = { name: "", cenaZaMetr: "" };

function PrzewodList({ title, typ, items, loading, onReload }) {
  const [modal, setModal] = useState(null); // null | { mode: "add" | "edit", item?: {} }
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const openAdd = () => { setForm(EMPTY_FORM); setModal({ mode: "add" }); };
  const openEdit = (item) => {
    setForm({ name: item.name, cenaZaMetr: String(item.cenaZaMetr ?? "") });
    setModal({ mode: "edit", item });
  };
  const closeModal = () => setModal(null);

  const validate = () => {
    if (!form.name.trim()) { toast.warn("Nazwa przewodu jest wymagana"); return false; }
    const price = parseFloat(String(form.cenaZaMetr).replace(",", "."));
    if (!Number.isFinite(price) || price < 0) { toast.warn("Cena musi być liczbą ≥ 0"); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const price = parseFloat(String(form.cenaZaMetr).replace(",", "."));
      if (modal.mode === "add") {
        await api.post("/przewody", { name: form.name.trim(), typ, cenaZaMetr: price });
        toast.success("Przewód dodany");
      } else {
        await api.patch(`/przewody/${modal.item.id}`, {
          name: form.name.trim(),
          cenaZaMetr: price,
        });
        toast.success("Przewód zaktualizowany");
      }
      closeModal();
      onReload();
    } catch (err) {
      toast.error(extractApiError(err, "Błąd zapisu"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (item) => {
    setBusyId(item.id);
    try {
      await api.delete(`/przewody/${item.id}`);
      toast.success("Przewód dezaktywowany");
      onReload();
    } catch (err) {
      toast.error(extractApiError(err, "Błąd dezaktywacji"));
    } finally {
      setBusyId(null);
    }
  };

  const handleActivate = async (item) => {
    setBusyId(item.id);
    try {
      await api.patch(`/przewody/${item.id}/activate`);
      toast.success("Przewód aktywowany");
      onReload();
    } catch (err) {
      toast.error(extractApiError(err, "Błąd aktywacji"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="usk-przewod-block">
      <div className="usk-przewod-block-head">
        <h3 className="usk-przewod-title">{title}</h3>
        <div className="usk-przewod-actions">
          <button type="button" className="usk-btn usk-btn--primary usk-btn--sm" onClick={openAdd}>
            + Dodaj
          </button>
        </div>
      </div>

      {loading ? (
        <div className="usk-loading" style={{ padding: "12px 0" }}>Ładowanie…</div>
      ) : (
        <table className="usk-przewod-table">
          <thead>
            <tr>
              <th>Nazwa przewodu</th>
              <th>Za metr (zł netto)</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={4} className="usk-empty">Brak przewodów</td></tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className={item.isActive ? "" : "usk-row--inactive"}>
                <td className={item.isActive ? "" : "usk-strikethrough"}>
                  <span className="usk-przewod-readonly">{item.name}</span>
                </td>
                <td>
                  <span className="usk-przewod-readonly usk-przewod-readonly--price">
                    {fmtPrice(item.cenaZaMetr)} zł/m
                  </span>
                </td>
                <td>
                  <span className={`usk-badge ${item.isActive ? "usk-badge--active" : "usk-badge--inactive"}`}>
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
      )}

      {modal && (
        <div className="usk-overlay" onClick={closeModal}>
          <div className="usk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="usk-modal-head">
              <h3>{modal.mode === "add" ? `Dodaj przewód – ${typ}` : "Edytuj przewód"}</h3>
              <button type="button" className="usk-close" onClick={closeModal}>×</button>
            </div>
            <div className="usk-modal-body">
              <label className="usk-label">Nazwa *</label>
              <input
                className="usk-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={typ === "Miedziany" ? "np. YKY 5x4" : "np. YAKY 5x16"}
                disabled={saving}
              />
              <label className="usk-label">Cena netto za metr (zł) *</label>
              <input
                className="usk-input"
                type="number"
                min="0"
                step="0.01"
                value={form.cenaZaMetr}
                onChange={(e) => setForm({ ...form, cenaZaMetr: e.target.value })}
                placeholder="np. 12.22"
                disabled={saving}
              />
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

export function PrzekopUstawieniaPanel() {
  const [ykyMatrix, setYkyMatrix] = useState({});
  const [yakyMatrix, setYakyMatrix] = useState({});
  const [ykyRows, setYkyRows] = useState(PRZEKOP_LENGTH_ROWS);
  const [yakyRows, setYakyRows] = useState(PRZEKOP_LENGTH_ROWS);
  const [ykyKwp, setYkyKwp] = useState(PRZEKOP_POWER_KWP);
  const [yakyKwp, setYakyKwp] = useState(PRZEKOP_POWER_KWP);
  const [loadingYky, setLoadingYky] = useState(true);
  const [loadingYaky, setLoadingYaky] = useState(true);

  const loadMatrices = useCallback(async () => {
    setLoadingYky(true);
    setLoadingYaky(true);
    try {
      const [mRes, aRes] = await Promise.all([
        api.get("/przewod-matryca/miedziane"),
        api.get("/przewod-matryca/aluminiowe"),
      ]);
      const mData = mRes.data;
      const aData = aRes.data;
      const mMatrix = normalizeApiMatrix(mData.matrix);
      const aMatrix = normalizeApiMatrix(aData.matrix);

      const toRows = (dlugosci) =>
        (dlugosci || PRZEKOP_LENGTH_ROWS.map((r) => r.id)).map((id) => {
          const found = PRZEKOP_LENGTH_ROWS.find((r) => r.id === id);
          return found || { id, label: id };
        });

      setYkyMatrix(mMatrix);
      setYakyMatrix(aMatrix);
      setYkyRows(toRows(mData.dlugosci));
      setYakyRows(toRows(aData.dlugosci));
      setYkyKwp((mData.moceKwp || PRZEKOP_POWER_KWP).map(Number));
      setYakyKwp((aData.moceKwp || PRZEKOP_POWER_KWP).map(Number));

      // sync to localStorage so computePrzekopQuote keeps working synchronously
      saveYkyMatrix(mMatrix);
      saveYakyMatrix(aMatrix);
    } catch {
      toast.error("Nie udało się pobrać macierzy przewodów");
    } finally {
      setLoadingYky(false);
      setLoadingYaky(false);
    }
  }, []);

  useEffect(() => { loadMatrices(); }, [loadMatrices]);

  const handleYkySaved = useCallback((updatedMatrix) => {
    setYkyMatrix(updatedMatrix);
    saveYkyMatrix(updatedMatrix);
  }, []);

  const handleYakySaved = useCallback((updatedMatrix) => {
    setYakyMatrix(updatedMatrix);
    saveYakyMatrix(updatedMatrix);
  }, []);

  return (
    <div className="usk-przekop-panel">
      <h2 className="usk-panel-title">Przekop — dobór przewodów</h2>
      <p className="usk-panel-desc">
        Macierz doboru przewodu wg długości przekopu i mocy instalacji (kWp). Puste pole lub „." = brak
        rekomendacji. Kliknij <strong>Edytuj</strong>, aby zmienić dane.
      </p>
      <PrzekopMatrix
        title="YKY (miedź)"
        typ="Miedziany"
        matrix={ykyMatrix}
        lengthRows={ykyRows}
        powerKwp={ykyKwp}
        loading={loadingYky}
        onSaved={handleYkySaved}
      />
      <PrzekopMatrix
        title="YAKY (aluminium)"
        typ="Aluminiowy"
        matrix={yakyMatrix}
        lengthRows={yakyRows}
        powerKwp={yakyKwp}
        loading={loadingYaky}
        onSaved={handleYakySaved}
      />
    </div>
  );
}
export function PrzewodyCenyPanel() {
  const [miedziane, setMiedziane] = useState([]);
  const [aluminiowe, setAluminiowe] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, aRes] = await Promise.all([
        api.get("/przewody/miedziane"),
        api.get("/przewody/aluminiowe"),
      ]);
      const m = mRes.data || [];
      const a = aRes.data || [];
      setMiedziane(m);
      setAluminiowe(a);

      // Sync active prices to localStorage so computePrzekopQuote works synchronously
      const yky = {};
      m.forEach((p) => { if (p.isActive && p.cenaZaMetr > 0) yky[p.name] = p.cenaZaMetr; });
      const yaky = {};
      a.forEach((p) => { if (p.isActive && p.cenaZaMetr > 0) yaky[p.name] = p.cenaZaMetr; });
      saveYkyPrices(yky);
      saveYakyPrices(yaky);
    } catch {
      toast.error("Nie udało się pobrać cen przewodów");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="usk-przewod-panel">
      <h2 className="usk-panel-title">Ceny przewodów</h2>
      <p className="usk-panel-desc">
        Cena netto za metr bieżący przewodu (źródło: backend). Dodaj, edytuj lub dezaktywuj przewody.
      </p>
      <PrzewodList
        title="Cena przewodów miedzianych (YKY)"
        typ="Miedziany"
        items={miedziane}
        loading={loading}
        onReload={load}
      />
      <PrzewodList
        title="Cena przewodów aluminiowych (YAKY)"
        typ="Aluminiowy"
        items={aluminiowe}
        loading={loading}
        onReload={load}
      />
    </div>
  );
}

// ─── KopanieTranseiPanel ──────────────────────────────────────────────────────

const EMPTY_KOPANIE_FORM = { odMetrow: "", doMetrow: "", priceNetto: "" };

function formatKopanieZakres(odMetrow, doMetrow) {
  const from = Number(odMetrow);
  const to = Number(doMetrow);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "—";
  if (from === 0) return `do ${to} m`;
  return `od ${from} do ${to} m`;
}

export function KopanieTranseiPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | { mode: "add"|"edit", item? }
  const [form, setForm] = useState(EMPTY_KOPANIE_FORM);
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
      // sync to localStorage so calcKopaniePrzekop works synchronously
      saveKopanieTransei(data);
    } catch {
      toast.error("Nie udało się pobrać cennika kopania");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm(EMPTY_KOPANIE_FORM); setModal({ mode: "add" }); };
  const openEdit = (item) => {
    setForm({
      odMetrow:   String(item.odMetrow ?? ""),
      doMetrow:   String(item.doMetrow ?? ""),
      priceNetto: String(item.priceNetto ?? ""),
    });
    setModal({ mode: "edit", item });
  };
  const closeModal = () => setModal(null);

  const validate = () => {
    const from = parseFloat(form.odMetrow);
    const to   = parseFloat(form.doMetrow);
    const price = parseFloat(String(form.priceNetto).replace(",", "."));
    if (!Number.isFinite(from) || from < 0) { toast.warn("Podaj poprawny zakres od (m)"); return false; }
    if (!Number.isFinite(to)   || to <= from) { toast.warn("Zakres do musi być większy niż od"); return false; }
    if (!Number.isFinite(price) || price < 0) { toast.warn("Cena musi być liczbą ≥ 0"); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        odMetrow:   parseFloat(form.odMetrow),
        doMetrow:   parseFloat(form.doMetrow),
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
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg || "Błąd zapisu");
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
      toast.error(err?.response?.data?.message || "Błąd dezaktywacji");
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
      toast.error(err?.response?.data?.message || "Błąd aktywacji");
    } finally {
      setBusyId(null);
    }
  };

  const fmt = (n) =>
    new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 0 }).format(Number(n));

  return (
    <div className="usk-przewod-panel usk-kopanie-transei-panel">
      <div className="usk-przekop-block-head" style={{ marginBottom: 8 }}>
        <div>
          <h2 className="usk-panel-title" style={{ marginBottom: 2 }}>Kopanie transzei</h2>
          <p className="usk-panel-desc" style={{ marginBottom: 0 }}>
            Przedziały długości przekopu i cena netto (jak w macierzy: „od 10 do 20 m”). Używane przy koszcie przekopu.
          </p>
        </div>
        <div className="usk-przekop-actions">
          <button type="button" className="usk-btn usk-btn--primary usk-btn--sm" onClick={openAdd}>
            + Dodaj zakres
          </button>
        </div>
      </div>

      {loading ? (
        <div className="usk-loading" style={{ padding: "12px 0" }}>Ładowanie…</div>
      ) : (
        <table className="usk-przewod-table">
          <thead>
            <tr>
              <th>Zakres</th>
              <th>Cena netto (zł)</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={4} className="usk-empty">Brak zakresów</td></tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className={item.isActive ? "" : "usk-row--inactive"}>
                <td className={item.isActive ? "usk-kopanie-zakres" : "usk-kopanie-zakres usk-strikethrough"}>
                  {formatKopanieZakres(item.odMetrow, item.doMetrow)}
                </td>
                <td>{fmt(item.priceNetto)} zł</td>
                <td>
                  <span className={`usk-badge ${item.isActive ? "usk-badge--active" : "usk-badge--inactive"}`}>
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
      )}

      {modal && (
        <div className="usk-overlay" onClick={closeModal}>
          <div className="usk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="usk-modal-head">
              <h3>{modal.mode === "add" ? "Dodaj zakres kopania" : "Edytuj zakres kopania"}</h3>
              <button type="button" className="usk-close" onClick={closeModal}>×</button>
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
                {" "}(metraż &gt; {form.odMetrow || "od"} m i ≤ {form.doMetrow || "do"} m).
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
