import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";
import { withAlpha } from "./colorUtils";

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  /** Milliseconds to hold the toast. Defaults to 3500, or 10000 when an action is present. */
  duration?: number;
}

interface ToastState {
  id: number;
  message: string;
  action?: ToastAction;
  duration: number;
}

type Listener = (state: ToastState) => void;
let currentListener: Listener | null = null;
let nextId = 0;

/**
 * Imperative call standing in for `sonner`'s `toast()`, which doesn't exist
 * on RN. Call it from anywhere; whichever <ToastProvider> is mounted picks it
 * up. If none is mounted, this is a silent no-op rather than a crash.
 *
 * `toast("Deleted. Undo", { action: { label: "Undo", onPress } })` holds for
 * ~10s by default, matching the web app's undo-delete toast.
 */
export function toast(message: string, options: ToastOptions = {}): void {
  const duration = options.duration ?? (options.action ? 10000 : 3500);
  currentListener?.({ id: nextId++, message, action: options.action, duration });
}

/**
 * Mount once near the root of the app (a job for whoever owns app/_layout.tsx
 * — this file only exports the provider and the imperative call). Shows one
 * toast at a time near the bottom of the screen; a new call replaces
 * whatever's showing.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const [current, setCurrent] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    currentListener = (state) => {
      if (timer.current) clearTimeout(timer.current);
      setCurrent(state);
      timer.current = setTimeout(() => setCurrent(null), state.duration);
    };
    return () => {
      currentListener = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const dismiss = () => {
    if (timer.current) clearTimeout(timer.current);
    setCurrent(null);
  };

  return (
    <>
      {children}
      {current && (
        <SafeAreaView pointerEvents="box-none" style={styles.overlay} edges={["bottom"]}>
          <View
            style={[
              styles.toast,
              { backgroundColor: theme.colors.popover, borderColor: withAlpha(theme.colors.border, 0.7) },
              theme.shadowLift.style,
            ]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Text style={[styles.message, { color: theme.colors.popoverForeground }]}>{current.message}</Text>
            {current.action && (
              <Pressable
                onPress={() => {
                  current.action?.onPress();
                  dismiss();
                }}
                accessibilityRole="button"
                accessibilityLabel={current.action.label}
                hitSlop={10}
              >
                <Text style={[styles.actionLabel, { color: theme.colors.accent }]}>{current.action.label}</Text>
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      )}
    </>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    maxWidth: "100%",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  message: {
    flexShrink: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  actionLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
  },
});
