import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Pause, Play } from "lucide-react-native";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "./colorUtils";

export interface AudioPlayerProps {
  /** The preview URL, e.g. a song's 30s preview. Null/undefined shows a disabled control. */
  uri?: string | null;
  /** What's playing, for the play/pause accessibility label. Defaults to "preview". */
  label?: string;
}

/**
 * A thin wrapper around expo-audio's useAudioPlayer/useAudioPlayerStatus for
 * the 30s song previews on Aftercare. Screens shouldn't need to touch
 * expo-audio directly — pass a uri in and out.
 */
export function AudioPlayer({ uri, label = "preview" }: AudioPlayerProps) {
  const { theme } = useTheme();
  const player = useAudioPlayer(uri ?? undefined);
  const status = useAudioPlayerStatus(player);
  const playable = Boolean(uri);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  const toggle = () => {
    if (!playable) return;
    if (status.playing) player.pause();
    else player.play();
  };

  const progress = status.duration > 0 ? Math.min(status.currentTime / status.duration, 1) : 0;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={toggle}
        disabled={!playable}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? `Pause ${label}` : `Play ${label}`}
        accessibilityState={{ disabled: !playable }}
        hitSlop={8}
        style={[
          styles.playButton,
          { backgroundColor: theme.colors.accent, opacity: playable ? 1 : 0.4 },
        ]}
      >
        {status.playing ? (
          <Pause size={16} color={theme.colors.accentForeground} fill={theme.colors.accentForeground} />
        ) : (
          <Play size={16} color={theme.colors.accentForeground} fill={theme.colors.accentForeground} />
        )}
      </Pressable>
      <View style={[styles.track, { backgroundColor: withAlpha(theme.colors.mutedForeground, 0.2) }]}>
        <View style={[styles.trackFill, { backgroundColor: theme.colors.accent, width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  trackFill: {
    height: "100%",
    borderRadius: 999,
  },
});
