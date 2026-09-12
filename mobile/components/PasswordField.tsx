import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

export interface PasswordFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  textContentType?: "password" | "newPassword";
}

/**
 * Ported from src/components/PasswordField.tsx: a password box you can look
 * inside. The toggle is its own button beside the field rather than an overlay
 * on it, so VoiceOver reaches it as a separate control and the keyboard is
 * never dismissed by pressing it. Its label says what the press will do next,
 * not what the field is doing now.
 */
export function PasswordField({
  label,
  value,
  onChangeText,
  autoComplete,
  textContentType,
}: PasswordFieldProps) {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const [shown, setShown] = useState(false);

  return (
    <View>
      <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              color: theme.colors.foreground,
            },
          ]}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={textContentType}
          placeholderTextColor={theme.colors.mutedForeground}
        />
        <Pressable
          onPress={() => setShown((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={shown ? "Hide password" : "Show password"}
          accessibilityState={{ selected: shown }}
          hitSlop={6}
          style={[styles.toggle, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
        >
          {shown ? (
            <EyeOff color={theme.colors.mutedForeground} size={18} strokeWidth={1.5} />
          ) : (
            <Eye color={theme.colors.mutedForeground} size={18} strokeWidth={1.5} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  label: { fontFamily: fonts.body, fontSize: 14, marginTop: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 16,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  toggle: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default PasswordField;
