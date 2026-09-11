import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthError } from "../../lib/api";
import {
  communicationDate, fetchCommunicationRecipients, fetchSentCommunication, fetchSentCommunications,
  previewCommunication, sendCommunication,
  type CentralCommunication, type CommunicationDraft, type CommunicationPage,
  type CommunicationPreview, type CommunicationRecipient,
} from "../../lib/centralCommunications";
import { useUnsavedChangesGuard } from "../../components/ui/UnsavedChangesProvider";
import {
  SuperAdminActionButton, SuperAdminIcon, SuperAdminPageHeader, SuperAdminStatusChip, SuperAdminTabs,
} from "./components/SuperAdminPrimitives";
import "../central-communications.css";

const emptyDraft: CommunicationDraft = { subject: "", body: "", audience: "selected", organization_ids: [] };
type Review = { draft: CommunicationDraft; preview: CommunicationPreview; key: string };

export default function SuperAdminCommunications() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("compose");
  const [draft, setDraft] = useState<CommunicationDraft>(emptyDraft);
  const [recipients, setRecipients] = useState<CommunicationRecipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(true);
  const [recipientsError, setRecipientsError] = useState("");
  const [query, setQuery] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<CentralCommunication | null>(null);
  const [history, setHistory] = useState<CommunicationPage | null>(null);
  const [page, setPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [selected, setSelected] = useState<CentralCommunication | null>(null);
  const [detailLoading, setDetailLoading] = useState<number | null>(null);
  const sendLock = useRef(false);
  const previewLock = useRef(false);
  const detailRequest = useRef(0);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useUnsavedChangesGuard({ when: Boolean(draft.subject || draft.body || draft.organization_ids.length) });

  const errorMessage = useCallback((err: unknown, fallback: string) => {
    if (err instanceof AuthError) navigate("/super-admin/login", { replace: true });
    return err instanceof Error ? err.message : fallback;
  }, [navigate]);

  const loadRecipients = useCallback(async () => {
    setRecipientsLoading(true);
    setRecipientsError("");
    try { setRecipients((await fetchCommunicationRecipients()).items); }
    catch (err) { setRecipientsError(errorMessage(err, "Impossibile caricare le associazioni.")); }
    finally { setRecipientsLoading(false); }
  }, [errorMessage]);

  useEffect(() => { void loadRecipients(); }, [loadRecipients]);
  useEffect(() => {
    if (tab !== "sent") return;
    let active = true;
    setHistoryLoading(true);
    setHistoryError("");
    fetchSentCommunications(page).then((value) => { if (active) setHistory(value); })
      .catch((err) => { if (active) setHistoryError(errorMessage(err, "Impossibile caricare lo storico.")); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [tab, page, errorMessage, sent, historyRefresh]);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);

  const updateDraft = (patch: Partial<CommunicationDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setReview(null);
    setError("");
  };
  const toggleRecipient = (id: number) => updateDraft({
    organization_ids: draft.organization_ids.includes(id)
      ? draft.organization_ids.filter((value) => value !== id)
      : [...draft.organization_ids, id],
  });
  const canReview = Boolean(draft.subject.trim() && draft.body.trim()
    && (draft.audience === "all" ? recipients.length : draft.organization_ids.length)
    && !recipientsLoading && !recipientsError);

  const handleReview = async () => {
    if (!canReview || previewLock.current) return;
    previewLock.current = true;
    setPreviewing(true);
    setError("");
    const snapshot = { ...draft, subject: draft.subject.trim(), body: draft.body.trim(),
      organization_ids: draft.audience === "all" ? [] : [...draft.organization_ids].sort((a, b) => a - b) };
    try {
      const preview = await previewCommunication(snapshot);
      setReview({ draft: snapshot, preview, key: crypto.randomUUID() });
    } catch (err) { setError(errorMessage(err, "Impossibile preparare l'anteprima.")); }
    finally { previewLock.current = false; setPreviewing(false); }
  };

  const handleSend = async () => {
    if (!review || !review.preview.organization_count || sendLock.current) return;
    sendLock.current = true;
    setSending(true);
    setError("");
    try {
      const response = await sendCommunication({ ...review.draft, idempotency_key: review.key,
        expected_organization_ids: review.preview.recipients.map((org) => org.id).sort((a, b) => a - b) });
      setSent(response.item);
      setDraft(emptyDraft);
      setReview(null);
      setSelected(null);
      setPage(1);
      setTab("sent");
    } catch (err) {
      setError(err instanceof TypeError
        ? "Connessione interrotta: l'esito non è ancora disponibile. Riprova l'invio da questa anteprima per recuperarlo senza duplicare la comunicazione."
        : errorMessage(err, "Impossibile inviare la comunicazione."));
    } finally { sendLock.current = false; setSending(false); }
  };

  const openSent = async (id: number) => {
    const requestId = ++detailRequest.current;
    setDetailLoading(id);
    setHistoryError("");
    try {
      const result = await fetchSentCommunication(id);
      if (requestId === detailRequest.current) setSelected(result.item);
    } catch (err) {
      if (requestId === detailRequest.current) setHistoryError(errorMessage(err, "Impossibile aprire la comunicazione."));
    } finally { if (requestId === detailRequest.current) setDetailLoading(null); }
  };
  const filteredRecipients = recipients.filter((org) => `${org.name} ${org.slug}`.toLocaleLowerCase("it").includes(query.toLocaleLowerCase("it")));

  return (
    <div className="central-comms">
      <SuperAdminPageHeader icon="mail" eyebrow="ASSONAM · Rete associativa" title="Comunicazioni"
        subtitle="Un filo diretto con le associazioni affiliate. Scrivi, scegli i destinatari e condividi gli aggiornamenti." />
      {sent && <div role="status" className="central-comms__alert">
        <strong>Comunicazione pubblicata.</strong> {sent.recipient_count} associazioni raggiunte nell'area riservata · {sent.email_count} email programmate.
      </div>}
      <SuperAdminTabs items={[{ key: "compose", label: "Nuova comunicazione", icon: "edit" }, { key: "sent", label: "Inviate", icon: "send" }]}
        active={tab} onSelect={(value) => { if (!sending && !previewing) setTab(value); }} />

      {tab === "compose" && (review ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="central-comms__panel order-2 xl:order-none">
            <div className="central-comms__section">
              <h2 className="central-comms__heading" ref={reviewHeading} tabIndex={-1}>Rivedi la comunicazione</h2>
              <p className="central-comms__muted mt-2">Questo messaggio sarà visibile nell'area riservata e incluso nell'email agli amministratori.</p>
            </div>
            <div className="central-comms__section">
              <CommunicationMessage item={review.draft} />
            </div>
            <div className="central-comms__section flex flex-wrap items-center justify-between gap-3">
              <SuperAdminActionButton disabled={sending} onClick={() => { setReview(null); setError(""); }}>Modifica messaggio o destinatari</SuperAdminActionButton>
              <SuperAdminActionButton tone="primary" icon="send" disabled={sending || !review.preview.organization_count} onClick={() => void handleSend()}>
                {sending ? "Invio in corso…" : `Invia a ${review.preview.organization_count} ${review.preview.organization_count === 1 ? "associazione" : "associazioni"}`}
              </SuperAdminActionButton>
            </div>
            {error && <div role="alert" className="central-comms__alert central-comms__alert--error m-5">{error}</div>}
          </section>
          <aside className="central-comms__aside order-1 xl:order-none">
            <h2 className="central-comms__heading">Destinatari dell'invio</h2>
            <div className="central-comms__stats">
              <div><strong>{review.preview.organization_count}</strong><span>Associazioni</span></div>
              <div><strong>{review.preview.admin_count}</strong><span>Amministratori</span></div>
              <div><strong>{review.preview.email_count}</strong><span>Email</span></div>
            </div>
            {review.preview.without_admin_count > 0 && <div className="central-comms__alert mb-4">
              {review.preview.without_admin_count} associazioni senza amministratori attivi: il messaggio resterà nell'area riservata, ma non riceveranno email né notifiche personali.
            </div>}
            <p className="central-comms__muted">{review.draft.audience === "all" ? "Tutte le affiliate attive" : "Associazioni selezionate"}</p>
            <ul className="central-comms__recipients" aria-label="Destinatari confermati">{review.preview.recipients.map((org) =>
              <li key={org.id} className="central-comms__recipient"><div><strong>{org.name}</strong><span className="central-comms__muted">{org.email_count} email</span></div></li>)}</ul>
          </aside>
        </div>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <form className="central-comms__panel" onSubmit={(event) => { event.preventDefault(); void handleReview(); }}>
            <fieldset disabled={previewing}>
              <div className="central-comms__section">
                <h2 className="central-comms__heading"><span className="central-comms__step">1</span>Scegli a chi scrivere</h2>
                <div className="central-comms__choices">
                  <label className="central-comms__choice"><input type="radio" name="audience" checked={draft.audience === "selected"} onChange={() => updateDraft({ audience: "selected" })} />
                    <span><strong className="text-sm">Scegli le associazioni</strong><span className="central-comms__muted block mt-1">Una o più affiliate attive</span></span></label>
                  <label className="central-comms__choice"><input type="radio" name="audience" checked={draft.audience === "all"} onChange={() => updateDraft({ audience: "all" })} />
                    <span><strong className="text-sm">Tutte le affiliate attive</strong><span className="central-comms__muted block mt-1">Un aggiornamento per tutta la rete</span></span></label>
                </div>
                {recipientsLoading ? <p className="central-comms__muted mt-4" role="status">Caricamento associazioni…</p>
                  : recipientsError ? <div role="alert" className="central-comms__alert central-comms__alert--error mt-4">{recipientsError} <button type="button" className="underline" onClick={() => void loadRecipients()}>Riprova</button></div>
                  : recipients.length === 0 ? <p className="central-comms__muted mt-4">Non ci sono associazioni affiliate attive a cui inviare una comunicazione.</p>
                  : draft.audience === "all" ? <p className="central-comms__muted mt-4">Il messaggio sarà inviato a tutte le <strong>{recipients.length}</strong> associazioni attive. Potrai rivedere l'elenco prima dell'invio.</p>
                  : <div className="mt-5">
                    <div className="flex items-center justify-between gap-3 mb-2"><label className="central-comms__label !mb-0" htmlFor="communication-search">Cerca associazione</label><span className="central-comms__muted">{draft.organization_ids.length} selezionate</span></div>
                    <input id="communication-search" className="sa-input" placeholder="Nome dell'associazione…" value={query} onChange={(event) => setQuery(event.target.value)} />
                    <div className="central-comms__recipients" aria-label="Associazioni affiliate attive">
                      {filteredRecipients.length === 0 ? <p className="central-comms__muted p-4">Nessuna associazione corrisponde alla ricerca.</p> : filteredRecipients.map((org) =>
                        <label className="central-comms__recipient cursor-pointer" key={org.id}><input type="checkbox" checked={draft.organization_ids.includes(org.id)} onChange={() => toggleRecipient(org.id)} aria-label={org.name} />
                          <span><strong>{org.name}</strong><span className="central-comms__muted">{org.admin_count > 0 ? `${org.admin_count} amministratori · ${org.email_count} email` : "Nessun amministratore attivo"}</span></span></label>)}
                    </div>
                  </div>}
              </div>
              <div className="central-comms__section">
                <h2 className="central-comms__heading mb-5"><span className="central-comms__step">2</span>Scrivi il messaggio</h2>
                <label className="central-comms__label" htmlFor="communication-subject">Oggetto</label>
                <input id="communication-subject" className="sa-input" required maxLength={200} placeholder="Es. Aggiornamenti per la nuova stagione associativa" value={draft.subject} onChange={(event) => updateDraft({ subject: event.target.value })} />
                <div className="mt-5"><label className="central-comms__label" htmlFor="communication-body">Messaggio</label>
                  <textarea id="communication-body" className="sa-textarea !font-normal !leading-7" required maxLength={20000} rows={9} placeholder="Gentili associazioni,\n\ncondividiamo con voi…" value={draft.body} onChange={(event) => updateDraft({ body: event.target.value })} />
                </div>
                <p className="central-comms__muted mt-2">Testo semplice, con paragrafi e spazi mantenuti. {draft.body.length.toLocaleString("it-IT")}/20.000 caratteri.</p>
              </div>
              <div className="central-comms__section flex flex-wrap justify-between items-center gap-3"><p className="central-comms__muted">Controlla messaggio e destinatari prima dell'invio.</p><SuperAdminActionButton type="submit" tone="primary" icon="eye" disabled={!canReview || previewing}>{previewing ? "Preparazione anteprima…" : "Rivedi e invia"}</SuperAdminActionButton></div>
            </fieldset>
            {error && <div role="alert" className="central-comms__alert central-comms__alert--error m-5">{error}</div>}
          </form>
          <aside className="central-comms__aside hidden xl:block">
            <p className="sa-eyebrow">Un messaggio, tre punti di contatto</p>
            <h2 className="mt-3 text-xl font-bold tracking-tight">Vicini alle associazioni.</h2>
            <div className="central-comms__channel"><SuperAdminIcon name="book" /><div><strong className="text-sm">Area riservata</strong><p className="central-comms__muted mt-1">Una copia sempre consultabile nelle Comunicazioni ASSONAM.</p></div></div>
            <div className="central-comms__channel"><SuperAdminIcon name="eye" /><div><strong className="text-sm">Notifica in alto</strong><p className="central-comms__muted mt-1">La campanella segnala il nuovo messaggio agli amministratori.</p></div></div>
            <div className="central-comms__channel"><SuperAdminIcon name="mail" /><div><strong className="text-sm">Email agli amministratori</strong><p className="central-comms__muted mt-1">Il testo completo e un collegamento diretto all'area riservata.</p></div></div>
          </aside>
        </div>
      ))}

      {tab === "sent" && <>
        {historyError && <div role="alert" className="central-comms__alert central-comms__alert--error">{historyError} <button type="button" className="underline font-semibold" disabled={historyLoading} onClick={() => setHistoryRefresh((value) => value + 1)}>Ricarica storico</button></div>}
        <div className={`grid items-start gap-6 ${selected ? "xl:grid-cols-[minmax(18rem,.85fr)_minmax(0,1.4fr)]" : ""}`}>
          <section className="central-comms__panel">
            <div className="central-comms__section"><h2 className="central-comms__heading">Comunicazioni inviate</h2><p className="central-comms__muted mt-1">{history ? `${history.total} comunicazioni pubblicate` : "Archivio degli aggiornamenti alle affiliate"}</p></div>
            {historyLoading ? <div className="central-comms__empty" role="status">Caricamento comunicazioni…</div>
              : historyError && !history ? <p className="central-comms__empty">Lo storico non è disponibile. Riprova il caricamento.</p>
              : !history?.items.length ? <div className="central-comms__empty"><SuperAdminIcon name="mail" /><h3 className="font-semibold">La prima comunicazione parte da qui</h3><p className="text-sm mt-2">I messaggi inviati e i loro destinatari saranno raccolti in questo archivio.</p></div>
              : <div className="central-comms__list">{history.items.map((item) => <button type="button" className="central-comms__row" key={item.id} aria-current={selected?.id === item.id} onClick={() => void openSent(item.id)}>
                <div className="central-comms__row-title">{item.subject}</div><p className="central-comms__row-preview">{item.excerpt}</p><div className="central-comms__row-meta flex flex-wrap justify-between gap-2"><span>{communicationDate(item.created_at)}</span><span>{detailLoading === item.id ? "Apertura…" : `${item.recipient_count} associazioni · ${item.email_count} email`}</span></div>
              </button>)}</div>}
            {history && history.total_pages > 1 && <div className="central-comms__section flex items-center justify-between gap-3"><SuperAdminActionButton disabled={page <= 1 || historyLoading} onClick={() => setPage(page - 1)}>Precedente</SuperAdminActionButton><span className="central-comms__muted">{page} / {history.total_pages}</span><SuperAdminActionButton disabled={page >= history.total_pages || historyLoading} onClick={() => setPage(page + 1)}>Successiva</SuperAdminActionButton></div>}
          </section>
          {selected && <section className="central-comms__panel"><div className="central-comms__section"><div className="flex items-center justify-between gap-3 mb-4"><SuperAdminStatusChip tone="success">Pubblicata</SuperAdminStatusChip><SuperAdminActionButton onClick={() => { ++detailRequest.current; setDetailLoading(null); setSelected(null); }}>Chiudi dettaglio</SuperAdminActionButton></div><CommunicationMessage item={selected} /><p className="central-comms__muted mt-4">{communicationDate(selected.created_at)} · {selected.created_by_email}</p></div><div className="central-comms__section"><h3 className="central-comms__heading">Associazioni destinatarie ({selected.recipient_count})</h3><ul className="central-comms__recipients">{selected.recipients?.map((org) => <li className="central-comms__recipient" key={org.id}><div><strong>{org.organization_name}</strong><span className="central-comms__muted">{org.email_count} email programmate</span></div></li>)}</ul></div></section>}
        </div>
      </>}
    </div>
  );
}

function CommunicationMessage({ item }: { item: Pick<CommunicationDraft, "subject" | "body"> }) {
  return <article className="central-comms__message"><div className="central-comms__sender"><SuperAdminIcon name="mail" />ASSONAM</div><h2>{item.subject}</h2><div className="central-comms__body">{item.body}</div></article>;
}
