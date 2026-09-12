import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Mic, Square, Trash2 } from "lucide-react-native";
import { AudioPlayer, useVoiceRecorder, withAlpha } from "@/components/ui";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

/** A local recording; the compose screen reads its bytes before uploading. */
export interface Recording {
  uri: string;
  mimeType: string;
}

const MAX_RECORDING_SECONDS = 300;

interface Props {
  recording?: Recording;
  seconds?: number;
  onChange: (recording: Recording | undefined, seconds: number) => void;
}

const extToMime = (uri: string): string => {
  const ext = uri.split(".").pop()?.toLowerCase();
  if (ext === "m4a" || ext === "mp4") return "audio/mp4";
  if (ext === "3gp") return "audio/3gpp";
  if (ext === "wav") return "audio/wav";
  if (ext === "ogg") return "audio/ogg";
  return "audio/mp4";
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const VoiceRecorder = ({ recording: saved, seconds = 0, onChange }: Props) => {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const voice = useVoiceRecorder();
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cappedRef = useRef(false);

  const elapsed = Math.floor(voice.durationMillis / 1000);

  useEffect(() => {
    if (!voice.isRecording || cappedRef.current) return;
    if (elapsed >= MAX_RECORDING_SECONDS) {
      cappedRef.current = true;
      setError("Recordings are capped at 5 minutes, so this one stopped there.");
      void stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, voice.isRecording]);

  const start = async () => {
    setError(null);
    cappedRef.current = false;
    try {
      await voice.start();
    } catch {
      setError("Microphone unavailable. You can type instead — nothing is lost.");
    }
  };

  const stop = async () => {
    setFinalizing(true);
    const finishedSeconds = elapsed;
    try {
      const uri = await voice.stop();
      if (uri) {
        onChange({ uri, mimeType: extToMime(uri) }, finishedSeconds);
      } else {
        onChange(undefined, 0);
      }
    } catch {
      setError("Couldn't finish the recording. Please try again.");
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Pressable
          onPress={voice.isRecording ? stop : start}
          disabled={finalizing}
          accessibilityRole="button"
          accessibilityLabel={voice.isRecording ? "Stop recording" : "Start recording"}
          hitSlop={6}
          style={[
            styles.recordButton,
            { backgroundColor: theme.colors.card, borderColor: withAlpha(theme.colors.border, 0.7) },
            finalizing && { opacity: 0.5 },
          ]}
        >
          {voice.isRecording ? (
            <Square color={theme.colors.foreground} size={20} strokeWidth={1.5} />
          ) : (
            <Mic color={theme.colors.foreground} size={20} strokeWidth={1.5} />
          )}
        </Pressable>
        <View>
          {voice.isRecording ? (
            <Text style={[styles.elapsed, { color: theme.colors.foreground }]}>{fmt(elapsed)}</Text>
          ) : finalizing ? (
            <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>Finishing up…</Text>
          ) : saved ? (
            <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>
              Recorded · {fmt(seconds)} · ready to save
            </Text>
          ) : (
            <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>
              Tap to record. Saving uploads this memo to your private account.
            </Text>
          )}
        </View>
      </View>

      {saved && !voice.isRecording && !finalizing && (
        <View style={styles.playbackRow}>
          <View style={styles.playbackPlayer}>
            <AudioPlayer uri={saved.uri} label="recording" />
          </View>
          <Pressable
            onPress={() => onChange(undefined, 0)}
            accessibilityRole="button"
            accessibilityLabel="Delete recording"
            hitSlop={8}
          >
            <Trash2 color={theme.colors.mutedForeground} size={16} strokeWidth={1.5} />
          </Pressable>
        </View>
      )}

      {error && <Text style={[styles.error, { color: theme.colors.destructive }]}>{error}</Text>}
    </View>
  );
};

const createStyles = (fonts: FontSet) => StyleSheet.create({
  container: { gap: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  recordButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  elapsed: { fontFamily: fonts.display, fontSize: 18 },
  hint: { fontFamily: fonts.body, fontSize: 14 },
  playbackRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  playbackPlayer: { flex: 1, maxWidth: 280 },
  error: { fontFamily: fonts.body, fontSize: 14 },
});

export default VoiceRecorder;
