import { Pressable, StyleSheet, Text, View } from "react-native";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";
import { withAlpha } from "./colorUtils";

const STEP_COUNT = 5;

export interface StepSliderProps {
  /** 1-5. */
  value: number;
  onChange: (value: number) => void;
  /** Exactly 5 labels, one per step, matching e.g. MODE_SLIDERS[mode][n].steps in lib/content.ts. */
  labels: readonly [string, string, string, string, string];
  /** Describes what's being rated, e.g. the slider's question. Required — this is the only accessible name the control has. */
  accessibilityLabel: string;
  disabled?: boolean;
}

/**
 * Every slider in this app (src/components/ui/slider.tsx via CheckInSliders)
 * is 5 discrete steps, never a continuous drag — so instead of pulling in a
 * slider library this is 5 tappable segments with the active step's label
 * printed beneath, which is both simpler and more accessible than faking a
 * draggable thumb on native.
 */
export function StepSlider({ value, onChange, labels, accessibilityLabel, disabled = false }: StepSliderProps) {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const clamped = Math.min(Math.max(Math.round(value), 1), STEP_COUNT);
  const activeLabel = labels[clamped - 1] ?? "";

  return (
    <View>
      <View style={styles.track}>
        {labels.map((label, index) => {
          const step = index + 1;
          const selected = step === clamped;
          return (
            <Pressable
              key={step}
              onPress={() => onChange(step)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`${accessibilityLabel}: ${label}`}
              accessibilityState={{ selected, disabled }}
              hitSlop={4}
              style={styles.segmentHit}
            >
              <View
                style={[
                  styles.segment,
                  {
                    backgroundColor: selected ? theme.colors.accent : withAlpha(theme.colors.mutedForeground, 0.25),
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.activeLabel, { color: theme.colors.foreground }]}>{activeLabel}</Text>
    </View>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  track: {
    flexDirection: "row",
    gap: 6,
  },
  segmentHit: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
  },
  segment: {
    height: 8,
    borderRadius: 999,
  },
  activeLabel: {
    marginTop: 10,
    textAlign: "center",
    fontFamily: fonts.displayMedium,
    fontSize: 15,
  },
});
