import { useState } from "react";
import { ArrowRightLeft, EllipsisVertical, ExternalLink, Pin, PinOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLongPress } from "../../shared/hooks/useLongPress";
import { GIFT_BOX_PURCHASED_ICON, GIFT_BOX_GIVEN_ICON, PIXEL_ICON_CLASS } from "../../shared/lib/icons";
import InlineEditText from "../../shared/components/InlineEditText";
import { DragHandle, type SortableHandleProps } from "../../shared/components/SortableList";
import MoveToPicker, { type PickerGroup } from "../../shared/components/MoveToPicker";
import type { NoteItem } from "./types";

const LABEL_RE = /^([^:/]{1,40}?):\s+(.+)$/;

export function splitLabel(raw: string): { label: string | null; text: string } {
  const m = raw.trim().match(LABEL_RE);
  return m ? { label: m[1].trim(), text: m[2].trim() } : { label: null, text: raw.trim() };
}

const composite = (item: { label: string | null; text: string }) => (item.label ? `${item.label}: ${item.text}` : item.text);
const firstUrl = (text: string) => text.match(/https?:\/\/\S+/)?.[0];

type GiftStatus = "idea" | "purchased" | "given";

// One bullet in a note. Like checklist items, the actions menu is a visible
// "⋮" only where there's a mouse; on touch screens press and hold the row
// (a permanent button there gets hit by a scrolling thumb). Items in the
// Gift Ideas section also carry a status (Idea / Purchased / Given).
export default function NoteItemRow({
  item,
  isGift,
  dragProps,
  onSave,
  onStatus,
  onTogglePin,
  moveGroups,
  onMove,
  onDelete,
}: {
  item: NoteItem;
  isGift: boolean;
  dragProps?: SortableHandleProps;
  onSave: (value: { label: string | null; text: string }) => void;
  onStatus: (status: GiftStatus) => void;
  onTogglePin: () => void;
  moveGroups: PickerGroup[];
  onMove: (noteId: string, label: string) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const longPress = useLongPress(() => setMenuOpen(true));
  const url = firstUrl(item.text);
  const status: GiftStatus = item.giftStatus ?? "idea";

  return (
    <>
      <div {...longPress} id={`item-${item.id}`} className="relative flex scroll-mt-24 items-center gap-2 rounded-lg [@media(hover:none)]:select-none [@media(hover:none)]:[-webkit-touch-callout:none] [&_input]:select-text [&_textarea]:select-text">
        {dragProps ? <DragHandle {...dragProps} /> : <span className="w-4" />}
        {item.isPinned && <Pin className="h-3.5 w-3.5 shrink-0 text-indigo-700 dark:text-indigo-300" aria-label="Pinned to card" />}
        {isGift && status === "purchased" && <img src={GIFT_BOX_PURCHASED_ICON} alt="" className={`h-4 w-4 shrink-0 ${PIXEL_ICON_CLASS}`} />}
        {isGift && status === "given" && <img src={GIFT_BOX_GIVEN_ICON} alt="" className={`h-4 w-4 shrink-0 ${PIXEL_ICON_CLASS}`} />}
        <div className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200 break-words">
          <InlineEditText
            value={composite(item)}
            onSave={(v) => onSave(splitLabel(v))}
            displayClassName={isGift && status === "given" ? "line-through text-slate-600 dark:text-slate-500" : undefined}
          />
        </div>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" aria-label="Open link" className="shrink-0 p-2 text-indigo-700 dark:text-indigo-300">
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        {isGift && (
          <Select value={status} onChange={(e) => onStatus(e.target.value as GiftStatus)} aria-label="Gift status" className="h-9 w-28 shrink-0 text-xs md:h-10">
            <option value="idea">Idea</option>
            <option value="purchased">Purchased</option>
            <option value="given">Given</option>
          </Select>
        )}
        <div className="relative shrink-0">
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Item actions"
                className="h-10 w-10 md:h-9 md:w-9 [@media(hover:none)]:pointer-events-none [@media(hover:none)]:absolute [@media(hover:none)]:right-0 [@media(hover:none)]:top-0 [@media(hover:none)]:h-8 [@media(hover:none)]:w-8 [@media(hover:none)]:opacity-0"
              >
                <EllipsisVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onTogglePin}>
                {item.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                {item.isPinned ? "Unpin from card" : "Pin to card"}
              </DropdownMenuItem>
              {moveGroups.some((g) => g.options.length > 0) && (
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
      </div>
      {picking && (
        <MoveToPicker
          title="Move item to…"
          groups={moveGroups}
          onPick={(id, label) => {
            setPicking(false);
            onMove(id, label);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {item.children.length > 0 && (
        <ul className="ml-9 mt-0.5 space-y-0.5 text-sm text-slate-600 dark:text-slate-300">
          {item.children.map((c) => (
            <li key={c.id} className="break-words">
              • {composite(c)}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
