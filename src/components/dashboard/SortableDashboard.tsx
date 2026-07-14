/**
 * SortableDashboard
 * =================
 * Wraps a set of dashboard widgets in a drag-and-drop grid.
 * Order is persisted in localStorage per `storageKey`.
 * A grip handle appears in the top-left; the rest of each card stays interactive.
 */
import { useEffect, useMemo, useState } from "react";
import { GripVertical, LayoutGrid, RotateCcw } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

export interface DashboardWidget {
  id: string;
  label: string;
  span?: "full" | "half";
  render: () => React.ReactNode;
}

function loadOrder(key: string, defaults: string[]): string[] {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return defaults;
    const arr = JSON.parse(raw) as string[];
    const kept = arr.filter((id) => defaults.includes(id));
    const missing = defaults.filter((id) => !kept.includes(id));
    return [...kept, ...missing];
  } catch {
    return defaults;
  }
}

export function SortableDashboard({
  storageKey,
  widgets,
}: {
  storageKey: string;
  widgets: DashboardWidget[];
}) {
  const defaultIds = useMemo(() => widgets.map((w) => w.id), [widgets]);
  const [order, setOrder] = useState<string[]>(() => loadOrder(storageKey, defaultIds));
  const [locked, setLocked] = useState(true);

  useEffect(() => {
    // Reconcile if the widget list itself changed between mounts.
    setOrder((cur) => {
      const kept = cur.filter((id) => defaultIds.includes(id));
      const missing = defaultIds.filter((id) => !kept.includes(id));
      return [...kept, ...missing];
    });
  }, [defaultIds]);

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(order)); } catch { /* ignore */ }
  }, [order, storageKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (evt: DragEndEvent) => {
    const { active, over } = evt;
    if (!over || active.id === over.id) return;
    setOrder((cur) => {
      const from = cur.indexOf(String(active.id));
      const to = cur.indexOf(String(over.id));
      if (from < 0 || to < 0) return cur;
      return arrayMove(cur, from, to);
    });
  };

  const widgetMap = new Map(widgets.map((w) => [w.id, w] as const));
  const ordered = order.map((id) => widgetMap.get(id)).filter(Boolean) as DashboardWidget[];

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-2">
        <button
          onClick={() => setLocked((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors",
            locked
              ? "border-border bg-card/40 text-muted-foreground hover:text-foreground"
              : "border-primary/50 bg-primary/10 text-primary",
          )}
        >
          <LayoutGrid className="h-3 w-3" /> {locked ? "Rearrange" : "Done"}
        </button>
        {!locked && (
          <button
            onClick={() => setOrder(defaultIds)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card/40 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="grid gap-6 xl:grid-cols-2">
            {ordered.map((w) => (
              <SortableItem key={w.id} id={w.id} span={w.span ?? "full"} locked={locked}>
                {w.render()}
              </SortableItem>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableItem({
  id, span, locked, children,
}: { id: string; span: "full" | "half"; locked: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: locked });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 30 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative",
        span === "full" ? "xl:col-span-2" : "xl:col-span-1",
        !locked && "ring-1 ring-dashed ring-primary/40 rounded-xl",
      )}
    >
      {!locked && (
        <button
          {...attributes}
          {...listeners}
          className="absolute -left-2 top-2 z-10 rounded-md border border-border bg-card p-1 text-muted-foreground shadow-md hover:text-primary cursor-grab active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  );
}
