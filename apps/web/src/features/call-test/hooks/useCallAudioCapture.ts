import { useCallback, useRef } from "react";
import type { MutableRefObject } from "react";
import { convertFloat32ToPcm16 } from "../lib/audio";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

interface UseCallAudioCaptureOptions {
  audioGateOpenRef: MutableRefObject<boolean>;
  mutedRef: MutableRefObject<boolean>;
}

export function useCallAudioCapture({
  audioGateOpenRef,
  mutedRef,
}: UseCallAudioCaptureOptions) {
  const inputContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const cleanupAudioCapture = useCallback(() => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    inputContextRef.current?.close().catch(() => undefined);
    inputContextRef.current = null;
  }, []);

  const startAudioCapture = useCallback(
    async (ws: WebSocket) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error("このブラウザは Web Audio API に対応していません");
      }
      const context = new AudioContextCtor();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (event) => {
        if (
          !audioGateOpenRef.current ||
          mutedRef.current ||
          ws.readyState !== WebSocket.OPEN
        ) {
          return;
        }
        const input = event.inputBuffer.getChannelData(0);
        const pcm = convertFloat32ToPcm16(input, context.sampleRate);
        ws.send(pcm.buffer);
      };

      source.connect(processor);
      processor.connect(context.destination);

      mediaStreamRef.current = stream;
      inputContextRef.current = context;
      sourceRef.current = source;
      processorRef.current = processor;
    },
    [audioGateOpenRef, mutedRef]
  );

  return { startAudioCapture, cleanupAudioCapture };
}
