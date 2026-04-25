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
      return "bg-[#fff2cf] text-[#493713] ring-[#f3b83f] border-[#f0a71f]";
    case "occupied":
      return "bg-[#ffd5d7] text-[#521b22] ring-[#ee5663] border-[#e54855]";
    case "out_of_service":
      return "bg-[#eef1f3] text-[#647184] ring-[#b9c3cc] border-[#b9c3cc]";
    default:
      return "bg-[#bfe8cd] text-[#103022] ring-[#61bf83] border-[#50aa72]";
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
        className="org-admin-floor-map relative min-h-[34rem] overflow-hidden rounded-[0.7rem] border border-slate-300 bg-[#ead8c3] p-6 shadow-[inset_0_0_0_8px_rgba(81,80,75,0.72),0_18px_38px_-28px_rgba(15,23,42,0.6)]"
      >
        <div className="pointer-events-none absolute inset-0 opacity-75 [background-image:repeating-linear-gradient(0deg,rgba(255,255,255,0.15)_0,rgba(255,255,255,0.15)_1px,transparent_1px,transparent_38px),repeating-linear-gradient(90deg,rgba(120,91,57,0.11)_0,rgba(120,91,57,0.11)_1px,transparent_1px,transparent_76px)]" />
        <div className="pointer-events-none absolute left-7 right-[58%] top-8 h-24 rounded-br-[2rem] border border-[#b9afa1] bg-[#f4eee6] shadow-[0_12px_24px_-20px_rgba(0,0,0,0.55)]">
          <div className="absolute inset-x-7 top-10 h-8 rounded-full bg-white/88" />
          <span className="absolute left-1/2 top-8 -translate-x-1/2 text-[0.72rem] font-black uppercase tracking-[0.08em] text-[#30383b]">Bar / Servizio</span>
        </div>
        <div className="pointer-events-none absolute right-12 top-7 grid grid-cols-3 gap-2">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <span key={item} className="h-10 w-12 rounded-sm border border-[#b9afa1] bg-[#f2f4f3] shadow-inner" />
          ))}
        </div>
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-12 w-24 -translate-x-1/2 border-x border-t border-[#8b8276] bg-[#f8faf9]/80" />
        <div className="pointer-events-none absolute bottom-[-0.1rem] left-1/2 translate-x-[-50%] translate-y-full text-[0.72rem] font-black uppercase tracking-[0.08em] text-slate-700">
          Ingresso
        </div>
        {[
          "left-7 top-36",
          "left-7 bottom-28",
          "left-8 bottom-16",
          "right-12 bottom-32",
          "right-10 top-36",
        ].map((position) => (
          <span key={position} className={`pointer-events-none absolute ${position} h-10 w-10 rounded-full bg-[#4b8d45] shadow-[inset_0_-10px_0_rgba(0,0,0,0.12)]`} />
        ))}

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
              className={`absolute z-10 flex flex-col items-center justify-center border px-3 text-center shadow-[0_14px_22px_-18px_rgba(15,23,42,0.7)] ring-2 transition ${
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
