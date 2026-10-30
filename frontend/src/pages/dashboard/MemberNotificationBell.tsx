import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ModalShell from "../../components/ui/ModalShell";
import { AuthError, fetchMemberNotifications, markMemberNotificationRead, type MemberAreaNotification } from "../../lib/api";
import { formatMemberDate } from "../../lib/memberDates";
import { memberNotificationHref } from "../../lib/memberAccount";

export const MEMBER_NOTIFICATIONS_UPDATED = "member-notifications-updated";

export default function MemberNotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MemberAreaNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState<number | null>(null);
  const openingLock = useRef(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    let active = true; let sequence = 0;
    async function load() {
      const request = ++sequence;
      if (open) setLoading(true);
      try {
        const response = await fetchMemberNotifications({ limit: 20 });
        if (active && request === sequence) { setItems(response.items); setUnread(response.unread_count); setError(""); }
      } catch (reason) {
        if (!active || request !== sequence) return;
        if (reason instanceof AuthError) { navigate("/login", { replace: true }); return; }
        setError(reason instanceof Error ? reason.message : "Notifiche non disponibili.");
      } finally { if (active && request === sequence) setLoading(false); }
    }
    const refresh = () => { if (!document.hidden) void load(); };
    void load();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener(MEMBER_NOTIFICATIONS_UPDATED, refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); window.removeEventListener(MEMBER_NOTIFICATIONS_UPDATED, refresh); };
  }, [open, navigate]);

  async function visit(item: MemberAreaNotification) {
    if (openingLock.current) return;
    openingLock.current = true; setOpening(item.id); setError("");
    try {
      if (!item.is_read) await markMemberNotificationRead(item.id);
      window.dispatchEvent(new Event(MEMBER_NOTIFICATIONS_UPDATED));
      setOpen(false);
      navigate(memberNotificationHref(item.href));
    } catch (reason) {
      if (reason instanceof AuthError) navigate("/login", { replace: true });
      else setError(reason instanceof Error ? reason.message : "Impossibile aprire la notifica.");
    } finally { openingLock.current = false; setOpening(null); }
  }
  return <>
    <button type="button" className="member-notification-bell" aria-label={`Notifiche${unread ? `: ${unread} da leggere` : ""}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M14.5 19a2.5 2.5 0 0 1-5 0M18 8a6 6 0 0 0-12 0v3l-2 5h16l-2-5V8Z" /></svg>
      {unread ? <span aria-hidden="true">{unread > 9 ? "9+" : unread}</span> : null}
    </button>
    <ModalShell open={open} title="Le tue notifiche" onClose={close} sizeClassName="max-w-lg" contentClassName="member-notification-panel">
      {error ? <p role="alert" className="member-home__error">{error}</p> : null}
      {loading ? <p role="status">Caricamento notifiche…</p> : !items.length ? <p>Nessuna notifica.</p> : <ul className="member-notification-list">
        {items.map(item => <li key={item.id} className={item.is_read ? "" : "is-unread"}>
          <h3>{item.title}{!item.is_read ? <span>Da leggere</span> : null}</h3>
          <p>{item.body}</p>
          {item.created_at ? <time dateTime={item.created_at}>{formatMemberDate(item.created_at)}</time> : null}
          <button type="button" disabled={opening !== null} onClick={() => void visit(item)}>
            {opening === item.id ? "Apertura…" : item.type === "document_rejected" ? "Correggi e reinvia documento" : "Apri"}
          </button>
        </li>)}
      </ul>}
    </ModalShell>
  </>;
}
