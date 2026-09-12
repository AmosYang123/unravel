import { useCallback } from "react";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";

export interface VoiceRecorder {
  isRecording: boolean;
  /** Recording length so far, in milliseconds. */
  durationMillis: number;
  canRecord: boolean;
  /** Asks for microphone permission (if needed) and starts recording. Throws if permission is denied. */
  start: () => Promise<void>;
  /** Stops recording and returns the local file uri, or null if nothing was recorded. */
  stop: () => Promise<string | null>;
}

/**
 * Thin wrapper around expo-audio's recording API for voice-memo entries, so
 * screens don't each have to learn useAudioRecorder/RecordingPresets/
 * permission requests themselves.
 *
 * iOS needs `NSMicrophoneUsageDescription` set in app.json's ios.infoPlist
 * (not done here — this kit doesn't touch app.json) or `start()` will reject
 * once a real build asks the user for permission.
 */
export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);

  const start = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      throw new Error("Microphone permission was not granted.");
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }, [recorder]);

  const stop = useCallback(async () => {
    await recorder.stop();
    return recorder.uri;
  }, [recorder]);

  return {
    isRecording: state.isRecording,
    durationMillis: state.durationMillis,
    canRecord: state.canRecord,
    start,
    stop,
  };
}
