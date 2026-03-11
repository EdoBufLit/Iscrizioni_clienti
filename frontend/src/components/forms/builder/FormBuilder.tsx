import { useState, useMemo, useEffect, useRef } from "react";
import {
  type CollisionDetection,
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
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
import { PaletteItem, StaticPaletteItem } from "./PaletteItem";
import { CanvasItem, StaticCanvasItem } from "./CanvasItem";
import { PropertiesPanel } from "./PropertiesPanel";

type Props = {
  fields: BuilderField[];
  onChange: (fields: BuilderField[]) => void;
  onSaveField: (field: BuilderField, nextFields: BuilderField[]) => Promise<void>;
  onDeleteField: (id: number) => Promise<void>;
  onReorder: (fields: BuilderField[]) => Promise<void>;
  locked?: boolean;
};

type BuilderCanvasProps = {
  items: BuilderField[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  handleDelete: (field: BuilderField) => Promise<void>;
  handleDuplicate: (field: BuilderField) => Promise<void>;
  lastKnownOverId: string | null;
};

function BuilderCanvas({
  items,
  selectedId,
  setSelectedId,
  handleDelete,
  handleDuplicate,
  lastKnownOverId,
}: BuilderCanvasProps) {
  const { isOver: isCanvasOver, setNodeRef: setCanvasNodeRef } = useDroppable({
    id: FORM_BUILDER_CANVAS_ID,
    data: {
      accepts: ["palette", "canvas"],
      type: "canvas-dropzone",
    },
  });

  const isCanvasDropTarget =
    isCanvasOver
    || lastKnownOverId === FORM_BUILDER_CANVAS_ID
    || items.some((field) => field.key === lastKnownOverId);

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={setCanvasNodeRef}
        className={`rounded-3xl border p-6 shadow-inner min-h-[60vh] transition-colors ${
          isCanvasDropTarget
            ? "border-brand bg-brand/5 ring-2 ring-brand/20"
            : "border-neutral-200 bg-neutral-50/50"
        }`}
      >
        <SortableContext items={items.map((item) => item.key)} strategy={verticalListSortingStrategy}>
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
                  onDelete={() => void handleDelete(field)}
                  onDuplicate={() => void handleDuplicate(field)}
                />
              ))
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

export function FormBuilder({ fields, onChange, onSaveField, onDeleteField, onReorder, locked }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastKnownOverId, setLastKnownOverId] = useState<string | null>(null);
  const [creatingFieldKeys, setCreatingFieldKeys] = useState<string[]>([]);
  const lastKnownOverIdRef = useRef<string | null>(null);
  const pendingFieldSaveRef = useRef<{ field: BuilderField; items: BuilderField[] } | null>(null);
  const pendingFieldSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creatingFieldKeysRef = useRef<Set<string>>(new Set());
  const queuedCreateUpdatesRef = useRef<Map<string, BuilderField>>(new Map());
  const items = fields;

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

  useEffect(() => {
    if (selectedId && !items.some((field) => field.key === selectedId)) {
      setSelectedId(null);
    }
  }, [items, selectedId]);

  const collisionDetection = useMemo<CollisionDetection>(
    () => (args) => {
      const pointerHits = pointerWithin(args);
      if (pointerHits.length > 0) return pointerHits;

      const rectHits = rectIntersection(args);
      if (rectHits.length > 0) return rectHits;

      return closestCenter(args);
    },
    [],
  );

  const selectedField = useMemo(
    () => items.find((f) => f.key === selectedId) || null,
    [items, selectedId]
  );

  useEffect(() => {
    return () => {
      if (pendingFieldSaveTimerRef.current) {
        clearTimeout(pendingFieldSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (creatingFieldKeysRef.current.size === 0) {
      return;
    }

    let resolvedKey = false;

    for (const key of Array.from(creatingFieldKeysRef.current)) {
      const persistedField = items.find((field) => field.key === key && field.id > 0);
      if (!persistedField) {
        continue;
      }

      creatingFieldKeysRef.current.delete(key);
      resolvedKey = true;

      const queuedField = queuedCreateUpdatesRef.current.get(key);
      queuedCreateUpdatesRef.current.delete(key);

      if (!queuedField) {
        continue;
      }

      const mergedField: BuilderField = {
        ...queuedField,
        id: persistedField.id,
        key: persistedField.key,
        type: persistedField.type,
      };
      const nextItems = items.map((field) => (field.key === key ? mergedField : field));
      onChange(nextItems);
      scheduleFieldSave(mergedField, nextItems);
    }

    if (resolvedKey) {
      setCreatingFieldKeys(Array.from(creatingFieldKeysRef.current));
    }
  }, [items, onChange]);

  const scheduleFieldSave = (field: BuilderField, nextItems: BuilderField[]) => {
    pendingFieldSaveRef.current = { field, items: nextItems };
    if (pendingFieldSaveTimerRef.current) {
      clearTimeout(pendingFieldSaveTimerRef.current);
    }
    pendingFieldSaveTimerRef.current = setTimeout(() => {
      const pending = pendingFieldSaveRef.current;
      pendingFieldSaveRef.current = null;
      pendingFieldSaveTimerRef.current = null;
      if (!pending) return;
      void onSaveField(pending.field, pending.items);
    }, 350);
  };

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
    setLastKnownOverId(null);
    lastKnownOverIdRef.current = null;
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    setActiveId(null);
    setLastKnownOverId(null);
    lastKnownOverIdRef.current = null;
  };

  const handleDragOver = (event: DragOverEvent) => {
    const nextOverId = event.over?.id?.toString() ?? null;
    if (nextOverId) {
      lastKnownOverIdRef.current = nextOverId;
      setLastKnownOverId(nextOverId);
      return;
    }
    setLastKnownOverId(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    const resolvedOverId = over?.id?.toString() ?? lastKnownOverIdRef.current;
    setLastKnownOverId(null);
    lastKnownOverIdRef.current = null;

    if (!resolvedOverId) return;

    const activeIdStr = active.id.toString();
    const activeSource = active.data.current?.source;

    if (activeSource === "palette" || activeIdStr.startsWith("palette-")) {
      const type =
        (active.data.current?.itemType as VirtualFieldType | undefined)
        || (activeIdStr.replace("palette-", "") as VirtualFieldType);
      const label = active.data.current?.label as string | undefined;
      const newField = createFieldFromPaletteItem(type, label);
      const overIndex =
        resolvedOverId === FORM_BUILDER_CANVAS_ID
          ? items.length
          : items.findIndex((field) => field.key === resolvedOverId);
      const insertIndex = overIndex >= 0 ? overIndex : items.length;
      const newItems = [
        ...items.slice(0, insertIndex),
        newField,
        ...items.slice(insertIndex),
      ];

      creatingFieldKeysRef.current.add(newField.key);
      setCreatingFieldKeys(Array.from(creatingFieldKeysRef.current));
      onChange(newItems);
      setSelectedId(newField.key);
      await onSaveField(newField, newItems);
      return;
    }

    if (activeSource === "canvas" && active.id.toString() !== resolvedOverId) {
      const oldIndex = items.findIndex((f) => f.key === active.id);
      const newIndex =
        resolvedOverId === FORM_BUILDER_CANVAS_ID
          ? items.length - 1
          : items.findIndex((f) => f.key === resolvedOverId);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newItems = arrayMove(items, oldIndex, newIndex);
        onChange(newItems);
        await onReorder(newItems);
      }
    }
  };

  const handleUpdateSelected = async (updatedField: BuilderField) => {
    const newItems = items.map((f) => (f.key === updatedField.key ? updatedField : f));
    onChange(newItems);
    if (creatingFieldKeysRef.current.has(updatedField.key)) {
      queuedCreateUpdatesRef.current.set(updatedField.key, updatedField);
      return;
    }
    scheduleFieldSave(updatedField, newItems);
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
    
    onChange(newItems);
    setSelectedId(newField.key);
    await onSaveField(newField, newItems);
  };

  const handleDelete = async (fieldToDelete: BuilderField) => {
    if (selectedId === fieldToDelete.key) {
      setSelectedId(null);
    }
    if (creatingFieldKeysRef.current.has(fieldToDelete.key)) {
      creatingFieldKeysRef.current.delete(fieldToDelete.key);
      queuedCreateUpdatesRef.current.delete(fieldToDelete.key);
      setCreatingFieldKeys(Array.from(creatingFieldKeysRef.current));
    }
    if (pendingFieldSaveRef.current?.field.key === fieldToDelete.key) {
      pendingFieldSaveRef.current = null;
      if (pendingFieldSaveTimerRef.current) {
        clearTimeout(pendingFieldSaveTimerRef.current);
        pendingFieldSaveTimerRef.current = null;
      }
    }
    const newItems = items.filter(f => f.key !== fieldToDelete.key);
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
      collisionDetection={collisionDetection}
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

        <BuilderCanvas
          items={items}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          handleDelete={handleDelete}
          handleDuplicate={handleDuplicate}
          lastKnownOverId={lastKnownOverId}
        />

        {/* Right Column: Properties */}
        <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm sticky top-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
          <PropertiesPanel
            selectedField={selectedField}
            onChange={handleUpdateSelected}
            locked={locked || creatingFieldKeys.includes(selectedId || "")}
          />
        </div>
      </div>

      <DragOverlay dropAnimation={dropAnimation}>
        {activeItem?.type === "palette" ? (
          <div className="pointer-events-none opacity-90 scale-105 shadow-xl ring-2 ring-brand/30 rounded-xl overflow-hidden">
            <StaticPaletteItem item={activeItem.data as any} />
          </div>
        ) : null}
        {activeItem?.type === "field" ? (
          <div className="pointer-events-none opacity-90 scale-105 shadow-2xl">
            <StaticCanvasItem
              field={activeItem.data as BuilderField}
              isSelected={true}
              onSelect={() => {}}
              onDelete={() => {}}
              onDuplicate={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
