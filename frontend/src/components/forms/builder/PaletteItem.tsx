import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { VirtualFieldType } from "./utils";

type Props = {
  item: {
    type: VirtualFieldType;
    label: string;
    icon: string;
  };
};

export function PaletteItem({ item }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${item.type}`,
    data: {
      type: "PaletteItem",
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
    <button
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-3 rounded-[1rem] border bg-white px-4 py-3 text-left transition-all ${
        isDragging
          ? "border-brand shadow-lg ring-2 ring-brand/20 cursor-grabbing"
          : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 hover:shadow-sm cursor-grab"
      }`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-sm font-bold text-neutral-600">
        {item.icon}
      </span>
      <span className="text-sm font-medium text-neutral-700">{item.label}</span>
    </button>
  );
}
