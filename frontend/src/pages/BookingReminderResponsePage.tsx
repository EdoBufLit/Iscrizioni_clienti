import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchPublicBookingReminderResponse,
  submitPublicBookingReminderResponse,
  type PublicBookingReminderResponse,
} from "../lib/api";

function formatBookingDate(value: string | null | undefined) {
  if (!value) return "Data da definire";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" });
}

const actionCopy: Record<string, { waiting: string; button: string }> = {
  confirm: {
    waiting: "Registriamo la conferma della tua prenotazione.",
    button: "Conferma prenotazione",
  },
  cancel: {
    waiting: "Registriamo l'annullamento della tua prenotazione.",
    button: "Annulla prenotazione",
  },
};

const BookingReminderResponsePage = () => {
  const { token = "" } = useParams();
  const [initial, setInitial] = useState<PublicBookingReminderResponse | null>(null);
  const [result, setResult] = useState<PublicBookingReminderResponse | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submittedRef = useRef(false);

  const action = result?.action || initial?.action || "";
  const booking = result?.booking || initial?.booking;
  const isNote = action === "note";
  const isFinal = Boolean(result?.title || result?.message);

  const copy = useMemo(() => actionCopy[action] || actionCopy.confirm, [action]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const payload = await fetchPublicBookingReminderResponse(token);
        if (cancelled) return;
        setInitial(payload);
        if ((payload.action === "confirm" || payload.action === "cancel") && !payload.expired && !submittedRef.current) {
          submittedRef.current = true;
          setSubmitting(true);
          const response = await submitPublicBookingReminderResponse(token);
          if (!cancelled) setResult({ ...response, booking: payload.booking });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Link prenotazione non valido.");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSubmitting(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleNoteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = note.trim();
    if (!normalized) {
      setError("Scrivi una nota prima di inviare.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await submitPublicBookingReminderResponse(token, normalized);
      setResult({ ...response, booking });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore invio nota.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="booking-response-page">
      <div className="booking-response-card">
        {loading ? (
          <>
            <p className="booking-response-eyebrow">Prenotazione</p>
            <h1>Controllo il link...</h1>
            <p className="booking-response-copy">Attendi qualche secondo.</p>
          </>
        ) : error && !initial ? (
          <>
            <p className="booking-response-eyebrow">Link non valido</p>
            <h1>Non troviamo questa prenotazione</h1>
            <p className="booking-response-copy">{error}</p>
          </>
        ) : (
          <>
            <p className="booking-response-eyebrow">Prenotazione</p>
            <h1>{isFinal ? result?.title : isNote ? "Invia una nota" : copy.waiting}</h1>
            {isFinal ? (
              <p className="booking-response-copy">{result?.message}</p>
            ) : isNote ? (
              <p className="booking-response-copy">Scrivi qui modifiche, ritardi o richieste per la segreteria.</p>
            ) : (
              <p className="booking-response-copy">
                La pagina si aggiorna automaticamente appena la risposta viene salvata.
              </p>
            )}

            {booking ? (
              <dl className="booking-response-summary">
                <div>
                  <dt>Nome</dt>
                  <dd>{booking.customer_name}</dd>
                </div>
                <div>
                  <dt>Quando</dt>
                  <dd>
                    {formatBookingDate(booking.booking_date)}
                    {booking.booking_time ? `, ${booking.booking_time}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Persone</dt>
                  <dd>{booking.party_size || "-"}</dd>
                </div>
                {booking.event_summary ? (
                  <div>
                    <dt>Serata</dt>
                    <dd>{booking.event_summary}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            {isNote && !isFinal ? (
              <form className="booking-response-form" onSubmit={handleNoteSubmit}>
                <label htmlFor="booking-response-note">Nota per la segreteria</label>
                <textarea
                  id="booking-response-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={5}
                  maxLength={4000}
                  placeholder="Esempio: arriviamo 10 minuti dopo, siamo in 5 invece che 4..."
                />
                {error ? <p className="booking-response-error">{error}</p> : null}
                <button type="submit" disabled={submitting}>
                  {submitting ? "Invio in corso..." : "Invia nota"}
                </button>
              </form>
            ) : null}

            {!isNote && !isFinal ? (
              <div className="booking-response-progress">
                <span />
                <p>{submitting ? copy.waiting : "Risposta in corso..."}</p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
};

export default BookingReminderResponsePage;
