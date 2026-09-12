import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";
import { withAlpha } from "@/components/ui/colorUtils";

const PHASES = [
  { label: "Breathe in", seconds: 4, scale: 1 },
  { label: "Hold", seconds: 4, scale: 1 },
  { label: "Breathe out", seconds: 6, scale: 0.62 },
];

const CYCLES_TO_COMPLETE = 4;
const CIRCLE_SIZE = 208;

/**
 * Ported from src/components/BreathingSession.tsx. The web version animates
 * a CSS `transform: scale()` with a `transition`; RN has no declarative
 * transition on a style change, so the same 1/4/6s scale tween is driven with
 * Animated.timing instead — same durations, easing and end states.
 */
const BreathingSession = ({ onDone }: { onDone?: () => void }) => {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(0);
  const [count, setCount] = useState(PHASES[0]!.seconds);
  const [cycles, setCycles] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef(0);
  const countRef = useRef(PHASES[0]!.seconds);
  const scale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => {
      if (countRef.current > 1) {
        countRef.current -= 1;
        setCount(countRef.current);
        return;
      }
      const next = (phaseRef.current + 1) % PHASES.length;
      phaseRef.current = next;
      countRef.current = PHASES[next]!.seconds;
      setPhase(next);
      setCount(countRef.current);
      if (next === 0) setCycles((n) => n + 1);
    }, 1000);
    return () => {
      if (timer.current) {
        clearInterval(timer.current);
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

  useEffect(() => {
    const target = running ? PHASES[phase]!.scale : 0.8;
    Animated.timing(scale, {
      toValue: target,
      duration: running ? PHASES[phase]!.seconds * 1000 : 200,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [running, phase, scale]);

  const current = PHASES[phase]!;

  return (
    <View style={styles.container}>
      <View style={styles.circleWrap}>
        <Animated.View
          style={[
            styles.circleFill,
            { backgroundColor: withAlpha(theme.colors.accent, 0.15), transform: [{ scale }] },
          ]}
        />
        <View style={[styles.circleRing, { borderColor: withAlpha(theme.colors.accent, 0.3) }]} />
        <View style={styles.center}>
          <Text style={[styles.phaseLabel, { color: theme.colors.foreground }]} numberOfLines={1}>
            {running ? current.label : "4 · 4 · 6"}
          </Text>
          <Text style={[styles.count, { color: theme.colors.mutedForeground }]}>{running ? `${count}` : " "}</Text>
        </View>
      </View>

      <Text style={[styles.blurb, { color: theme.colors.mutedForeground }]}>
        Four slow cycles, about a minute.
      </Text>

      <View style={styles.controls}>
        <Button
          label={running ? "Pause" : cycles >= CYCLES_TO_COMPLETE ? "Again" : "Begin"}
          onPress={() => {
            if (running) {
              setRunning(false);
            } else {
              phaseRef.current = 0;
              countRef.current = PHASES[0]!.seconds;
              setPhase(0);
              setCount(PHASES[0]!.seconds);
              setCycles(0);
              setRunning(true);
            }
          }}
        />
        {cycles > 0 && (
          <Text style={[styles.cyclesLabel, { color: theme.colors.mutedForeground }]}>
            {cycles} of {CYCLES_TO_COMPLETE} cycles
          </Text>
        )}
      </View>
    </View>
  );
};

const createStyles = (fonts: FontSet) => StyleSheet.create({
  container: { alignItems: "center", gap: 24, paddingVertical: 24 },
  circleWrap: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  circleFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: CIRCLE_SIZE / 2,
  },
  circleRing: {
    position: "absolute",
    top: 24,
    left: 24,
    right: 24,
    bottom: 24,
    borderRadius: (CIRCLE_SIZE - 48) / 2,
    borderWidth: 1,
  },
  center: { width: 144, alignItems: "center" },
  phaseLabel: { fontFamily: fonts.display, fontSize: 22, textAlign: "center" },
  count: { marginTop: 4, height: 20, fontFamily: fonts.body, fontSize: 14, fontVariant: ["tabular-nums"] },
  blurb: { maxWidth: 280, textAlign: "center", fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  controls: { flexDirection: "row", alignItems: "center", gap: 12 },
  cyclesLabel: { fontFamily: fonts.body, fontSize: 14 },
});

export default BreathingSession;
