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
  getPaletteItems,
  isBookingBlockField,
  PALETTE_ITEMS,
} from "./utils";
import { PaletteItem, StaticPaletteItem } from "./PaletteItem";
import { CanvasItem, StaticCanvasItem } from "./CanvasItem";
import { PropertiesPanel } from "./PropertiesPanel";
import BottomSheet from "../../ui/BottomSheet";
import { useMediaQuery } from "../../../hooks/useMediaQuery";

type Props = {
  fields: BuilderField[];
  onChange: (fields: BuilderField[]) => void;
  onSaveField: (field: BuilderField, nextFields: BuilderField[]) => Promise<void>;
  onDeleteField: (id: number) => Promise<void>;
  onReorder: (fields: BuilderField[]) => Promise<void>;
  locked?: boolean;
  persistEnabled?: boolean;
  mode?: "forms" | "surveys";
  bookingEnabled?: boolean;
};

type PaletteBottomSheetProps = {
  mode: "forms" | "surveys";
  onSelect: (type: VirtualFieldType, label: string) => void;
};

const PALETTE_GROUPS: Record<
  "forms" | "surveys",
  Array<{ title: string; types: VirtualFieldType[] }>
> = {
  forms: [
    { title: "Base", types: ["short_text", "long_text", "email", "phone", "number", "date", "time"] },
    { title: "Scelta", types: ["select", "radio", "checkbox"] },
    { title: "Prenotazione", types: ["booking_block"] },
    { title: "Layout", types: ["section_title", "free_text", "divider", "spacer"] },
    { title: "Altro", types: ["file_upload", "consent"] },
  ],
  surveys: [
    { title: "Base", types: ["section_title", "short_text", "long_text"] },
    { title: "Scelta", types: ["radio", "checkbox", "select"] },
    { title: "Valutazione", types: ["rating_1_5", "nps_0_10"] },
    { title: "Altro", types: ["date", "time", "consent"] },
  ],
};

