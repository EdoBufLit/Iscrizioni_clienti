import type { CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BuilderField } from "./utils";
import { PALETTE_ITEMS } from "./utils";

type Props = {
  field: BuilderField;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

type CanvasItemFrameProps = Props & {
  nodeRef?: ReturnType<typeof useSortable>["setNodeRef"];
  attributes?: ReturnType<typeof useSortable>["attributes"];
  listeners?: ReturnType<typeof useSortable>["listeners"];
  style?: CSSProperties;
  isDragging?: boolean;
  isOverlay?: boolean;
};

function CanvasItemFrame({
  field,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  nodeRef,
  attributes,
  listeners,
  style,
  isDragging = false,
  isOverlay,
}: CanvasItemFrameProps) {
  const meta = PALETTE_ITEMS.find((i) => i.type === field.type);

  if (isDragging && !isOverlay) {
    return (
      <div
        ref={nodeRef}
        style={style}
        className="form-builder-canvas-placeholder h-20 w-full rounded-[0.75rem] border-2 border-dashed border-brand bg-brand/5"
      />
    );
  }

  const renderContent = () => {
    switch (field.type) {
      case "section_title":
        return <h3 className="form-builder-item__title text-xl font-semibold text-slate-950">{field.label || "Titolo sezione"}</h3>;
      case "free_text":
        return <p className="form-builder-item__muted text-sm leading-6 text-slate-600">{field.helpText || "Aggiungi il tuo testo libero qui..."}</p>;
      case "divider":
        return <hr className="form-builder-item__divider border-t my-4" />;
      case "spacer":
        return <div className="form-builder-item__spacer flex h-10 items-center justify-center rounded-[0.65rem] border border-dashed text-[10px] uppercase tracking-widest">Spazio vuoto</div>;
      case "booking_block":
        {
          const labels = field.bookingLabels || {};
          const dateLabel = labels.dateLabel?.trim() || "Giorno";
          const timeLabel = labels.timeLabel?.trim() || "Orario";
          const eventLabel = labels.eventLabel?.trim() || "Serata";
          const blockTitle = field.label?.trim() || "Prenotazione";
          const blockHelp = field.helpText?.trim() || "Giorno e orario liberi, serata proposta se presente.";
          return (
            <div className="form-builder-booking-link__field grid w-full gap-3 rounded-[0.75rem] border px-3 py-3">
              <div>
                <span className="text-sm font-semibold text-slate-900">{blockTitle}</span>
                <p className="mt-1 text-xs leading-5 text-slate-500">{blockHelp}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {[dateLabel, timeLabel, eventLabel].map((label) => (
                  <div key={label} className="rounded-[0.65rem] border border-dashed px-3 py-2">
                    <span className="text-xs font-semibold text-slate-600">{label}</span>
                    <div className="mt-2 h-8 rounded-[0.55rem] bg-slate-100" />
                  </div>
                ))}
              </div>
            </div>
          );
        }
      case "rating_1_5":
      case "nps_0_10": {
        const options = field.optionsText.split(",").map((item) => item.trim()).filter(Boolean);
        return (
          <div className="flex flex-col gap-2 w-full">
            <span className="form-builder-item__label text-sm font-semibold text-neutral-800">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </span>
            <div className="flex flex-wrap gap-2">
              {options.map((option) => (
                <span key={option} className="form-builder-item__option flex h-9 min-w-9 items-center justify-center rounded-[0.65rem] border px-3 text-sm font-semibold text-slate-600">
                  {option}
                </span>
              ))}
            </div>
            {field.helpText && <span className="form-builder-item__hint text-xs text-neutral-500 mt-1">{field.helpText}</span>}
          </div>
        );
      }
      default:
        return (
          <div className="flex flex-col gap-1 w-full">
            {!field.hideLabel && (
              <span className="form-builder-item__label text-sm font-semibold text-neutral-800">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </span>
            )}
            <div className="form-builder-item__input-preview pointer-events-none w-full rounded-[0.72rem] border px-3.5 py-2.5 text-sm">
              {field.placeholder || "..."}
            </div>
            {field.helpText && <span className="form-builder-item__hint text-xs text-neutral-500 mt-1">{field.helpText}</span>}
          </div>
        );
    }
  };

  return (
    <div
      ref={nodeRef}
      style={style}
      className={`form-builder-item group relative flex flex-col rounded-[0.85rem] transition-all cursor-pointer ${
        isSelected
          ? "ring-2 ring-brand shadow-[0_4px_20px_rgba(15,118,110,0.15)] z-10"
          : "ring-1 ring-black/5 hover:ring-black/15 shadow-sm hover:shadow-md"
      } ${field.width === "50%" ? "inline-block flex-grow-0 shrink-0" : "w-full"}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <div
          {...attributes}
          {...listeners}
          className="p-1 cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-700 bg-white rounded shadow-sm border border-neutral-100"
          onClick={(e) => e.stopPropagation()} // prevent select when clicking drag handle
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </div>
      </div>

      <div className="p-5 pl-10 pointer-events-none">
        {renderContent()}
      </div>

      {isSelected && (
        <div className="form-builder-item-actions absolute -top-3 right-4 flex items-center gap-1 bg-neutral-900 rounded-lg p-1 shadow-lg z-30 pointer-events-auto">
          <div className="px-2 text-[10px] font-bold text-white/70 uppercase tracking-widest border-r border-white/20">
            {meta?.label || (field.type === "booking_block" ? "Prenotazione" : "Campo")}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-35"
            title="Sposta su"
            disabled={!canMoveUp}
          >
            <span className="block h-3.5 w-3.5 text-center text-xs leading-3.5">↑</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-35"
            title="Sposta giù"
            disabled={!canMoveDown}
          >
            <span className="block h-3.5 w-3.5 text-center text-xs leading-3.5">↓</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded transition-colors"
            title="Duplica"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/20 rounded transition-colors"
            title="Elimina"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export function StaticCanvasItem(props: Props) {
  const style: CSSProperties = {
    opacity: 1,
    zIndex: 1,
    width: props.field.width === "50%" ? "calc(50% - 0.5rem)" : "100%",
  };
  return <CanvasItemFrame {...props} style={style} isOverlay />;
}

export function CanvasItem(props: Props) {
  const { field } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: field.key,
    data: {
      source: "canvas",
      type: "field",
      field,
    },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 10 : 1,
    width: field.width === "50%" ? "calc(50% - 0.5rem)" : "100%",
  };

  return (
    <CanvasItemFrame
      {...props}
      nodeRef={setNodeRef}
      attributes={attributes}
      listeners={listeners}
      style={style}
      isDragging={isDragging}
    />
  );
}
