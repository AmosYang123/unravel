import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";
import { Button } from "./Button";
import { withAlpha } from "./colorUtils";

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Colours the confirm button with the destructive tone, e.g. deleting an entry. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Stands in for the web app's AlertDialog (e.g. the "Delete this entry?"
 * confirm in EntryDetail.tsx). Built on RN's own Modal since there's no
 * Radix here. The scrim reuses the active theme's own shadow colour (already
 * distinct per light/dark theme in theme/tokens.ts) instead of a hardcoded
 * black, so it dims consistently on every theme including dusk and ink.
 */
export function ConfirmDialog({
  visible,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: withAlpha(theme.shadowLift.color, 0.55) }]}>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.popover, borderColor: withAlpha(theme.colors.border, 0.7) },
            theme.shadowLift.style,
          ]}
          accessibilityViewIsModal
          accessibilityRole="alert"
        >
          <Text style={[styles.title, { color: theme.colors.popoverForeground }]}>{title}</Text>
          {Boolean(description) && (
            <ScrollView style={{ flexShrink: 1 }}><Text style={[styles.description, { color: theme.colors.mutedForeground }]}>{description}</Text></ScrollView>
          )}
          <View style={styles.actions}>
            <Button variant="ghost" label={cancelLabel} onPress={onCancel} />
            <Button
              variant="filled"
              tone={destructive ? "destructive" : "default"}
              label={confirmLabel}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "90%",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 8,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 19,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12,
  },
});
