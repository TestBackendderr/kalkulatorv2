import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-toastify";
import api from "@/utils/axiosInstance";
import { useAuth } from "@/context/AuthContext";
import {
  buildPdfContextFromSavedRecord,
  renderKalkulatorWycenaPdfAndSave,
} from "@/utils/kalkulatorWycenaPdf";

const fmt = (n) =>
  new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));

const fmtDate = (iso) =>
  new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

// ─── Detail modal ─────────────────────────────────────────────────────────────

function DetailModal({ id, onClose }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const { user } = useAuth();
  const showAllPrices = user?.role === "Administrator";
  const showAllPricesInPdf = user?.role !== "Handlowiec";

  const handleGenerujPdf = async () => {
    if (!data) return;
    setPdfBusy(true);
    try {
      const ctx = buildPdfContextFromSavedRecord(data, showAllPricesInPdf);
      await renderKalkulatorWycenaPdfAndSave(ctx);
    } catch (e) {
      console.error(e);
      toast.error("Nie udało się wygenerować PDF");
    } finally {
      setPdfBusy(false);
    }
  };

  useEffect(() => {
    api.get(`/kalkulator/wyceny/${id}`)
      .then((r) => setData(r.data))
      .catch(() => toast.error("Nie udało się pobrać szczegółów"))
      .finally(() => setLoading(false));
  }, [id]);

  const d = data?.data;
  const w = d?.wycena;

  const panelOptionLabel = {
    none:           "Nie dokładamy",
    existing_chain: "Dokładamy na istniejącym łańcuchu",
    new_chain:      "Dokładamy nowego łańcucha",
  }[d?.panele?.opcja] || "—";

  return (
    <div className="lwk-overlay" onClick={onClose}>
      <div className="lwk-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lwk-modal-head">
          <h3>Szczegóły kalkulacji #{id}</h3>
          <div className="lwk-modal-head-actions">
            {!loading && data && (
              <button
                type="button"
                className="lwk-btn lwk-btn--sm"
                disabled={pdfBusy}
                onClick={handleGenerujPdf}
              >
                {pdfBusy ? "PDF…" : "Generuj PDF"}
              </button>
            )}
            <button type="button" className="lwk-close" onClick={onClose}>×</button>
          </div>
        </div>

        {loading ? (
          <div className="lwk-modal-loading">Ładowanie...</div>
        ) : !data ? (
          <div className="lwk-modal-loading">Brak danych</div>
        ) : (
          <div className="lwk-modal-body">
            <div className="lwk-detail-meta">
              <div><span>Klient:</span> <strong>{data.klientImie || "—"} {data.klientNazwisko || ""}</strong></div>
              <div><span>Handlowiec:</span> <strong>{data.createdBy?.name || data.createdBy?.email || "—"}</strong></div>
              <div><span>Data:</span> <strong>{fmtDate(data.createdAt)}</strong></div>
            </div>

            <h4 className="lwk-section-hd">Istniejąca instalacja</h4>
            <table className="lwk-detail-table"><tbody>
              <tr><td>Moc PV</td><td>{d?.instalacjaIstniejaca?.mocPvKwp ?? "—"} kWp</td></tr>
              <tr><td>Magazyn (moc)</td><td>{d?.instalacjaIstniejaca?.magazynMocKw ?? "—"} kW</td></tr>
              <tr><td>Magazyn (pojemność)</td><td>{d?.instalacjaIstniejaca?.magazynPojemnoscKwh ?? "—"} kWh</td></tr>
              <tr><td>Moc przyłączeniowa</td><td>{d?.instalacjaIstniejaca?.mocPrzylaczeniowa ?? "—"} kW</td></tr>
            </tbody></table>

            <h4 className="lwk-section-hd">Panele fotowoltaiczne</h4>
            <table className="lwk-detail-table"><tbody>
              <tr><td>Opcja</td><td>{panelOptionLabel}</td></tr>
              {d?.panele?.opcja !== "none" && <>
                <tr><td>Liczba paneli</td><td>{d?.panele?.liczba} szt.</td></tr>
                <tr><td>Montaż</td><td>{d?.panele?.typMontazu === "dach" ? "Dach" : "Grunt"}</td></tr>
                {d?.panele?.panel && <tr><td>Panel</td><td>{d.panele.panel.nazwa} ({d.panele.panel.mocW} W)</td></tr>}
                {d?.panele?.panelWlasny && (
                  <>
                    {d.panele.panelWlasny.nazwa && (
                      <tr><td>Nazwa</td><td>{d.panele.panelWlasny.nazwa}</td></tr>
                    )}
                    <tr><td>Panel własny</td><td>{d.panele.panelWlasny.mocW} W</td></tr>
                  </>
                )}
              </>}
            </tbody></table>

            <h4 className="lwk-section-hd">Falownik</h4>
            <table className="lwk-detail-table"><tbody>
              <tr><td>Akcja</td><td>{d?.falownik?.akcja === "wymiana" ? "Wymiana falownika" : "Nie wymieniamy"}</td></tr>
              {d?.falownik?.falownik && (
                <>
                  <tr><td>Model</td><td>{d.falownik.falownik.nazwa}</td></tr>
                  <tr><td>Ilość</td><td>{d.falownik.iloscSzt ?? 1} szt.</td></tr>
                  <tr><td>Moc łącznie</td><td>{d.falownik.falownik.mocKw} kW</td></tr>
                  {Array.isArray(d.falownik.falownik.cenyPozycji) && d.falownik.falownik.cenyPozycji.length > 1 && (
                    <tr><td>Cennik</td><td>{d.falownik.falownik.cenyPozycji.join(" + ")} zł</td></tr>
                  )}
                </>
              )}
            </tbody></table>

            <h4 className="lwk-section-hd">Magazyn energii</h4>
            <table className="lwk-detail-table"><tbody>
              {d?.magazynEnergii ? <>
                <tr><td>Model</td><td>{d.magazynEnergii.nazwa}</td></tr>
                <tr><td>Ilość</td><td>{d.magazynEnergii.ilosc ?? 1} szt.</td></tr>
                <tr><td>Pojemność łącznie</td><td>{d.magazynEnergii.pojemnoscKwh} kWh</td></tr>
                <tr><td>Moc łącznie</td><td>{d.magazynEnergii.mocKw} kW</td></tr>
                {Array.isArray(d.magazynEnergii.cenyPozycji) && d.magazynEnergii.cenyPozycji.length > 1 && (
                  <tr><td>Cennik</td><td>{d.magazynEnergii.cenyPozycji.join(" + ")} zł</td></tr>
                )}
              </> : <tr><td colSpan={2}>Brak magazynu energii</td></tr>}
            </tbody></table>

            <h4 className="lwk-section-hd">Koszty dodatkowe</h4>
            <table className="lwk-detail-table"><tbody>
              <tr><td>Rozdzielnica</td><td>{d?.kosztDodatkowe?.rozdzielnica === "tak" ? "TAK" : "NIE"}</td></tr>
              <tr><td>Przekop</td><td>
                {d?.kosztDodatkowe?.przekop === "tak"
                  ? `TAK – ${d.kosztDodatkowe.przekopMetry} m${
                      d.kosztDodatkowe.przekopPrzewod
                        ? `, ${d.kosztDodatkowe.przekopPrzewod}`
                        : ""
                    }`
                  : "NIE"}
              </td></tr>
              <tr><td>Klimatyzator</td><td>
                {d?.kosztDodatkowe?.klimatyzator?.montaz === "tak"
                  ? (d.kosztDodatkowe.klimatyzator.urzadzenia?.length
                    ? d.kosztDodatkowe.klimatyzator.urzadzenia.map((u) => u.nazwa).join(", ")
                    : "TAK")
                  : d?.kosztDodatkowe?.klimatyzator?.montaz === "nie" ? "NIE" : "—"}
              </td></tr>
            </tbody></table>

            <h4 className="lwk-section-hd">Wycena</h4>
            {showAllPrices && w?.pozycje && (
              <table className="lwk-price-table">
                <thead><tr><th>Pozycja</th><th>Kwota netto</th></tr></thead>
                <tbody>
                  {w.pozycje.map((p, i) => (
                    <tr key={i}>
                      <td>{p.nazwa}{p.notatka ? <span className="lwk-note"> ({p.notatka})</span> : null}</td>
                      <td className="lwk-td-r">{fmt(p.kwotaNetto)} zł</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <table className="lwk-price-table lwk-price-table--totals"><tbody>
              <tr><td>VAT</td><td className="lwk-td-r">{w?.vatProcent ?? "—"}%</td></tr>
              <tr className="lwk-tr--bold"><td>Razem netto</td><td className="lwk-td-r">{fmt(w?.razemNetto)} zł</td></tr>
              <tr className="lwk-tr--bold"><td>Razem brutto</td><td className="lwk-td-r">{fmt(w?.razemBrutto)} zł</td></tr>
              {w?.rabatBrutto != null && <>
                <tr className="lwk-tr--rabat"><td>Rabat (brutto)</td><td className="lwk-td-r">- {fmt(w.rabatBrutto)} zł</td></tr>
                <tr className="lwk-tr--final"><td>Finalna cena klienta (brutto)</td><td className="lwk-td-r">{fmt(w.finalnaKlientBrutto)} zł</td></tr>
              </>}
              {showAllPrices && w?.marzaWmNetto != null && <>
                <tr className="lwk-tr--wm"><td>Marża WM</td><td className="lwk-td-r">{fmt(w.marzaWmNetto)} zł netto</td></tr>
                {w?.rabatBrutto != null && (
                  <tr className="lwk-tr--wm"><td>Marża WM po rabacie</td><td className="lwk-td-r">{fmt(w.marzaWmPoRabacieNetto)} zł netto</td></tr>
                )}
              </>}
            </tbody></table>

            <div className={`lwk-power-badge ${w?.czyBezZwiekszeniaMocy === true ? "lwk-power-badge--ok" : w?.czyBezZwiekszeniaMocy === false ? "lwk-power-badge--err" : "lwk-power-badge--na"}`}>
              {w?.czyBezZwiekszeniaMocy === true  && `Instalacja bez zwiększania mocy przyłączeniowej (${w.mocEfektywnaKw} kW)`}
              {w?.czyBezZwiekszeniaMocy === false && `Wymagane zwiększenie mocy przyłączeniowej (${w.mocEfektywnaKw} kW)`}
              {w?.czyBezZwiekszeniaMocy === null  && "Nie podano mocy przyłączeniowej"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;

  const pages = [];
  const delta = 2;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
      pages.push(i);
    }
  }

  const rendered = [];
  let prev = null;
  for (const p of pages) {
    if (prev !== null && p - prev > 1) rendered.push("…");
    rendered.push(p);
    prev = p;
  }

  return (
    <div className="lwk-pagination">
      <button className="lwk-page-btn" disabled={page === 1} onClick={() => onChange(page - 1)}>‹</button>
      {rendered.map((p, i) =>
        p === "…"
          ? <span key={`ellipsis-${i}`} className="lwk-page-ellipsis">…</span>
          : <button
              key={p}
              className={`lwk-page-btn${p === page ? " active" : ""}`}
              onClick={() => p !== page && onChange(p)}
            >{p}</button>
      )}
      <button className="lwk-page-btn" disabled={page === totalPages} onClick={() => onChange(page + 1)}>›</button>
    </div>
  );
}

// ─── Main list component ──────────────────────────────────────────────────────

const LIMIT = 20;

export default function ListaWycenKalkulator() {
  const [items, setItems]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [detailId, setDetailId]   = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  // Search fields — sent to API
  const [klient,     setKlient]     = useState("");
  const [handlowiec, setHandlowiec] = useState("");

  // Debounce refs
  const debounceRef = useRef(null);

  const { user } = useAuth();
  const isAdmin = user?.role === "Administrator";
  const showAllPricesInPdf = user?.role !== "Handlowiec";
  const [pdfLoadingId, setPdfLoadingId] = useState(null);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const load = useCallback(async (pg, kl, ha) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg, limit: LIMIT });
      if (kl?.trim()) params.set("klient",     kl.trim());
      if (ha?.trim()) params.set("handlowiec", ha.trim());

      const r = await api.get(`/kalkulator/wyceny?${params.toString()}`);
      // backend returns { data: [...], total: N } or just array — handle both
      if (Array.isArray(r.data)) {
        setItems(r.data);
        setTotal(r.data.length);
      } else {
        setItems(r.data.data ?? r.data.items ?? []);
        setTotal(r.data.meta?.total ?? r.data.total ?? r.data.count ?? 0);
      }
    } catch {
      toast.error("Nie udało się pobrać listy kalkulacji");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load & page changes
  useEffect(() => { load(page, klient, handlowiec); }, [page]); // eslint-disable-line

  // Debounced search — reset to page 1
  const triggerSearch = (kl, ha) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load(1, kl, ha);
    }, 400);
  };

  const handleKlient = (v) => {
    setKlient(v);
    triggerSearch(v, handlowiec);
  };

  const handleHandlowiec = (v) => {
    setHandlowiec(v);
    triggerSearch(klient, v);
  };

  const handlePage = (pg) => {
    setPage(pg);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/kalkulator/wyceny/${confirmDel}`);
      toast.success("Kalkulacja usunięta");
      setConfirmDel(null);
      load(page, klient, handlowiec);
    } catch (e) {
      toast.error(e.response?.data?.message || "Błąd usuwania");
    }
  };

  const handleGenerujPdfFromList = async (rowId) => {
    setPdfLoadingId(rowId);
    try {
      const r = await api.get(`/kalkulator/wyceny/${rowId}`);
      const ctx = buildPdfContextFromSavedRecord(r.data, showAllPricesInPdf);
      await renderKalkulatorWycenaPdfAndSave(ctx);
    } catch (e) {
      console.error(e);
      toast.error("Nie udało się wygenerować PDF");
    } finally {
      setPdfLoadingId(null);
    }
  };

  return (
    <div className="lwk-wrapper">
      <div className="lwk-header">
        <h1 className="lwk-title">Kalkulacje</h1>
        <div className="lwk-header-right">
          <input
            className="lwk-search"
            placeholder="Klient (imię / nazwisko)..."
            value={klient}
            onChange={(e) => handleKlient(e.target.value)}
          />
          <input
            className="lwk-search"
            placeholder="Handlowiec..."
            value={handlowiec}
            onChange={(e) => handleHandlowiec(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="lwk-loading">Ładowanie...</div>
      ) : items.length === 0 ? (
        <div className="lwk-empty">Brak kalkulacji{klient || handlowiec ? " pasujących do wyszukiwania" : ""}.</div>
      ) : (
        <>
          <div className="lwk-table-wrap">
            <table className="lwk-table">
              <thead>
                <tr>
                  <th>Nr oferty</th>
                  <th>Klient</th>
                  <th>Razem netto</th>
                  <th>Razem brutto</th>
                  <th>Finalna cena</th>
                  <th>Handlowiec</th>
                  <th>Data</th>
                  <th>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="lwk-td-id">{it.numerOferty ?? `#${it.id}`}</td>
                    <td className="lwk-td-client">{it.klientImie || "—"} {it.klientNazwisko || ""}</td>
                    <td className="lwk-td-r">{fmt(it.razemNetto)} zł</td>
                    <td className="lwk-td-r">{fmt(it.razemBrutto)} zł</td>
                    <td className="lwk-td-r">
                      {it.finalnaKlientBrutto != null ? `${fmt(it.finalnaKlientBrutto)} zł` : "—"}
                    </td>
                    <td>{it.createdBy?.name || it.createdBy?.email || "—"}</td>
                    <td className="lwk-td-date">{fmtDate(it.createdAt)}</td>
                    <td className="lwk-td-actions">
                      <button type="button" className="lwk-btn lwk-btn--sm" onClick={() => setDetailId(it.id)}>Szczegóły</button>
                      <button
                        type="button"
                        className="lwk-btn lwk-btn--sm"
                        disabled={pdfLoadingId === it.id}
                        onClick={() => handleGenerujPdfFromList(it.id)}
                      >
                        {pdfLoadingId === it.id ? "PDF…" : "Generuj PDF"}
                      </button>
                      {isAdmin && (
                        <button type="button" className="lwk-btn lwk-btn--sm lwk-btn--danger" onClick={() => setConfirmDel(it.id)}>Usuń</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lwk-pagination-row">
            <span className="lwk-pagination-info">
              Wyniki: {Math.min((page - 1) * LIMIT + 1, total)}–{Math.min(page * LIMIT, total)} z {total}
            </span>
            <Pagination page={page} totalPages={totalPages} onChange={handlePage} />
          </div>
        </>
      )}

      {detailId   && <DetailModal id={detailId} onClose={() => setDetailId(null)} />}

      {confirmDel && (
        <div className="lwk-overlay" onClick={() => setConfirmDel(null)}>
          <div className="lwk-confirm" onClick={(e) => e.stopPropagation()}>
            <p>Czy na pewno chcesz usunąć kalkulację #{confirmDel}?</p>
            <div className="lwk-confirm-btns">
              <button className="lwk-btn" onClick={() => setConfirmDel(null)}>Anuluj</button>
              <button className="lwk-btn lwk-btn--danger" onClick={handleDelete}>Usuń</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
