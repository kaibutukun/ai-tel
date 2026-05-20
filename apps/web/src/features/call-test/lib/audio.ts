import { INPUT_SAMPLE_RATE } from "../model/types";

function clampSample(value: number) {
  return Math.max(-1, Math.min(1, value));
}

export function convertFloat32ToPcm16(input: Float32Array, inputRate: number) {
  const ratio = inputRate / INPUT_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const sample = clampSample(input[Math.floor(i * ratio)] ?? 0);
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return output;
}
