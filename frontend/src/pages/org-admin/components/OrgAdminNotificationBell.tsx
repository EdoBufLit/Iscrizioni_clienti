import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AuthError,
  deleteOrgAdminNotification,
  fetchOrgAdminNotifications,
  fetchOrgAdminUnreadNotificationCount,
  markAllOrgAdminNotificationsRead,
  markOrgAdminNotificationRead,
  type OrgAdminNotification,
} from "../../../lib/api";

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const notificationTone = (type: string) => {
  if (type === "booking_request") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200/60";
  }
  if (type === "form_submission") {
    return "bg-cyan-50 text-cyan-700 ring-cyan-200/60";
  }
  if (type === "document_accounting") {
    return "bg-amber-50 text-amber-700 ring-amber-200/60";
  }
  if (type === "low_cards") {
    return "bg-rose-50 text-rose-700 ring-rose-200/60";
  }
  return "bg-sky-50 text-sky-700 ring-sky-200/60";
};

const notificationLabel = (type: string) => {
  if (type === "booking_request") return "Prenotazione";
  if (type === "form_submission") return "Richiesta";
  if (type === "document_accounting") return "Accounting";
  if (type === "low_cards") return "Tessere";
  return "Documenti";
};

const OrgAdminNotificationBell = () => {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [items, setItems] = useState<OrgAdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadCount = async () => {
      try {
        const response = await fetchOrgAdminUnreadNotificationCount();
        if (!active) return;
        setUnreadCount(response.unread_count);
      } catch (err) {
        if (!active) return;
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
          return;
        }
      }
    };

    void loadCount();
    const intervalId = window.setInterval(() => {
      void loadCount();
    }, 60000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [navigate]);

  useEffect(() => {
    if (!open) return;

    let active = true;
    setLoading(true);
    setError("");

    fetchOrgAdminNotifications(20)
      .then((response) => {
        if (!active) return;
        setItems(response.items);
        setUnreadCount(response.unread_count);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Errore nel caricamento notifiche.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [navigate, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleNotificationClick = async (notification: OrgAdminNotification) => {
    try {
      setError("");
      if (!notification.is_read) {
        await markOrgAdminNotificationRead(notification.id);
        setItems((current) =>
          current.map((item) =>
            item.id === notification.id ? { ...item, is_read: true, read_at: new Date().toISOString() } : item,
          ),
        );
        setUnreadCount((current) => Math.max(0, current - 1));
      }
      setOpen(false);
      navigate(notification.href || "/org-admin");
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Errore apertura notifica.");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      setMarkingAll(true);
      setError("");
      await markAllOrgAdminNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, is_read: true, read_at: item.read_at || new Date().toISOString() })));
      setUnreadCount(0);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Errore aggiornamento notifiche.");
    } finally {
      setMarkingAll(false);
    }
  };

  const handleDismissNotification = async (notification: OrgAdminNotification) => {
    try {
      setError("");
      const result = await deleteOrgAdminNotification(notification.id);
      setItems((current) => current.filter((item) => item.id !== notification.id));
      if (result.was_unread) {
        setUnreadCount((current) => Math.max(0, current - 1));
      }
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Errore eliminazione notifica.");
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`relative flex h-11 w-11 items-center justify-center rounded-2xl border bg-white/80 text-neutral-600 shadow-sm transition hover:text-brand ${
          unreadCount > 0
            ? "border-rose-200 shadow-[0_18px_35px_-24px_rgba(225,29,72,0.65)] ring-1 ring-rose-100/80 hover:border-rose-300"
            : "border-neutral-200 hover:border-brand/30"
        }`}
        aria-label="Apri notifiche"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 1-5.714 0M18 8.25a6 6 0 1 0-12 0v2.132a4 4 0 0 1-.924 2.54L3.75 14.5h16.5l-1.326-1.578A4 4 0 0 1 18 10.382V8.25Z" />
        </svg>
        {unreadCount > 0 && (
          <span className="pointer-events-none absolute -right-1 -top-1 h-3.5 w-3.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-rose-400/70" />
            <span className="absolute inset-[2px] rounded-full bg-rose-600 ring-4 ring-rose-100" />
          </span>
        )}
        {unreadCount > 0 && (
          <span className="absolute -right-2.5 top-6 inline-flex min-w-[1.35rem] items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-lg">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="org-admin-notification-popover fixed left-3 right-3 top-[calc(4rem+0.75rem)] z-[70] overflow-hidden rounded-[28px] border sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+0.75rem)] sm:w-[min(92vw,26rem)]">
          <div className="org-admin-notification-popover__header border-b px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-neutral-400">Notifiche</p>
                <h3 className="mt-2 text-lg font-bold tracking-tight text-neutral-900">Centro aggiornamenti</h3>
              </div>
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                disabled={markingAll || unreadCount === 0}
                className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand disabled:opacity-40"
              >
                {markingAll ? "..." : "Segna tutto letto"}
              </button>
            </div>
          </div>

          {error && (
            <div className="border-b border-red-100 bg-red-50/80 px-5 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <div className="org-admin-notification-popover__list max-h-[min(28rem,calc(100vh-6.5rem))] overflow-auto p-3">
            {loading ? (
              <div className="space-y-3 p-2">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="org-admin-notification-loading animate-pulse rounded-[1.25rem] border px-4 py-4">
                    <div className="h-3 w-24 rounded bg-neutral-200" />
                    <div className="mt-3 h-4 w-40 rounded bg-neutral-200" />
                    <div className="mt-2 h-3 w-full rounded bg-neutral-100" />
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="org-admin-notification-empty rounded-[1.25rem] border border-dashed px-5 py-10 text-center">
                <p className="text-sm font-semibold text-neutral-500">Nessuna notifica disponibile.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((notification) => (
                  <div
                    key={notification.id}
                    className={`org-admin-notification-card w-full rounded-[1.25rem] border px-4 py-4 text-left transition ${
                      notification.is_read
                        ? ""
                        : "is-unread shadow-[0_18px_50px_-40px_rgba(15,118,110,0.45)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ring-1 ring-inset ${notificationTone(notification.type)}`}>
                          {notificationLabel(notification.type)}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleNotificationClick(notification)}
                          className="mt-3 block text-left"
                        >
                          <h4 className="org-admin-notification-card__title text-sm font-bold">{notification.title}</h4>
                          <p className="org-admin-notification-card__body mt-2 text-sm font-medium leading-relaxed">{notification.body}</p>
                        </button>
                      </div>
                      <div className="flex shrink-0 items-start gap-2">
                        {!notification.is_read && <span className="mt-1 h-2.5 w-2.5 rounded-full bg-brand shadow-[0_0_0_6px_rgba(15,118,110,0.12)]" />}
                        <button
                          type="button"
                          onClick={() => void handleDismissNotification(notification)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          aria-label="Elimina notifica"
                          title="Elimina"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" d="M5 5L15 15" />
                            <path strokeLinecap="round" d="M15 5L5 15" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="org-admin-notification-card__meta mt-4 flex items-center justify-between gap-3 text-[11px] font-semibold">
                      <span>{formatDateTime(notification.created_at)}</span>
                      <span>{notification.is_read ? "Letta" : "Nuova"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgAdminNotificationBell;
