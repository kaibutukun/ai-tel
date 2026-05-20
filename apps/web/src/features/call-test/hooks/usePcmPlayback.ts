import { useCallback, useEffect, useRef } from "react";
import { INPUT_SAMPLE_RATE } from "../model/types";

export function usePcmPlayback() {
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlaybackAtRef = useRef(0);

  const cleanupPlayback = useCallback(() => {
    playbackContextRef.current?.close().catch(() => undefined);
    playbackContextRef.current = null;
    nextPlaybackAtRef.current = 0;
  }, []);

  const playPcm16 = useCallback((buffer: ArrayBuffer) => {
    if (buffer.byteLength === 0) return;

    const context = playbackContextRef.current ?? new AudioContext();
    playbackContextRef.current = context;

    const samples = new Int16Array(buffer);
    const audioBuffer = context.createBuffer(1, samples.length, INPUT_SAMPLE_RATE);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) {
      channel[i] = samples[i] / 0x8000;
    }

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);

    const startAt = Math.max(context.currentTime + 0.02, nextPlaybackAtRef.current);
    source.start(startAt);
    nextPlaybackAtRef.current = startAt + audioBuffer.duration;
  }, []);

  useEffect(() => cleanupPlayback, [cleanupPlayback]);

  return { playPcm16, cleanupPlayback };
}
