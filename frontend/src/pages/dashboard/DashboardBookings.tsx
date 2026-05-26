import { useEffect, useMemo, useState } from "react";
import {
  AuthError,
  fetchMemberBookings,
  submitMemberBookingNote,
  type MemberBookingItem,
} from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";

const STATUS_META: Record<string, { label: string; className: string }> = {
  new: { label: "Nuova", className: "border-slate-200 bg-slate-50 text-slate-700" },
  pending: { label: "In attesa", className: "border-amber-200 bg-amber-50 text-amber-700" },
  confirmed: { label: "Confermata", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  seated: { label: "Seduta", className: "border-blue-200 bg-blue-50 text-blue-700" },
  completed: { label: "Completata", className: "border-neutral-200 bg-neutral-50 text-neutral-700" },
  cancelled: { label: "Annullata", className: "border-red-200 bg-red-50 text-red-700" },
  no_show: { label: "No show", className: "border-red-200 bg-red-50 text-red-700" },
};

const formatDate = (value: string | null) => {
  if (!value) return "Data da definire";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const statusMeta = (status: string) =>
  STATUS_META[status] ?? { label: status, className: "border-neutral-200 bg-neutral-50 text-neutral-700" };

const DashboardBookings = () => {
  const [items, setItems] = useState<MemberBookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeBookingId, setActiveBookingId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeBooking = useMemo(
    () => items.find((item) => item.id === activeBookingId) ?? null,
    [activeBookingId, items],
  );

  const loadBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchMemberBookings();
      setItems(payload.items ?? []);
    } catch (err) {
      if (err instanceof AuthError) {
        window.location.href = "/login";
        return;
      }
      setError(err instanceof Error ? err.message : "Impossibile caricare le prenotazioni.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBookings();
  }, []);

  const handleOpenNote = (booking: MemberBookingItem) => {
    setActiveBookingId(booking.id);
    setNote(booking.customer_note ?? "");
  };

  const handleSubmitNote = async () => {
    if (!activeBooking || submitting) return;
    const normalized = note.trim();
    if (!normalized) {
      setError("Scrivi una nota o una richiesta di modifica.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = await submitMemberBookingNote(activeBooking.id, normalized);
      setItems((current) =>
        current.map((item) => (item.id === payload.booking.id ? payload.booking : item)),
      );
      setActiveBookingId(null);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile inviare la richiesta.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Prenotazioni</h1>
        <p className="mt-1 text-sm font-medium text-neutral-500">
          Le richieste collegate alla tua email socio.
        </p>
      </div>

      {error && (
        <div className="surface border border-red-100 bg-red-50/80 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((item) => (
            <div key={item} className="surface p-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-4 h-7 w-56" />
              <Skeleton className="mt-4 h-4 w-full" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="surface p-8 text-center">
          <h2 className="text-lg font-bold text-neutral-900">Nessuna prenotazione collegata</h2>
          <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-relaxed text-neutral-500">
            Quando compili un form con la stessa email del tuo profilo socio, la prenotazione comparira qui dopo l'invio.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((booking) => {
            const meta = statusMeta(booking.status);
            return (
              <article key={booking.id} className="surface p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${meta.className}`}>
                        {meta.label}
                      </span>
                      {booking.has_unreviewed_customer_note && (
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-700">
                          Richiesta inviata
                        </span>
                      )}
                    </div>
                    <h2 className="mt-3 text-xl font-bold tracking-tight text-neutral-900">
                      {booking.source_form?.title ?? "Prenotazione"}
                    </h2>
                    <p className="mt-2 text-sm font-semibold text-neutral-600">
                      {formatDate(booking.booking_date)}
                      {booking.booking_time ? ` alle ${booking.booking_time}` : ""}
                      {booking.party_size ? ` - ${booking.party_size} persone` : ""}
                    </p>
                    {booking.event_summary && (
                      <p className="mt-3 whitespace-pre-line text-sm font-medium leading-relaxed text-neutral-500">
                        {booking.event_summary}
                      </p>
                    )}
                    {booking.customer_note && (
                      <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50/70 p-3 text-sm font-medium leading-relaxed text-amber-800">
                        {booking.customer_note}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-ghost w-full shrink-0 justify-center sm:w-auto"
                    onClick={() => handleOpenNote(booking)}
                  >
                    Modifica / note
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {activeBooking && (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/40 px-4 py-5 sm:items-center sm:justify-center">
          <div className="surface w-full max-w-lg p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                  Richiesta modifica
                </p>
                <h2 className="mt-2 text-xl font-bold text-neutral-900">
                  {activeBooking.source_form?.title ?? "Prenotazione"}
                </h2>
              </div>
              <button
                type="button"
                className="btn-ghost !px-3 !py-2"
                onClick={() => setActiveBookingId(null)}
              >
                Chiudi
              </button>
            </div>
            <textarea
              className="member-booking-note-textarea mt-5 min-h-36 w-full rounded-xl border px-4 py-3 text-sm font-medium outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={4000}
              placeholder="Scrivi qui modifiche, ritardi, persone in piu o altre note per la segreteria."
            />
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" className="btn-ghost" onClick={() => setActiveBookingId(null)}>
                Annulla
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={submitting}
                onClick={() => {
                  void handleSubmitNote();
                }}
              >
                {submitting ? "Invio..." : "Invia richiesta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardBookings;
