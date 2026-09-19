-- The voice-memos bucket was created with neither a size limit nor a mime
-- allowlist, so an authenticated client could push arbitrary bytes of arbitrary
-- size into its own folder — the ownership policies say where an upload may land,
-- not what it may contain. Both limits live on the bucket row, so this is an
-- update of the row created in 20260905030719 rather than a new object; running
-- it again simply rewrites the same two values.
--
-- Size: both recorders stop at 300 seconds (MAX_RECORDING_SECONDS in
-- src/components/VoiceRecorder.tsx and mobile/components/VoiceRecorder.tsx).
-- The mobile recorder uses expo-audio's HIGH_QUALITY preset (AAC, 44.1 kHz,
-- stereo, 128 kbps), which is ~4.8 MB at the cap; web MediaRecorder's Opus/AAC
-- output is smaller still. transcribe-voice caps MAX_AUDIO_BYTES at 25 MiB —
-- Groq's own upload ceiling — and downloads the object before checking that
-- limit, so the bucket's file_size_limit, not the edge check, is what actually
-- bounds edge memory. 25 MiB matches that ceiling: it still leaves roughly 5x
-- headroom over a legitimate recording, and an object above it could never be
-- transcribed on any path, so admitting it to storage would only waste space.
--
-- Types: the web client uploads whatever MediaRecorder reports — typically
-- `audio/webm;codecs=opus` on Chrome/Firefox and `audio/mp4` on Safari — and the
-- mobile client maps its file extension to audio/mp4, audio/3gpp, audio/wav or
-- audio/ogg. Those content types carry codec parameters that an exact-string
-- entry would not match, so the allowlist is the `audio/*` wildcard: it accepts
-- every container either client produces, with or without parameters, and still
-- rejects video, archives, executables and other non-audio payloads.
update storage.buckets
   set file_size_limit = 26214400,
       allowed_mime_types = array['audio/*']
 where id = 'voice-memos';
