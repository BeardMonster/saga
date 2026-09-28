import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "../../core/api/client";

interface SystemAlert {
  id: string;
  source: string;
  message: string;
  createdAt: string;
  resolvedAt: string | null;
  store: { name: string } | null;
}

export default function AlertsPage() {
  const queryClient = useQueryClient();

  const { data } = useQuery({ queryKey: ["alerts", "all"], queryFn: () => apiGet<SystemAlert[]>("/alerts?all=true") });

  const resolve = useMutation({
    mutationFn: (id: string) => apiPatch(`/alerts/${id}/resolve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const alerts = data?.data ?? [];
  const unresolved = alerts.filter((a) => !a.resolvedAt);
  const resolved = alerts.filter((a) => a.resolvedAt);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Alerts</h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
          Things background jobs (like the weekly grocery scan) flagged for you to look at — a site that came back
          with nothing, a store that broke picking a location, that kind of thing. Each one also pushes a
          notification when it happens, since this page isn't something you're expected to watch live.
        </p>
      </div>

      <div className="space-y-2">
        {unresolved.map((alert) => (
          <div key={alert.id} className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                  {alert.source}
                  {alert.store ? ` · ${alert.store.name}` : ""}
                </p>
                <p className="text-sm text-slate-800 dark:text-slate-100 mt-1">{alert.message}</p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{new Date(alert.createdAt).toLocaleString()}</p>
              </div>
              <button
                onClick={() => resolve.mutate(alert.id)}
                disabled={resolve.isPending}
                className="shrink-0 rounded-md bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 px-3 py-1.5 text-sm text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900 disabled:opacity-50"
              >
                Resolve
              </button>
            </div>
          </div>
        ))}
        {unresolved.length === 0 && <p className="text-slate-500 dark:text-slate-500 text-sm">Nothing needs attention right now.</p>}
      </div>

      {resolved.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">Resolved</h3>
          <div className="space-y-2">
            {resolved.map((alert) => (
              <div key={alert.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 opacity-60">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wide">
                  {alert.source}
                  {alert.store ? ` · ${alert.store.name}` : ""}
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{alert.message}</p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{new Date(alert.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
