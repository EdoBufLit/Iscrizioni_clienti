import { useState, useMemo, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  DragCancelEvent,
  defaultDropAnimationSideEffects,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import {
  BuilderField,
  VirtualFieldType,
  createFieldFromPaletteItem,
  FORM_BUILDER_CANVAS_ID,
  generateFieldKey,
  PALETTE_ITEMS,
} from "./utils";
import { PaletteItem } from "./PaletteItem";
import { CanvasItem } from "./CanvasItem";
import { PropertiesPanel } from "./PropertiesPanel";

type Props = {
  fields: BuilderField[];
  onChange: (fields: BuilderField[]) => void;
  onSaveField: (field: BuilderField) => Promise<void>;
  onDeleteField: (id: number) => Promise<void>;
  onReorder: (fields: BuilderField[]) => Promise<void>;
  locked?: boolean;
};

export function FormBuilder({ fields, onChange, onSaveField, onDeleteField, onReorder, locked }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<BuilderField[]>(fields);

  useEffect(() => {
    setItems(fields);
  }, [fields]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const selectedField = useMemo(
    () => items.find((f) => f.key === selectedId) || null,
    [items, selectedId]
  );
  const { isOver: isCanvasOver, setNodeRef: setCanvasNodeRef } = useDroppable({
    id: FORM_BUILDER_CANVAS_ID,
    data: {
      accepts: ["palette", "canvas"],
      type: "canvas-dropzone",
    },
  });

  const activeItem = useMemo(() => {
    if (!activeId) return null;
    if (activeId.startsWith("palette-")) {
      const type = activeId.replace("palette-", "") as VirtualFieldType;
      const paletteItem = PALETTE_ITEMS.find((p) => p.type === type);
      return paletteItem ? { type: "palette", data: paletteItem } : null;
    }
    const field = items.find((f) => f.key === activeId);
    return field ? { type: "field", data: field } : null;
  }, [activeId, items]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    setActiveId(null);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Only handle visual things if needed, sorting logic is in dragEnd
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeIdStr = active.id.toString();
    const activeSource = active.data.current?.source;
    const overId = over.id.toString();

    // 1. Drop dalla palette al canvas
    if (activeSource === "palette" || activeIdStr.startsWith("palette-")) {
      const type =
        (active.data.current?.itemType as VirtualFieldType | undefined)
        || (activeIdStr.replace("palette-", "") as VirtualFieldType);
      const label = active.data.current?.label as string | undefined;
      const newField = createFieldFromPaletteItem(type, label);
      const overIndex =
        overId === FORM_BUILDER_CANVAS_ID
          ? items.length
          : items.findIndex((field) => field.key === overId);
      const insertIndex = overIndex >= 0 ? overIndex : items.length;
      const newItems = [
        ...items.slice(0, insertIndex),
        newField,
        ...items.slice(insertIndex),
      ];

      setItems(newItems);
      onChange(newItems);
      setSelectedId(newField.key);
      await onSaveField(newField);
      return;
    }

    // 2. Riordino interno al canvas
    if (activeSource === "canvas" && active.id !== over.id) {
      const oldIndex = items.findIndex((f) => f.key === active.id);
      const newIndex =
        overId === FORM_BUILDER_CANVAS_ID
          ? items.length - 1
          : items.findIndex((f) => f.key === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newItems = arrayMove(items, oldIndex, newIndex);
        setItems(newItems);
        onChange(newItems);
        await onReorder(newItems);
      }
    }
  };

  const handleUpdateSelected = async (updatedField: BuilderField) => {
    const newItems = items.map((f) => (f.key === updatedField.key ? updatedField : f));
    setItems(newItems);
    onChange(newItems);
    await onSaveField(updatedField);
  };

  const handleDuplicate = async (fieldToDuplicate: BuilderField) => {
    const newField: BuilderField = {
      ...fieldToDuplicate,
      id: -Date.now(),
      key: generateFieldKey(fieldToDuplicate.type, fieldToDuplicate.label),
      label: `${fieldToDuplicate.label} (Copia)`,
    };
    
    const index = items.findIndex(f => f.key === fieldToDuplicate.key);
    const newItems = [
      ...items.slice(0, index + 1),
      newField,
      ...items.slice(index + 1)
    ];
    
    setItems(newItems);
    onChange(newItems);
    setSelectedId(newField.key);
    await onSaveField(newField);
  };

  const handleDelete = async (fieldToDelete: BuilderField) => {
    if (selectedId === fieldToDelete.key) {
      setSelectedId(null);
    }
    const newItems = items.filter(f => f.key !== fieldToDelete.key);
    setItems(newItems);
    onChange(newItems);
    if (fieldToDelete.id > 0) {
      await onDeleteField(fieldToDelete.id);
    }
  };

  const dropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: "0.4",
        },
      },
    }),
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-6 items-start">
        {/* Left Column: Palette */}
        <div className="flex flex-col gap-4 bg-white p-4 rounded-3xl border border-neutral-200 shadow-sm sticky top-6">
          <div className="px-2 pb-2 border-b border-neutral-100">
            <h3 className="text-sm font-bold text-neutral-900">Libreria Blocchi</h3>
            <p className="text-[11px] font-medium text-neutral-500 mt-1">Trascina gli elementi nel canvas</p>
          </div>
          <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
            {PALETTE_ITEMS.map((item) => (
              <PaletteItem key={item.type} item={item} />
            ))}
          </div>
        </div>

        {/* Center Column: Canvas */}
        <div className="flex flex-col gap-4">
          <div
            ref={setCanvasNodeRef}
            className={`rounded-3xl border p-6 shadow-inner min-h-[60vh] transition-colors ${
              isCanvasOver
                ? "border-brand bg-brand/5 ring-2 ring-brand/20"
                : "border-neutral-200 bg-neutral-50/50"
            }`}
          >
            <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
              <div 
                className="flex flex-wrap gap-4 items-start"
                onClick={() => setSelectedId(null)}
              >
                {items.length === 0 ? (
                  <div className="pointer-events-none w-full h-40 flex flex-col items-center justify-center border-2 border-dashed border-neutral-300 rounded-2xl bg-white text-neutral-400">
                    <svg className="w-10 h-10 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                    </svg>
                    <p className="text-sm font-medium">Trascina qui un blocco per iniziare</p>
                  </div>
                ) : (
                  items.map((field) => (
                    <CanvasItem
                      key={field.key}
                      field={field}
                      isSelected={selectedId === field.key}
                      onSelect={() => setSelectedId(field.key)}
                      onDelete={() => handleDelete(field)}
                      onDuplicate={() => handleDuplicate(field)}
                    />
                  ))
                )}
              </div>
            </SortableContext>
          </div>
        </div>

        {/* Right Column: Properties */}
        <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm sticky top-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
          <PropertiesPanel
            selectedField={selectedField}
            onChange={handleUpdateSelected}
            locked={locked || false}
          />
        </div>
      </div>

      <DragOverlay dropAnimation={dropAnimation}>
        {activeItem?.type === "palette" ? (
          <div className="opacity-90 scale-105 shadow-xl ring-2 ring-brand/30 rounded-xl overflow-hidden">
            <PaletteItem item={activeItem.data as any} />
          </div>
        ) : null}
        {activeItem?.type === "field" ? (
          <div className="opacity-90 scale-105 shadow-2xl">
            <CanvasItem
              field={activeItem.data as BuilderField}
              isSelected={true}
              onSelect={() => {}}
              onDelete={() => {}}
              onDuplicate={() => {}}
              isOverlay
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
