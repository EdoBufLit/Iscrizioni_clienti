import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  assignOrgAdminBookingTable,
  createOrgAdminBooking,
  createOrgAdminRoom,
  createOrgAdminRoomTable,
  deleteOrgAdminRoom,
  deleteOrgAdminRoomTable,
  fetchOrgAdminBooking,
  fetchOrgAdminBookings,
  fetchOrgAdminForms,
  fetchOrgAdminRoomMap,
  fetchOrgAdminRooms,
  fetchOrgAdminRoomTables,
  saveOrgAdminRoomMap,
  unassignOrgAdminBookingTable,
  updateOrgAdminFormSubmissionStatus,
  updateOrgAdminBooking,
  updateOrgAdminRoom,
  updateOrgAdminRoomTable,
  type AssociationBooking,
  type AssociationForm,
  type AssociationRoom,
  type AssociationRoomMap,
  type AssociationRoomTable,
} from "../../lib/api";
import { applySeo } from "../../lib/seo";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ModalShell from "../../components/ui/ModalShell";
import Skeleton from "../../components/ui/Skeleton";
import SubmissionDecisionModal from "../../components/ui/SubmissionDecisionModal";
import { useToast } from "../../components/ui/ToastProvider";
import { RoomFloorMap } from "../../components/bookings/RoomFloorMap";
import { KpiCard, PageHeader, SectionPanel } from "./components/OrgAdminPrimitives";

type SectionTab = "agenda" | "rooms" | "tables" | "map";
type DayStatusFilter = "all" | "pending" | "confirmed" | "seated" | "completed";

const bookingStatuses = ["new", "pending", "confirmed", "seated", "completed", "cancelled", "no_show"];
const dayStatusFilters: Array<{ key: DayStatusFilter; label: string }> = [
  { key: "all", label: "Tutte" },
  { key: "confirmed", label: "Confermata" },
  { key: "pending", label: "In attesa" },
  { key: "seated", label: "Seduta" },
  { key: "completed", label: "Completata" },
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
  { key: "rooms", label: "Sale", hint: "Spazi disponibili" },
  { key: "tables", label: "Tavoli", hint: "Capienza e stato" },
  { key: "map", label: "Mappa sala", hint: "Piantina 2D" },
];

function normalizeSection(value: string | null | undefined): SectionTab {
  if (value === "rooms" || value === "tables" || value === "map" || value === "agenda") return value;
  return "agenda";
}

const inputClass =
  "theme-input mt-1 w-full rounded-[1rem] px-3.5 py-2.5 text-sm";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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
  if (!dateValue) return timeValue || "Da definire";
  const date = new Date(dateValue);
  const label = Number.isNaN(date.getTime())
    ? dateValue
    : date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  return timeValue ? `${label} - ${timeValue}` : label;
}

function formatMonthLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

function formatWeekdayCell(value: Date) {
  return value.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "");
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
      return "✓";
    case "cancelled":
      return "×";
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
  return booking.status === filter;
}

function initialsFromName(value: string | null | undefined) {
  const parts = (value || "?").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatBookingTable(booking: Pick<AssociationBooking, "room" | "table">) {
  if (booking.table?.name) return `Tavolo ${booking.table.name}`;
  if (booking.room?.name) return booking.room.name;
  return "Non assegnato";
}

function shiftMonth(value: string, delta: number) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return firstDayOfMonthIso();
  date.setMonth(date.getMonth() + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function setMonthYear(value: string, year: number, monthIndex: number) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return firstDayOfMonthIso();
  date.setFullYear(year);
  date.setMonth(monthIndex);
  date.setDate(1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function buildMonthGrid(monthValue: string) {
  const monthStart = new Date(`${monthValue}T00:00:00`);
  if (Number.isNaN(monthStart.getTime())) return [] as Date[];
  const gridStart = new Date(monthStart);
  const weekday = (monthStart.getDay() + 6) % 7;
  gridStart.setDate(monthStart.getDate() - weekday);
  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + index);
    return current;
  });
}

function toDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function isSameMonth(date: Date, monthValue: string) {
  return toDateKey(date).startsWith(monthValue.slice(0, 7));
}