function PaletteBottomSheetContent({ mode, onSelect }: PaletteBottomSheetProps) {
  const allItems = getPaletteItems(mode);
  const groups = PALETTE_GROUPS[mode];
  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const items = group.types
          .map((t) => allItems.find((i) => i.type === t))
          .filter((item): item is NonNullable<typeof item> => Boolean(item));
        if (items.length === 0) return null;
        return (
          <div key={group.title}>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-400">
              {group.title}
            </p>
            <div className="grid grid-cols-1 gap-2">
              {items.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-left transition active:scale-[0.98] hover:border-brand hover:bg-brand/5"
                  onClick={() => onSelect(item.type, item.label)}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 text-sm font-bold">
                    {item.icon}
                  </span>
                  <p className="text-sm font-semibold text-neutral-900">{item.label}</p>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type BuilderCanvasProps = {
  items: BuilderField[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  handleDelete: (field: BuilderField) => Promise<void>;
  handleDuplicate: (field: BuilderField) => Promise<void>;
  handleMoveField: (field: BuilderField, direction: -1 | 1) => Promise<void>;
  lastKnownOverId: string | null;
  bookingEnabled?: boolean;
  onEnsureBookingBlock?: () => void;
  locked?: boolean;
};

function BuilderCanvas({
  items,
  selectedId,
  setSelectedId,
  handleDelete,
  handleDuplicate,
  handleMoveField,
  lastKnownOverId,
  bookingEnabled = false,
  onEnsureBookingBlock,
  locked,
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
  const hasBookingBlock = items.some((field) => isBookingBlockField(field));

  return (
    <div className="flex flex-col gap-4">
      <div className="form-builder-canvas-heading rounded-[0.85rem] border px-5 py-4 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Canvas modulo</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Informazioni pubbliche</h3>
        <p className="mt-1 text-sm text-slate-500">Organizza sezioni, campi e consenso mantenendo l'ordine reale del form.</p>
      </div>
      <div
        ref={setCanvasNodeRef}
        className={`form-builder-canvas min-h-[60vh] rounded-[0.85rem] border p-6 shadow-sm transition-colors ${
          isCanvasDropTarget
            ? "form-builder-canvas--over border-brand bg-brand/5 ring-2 ring-brand/15"
            : "border-slate-200 bg-[#fbfaf6]"
        }`}
      >
        {bookingEnabled && !hasBookingBlock ? (
          <div
            className="form-builder-booking-link form-builder-booking-link--active mb-4 rounded-[0.85rem] border p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Prenotazione</p>
                <h4 className="mt-1 text-base font-semibold text-slate-950">Giorno, orario e serata</h4>
                <p className="mt-1 text-sm leading-5 text-slate-500">Usa le serate configurate se presenti; altrimenti resta sul flusso standard.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="form-builder-booking-link__button rounded-[0.75rem] px-3 py-2 text-sm font-semibold"
                  disabled={locked || !onEnsureBookingBlock}
                  onClick={() => onEnsureBookingBlock?.()}
                >
                  Inserisci blocco
                </button>
                <a
                  className="form-builder-booking-link__secondary rounded-[0.75rem] px-3 py-2 text-sm font-semibold"
                  href="/org-admin/prenotazioni?section=events"
                >
                  Gestisci serate
                </a>
              </div>
            </div>
          </div>
        ) : null}
        <SortableContext items={items.map((item) => item.key)} strategy={verticalListSortingStrategy}>
          <div
            className="flex flex-wrap gap-4 items-start"
            onClick={() => setSelectedId(null)}
          >
            {items.length === 0 ? (
              <div className="form-builder-empty pointer-events-none flex h-44 w-full flex-col items-center justify-center rounded-[0.85rem] border border-dashed text-slate-400">
                <svg className="w-10 h-10 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                <p className="text-sm font-semibold text-slate-700">Trascina qui un campo per iniziare</p>
                <p className="mt-1 text-xs text-slate-500">Da mobile puoi anche toccare un campo nella libreria.</p>
              </div>
            ) : (
              items.map((field, index) => (
                <CanvasItem
                  key={field.key}
                  field={field}
                  isSelected={selectedId === field.key}
                  onSelect={() => setSelectedId(field.key)}
                  onDelete={() => void handleDelete(field)}
                  onDuplicate={() => void handleDuplicate(field)}
                  onMoveUp={() => void handleMoveField(field, -1)}
                  onMoveDown={() => void handleMoveField(field, 1)}
                  canMoveUp={index > 0}
                  canMoveDown={index < items.length - 1}
                />
              ))
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

export function FormBuilder({
  fields,
  onChange,
  onSaveField,
  onDeleteField,
  onReorder,
  locked,
  persistEnabled = true,
  mode = "forms",
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const [lastKnownOverId, setLastKnownOverId] = useState<string | null>(null);
  const [creatingFieldKeys, setCreatingFieldKeys] = useState<string[]>([]);
  const lastKnownOverIdRef = useRef<string | null>(null);
  const pendingFieldSaveRef = useRef<{ field: BuilderField; items: BuilderField[] } | null>(null);
  const pendingFieldSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creatingFieldKeysRef = useRef<Set<string>>(new Set());
  const queuedCreateUpdatesRef = useRef<Map<string, BuilderField>>(new Map());
  const items = fields;
  const paletteItems = useMemo(() => getPaletteItems(mode), [mode]);

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
    if (!persistEnabled || creatingFieldKeysRef.current.size === 0) {
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
  }, [items, onChange, persistEnabled]);

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

      if (persistEnabled) {
        creatingFieldKeysRef.current.add(newField.key);
        setCreatingFieldKeys(Array.from(creatingFieldKeysRef.current));
      }
      onChange(newItems);
      setSelectedId(newField.key);
      if (persistEnabled) {
        await onSaveField(newField, newItems);
      }
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
        if (persistEnabled) {
          await onReorder(newItems);
        }
      }
    }
  };

  const handleAddFieldFromPalette = async (type: VirtualFieldType, label?: string) => {
    if (locked) return;
    const newField = createFieldFromPaletteItem(type, label);
    const newItems = [...items, newField];
    if (persistEnabled) {
      creatingFieldKeysRef.current.add(newField.key);
      setCreatingFieldKeys(Array.from(creatingFieldKeysRef.current));
    }
    onChange(newItems);
    setSelectedId(newField.key);
    if (persistEnabled) {
      await onSaveField(newField, newItems);
    }
  };

  const handleUpdateSelected = async (updatedField: BuilderField) => {
    const newItems = items.map((f) => (f.key === updatedField.key ? updatedField : f));
    onChange(newItems);
    if (!persistEnabled) {
      return;
    }
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
    if (persistEnabled) {
      await onSaveField(newField, newItems);
    }
  };

  const handleEnsureBookingBlock = async () => {
    if (locked || items.some((field) => isBookingBlockField(field))) return;
    const newField = createFieldFromPaletteItem("booking_block", "Prenotazione");
    const newItems = [...items, newField];
    if (persistEnabled) {
      creatingFieldKeysRef.current.add(newField.key);
      setCreatingFieldKeys(Array.from(creatingFieldKeysRef.current));
    }
    onChange(newItems);
    setSelectedId(newField.key);
    if (persistEnabled) {
      await onSaveField(newField, newItems);
    }
  };

  const handleMoveField = async (field: BuilderField, direction: -1 | 1) => {
    if (locked) return;
    const currentIndex = items.findIndex((item) => item.key === field.key);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) return;
    const nextItems = arrayMove(items, currentIndex, nextIndex);
    onChange(nextItems);
    setSelectedId(field.key);
    if (persistEnabled) {
      await onReorder(nextItems);
    }
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
    if (persistEnabled && fieldToDelete.id > 0) {
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
      <div className="form-builder-shell grid grid-cols-1 items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        {!isMobile && (
          <div className="form-builder-rail sticky top-6 flex max-h-[85vh] flex-col gap-4 overflow-hidden rounded-[0.85rem] border p-4 shadow-sm">
            <div className="form-builder-rail__header border-b px-1 pb-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Libreria campi</p>
              <h3 className="mt-2 text-base font-semibold text-slate-950">Aggiungi al modulo</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">Tocca per aggiungere. Da desktop puoi anche trascinare nel canvas.</p>
            </div>
            <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
              {paletteItems.map((item) => (
                <PaletteItem
                  key={item.type}
                  item={item}
                  onAdd={(paletteItem) => void handleAddFieldFromPalette(paletteItem.type, paletteItem.label)}
                />
              ))}
            </div>
          </div>
        )}

        <BuilderCanvas
          items={items}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          handleDelete={handleDelete}
          handleDuplicate={handleDuplicate}
          handleMoveField={handleMoveField}
          lastKnownOverId={lastKnownOverId}
          bookingEnabled={mode === "forms"}
          onEnsureBookingBlock={() => void handleEnsureBookingBlock()}
          locked={locked}
        />

        {!isMobile && (
          <div className="form-builder-properties sticky top-6 max-h-[85vh] overflow-y-auto rounded-[0.85rem] border p-5 shadow-sm custom-scrollbar">
            <PropertiesPanel
              selectedField={selectedField}
              onChange={handleUpdateSelected}
              locked={Boolean(locked) || (persistEnabled && creatingFieldKeys.includes(selectedId || ""))}
            />
          </div>
        )}
      </div>

      {isMobile && (
        <>
          <button
            type="button"
            className="form-builder-fab"
            onClick={() => setPaletteOpen(true)}
            aria-label="Aggiungi campo"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>

          <BottomSheet open={paletteOpen} onClose={() => setPaletteOpen(false)} title="Aggiungi campo">
            <PaletteBottomSheetContent
              mode={mode}
              onSelect={(type, label) => {
                void handleAddFieldFromPalette(type, label);
                setPaletteOpen(false);
              }}
            />
          </BottomSheet>

          <BottomSheet
            open={Boolean(selectedId)}
            onClose={() => setSelectedId(null)}
            title="Proprietà campo"
          >
            <PropertiesPanel
              selectedField={selectedField}
              onChange={handleUpdateSelected}
              locked={Boolean(locked) || (persistEnabled && creatingFieldKeys.includes(selectedId || ""))}
            />
          </BottomSheet>
        </>
      )}

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
              onMoveUp={() => {}}
              onMoveDown={() => {}}
              canMoveUp={false}
              canMoveDown={false}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
