import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchPublicForm,
  fetchPublicFormBookingAvailableDates,
  fetchPublicFormBookingEvents,
  submitPublicForm,
  type OrgAdminBookingEventSeries,
  type PublicBookingAvailableDate,
  type PublicAssociationForm,
} from "../lib/api";
import { applySeo } from "../lib/seo";
import { FormPublicCanvas } from "../components/forms/FormPublicCanvas";
import { isBookingBlockField } from "../components/forms/builder/utils";

function getSeriesSlotTimes(item: OrgAdminBookingEventSeries): string[] {
  return (item.time_slots || [])
    .filter((slot) => slot.is_active !== false)
    .map((slot) => String(slot.time || slot.start_time || "").slice(0, 5))
    .filter(Boolean);
}

function buildHalfHourOptions(): string[] {
  return Array.from({ length: 48 }, (_, index) => {
    const totalMinutes = index * 30;
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    return `${hours}:${minutes}`;
  });
}

const BOOKING_TIME_OPTIONS = buildHalfHourOptions();
const DEFAULT_BOOKING_AVAILABILITY = {
  hasActiveRules: false,
  dateOpen: true,
  availableSlots: [] as string[],
};

function pickBookingSeriesForTime(items: OrgAdminBookingEventSeries[], timeValue: string): OrgAdminBookingEventSeries | null {
  if (!timeValue) return null;
  const specific = items.find((item) => !item.is_default && getSeriesSlotTimes(item).includes(timeValue));
  if (specific) return specific;
  return items.find((item) => item.is_default && getSeriesSlotTimes(item).includes(timeValue)) || null;
}

function uniqueBookingSlots(items: OrgAdminBookingEventSeries[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  items.flatMap(getSeriesSlotTimes).forEach((slot) => {
    if (!slot || seen.has(slot)) return;
    seen.add(slot);
    ordered.push(slot);
  });
  return ordered;
}

function formUsesDynamicBookingControls(form: PublicAssociationForm | null | undefined): boolean {
  if (!form) return false;
  return Boolean(
    form.booking_dynamic_events_enabled ||
      (form.fields || []).some((field) => isBookingBlockField(field)),
  );
}

function isSelectableBookingDate(item: PublicBookingAvailableDate): boolean {
  return item.date_open !== false && !item.date_closed;
}

function buildInitialValues(form: PublicAssociationForm): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of form.fields) {
    if (field.field_type === "checkbox") values[field.field_key] = [];
    else if (field.field_type === "consent") values[field.field_key] = false;
    else values[field.field_key] = "";
  }
  if (formUsesDynamicBookingControls(form) && (form.booking_enabled || form.create_booking || form.form_type === "booking")) {
    values.__booking_date = new Date().toISOString().slice(0, 10);
    values.__booking_event_series_id = "";
    values.__booking_event_time = "";
  }
  return values;
}

