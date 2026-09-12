import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface Recording {
  blob: Blob;
  mimeType: string;
  previewUrl: string;
}

const MAX_RECORDING_SECONDS = 300;

interface Props {
  recording?: Recording;
  seconds?: number;
  onChange: (recording: Recording | undefined, seconds: number) => void;
}

const VoiceRecorder = ({ recording: saved, seconds = 0, onChange }: Props) => {
  const [recording, setRecording] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const previewUrlRef = useRef<string | null>(saved?.previewUrl ?? null);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const start = async () => {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Voice memos aren't supported in this browser. You can type instead — nothing is lost.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const previewUrl = URL.createObjectURL(blob);
        previewUrlRef.current = previewUrl;
        onChange({ blob, mimeType, previewUrl }, elapsedRef.current);
        stream.getTracks().forEach((t) => t.stop());
        setFinalizing(false);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setElapsed(0);
      elapsedRef.current = 0;
      timerRef.current = window.setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
        if (elapsedRef.current >= MAX_RECORDING_SECONDS) {
          setError("Recordings are capped at 5 minutes, so this one stopped there.");
          stop();
        }
      }, 1000);
    } catch {
      setError("Microphone unavailable. You can type instead — nothing is lost.");
    }
  };

  const stop = () => {
    setFinalizing(true);
    onChange(undefined, 0);
    recorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={recording ? stop : start}
          disabled={finalizing}
          aria-label={recording ? "Stop recording" : "Start recording"}
          className="relative flex h-16 w-16 items-center justify-center rounded-full border bg-card transition-transform hover:scale-105 disabled:pointer-events-none disabled:opacity-50"
        >
          {recording && <span className="absolute inset-0 animate-ping rounded-full bg-accent/25" />}
          {recording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" strokeWidth={1.5} />}
        </button>
        <div className="text-sm text-muted-foreground">
          {recording ? (
            <span className="font-display text-lg text-foreground">{fmt(elapsed)}</span>
          ) : finalizing ? (
            <span>Finishing up…</span>
          ) : saved ? (
            <span>Recorded · {fmt(seconds)} · ready to save</span>
          ) : (
            <span>Tap to record. Saving uploads this memo to your private account.</span>
          )}
        </div>
      </div>

      {saved && !recording && !finalizing && (
        <div className="flex items-center gap-3">
          <audio controls src={saved.previewUrl} className="w-full max-w-sm" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              URL.revokeObjectURL(saved.previewUrl);
              previewUrlRef.current = null;
              onChange(undefined, 0);
            }}
            aria-label="Delete recording"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
};

export default VoiceRecorder;
