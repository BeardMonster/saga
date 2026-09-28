import type { ReactNode } from "react";
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type SortableHandleProps = Pick<ReturnType<typeof useSortable>, "attributes" | "listeners">;

// A small drag-grip target (⠿) rather than the whole row, so dragging
// doesn't fight with tapping a checkbox, editing a title, or other
// row controls. @dnd-kit is used (not the native HTML5 drag API) because
// it has real touch support. Touch uses press-and-hold (see the sensors
// below) so a scroll swipe that starts on the handle scrolls the page
// instead of reordering; touch-manipulation (not touch-none) on the
// handle is what lets that swipe scroll.
export function DragHandle({ listeners, attributes }: SortableHandleProps) {
  return (
    <span
      {...attributes}
      {...listeners}
      className="inline-flex h-10 w-8 shrink-0 cursor-grab items-center justify-center rounded text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 active:cursor-grabbing touch-manipulation select-none [-webkit-touch-callout:none]"
      aria-label="Drag to reorder"
    >
      ⠿
    </span>
  );
}

function SortableRow({
  id,
  as: Tag = "div",
  children,
}: {
  id: string;
  as?: "div" | "li";
  children: (dragProps: SortableHandleProps) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <Tag ref={setNodeRef} style={style}>
      {children({ attributes, listeners })}
    </Tag>
  );
}

// A generic drag-to-reorder list: give it the items (must each have a
// stable `id`) and a callback that receives the new id order after a drop.
// The caller owns the actual persistence (an API call) — this just handles
// the drag mechanics and hands back the result. `as` controls the wrapper
// element per row — "li" when the caller's own list is a <ul> (so the DOM
// stays valid, not a <div> inside a <ul>), "div" (the default) otherwise.
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  as,
  children,
}: {
  items: T[];
  onReorder: (newOrderIds: string[]) => void;
  as?: "div" | "li";
  children: (item: T, dragProps: SortableHandleProps) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return; // dropped outside this list — no-op, snaps back
    onReorder(arrayMove(items, oldIndex, newIndex).map((i) => i.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => navigator.vibrate?.(15)} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableRow key={item.id} id={item.id} as={as}>
            {(dragProps) => children(item, dragProps)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}
