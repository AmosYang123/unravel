import { Slider } from "@/components/ui/slider";
import { FEELINGS, MODE_SLIDERS } from "@/lib/content";
import type { EntryMode } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  mode: EntryMode;
  values: Record<string, number>;
  onValue: (id: string, v: number) => void;
  feelings: string[];
  onFeelings: (v: string[]) => void;
  showFeelings?: boolean;
  /** The values came from the last time this mode was used, untouched so far. */
  carriedOver?: boolean;
}

const CheckInSliders = ({
  mode,
  values,
  onValue,
  feelings,
  onFeelings,
  showFeelings = true,
  carriedOver = false,
}: Props) => {
  const specs = MODE_SLIDERS[mode] ?? [];
  const toggle = (f: string) =>
    onFeelings(feelings.includes(f) ? feelings.filter((x) => x !== f) : [...feelings, f]);

  if (!specs.length && !showFeelings) return null;

  return (
    <div className="space-y-9">
      {carriedOver && specs.length > 0 && (
        <p className="text-xs text-muted-foreground">Same as last time</p>
      )}

      {specs.map((spec) => {
        const value = values[spec.id] ?? 3;
        return (
          <div key={spec.id} className="space-y-3">
            <p className="text-base leading-snug">{spec.question}</p>
            <Slider
              value={[value]}
              min={1}
              max={5}
              step={1}
              aria-label={spec.question}
              onValueChange={([v]) => onValue(spec.id, v)}
            />
            <div className="flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
              <span>{spec.left}</span>
              <span className="text-center font-display text-sm text-foreground">
                {spec.steps[Math.min(Math.max(value, 1), spec.steps.length) - 1]}
              </span>
              <span className="text-right">{spec.right}</span>
            </div>
          </div>
        );
      })}

      {showFeelings && (
        <div className="space-y-3">
          <span className="text-sm text-muted-foreground">Anything fit? (optional)</span>
          <div className="flex flex-wrap gap-2">
            {FEELINGS.map((f) => {
              const on = feelings.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggle(f)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-all",
                    on
                      ? "border-accent bg-accent/15 text-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground",
                  )}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CheckInSliders;
