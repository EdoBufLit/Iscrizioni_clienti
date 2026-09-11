import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthError } from "../../lib/api";
import {
  communicationDate, fetchReceivedCommunication, fetchReceivedCommunications,
  markCommunicationRead, notifyCommunicationRead, NOTIFICATIONS_UPDATED_EVENT,
  type ReceivedCommunication, type ReceivedCommunicationPage,
} from "../../lib/centralCommunications";
import { PageHeader } from "./components/OrgAdminPrimitives";
import { SuperAdminIcon } from "../super-admin/components/SuperAdminPrimitives";
import "../central-communications.css";

export default function OrgAdminCentralCommunications() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedId = Number(params.get("message"));
  const selectedId = Number.isInteger(requestedId) && requestedId > 0 ? requestedId : null;
  const [page, setPage] = useState(1);
  const [inbox, setInbox] = useState<ReceivedCommunicationPage | null>(null);
  const [selected, setSelected] = useState<ReceivedCommunication | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [readError, setReadError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [markingRead, setMarkingRead] = useState(false);
  const detailRequest = useRef(0);
  const readLock = useRef(false);

  const describeError = useCallback((err: unknown) => {
    if (err instanceof AuthError) navigate("/org-admin/login", { replace: true });
    return err instanceof Error ? err.message : "Impossibile caricare le comunicazioni.";
  }, [navigate]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetchReceivedCommunications(page).then((result) => { if (active) setInbox(result); })
      .catch((err) => { if (active) setError(describeError(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, refresh, describeError]);

  useEffect(() => {
    const reload = () => setRefresh((value) => value + 1);
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, reload);
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, reload);
  }, []);

  useEffect(() => {
    ++detailRequest.current;
    setSelected(null);
    setDetailError("");
    setReadError("");
    setMarkingRead(false);
    if (selectedId === null) { setDetailLoading(false); return; }
    let active = true;
    setDetailLoading(true);
    const open = async () => {
      try {
        const { item } = await fetchReceivedCommunication(selectedId);
        if (!active) return;
        setSelected(item);
        setDetailLoading(false);
        if (!item.is_read) {
          try {
            const result = await markCommunicationRead(item.id);
            notifyCommunicationRead();
            if (!active) return;
            setSelected(result.item);
          } catch (err) {
            if (active) setReadError(describeError(err));
          }
        }
      } catch (err) { if (active) setDetailError(describeError(err)); }
      finally { if (active) setDetailLoading(false); }
    };
    void open();
    return () => { active = false; ++detailRequest.current; };
  }, [selectedId, describeError, detailRefresh]);

  const retryRead = async () => {
    if (!selected || readLock.current) return;
    const requestId = detailRequest.current;
    readLock.current = true;
    setMarkingRead(true);
    try {
      const result = await markCommunicationRead(selected.id);
      notifyCommunicationRead();
      if (requestId !== detailRequest.current) return;
      setSelected(result.item);
      setReadError("");
    } catch (err) {
      if (requestId === detailRequest.current) setReadError(describeError(err));
    } finally {
      readLock.current = false;
      if (requestId === detailRequest.current) setMarkingRead(false);
    }
  };
  const chooseMessage = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id === null) next.delete("message"); else next.set("message", String(id));
    setParams(next);
  };

  return (
    <div className="container-shell org-admin-mobile-page central-comms py-8">
      <PageHeader eyebrow="Il filo diretto con la rete" title="Comunicazioni ASSONAM"
        subtitle="Le notizie, gli avvisi e gli aggiornamenti riservati alla tua associazione."
        actions={<button type="button" className="central-comms__button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}><SuperAdminIcon name="refresh" />Aggiorna</button>} />
      {error && <div role="alert" className="central-comms__alert central-comms__alert--error">{error}</div>}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(17rem,.85fr)_minmax(0,1.5fr)]">
        <section className={`central-comms__panel ${selectedId ? "hidden xl:block" : ""}`} aria-label="Comunicazioni ricevute">
          <div className="central-comms__section flex items-center justify-between gap-3"><h2 className="central-comms__heading">Ricevute</h2><span className="central-comms__muted">{inbox?.unread_count ?? 0} da leggere</span></div>
          {loading ? <p role="status" className="central-comms__empty">Caricamento comunicazioni…</p>
            : error && !inbox ? <p className="central-comms__empty">L'archivio non è disponibile. Premi Aggiorna per riprovare.</p>
            : !inbox?.items.length ? <div className="central-comms__empty"><SuperAdminIcon name="mail" /><h3 className="font-semibold">Nessuna comunicazione, per ora</h3><p className="text-sm mt-2">I prossimi aggiornamenti di ASSONAM appariranno qui e nella campanella.</p></div>
            : <div className="central-comms__list">{inbox.items.map((item) => <button className="central-comms__row" type="button" key={item.id} onClick={() => chooseMessage(item.id)} aria-current={selectedId === item.id}>
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="central-comms__muted !text-xs">ASSONAM</span>{!item.is_read && <span className="central-comms__unread">Da leggere</span>}</div>
              <h3 className="central-comms__row-title mt-2">{item.subject}</h3><p className="central-comms__row-preview">{item.excerpt}</p><p className="central-comms__row-meta">{communicationDate(item.created_at)}</p>
            </button>)}</div>}
          {inbox && inbox.total_pages > 1 && <div className="central-comms__section flex items-center justify-between gap-3"><button className="central-comms__button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Precedente</button><span className="central-comms__muted">{page} / {inbox.total_pages}</span><button className="central-comms__button" disabled={page >= inbox.total_pages || loading} onClick={() => setPage(page + 1)}>Successiva</button></div>}
        </section>
        <section className={`central-comms__panel ${selectedId ? "" : "hidden xl:block"}`} aria-label="Dettaglio comunicazione">
          {selectedId ? <>
            <div className="central-comms__section"><button className="central-comms__button" type="button" onClick={() => chooseMessage(null)}>← Tutte le comunicazioni</button></div>
            <div className="central-comms__section">
              {detailLoading ? <div role="status" className="central-comms__empty">Apertura comunicazione…</div>
                : detailError ? <div role="alert" className="central-comms__alert central-comms__alert--error">{detailError} <button type="button" className="underline font-semibold" onClick={() => setDetailRefresh((value) => value + 1)}>Riprova</button></div>
                : selected && <article><div className="central-comms__sender"><SuperAdminIcon name="mail" />ASSONAM</div><p className="central-comms__muted !text-xs mt-3">{communicationDate(selected.created_at)}</p><h2 className="text-2xl font-bold tracking-tight leading-snug my-6 break-words">{selected.subject}</h2><div className="central-comms__body">{selected.body}</div><p className="central-comms__muted !text-xs mt-8 pt-5 border-t" style={{ borderColor: "var(--cc-line)" }}>{selected.is_read ? "✓ Letta" : "Comunicazione riservata alla tua associazione"}</p></article>}
              {readError && <div role="alert" className="central-comms__alert central-comms__alert--error mt-5">Il messaggio è visibile, ma non è stato segnato come letto. <button type="button" className="underline font-semibold disabled:opacity-50" disabled={markingRead} onClick={() => void retryRead()}>{markingRead ? "Aggiornamento…" : "Riprova"}</button></div>}
            </div>
          </> : <div className="central-comms__empty !py-24"><SuperAdminIcon name="mail" /><h2 className="font-semibold">Uno spazio per restare aggiornati</h2><p className="text-sm mt-2">Seleziona una comunicazione per leggere il messaggio completo.</p></div>}
        </section>
      </div>
    </div>
  );
}
