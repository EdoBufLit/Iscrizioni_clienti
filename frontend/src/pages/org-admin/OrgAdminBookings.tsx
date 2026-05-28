import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  assignOrgAdminBookingTable,
  createOrgAdminBooking,
  createOrgAdminBookingEventSeries,
  createOrgAdminRoom,
  createOrgAdminRoomTable,
  deleteOrgAdminBookingEventSeries,
  deleteOrgAdminRoom,
  deleteOrgAdminRoomTable,
  fetchOrgAdminBookingEventSeries,
  fetchOrgAdminBooking,
  fetchOrgAdminBookings,
  fetchOrgAdminForms,
  fetchOrgAdminRoomMap,
  fetchOrgAdminRooms,
  fetchOrgAdminRoomTables,
  saveOrgAdminRoomMap,
  markOrgAdminBookingCustomerNoteRead,
  rejectOrgAdminBookingWithoutMessage,
  unassignOrgAdminBookingTable,
  updateOrgAdminBookingEventSeries,
  updateOrgAdminFormSubmissionStatus,
  updateOrgAdminBooking,
  updateOrgAdminRoom,
  updateOrgAdminRoomTable,
  type AssociationBooking,
  type AssociationForm,
  type OrgAdminBookingEventSeries,
  type AssociationRoom,
  type AssociationRoomMap,
  type AssociationRoomTable,
} from "../../lib/api";
import { applySeo } from "../../lib/seo";
import { DESTRUCTIVE_ACTION_COPY, formatActionObject } from "../../lib/statusLabels";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ModalShell from "../../components/ui/ModalShell";
import Skeleton from "../../components/ui/Skeleton";
import SubmissionDecisionModal from "../../components/ui/SubmissionDecisionModal";
import { useToast } from "../../components/ui/ToastProvider";
import { RoomFloorMap } from "../../components/bookings/RoomFloorMap";
import { KpiCard, PageHeader, SectionPanel } from "./components/OrgAdminPrimitives";

type SectionTab = "agenda" | "events" | "rooms" | "tables" | "map";
type DayStatusFilter = "pending" | "managed" | "all" | "confirmed" | "seated" | "completed";
type BookingManagementOverlay = "event" | "room" | "table" | null;
type BookingDetailsUpdate = {
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  booking_date: string | null;
  booking_time: string | null;
  party_size: number | null;
  notes: string | null;
};

const bookingStatuses = ["new", "pending", "confirmed", "seated", "completed", "cancelled", "no_show"];
const dayStatusFilters: Array<{ key: DayStatusFilter; label: string }> = [
  { key: "pending", label: "Richieste" },
  { key: "managed", label: "Gestite" },
  { key: "all", label: "Tutte" },
];

const bookingStatusMeta: Record<string, { label: string; chipClass: string; dotClass: string; serviceLabel: string }> = {
  new: {
    label: "In attesa",
    chipClass: "booking-status-chip booking-status-chip--pending",
    dotClass: "booking-status-dot booking-status-dot--pending",
    serviceLabel: "Nuova",
  },
  pending: {
    label: "In attesa",
    chipClass: "booking-status-chip booking-status-chip--pending",
    dotClass: "booking-status-dot booking-status-dot--pending",
    serviceLabel: "In attesa",
  },
  confirmed: {
    label: "Confermata",
    chipClass: "booking-status-chip booking-status-chip--confirmed",
    dotClass: "booking-status-dot booking-status-dot--confirmed",
    serviceLabel: "Confermata",
  },
  seated: {
    label: "Seduta",
    chipClass: "booking-status-chip booking-status-chip--seated",
    dotClass: "booking-status-dot booking-status-dot--seated",
    serviceLabel: "Seduta",
  },
  completed: {
    label: "Completata",
    chipClass: "booking-status-chip booking-status-chip--completed",
    dotClass: "booking-status-dot booking-status-dot--completed",
    serviceLabel: "Completata",
  },
  cancelled: {
    label: "Cancellata",
    chipClass: "booking-status-chip booking-status-chip--cancelled",
    dotClass: "booking-status-dot booking-status-dot--cancelled",
    serviceLabel: "Cancellata",
  },
  no_show: {
    label: "No show",
    chipClass: "booking-status-chip booking-status-chip--cancelled",
    dotClass: "booking-status-dot booking-status-dot--cancelled",
    serviceLabel: "No show",
  },
};

const sectionTabs: Array<{ key: SectionTab; label: string; hint: string }> = [
  { key: "agenda", label: "Agenda", hint: "Prenotazioni e assegnazioni" },
  { key: "events", label: "Serate", hint: "Eventi prenotabili" },
  { key: "rooms", label: "Sale/Tavoli", hint: "Spazi, capienza e stato" },
  { key: "map", label: "Mappa sala", hint: "Piantina 2D" },
];

const weekdayOptions = [
  { value: 0, label: "Lunedi" },
  { value: 1, label: "Martedi" },
  { value: 2, label: "Mercoledi" },
  { value: 3, label: "Giovedi" },
  { value: 4, label: "Venerdi" },
  { value: 5, label: "Sabato" },
  { value: 6, label: "Domenica" },
];

function normalizeSection(value: string | null | undefined): SectionTab {
  if (value === "tables") return "rooms";
  if (value === "rooms" || value === "map" || value === "events" || value === "agenda") return value;
  return "agenda";
}

