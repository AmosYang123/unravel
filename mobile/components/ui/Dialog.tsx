import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { X } from "lucide-react-native";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";
import { withAlpha } from "./colorUtils";

export interface DialogProps {
  visible: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A plain modal for a group of settings, next to ConfirmDialog's yes/no one.
 * Same RN Modal underneath and the same theme-coloured scrim; closes on the
 * backdrop, on the X and on Android's back gesture, and scrolls inside when
 * the controls are taller than the screen. Nothing here saves or cancels —
 * the controls it wraps write as they change, so closing never loses an edit.
 */
export function Dialog({ visible, title, description, onClose, children }: DialogProps) {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { backgroundColor: withAlpha(theme.shadowLift.color, 0.55) }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <KeyboardAvoidingView
          style={styles.centerer}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.card,
              { backgroundColor: theme.colors.popover, borderColor: withAlpha(theme.colors.border, 0.7) },
              theme.shadowLift.style,
            ]}
            accessibilityViewIsModal
          >
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: theme.colors.popoverForeground }]}>{title}</Text>
                {Boolean(description) && (
                  <Text style={[styles.description, { color: theme.colors.mutedForeground }]}>{description}</Text>
                )}
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.close}
              >
                <X size={18} color={theme.colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const createStyles = (fonts: FontSet) =>
  StyleSheet.create({
    root: { flex: 1 },
    centerer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
    card: {
      width: "100%",
      maxWidth: 480,
      flexShrink: 1,
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 20,
    },
    header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
    headerText: { flex: 1 },
    title: { fontFamily: fonts.display, fontSize: 19 },
    description: { marginTop: 4, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
    close: { padding: 4 },
    scroll: { flexGrow: 0, marginTop: 4 },
  });
