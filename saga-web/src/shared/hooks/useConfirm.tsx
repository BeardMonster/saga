import { useCallback, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmState {
  message: string;
  actionLabel: string;
  resolve: (value: boolean) => void;
}

// A promise-based confirmation dialog, so any delete button anywhere in the
// app can do `if (await confirm("...")) { doDelete() }` without each page
// building its own modal. Render the returned `dialog` once per page.
// `actionLabel` defaults to "Move to Trash" (the normal case) — pass
// something else (e.g. "Delete Forever") for an actually irreversible action
// like the Trash page's permanent-delete, so the button never implies an
// undo that doesn't exist.
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);
  // Keeps the text on screen while the dialog fades out.
  const lastState = useRef<ConfirmState | null>(null);
  if (state) lastState.current = state;
  const shown = state ?? lastState.current;

  const confirm = useCallback((message: string, actionLabel = "Move to Trash") => {
    return new Promise<boolean>((resolve) => setState({ message, actionLabel, resolve }));
  }, []);

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  const dialog = (
    <Dialog open={state !== null} onOpenChange={(open) => !open && close(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{shown?.actionLabel === "Move to Trash" ? "Move to Trash?" : `${shown?.actionLabel ?? "Confirm"}?`}</DialogTitle>
          <DialogDescription>{shown?.message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => close(true)}>
            {shown?.actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, dialog };
}