const inputClass =
  "theme-input mt-1 w-full rounded-[1rem] px-3.5 py-2.5 text-sm";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parsePositiveInt(value: string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function firstDayOfMonthIso(value?: string) {
  const base = value ? new Date(value) : new Date();
  const safe = Number.isNaN(base.getTime()) ? new Date() : base;
  return `${safe.getFullYear()}-${String(safe.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Data da definire";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" });
}

function formatDateTime(dateValue: string | null | undefined, timeValue?: string | null) {
  const timeLabel = timeValue && /^\d{2}:\d{2}/.test(timeValue) ? timeValue.slice(0, 5) : timeValue;
  if (!dateValue) return timeLabel || "Da definire";
  const date = new Date(dateValue);
  const label = Number.isNaN(date.getTime())
    ? dateValue
    : date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  return timeLabel ? `${label} - ${timeLabel}` : label;
}

function formatMobileDayTitle(value: string | null | undefined) {
  if (!value) return "Agenda";
  if (value === todayIso()) return "Oggi";
  if (value === addDaysIso(todayIso(), 1)) return "Domani";
  if (value === addDaysIso(todayIso(), -1)) return "Ieri";
  return formatDate(value);
}

function formatStatusLabel(status: string) {
  return bookingStatusMeta[status]?.label ?? status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatServiceStatusLabel(status: string) {
  return bookingStatusMeta[status]?.serviceLabel ?? formatStatusLabel(status);
}

function serviceStatusButtonLabel(status: string) {
  if (status === "completed") return "OK";
  if (status === "cancelled") return "X";
  switch (status) {
    case "new":
      return "N";
    case "pending":
      return "A";
    case "confirmed":
      return "C";
    case "seated":
      return "S";
    case "completed":
      return "OK";
    case "cancelled":
      return "X";
    case "no_show":
      return "No show";
    default:
      return formatServiceStatusLabel(status);
  }
}

function bookingStatusChipClass(status: string) {
  return bookingStatusMeta[status]?.chipClass ?? "booking-status-chip booking-status-chip--neutral";
}

function bookingStatusDotClass(status: string) {
  return bookingStatusMeta[status]?.dotClass ?? "booking-status-dot booking-status-dot--neutral";
}

function matchesDayStatusFilter(booking: AssociationBooking, filter: DayStatusFilter) {
  if (filter === "all") return true;
  if (filter === "pending") return booking.status === "pending" || booking.status === "new";
  if (filter === "managed") return !isPendingBookingRequest(booking);
  return booking.status === filter;
}

function isPendingBookingRequest(booking: AssociationBooking) {
  const requestStatus = booking.request_status || "";
  return (
    booking.status === "pending"
    || booking.status === "new"
    || requestStatus === "pending"
    || requestStatus === "new"
  );
}

function initialsFromName(value: string | null | undefined) {
  const parts = (value || "?").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function bookingDisplayName(booking: AssociationBooking) {
  const stored = String(booking.customer_name || "").trim();
  if (stored && !["prenotazione", "richiesta prenotazione"].includes(stored.toLowerCase())) {
    return stored;
  }
  const fromPayload = (booking.request_payload_summary || []).find((field) => {
    const haystack = `${field.key} ${field.label}`.toLowerCase();
    if (/(email|mail|telefono|phone|numero|persone|pax|privacy|consenso|data|orario|ora)/.test(haystack)) {
      return false;
    }
    return /(nome|cognome|nominativo|cliente|socio)/.test(haystack) && field.value.trim();
  });
  return fromPayload?.value.trim() || stored || "Prenotazione";
}

function isBookingRequestFactField(field: { key: string; label: string }) {
  const haystack = `${field.key || ""} ${field.label || ""}`.toLowerCase();
  return /(nome|cognome|nominativo|cliente|socio|email|mail|telefono|phone|cellulare|contatto|booking_date|booking_time|party_size|data|orario|ora|persone|pax|serata|evento)/.test(haystack);
}

function formatBookingTable(booking: Pick<AssociationBooking, "room" | "table">) {
  if (booking.table?.name) return `Tavolo ${booking.table.name}`;
  if (booking.room?.name) return booking.room.name;
  return "Non assegnato";
}

function isFormLinkedBooking(booking: Pick<AssociationBooking, "submission_id" | "source_form">) {
  return Boolean(booking.submission_id && booking.source_form?.id);
}

function bookingCardToneClass(booking: AssociationBooking) {
  const reminderStatus = booking.customer_reminder_response?.status;
  if (booking.has_unreviewed_customer_note || reminderStatus === "note") return "has-customer-note";
  if (reminderStatus === "cancelled") return "is-cancelled";
  if (booking.status === "cancelled" || booking.status === "no_show" || booking.request_status === "rejected") return "is-cancelled";
  if (booking.status === "confirmed" || booking.status === "seated" || booking.status === "completed") return "is-confirmed";
  return "";
}

function ReminderResponseIndicator({ booking }: { booking: AssociationBooking }) {
  const response = booking.customer_reminder_response;
  if (!response) return null;
  const status = response.status === "note" && booking.has_unreviewed_customer_note ? "note" : response.status;
  if (status !== "confirmed" && status !== "cancelled" && status !== "note") return null;
  const label =
    status === "confirmed"
      ? "Confermata dal cliente"
      : status === "cancelled"
        ? "Annullata dal cliente"
        : "Note cliente da leggere";
  return (
    <span className={`booking-reminder-indicator is-${status}`} title={label} aria-label={label}>
      <span aria-hidden="true" />
      <em>{label}</em>
    </span>
  );
}

function toDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function addDaysIso(value: string, delta: number) {
  const date = new Date(`${value}T00:00:00`);
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  safe.setDate(safe.getDate() + delta);
  return toDateKey(safe);
}

function buildDayRail(anchorDate: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const dateKey = addDaysIso(anchorDate, index - 2);
    const date = new Date(`${dateKey}T00:00:00`);
    return { dateKey, date };
  });
}

function requestStatusMeta(status: string | null | undefined) {
  switch ((status || "").toLowerCase()) {
    case "confirmed":
      return { label: "Richiesta confermata", className: "status-badge status-badge--success" };
    case "rejected":
      return { label: "Richiesta rigettata", className: "status-badge status-badge--danger" };
    case "pending":
    case "new":
      return { label: "Richiesta pending", className: "status-badge status-badge--pending" };
    default:
      return { label: "Richiesta non disponibile", className: "status-badge status-badge--info" };
  }
}

function occupancyTone(state: string) {
  switch (state) {
    case "semi_free":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "reserved":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "occupied":
      return "bg-rose-50 text-rose-800 border-rose-200";
    case "out_of_service":
      return "bg-slate-100 text-slate-700 border-slate-300";
    default:
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
  }
}

function occupancyLabel(state: string) {
  switch (state) {
    case "semi_free":
      return "Semi-libero";
    case "reserved":
      return "Riservato";
    case "occupied":
      return "Occupato";
    case "out_of_service":
      return "Fuori servizio";
    default:
      return "Libero";
  }
}

function emptyRoomDraft() {
  return { id: null as number | null, name: "", is_active: true };
}

function emptyTableDraft(roomId: number | null = null) {
  return {
    id: null as number | null,
    room_id: roomId ?? 0,
    name: "",
    capacity: 4,
    shape: "round",
    pos_x: 80,
    pos_y: 80,
    width: 94,
    height: 94,
    is_active: true,
    is_out_of_service: false,
  };
}

function emptyEventSeriesDraft() {
  return {
    id: null as number | null,
    name: "",
    description: "",
    recurrence_type: "weekly",
    weekday: 0 as number | null,
    specific_date: "",
    is_active: true,
    is_default: false,
    is_closed: false,
    time_slots_text: "19:30, 20:00, 20:30",
  };
}

function parseBookingSlotText(value: string) {
  return value
    .split(/[,\n;\s]+/)
    .map((item) => item.trim().slice(0, 5))
    .filter((item) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item));
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map((item) => Number(item));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function buildHalfHourSlots(start: string, end: string) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (startMinutes === null || endMinutes === null) return [];
  const resolvedEnd = endMinutes < startMinutes ? endMinutes + 1440 : endMinutes;
  const slots: string[] = [];
  for (let minute = startMinutes; minute <= resolvedEnd && slots.length < 49; minute += 30) {
    slots.push(minutesToTime(minute));
  }
  return slots;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`theme-card-muted flex items-center gap-3 rounded-[1rem] px-4 py-3 text-sm text-slate-700 ${disabled ? "opacity-60" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

export default function OrgAdminBookings() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryBookingId = parsePositiveInt(searchParams.get("bookingId"));
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [section, setSectionState] = useState<SectionTab>(normalizeSection(searchParams.get("section")));
  const [agendaMonth, setAgendaMonth] = useState(firstDayOfMonthIso(todayIso()));
  const [mapDate, setMapDate] = useState(todayIso());
  const [mapTime, setMapTime] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dayFilter, setDayFilter] = useState<DayStatusFilter>("pending");
  const [formFilter, setFormFilter] = useState<number | "">("");
  const [forms, setForms] = useState<AssociationForm[]>([]);
  const [rooms, setRooms] = useState<AssociationRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [roomDraft, setRoomDraft] = useState(emptyRoomDraft());
  const [tableDraft, setTableDraft] = useState(emptyTableDraft());
  const [roomTables, setRoomTables] = useState<AssociationRoomTable[]>([]);
  const [roomMap, setRoomMap] = useState<AssociationRoomMap | null>(null);
  const [mapTables, setMapTables] = useState<AssociationRoomTable[]>([]);
  const [selectedMapTableId, setSelectedMapTableId] = useState<number | null>(null);
  const [eventSeries, setEventSeries] = useState<OrgAdminBookingEventSeries[]>([]);
  const [eventSeriesDraft, setEventSeriesDraft] = useState(emptyEventSeriesDraft());
  const [listItems, setListItems] = useState<AssociationBooking[]>([]);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(searchParams.get("date") || todayIso());
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(queryBookingId);
  const [selectedBooking, setSelectedBooking] = useState<AssociationBooking | null>(null);
  const [isMobileAgendaViewport, setIsMobileAgendaViewport] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 720px)").matches : false,
  );
  const [requestActionState, setRequestActionState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [requestActionError, setRequestActionError] = useState<string | null>(null);
  const [requestConfirmOpen, setRequestConfirmOpen] = useState<false | "confirmed" | "pending">(false);
  const [requestRejectOpen, setRequestRejectOpen] = useState(false);
  const [assignmentRoomId, setAssignmentRoomId] = useState<number | "">("");
  const [assignmentTableId, setAssignmentTableId] = useState<number | "">("");
  const [assignmentTables, setAssignmentTables] = useState<AssociationRoomTable[]>([]);
  const [saving, setSaving] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<null | { type: "room" | "table"; id: number; name: string }>(null);
  const [managementOverlay, setManagementOverlay] = useState<BookingManagementOverlay>(null);
  
  // Manual booking creation
  const [isCreatingManual, setIsCreatingManual] = useState(false);
  const [manualDraft, setManualDraft] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    booking_date: todayIso(),
    booking_time: "20:00",
    party_size: 2,
    room_id: "" as number | "",
    table_id: "" as number | "",
    status: "confirmed",
    notes: ""
  });
  const [manualDraftTables, setManualDraftTables] = useState<AssociationRoomTable[]>([]);

  const setSection = useCallback(
    (nextSection: SectionTab) => {
      const normalizedSection = normalizeSection(nextSection);
      setSectionState(normalizedSection);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("section", normalizedSection);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const selectBooking = useCallback(
    (bookingId: number | null) => {
      setSelectedBookingId(bookingId);
      const nextParams = new URLSearchParams(searchParams);
      if (bookingId) {
        nextParams.set("bookingId", String(bookingId));
      } else {
        nextParams.delete("bookingId");
      }
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const openEventOverlay = useCallback((item?: OrgAdminBookingEventSeries) => {
    setEventSeriesDraft(item ? {
      id: item.id,
      name: item.name,
      description: item.description || "",
      recurrence_type: item.recurrence_type || "weekly",
      weekday: item.weekday,
      specific_date: item.specific_date || "",
      is_active: item.is_active,
      is_default: Boolean(item.is_default),
      is_closed: Boolean(item.is_closed),
      time_slots_text: item.time_slots.map((slot) => slot.time.slice(0, 5)).join(", "),
    } : emptyEventSeriesDraft());
    setManagementOverlay("event");
  }, []);

  const openRoomOverlay = useCallback((room?: AssociationRoom) => {
    setRoomDraft(room ? { id: room.id, name: room.name, is_active: room.is_active } : emptyRoomDraft());
    if (room) setSelectedRoomId(room.id);
    setManagementOverlay("room");
  }, []);

  const openTableOverlay = useCallback((table?: AssociationRoomTable) => {
    if (table) {
      setSelectedMapTableId(table.id);
      setSelectedRoomId(table.room_id);
      setTableDraft({
        id: table.id,
        room_id: table.room_id,
        name: table.name,
        capacity: table.capacity,
        shape: table.shape,
        pos_x: table.pos_x,
        pos_y: table.pos_y,
        width: table.width ?? 94,
        height: table.height ?? 94,
        is_active: table.is_active,
        is_out_of_service: table.is_out_of_service,
      });
    } else {
      setTableDraft(emptyTableDraft(selectedRoomId));
    }
    setManagementOverlay("table");
  }, [selectedRoomId]);

  const closeManagementOverlay = useCallback(() => setManagementOverlay(null), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 720px)");
    const handleChange = () => setIsMobileAgendaViewport(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const nextSection = normalizeSection(searchParams.get("section"));
    setSectionState((current) => (current === nextSection ? current : nextSection));
    const queryDate = searchParams.get("date");
    if (queryDate) {
      setSelectedCalendarDate((current) => (current === queryDate ? current : queryDate));
      setAgendaMonth(firstDayOfMonthIso(queryDate));
    }
    if (queryBookingId) {
      setSelectedBookingId((current) => (current === queryBookingId ? current : queryBookingId));
    }
  }, [queryBookingId, searchParams]);

  const syncMapWithBooking = useCallback(
    (booking: Pick<AssociationBooking, "room_id" | "table_id" | "booking_date" | "booking_time">) => {
      if (typeof booking.room_id === "number") {
        setSelectedRoomId(booking.room_id);
      }
      if (booking.booking_date) {
        setMapDate(booking.booking_date);
        setSelectedCalendarDate(booking.booking_date);
        setAgendaMonth(firstDayOfMonthIso(booking.booking_date));
      }
      if (booking.booking_time) {
        setMapTime(booking.booking_time.slice(0, 5));
      }
      setSelectedMapTableId(typeof booking.table_id === "number" ? booking.table_id : null);
    },
    [],
  );

  useEffect(() => {
    applySeo({
      title: "Prenotazioni & Agenda",
      description: "Agenda operativa con sale, tavoli e mappa 2D per le prenotazioni create dai form.",
      noindex: true,
    });
    void loadInitial();
  }, []);

  useEffect(() => {
    if (!locked) void loadBookings();
  }, [statusFilter, formFilter, locked]);

  useEffect(() => {
    if (!locked && selectedRoomId) void loadRoomState(selectedRoomId);
  }, [selectedRoomId, mapDate, mapTime, locked]);

  useEffect(() => {
    if (!selectedBookingId || locked) {
      setSelectedBooking(null);
      return;
    }
    fetchOrgAdminBooking(selectedBookingId)
      .then(({ booking }) => {
        setSelectedBooking(booking);
        setAssignmentRoomId(booking.room_id ?? "");
        setAssignmentTableId(booking.table_id ?? "");
        syncMapWithBooking(booking);
      })
      .catch((err) =>
        showToast({
          tone: "error",
          title: "Dettaglio non disponibile",
          message: err instanceof Error ? err.message : "Errore caricamento prenotazione.",
        }),
      );
  }, [selectedBookingId, locked, showToast, syncMapWithBooking]);

  useEffect(() => {
    if (!assignmentRoomId || typeof assignmentRoomId !== "number") {
      setAssignmentTables([]);
      setAssignmentTableId("");
      return;
    }
    const focusDate = selectedBooking?.booking_date || null;
    const focusTime = selectedBooking?.booking_time ? selectedBooking.booking_time.slice(0, 5) : null;
    const request = selectedBooking
      ? fetchOrgAdminRoomMap(assignmentRoomId, { date: focusDate, time: focusTime })
      : fetchOrgAdminRoomTables(assignmentRoomId, { includeInactive: true });
    request
      .then((payload) => setAssignmentTables("tables" in payload ? payload.tables : payload.items))
      .catch(() => setAssignmentTables([]));
  }, [assignmentRoomId, selectedBooking?.id, selectedBooking?.booking_date, selectedBooking?.booking_time]);

  useEffect(() => {
    if (!manualDraft.room_id || typeof manualDraft.room_id !== "number") {
      setManualDraftTables([]);
      setManualDraft((prev) => ({ ...prev, table_id: "" }));
      return;
    }
    fetchOrgAdminRoomTables(manualDraft.room_id, { includeInactive: false })
      .then(({ items }) => setManualDraftTables(items))
      .catch(() => setManualDraftTables([]));
  }, [manualDraft.room_id]);

  const bookingsByDay = useMemo(() => {
    const map = new Map<string, AssociationBooking[]>();
    for (const booking of listItems) {
      const dateKey = booking.booking_date || "";
      if (!dateKey) continue;
      const current = map.get(dateKey) || [];
      current.push(booking);
      map.set(dateKey, current);
    }
    for (const [key, value] of map.entries()) {
      value.sort((left, right) => {
        const leftTime = left.booking_time || "";
        const rightTime = right.booking_time || "";
        return leftTime.localeCompare(rightTime);
      });
      map.set(key, value);
    }
    return map;
  }, [listItems]);
  const visibleItems = useMemo(
    () => listItems.filter((booking) => (booking.booking_date || "").startsWith(agendaMonth.slice(0, 7))),
    [agendaMonth, listItems],
  );
  const monthOccupancy = useMemo(
    () => ({
      total: visibleItems.length,
      confirmed: visibleItems.filter((item) => item.status === "confirmed").length,
      pending: visibleItems.filter((item) => item.status === "pending" || item.status === "new").length,
      completed: visibleItems.filter((item) => item.status === "completed" || item.status === "seated").length,
    }),
    [visibleItems],
  );
  const activeDayItems = useMemo(
    () => (selectedCalendarDate ? bookingsByDay.get(selectedCalendarDate) ?? [] : []),
    [bookingsByDay, selectedCalendarDate],
  );
  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  const selectedMapTable = useMemo(
    () => mapTables.find((table) => table.id === selectedMapTableId) ?? null,
    [mapTables, selectedMapTableId],
  );
  const eventSlotRange = useMemo(() => {
    const slots = parseBookingSlotText(eventSeriesDraft.time_slots_text);
    return { start: slots[0] || "19:00", end: slots[slots.length - 1] || "23:00" };
  }, [eventSeriesDraft.time_slots_text]);

  const applyEventSlotRange = useCallback((nextRange: { start: string; end: string }) => {
    const slots = buildHalfHourSlots(nextRange.start, nextRange.end);
    if (!slots.length) return;
    setEventSeriesDraft((current) => ({ ...current, time_slots_text: slots.join(", ") }));
  }, []);

  useEffect(() => {
    if (!selectedCalendarDate) return;
    const items = bookingsByDay.get(selectedCalendarDate) ?? [];
    if (items.length === 0) {
      setSelectedBookingId(null);
      return;
    }
    if (selectedBookingId && !items.some((item) => item.id === selectedBookingId)) {
      setSelectedBookingId(null);
    }
  }, [bookingsByDay, isMobileAgendaViewport, queryBookingId, selectedBookingId, selectedCalendarDate]);

  async function loadInitial() {
    setLoading(true);
    try {
      const [formsResponse, roomsResponse, eventSeriesResponse] = await Promise.all([
        fetchOrgAdminForms(),
        fetchOrgAdminRooms({ includeInactive: true }),
        fetchOrgAdminBookingEventSeries(),
      ]);
      const nextForms = Array.isArray(formsResponse.items) ? formsResponse.items : [];
      const nextRooms = Array.isArray(roomsResponse.items) ? roomsResponse.items : [];
      setForms(nextForms.filter((item) => item.booking_enabled));
      setRooms(nextRooms);
      setEventSeries(Array.isArray(eventSeriesResponse.items) ? eventSeriesResponse.items : []);
      const firstRoom = nextRooms[0] ?? null;
      setSelectedRoomId(firstRoom?.id ?? null);
      setRoomDraft(firstRoom ? { id: firstRoom.id, name: firstRoom.name, is_active: firstRoom.is_active } : emptyRoomDraft());
      setTableDraft(emptyTableDraft(firstRoom?.id ?? null));
      setLocked(false);
      await loadBookings();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore caricamento prenotazioni.";
      const isLocked = message.toLowerCase().includes("modulo comunicazioni") || message.toLowerCase().includes("richiedono il modulo");
      setLocked(isLocked);
      if (!isLocked) {
        showToast({ tone: "error", title: "Prenotazioni non disponibili", message });
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadBookings() {
    try {
      const response = await fetchOrgAdminBookings({
        status: statusFilter || undefined,
        formId: formFilter || null,
      });
      const nextItems = Array.isArray(response.items) ? response.items : [];
      setListItems(nextItems);
      if (selectedBookingId && !nextItems.some((item) => item.id === selectedBookingId)) {
        setSelectedBookingId(null);
      }
    } catch (err) {
      showToast({
        tone: "error",
        title: "Agenda non disponibile",
        message: err instanceof Error ? err.message : "Errore caricamento prenotazioni.",
      });
    }
  }

  async function loadRoomState(roomId: number, focus?: { date?: string | null; time?: string | null }) {
    const focusDate = focus?.date ?? mapDate;
    const focusTime = focus?.time ?? mapTime;
    try {
      const [tablesResponse, mapResponse] = await Promise.all([
        fetchOrgAdminRoomTables(roomId, { includeInactive: true }),
        fetchOrgAdminRoomMap(roomId, { date: focusDate, time: focusTime || null }),
      ]);
      const nextRoomTables = Array.isArray(tablesResponse.items) ? tablesResponse.items : [];
      const nextMapTables = Array.isArray(mapResponse.tables) ? mapResponse.tables : [];
      setRoomTables(nextRoomTables);
      setRoomMap({ ...mapResponse, tables: nextMapTables });
      setMapTables(nextMapTables);
      if (nextMapTables[0] && !selectedMapTableId) setSelectedMapTableId(nextMapTables[0].id);
    } catch (err) {
      showToast({
        tone: "error",
        title: "Sala non disponibile",
        message: err instanceof Error ? err.message : "Errore caricamento sala.",
      });
    }
  }

  async function refreshRooms(nextRoomId?: number | null) {
    const { items } = await fetchOrgAdminRooms({ includeInactive: true });
    setRooms(items);
    const roomId = nextRoomId ?? (items.find((room) => room.id === selectedRoomId)?.id ?? items[0]?.id ?? null);
    setSelectedRoomId(roomId);
    const room = items.find((item) => item.id === roomId) ?? null;
    setRoomDraft(room ? { id: room.id, name: room.name, is_active: room.is_active } : emptyRoomDraft());
  }

  async function handleBookingStatus(status: string) {
    if (!selectedBookingId || !selectedBooking) return;
    const isPendingLinkedRequest = Boolean(
      selectedBooking.submission_id
        && selectedBooking.source_form?.id
        && selectedBooking.request_status === "pending",
    );
    if (isPendingLinkedRequest && status === "confirmed") {
      setRequestActionError("");
      setRequestConfirmOpen("confirmed");
      return;
    }
    if (isPendingLinkedRequest && status === "cancelled") {
      setRequestActionError("");
      setRequestRejectOpen(true);
      return;
    }
    setSaving("booking-status");
    try {
      const { booking } = await updateOrgAdminBooking(selectedBookingId, {
        status,
        room_id: selectedBooking.room_id,
        table_id: selectedBooking.table_id,
        notes: selectedBooking.notes,
      });
      setSelectedBooking(booking);
      await loadBookings();
      if (selectedRoomId) await loadRoomState(selectedRoomId);
      if (window.matchMedia("(max-width: 720px)").matches && status !== "pending" && status !== "new") {
        setDayFilter("managed");
      }
      showToast({ tone: "success", title: "Stato aggiornato", message: `Prenotazione impostata su ${status}.` });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Aggiornamento non riuscito",
        message: err instanceof Error ? err.message : "Errore aggiornamento stato prenotazione.",
      });
    } finally {
      setSaving("");
    }
  }

  async function handleRejectWithoutMessage() {
    if (!selectedBookingId) return;
    setSaving("reject-silent");
    try {
      const { booking } = await rejectOrgAdminBookingWithoutMessage(selectedBookingId);
      setSelectedBooking(booking);
      await loadBookings();
      if (window.matchMedia("(max-width: 720px)").matches) {
        setDayFilter("managed");
      }
      showToast({
        tone: "success",
        title: "Rigetto salvato",
        message: "Prenotazione annullata senza inviare messaggi al socio.",
      });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Rigetto non riuscito",
        message: err instanceof Error ? err.message : "Errore rigetto senza messaggio.",
      });
    } finally {
      setSaving("");
    }
  }

  async function handleMarkCustomerNoteRead() {
    if (!selectedBookingId) return;
    setSaving("customer-note-read");
    try {
      const { booking } = await markOrgAdminBookingCustomerNoteRead(selectedBookingId);
      setSelectedBooking(booking);
      await loadBookings();
      showToast({ tone: "success", title: "Nota gestita", message: "La nota cliente e stata segnata come letta." });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Nota non aggiornata",
        message: err instanceof Error ? err.message : "Errore aggiornamento nota cliente.",
      });
    } finally {
      setSaving("");
    }
  }

  async function handleBookingDetailsSave(payload: BookingDetailsUpdate) {
    if (!selectedBookingId || !selectedBooking) return;
    setSaving("booking-details");
    try {
      const { booking } = await updateOrgAdminBooking(selectedBookingId, {
        status: selectedBooking.status,
        room_id: selectedBooking.room_id,
        table_id: selectedBooking.table_id,
        customer_name: payload.customer_name,
        customer_email: payload.customer_email,
        customer_phone: payload.customer_phone,
        booking_date: payload.booking_date,
        booking_time: payload.booking_time,
        party_size: payload.party_size,
        notes: payload.notes,
      });
      setSelectedBooking(booking);
      syncMapWithBooking(booking);
      await loadBookings();
      const nextRoomId = booking.room_id ?? selectedRoomId;
      if (nextRoomId) {
        await loadRoomState(nextRoomId, {
          date: booking.booking_date,
          time: booking.booking_time ? booking.booking_time.slice(0, 5) : null,
        });
      }
      showToast({
        tone: "success",
        title: "Prenotazione aggiornata",
        message: "I dati principali sono stati salvati.",
      });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Modifica non riuscita",
        message: err instanceof Error ? err.message : "Errore aggiornamento prenotazione.",
      });
    } finally {
      setSaving("");
    }
  }

  async function refreshEventSeries(nextId?: number | null) {
    const response = await fetchOrgAdminBookingEventSeries();
    const items = Array.isArray(response.items) ? response.items : [];
    setEventSeries(items);
    const selected = nextId ? items.find((item) => item.id === nextId) : null;
    if (selected) {
      setEventSeriesDraft({
        id: selected.id,
        name: selected.name,
        description: selected.description || "",
        recurrence_type: selected.recurrence_type || "weekly",
        weekday: selected.weekday,
        specific_date: selected.specific_date || "",
        is_active: selected.is_active,
        is_default: Boolean(selected.is_default),
        is_closed: Boolean(selected.is_closed),
        time_slots_text: selected.time_slots.map((slot) => slot.time.slice(0, 5)).join(", "),
      });
    }
  }

  async function handleEventSeriesSave() {
    const name = eventSeriesDraft.name.trim();
    if (!name) {
      showToast({ tone: "error", title: "Nome richiesto", message: "Inserisci il nome della serata prenotabile." });
      return;
    }
    const timeSlots = eventSeriesDraft.is_closed
      ? []
      : eventSeriesDraft.time_slots_text
          .split(/[,\n;]/)
          .map((item) => item.trim())
          .filter(Boolean);
    setSaving("event-series");
    try {
      const payload = {
        name,
        description: eventSeriesDraft.description.trim() || null,
        recurrence_type: eventSeriesDraft.recurrence_type,
        weekday: eventSeriesDraft.recurrence_type === "weekly" ? eventSeriesDraft.weekday : null,
        specific_date: eventSeriesDraft.recurrence_type === "date" ? eventSeriesDraft.specific_date || null : null,
        is_active: eventSeriesDraft.is_active,
        is_default: eventSeriesDraft.is_closed ? false : eventSeriesDraft.is_default,
        is_closed: eventSeriesDraft.is_closed,
        time_slots: timeSlots,
      };
      const response = eventSeriesDraft.id
        ? await updateOrgAdminBookingEventSeries(eventSeriesDraft.id, payload)
        : await createOrgAdminBookingEventSeries(payload);
      await refreshEventSeries(response.item.id);
      setManagementOverlay(null);
      showToast({ tone: "success", title: "Serata salvata", message: "La configurazione e disponibile nei form prenotazione." });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Serata non salvata",
        message: err instanceof Error ? err.message : "Errore salvataggio serata.",
      });
    } finally {
      setSaving("");
    }
  }

  async function handleEventSeriesDelete() {
    if (!eventSeriesDraft.id) return;
    setSaving("event-series-delete");
    try {
      await deleteOrgAdminBookingEventSeries(eventSeriesDraft.id);
      setEventSeriesDraft(emptyEventSeriesDraft());
      setManagementOverlay(null);
      await refreshEventSeries();
      showToast({ tone: "success", title: "Serata eliminata", message: "La regola non comparira piu nei form." });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Eliminazione non riuscita",
        message: err instanceof Error ? err.message : "Errore eliminazione serata.",
      });
    } finally {
      setSaving("");
    }
  }

  async function handleRoomSave() {
    setSaving("room");
    try {
      if (roomDraft.id) {
        await updateOrgAdminRoom(roomDraft.id, { name: roomDraft.name, is_active: roomDraft.is_active });
      } else {
        const { room } = await createOrgAdminRoom({ name: roomDraft.name, is_active: roomDraft.is_active });
        setSelectedRoomId(room.id);
      }
      await refreshRooms(roomDraft.id ?? undefined);
      setManagementOverlay(null);
      showToast({ tone: "success", title: "Sala salvata", message: "Configurazione sala aggiornata." });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Salvataggio sala non riuscito",
        message: err instanceof Error ? err.message : "Errore salvataggio sala.",
      });
    } finally {
      setSaving("");
    }
  }

  async function handleRoomDelete() {
    if (!roomDraft.id) {
      setRoomDraft(emptyRoomDraft());
      return;
    }
    setDeleteTarget({ type: "room", id: roomDraft.id, name: roomDraft.name });
  }

  async function confirmRoomDelete() {
    if (!deleteTarget || deleteTarget.type !== "room") return;
    setSaving("room-delete");
    try {
      await deleteOrgAdminRoom(deleteTarget.id);
      setRoomDraft(emptyRoomDraft());
      setDeleteTarget(null);
      setManagementOverlay(null);
      await refreshRooms(null);
      showToast({ tone: "success", title: "Sala eliminata", message: "La sala e i suoi tavoli sono stati rimossi." });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Eliminazione non riuscita",
        message: err instanceof Error ? err.message : "Errore eliminazione sala.",
      });
    } finally {
      setSaving("");
    }
  }

  async function handleTableSave() {
    if (!tableDraft.room_id) {
      showToast({ tone: "error", title: "Seleziona una sala", message: "Ogni tavolo deve appartenere a una sala." });
      return;
    }
    setSaving("table");
    try {
      if (tableDraft.id) {
        await updateOrgAdminRoomTable(tableDraft.id, tableDraft);
      } else {
        const { table } = await createOrgAdminRoomTable(tableDraft.room_id, tableDraft);
        setSelectedMapTableId(table.id);
      }
      setSelectedRoomId(tableDraft.room_id);
      await loadRoomState(tableDraft.room_id);
      await refreshRooms(tableDraft.room_id);
      setManagementOverlay(null);
      showToast({ tone: "success", title: "Tavolo salvato", message: "Dati tavolo aggiornati." });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Salvataggio tavolo non riuscito",
        message: err instanceof Error ? err.message : "Errore salvataggio tavolo.",
      });
    } finally {
      setSaving("");
    }
  }

  async function handleTableDelete() {
    if (!tableDraft.id) {
      setTableDraft(emptyTableDraft(selectedRoomId));
      return;
    }
    setDeleteTarget({ type: "table", id: tableDraft.id, name: tableDraft.name });
  }

  async function confirmTableDelete() {
    if (!deleteTarget || deleteTarget.type !== "table") return;
    setSaving("table-delete");
    try {
      await deleteOrgAdminRoomTable(deleteTarget.id);
      setTableDraft(emptyTableDraft(selectedRoomId));
      setDeleteTarget(null);
      setManagementOverlay(null);
      if (selectedRoomId) {
        await loadRoomState(selectedRoomId);
        await refreshRooms(selectedRoomId);
      }
      showToast({ tone: "success", title: "Tavolo eliminato", message: "Il tavolo e stato rimosso dalla sala." });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Eliminazione non riuscita",
        message: err instanceof Error ? err.message : "Errore eliminazione tavolo.",
      });
    } finally {
      setSaving("");
    }
  }

  async function handleAssignmentSave() {
    if (!selectedBookingId || !assignmentRoomId || typeof assignmentRoomId !== "number") return;
    setSaving("assignment");
    try {
      const { booking } = await assignOrgAdminBookingTable(selectedBookingId, {
        room_id: assignmentRoomId,
        table_id: typeof assignmentTableId === "number" ? assignmentTableId : null,
      });
      setSelectedBooking(booking);
      syncMapWithBooking(booking);
      await loadBookings();
      await loadRoomState(assignmentRoomId, {
        date: booking.booking_date,
        time: booking.booking_time ? booking.booking_time.slice(0, 5) : null,
      });
      showToast({ tone: "success", title: "Assegnazione salvata", message: "Sala e tavolo collegati alla prenotazione." });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Assegnazione non riuscita",
        message: err instanceof Error ? err.message : "Errore assegnazione tavolo.",
      });
    } finally {
      setSaving("");
    }
  }

  async function handleAssignmentClear() {
    if (!selectedBookingId) return;
    setSaving("assignment-clear");
    try {
      const { booking } = await unassignOrgAdminBookingTable(selectedBookingId);
      setSelectedBooking(booking);
      setAssignmentRoomId("");
      setAssignmentTableId("");
      setSelectedMapTableId(null);
      await loadBookings();
      if (selectedRoomId) await loadRoomState(selectedRoomId);
      showToast({ tone: "success", title: "Assegnazione rimossa", message: "La prenotazione non ha piu sala o tavolo." });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Operazione non riuscita",
        message: err instanceof Error ? err.message : "Errore rimozione assegnazione.",
      });
    } finally {
      setSaving("");
    }
  }

  async function handleLinkedRequestDecision(
    nextStatus: "pending" | "confirmed" | "rejected",
    reason?: string,
  ) {
    if (!selectedBooking?.form_id || !selectedBooking?.submission_id) return;
    if (nextStatus === "confirmed" && !selectedBooking.table_id && rooms.some((room) => room.is_active)) {
      const fallbackRoomId = selectedBooking.room_id ?? selectedRoomId ?? rooms.find((room) => room.is_active)?.id ?? "";
      setAssignmentRoomId(fallbackRoomId);
      setRequestConfirmOpen(false);
      showToast({
        tone: "info",
        title: "Assegna prima il tavolo",
        message: "Seleziona un tavolo libero o semi-libero, salva l'assegnazione e poi conferma la richiesta.",
      });
      return;
    }
    setRequestActionState("loading");
    setRequestActionError(null);
    try {
      const response = await updateOrgAdminFormSubmissionStatus(selectedBooking.form_id, selectedBooking.submission_id, {
        status: nextStatus,
        reason: reason?.trim() || null,
        whatsapp_message: null,
      });
      const detail = await fetchOrgAdminBooking(selectedBooking.id);
      setSelectedBooking(detail.booking);
      await loadBookings();
      if (selectedRoomId) {
        await loadRoomState(selectedRoomId);
      }
      setRequestConfirmOpen(false);
      setRequestRejectOpen(false);
      if (nextStatus === "confirmed" && window.matchMedia("(max-width: 720px)").matches) {
        setDayFilter("managed");
        window.requestAnimationFrame(() => {
          document.querySelector(`[data-booking-id="${selectedBooking.id}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
        });
      } else if (nextStatus === "rejected" && window.matchMedia("(max-width: 720px)").matches) {
        setDayFilter("managed");
      } else if (nextStatus === "pending" && window.matchMedia("(max-width: 720px)").matches) {
        setDayFilter("pending");
      }
      setRequestActionState("success");
      let message = "Dettaglio prenotazione e stato della richiesta aggiornati.";
      if (response.whatsapp_result?.sent) {
        message = "Dettaglio prenotazione aggiornato e messaggio WhatsApp inviato al socio.";
      } else if (response.whatsapp_result?.error) {
        message = "Dettaglio prenotazione aggiornato, ma il messaggio WhatsApp non e partito.";
      } else if (response.whatsapp_result?.reason === "no_automations") {
        message = "Dettaglio prenotazione aggiornato. Nessun WhatsApp inviato: manca una regola attiva in WhatsApp > Automazioni per questo form.";
      } else if (response.whatsapp_result?.reason === "connection_unavailable") {
        message = "Dettaglio prenotazione aggiornato. Nessun WhatsApp inviato: connessione WhatsApp non disponibile.";
      } else if (response.whatsapp_result?.reason === "missing_phone") {
        message = "Dettaglio prenotazione aggiornato. Nessun WhatsApp inviato: numero non disponibile.";
      }
      showToast({
        tone: response.whatsapp_result?.error ? "info" : "success",
        title:
          nextStatus === "confirmed"
            ? "Richiesta confermata"
            : nextStatus === "rejected"
              ? "Richiesta rigettata"
              : "Richiesta riportata in attesa",
        message,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore aggiornamento richiesta collegata.";
      setRequestActionError(message);
      setRequestActionState("error");
      showToast({
        tone: "error",
        title: "Aggiornamento non riuscito",
        message,
      });
    } finally {
      window.setTimeout(() => setRequestActionState("idle"), 1200);
    }
  }

  async function handleMapSave() {
    if (!selectedRoomId) return;
    setSaving("map");
    try {
      await saveOrgAdminRoomMap(
        selectedRoomId,
        mapTables.map((table) => ({
          id: table.id,
          pos_x: table.pos_x,
          pos_y: table.pos_y,
          width: table.width,
          height: table.height,
        })),
      );
      await loadRoomState(selectedRoomId);
      showToast({ tone: "success", title: "Mappa salvata", message: "Le nuove coordinate tavolo sono state registrate." });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Salvataggio mappa non riuscito",
        message: err instanceof Error ? err.message : "Errore salvataggio mappa.",
      });
    } finally {
      setSaving("");
    }
  }

  function updateMapTablePosition(tableId: number, next: { pos_x: number; pos_y: number }) {
    setMapTables((current) =>
      current.map((table) =>
        table.id === tableId ? { ...table, pos_x: next.pos_x, pos_y: next.pos_y } : table,
      ),
    );
    setTableDraft((current) =>
      current.id === tableId ? { ...current, pos_x: next.pos_x, pos_y: next.pos_y } : current,
    );
  }

  async function handleManualBookingSave() {
    if (!manualDraft.customer_name.trim()) {
      showToast({ tone: "error", title: "Dati mancanti", message: "Il nome cliente e obbligatorio." });
      return;
    }
    setSaving("manual-booking");
    try {
      const { booking } = await createOrgAdminBooking({
        customer_name: manualDraft.customer_name,
        customer_email: manualDraft.customer_email || null,
        customer_phone: manualDraft.customer_phone || null,
        booking_date: manualDraft.booking_date || null,
        booking_time: manualDraft.booking_time || null,
        party_size: manualDraft.party_size || null,
        room_id: manualDraft.room_id ? Number(manualDraft.room_id) : null,
        table_id: manualDraft.table_id ? Number(manualDraft.table_id) : null,
        status: manualDraft.status,
        notes: manualDraft.notes || null,
      });
      syncMapWithBooking(booking);
      showToast({ tone: "success", title: "Prenotazione creata", message: "La prenotazione manuale e stata inserita in agenda." });
      setIsCreatingManual(false);
      setManualDraft({
        customer_name: "",
        customer_email: "",
        customer_phone: "",
        booking_date: todayIso(),
        booking_time: "20:00",
        party_size: 2,
        room_id: "",
        table_id: "",
        status: "confirmed",
        notes: ""
      });
      await loadBookings();
      if (typeof booking.room_id === "number") {
        await loadRoomState(booking.room_id);
      }
    } catch (err) {
      showToast({
        tone: "error",
        title: "Creazione non riuscita",
        message: err instanceof Error ? err.message : "Errore creazione prenotazione manuale.",
      });
    } finally {
      setSaving("");
    }
  }

  if (loading) {
    return (
      <div className="container-shell py-8 space-y-4">
        <Skeleton className="h-28 w-full rounded-[1.25rem]" />
        <Skeleton className="h-[38rem] w-full rounded-[1.25rem]" />
      </div>
    );
  }

  if (locked) {
    return (
      <div className="container-shell py-8">
        <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 px-6 py-6 text-sm text-amber-900">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-700">Modulo bloccato</p>
          <p className="mt-2">Le Prenotazioni richiedono il modulo Comunicazioni attivo.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-shell py-8 md:py-10">
      <div className="booking-admin-page mx-auto max-w-[92rem] space-y-6" data-section={section}>
        <div className="booking-admin-mobile-head">
          <div>
            <p>Prenotazioni</p>
            <h1>{sectionTabs.find((tab) => tab.key === section)?.label || "Agenda"}</h1>
          </div>
          {section === "agenda" ? (
            <button type="button" onClick={() => setIsCreatingManual(true)}>
              + Prenotazione
            </button>
          ) : null}
          {section === "events" ? (
            <button type="button" onClick={() => openEventOverlay()}>
              + Serata
            </button>
          ) : null}
          {section === "rooms" ? (
            <div className="booking-admin-mobile-head__actions">
              <button type="button" onClick={() => openRoomOverlay()}>
                + Sala
              </button>
              <button type="button" onClick={() => openTableOverlay()}>
                + Tavolo
              </button>
            </div>
          ) : null}
        </div>
        <div className="booking-admin-page-header">
          <PageHeader
            eyebrow="Prenotazioni"
            title="Agenda prenotazioni"
            subtitle="Visualizza, gestisci e organizza prenotazioni, sale e tavoli."
            actions={
              <button type="button" onClick={() => setIsCreatingManual(true)} className="btn-primary">
                + Nuova prenotazione
              </button>
            }
          />
        </div>

        <section className="booking-admin-tabs-shell rounded-[0.85rem] border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] xl:items-center">
            <nav className="booking-admin-tabs flex gap-1 overflow-x-auto rounded-[0.7rem] bg-slate-50 p-1 scrollbar-hide">
              {sectionTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSection(tab.key)}
                  className={`whitespace-nowrap rounded-[0.6rem] px-5 py-2.5 text-sm font-semibold transition ${
                    section === tab.key ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            <div className="booking-top-kpis grid gap-3 sm:grid-cols-4">
              <KpiCard label="Form booking" value={forms.length} tone="success" />
              <KpiCard label="Prenotazioni mese" value={monthOccupancy.total} tone="info" />
              <KpiCard label="Da confermare" value={monthOccupancy.pending} tone="warning" />
              <KpiCard label="Sale attive" value={rooms.filter((room) => room.is_active).length} tone="success" />
            </div>
          </div>
        </section>

        {section === "agenda" && (
          <div className="booking-admin-section booking-admin-section--agenda space-y-6">
            <AgendaSection
              agendaMonth={agendaMonth}
              setAgendaMonth={setAgendaMonth}
            isMobileAgendaViewport={isMobileAgendaViewport}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            dayFilter={dayFilter}
            setDayFilter={setDayFilter}
            formFilter={formFilter}
            setFormFilter={setFormFilter}
            forms={forms}
            bookingsByDay={bookingsByDay}
            selectedCalendarDate={selectedCalendarDate}
            setSelectedCalendarDate={setSelectedCalendarDate}
            activeDayItems={activeDayItems}
            selectedBookingId={selectedBookingId}
            setSelectedBookingId={selectBooking}
            selectedBooking={selectedBooking}
            rooms={rooms}
            assignmentRoomId={assignmentRoomId}
            setAssignmentRoomId={setAssignmentRoomId}
            assignmentTableId={assignmentTableId}
            setAssignmentTableId={setAssignmentTableId}
            assignmentTables={assignmentTables}
            onStatusChange={handleBookingStatus}
            onRejectWithoutMessage={handleRejectWithoutMessage}
            onMarkCustomerNoteRead={handleMarkCustomerNoteRead}
            onSaveDetails={handleBookingDetailsSave}
            onSaveAssignment={handleAssignmentSave}
            onClearAssignment={handleAssignmentClear}
            requestActionState={requestActionState}
            onOpenRequestConfirm={setRequestConfirmOpen}
            onOpenRequestReject={setRequestRejectOpen}
            saving={saving}
            />
          </div>
        )}

        {section === "events" && (
          <BookingEventSeriesPanel
            items={eventSeries}
            draft={eventSeriesDraft}
            setDraft={setEventSeriesDraft}
            onSave={handleEventSeriesSave}
            onDelete={handleEventSeriesDelete}
            onCreate={() => openEventOverlay()}
            onEdit={openEventOverlay}
            saving={saving}
          />
        )}

        {section === "rooms" && (
          <div className="booking-management-stack">
            <ManagementShell
              title="Sale"
              subtitle="Spazi disponibili"
              action={
                <button
                  type="button"
                  onClick={() => openRoomOverlay()}
                  className="booking-management-action"
                >
                  + Nuova sala
                </button>
              }
              main={
                <div className="booking-management-list">
                {rooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => openRoomOverlay(room)}
                    className={`booking-management-row ${roomDraft.id === room.id ? "is-selected" : ""}`}
                  >
                    <span>
                      <strong>{room.name}</strong>
                      <small>{room.is_active ? "Sala attiva" : "Sala in pausa"}</small>
                    </span>
                  </button>
                  ))
                }
              </div>
            }
            side={
              <ManagementEditorHint title="Sale" message="Tocca una sala o usa + Nuova sala per aprire l'overlay di modifica." />
            }
            />
            <ManagementShell
              title="Tavoli"
              subtitle="Capienza e stato operativo"
              action={
                <button
                  type="button"
                  onClick={() => openTableOverlay()}
                  className="booking-management-action"
                >
                  + Nuovo tavolo
                </button>
              }
              main={
                <div className="space-y-4">
                <Field label="Sala">
                  <select className={inputClass} value={selectedRoomId ?? ""} onChange={(event) => setSelectedRoomId(event.target.value ? Number(event.target.value) : null)}>
                    <option value="">Seleziona una sala</option>
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>{room.name}</option>
                    ))}
                  </select>
                </Field>
                {roomTables.length === 0 ? (
                  <EmptyState message="Nessun tavolo configurato per questa sala." />
                ) : (
                  <div className="booking-management-list">
                  {roomTables.map((table) => (
                    <button
                    key={table.id}
                    type="button"
                      onClick={() => openTableOverlay(table)}
                      className={`booking-management-row ${tableDraft.id === table.id ? "is-selected" : ""}`}
                    >
                      <span>
                        <strong>{table.name}</strong>
                        <small>{table.shape} &bull; {table.capacity} posti</small>
                      </span>
                      <em className={occupancyTone(table.occupancy_state)}>{occupancyLabel(table.occupancy_state)}</em>
                    </button>
                  ))}
                  </div>
                )}
              </div>
            }
            side={
              <ManagementEditorHint title="Tavoli" message="Tocca un tavolo o usa + Nuovo tavolo per aprire l'overlay di modifica." />
            }
            />
          </div>
        )}

        {section === "map" && (
          <section className="booking-map-section grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_380px]">
            <SectionPanel title="Mappa sala" eyebrow="Workspace operativo">
              <div className="booking-map-controls grid gap-3 md:grid-cols-3">
                <Field label="Sala">
                  <select className={inputClass} value={selectedRoomId ?? ""} onChange={(event) => setSelectedRoomId(event.target.value ? Number(event.target.value) : null)}>
                    <option value="">Seleziona una sala</option>
                    {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                  </select>
                </Field>
                <Field label="Data focus">
                  <input className={inputClass} type="date" value={mapDate} onChange={(event) => setMapDate(event.target.value)} />
                </Field>
                <Field label="Orario focus">
                  <input className={inputClass} type="time" value={mapTime} onChange={(event) => setMapTime(event.target.value)} />
                </Field>
              </div>
              <div className="booking-map-mobile-stats" aria-label="Riepilogo mappa sala">
                <span><strong>{rooms.length}</strong> Sale</span>
                <span><strong>{roomMap?.totals.tables ?? roomTables.length}</strong> Tavoli</span>
                <span><strong>{roomMap?.totals.free ?? 0}</strong> Liberi</span>
                <span><strong>{roomMap?.totals.semi_free ?? 0}</strong> Semi</span>
                <span><strong>{roomMap?.totals.occupied ?? 0}</strong> Occupati</span>
              </div>
              <div className="booking-map-kpis mt-6 grid gap-4 md:grid-cols-5">
                <KpiCard label="Sale" value={rooms.length} tone="success" />
                <KpiCard label="Tavoli" value={roomMap?.totals.tables ?? roomTables.length} tone="info" />
                <KpiCard label="Liberi" value={roomMap?.totals.free ?? 0} tone="success" />
                <KpiCard label="Semi-liberi" value={roomMap?.totals.semi_free ?? 0} tone="warning" />
                <KpiCard label="Occupati" value={roomMap?.totals.occupied ?? 0} tone="danger" />
              </div>
              <div className="booking-map-canvas-shell mt-6">
                <RoomFloorMap
                  roomName={selectedRoom?.name}
                  tables={mapTables}
                  editable
                  selectedTableId={selectedMapTableId}
                  onSelectTable={(table) => setSelectedMapTableId(table.id)}
                  onMoveTable={updateMapTablePosition}
                />
              </div>
            </SectionPanel>
            <aside className="booking-map-side-panels space-y-4">
              <div className="surface-strong rounded-[1.25rem] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Legenda</p>
                <div className="mt-4 space-y-3">
                  {["free", "semi_free", "occupied", "out_of_service"].map((state) => (
                    <div key={state} className={`rounded-[1rem] border px-3 py-3 text-sm font-semibold ${occupancyTone(state)}`}>{occupancyLabel(state)}</div>
                  ))}
                </div>
                <button type="button" onClick={handleMapSave} disabled={saving === "map" || !selectedRoomId} className="btn-primary mt-4 w-full !rounded-[1rem] !px-4 !py-2.5 text-sm font-semibold">
                  Salva posizione tavoli
                </button>
              </div>
              <div className="surface-strong rounded-[1.25rem] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Tavolo selezionato</p>
                {selectedMapTable ? (
                  <div className="mt-4 space-y-2 text-sm text-slate-700">
                    <p className="text-lg font-semibold text-slate-950">{selectedMapTable.name}</p>
                    <p>{selectedMapTable.shape} - {selectedMapTable.capacity} posti</p>
                    <p>Stato: {occupancyLabel(selectedMapTable.occupancy_state)}</p>
                    <p>Posti: {selectedMapTable.occupied_seats ?? 0}/{selectedMapTable.capacity} occupati, {selectedMapTable.remaining_seats ?? selectedMapTable.capacity} residui</p>
                    <p>Coordinate: {selectedMapTable.pos_x} / {selectedMapTable.pos_y}</p>
                    <p>Booking live: {selectedMapTable.active_booking?.customer_name || "Nessuno"}</p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">Seleziona un tavolo dalla mappa.</p>
                )}
              </div>
            </aside>
          </section>
        )}
      </div>

      <ModalShell open={isCreatingManual} onClose={() => setIsCreatingManual(false)} title="Nuova prenotazione">
        <form onSubmit={(e) => { e.preventDefault(); void handleManualBookingSave(); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nome cliente *">
              <input 
                className={inputClass} 
                value={manualDraft.customer_name} 
                onChange={(e) => setManualDraft({...manualDraft, customer_name: e.target.value})} 
                required
              />
            </Field>
            <Field label="Numero persone">
              <input 
                type="number" 
                min="1" 
                className={inputClass} 
                value={manualDraft.party_size} 
                onChange={(e) => setManualDraft({...manualDraft, party_size: parseInt(e.target.value) || 1})} 
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Data">
              <input 
                type="date" 
                className={inputClass} 
                value={manualDraft.booking_date} 
                onChange={(e) => setManualDraft({...manualDraft, booking_date: e.target.value})} 
              />
            </Field>
            <Field label="Orario">
              <input 
                type="time" 
                className={inputClass} 
                value={manualDraft.booking_time} 
                onChange={(e) => setManualDraft({...manualDraft, booking_time: e.target.value})} 
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Telefono">
              <input 
                className={inputClass} 
                value={manualDraft.customer_phone} 
                onChange={(e) => setManualDraft({...manualDraft, customer_phone: e.target.value})} 
              />
            </Field>
            <Field label="Email">
              <input 
                type="email" 
                className={inputClass} 
                value={manualDraft.customer_email} 
                onChange={(e) => setManualDraft({...manualDraft, customer_email: e.target.value})} 
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Sala">
              <select 
                className={inputClass} 
                value={manualDraft.room_id} 
                onChange={(e) => setManualDraft({...manualDraft, room_id: e.target.value ? Number(e.target.value) : ""})}
              >
                <option value="">Nessuna sala</option>
                {rooms.map(room => (
                  <option key={room.id} value={room.id}>{room.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Tavolo">
              <select 
                className={inputClass} 
                value={manualDraft.table_id} 
                onChange={(e) => setManualDraft({...manualDraft, table_id: e.target.value ? Number(e.target.value) : ""})}
                disabled={!manualDraft.room_id || manualDraftTables.length === 0}
              >
                <option value="">Nessun tavolo</option>
                {manualDraftTables.map(table => (
                  <option key={table.id} value={table.id}>{table.name} ({table.capacity} posti)</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Stato">
            <select 
              className={inputClass} 
              value={manualDraft.status} 
              onChange={(e) => setManualDraft({...manualDraft, status: e.target.value})}
            >
              {bookingStatuses.map((status) => (
                <option key={status} value={status}>{formatStatusLabel(status)}</option>
              ))}
            </select>
          </Field>

          <Field label="Note">
            <textarea 
              className={`${inputClass} min-h-[80px]`} 
              value={manualDraft.notes} 
              onChange={(e) => setManualDraft({...manualDraft, notes: e.target.value})} 
            />
          </Field>

          <div className="flex justify-end gap-3 border-t ring-slate-200/60 pt-4">
            <button 
              type="button" 
              onClick={() => setIsCreatingManual(false)} 
              className="btn-ghost !rounded-xl !px-4 !py-2 text-sm font-semibold"
            >
              Annulla
            </button>
            <button 
              type="submit" 
              disabled={saving === "manual-booking"}
              className="btn-primary"
            >
              {saving === "manual-booking" ? "Salvataggio..." : "Crea prenotazione"}
            </button>
          </div>
        </form>
      </ModalShell>
      <ModalShell
        open={managementOverlay === "event"}
        onClose={closeManagementOverlay}
        title={eventSeriesDraft.id ? "Modifica serata" : "Nuova serata"}
        description="Imposta nome, data e orari prenotabili. I form leggono subito questa configurazione."
        sizeClassName="max-w-2xl"
        contentClassName="p-5 max-h-[86vh] overflow-y-auto"
      >
        <div className="booking-overlay-form">
          <Field label="Nome serata">
            <input
              className={inputClass}
              value={eventSeriesDraft.name}
              onChange={(event) => setEventSeriesDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Cartomante"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo regola">
              <select
                className={inputClass}
                value={eventSeriesDraft.recurrence_type}
                onChange={(event) => setEventSeriesDraft((current) => ({ ...current, recurrence_type: event.target.value, weekday: 0, specific_date: "" }))}
              >
                <option value="weekly">Settimanale</option>
                <option value="date">Data specifica</option>
              </select>
            </Field>
            {eventSeriesDraft.recurrence_type === "weekly" ? (
              <Field label="Giorno">
                <select
                  className={inputClass}
                  value={eventSeriesDraft.weekday ?? 0}
                  onChange={(event) => setEventSeriesDraft((current) => ({ ...current, weekday: Number(event.target.value) }))}
                >
                  {weekdayOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Data">
                <input
                  className={inputClass}
                  type="date"
                  value={eventSeriesDraft.specific_date}
                  onChange={(event) => setEventSeriesDraft((current) => ({ ...current, specific_date: event.target.value }))}
                />
              </Field>
            )}
          </div>
          <Field label="Orari disponibili">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Dalle
                <input
                  className={`${inputClass} !mt-1 !py-2`}
                  type="time"
                  step={1800}
                  disabled={eventSeriesDraft.is_closed}
                  value={eventSlotRange.start}
                  onChange={(event) => applyEventSlotRange({ ...eventSlotRange, start: event.target.value })}
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Alle
                <input
                  className={`${inputClass} !mt-1 !py-2`}
                  type="time"
                  step={1800}
                  disabled={eventSeriesDraft.is_closed}
                  value={eventSlotRange.end}
                  onChange={(event) => applyEventSlotRange({ ...eventSlotRange, end: event.target.value })}
                />
              </label>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Modifica manuale slot</summary>
              <textarea
                className={`${inputClass} mt-3 min-h-[90px]`}
                disabled={eventSeriesDraft.is_closed}
                value={eventSeriesDraft.time_slots_text}
                onChange={(event) => setEventSeriesDraft((current) => ({ ...current, time_slots_text: event.target.value }))}
                placeholder="19:30, 20:00, 20:30"
              />
            </details>
          </Field>
          <Field label="Descrizione">
            <textarea
              className={`${inputClass} min-h-[82px]`}
              value={eventSeriesDraft.description}
              onChange={(event) => setEventSeriesDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder="Note visibili all'organizzazione"
            />
          </Field>
          <Toggle
            label="Serata attiva nei form pubblici"
            checked={eventSeriesDraft.is_active}
            onChange={(checked) => setEventSeriesDraft((current) => ({ ...current, is_active: checked }))}
          />
          <Toggle
            label="Giorno di chiusura"
            checked={eventSeriesDraft.is_closed}
            onChange={(checked) => setEventSeriesDraft((current) => ({ ...current, is_closed: checked, is_default: checked ? false : current.is_default }))}
          />
          <Toggle
            label="Usa come default quando non ci sono eventi per data e orario scelti"
            checked={eventSeriesDraft.is_default && !eventSeriesDraft.is_closed}
            onChange={(checked) => setEventSeriesDraft((current) => ({ ...current, is_default: checked }))}
            disabled={eventSeriesDraft.is_closed}
          />
          <ActionRow
            primaryLabel="Salva serata"
            secondaryLabel={eventSeriesDraft.id ? "Elimina" : "Annulla"}
            onPrimary={handleEventSeriesSave}
            onSecondary={eventSeriesDraft.id ? handleEventSeriesDelete : closeManagementOverlay}
            busy={saving.startsWith("event-series")}
          />
        </div>
      </ModalShell>
      <ModalShell
        open={managementOverlay === "room"}
        onClose={closeManagementOverlay}
        title={roomDraft.id ? "Modifica sala" : "Nuova sala"}
        description="Nome e stato operativo della sala."
        sizeClassName="max-w-lg"
        contentClassName="p-5 max-h-[86vh] overflow-y-auto"
      >
        <div className="booking-overlay-form">
          <Field label="Nome sala">
            <input className={inputClass} value={roomDraft.name} onChange={(event) => setRoomDraft((current) => ({ ...current, name: event.target.value }))} />
          </Field>
          <Toggle label="Sala attiva per agenda e assegnazioni" checked={roomDraft.is_active} onChange={(checked) => setRoomDraft((current) => ({ ...current, is_active: checked }))} />
          <ActionRow
            primaryLabel="Salva sala"
            secondaryLabel={roomDraft.id ? "Elimina" : "Annulla"}
            onPrimary={handleRoomSave}
            onSecondary={roomDraft.id ? handleRoomDelete : closeManagementOverlay}
            busy={saving.startsWith("room")}
          />
        </div>
      </ModalShell>
      <ModalShell
        open={managementOverlay === "table"}
        onClose={closeManagementOverlay}
        title={tableDraft.id ? "Modifica tavolo" : "Nuovo tavolo"}
        description="Capienza, forma e stato del tavolo."
        sizeClassName="max-w-lg"
        contentClassName="p-5 max-h-[86vh] overflow-y-auto"
      >
        <div className="booking-overlay-form">
          <Field label="Sala">
            <select className={inputClass} value={tableDraft.room_id || ""} onChange={(event) => setTableDraft((current) => ({ ...current, room_id: event.target.value ? Number(event.target.value) : 0 }))}>
              <option value="">Seleziona sala</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>{room.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Nome tavolo">
            <input className={inputClass} value={tableDraft.name} onChange={(event) => setTableDraft((current) => ({ ...current, name: event.target.value }))} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Capienza">
              <input className={inputClass} type="number" min={1} value={tableDraft.capacity} onChange={(event) => setTableDraft((current) => ({ ...current, capacity: Number(event.target.value) || 1 }))} />
            </Field>
            <Field label="Forma">
              <select className={inputClass} value={tableDraft.shape} onChange={(event) => setTableDraft((current) => ({ ...current, shape: event.target.value }))}>
                <option value="round">Round</option>
                <option value="square">Square</option>
                <option value="rectangle">Rectangle</option>
              </select>
            </Field>
          </div>
          <Toggle label="Tavolo attivo" checked={tableDraft.is_active} onChange={(checked) => setTableDraft((current) => ({ ...current, is_active: checked }))} />
          <Toggle label="Fuori servizio" checked={tableDraft.is_out_of_service} onChange={(checked) => setTableDraft((current) => ({ ...current, is_out_of_service: checked }))} />
          <ActionRow
            primaryLabel="Salva tavolo"
            secondaryLabel={tableDraft.id ? "Elimina" : "Annulla"}
            onPrimary={handleTableSave}
            onSecondary={tableDraft.id ? handleTableDelete : closeManagementOverlay}
            busy={saving.startsWith("table")}
          />
        </div>
      </ModalShell>
      <SubmissionDecisionModal
        open={requestConfirmOpen === "confirmed"}
        mode="confirmed"
        title="Confermare la richiesta collegata?"
        description="La richiesta passa a confermata. Gli eventuali WhatsApp al socio partono solo dalle regole configurate in WhatsApp > Automazioni."
        confirmLabel="Conferma richiesta"
        confirmState={requestActionState}
        error={requestActionError}
        onClose={() => {
          if (requestActionState === "loading") return;
          setRequestConfirmOpen(false);
          setRequestActionError(null);
        }}
        onConfirm={() => void handleLinkedRequestDecision("confirmed")}
      />
      <ConfirmModal
        open={requestConfirmOpen === "pending"}
        title="Riportare la richiesta collegata in attesa?"
        description="La review verra rimossa e la richiesta tornera nello stato pending."
        confirmLabel="Riporta a pending"
        confirmState={requestActionState}
        onClose={() => {
          if (requestActionState === "loading") return;
          setRequestConfirmOpen(false);
          setRequestActionError(null);
        }}
        onConfirm={() => void handleLinkedRequestDecision("pending")}
      />
      <SubmissionDecisionModal
        open={requestRejectOpen}
        mode="rejected"
        title="Rigettare la richiesta collegata?"
        description="Il motivo viene salvato nell'audit. Gli eventuali WhatsApp di rigetto partono solo dalle regole configurate in WhatsApp > Automazioni."
        confirmLabel="Rigetta richiesta"
        confirmState={requestActionState}
        error={requestActionError}
        onClose={() => {
          if (requestActionState === "loading") return;
          setRequestRejectOpen(false);
          setRequestActionError(null);
        }}
        onConfirm={(values) => void handleLinkedRequestDecision("rejected", values.reason)}
      />
      <ConfirmModal
        open={deleteTarget?.type === "room"}
        title={DESTRUCTIVE_ACTION_COPY.deleteRoom.title}
        description="La sala verra rimossa dall'area prenotazioni insieme ai tavoli collegati."
        objectName={formatActionObject(deleteTarget?.name, "Sala selezionata")}
        impact="Controlla di non avere prenotazioni operative collegate prima di procedere."
        confirmLabel={DESTRUCTIVE_ACTION_COPY.deleteRoom.confirmLabel}
        tone="danger"
        confirmState={saving === "room-delete" ? "loading" : "idle"}
        requireCheckbox
        checkboxLabel="Confermo l'eliminazione della sala e dei tavoli collegati"
        onClose={() => {
          if (saving === "room-delete") return;
          setDeleteTarget(null);
        }}
        onConfirm={() => void confirmRoomDelete()}
      />
      <ConfirmModal
        open={deleteTarget?.type === "table"}
        title={DESTRUCTIVE_ACTION_COPY.deleteTable.title}
        description="Il tavolo verra rimosso dalla sala e non sara piu selezionabile sulla mappa."
        objectName={formatActionObject(deleteTarget?.name, "Tavolo selezionato")}
        impact="Le prenotazioni gia salvate manterranno lo storico, ma il tavolo non sara piu assegnabile."
        confirmLabel={DESTRUCTIVE_ACTION_COPY.deleteTable.confirmLabel}
        tone="danger"
        confirmState={saving === "table-delete" ? "loading" : "idle"}
        onClose={() => {
          if (saving === "table-delete") return;
          setDeleteTarget(null);
        }}
        onConfirm={() => void confirmTableDelete()}
      />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[1.25rem] bg-slate-50 p-8 text-center ring-1 ring-inset ring-slate-200/60 border-dashed shadow-sm">
      <p className="text-sm font-medium text-slate-500">{message}</p>
    </div>
  );
}

function ActionRow({ primaryLabel, secondaryLabel, onPrimary, onSecondary, busy }: { primaryLabel: string; secondaryLabel: string; onPrimary: () => void; onSecondary: () => void; busy: boolean; }) {
  return (
    <div className="flex gap-3 pt-4 border-t border-slate-100">
      <button type="button" onClick={onPrimary} disabled={busy} className="btn-primary flex-1 !rounded-full text-sm font-semibold">
        {primaryLabel}
      </button>
      <button type="button" onClick={onSecondary} disabled={busy} className="btn-secondary !rounded-full px-5 text-sm font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50">
        {secondaryLabel}
      </button>
    </div>
  );
}

function ManagementEditorHint({ title, message }: { title: string; message: string }) {
  return (
    <div className="booking-management-editor-hint">
      <p>{title}</p>
      <span>{message}</span>
    </div>
  );
}

function ManagementShell({
  title,
  subtitle,
  main,
  side,
  action,
}: {
  title: string;
  subtitle?: string;
  main: React.ReactNode;
  side: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_360px]">
      <div className="rounded-[1.25rem] bg-slate-50 p-8 ring-1 ring-inset ring-slate-200/60 shadow-sm">
        <div className="booking-management-head">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{title}</p>
            {subtitle ? <h2 className="mt-2 text-2xl font-light tracking-tight text-slate-900">{subtitle}</h2> : null}
          </div>
          {action ? <div className="booking-management-head__action">{action}</div> : null}
        </div>
        <div className="mt-8">{main}</div>
      </div>
      <aside className="rounded-[1.25rem] bg-slate-50/50 p-6 ring-1 ring-inset ring-slate-200/60 h-fit sticky top-6">
        {side}
      </aside>
    </section>
  );
}

function AgendaSection(props: {
  agendaMonth: string;
  setAgendaMonth: (value: string) => void;
  isMobileAgendaViewport: boolean;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  dayFilter: DayStatusFilter;
  setDayFilter: (value: DayStatusFilter) => void;
  formFilter: number | "";
  setFormFilter: (value: number | "") => void;
  forms: AssociationForm[];
  bookingsByDay: Map<string, AssociationBooking[]>;
  selectedCalendarDate: string | null;
  setSelectedCalendarDate: (value: string | null) => void;
  activeDayItems: AssociationBooking[];
  selectedBookingId: number | null;
  setSelectedBookingId: (id: number | null) => void;
  selectedBooking: AssociationBooking | null;
  rooms: AssociationRoom[];
  assignmentRoomId: number | "";
  setAssignmentRoomId: (value: number | "") => void;
  assignmentTableId: number | "";
  setAssignmentTableId: (value: number | "") => void;
  assignmentTables: AssociationRoomTable[];
  onStatusChange: (status: string) => void;
  onRejectWithoutMessage: () => void;
  onMarkCustomerNoteRead: () => void;
  onSaveDetails: (payload: BookingDetailsUpdate) => void;
  onSaveAssignment: () => void;
  onClearAssignment: () => void;
  requestActionState: "idle" | "loading" | "success" | "error";
  onOpenRequestConfirm: (value: false | "confirmed" | "pending") => void;
  onOpenRequestReject: (value: boolean) => void;
  saving: string;
}) {
  const activeDayIsToday = props.selectedCalendarDate === todayIso();
  const mobileActionDayItems = props.activeDayItems;
  const dayPending = props.activeDayItems.filter(isPendingBookingRequest).length;
  const dayCovers = props.activeDayItems.reduce((total, item) => total + (item.party_size || 0), 0);
  const filteredDayItems = mobileActionDayItems.filter((booking) => matchesDayStatusFilter(booking, props.dayFilter));
  const selectedDateKey = props.selectedCalendarDate || todayIso();
  const dayRail = useMemo(() => buildDayRail(selectedDateKey), [selectedDateKey]);
  const selectedDayItems = props.bookingsByDay.get(selectedDateKey) ?? [];
  const selectedDayPending = selectedDayItems.filter(isPendingBookingRequest).length;
  const selectedDayConfirmed = selectedDayItems.filter((item) => item.status === "confirmed").length;
  const selectDay = (dateKey: string, expandFirstBooking = false) => {
    const items = props.bookingsByDay.get(dateKey) ?? [];
    props.setSelectedCalendarDate(dateKey);
    props.setSelectedBookingId(expandFirstBooking ? items[0]?.id ?? null : null);
    props.setAgendaMonth(firstDayOfMonthIso(dateKey));
    if (window.matchMedia("(max-width: 720px)").matches) {
      window.requestAnimationFrame(() => {
        document.querySelector(".booking-day-panel")?.scrollIntoView({ block: "start", behavior: "auto" });
      });
    }
  };

  return (
    <section className="booking-agenda-stack space-y-8">
        <div className="booking-request-workbench">
          <div className="booking-day-rail" aria-label="Giorni agenda">
            {dayRail.map(({ dateKey, date }) => {
              const items = props.bookingsByDay.get(dateKey) ?? [];
              const isSelected = dateKey === selectedDateKey;
              const isToday = dateKey === todayIso();
              return (
                <button
                  key={dateKey}
                  type="button"
                  className={`booking-day-rail__item ${isSelected ? "is-selected" : ""}`}
                  onClick={() => selectDay(dateKey, true)}
                >
                  <span>{date.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "")}</span>
                  <strong>{date.getDate()}</strong>
                  <small>{date.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}</small>
                  {isToday ? <em>Oggi</em> : null}
                  {items.length > 0 ? <b>{items.length}</b> : null}
                </button>
              );
            })}
          </div>
          <div className="booking-request-strip">
            <div>
              <p>Richieste prenotazione</p>
              <strong>
                {selectedDayPending}/{selectedDayItems.length || 0}
              </strong>
            </div>
            <div className="booking-request-strip__rooms">
              <span>{selectedDayConfirmed} confermate</span>
              <span>{selectedDayPending} in attesa</span>
              <span>{selectedDayItems.reduce((total, item) => total + (item.party_size || 0), 0)} persone</span>
            </div>
          </div>
        </div>

        <div className="booking-agenda-toolbar">
          <div className="booking-agenda-toolbar__day">
            <button type="button" aria-label="Giorno precedente" onClick={() => selectDay(addDaysIso(selectedDateKey, -1))}>
              &lsaquo;
            </button>
            <input
              type="date"
              aria-label="Scegli giorno agenda"
              value={selectedDateKey}
              onChange={(event) => {
                if (event.target.value) selectDay(event.target.value);
              }}
            />
            {!activeDayIsToday ? (
              <button type="button" onClick={() => selectDay(todayIso())}>
                Oggi
              </button>
            ) : null}
            <button type="button" aria-label="Giorno successivo" onClick={() => selectDay(addDaysIso(selectedDateKey, 1))}>
              &rsaquo;
            </button>
          </div>
          <div className="booking-agenda-toolbar__filters">
            <select value={props.statusFilter} onChange={(event) => props.setStatusFilter(event.target.value)}>
              <option value="">Tutti gli stati</option>
              {bookingStatuses.map((status) => <option key={status} value={status}>{formatStatusLabel(status)}</option>)}
            </select>
            <select value={props.formFilter} onChange={(event) => props.setFormFilter(event.target.value ? Number(event.target.value) : "")}>
              <option value="">Tutti i form</option>
              {props.forms.map((form) => <option key={form.id} value={form.id}>{form.title}</option>)}
            </select>
          </div>
        </div>

        {props.selectedCalendarDate ? (
          <section className="booking-day-panel" aria-live="polite">
            <header className="booking-day-panel__header">
              <div>
                <p className="booking-day-panel__eyebrow">{formatDate(props.selectedCalendarDate)}</p>
                <h2 className="booking-day-panel__title">
                  <span className="booking-day-panel__title-desktop">Prenotazioni</span>
                  <span className="booking-day-panel__title-mobile">
                    {formatMobileDayTitle(props.selectedCalendarDate)}
                  </span>
                </h2>
              </div>
              <div className="booking-mobile-day-rail" aria-label="Giorni agenda">
                {dayRail.map(({ dateKey, date }) => {
                  const items = props.bookingsByDay.get(dateKey) ?? [];
                  const isSelected = dateKey === selectedDateKey;
                  const isToday = dateKey === todayIso();
                  return (
                    <button
                      key={dateKey}
                      type="button"
                      className={`booking-mobile-day-rail__item ${isSelected ? "is-selected" : ""}`}
                      onClick={() => selectDay(dateKey, true)}
                    >
                      <span>{date.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "")}</span>
                      <strong>{date.getDate()}</strong>
                      <small>{date.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}</small>
                      {isToday ? <em>Oggi</em> : null}
                      {items.length > 0 ? <b>{items.length}</b> : null}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="booking-day-panel__close"
                aria-label="Chiudi dettaglio giornata"
                onClick={() => {
                  props.setSelectedCalendarDate(null);
                  props.setSelectedBookingId(null);
                }}
              >
                X
              </button>
            </header>

            <div className="booking-day-panel__stats">
              <span>{props.activeDayItems.length} totali</span>
              <span>{dayPending} da confermare</span>
              <span>{dayCovers} coperti</span>
            </div>

              <div className="booking-day-panel__filters" role="tablist" aria-label="Filtra prenotazioni del giorno">
                {dayStatusFilters.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    role="tab"
                    aria-selected={props.dayFilter === filter.key}
                    aria-controls="booking-day-list-panel"
                    id={`booking-day-filter-${filter.key}`}
                    className={props.dayFilter === filter.key ? "is-active" : ""}
                    onClick={() => props.setDayFilter(filter.key)}
                  >
                    {filter.label}
                    {props.isMobileAgendaViewport ? (
                      <span>
                        {filter.key === "pending"
                          ? props.activeDayItems.filter(isPendingBookingRequest).length
                          : filter.key === "managed"
                            ? props.activeDayItems.filter((item) => !isPendingBookingRequest(item)).length
                            : filter.key === "all"
                              ? props.activeDayItems.length
                              : props.activeDayItems.filter((item) => matchesDayStatusFilter(item, filter.key)).length}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>

            <div
              className="booking-day-list"
              id="booking-day-list-panel"
              role="tabpanel"
              aria-labelledby={props.isMobileAgendaViewport ? undefined : `booking-day-filter-${props.dayFilter}`}
            >
              {filteredDayItems.length === 0 ? (
                <EmptyState
                  message={
                    props.isMobileAgendaViewport
                      ? props.dayFilter === "pending"
                        ? "Nessuna richiesta da confermare."
                        : "Nessuna prenotazione in questo filtro."
                      : "Nessuna prenotazione in questo filtro."
                  }
                />
              ) : (
                filteredDayItems.map((booking) => {
                  const isExpanded = props.selectedBookingId === booking.id;
                  const isDetailLoaded = props.selectedBooking?.id === booking.id;
                  return (
                    <DayBookingRow
                      key={booking.id}
                      booking={booking}
                      expanded={isExpanded}
                      selectedBooking={isDetailLoaded ? props.selectedBooking : null}
                      onSelect={() => props.setSelectedBookingId(isExpanded ? null : booking.id)}
                      detail={
                        isDetailLoaded ? (
                          <BookingDetailPanel
                            selectedBooking={props.selectedBooking}
                            rooms={props.rooms}
                            assignmentRoomId={props.assignmentRoomId}
                            setAssignmentRoomId={props.setAssignmentRoomId}
                            assignmentTableId={props.assignmentTableId}
                            setAssignmentTableId={props.setAssignmentTableId}
                            assignmentTables={props.assignmentTables}
                            onStatusChange={props.onStatusChange}
                            onRejectWithoutMessage={props.onRejectWithoutMessage}
                            onMarkCustomerNoteRead={props.onMarkCustomerNoteRead}
                            onSaveDetails={props.onSaveDetails}
                            onSaveAssignment={props.onSaveAssignment}
                            onClearAssignment={props.onClearAssignment}
                            requestActionState={props.requestActionState}
                            onOpenRequestConfirm={props.onOpenRequestConfirm}
                            onOpenRequestReject={props.onOpenRequestReject}
                            saving={props.saving}
                            mobileOnly={props.isMobileAgendaViewport}
                          />
                        ) : (
                          <div className="booking-row-loading">Caricamento dettaglio...</div>
                        )
                      }
                    />
                  );
                })
              )}
            </div>
          </section>
        ) : null}

      </section>
  );
}

function BookingEventSeriesPanel(props: {
  items: OrgAdminBookingEventSeries[];
  draft: ReturnType<typeof emptyEventSeriesDraft>;
  setDraft: (value: ReturnType<typeof emptyEventSeriesDraft> | ((current: ReturnType<typeof emptyEventSeriesDraft>) => ReturnType<typeof emptyEventSeriesDraft>)) => void;
  onSave: () => void;
  onDelete: () => void;
  onCreate: () => void;
  onEdit: (item: OrgAdminBookingEventSeries) => void;
  saving: string;
}) {
  const weekdayOptions = [
    { value: 0, label: "Lunedi" },
    { value: 1, label: "Martedi" },
    { value: 2, label: "Mercoledi" },
    { value: 3, label: "Giovedi" },
    { value: 4, label: "Venerdi" },
    { value: 5, label: "Sabato" },
    { value: 6, label: "Domenica" },
  ];
  return (
    <ManagementShell
      title="Serate"
      subtitle="Date, serate e orari"
      action={
        <button type="button" className="booking-management-action booking-management-action--desktop-only" onClick={props.onCreate}>
          + Nuova serata
        </button>
      }
      main={
        <div className="booking-management-list">
          {props.items.length === 0 ? (
            <EmptyState message="Nessuna serata configurata." />
          ) : (
            props.items.map((item) => {
              const selected = props.draft.id === item.id;
              const when = item.recurrence_type === "date"
                ? item.specific_date || "Data specifica"
                : weekdayOptions.find((option) => option.value === item.weekday)?.label || "Settimanale";
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`booking-management-row ${selected ? "is-selected" : ""}`}
                  onClick={() => props.onEdit(item)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">{item.name}</p>
                      <p className={`mt-1 text-sm ${selected ? "text-slate-300" : "text-slate-500"}`}>
                        {when} - {item.is_closed ? "Chiuso" : item.time_slots.map((slot) => slot.time.slice(0, 5)).join(", ") || "Nessuno slot"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {item.is_closed ? (
                        <span className="rounded-full bg-rose-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-rose-700">
                          Chiusura
                        </span>
                      ) : null}
                      {item.is_default ? (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">
                          Default
                        </span>
                      ) : null}
                      <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
                        item.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                      }`}>
                        {item.is_active ? "Attiva" : "Pausa"}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      }
      side={
        <ManagementEditorHint title="Serate" message="Tocca una serata o usa + Nuova serata per aprire l'overlay di modifica." />
      }
    />
  );
}

function DayBookingRow({
  booking,
  expanded,
  selectedBooking,
  onSelect,
  detail,
}: {
  booking: AssociationBooking;
  expanded: boolean;
  selectedBooking: AssociationBooking | null;
  onSelect: () => void;
  detail: React.ReactNode;
}) {
  const isFormRequest = isFormLinkedBooking(booking);
  const displayName = bookingDisplayName(booking);
  return (
    <article className={`booking-day-row ${bookingCardToneClass(booking)} ${expanded ? "is-expanded" : ""}`} data-booking-id={booking.id}>
      <button type="button" className="booking-day-row__summary" onClick={onSelect} aria-expanded={expanded}>
        <span className="booking-day-row__avatar">{initialsFromName(displayName)}</span>
        <span className="booking-day-row__main">
          <span className="booking-day-row__topline">
            <span>{booking.party_size || "-"} pax</span>
            <span>{(booking.booking_time || "--:--").slice(0, 5)}</span>
            {isFormRequest ? <span className="booking-day-row__form-icon" title="Richiesta da form" aria-label="Richiesta da form" /> : null}
          </span>
          <span className="booking-day-row__name-line">
            <span className="booking-day-row__name">{displayName}</span>
            <ReminderResponseIndicator booking={booking} />
            {isFormRequest ? <span className="booking-day-row__request-badge">Richiesta form</span> : null}
          </span>
          <span className="booking-day-row__meta">
            {formatBookingTable(booking)}
          </span>
          {expanded && selectedBooking ? (
            <span className="booking-day-row__contact">{selectedBooking.customer_email || selectedBooking.customer_phone || "Contatto non disponibile"}</span>
          ) : null}
        </span>
        <span className="booking-day-row__side">
          <span className={bookingStatusDotClass(booking.status)} aria-hidden="true" />
          <span className={bookingStatusChipClass(booking.status)}>{formatStatusLabel(booking.status)}</span>
          <span className="booking-day-row__pax">- {booking.party_size || "-"} pax</span>
        </span>
        <span className="booking-day-row__chevron" aria-hidden="true">v</span>
      </button>
      <div className="booking-day-row__expanded" aria-hidden={!expanded}>{expanded ? detail : null}</div>
    </article>
  );
}

type BookingDetailsDraft = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  booking_date: string;
  booking_time: string;
  party_size: string;
  notes: string;
};

function bookingDetailsDraftFromBooking(booking: AssociationBooking): BookingDetailsDraft {
  return {
    customer_name: booking.customer_name || "",
    customer_email: booking.customer_email || "",
    customer_phone: booking.customer_phone || "",
    booking_date: booking.booking_date || "",
    booking_time: booking.booking_time ? booking.booking_time.slice(0, 5) : "",
    party_size: booking.party_size ? String(booking.party_size) : "",
    notes: booking.notes || "",
  };
}

function BookingQuickEdit(props: {
  booking: AssociationBooking;
  onSave: (payload: BookingDetailsUpdate) => void;
  saving: boolean;
  defaultOpen?: boolean;
}) {
  const [draft, setDraft] = useState<BookingDetailsDraft>(() => bookingDetailsDraftFromBooking(props.booking));
  const [open, setOpen] = useState(Boolean(props.defaultOpen));
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(bookingDetailsDraftFromBooking(props.booking));
    setOpen(Boolean(props.defaultOpen));
    setError("");
  }, [
    props.booking.id,
    props.booking.customer_name,
    props.booking.customer_email,
    props.booking.customer_phone,
    props.booking.booking_date,
    props.booking.booking_time,
    props.booking.party_size,
    props.booking.notes,
    props.defaultOpen,
  ]);

  const normalizedPartySize = draft.party_size.trim() ? Number(draft.party_size) : null;
  const changed = (
    draft.customer_name.trim() !== (props.booking.customer_name || "")
    || (draft.customer_email.trim() || null) !== (props.booking.customer_email || null)
    || (draft.customer_phone.trim() || null) !== (props.booking.customer_phone || null)
    || (draft.booking_date || null) !== (props.booking.booking_date || null)
    || (draft.booking_time || null) !== (props.booking.booking_time ? props.booking.booking_time.slice(0, 5) : null)
    || normalizedPartySize !== (props.booking.party_size || null)
    || (draft.notes.trim() || null) !== (props.booking.notes || null)
  );

  function updateDraft(field: keyof BookingDetailsDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function saveDetails() {
    const customerName = draft.customer_name.trim();
    if (!customerName) {
      setError("Inserisci il nome della prenotazione.");
      return;
    }
    if (draft.party_size.trim() && (!Number.isInteger(normalizedPartySize) || Number(normalizedPartySize) < 1)) {
      setError("Inserisci un numero persone valido.");
      return;
    }
    setError("");
    props.onSave({
      customer_name: customerName,
      customer_email: draft.customer_email.trim() || null,
      customer_phone: draft.customer_phone.trim() || null,
      booking_date: draft.booking_date || null,
      booking_time: draft.booking_time || null,
      party_size: normalizedPartySize,
      notes: draft.notes.trim() || null,
    });
  }

  const editBody = (
    <>
      <div className="booking-quick-edit__grid">
        <label>
          <span>Nome</span>
          <input className={inputClass} value={draft.customer_name} onChange={(event) => updateDraft("customer_name", event.target.value)} />
        </label>
        <label>
          <span>Email</span>
          <input className={inputClass} type="email" value={draft.customer_email} onChange={(event) => updateDraft("customer_email", event.target.value)} />
        </label>
        <label>
          <span>Numero</span>
          <input className={inputClass} type="tel" value={draft.customer_phone} onChange={(event) => updateDraft("customer_phone", event.target.value)} placeholder="+39 333 0000000" />
        </label>
        <label>
          <span>Giorno</span>
          <input className={inputClass} type="date" value={draft.booking_date} onChange={(event) => updateDraft("booking_date", event.target.value)} />
        </label>
        <label>
          <span>Orario</span>
          <input className={inputClass} type="time" step={300} value={draft.booking_time} onChange={(event) => updateDraft("booking_time", event.target.value)} />
        </label>
        <label>
          <span>Persone</span>
          <input className={inputClass} type="number" min={1} value={draft.party_size} onChange={(event) => updateDraft("party_size", event.target.value)} />
        </label>
        <label className="booking-quick-edit__notes">
          <span>Note interne</span>
          <textarea className={`${inputClass} min-h-[82px]`} value={draft.notes} onChange={(event) => updateDraft("notes", event.target.value)} />
        </label>
      </div>
      {error ? <p className="booking-quick-edit__error">{error}</p> : null}
      <button type="button" onClick={saveDetails} disabled={props.saving || !changed}>
        {props.saving ? "Salvataggio..." : "Salva modifiche"}
      </button>
    </>
  );

  if (props.defaultOpen) {
    return (
      <section className="booking-quick-edit booking-quick-edit--inline">
        <div className="booking-quick-edit__inline-head">
          <span>Dettagli prenotazione</span>
          <small>{formatDateTime(props.booking.booking_date, props.booking.booking_time)} - {props.booking.party_size || "-"} pax</small>
        </div>
        {editBody}
      </section>
    );
  }

  return (
    <details className="booking-quick-edit" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span>Modifica prenotazione</span>
        <small>{formatDateTime(props.booking.booking_date, props.booking.booking_time)} - {props.booking.party_size || "-"} pax</small>
      </summary>
      {editBody}
    </details>
  );
}

function BookingServiceStatusControls(props: {
  booking: AssociationBooking;
  onStatusChange: (status: string) => void;
  saving: boolean;
  compact?: boolean;
}) {
  return (
    <div className={props.compact ? "booking-service-status-panel booking-service-status-panel--compact" : "booking-service-status-panel"}>
      <p>Stato servizio</p>
      <div className="booking-service-status-grid">
        {bookingStatuses.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => props.onStatusChange(status)}
            disabled={props.saving}
            aria-pressed={props.booking.status === status}
            aria-label={formatServiceStatusLabel(status)}
            title={formatServiceStatusLabel(status)}
            className={`booking-service-status-button ${status === "no_show" ? "is-wide" : ""} ${
              props.booking.status === status ? "is-active" : ""
            }`}
          >
            {serviceStatusButtonLabel(status)}
          </button>
        ))}
      </div>
      <div className="booking-inline-actions">
        <button
          type="button"
          className="booking-inline-action"
          disabled={props.saving || props.booking.status === "completed"}
          onClick={() => props.onStatusChange("completed")}
        >
          Completa
        </button>
      </div>
    </div>
  );
}

function BookingAssignmentPicker(props: {
  rooms: AssociationRoom[];
  assignmentRoomId: number | "";
  setAssignmentRoomId: (value: number | "") => void;
  assignmentTableId: number | "";
  setAssignmentTableId: (value: number | "") => void;
  assignmentTables: AssociationRoomTable[];
  compact?: boolean;
}) {
  const selectRoom = (roomId: number | "") => {
    props.setAssignmentRoomId(roomId);
    props.setAssignmentTableId("");
  };
  return (
    <div className={props.compact ? "booking-assignment-picker booking-assignment-picker--compact" : "booking-assignment-picker"}>
      <div className="booking-assignment-picker__rail" aria-label="Scegli sala">
        <button
          type="button"
          className={props.assignmentRoomId === "" ? "is-selected" : ""}
          onClick={() => selectRoom("")}
        >
          Non assegnato
        </button>
        {props.rooms.map((room) => (
          <button
            key={room.id}
            type="button"
            className={props.assignmentRoomId === room.id ? "is-selected" : ""}
            onClick={() => selectRoom(room.id)}
          >
            {room.name}
          </button>
        ))}
      </div>
      {props.assignmentRoomId ? (
        <div className="booking-assignment-picker__tables" aria-label="Scegli tavolo">
          <button
            type="button"
            className={props.assignmentTableId === "" ? "is-selected" : ""}
            onClick={() => props.setAssignmentTableId("")}
          >
            Solo sala
          </button>
          {props.assignmentTables.map((table) => {
            const disabled =
              !table.is_active
              || table.is_out_of_service
              || (table.occupancy_state === "occupied" && props.assignmentTableId !== table.id);
            return (
              <button
                key={table.id}
                type="button"
                className={props.assignmentTableId === table.id ? "is-selected" : ""}
                disabled={disabled}
                onClick={() => props.setAssignmentTableId(table.id)}
              >
                <strong>{table.name}</strong>
                <span>{table.occupied_seats ?? 0}/{table.capacity} posti</span>
                <em>{occupancyLabel(table.occupancy_state)}{table.occupancy_state === "semi_free" ? ` - ${table.remaining_seats ?? 0} residui` : ""}</em>
                {disabled ? <em>Non disponibile</em> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function BookingDetailPanel(props: {
  selectedBooking: AssociationBooking | null;
  rooms: AssociationRoom[];
  assignmentRoomId: number | "";
  setAssignmentRoomId: (value: number | "") => void;
  assignmentTableId: number | "";
  setAssignmentTableId: (value: number | "") => void;
  assignmentTables: AssociationRoomTable[];
  onStatusChange: (status: string) => void;
  onRejectWithoutMessage: () => void;
  onMarkCustomerNoteRead: () => void;
  onSaveDetails: (payload: BookingDetailsUpdate) => void;
  onSaveAssignment: () => void;
  onClearAssignment: () => void;
  requestActionState: "idle" | "loading" | "success" | "error";
  onOpenRequestConfirm: (value: false | "confirmed" | "pending") => void;
  onOpenRequestReject: (value: boolean) => void;
  saving: string;
  mobileOnly?: boolean;
}) {
  if (!props.selectedBooking) {
    return <div className="rounded-[0.85rem] border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-500">Seleziona una prenotazione dal calendario per vedere dettaglio, stato e assegnazione tavolo.</div>;
  }

  const requestMeta = requestStatusMeta(props.selectedBooking.request_status);
  const requestPayloadSummary = props.selectedBooking.request_payload_summary ?? [];
  const compactRequestFields = requestPayloadSummary
    .filter((field) => !isBookingRequestFactField(field))
    .slice(0, 4);
  const contactLabel = props.selectedBooking.customer_phone ? "Telefono" : props.selectedBooking.customer_email ? "Email" : "";
  const contactValue = props.selectedBooking.customer_phone || props.selectedBooking.customer_email || "";
  const showMobileLinkedRequestOnly = Boolean(props.mobileOnly && props.selectedBooking.submission_id);
  const showMobileAssignment = Boolean(
    showMobileLinkedRequestOnly
      && (props.selectedBooking.request_status === "confirmed"
        || props.selectedBooking.status === "confirmed"
        || props.selectedBooking.status === "seated"
        || props.selectedBooking.status === "completed"),
  );
  const mobileCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showMobileLinkedRequestOnly || showMobileAssignment || !mobileCardRef.current) return;
    window.requestAnimationFrame(() => {
      mobileCardRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }, [props.selectedBooking.id, showMobileAssignment, showMobileLinkedRequestOnly]);

  return (
    <div className="space-y-6">
      {props.selectedBooking.submission_id ? (
        <div ref={mobileCardRef} className="booking-request-mobile-card">
          <div className="booking-request-mobile-card__header">
            <div>
              <p className="booking-request-mobile-card__eyebrow">Richiesta form</p>
              <h3>{props.selectedBooking.customer_name}</h3>
              <p>{props.selectedBooking.source_form?.title || "Form prenotazione"}</p>
            </div>
            <span className={requestMeta.className}>{requestMeta.label}</span>
          </div>

          <BookingServiceStatusControls
            booking={props.selectedBooking}
            onStatusChange={props.onStatusChange}
            saving={props.saving === "booking-status"}
            compact
          />

          <div className="booking-request-mobile-card__facts">
            <span>
              <small>Quando</small>
              <strong>{formatDateTime(props.selectedBooking.booking_date, props.selectedBooking.booking_time)}</strong>
            </span>
            <span>
              <small>Persone</small>
              <strong>{props.selectedBooking.party_size || "-"}</strong>
            </span>
            {props.selectedBooking.event_summary ? (
              <span>
                <small>Serata</small>
                <strong>{props.selectedBooking.event_summary}</strong>
              </span>
            ) : null}
            {contactValue ? (
              <span>
                <small>{contactLabel}</small>
                <strong>{contactValue}</strong>
              </span>
            ) : null}
          </div>

          <BookingQuickEdit
            booking={props.selectedBooking}
            onSave={props.onSaveDetails}
            saving={props.saving === "booking-details"}
            defaultOpen={Boolean(props.mobileOnly)}
          />

          {showMobileAssignment ? (
            <div className="booking-request-mobile-card__assignment">
              <div className="booking-request-mobile-card__assignment-head">
                <div>
                  <small>Assegnazione</small>
                  <strong>{formatBookingTable(props.selectedBooking)}</strong>
                </div>
                {props.selectedBooking.table?.name ? (
                  <button
                    type="button"
                    disabled={props.saving === "assignment-clear"}
                    onClick={props.onClearAssignment}
                  >
                    Rimuovi
                  </button>
                ) : null}
              </div>
              {props.rooms.length === 0 ? (
                <a className="booking-request-mobile-card__assignment-empty" href="/org-admin/prenotazioni?section=rooms">
                  Crea prima una sala e i tavoli
                </a>
              ) : (
                <>
                  <BookingAssignmentPicker
                    rooms={props.rooms}
                    assignmentRoomId={props.assignmentRoomId}
                    setAssignmentRoomId={props.setAssignmentRoomId}
                    assignmentTableId={props.assignmentTableId}
                    setAssignmentTableId={props.setAssignmentTableId}
                    assignmentTables={props.assignmentTables}
                    compact
                  />
                  <button
                    type="button"
                    className="booking-request-mobile-card__assignment-save"
                    disabled={!props.assignmentRoomId || props.saving.startsWith("assignment")}
                    onClick={props.onSaveAssignment}
                  >
                    {props.saving === "assignment" ? "Salvataggio..." : "Salva tavolo"}
                  </button>
                </>
              )}
            </div>
          ) : null}

          {props.selectedBooking.customer_note ? (
            <div className={`booking-request-mobile-card__reason ${props.selectedBooking.has_unreviewed_customer_note ? "is-unread-note" : ""}`}>
              <strong>Nota cliente</strong>
              <span>{props.selectedBooking.customer_note}</span>
              {props.selectedBooking.has_unreviewed_customer_note ? (
                <button
                  type="button"
                  disabled={props.saving === "customer-note-read"}
                  onClick={props.onMarkCustomerNoteRead}
                >
                  Segna gestita
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="booking-request-mobile-card__actions">
            {props.selectedBooking.request_status !== "confirmed" ? (
              <button
                type="button"
                className="booking-request-mobile-card__confirm"
                disabled={props.requestActionState === "loading"}
                onClick={() => props.onOpenRequestConfirm("confirmed")}
              >
                Conferma
              </button>
            ) : null}
            {props.selectedBooking.request_status !== "rejected" ? (
              <button
                type="button"
                className="booking-request-mobile-card__reject"
                disabled={props.requestActionState === "loading"}
                onClick={() => props.onOpenRequestReject(true)}
              >
                Rigetta
              </button>
            ) : null}
            {props.selectedBooking.request_status !== "rejected" && props.selectedBooking.status !== "cancelled" ? (
              <button
                type="button"
                className="booking-request-mobile-card__reject"
                disabled={props.saving === "reject-silent"}
                onClick={props.onRejectWithoutMessage}
              >
                Rifiuta senza messaggio
              </button>
            ) : null}
            <a
              className="booking-request-mobile-card__link"
              href={`/org-admin/comunicazioni?tab=moduli&formId=${props.selectedBooking.form_id}&formTab=responses`}
            >
              Moduli
            </a>
          </div>

          {compactRequestFields.length > 0 ? (
            <div className="booking-request-mobile-card__fields">
              {compactRequestFields.map((field) => (
                <span key={`${field.key}-${field.label}`}>
                  <small>{field.label}</small>
                  <strong>{field.value}</strong>
                </span>
              ))}
            </div>
          ) : null}

          {props.selectedBooking.request_review_summary?.review_reason ? (
            <div className="booking-request-mobile-card__reason">
              {props.selectedBooking.request_review_summary.review_reason}
            </div>
          ) : null}
        </div>
      ) : null}

      {!showMobileLinkedRequestOnly ? (
      <>
      <div className="booking-detail-full-card rounded-[1.25rem] bg-slate-50 p-6 ring-1 ring-inset ring-slate-200/60 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Prenotazione</p>
            <p className="mt-2 text-2xl font-light tracking-tight text-slate-900">{props.selectedBooking.customer_name}</p>
            <p className="mt-1 text-sm text-slate-500">{props.selectedBooking.customer_email || props.selectedBooking.customer_phone || "Contatto non disponibile"}</p>
          </div>
          <span className={bookingStatusChipClass(props.selectedBooking.status)}>{formatStatusLabel(props.selectedBooking.status)}</span>
        </div>
        <div className="mt-4">
          <BookingQuickEdit
            booking={props.selectedBooking}
            onSave={props.onSaveDetails}
            saving={props.saving === "booking-details"}
            defaultOpen={Boolean(props.mobileOnly)}
          />
        </div>
        <div className="mt-4">
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200/60 text-sm text-slate-700">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Quando</p>
            <p className="mt-2 font-medium text-slate-900">{formatDateTime(props.selectedBooking.booking_date, props.selectedBooking.booking_time)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200/60 text-sm text-slate-700">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Persone</p>
            <p className="mt-2 font-medium text-slate-900">{props.selectedBooking.party_size || "-"}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200/60 text-sm text-slate-700">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Form origine</p>
            <p className="mt-2 font-medium text-slate-900">{props.selectedBooking.source_form?.title || "N/D"}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200/60 text-sm text-slate-700">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Assegnazione attuale</p>
            <p className="mt-2 font-medium text-slate-900">{props.selectedBooking.room?.name || "Sala da assegnare"} &bull; {props.selectedBooking.table?.name || "Tavolo da assegnare"}</p>
          </div>
        </div>
        {props.selectedBooking.notes ? (
          <div className="mt-4 rounded-xl bg-amber-50/50 p-4 ring-1 ring-inset ring-amber-500/20 text-sm text-amber-900">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">Note interne</p>
            <p className="mt-2 leading-relaxed font-medium">{props.selectedBooking.notes}</p>
          </div>
        ) : null}
        {props.selectedBooking.customer_note ? (
          <div className={`mt-4 rounded-xl p-4 text-sm ring-1 ring-inset ${
            props.selectedBooking.has_unreviewed_customer_note
              ? "bg-yellow-50 text-yellow-950 ring-yellow-500/30"
              : "bg-slate-50 text-slate-700 ring-slate-200/80"
          }`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Nota cliente</p>
                <p className="mt-2 leading-relaxed font-medium">{props.selectedBooking.customer_note}</p>
              </div>
              {props.selectedBooking.has_unreviewed_customer_note ? (
                <button
                  type="button"
                  className="btn-secondary !px-4 !py-2 !text-sm"
                  disabled={props.saving === "customer-note-read"}
                  onClick={props.onMarkCustomerNoteRead}
                >
                  Segna gestita
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {props.selectedBooking.submission_id ? (
        <div className="booking-request-linked-card rounded-[1.25rem] bg-slate-50 p-6 ring-1 ring-inset ring-slate-200/60 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Richiesta collegata</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{requestMeta.label}</p>
              <p className="mt-1 text-sm text-slate-500">
                Submission #{props.selectedBooking.submission_id}
                {props.selectedBooking.request_review_summary?.reviewed_at
                  ? ` - ${formatDateTime(props.selectedBooking.request_review_summary.reviewed_at)}`
                  : ""}
              </p>
            </div>
            <span className={requestMeta.className}>{requestMeta.label}</span>
          </div>
          {props.selectedBooking.request_review_summary?.review_reason ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-700">Motivo rigetto</p>
              <p className="mt-2 leading-6">{props.selectedBooking.request_review_summary.review_reason}</p>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              className="btn-secondary !px-4 !py-2 !text-sm"
              href={`/org-admin/comunicazioni?tab=moduli&formId=${props.selectedBooking.form_id}&formTab=responses`}
            >
              Apri in Moduli
            </a>
            {props.selectedBooking.request_status !== "confirmed" ? (
              <button
                type="button"
                className="btn-success"
                disabled={props.requestActionState === "loading"}
                onClick={() => props.onOpenRequestConfirm("confirmed")}
              >
                Conferma richiesta
              </button>
            ) : null}
            {props.selectedBooking.request_status !== "rejected" ? (
              <button
                type="button"
                className="btn-danger"
                disabled={props.requestActionState === "loading"}
                onClick={() => props.onOpenRequestReject(true)}
              >
                Rigetta richiesta
              </button>
            ) : null}
            {props.selectedBooking.request_status !== "rejected" && props.selectedBooking.status !== "cancelled" ? (
              <button
                type="button"
                className="btn-secondary"
                disabled={props.saving === "reject-silent"}
                onClick={props.onRejectWithoutMessage}
              >
                Rifiuta senza messaggio
              </button>
            ) : null}
            {props.selectedBooking.request_status !== "pending" && props.selectedBooking.request_status !== "new" ? (
              <button
                type="button"
                className="btn-secondary"
                disabled={props.requestActionState === "loading"}
                onClick={() => props.onOpenRequestConfirm("pending")}
              >
                Riporta a pending
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <BookingServiceStatusControls
        booking={props.selectedBooking}
        onStatusChange={props.onStatusChange}
        saving={props.saving === "booking-status"}
      />

      <div className="rounded-[1.25rem] bg-slate-50/50 p-6 ring-1 ring-inset ring-slate-200/60">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4">Assegna sala e tavolo</p>
        <BookingAssignmentPicker
          rooms={props.rooms}
          assignmentRoomId={props.assignmentRoomId}
          setAssignmentRoomId={props.setAssignmentRoomId}
          assignmentTableId={props.assignmentTableId}
          setAssignmentTableId={props.setAssignmentTableId}
          assignmentTables={props.assignmentTables}
        />
        <div className="mt-6">
          <ActionRow primaryLabel="Salva assegnazione" secondaryLabel="Rimuovi" onPrimary={props.onSaveAssignment} onSecondary={props.onClearAssignment} busy={props.saving.startsWith("assignment")} />
        </div>
      </div>
      </>
      ) : null}
    </div>
  );
}
