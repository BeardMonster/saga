import { toast } from "sonner";
import { apiDelete, apiPost } from "./client";
import { queryClient } from "../queryClient";

// Deletes (moves to Trash), then shows a bottom message with an Undo button
// that restores the item straight from Trash. Trash itself stays as the
// longer-term safety net (30 days).
export async function deleteWithUndo(url: string, trashType: string, id: string, label: string) {
  const result = await apiDelete(url);
  toast(`${label} moved to Trash`, {
    duration: 8000,
    action: {
      label: "Undo",
      onClick: async () => {
        try {
          await apiPost(`/trash/${trashType}/${id}/restore`);
          await queryClient.invalidateQueries();
          toast.success(`${label} restored`);
        } catch {
          toast.error(`Couldn't restore ${label.toLowerCase()} — check the Trash page`);
        }
      },
    },
  });
  return result;
}