const PublicFormPage = () => {
  const { orgSlug, slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<PublicAssociationForm | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [bookingEvents, setBookingEvents] = useState<OrgAdminBookingEventSeries[]>([]);
  const [bookingDateOptions, setBookingDateOptions] = useState<PublicBookingAvailableDate[]>([]);
  const [bookingAvailability, setBookingAvailability] = useState(DEFAULT_BOOKING_AVAILABILITY);
  const [bookingEventsLoading, setBookingEventsLoading] = useState(false);
  const [bookingDatesLoading, setBookingDatesLoading] = useState(false);
  const bookingControlsActive = formUsesDynamicBookingControls(form);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError("");
    setSuccessMessage("");
    fetchPublicForm(orgSlug || slug, orgSlug ? slug : undefined)
      .then((response) => {
        setForm(response.form);
        setValues(buildInitialValues(response.form));
        const associationName = response.form.association.name || response.form.title;
        applySeo({
          title: `${response.form.title} | ${associationName}`,
          description: response.form.description || `Modulo pubblico per ${associationName}.`,
          appendSiteName: false,
          siteName: associationName,
          noindex: true,
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Form non disponibile.");
      })
      .finally(() => setLoading(false));
  }, [orgSlug, slug]);

  useEffect(() => {
    if (!slug || !bookingControlsActive) {
      setBookingDateOptions([]);
      setBookingDatesLoading(false);
      return;
    }
    let cancelled = false;
    setBookingDatesLoading(true);
    const start = new Date().toISOString().slice(0, 10);
    const request = orgSlug
      ? fetchPublicFormBookingAvailableDates(orgSlug, slug, { start, days: 90 })
      : fetchPublicFormBookingAvailableDates(slug, { start, days: 90 });
    request
      .then((response) => {
        if (cancelled) return;
        setBookingDateOptions(response.items);
        setValues((current) => {
          const currentDate = String(current.__booking_date || "");
          const currentStillValid = response.items.some(
            (item) => item.date === currentDate && isSelectableBookingDate(item),
          );
          const nextDate = currentStillValid
            ? currentDate
            : response.items.find(isSelectableBookingDate)?.date || "";
          if (currentDate === nextDate) return current;
          return {
            ...current,
            __booking_date: nextDate,
            __booking_event_time: "",
            __booking_event_series_id: "",
          };
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Giorni disponibili non caricati.");
      })
      .finally(() => {
        if (!cancelled) setBookingDatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingControlsActive, orgSlug, slug]);

  useEffect(() => {
    if (!slug || !bookingControlsActive) {
      setBookingEvents([]);
      setBookingAvailability(DEFAULT_BOOKING_AVAILABILITY);
      return;
    }
    const dateValue = String(values.__booking_date || "");
    if (!dateValue) {
      setBookingEvents([]);
      setBookingAvailability({ ...DEFAULT_BOOKING_AVAILABILITY, dateOpen: false });
      return;
    }
    let cancelled = false;
    setBookingEventsLoading(true);
    const request = orgSlug
      ? fetchPublicFormBookingEvents(orgSlug, slug, dateValue)
      : fetchPublicFormBookingEvents(slug, dateValue);
    request
      .then((response) => {
        if (!cancelled) {
          const availableSlots = response.available_slots?.length
            ? response.available_slots
            : uniqueBookingSlots(response.items);
          const hasActiveRules = Boolean(response.has_active_rules);
          const dateOpen = response.date_open !== false;
          setBookingEvents(response.items);
          setBookingAvailability({ hasActiveRules, dateOpen, availableSlots });
          setValues((current) => {
            const currentTime = String(current.__booking_event_time || "");
            const allowedTimes = hasActiveRules ? availableSlots : BOOKING_TIME_OPTIONS;
            const nextTime = currentTime && allowedTimes.includes(currentTime) ? currentTime : "";
            const preferred = pickBookingSeriesForTime(response.items, nextTime);
            const nextSeriesId = preferred ? String(preferred.id) : "";
            if (currentTime === nextTime && String(current.__booking_event_series_id || "") === nextSeriesId) return current;
            return { ...current, __booking_event_time: nextTime, __booking_event_series_id: nextSeriesId };
          });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Serate prenotabili non disponibili.");
      })
      .finally(() => {
        if (!cancelled) setBookingEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingControlsActive, orgSlug, slug, values.__booking_date]);

  useEffect(() => {
    if (!bookingControlsActive || bookingEventsLoading) return;
    setValues((current) => {
      const timeValue = String(current.__booking_event_time || "");
      const preferred = pickBookingSeriesForTime(bookingEvents, timeValue);
      const nextSeriesId = preferred ? String(preferred.id) : "";
      if (String(current.__booking_event_series_id || "") === nextSeriesId) return current;
      return { ...current, __booking_event_series_id: nextSeriesId };
    });
  }, [bookingControlsActive, bookingEvents, bookingEventsLoading, values.__booking_event_time]);

  function updateValue(fieldKey: string, nextValue: unknown) {
    setValues((current) => ({ ...current, [fieldKey]: nextValue }));
  }

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!slug || !form) return;
    setSubmitting(true);
    setError("");
    try {
      const response = orgSlug
        ? await submitPublicForm(orgSlug, slug, values)
        : await submitPublicForm(slug, values);
      setSuccessMessage(response.message || form.success_message || "Richiesta inviata correttamente.");
      setValues(buildInitialValues(form));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invio non riuscito.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="public-form-page-shell min-h-screen flex items-center justify-center text-sm">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <p>Caricamento pagina...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="public-form-page-shell min-h-screen flex items-center justify-center">
        <div className="public-form-status-card max-w-md w-full mx-4 rounded-3xl border p-8 text-center shadow-lg">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold mb-2">Non disponibile</h1>
          <p className="public-form-status-card__text text-sm mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-neutral-900 text-white rounded-xl text-sm font-bold shadow-sm hover:bg-neutral-800 transition"
          >
            Riprova
          </button>
        </div>
      </div>
    );
  }

  if (successMessage && form) {
    const accentColor = form.accent_color || "#0f766e";
    return (
      <div className="public-form-page-shell min-h-screen flex items-center justify-center">
        <div className="public-form-status-card max-w-xl w-full mx-4 rounded-3xl border p-8 text-center shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)]">
          <div 
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-white shadow-lg"
            style={{ backgroundColor: accentColor }}
          >
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-3">{form.title}</h1>
          <p className="public-form-status-card__text text-base mb-8 max-w-sm mx-auto">{successMessage}</p>
          <button
            onClick={() => setSuccessMessage("")}
            className="w-full sm:w-auto px-8 py-3.5 bg-neutral-100 text-neutral-800 hover:bg-neutral-200 rounded-xl text-sm font-bold transition-colors"
          >
            Invia una nuova risposta
          </button>
        </div>
      </div>
    );
  }

  if (form) {
    return (
      <div className="public-form-page-shell min-h-screen">
        <FormPublicCanvas
          form={form}
          values={values}
          onValueChange={updateValue}
          onSubmit={() => void handleSubmit()}
          submitting={submitting}
          interactive
          bookingEvents={bookingEvents}
          bookingEventsLoading={bookingEventsLoading}
          bookingDateOptions={bookingDateOptions}
          bookingDatesLoading={bookingDatesLoading}
          bookingRulesActive={bookingAvailability.hasActiveRules}
          bookingDateOpen={bookingAvailability.dateOpen}
          availableBookingSlots={bookingAvailability.availableSlots}
        />
      </div>
    );
  }

  return null;
};

export default PublicFormPage;
