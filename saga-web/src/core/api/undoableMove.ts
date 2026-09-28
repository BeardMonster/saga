import { toast } from "sonner";
import { queryClient } from "../queryClient";

// Shown after something is moved: a bottom message with an Undo button that
// runs `undo` (which should move it back) and refreshes every list.
export function notifyMoved(message: string, undo: () => Promise<unknown>, doneMessage = "Move undone") {
  toast(message, {
    duration: 8000,
    action: {
      label: "Undo",
      onClick: async () => {
        try {
          await undo();
          await queryClient.invalidateQueries();
          toast.success(doneMessage);
        } catch {
          toast.error("Couldn't undo that");
        }
      },
    },
  });
}