function defaultBookingDecisionMessage(status: "confirmed" | "rejected") {
  if (status === "confirmed") {
    return "Ciao {{nome_contatto}}, la tua prenotazione per {{nome_associazione}} e confermata. Dettagli: {{riepilogo_prenotazione}}.";
  }
  return "Ciao {{nome_contatto}}, la tua prenotazione per {{nome_associazione}} non puo essere confermata. {{motivo_rigetto}}";
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
    case "reserved":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "occupied":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "out_of_service":
      return "bg-slate-100 text-slate-700 border-slate-300";
    default:
      return "bg-sky-50 text-sky-700 border-sky-200";
  }
}

function occupancyLabel(state: string) {
  switch (state) {
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

function MetricBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.25rem] bg-slate-50 p-5 ring-1 ring-inset ring-slate-200/60 transition-all hover:bg-slate-100/50">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-light tracking-tight text-slate-900">{value}</p>
    </div>
  );
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
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="theme-card-muted flex items-center gap-3 rounded-[1rem] px-4 py-3 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

export default function OrgAdminBookings() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [section, setSectionState] = useState<SectionTab>(normalizeSection(searchParams.get("section")));
  const [agendaMonth, setAgendaMonth] = useState(firstDayOfMonthIso(todayIso()));
  const [mapDate, setMapDate] = useState(todayIso());
  const [mapTime, setMapTime] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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
  const [listItems, setListItems] = useState<AssociationBooking[]>([]);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<AssociationBooking | null>(null);
  const [requestActionState, setRequestActionState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [requestActionError, setRequestActionError] = useState<string | null>(null);
  const [requestConfirmOpen, setRequestConfirmOpen] = useState<false | "confirmed" | "pending">(false);
  const [requestRejectOpen, setRequestRejectOpen] = useState(false);
  const [assignmentRoomId, setAssignmentRoomId] = useState<number | "">("");
  const [assignmentTableId, setAssignmentTableId] = useState<number | "">("");
  const [assignmentTables, setAssignmentTables] = useState<AssociationRoomTable[]>([]);
  const [saving, setSaving] = useState("");
  
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
      setSectionState(nextSection);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("section", nextSection);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    const nextSection = normalizeSection(searchParams.get("section"));
    setSectionState((current) => (current === nextSection ? current : nextSection));
  }, [searchParams]);

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
    fetchOrgAdminRoomTables(assignmentRoomId, { includeInactive: true })
      .then(({ items }) => setAssignmentTables(items))
      .catch(() => setAssignmentTables([]));
  }, [assignmentRoomId]);

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

  const monthGrid = useMemo(() => buildMonthGrid(agendaMonth), [agendaMonth]);
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
  const agendaMonthDate = useMemo(() => new Date(`${agendaMonth}T00:00:00`), [agendaMonth]);
  const agendaYearOptions = useMemo(() => {
    const centerYear = Number.isNaN(agendaMonthDate.getTime()) ? new Date().getFullYear() : agendaMonthDate.getFullYear();
    return Array.from({ length: 9 }, (_, index) => centerYear - 4 + index);
  }, [agendaMonthDate]);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  const selectedMapTable = useMemo(
    () => mapTables.find((table) => table.id === selectedMapTableId) ?? null,
    [mapTables, selectedMapTableId],
  );

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
  }, [bookingsByDay, selectedBookingId, selectedCalendarDate]);

  async function loadInitial() {
    setLoading(true);
    try {
      const [formsResponse, roomsResponse] = await Promise.all([
        fetchOrgAdminForms(),
        fetchOrgAdminRooms({ includeInactive: true }),
      ]);
      const nextForms = Array.isArray(formsResponse.items) ? formsResponse.items : [];
      const nextRooms = Array.isArray(roomsResponse.items) ? roomsResponse.items : [];
      setForms(nextForms.filter((item) => item.booking_enabled));
      setRooms(nextRooms);
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

  async function loadRoomState(roomId: number) {
    try {
      const [tablesResponse, mapResponse] = await Promise.all([
        fetchOrgAdminRoomTables(roomId, { includeInactive: true }),
        fetchOrgAdminRoomMap(roomId, { date: mapDate, time: mapTime || null }),
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
    setSaving("room-delete");
    try {
      await deleteOrgAdminRoom(roomDraft.id);
      setRoomDraft(emptyRoomDraft());
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
    setSaving("table-delete");
    try {
      await deleteOrgAdminRoomTable(tableDraft.id);
      setTableDraft(emptyTableDraft(selectedRoomId));
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
      await loadRoomState(assignmentRoomId);
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
    whatsappMessage?: string,
  ) {
    if (!selectedBooking?.form_id || !selectedBooking?.submission_id) return;
    setRequestActionState("loading");
    setRequestActionError(null);
    try {
      const response = await updateOrgAdminFormSubmissionStatus(selectedBooking.form_id, selectedBooking.submission_id, {
        status: nextStatus,
        reason: reason?.trim() || null,
        whatsapp_message: whatsappMessage?.trim() || null,
      });
      const detail = await fetchOrgAdminBooking(selectedBooking.id);
      setSelectedBooking(detail.booking);
      await loadBookings();
      if (selectedRoomId) {
        await loadRoomState(selectedRoomId);
      }
      setRequestConfirmOpen(false);
      setRequestRejectOpen(false);
      setRequestActionState("success");
      let message = "Dettaglio prenotazione e stato richiesta aggiornati.";
      if (response.whatsapp_result?.sent) {
        message = "Dettaglio prenotazione aggiornato e messaggio WhatsApp inviato al socio.";
      } else if (response.whatsapp_result?.error) {
        message = "Dettaglio prenotazione aggiornato, ma il messaggio WhatsApp non e partito.";
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
      showToast({ tone: "error", title: "Dati mancanti", message: "Il nome cliente è obbligatorio." });
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
      showToast({ tone: "success", title: "Prenotazione creata", message: "La prenotazione manuale è stata inserita in agenda." });
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
      <div className="mx-auto max-w-[92rem] space-y-6">
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

        <section className="rounded-[0.85rem] border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] xl:items-center">
            <nav className="flex gap-1 overflow-x-auto rounded-[0.7rem] bg-slate-50 p-1 scrollbar-hide">
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
            <div className="grid gap-3 sm:grid-cols-4">
              <KpiCard label="Form booking" value={forms.length} tone="success" />
              <KpiCard label="Prenotazioni mese" value={monthOccupancy.total} tone="info" />
              <KpiCard label="Da confermare" value={monthOccupancy.pending} tone="warning" />
              <KpiCard label="Sale attive" value={rooms.filter((room) => room.is_active).length} tone="success" />
            </div>
          </div>
        </section>

        {section === "agenda" && (
          <div className="space-y-6">
            <AgendaSection
              agendaMonth={agendaMonth}
              setAgendaMonth={setAgendaMonth}
            agendaYearOptions={agendaYearOptions}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            formFilter={formFilter}
            setFormFilter={setFormFilter}
            forms={forms}
            monthGrid={monthGrid}
            bookingsByDay={bookingsByDay}
            monthOccupancy={monthOccupancy}
            selectedCalendarDate={selectedCalendarDate}
            setSelectedCalendarDate={setSelectedCalendarDate}
            activeDayItems={activeDayItems}
            selectedBookingId={selectedBookingId}
            setSelectedBookingId={setSelectedBookingId}
            selectedBooking={selectedBooking}
            rooms={rooms}
            assignmentRoomId={assignmentRoomId}
            setAssignmentRoomId={setAssignmentRoomId}
            assignmentTableId={assignmentTableId}
            setAssignmentTableId={setAssignmentTableId}
            assignmentTables={assignmentTables}
            onStatusChange={handleBookingStatus}
            onSaveAssignment={handleAssignmentSave}
            onClearAssignment={handleAssignmentClear}
            requestActionState={requestActionState}
            onOpenRequestConfirm={setRequestConfirmOpen}
            onOpenRequestReject={setRequestRejectOpen}
            saving={saving}
            />
          </div>
        )}

        {section === "rooms" && (
          <ManagementShell
            title="Sale"
            subtitle="Spazi disponibili per il servizio"
            main={
              <div className="grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRoomId(null);
                    setRoomDraft(emptyRoomDraft());
                  }}
                  className={`rounded-[1.25rem] p-6 text-center transition-all min-h-[140px] flex flex-col items-center justify-center ${
                    !roomDraft.id && !selectedRoomId
                      ? "bg-slate-900 text-white shadow-md scale-[1.02]"
                      : "bg-slate-50/50 ring-1 ring-inset ring-slate-200/60 border-dashed hover:-translate-y-1 hover:shadow-sm hover:bg-slate-50"
                  }`}
                >
                  <p className="font-medium text-lg">+ Aggiungi nuova sala</p>
                </button>
                {rooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => {
                      setSelectedRoomId(room.id);
                      setRoomDraft({ id: room.id, name: room.name, is_active: room.is_active });
                    }}
                    className={`rounded-[1.25rem] p-6 text-left transition-all ${
                      roomDraft.id === room.id ? "bg-slate-900 text-white shadow-md scale-[1.02]" : "bg-slate-50 ring-1 ring-inset ring-slate-200/60 hover:-translate-y-1 hover:shadow-sm hover:bg-slate-50"
                    }`}
                  >
                    <p className="text-xl font-medium tracking-tight">{room.name}</p>
                    <p className={`mt-2 text-sm ${roomDraft.id === room.id ? "text-slate-300" : "text-slate-500"}`}>
                      {room.is_active ? "Sala attiva" : "Sala in pausa"}
                    </p>
                  </button>
                  ))
                }
              </div>
            }
            side={
              <div className="space-y-3">
                <Field label="Nome sala">
                  <input className={inputClass} value={roomDraft.name} onChange={(event) => setRoomDraft((current) => ({ ...current, name: event.target.value }))} />
                </Field>
                <Toggle label="Sala attiva per agenda e assegnazioni" checked={roomDraft.is_active} onChange={(checked) => setRoomDraft((current) => ({ ...current, is_active: checked }))} />
                <ActionRow primaryLabel={roomDraft.id ? "Salva sala" : "Crea sala"} secondaryLabel="Elimina" onPrimary={handleRoomSave} onSecondary={handleRoomDelete} busy={saving.startsWith("room")} />
              </div>
            }
          />
        )}

        {section === "tables" && (
          <ManagementShell
            title="Tavoli"
            subtitle="Capienza, forma e stato operativo"
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
                  roomTables.map((table) => (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => {
                        setSelectedMapTableId(table.id);
                        setTableDraft({ id: table.id, room_id: table.room_id, name: table.name, capacity: table.capacity, shape: table.shape, pos_x: table.pos_x, pos_y: table.pos_y, width: table.width ?? 94, height: table.height ?? 94, is_active: table.is_active, is_out_of_service: table.is_out_of_service });
                      }}
                      className={`w-full rounded-[1.25rem] p-5 text-left transition-all ${
                        tableDraft.id === table.id ? "bg-slate-900 text-white shadow-md scale-[1.02]" : "bg-slate-50 ring-1 ring-inset ring-slate-200/60 hover:-translate-y-1 hover:shadow-sm hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-lg font-medium tracking-tight">{table.name}</p>
                          <p className={`mt-1 text-sm ${tableDraft.id === table.id ? "text-slate-300" : "text-slate-500"}`}>{table.shape} &bull; {table.capacity} posti</p>
                        </div>
                        <span className={`rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.2em] ${tableDraft.id === table.id ? "bg-slate-50/20 text-white" : occupancyTone(table.occupancy_state)}`}>{occupancyLabel(table.occupancy_state)}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            }
            side={
              <div className="space-y-3">
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
                <Toggle label="Tavolo attivo" checked={tableDraft.is_active} onChange={(checked) => setTableDraft((current) => ({ ...current, is_active: checked }))} />
                <Toggle label="Fuori servizio" checked={tableDraft.is_out_of_service} onChange={(checked) => setTableDraft((current) => ({ ...current, is_out_of_service: checked }))} />
                <ActionRow primaryLabel={tableDraft.id ? "Salva tavolo" : "Crea tavolo"} secondaryLabel="Elimina" onPrimary={handleTableSave} onSecondary={handleTableDelete} busy={saving.startsWith("table")} />
              </div>
            }
          />
        )}

        {section === "map" && (
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_380px]">
            <SectionPanel title="Mappa sala" eyebrow="Workspace operativo">
              <div className="grid gap-3 md:grid-cols-3">
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
              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <KpiCard label="Sale" value={rooms.length} tone="success" />
                <KpiCard label="Tavoli" value={roomMap?.totals.tables ?? roomTables.length} tone="info" />
                <KpiCard label="Liberi" value={roomMap?.totals.free ?? 0} tone="success" />
                <KpiCard label="Occupati" value={roomMap?.totals.occupied ?? 0} tone="danger" />
              </div>
              <div className="mt-6">
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
            <aside className="space-y-4">
              <div className="surface-strong rounded-[1.25rem] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Legenda</p>
                <div className="mt-4 space-y-3">
                  {["free", "reserved", "occupied", "out_of_service"].map((state) => (
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
      <SubmissionDecisionModal
        open={requestConfirmOpen === "confirmed"}
        mode="confirmed"
        title="Confermare la richiesta collegata?"
        description="La richiesta passera a confermata e la prenotazione verra riallineata. Puoi lasciare il messaggio vuoto per usare il template configurato del form oppure personalizzarlo per questa singola risposta."
        confirmLabel="Conferma richiesta"
        confirmState={requestActionState}
        defaultMessage={defaultBookingDecisionMessage("confirmed")}
        error={requestActionError}
        onClose={() => {
          if (requestActionState === "loading") return;
          setRequestConfirmOpen(false);
          setRequestActionError(null);
        }}
        onConfirm={(values) => void handleLinkedRequestDecision("confirmed", undefined, values.whatsappMessage)}
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
        description="Il motivo viene salvato nell'audit e mostrato nel riepilogo prenotazione. Se vuoi, puoi anche personalizzare il messaggio WhatsApp di rigetto per questa singola risposta."
        confirmLabel="Rigetta richiesta"
        confirmState={requestActionState}
        defaultMessage={defaultBookingDecisionMessage("rejected")}
        error={requestActionError}
        onClose={() => {
          if (requestActionState === "loading") return;
          setRequestRejectOpen(false);
          setRequestActionError(null);
        }}
        onConfirm={(values) => void handleLinkedRequestDecision("rejected", values.reason, values.whatsappMessage)}
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

function ManagementShell({ title, subtitle, main, side }: { title: string; subtitle: string; main: React.ReactNode; side: React.ReactNode }) {
  return (
    <section className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_360px]">
      <div className="rounded-[1.25rem] bg-slate-50 p-8 ring-1 ring-inset ring-slate-200/60 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{title}</p>
        <h2 className="mt-2 text-2xl font-light tracking-tight text-slate-900">{subtitle}</h2>
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
  agendaYearOptions: number[];
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  formFilter: number | "";
  setFormFilter: (value: number | "") => void;
  forms: AssociationForm[];
  monthGrid: Date[];
  bookingsByDay: Map<string, AssociationBooking[]>;
  monthOccupancy: { total: number; confirmed: number; pending: number; completed: number };
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
  onSaveAssignment: () => void;
  onClearAssignment: () => void;
  requestActionState: "idle" | "loading" | "success" | "error";
  onOpenRequestConfirm: (value: false | "confirmed" | "pending") => void;
  onOpenRequestReject: (value: boolean) => void;
  saving: string;
}) {
  const [dayFilter, setDayFilter] = useState<DayStatusFilter>("all");
  const monthDate = new Date(`${props.agendaMonth}T00:00:00`);
  const monthIndex = Number.isNaN(monthDate.getTime()) ? new Date().getMonth() : monthDate.getMonth();
  const monthYear = Number.isNaN(monthDate.getTime()) ? new Date().getFullYear() : monthDate.getFullYear();
  const monthOptions = Array.from({ length: 12 }, (_, index) =>
    new Date(2026, index, 1).toLocaleDateString("it-IT", { month: "long" }),
  );
  const dayPending = props.activeDayItems.filter((item) => item.status === "pending" || item.status === "new").length;
  const dayCovers = props.activeDayItems.reduce((total, item) => total + (item.party_size || 0), 0);
  const filteredDayItems = props.activeDayItems.filter((booking) => matchesDayStatusFilter(booking, dayFilter));

  return (
    <section className="space-y-8">
        <div className="rounded-[1.25rem] bg-slate-50 p-8 ring-1 ring-inset ring-slate-200/60 shadow-sm">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between border-b border-slate-100 pb-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Calendario</p>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <button type="button" onClick={() => props.setAgendaMonth(shiftMonth(props.agendaMonth, -1))} className="btn-secondary !rounded-full !px-5 !py-2.5 text-sm font-medium transition-all hover:-translate-x-0.5">
                  &larr;
                </button>
                <div>
                  <h2 className="text-3xl font-light tracking-tight text-slate-900 capitalize">{formatMonthLabel(props.agendaMonth)}</h2>
                </div>
                <button type="button" onClick={() => props.setAgendaMonth(shiftMonth(props.agendaMonth, 1))} className="btn-secondary !rounded-full !px-5 !py-2.5 text-sm font-medium transition-all hover:translate-x-0.5">
                  &rarr;
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 items-center">
              <div className="w-40">
                <select className="w-full rounded-full border-0 bg-slate-50 py-2.5 pl-4 pr-10 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200/60 hover:bg-slate-100 focus:ring-2 focus:ring-slate-900 transition-all" value={monthIndex} onChange={(event) => props.setAgendaMonth(setMonthYear(props.agendaMonth, monthYear, Number(event.target.value)))}>
                  {monthOptions.map((label, index) => (
                    <option key={label} value={index}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="w-28">
                <select className="w-full rounded-full border-0 bg-slate-50 py-2.5 pl-4 pr-10 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200/60 hover:bg-slate-100 focus:ring-2 focus:ring-slate-900 transition-all" value={monthYear} onChange={(event) => props.setAgendaMonth(setMonthYear(props.agendaMonth, Number(event.target.value), monthIndex))}>
                  {props.agendaYearOptions.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <div className="w-36">
                <select className="w-full rounded-full border-0 bg-slate-50 py-2.5 pl-4 pr-10 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200/60 hover:bg-slate-100 focus:ring-2 focus:ring-slate-900 transition-all" value={props.statusFilter} onChange={(event) => props.setStatusFilter(event.target.value)}>
                  <option value="">Tutti gli stati</option>
                  {bookingStatuses.map((status) => <option key={status} value={status}>{formatStatusLabel(status)}</option>)}
                </select>
              </div>
              <div className="w-48">
                <select className="w-full rounded-full border-0 bg-slate-50 py-2.5 pl-4 pr-10 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200/60 hover:bg-slate-100 focus:ring-2 focus:ring-slate-900 transition-all" value={props.formFilter} onChange={(event) => props.setFormFilter(event.target.value ? Number(event.target.value) : "")}>
                  <option value="">Tutti i form</option>
                  {props.forms.map((form) => <option key={form.id} value={form.id}>{form.title}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <MetricBox label="Prenotazioni mese" value={props.monthOccupancy.total} />
            <MetricBox label="Da confermare" value={props.monthOccupancy.pending} />
            <MetricBox label="Confermate" value={props.monthOccupancy.confirmed} />
            <MetricBox label="Servite" value={props.monthOccupancy.completed} />
          </div>
        </div>

        {props.selectedCalendarDate ? (
          <section className="booking-day-panel" aria-live="polite">
            <header className="booking-day-panel__header">
              <div>
                <p className="booking-day-panel__eyebrow">{formatDate(props.selectedCalendarDate)}</p>
                <h2 className="booking-day-panel__title">Prenotazioni</h2>
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
                ×
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
                  aria-selected={dayFilter === filter.key}
                  aria-controls="booking-day-list-panel"
                  id={`booking-day-filter-${filter.key}`}
                  className={dayFilter === filter.key ? "is-active" : ""}
                  onClick={() => setDayFilter(filter.key)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div
              className="booking-day-list"
              id="booking-day-list-panel"
              role="tabpanel"
              aria-labelledby={`booking-day-filter-${dayFilter}`}
            >
              {filteredDayItems.length === 0 ? (
                <EmptyState message="Nessuna prenotazione in questo filtro." />
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
                            onSaveAssignment={props.onSaveAssignment}
                            onClearAssignment={props.onClearAssignment}
                            requestActionState={props.requestActionState}
                            onOpenRequestConfirm={props.onOpenRequestConfirm}
                            onOpenRequestReject={props.onOpenRequestReject}
                            saving={props.saving}
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

        <SectionPanel className="p-5">
          <div className="grid grid-cols-7 gap-2 border-b ring-slate-200/60 px-2 pb-4">
            {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((label) => (
              <div key={label} className="px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-7">
            {props.monthGrid.map((day) => {
              const dateKey = toDateKey(day);
              const items = props.bookingsByDay.get(dateKey) ?? [];
              const isCurrentMonth = isSameMonth(day, props.agendaMonth);
              const isToday = dateKey === todayIso();
              const isSelected = dateKey === props.selectedCalendarDate;

              return (
                <div
                  key={dateKey}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    props.setSelectedCalendarDate(dateKey);
                    props.setSelectedBookingId(items[0]?.id ?? null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    props.setSelectedCalendarDate(dateKey);
                    props.setSelectedBookingId(items[0]?.id ?? null);
                  }}
                  className={`booking-calendar-day ${isSelected ? "is-selected" : ""} ${isCurrentMonth ? "" : "is-outside"} ${items.length > 0 ? "has-bookings" : ""}`}
                >
                  <div className="flex w-full items-start justify-between">
                    <div>
                      <p className="booking-calendar-day__weekday">{formatWeekdayCell(day)}</p>
                      <p className="booking-calendar-day__number">{day.getDate()}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {isToday ? (
                        <span className="booking-calendar-day__badge">Oggi</span>
                      ) : null}
                      {items.length > 0 && (
                        <span className="booking-calendar-day__count">
                          {items.length} pren.
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 w-full space-y-1.5 flex-1 flex flex-col justify-end">
                    {items.length === 0 ? (
                      <div className="flex items-center justify-center flex-1">
                        <span className="booking-calendar-day__empty">
                          Vuoto
                        </span>
                      </div>
                    ) : (
                      <>
                        {items.slice(0, 3).map((booking) => (
                          <button
                            key={booking.id}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              props.setSelectedCalendarDate(dateKey);
                              props.setSelectedBookingId(booking.id);
                            }}
                            className={`booking-calendar-mini-row ${booking.id === props.selectedBookingId ? "is-active" : ""}`}
                          >
                            <span className="truncate pr-2 text-left">{booking.customer_name}</span>
                            <span>{(booking.booking_time || "00:00").slice(0, 5)}</span>
                          </button>
                        ))}
                        {items.length > 3 && (
                          <p className="booking-calendar-day__more">
                            +{items.length - 3} altre
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionPanel>
      </section>
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
  return (
    <article className={`booking-day-row ${expanded ? "is-expanded" : ""}`}>
      <button type="button" className="booking-day-row__summary" onClick={onSelect} aria-expanded={expanded}>
        <span className="booking-day-row__avatar">{initialsFromName(booking.customer_name)}</span>
        <span className="booking-day-row__main">
          <span className="booking-day-row__name">{booking.customer_name}</span>
          <span className="booking-day-row__meta">
            {(booking.booking_time || "--:--").slice(0, 5)} · {formatBookingTable(booking)}
          </span>
          {expanded && selectedBooking ? (
            <span className="booking-day-row__contact">{selectedBooking.customer_email || selectedBooking.customer_phone || "Contatto non disponibile"}</span>
          ) : null}
        </span>
        <span className="booking-day-row__side">
          <span className={bookingStatusDotClass(booking.status)} aria-hidden="true" />
          <span className={bookingStatusChipClass(booking.status)}>{formatStatusLabel(booking.status)}</span>
          <span className="booking-day-row__pax">◎ {booking.party_size || "-"} pax</span>
        </span>
        <span className="booking-day-row__chevron" aria-hidden="true">⌄</span>
      </button>
      {expanded ? <div className="booking-day-row__expanded">{detail}</div> : null}
    </article>
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
  onSaveAssignment: () => void;
  onClearAssignment: () => void;
  requestActionState: "idle" | "loading" | "success" | "error";
  onOpenRequestConfirm: (value: false | "confirmed" | "pending") => void;
  onOpenRequestReject: (value: boolean) => void;
  saving: string;
}) {
  if (!props.selectedBooking) {
    return <div className="rounded-[0.85rem] border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-500">Seleziona una prenotazione dal calendario per vedere dettaglio, stato e assegnazione tavolo.</div>;
  }

  const requestMeta = requestStatusMeta(props.selectedBooking.request_status);

  return (
    <div className="space-y-6">
      <div className="rounded-[1.25rem] bg-slate-50 p-6 ring-1 ring-inset ring-slate-200/60 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Prenotazione</p>
            <p className="mt-2 text-2xl font-light tracking-tight text-slate-900">{props.selectedBooking.customer_name}</p>
            <p className="mt-1 text-sm text-slate-500">{props.selectedBooking.customer_email || props.selectedBooking.customer_phone || "Contatto non disponibile"}</p>
          </div>
          <span className={bookingStatusChipClass(props.selectedBooking.status)}>{formatStatusLabel(props.selectedBooking.status)}</span>
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
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">Note cliente</p>
            <p className="mt-2 leading-relaxed font-medium">{props.selectedBooking.notes}</p>
          </div>
        ) : null}
      </div>

      {props.selectedBooking.submission_id ? (
        <div className="rounded-[1.25rem] bg-slate-50 p-6 ring-1 ring-inset ring-slate-200/60 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Richiesta collegata</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{requestMeta.label}</p>
              <p className="mt-1 text-sm text-slate-500">
                Submission #{props.selectedBooking.submission_id}
                {props.selectedBooking.request_review_summary?.reviewed_at
                  ? ` · ${formatDateTime(props.selectedBooking.request_review_summary.reviewed_at)}`
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

      <div className="rounded-[1.25rem] bg-slate-50 p-6 ring-1 ring-inset ring-slate-200/60 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4">Stato servizio</p>
        <div className="booking-service-status-grid">
          {bookingStatuses.map((status) => (
            <button 
              key={status} 
              type="button" 
              onClick={() => props.onStatusChange(status)} 
              disabled={props.saving === "booking-status"} 
              aria-pressed={props.selectedBooking?.status === status}
              aria-label={formatServiceStatusLabel(status)}
              title={formatServiceStatusLabel(status)}
              className={`booking-service-status-button ${status === "no_show" ? "is-wide" : ""} ${
                props.selectedBooking?.status === status ? "is-active" : ""
              }`}
            >
              {serviceStatusButtonLabel(status)}
            </button>
          ))}
        </div>
        <div className="booking-inline-actions">
          <button type="button" className="booking-inline-action">
            Note
          </button>
          <button
            type="button"
            className="booking-inline-action"
            disabled={props.saving === "booking-status" || props.selectedBooking.status === "completed"}
            onClick={() => props.onStatusChange("completed")}
          >
            Completa
          </button>
        </div>
      </div>

      <div className="rounded-[1.25rem] bg-slate-50/50 p-6 ring-1 ring-inset ring-slate-200/60">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4">Assegna sala e tavolo</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Sala">
            <select className={inputClass} value={props.assignmentRoomId} onChange={(event) => props.setAssignmentRoomId(event.target.value ? Number(event.target.value) : "")}>
              <option value="">Seleziona una sala</option>
              {props.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          </Field>
          <Field label="Tavolo">
            <select className={inputClass} value={props.assignmentTableId} onChange={(event) => props.setAssignmentTableId(event.target.value ? Number(event.target.value) : "")}>
              <option value="">Solo sala</option>
              {props.assignmentTables.map((table) => <option key={table.id} value={table.id}>{table.name} - {table.capacity} posti</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-6">
          <ActionRow primaryLabel="Salva assegnazione" secondaryLabel="Rimuovi" onPrimary={props.onSaveAssignment} onSecondary={props.onClearAssignment} busy={props.saving.startsWith("assignment")} />
        </div>
      </div>
    </div>
  );
}
