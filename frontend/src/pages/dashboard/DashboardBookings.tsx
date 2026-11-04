import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  AuthError,
  fetchMemberBookings,
  submitMemberBookingNote,
  type MemberAvailableBookingForm,
  type MemberBookingItem,
  type MemberBookingsResponse,
} from "../../lib/api";
import { readCachedApi, subscribeApiCache } from "../../lib/swrCache";
import type { DashboardContext } from "./DashboardLayout";
import ModalShell from "../../components/ui/ModalShell";
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
  const outletCtx = useOutletContext<DashboardContext | undefined>();
  const user = outletCtx?.user ?? null;
  const [items, setItems] = useState<MemberBookingItem[]>(() => readCachedApi<MemberBookingsResponse>("member:bookings")?.items ?? []);
  const [availableForms, setAvailableForms] = useState<MemberAvailableBookingForm[]>(() => readCachedApi<MemberBookingsResponse>("member:bookings")?.available_forms ?? []);
  const [loading, setLoading] = useState(() => !readCachedApi("member:bookings"));
  const [error, setError] = useState<string | null>(null);
  const [activeBookingId, setActiveBookingId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeBooking = useMemo(
    () => items.find((item) => item.id === activeBookingId) ?? null,
    [activeBookingId, items],
  );

  const buildQuickBookingHref = (form: MemberAvailableBookingForm) => {
    const basePath = form.org_slug
      ? `/forms/${form.org_slug}/${form.public_slug}`
      : `/forms/${form.public_slug}`;
    return basePath;
  };

  const loadBookings = async () => {
    setLoading(!readCachedApi("member:bookings"));
    setError(null);
    try {
      const payload = await fetchMemberBookings();
      setItems(payload.items ?? []);
      setAvailableForms(payload.available_forms ?? []);
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
    return subscribeApiCache(key => {
      if (key !== "member:bookings") return;
      const cached = readCachedApi<MemberBookingsResponse>(key);
      if (cached) { setItems(cached.items); setAvailableForms(cached.available_forms ?? []); }
    });
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
          Le richieste collegate alla tua email socio e le serate prenotabili.
        </p>
      </div>

      {!loading && availableForms.length > 0 ? (
        <section className="surface p-5 sm:p-6" aria-labelledby="quick-booking-heading">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">Prenotazione rapida</p>
              <h2 id="quick-booking-heading" className="mt-1 text-lg font-bold text-neutral-900">
                Prenota un tavolo o una serata
              </h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                I tuoi dati socio (nome, email e telefono) verranno precompilati automaticamente.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {availableForms.map((form) => (
              <div
                key={form.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-2)] p-4"
              >
                <div>
                  <h3 className="font-bold text-neutral-900">{form.title}</h3>
                  {form.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{form.description}</p>
                  ) : null}
                </div>
                <Link
                  to={buildQuickBookingHref(form)}
                  state={user ? { bookingPrefill: { first_name: user.first_name, last_name: user.last_name, email: user.email, phone: user.phone, formId: form.id, associationId: user.organization?.id } } : undefined}
                  className="btn-primary inline-flex w-full items-center justify-center px-4 py-2.5 text-xs font-bold sm:w-auto"
                >
                  Prenota ora →
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
            Quando compili un form con la stessa email del tuo profilo socio, la prenotazione comparirà qui dopo l'invio.
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

      <ModalShell
        open={Boolean(activeBooking)}
        onClose={() => {
          if (!submitting) setActiveBookingId(null);
        }}
        closeDisabled={submitting}
        title={activeBooking?.source_form?.title ?? "Prenotazione"}
        description="Richiesta modifica"
        sizeClassName="max-w-lg"
      >
        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">
            {error}
          </div>
        ) : null}
        <textarea
          className="member-booking-note-textarea theme-input min-h-36 w-full rounded-xl border px-4 py-3 text-sm font-medium outline-none transition"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={4000}
          placeholder="Scrivi qui modifiche, ritardi, persone in più o altre note per la segreteria."
        />
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost" disabled={submitting} onClick={() => setActiveBookingId(null)}>
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
      </ModalShell>
    </div>
  );
};

export default DashboardBookings;
