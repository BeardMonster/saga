import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete } from "../../core/api/client";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { EllipsisVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface TrashItem {
  type: string;
  id: string;
  label: string;
  title: string;
  deletedAt: string;
  purgeAt: string;
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export default function TrashPage() {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const { data } = useQuery({ queryKey: ["trash"], queryFn: () => apiGet<TrashItem[]>("/trash") });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["trash"] });

  const restore = useMutation({
    mutationFn: (item: TrashItem) => apiPost(`/trash/${item.type}/${item.id}/restore`),
    onSuccess: () => {
      invalidate();
      // A restored item can affect almost any list in the app (a checklist
      // item restored under a project, a transaction back on an account) —
      // simplest to refresh everything rather than track every possible
      // affected query key here.
      queryClient.invalidateQueries();
    },
  });

  const purgeForever = useMutation({
    mutationFn: (item: TrashItem) => apiDelete(`/trash/${item.type}/${item.id}`),
    onSuccess: invalidate,
  });

  const items = data?.data ?? [];

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Trash</h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
          Deleted items sit here for 30 days before being permanently removed (including any photos or recordings
          attached to them). Restore anything you didn't mean to delete.
        </p>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const days = daysUntil(item.purgeAt);
          return (
            <div
              key={`${item.type}-${item.id}`}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">{item.label}</p>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{item.title}</p>
                <p className={`text-xs mt-0.5 ${days <= 3 ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-400"}`}>
                  {days === 0 ? "Purges today" : `${days} day${days === 1 ? "" : "s"} left`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="secondary" size="sm" onClick={() => restore.mutate(item)} disabled={restore.isPending}>
                  Restore
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="More actions">
                      <EllipsisVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      destructive
                      onSelect={() =>
                        setTimeout(async () => {
                          if (
                            await confirm(
                              `Permanently delete "${item.title}"? This cannot be undone — it won't wait out the 30 days.`,
                              "Delete Forever",
                            )
                          ) {
                            purgeForever.mutate(item);
                          }
                        }, 0)
                      }
                    >
                      <Trash2 className="h-4 w-4" /> Delete forever
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
        {items.length === 0 && <p className="text-slate-500 dark:text-slate-500 text-sm">Trash is empty.</p>}
      </div>
      {dialog}
    </div>
  );
}
