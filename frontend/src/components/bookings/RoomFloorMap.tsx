import { useEffect, useRef, useState } from "react";
import type { AssociationRoomTable } from "../../lib/api";

type RoomFloorMapProps = {
  roomName?: string | null;
  tables: AssociationRoomTable[];
  editable?: boolean;
  selectedTableId?: number | null;
  onSelectTable?: (table: AssociationRoomTable) => void;
  onMoveTable?: (tableId: number, next: { pos_x: number; pos_y: number }) => void;
};

type DragState = {
  id: number;
  offsetX: number;
  offsetY: number;
} | null;

function occupancyTone(state: AssociationRoomTable["occupancy_state"]) {
  switch (state) {
    case "reserved":
      return "from-amber-100 via-amber-50 to-white text-amber-900 ring-amber-300";
    case "occupied":
      return "from-emerald-100 via-emerald-50 to-white text-emerald-900 ring-emerald-300";
    case "out_of_service":
      return "from-slate-300 via-slate-200 to-slate-100 text-slate-700 ring-slate-400";
    default:
      return "from-sky-100 via-white to-sky-50 text-slate-900 ring-sky-200";
  }
}

function occupancyLabel(state: AssociationRoomTable["occupancy_state"]) {
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

export function RoomFloorMap({
  roomName,
  tables,
  editable = false,
  selectedTableId = null,
  onSelectTable,
  onMoveTable,
}: RoomFloorMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState>(null);

  useEffect(() => {
    if (!dragState || !editable) return;
    const currentDrag = dragState;
    function handleMouseMove(event: MouseEvent) {
      const container = containerRef.current;
      if (!container || !onMoveTable) return;
      const rect = container.getBoundingClientRect();
      const nextX = clamp(Math.round(event.clientX - rect.left - currentDrag.offsetX), 0, Math.max(0, rect.width - 32));
      const nextY = clamp(Math.round(event.clientY - rect.top - currentDrag.offsetY), 0, Math.max(0, rect.height - 32));
      onMoveTable(currentDrag.id, { pos_x: nextX, pos_y: nextY });
    }
    function handleMouseUp() {
      setDragState(null);
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, editable, onMoveTable]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Mappa sala</p>
          <h3 className="mt-1 font-serif text-2xl tracking-tight text-slate-950">{roomName || "Seleziona una sala"}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
            {editable ? "Editor posizioni attivo" : "Vista occupazione"}
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
            {editable ? "Trascina i tavoli per riposizionarli" : "Clicca un tavolo per il dettaglio"}
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative min-h-[34rem] overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(241,245,249,0.92)_35%,_rgba(226,232,240,0.98))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_28px_80px_rgba(15,23,42,0.08)]"
      >
        <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="pointer-events-none absolute inset-8 rounded-[1.6rem] border border-dashed border-slate-300/70" />
        <div className="pointer-events-none absolute left-8 top-8 rounded-full bg-white/85 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500 shadow-sm">
          Ingresso
        </div>
        <div className="pointer-events-none absolute bottom-8 right-8 rounded-full bg-slate-950 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white shadow-lg">
          Service / Staff
        </div>

        {tables.length === 0 ? (
          <div className="relative z-10 mx-auto mt-28 max-w-md rounded-[1.8rem] border border-dashed border-slate-300 bg-white/80 px-6 py-10 text-center shadow-sm backdrop-blur">
            <p className="text-sm font-semibold text-slate-900">Nessun tavolo posizionato</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Crea i tavoli e trascinali qui per costruire una mappa sala leggibile e pronta per l'assegnazione manuale.
            </p>
          </div>
        ) : null}

        {tables.map((table) => {
          const width = table.width ?? (table.shape === "rectangle" ? 136 : 94);
          const height = table.height ?? (table.shape === "rectangle" ? 88 : 94);
          const isSelected = selectedTableId === table.id;
          const shapeClass =
            table.shape === "round"
              ? "rounded-full"
              : table.shape === "square"
                ? "rounded-[1.5rem]"
                : "rounded-[1.8rem]";
          return (
            <button
              key={table.id}
              type="button"
              onClick={() => onSelectTable?.(table)}
              onMouseDown={(event) => {
                if (!editable) return;
                const target = event.currentTarget.getBoundingClientRect();
                setDragState({
                  id: table.id,
                  offsetX: event.clientX - target.left,
                  offsetY: event.clientY - target.top,
                });
              }}
              className={`absolute z-10 flex flex-col items-center justify-center border bg-gradient-to-br px-3 text-center shadow-[0_18px_40px_rgba(15,23,42,0.14)] ring-1 transition ${
                shapeClass
              } ${occupancyTone(table.occupancy_state)} ${isSelected ? "scale-[1.03] border-slate-950 ring-slate-950" : "border-white/80 ring-transparent"} ${
                editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
              }`}
              style={{
                left: `${table.pos_x}px`,
                top: `${table.pos_y}px`,
                width: `${width}px`,
                height: `${height}px`,
              }}
            >
              <span className="text-sm font-bold tracking-tight">{table.name}</span>
              <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
                {table.capacity} posti
              </span>
              {table.active_booking ? (
                <span className="mt-2 max-w-full truncate rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-700">
                  {table.active_booking.customer_name}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {(["free", "reserved", "occupied", "out_of_service"] as AssociationRoomTable["occupancy_state"][]).map((state) => (
          <div key={state} className={`rounded-[1rem] border bg-gradient-to-br px-3 py-3 text-sm font-semibold ${occupancyTone(state)}`}>
            <p>{occupancyLabel(state)}</p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] opacity-70">{state}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
