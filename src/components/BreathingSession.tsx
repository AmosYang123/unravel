import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const PHASES = [
  { label: "Breathe in", seconds: 4, scale: 1 },
  { label: "Hold", seconds: 4, scale: 1 },
  { label: "Breathe out", seconds: 6, scale: 0.62 },
];

const CYCLES_TO_COMPLETE = 4;

const BreathingSession = ({ onDone }: { onDone?: () => void }) => {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(0);
  const [count, setCount] = useState(PHASES[0].seconds);
  const [cycles, setCycles] = useState(0);
  const timer = useRef<number | null>(null);
  const phaseRef = useRef(0);
  const countRef = useRef(PHASES[0].seconds);

  useEffect(() => {
    if (!running) return;
    timer.current = window.setInterval(() => {
      if (countRef.current > 1) {
        countRef.current -= 1;
        setCount(countRef.current);
        return;
      }
      const next = (phaseRef.current + 1) % PHASES.length;
      phaseRef.current = next;
      countRef.current = PHASES[next].seconds;
      setPhase(next);
      setCount(countRef.current);
      if (next === 0) setCycles((n) => n + 1);
    }, 1000);
    return () => {
      if (timer.current) {
        window.clearInterval(timer.current);
        timer.current = null;
      }
    };
  }, [running]);

  useEffect(() => {
    if (cycles >= CYCLES_TO_COMPLETE && running) {
      setRunning(false);
      onDone?.();
    }
  }, [cycles, running, onDone]);

  const current = PHASES[phase];

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <div className="relative flex h-48 w-48 items-center justify-center sm:h-56 sm:w-56">
        <div
          className="absolute inset-0 rounded-full bg-accent/15"
          style={{
            transform: `scale(${running ? current.scale : 0.8})`,
            transition: `transform ${current.seconds}s cubic-bezier(0.4, 0, 0.2, 1)`,
          }}
        />
        <div className="absolute inset-6 rounded-full border border-accent/30" />
        <div className="relative w-32 text-center sm:w-36">
          <p className="truncate font-display text-xl leading-tight sm:text-2xl">
            {running ? current.label : "4 · 4 · 6"}
          </p>
          <p className="mt-1 h-5 text-sm tabular-nums text-muted-foreground">{running ? `${count}` : ""}</p>
        </div>
      </div>

      <p className="max-w-xs text-center text-sm text-muted-foreground">Four slow cycles, about a minute.</p>

      <div className="flex items-center gap-3">
        <Button
          variant={running ? "secondary" : "default"}
          onClick={() => {
            if (running) {
              setRunning(false);
            } else {
              phaseRef.current = 0;
              countRef.current = PHASES[0].seconds;
              setPhase(0);
              setCount(PHASES[0].seconds);
              setCycles(0);
              setRunning(true);
            }
          }}
          className="rounded-full px-6"
        >
          {running ? "Pause" : cycles >= CYCLES_TO_COMPLETE ? "Again" : "Begin"}
        </Button>
        {cycles > 0 && (
          <span className="text-sm text-muted-foreground">
            {cycles} of {CYCLES_TO_COMPLETE} cycles
          </span>
        )}
      </div>
    </div>
  );
};

export default BreathingSession;
