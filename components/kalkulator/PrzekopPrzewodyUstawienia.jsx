import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import {
  PRZEKOP_LENGTH_ROWS,
  PRZEKOP_POWER_KWP,
  DEFAULT_YKY_MATRIX,
  DEFAULT_YAKY_MATRIX,
  DEFAULT_YKY_PRICES,
  DEFAULT_YAKY_PRICES,
  loadYkyMatrix,
  loadYakyMatrix,
  loadYkyPrices,
  loadYakyPrices,
  saveYkyMatrix,
  saveYakyMatrix,
  saveYkyPrices,
  saveYakyPrices,
} from "@/utils/przekopSettings";

function parsePriceInput(val) {
  const n = parseFloat(String(val).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function PrzekopMatrix({ title, subtitle, matrix, onChange, onSave }) {
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState(null);

  const setCell = (rowId, kwp, value) => {
    onChange({
      ...matrix,
      [rowId]: { ...matrix[rowId], [kwp]: value },
    });
  };

  const startEdit = () => {
    setSnapshot(cloneData(matrix));
    setEditing(true);
  };

  const cancelEdit = () => {
    if (snapshot) onChange(snapshot);
    setEditing(false);
    setSnapshot(null);
  };

  const saveEdit = () => {
    onSave();
    setEditing(false);
    setSnapshot(null);
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
              <button type="button" className="usk-btn usk-btn--ghost usk-btn--sm" onClick={cancelEdit}>
                Anuluj
              </button>
              <button type="button" className="usk-btn usk-btn--primary usk-btn--sm" onClick={saveEdit}>
                Zapisz
              </button>
            </>
          ) : (
            <button type="button" className="usk-btn usk-btn--primary usk-btn--sm" onClick={startEdit}>
              Edytuj
            </button>
          )}
        </div>
      </div>
      <div className="usk-matrix-wrap">
        <table className="usk-matrix">
          <thead>
            <tr>
              <th className="usk-matrix-corner">
                Długość przekopu ↓
                <span className="usk-matrix-corner-sub">Moc instalacji →</span>
              </th>
              {PRZEKOP_POWER_KWP.map((k) => (
                <th key={k}>{k} kWp</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PRZEKOP_LENGTH_ROWS.map((row) => (
              <tr key={row.id}>
                <th className="usk-matrix-row-label">{row.label}</th>
                {PRZEKOP_POWER_KWP.map((kwp) => (
                  <td key={kwp}>
                    {editing ? (
                      <input
                        type="text"
                        className="usk-matrix-cell"
                        value={matrix[row.id]?.[kwp] ?? ""}
                        placeholder="."
                        onChange={(e) => setCell(row.id, kwp, e.target.value)}
                      />
                    ) : (
                      <span className="usk-matrix-cell-readonly">
                        {cellDisplay(matrix[row.id]?.[kwp])}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriceList({ title, prices, onChange, onSave, onAddRow }) {
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState(null);

  const entries = Object.entries(prices);

  const setPrice = (key, val) => onChange({ ...prices, [key]: parsePriceInput(val) });
  const setLabel = (oldKey, newKey) => {
    if (oldKey === newKey) return;
    const next = {};
    for (const [k, v] of Object.entries(prices)) {
      next[k === oldKey ? newKey : k] = v;
    }
    onChange(next);
  };
  const removeRow = (key) => {
    const next = { ...prices };
    delete next[key];
    onChange(next);
  };

  const startEdit = () => {
    setSnapshot(cloneData(prices));
    setEditing(true);
  };

  const cancelEdit = () => {
    if (snapshot) onChange(snapshot);
    setEditing(false);
    setSnapshot(null);
  };

  const saveEdit = () => {
    onSave();
    setEditing(false);
    setSnapshot(null);
  };

  const fmtPriceReadonly = (price) => {
    if (!price || price === 0) return "—";
    return new Intl.NumberFormat("pl-PL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  return (
    <div className={`usk-przewod-block${editing ? " usk-przewod-block--editing" : ""}`}>
      <div className="usk-przewod-block-head">
        <h3 className="usk-przewod-title">{title}</h3>
        <div className="usk-przewod-actions">
          {editing ? (
            <>
              <button type="button" className="usk-btn usk-btn--ghost usk-btn--sm" onClick={onAddRow}>
                + Typ
              </button>
              <button type="button" className="usk-btn usk-btn--ghost usk-btn--sm" onClick={cancelEdit}>
                Anuluj
              </button>
              <button type="button" className="usk-btn usk-btn--primary usk-btn--sm" onClick={saveEdit}>
                Zapisz
              </button>
            </>
          ) : (
            <button type="button" className="usk-btn usk-btn--primary usk-btn--sm" onClick={startEdit}>
              Edytuj
            </button>
          )}
        </div>
      </div>
      <table className="usk-przewod-table">
        <thead>
          <tr>
            <th>Typ przewodu</th>
            <th>Za metr (zł)</th>
            {editing && <th />}
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && (
            <tr><td colSpan={editing ? 3 : 2} className="usk-empty">Brak pozycji</td></tr>
          )}
          {entries.map(([key, price]) => (
            <tr key={key}>
              <td>
                {editing ? (
                  <input
                    type="text"
                    className="usk-przewod-input"
                    value={key}
                    onChange={(e) => setLabel(key, e.target.value)}
                  />
                ) : (
                  <span className="usk-przewod-readonly">{key}</span>
                )}
              </td>
              <td>
                {editing ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    className="usk-przewod-input usk-przewod-input--price"
                    value={price === 0 ? "" : String(price).replace(".", ",")}
                    placeholder="0,00"
                    onChange={(e) => setPrice(key, e.target.value)}
                  />
                ) : (
                  <span className="usk-przewod-readonly usk-przewod-readonly--price">
                    {fmtPriceReadonly(price)}
                  </span>
                )}
              </td>
              {editing && (
                <td>
                  <button
                    type="button"
                    className="usk-btn usk-btn--sm usk-btn--danger-outline"
                    onClick={() => removeRow(key)}
                    title="Usuń"
                  >
                    ×
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PrzekopUstawieniaPanel() {
  const [ykyMatrix, setYkyMatrix] = useState(DEFAULT_YKY_MATRIX);
  const [yakyMatrix, setYakyMatrix] = useState(DEFAULT_YAKY_MATRIX);

  useEffect(() => {
    setYkyMatrix(loadYkyMatrix());
    setYakyMatrix(loadYakyMatrix());
  }, []);

  const saveYky = useCallback(() => {
    saveYkyMatrix(ykyMatrix);
    toast.success("Macierz YKY zapisana");
  }, [ykyMatrix]);

  const saveYaky = useCallback(() => {
    saveYakyMatrix(yakyMatrix);
    toast.success("Macierz YAKY zapisana");
  }, [yakyMatrix]);

  return (
    <div className="usk-przekop-panel">
      <h2 className="usk-panel-title">Przekop — dobór przewodów</h2>
      <p className="usk-panel-desc">
        Macierz doboru przewodu wg długości przekopu i mocy instalacji (kWp). Puste pole lub „.” = brak
        rekomendacji. Kliknij <strong>Edytuj</strong>, aby zmienić dane.
      </p>
      <PrzekopMatrix
        title="YKY (miedź)"
        matrix={ykyMatrix}
        onChange={setYkyMatrix}
        onSave={saveYky}
      />
      <PrzekopMatrix
        title="YAKY (aluminium)"
        matrix={yakyMatrix}
        onChange={setYakyMatrix}
        onSave={saveYaky}
      />
    </div>
  );
}

export function PrzewodyCenyPanel() {
  const [ykyPrices, setYkyPrices] = useState(DEFAULT_YKY_PRICES);
  const [yakyPrices, setYakyPrices] = useState(DEFAULT_YAKY_PRICES);

  useEffect(() => {
    setYkyPrices(loadYkyPrices());
    setYakyPrices(loadYakyPrices());
  }, []);

  const addYkyRow = () => {
    const key = `YKY 5x${Object.keys(ykyPrices).length + 1}`;
    setYkyPrices({ ...ykyPrices, [key]: 0 });
  };
  const addYakyRow = () => {
    const key = `YAKY 5x${Object.keys(yakyPrices).length + 1}`;
    setYakyPrices({ ...yakyPrices, [key]: 0 });
  };

  return (
    <div className="usk-przewod-panel">
      <h2 className="usk-panel-title">Ceny przewodów</h2>
      <p className="usk-panel-desc">
        Cena netto za metr bieżący przewodu. Kliknij <strong>Edytuj</strong>, aby zmienić cennik.
      </p>
      <PriceList
        title="Cena przewodów miedzianych"
        prices={ykyPrices}
        onChange={setYkyPrices}
        onSave={() => {
          saveYkyPrices(ykyPrices);
          toast.success("Ceny YKY zapisane");
        }}
        onAddRow={addYkyRow}
      />
      <PriceList
        title="Cena przewodów aluminiowych"
        prices={yakyPrices}
        onChange={setYakyPrices}
        onSave={() => {
          saveYakyPrices(yakyPrices);
          toast.success("Ceny YAKY zapisane");
        }}
        onAddRow={addYakyRow}
      />
    </div>
  );
}
