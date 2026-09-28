import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { celebrate, originOf, playUiSound } from "../../shared/lib/celebrate";

type Mode = "double" | "race";
const PRESETS = [5, 10, 15, 25, 45];

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// A body-doubling focus timer: a plain countdown to work alongside, or
// "Race the Clock" — same countdown, framed as a race with a bigger payoff
// for finishing before the buzzer. Session-only (nothing persisted); the
// point is the ambient support of a ticking clock, not a tracked record.
export default function FocusTimer() {
  const [mode, setMode] = useState<Mode>("double");
  const [minutes, setMinutes] = useState(15);
  // null = idle (picking a duration). Once started, ticks down to 0 while
  // `running` is true; hitting 0 flips `running` off and shows "time's up".
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  // Only (re)creates the interval when a session starts or stops — not on
  // every tick — so the countdown can't drift from being re-armed each second.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSecondsLeft((s) => (s !== null ? s - 1 : s)), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (running && secondsLeft !== null && secondsLeft <= 0) {
      setRunning(false);
      playUiSound("timerDone");
    }
  }, [secondsLeft, running]);

  const start = () => {
    setSecondsLeft(minutes * 60);
    setRunning(true);
  };
  const stop = () => {
    setRunning(false);
    setSecondsLeft(null);
  };
  const finishEarly = (e: React.MouseEvent) => {
    setRunning(false);
    celebrate("checklist", originOf(e), "raceWin");
    setSecondsLeft(null);
  };

  const timeUp = !running && secondsLeft === 0;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3">
      <div>
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Focus timer</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          A clock running alongside you (body doubling), or race it to finish before it runs out.
        </p>
      </div>

      {!running && !timeUp && (
        <div className="space-y-3">
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="sr-only">Mode</legend>
            {[
              { value: "double" as const, label: "Body double", hint: "Just keep me company" },
              { value: "race" as const, label: "Race the clock", hint: "Beat it before it ends" },
            ].map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setMode(o.value)}
                className={`min-h-14 rounded-xl border px-3 py-2 text-left text-sm ${
                  mode === o.value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                <span className="block font-medium">{o.label}</span>
                <span className="block text-xs opacity-80">{o.hint}</span>
              </button>
            ))}
          </fieldset>

          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutes(m)}
                className={`min-h-11 min-w-11 rounded-full border px-3 text-sm font-medium ${
                  minutes === m
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                }`}
              >
                {m}m
              </button>
            ))}
          </div>

          <Button onClick={start} className="w-full">
            {mode === "race" ? "Start the race" : "Start focus session"}
          </Button>
        </div>
      )}

      {running && secondsLeft !== null && (
        <div className="space-y-3 text-center">
          <p className="text-5xl font-bold tabular-nums text-slate-800 dark:text-slate-100">{formatClock(Math.max(0, secondsLeft))}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">{mode === "race" ? "Racing the clock — go!" : "Working alongside you."}</p>
          <div className="flex gap-2">
            {mode === "race" && (
              <Button onClick={finishEarly} className="flex-1">
                I finished! 🎉
              </Button>
            )}
            <Button variant="ghost" onClick={stop} className={mode === "race" ? undefined : "flex-1"}>
              Stop
            </Button>
          </div>
        </div>
      )}

      {timeUp && (
        <div className="space-y-3 text-center">
          <p className="text-lg font-medium text-slate-800 dark:text-slate-100">Time's up.</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {mode === "race" ? "No worries if it wasn't done — go again, or pick a longer time next round." : "Hope that helped. Go again whenever."}
          </p>
          <Button variant="secondary" onClick={() => setSecondsLeft(null)} className="w-full">
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
