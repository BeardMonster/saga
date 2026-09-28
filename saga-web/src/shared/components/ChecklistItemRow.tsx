import { useState } from "react";
import { ArrowRightLeft, EllipsisVertical, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLongPress } from "../hooks/useLongPress";
import MoveToPicker from "./MoveToPicker";
import { GOLD_STAR_ICON, PIXEL_ICON_CLASS } from "../lib/icons";
import InlineEditText from "./InlineEditText";
import { DragHandle, type SortableHandleProps } from "./SortableList";

// One checklist item. Its move/delete menu is a visible "⋮" button on
// devices with a mouse, but on touch screens the button is hidden — it sat
// right where a scrolling thumb lands and got tapped by accident — and the
// same menu opens by pressing and holding the row instead.
export default function ChecklistItemRow({
  item,
  dragProps,
  popped,
  otherChecklists,
  onToggle,
  onRename,
  onMove,
  onDelete,
  onToggleQuickWin,
}: {
  item: { id: string; title: string; isComplete: boolean; isQuickWin?: boolean };
  dragProps: SortableHandleProps;
  popped: boolean;
  otherChecklists: { id: string; name: string; projectName?: string }[];
  onToggle: (origin: { x: number; y: number }) => void;
  onRename: (title: string) => void;
  onMove: (targetChecklistId: string, label: string) => void;
  onDelete: () => void;
  // Omitted entirely on checklists Quick Wins doesn't look at (grocery,
  // notes) — flagging an item there would silently do nothing, since the
  // Home page widget only ever pulls from "generic" checklists.
  onToggleQuickWin?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const longPress = useLongPress(() => setMenuOpen(true));
  const standaloneTargets = otherChecklists.filter((c) => !c.projectName);
  const projectTargets = otherChecklists.filter((c) => c.projectName);

  return (
    <div
      {...longPress}
      className={`relative flex items-center gap-2 group bg-white dark:bg-slate-900 [@media(hover:none)]:select-none [@media(hover:none)]:[-webkit-touch-callout:none] [&_input]:select-text [&_textarea]:select-text ${popped ? "animate-complete-pop" : ""}`}
    >
      <DragHandle {...dragProps} />
      <label className="-mx-1.5 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          checked={item.isComplete}
          onChange={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onToggle({ x: r.left + r.width / 2, y: r.top });
          }}
          aria-label={`Mark "${item.title}" done`}
          className="h-5 w-5 rounded accent-green-600 cursor-pointer"
        />
      </label>
      {onToggleQuickWin && item.isQuickWin && !item.isComplete && (
        <Zap className="h-4 w-4 shrink-0 text-amber-500" aria-label="Quick win" />
      )}
      <InlineEditText
        value={item.title}
        onSave={onRename}
        displayClassName={item.isComplete ? "line-through text-slate-500 dark:text-slate-500" : "text-slate-700 dark:text-slate-200"}
      />
      {popped && (
        <img src={GOLD_STAR_ICON} alt="" className={`absolute left-6 -top-2 w-5 h-5 animate-sparkle-burst ${PIXEL_ICON_CLASS}`} />
      )}
      <div className="relative ml-auto shrink-0">
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Item actions"
              className="[@media(hover:none)]:pointer-events-none [@media(hover:none)]:absolute [@media(hover:none)]:right-0 [@media(hover:none)]:top-0 [@media(hover:none)]:h-8 [@media(hover:none)]:w-8 [@media(hover:none)]:opacity-0"
            >
              <EllipsisVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="overflow-y-auto">
            {onToggleQuickWin && (
              <DropdownMenuItem onSelect={() => setTimeout(onToggleQuickWin, 0)}>
                <Zap className="h-4 w-4" /> {item.isQuickWin ? "Unmark quick win" : "Mark as quick win"}
              </DropdownMenuItem>
            )}
            {otherChecklists.length > 0 && (
              <DropdownMenuItem onSelect={() => setTimeout(() => setPicking(true), 0)}>
                <ArrowRightLeft className="h-4 w-4" /> Move to…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem destructive onSelect={() => setTimeout(onDelete, 0)}>
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {picking && (
        <MoveToPicker
          title="Move item to…"
          groups={[
            { label: "Checklists page", options: standaloneTargets.map((c) => ({ id: c.id, label: c.name })) },
            { label: "Projects page", options: projectTargets.map((c) => ({ id: c.id, label: `${c.projectName} › ${c.name}` })) },
          ]}
          onPick={(id, label) => {
            setPicking(false);
            onMove(id, label);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
