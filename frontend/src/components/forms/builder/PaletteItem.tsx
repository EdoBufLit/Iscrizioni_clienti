import type { CSSProperties } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { VirtualFieldType } from "./utils";

type PaletteDefinition = {
  type: VirtualFieldType;
  label: string;
  icon: string;
};

type Props = {
  item: PaletteDefinition;
  onAdd?: (item: PaletteDefinition) => void;
};

type PaletteItemCardProps = {
  item: {
    type: VirtualFieldType;
    label: string;
    icon: string;
  };
  style?: CSSProperties;
  attributes?: ReturnType<typeof useDraggable>["attributes"];
  listeners?: ReturnType<typeof useDraggable>["listeners"];
  nodeRef?: ReturnType<typeof useDraggable>["setNodeRef"];
  isDragging?: boolean;
  onAdd?: (item: PaletteDefinition) => void;
};

function PaletteItemCard({ item, style, attributes, listeners, nodeRef, isDragging = false, onAdd }: PaletteItemCardProps) {
  return (
    <div
      ref={nodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`form-builder-palette-card flex items-center gap-3 rounded-[0.75rem] border px-4 py-3 text-left transition-all ${
        isDragging
          ? "border-brand shadow-lg ring-2 ring-brand/20 cursor-grabbing"
          : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 hover:shadow-sm cursor-grab"
      }`}
    >
      <span className="form-builder-palette-card__icon flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.7rem] text-sm font-bold text-brand">
        {item.icon}
      </span>
      <span className="form-builder-palette-card__label min-w-0 flex-1 text-sm font-semibold text-slate-700">{item.label}</span>
      {onAdd ? (
        <button
          type="button"
          className="form-builder-palette-card__add inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.65rem] text-base font-bold"
          aria-label={`Aggiungi ${item.label}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onAdd(item);
          }}
        >
          +
        </button>
      ) : null}
    </div>
  );
}

export function StaticPaletteItem({ item }: Props) {
  return <PaletteItemCard item={item} />;
};

export function PaletteItem({ item, onAdd }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${item.type}`,
    data: {
      source: "palette",
      type: "palette-item",
      itemType: item.type,
      label: item.label,
    },
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 100 : 1,
      }
    : undefined;

  return (
    <PaletteItemCard
      item={item}
      style={style}
      attributes={attributes}
      listeners={listeners}
      nodeRef={setNodeRef}
      isDragging={isDragging}
      onAdd={onAdd}
    />
  );
}
