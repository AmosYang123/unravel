import { StyleSheet, Text, View } from "react-native";
import { Chip, StepSlider } from "@/components/ui";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";
import { FEELINGS, MODE_SLIDERS } from "@/lib/content";
import type { EntryMode } from "@/lib/types";

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

/**
 * Ported from src/components/CheckInSliders.tsx. The web slider is a
 * continuous drag with a 1-5 step; StepSlider from the ui kit is the RN
 * stand-in already built for exactly that shape (see its own doc comment).
 */
export function CheckInSliders({
  mode,
  values,
  onValue,
  feelings,
  onFeelings,
  showFeelings = true,
  carriedOver = false,
}: Props) {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const specs = MODE_SLIDERS[mode] ?? [];
  const toggle = (f: string) =>
    onFeelings(feelings.includes(f) ? feelings.filter((x) => x !== f) : [...feelings, f]);

  if (!specs.length && !showFeelings) return null;

  return (
    <View style={styles.container}>
      {carriedOver && specs.length > 0 && (
        <Text style={[styles.carried, { color: theme.colors.mutedForeground }]}>Same as last time</Text>
      )}

      {specs.map((spec) => {
        const value = values[spec.id] ?? 3;
        const labels = spec.steps as unknown as [string, string, string, string, string];
        return (
          <View key={spec.id} style={styles.sliderBlock}>
            <Text style={[styles.question, { color: theme.colors.foreground }]}>{spec.question}</Text>
            <StepSlider value={value} onChange={(v) => onValue(spec.id, v)} labels={labels} accessibilityLabel={spec.question} />
            <View style={styles.endsRow}>
              <Text style={[styles.endLabel, { color: theme.colors.mutedForeground }]}>{spec.left}</Text>
              <Text style={[styles.endLabel, styles.endLabelRight, { color: theme.colors.mutedForeground }]}>
                {spec.right}
              </Text>
            </View>
          </View>
        );
      })}

      {showFeelings && (
        <View style={styles.feelingsBlock}>
          <Text style={[styles.feelingsLabel, { color: theme.colors.mutedForeground }]}>Anything fit? (optional)</Text>
          <View style={styles.feelingsWrap}>
            {FEELINGS.map((f) => (
              <Chip key={f} label={f} selected={feelings.includes(f)} onPress={() => toggle(f)} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  container: { gap: 36 },
  carried: { fontFamily: fonts.body, fontSize: 12 },
  sliderBlock: { gap: 12 },
  question: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22 },
  endsRow: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  endLabel: { flex: 1, fontFamily: fonts.body, fontSize: 12 },
  endLabelRight: { textAlign: "right" },
  feelingsBlock: { gap: 12 },
  feelingsLabel: { fontFamily: fonts.body, fontSize: 14 },
  feelingsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});

export default CheckInSliders;
