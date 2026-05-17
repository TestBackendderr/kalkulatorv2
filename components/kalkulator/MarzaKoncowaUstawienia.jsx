import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  loadMarzaKoncowaPercent,
  saveMarzaKoncowaPercent,
} from "@/utils/marzaKoncowaSettings";

export default function MarzaKoncowaUstawienia() {
  const [percent, setPercent] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    const v = loadMarzaKoncowaPercent();
    const s = v > 0 ? String(v) : "";
    setPercent(s);
    setSaved(s);
  }, []);

  const handleSave = () => {
    const n = parseFloat(String(percent).replace(",", "."));
    if (percent !== "" && (!Number.isFinite(n) || n < 0)) {
      toast.warn("Podaj poprawny procent (≥ 0)");
      return;
    }
    const val = percent === "" ? 0 : n;
    saveMarzaKoncowaPercent(val);
    setSaved(percent === "" ? "" : String(val));
    toast.success("Marża końcowa zapisana");
  };

  return (
    <div className="usk-marza-panel">
      <div className="usk-tab-header">
        <div>
          <h2 className="usk-tab-title">Marża końcowa</h2>
          <p className="usk-panel-desc" style={{ margin: "6px 0 0" }}>
           
          </p>
        </div>
      </div>

      <div className="usk-marza-form">
        <label className="usk-label">Marża od ceny finalnej (%)</label>
        <div className="usk-marza-form-row">
          <input
            className="usk-input usk-marza-input"
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            placeholder="np. 10"
          />
          <span className="usk-marza-suffix">%</span>
          <button type="button" className="usk-btn usk-btn--primary" onClick={handleSave}>
            Zapisz
          </button>
        </div>
        {saved !== "" && Number(saved) > 0 ? (
          <p className="usk-hint">
            Aktywna marża: <strong>{saved}%</strong>
          </p>
        ) : (
          <p className="usk-hint">Brak marży (0%).</p>
        )}
      </div>
    </div>
  );
}
