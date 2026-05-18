import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import api from "@/utils/axiosInstance";
import { syncMarzaKoncowaCache } from "@/utils/marzaKoncowaSettings";

function extractApiError(err, fallback) {
  const msg = err?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === "string") return msg;
  return fallback;
}

export default function MarzaKoncowaUstawienia() {
  const [recordId, setRecordId] = useState(null);
  const [percent, setPercent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/marza-koncowa/aktualna");
      const data = res.data;
      setRecordId(data?.id ?? null);
      setPercent(String(data?.wartosc ?? ""));
      syncMarzaKoncowaCache(data);
    } catch (err) {
      if (err?.response?.status === 404) {
        setRecordId(null);
        setPercent("0");
        syncMarzaKoncowaCache({ wartosc: 0 });
      } else {
        toast.error("Nie udało się pobrać marży końcowej");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    const val = parseFloat(String(percent).replace(",", "."));
    if (!Number.isFinite(val) || val < 0) {
      toast.warn("Podaj poprawny procent (≥ 0)");
      return;
    }
    setSaving(true);
    try {
      let saved;
      if (recordId != null) {
        const res = await api.patch(`/marza-koncowa/${recordId}`, { wartosc: val });
        saved = res.data;
        toast.success("Marża końcowa zaktualizowana");
      } else {
        const res = await api.post("/marza-koncowa", { wartosc: val });
        saved = res.data;
        toast.success("Marża końcowa zapisana");
      }
      setRecordId(saved?.id ?? recordId);
      setPercent(String(saved?.wartosc ?? val));
      syncMarzaKoncowaCache(saved);
    } catch (err) {
      toast.error(extractApiError(err, "Błąd zapisu"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="usk-marza-koncowa-panel">
      <div className="usk-tab-header" style={{ marginBottom: 16 }}>
        <div>
          <h2 className="usk-tab-title">Marża końcowa</h2>
          <p className="usk-panel-desc" style={{ margin: "6px 0 0" }}>
            Procent od sumy netto wyceny (po wszystkich pozycjach, w tym WM). Dane z API{" "}
            <code>/marza-koncowa</code>.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="usk-loading" style={{ padding: "24px 0" }}>Ładowanie…</div>
      ) : (
        <div className="usk-marza-form">
          <label className="usk-label">Marża końcowa (%)</label>
          <div className="usk-marza-input-row">
            <input
              className="usk-input"
              type="number"
              min="0"
              step="0.1"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              disabled={saving}
              placeholder="np. 5"
            />
            <span className="usk-marza-suffix">%</span>
            <button
              type="button"
              className="usk-btn usk-btn--primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Zapisywanie…" : "Zapisz"}
            </button>
          </div>
          <p className="usk-hint">
            Przykład: przy 10% i sumie bazowej 50 000 zł netto → dopłata 5 000 zł → razem 55 000 zł netto.
          </p>
        </div>
      )}
    </div>
  );
}
