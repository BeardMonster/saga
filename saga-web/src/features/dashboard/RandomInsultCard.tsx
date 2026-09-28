import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../core/api/client";

interface Insult {
  id: string;
  text: string;
}

export default function RandomInsultCard() {
  const { data } = useQuery({ queryKey: ["insults"], queryFn: () => apiGet<Insult[]>("/insults") });
  const insults = data?.data ?? [];
  const [index, setIndex] = useState(0);

  // A fresh pick each time the list first loads (or changes size), so a
  // page refresh doesn't always land on the same one.
  useEffect(() => {
    if (insults.length > 0) setIndex(Math.floor(Math.random() * insults.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insults.length]);

  const another = () => {
    if (insults.length < 2) return;
    let next = Math.floor(Math.random() * insults.length);
    if (next === index) next = (next + 1) % insults.length;
    setIndex(next);
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
      <h3 className="font-semibold text-slate-800 dark:text-slate-100">Sharpen your wit</h3>
      {insults.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          No insults saved yet.{" "}
          <Link to="/insults" className="underline text-primary">
            Add some
          </Link>
          .
        </p>
      ) : (
        <>
          <p className="text-slate-700 dark:text-slate-200 italic">"{insults[index]?.text}"</p>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={another} disabled={insults.length < 2}>
              <Shuffle className="h-4 w-4" /> Another
            </Button>
            <Link to="/insults" className="text-xs text-primary hover:underline">
              Manage list →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
