import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet } from "../../core/api/client";

interface SystemAlert {
  id: string;
  message: string;
}

// Site-wide, not tucked into a page — Brandon's explicit about only
// checking in periodically rather than watching the site live, so this has
// to be the first thing visible whenever he does open it. Polls every 5
// minutes rather than on every navigation; a push notification (sent when
// the alert is first created, see alerts/service.ts) is the real
// "reaches him promptly" channel, this is just the persistent reminder.
export default function AlertBanner() {
  const { data } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => apiGet<SystemAlert[]>("/alerts"),
    refetchInterval: 5 * 60 * 1000,
  });

  const alerts = data?.data ?? [];
  if (alerts.length === 0) return null;

  return (
    <Link
      to="/alerts"
      className="block bg-amber-100 dark:bg-amber-950 border-b border-amber-300 dark:border-amber-800 px-4 py-2 text-sm text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900"
    >
      ⚠️ {alerts.length} alert{alerts.length === 1 ? "" : "s"} need{alerts.length === 1 ? "s" : ""} attention —{" "}
      {alerts[0].message.length > 80 ? `${alerts[0].message.slice(0, 80)}…` : alerts[0].message}
    </Link>
  );
}
