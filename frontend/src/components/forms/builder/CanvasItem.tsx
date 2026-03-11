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
  isOverlay?: boolean;
};

export function CanvasItem({
  field,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  isOverlay,
}: Props) {
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
      type: "Field",
      field,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 10 : 1,
    width: field.width === "50%" ? "calc(50% - 0.5rem)" : "100%",
  };

  const meta = PALETTE_ITEMS.find((i) => i.type === field.type);

  if (isDragging && !isOverlay) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="rounded-xl border-2 border-brand border-dashed bg-brand/5 h-20 w-full"
      />
    );
  }

  const renderContent = () => {
    switch (field.type) {
      case "section_title":
        return <h3 className="text-xl font-serif font-bold text-neutral-900">{field.label || "Titolo Sezione"}</h3>;
      case "free_text":
        return <p className="text-sm text-neutral-600">{field.helpText || "Aggiungi il tuo testo libero qui..."}</p>;
      case "divider":
        return <hr className="border-t border-neutral-200 my-4" />;
      case "spacer":
        return <div className="h-10 border border-dashed border-neutral-200/50 rounded-lg bg-neutral-50/30 flex items-center justify-center text-[10px] text-neutral-400 uppercase tracking-widest">Spazio vuoto</div>;
      default:
        return (
          <div className="flex flex-col gap-1 w-full">
            {!field.hideLabel && (
              <span className="text-sm font-semibold text-neutral-800">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </span>
            )}
            <div className="w-full rounded-[1.1rem] border border-black/10 bg-white px-3.5 py-2.5 text-sm text-neutral-400 pointer-events-none">
              {field.placeholder || "..."}
            </div>
            {field.helpText && <span className="text-xs text-neutral-500 mt-1">{field.helpText}</span>}
          </div>
        );
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex flex-col rounded-[1.2rem] bg-white transition-all cursor-pointer ${
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
        <div className="absolute -top-3 right-4 flex items-center gap-1 bg-neutral-900 rounded-lg p-1 shadow-lg z-30 pointer-events-auto">
          <div className="px-2 text-[10px] font-bold text-white/70 uppercase tracking-widest border-r border-white/20">
            {meta?.label}
          </div>
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
