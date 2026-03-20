import { useCallback, useEffect, useMemo, useState } from "react";
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
import PromptModal from "../../components/ui/PromptModal";
import Skeleton from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/ToastProvider";
import { RoomFloorMap } from "../../components/bookings/RoomFloorMap";

type SectionTab = "agenda" | "rooms" | "tables" | "map";

const bookingStatuses = ["new", "pending", "confirmed", "seated", "completed", "cancelled", "no_show"];
const sectionTabs: Array<{ key: SectionTab; label: string; hint: string }> = [
  { key: "agenda", label: "Agenda", hint: "Prenotazioni e assegnazioni" },
  { key: "rooms", label: "Sale", hint: "Spazi disponibili" },
  { key: "tables", label: "Tavoli", hint: "Capienza e stato" },
  { key: "map", label: "Mappa sala", hint: "Piantina 2D" },
];

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
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function toneForStatus(status: string) {
  switch (status) {
    case "confirmed":
    case "completed":
      return "bg-emerald-100 text-emerald-700";
    case "pending":
    case "new":
      return "bg-amber-100 text-amber-700";
    case "cancelled":
    case "no_show":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
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
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [section, setSection] = useState<SectionTab>("agenda");
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
    if (!selectedBookingId || !items.some((item) => item.id === selectedBookingId)) {
      setSelectedBookingId(items[0].id);
    }
  }, [bookingsByDay, selectedBookingId, selectedCalendarDate]);

  async function loadInitial() {
    setLoading(true);
    try {
      const [formsResponse, roomsResponse] = await Promise.all([
        fetchOrgAdminForms(),
        fetchOrgAdminRooms({ includeInactive: true }),
      ]);
      setForms(formsResponse.items.filter((item) => item.booking_enabled));
      setRooms(roomsResponse.items);
      const firstRoom = roomsResponse.items[0] ?? null;
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
      setListItems(response.items);
      if (selectedBookingId && !response.items.some((item) => item.id === selectedBookingId)) {
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
      setRoomTables(tablesResponse.items);
      setRoomMap(mapResponse);
      setMapTables(mapResponse.tables);
      if (tablesResponse.items[0] && !selectedMapTableId) setSelectedMapTableId(tablesResponse.items[0].id);
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

  async function handleLinkedRequestDecision(nextStatus: "pending" | "confirmed" | "rejected", reason?: string) {
    if (!selectedBooking?.form_id || !selectedBooking?.submission_id) return;
    setRequestActionState("loading");
    setRequestActionError(null);
    try {
      await updateOrgAdminFormSubmissionStatus(selectedBooking.form_id, selectedBooking.submission_id, {
        status: nextStatus,
        reason: reason?.trim() || null,
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
      showToast({
        tone: "success",
        title:
          nextStatus === "confirmed"
            ? "Richiesta confermata"
            : nextStatus === "rejected"
              ? "Richiesta rigettata"
              : "Richiesta riportata in attesa",
        message: "Dettaglio prenotazione e stato richiesta aggiornati.",
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
        <section className="bg-slate-50/50 rounded-[1.25rem] p-3 ring-1 ring-inset ring-slate-200/60">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:items-center">
            {/* Modern, horizontal, scrollable tab navigation without heavy borders */}
            <nav className="flex gap-1 overflow-x-auto px-1 pb-1 scrollbar-hide">
              {sectionTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSection(tab.key)}
                  className={`whitespace-nowrap rounded-full px-5 py-3 text-sm font-medium transition-all ${
                    section === tab.key
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span className="block">{tab.label}</span>
                  <span className={`block mt-0.5 text-[10px] uppercase tracking-wider ${section === tab.key ? "text-white/60" : "text-slate-500"}`}>{tab.hint}</span>
                </button>
              ))}
            </nav>
            <div className="grid gap-3 sm:grid-cols-4">
              <MetricBox label="Form booking" value={forms.length} />
              <MetricBox label="Nel mese" value={monthOccupancy.total} />
              <MetricBox label="Sale" value={rooms.length} />
              <MetricBox label="Tavoli" value={roomMap?.totals.tables ?? roomTables.length} />
            </div>
          </div>
        </section>

        {section === "agenda" && (
          <div className="space-y-6">
            <div className="flex justify-end">
              <button 
                type="button" 
                onClick={() => setIsCreatingManual(true)} 
                className="btn-primary"
              >
                + Nuova prenotazione
              </button>
            </div>
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
            <div className="surface-strong rounded-[1.25rem] p-6">
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
                <MetricBox label="Liberi" value={roomMap?.totals.free ?? 0} />
                <MetricBox label="Riservati" value={roomMap?.totals.reserved ?? 0} />
                <MetricBox label="Occupati" value={roomMap?.totals.occupied ?? 0} />
                <MetricBox label="Fuori servizio" value={roomMap?.totals.out_of_service ?? 0} />
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
            </div>
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
      <ConfirmModal
        open={requestConfirmOpen === "confirmed"}
        title="Confermare la richiesta collegata?"
        description="La richiesta passera a confermata e la prenotazione verra riallineata."
        confirmLabel="Conferma richiesta"
        confirmState={requestActionState}
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
      <PromptModal
        open={requestRejectOpen}
        title="Rigettare la richiesta collegata?"
        description="Il motivo viene salvato nell'audit e mostrato nel riepilogo prenotazione."
        label="Motivo del rigetto"
        placeholder="Es. disponibilita esaurita o dati non sufficienti."
        confirmLabel="Rigetta richiesta"
        confirmState={requestActionState}
        error={requestActionError}
        onClose={() => {
          if (requestActionState === "loading") return;
          setRequestRejectOpen(false);
          setRequestActionError(null);
        }}
        onConfirm={(value) => void handleLinkedRequestDecision("rejected", value)}
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

function BookingCard({ booking, selected, onSelect, compact = false }: { booking: AssociationBooking; selected: boolean; onSelect: (id: number) => void; compact?: boolean }) {
  return (
    <button type="button" onClick={() => onSelect(booking.id)} className={`w-full rounded-[1.25rem] p-5 text-left transition-all ${selected ? "bg-slate-900 text-white shadow-md scale-[1.02]" : compact ? "bg-slate-50 ring-1 ring-inset ring-slate-200/60 hover:bg-slate-50" : "bg-slate-50 ring-1 ring-inset ring-slate-200/60 hover:-translate-y-1 hover:shadow-sm"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-medium tracking-tight">{booking.customer_name}</h3>
            <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.2em] ${selected ? "bg-slate-50/20 text-white" : toneForStatus(booking.status)}`}>{formatStatusLabel(booking.status)}</span>
          </div>
          <p className={`mt-1.5 text-sm ${selected ? "text-slate-300" : "text-slate-500"}`}>{formatDateTime(booking.booking_date, booking.booking_time)}</p>
        </div>
        <div className={`rounded-full px-4 py-1.5 text-sm font-medium ${selected ? "bg-slate-50/10 text-white" : "bg-slate-100 text-slate-700"}`}>
          {booking.party_size || "-"} pax
        </div>
      </div>
      {!compact && (
        <div className={`mt-6 grid gap-4 border-t pt-4 md:grid-cols-4 ${selected ? "border-white/10" : "border-slate-100"}`}>
          <div><p className={`text-[10px] uppercase tracking-[0.2em] ${selected ? "text-slate-500" : "text-slate-500"}`}>Form</p><p className={`mt-1 text-sm font-medium ${selected ? "text-white" : "text-slate-900"}`}>{booking.source_form?.title || "N/D"}</p></div>
          <div><p className={`text-[10px] uppercase tracking-[0.2em] ${selected ? "text-slate-500" : "text-slate-500"}`}>Contatto</p><p className={`mt-1 text-sm font-medium ${selected ? "text-white" : "text-slate-900"}`}>{booking.customer_email || booking.customer_phone || "N/D"}</p></div>
          <div><p className={`text-[10px] uppercase tracking-[0.2em] ${selected ? "text-slate-500" : "text-slate-500"}`}>Sala</p><p className={`mt-1 text-sm font-medium ${selected ? "text-white" : "text-slate-900"}`}>{booking.room?.name || "Da assegnare"}</p></div>
          <div><p className={`text-[10px] uppercase tracking-[0.2em] ${selected ? "text-slate-500" : "text-slate-500"}`}>Tavolo</p><p className={`mt-1 text-sm font-medium ${selected ? "text-white" : "text-slate-900"}`}>{booking.table?.name || "Da assegnare"}</p></div>
        </div>
      )}
      {!compact && booking.notes_preview ? (
        <div className={`mt-4 rounded-xl p-3 text-sm ${selected ? "bg-slate-50/5 text-slate-300" : "bg-slate-50 text-slate-600"}`}>
          <p className="line-clamp-2">{booking.notes_preview}</p>
        </div>
      ) : null}
    </button>
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
  const monthDate = new Date(`${props.agendaMonth}T00:00:00`);
  const monthIndex = Number.isNaN(monthDate.getTime()) ? new Date().getMonth() : monthDate.getMonth();
  const monthYear = Number.isNaN(monthDate.getTime()) ? new Date().getFullYear() : monthDate.getFullYear();
  const monthOptions = Array.from({ length: 12 }, (_, index) =>
    new Date(2026, index, 1).toLocaleDateString("it-IT", { month: "long" }),
  );

  return (
    <>
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
        <div className="rounded-[1.25rem] bg-slate-50 p-6 ring-1 ring-inset ring-slate-200/60 shadow-sm">
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
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => {
                    props.setSelectedCalendarDate(dateKey);
                    props.setSelectedBookingId(items[0]?.id ?? null);
                  }}
                  className={`relative flex min-h-[140px] flex-col rounded-[1.25rem] p-4 text-left transition-all ${
                    isSelected
                      ? "bg-slate-900 text-white shadow-md scale-105 z-10"
                      : isCurrentMonth
                        ? "bg-slate-50 ring-1 ring-inset ring-slate-200/60 hover:-translate-y-1 hover:shadow-sm"
                        : "bg-slate-50/50 text-slate-500 opacity-60 ring-1 ring-inset ring-slate-200/40 hover:opacity-100"
                  }`}
                >
                  <div className="flex w-full items-start justify-between">
                    <div>
                      <p className={`text-[9px] font-bold uppercase tracking-[0.2em] ${isSelected ? "text-slate-500" : "text-slate-500"}`}>{formatWeekdayCell(day)}</p>
                      <p className={`mt-1 text-2xl font-light tracking-tight ${isSelected ? "text-white" : "text-slate-900"}`}>{day.getDate()}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {isToday ? (
                        <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.2em] ${isSelected ? "bg-slate-50/20 text-white" : "bg-sky-100 text-sky-700"}`}>Oggi</span>
                      ) : null}
                      {items.length > 0 && (
                        <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.2em] ${isSelected ? "bg-slate-50/20 text-white" : "bg-slate-100 text-slate-700"}`}>
                          {items.length} pax
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 w-full space-y-1.5 flex-1 flex flex-col justify-end">
                    {items.length === 0 ? (
                      <div className="flex items-center justify-center flex-1">
                        <span className={`text-[10px] uppercase tracking-wider ${isSelected ? "text-white/40" : "text-slate-500"}`}>
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
                            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-all ${
                              isSelected
                                ? booking.id === props.selectedBookingId
                                  ? "bg-slate-50 text-slate-900 shadow-sm"
                                  : "bg-slate-50/10 text-white hover:bg-slate-50/20"
                                : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            <span className="truncate pr-2 text-left">{booking.customer_name}</span>
                            <span className={isSelected ? (booking.id === props.selectedBookingId ? "text-slate-500" : "text-white/60") : "text-slate-500"}>{(booking.booking_time || "00:00").slice(0, 5)}</span>
                          </button>
                        ))}
                        {items.length > 3 && (
                          <p className={`mt-2 text-center text-[10px] font-bold uppercase tracking-[0.2em] ${isSelected ? "text-slate-500" : "text-slate-500"}`}>
                            +{items.length - 3} altre
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <ModalShell
        open={Boolean(props.selectedCalendarDate)}
        onClose={() => {
          props.setSelectedCalendarDate(null);
          props.setSelectedBookingId(null);
        }}
        title={props.selectedCalendarDate ? `Prenotazioni del ${formatDate(props.selectedCalendarDate)}` : "Dettaglio giornata"}
        description={props.selectedCalendarDate ? props.activeDayItems.length > 0 ? `${props.activeDayItems.length} prenotazioni da gestire in questa giornata.` : "Questa giornata e ancora libera. Puoi usarla come controllo rapido del calendario." : undefined}
        sizeClassName="max-w-6xl"
        contentClassName="overflow-hidden p-0"
      >
        <div className="grid lg:grid-cols-[360px_minmax(0,1fr)] bg-slate-50 min-h-[600px]">
          <div className="bg-slate-50 border-b ring-slate-200/60 lg:border-b-0 lg:border-r p-6 overflow-y-auto max-h-[80vh]">
            <div className="flex items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Giornata</p>
                <p className="mt-1 text-2xl font-light tracking-tight text-slate-900">{props.selectedCalendarDate ? formatDate(props.selectedCalendarDate) : "Nessuna data"}</p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">{props.activeDayItems.length} pren.</div>
            </div>
            <div className="mt-6 space-y-3">
              {props.activeDayItems.length === 0 ? (
                <EmptyState message="Nessuna prenotazione per questo giorno." />
              ) : (
                props.activeDayItems.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} selected={props.selectedBookingId === booking.id} onSelect={(id) => props.setSelectedBookingId(id)} compact />
                ))
              )}
            </div>
          </div>
          <div className="p-8 lg:p-10 overflow-y-auto max-h-[80vh]">
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
          </div>
        </div>
      </ModalShell>
    </>
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
    return <div className="rounded-[1.25rem] bg-slate-50/50 p-8 text-center ring-1 ring-inset ring-slate-200/60 border-dashed text-sm text-slate-500">Seleziona una prenotazione dal popup per vedere dettaglio, stato e assegnazione tavolo.</div>;
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
          <span className={`rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] ${toneForStatus(props.selectedBooking.status)}`}>{formatStatusLabel(props.selectedBooking.status)}</span>
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
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {bookingStatuses.map((status) => (
            <button 
              key={status} 
              type="button" 
              onClick={() => props.onStatusChange(status)} 
              disabled={props.saving === "booking-status"} 
              className={`rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${
                props.selectedBooking?.status === status 
                  ? "bg-slate-900 text-white shadow-sm" 
                  : "bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200/60 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {formatStatusLabel(status)}
            </button>
          ))}
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
