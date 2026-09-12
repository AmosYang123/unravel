import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useSettings } from "@/lib/store";
import type { ThemeName } from "@/lib/types";
import { cn } from "@/lib/utils";
import SettingRow from "./SettingRow";

const THEMES: { id: ThemeName; label: string; swatch: string[] }[] = [
  { id: "linen", label: "Linen", swatch: ["#f4efe6", "#e6ded1", "#c48c6e"] },
  { id: "blush", label: "Blush", swatch: ["#fbeaee", "#f4d5dd", "#d97e9c"] },
  { id: "mist", label: "Mist", swatch: ["#e4f0f8", "#cfe3f0", "#4a95bf"] },
  { id: "sage", label: "Sage", swatch: ["#e8f6ec", "#d3ebd9", "#49a179"] },
  { id: "lilac", label: "Lilac", swatch: ["#f0e9f9", "#e2d6f3", "#a077d1"] },
  { id: "dusk", label: "Dusk", swatch: ["#181a26", "#262a3b", "#a58ad6"] },
  { id: "ink", label: "Ink", swatch: ["#141312", "#242220", "#c99a63"] },
];

const FONTS = [
  { display: "Fraunces", body: "Karla", label: "Soft serif" },
  { display: "Karla", body: "Karla", label: "All sans" },
  { display: "Fraunces", body: "Fraunces", label: "All serif" },
];

const AppearanceSection = () => {
  const { settings, update } = useSettings();
  const [open, setOpen] = useState(false);

  const themeLabel = THEMES.find((t) => t.id === settings.theme)?.label ?? settings.theme;
  const fontLabel =
    FONTS.find((f) => f.display === settings.displayFont && f.body === settings.bodyFont)?.label ??
    settings.displayFont;

  return (
    <>
      <SettingRow
        title="Appearance"
        value={`${themeLabel}, ${fontLabel}`}
        onClick={() => setOpen(true)}
      />

      <Dialog open={open} onClose={() => setOpen(false)} title="Appearance">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => update({ theme: t.id })}
              className={cn(
                "surface surface-hover p-4 text-left",
                settings.theme === t.id && "border-accent/60 ring-1 ring-accent/30",
              )}
            >
              <span className="flex gap-1.5">
                {t.swatch.map((c) => (
                  <span
                    key={c}
                    className="h-5 w-5 rounded-full border shadow-sm"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </span>
              <span
                className={cn(
                  "mt-3 block text-sm",
                  settings.theme === t.id ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {t.label}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {FONTS.map((f) => (
            <button
              key={f.label}
              onClick={() => update({ displayFont: f.display, bodyFont: f.body })}
              className={cn(
                "chip px-4 py-2 text-sm",
                settings.displayFont === f.display && settings.bodyFont === f.body && "chip-active",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Dialog>
    </>
  );
};

export default AppearanceSection;
