export const NTT_CPAAS_SAMPLE_RATE = 24000;
export const NTT_CPAAS_FRAME_BYTES = 960; // 24kHz * 20ms * 16-bit mono

export class CpaasAudioFramer {
  private outputBuffer = Buffer.alloc(0);

  append(audioBase64: string, sendFrame: (frame: Buffer) => void) {
    const chunk = Buffer.from(audioBase64, "base64");
    if (chunk.length === 0) return;

    this.outputBuffer = Buffer.concat([this.outputBuffer, chunk]);
    while (this.outputBuffer.length >= NTT_CPAAS_FRAME_BYTES) {
      const frame = this.outputBuffer.subarray(0, NTT_CPAAS_FRAME_BYTES);
      this.outputBuffer = this.outputBuffer.subarray(NTT_CPAAS_FRAME_BYTES);
      sendFrame(frame);
    }
  }

  clear() {
    this.outputBuffer = Buffer.alloc(0);
  }
}

export class Pcm16BargeInDetector {
  private consecutiveSpeechFrames = 0;
  private lastInterruptAt = 0;

  private readonly options = {
    rmsThreshold: this.readPositiveNumber("REALTIME_BARGE_IN_RMS_THRESHOLD", 650),
    minConsecutiveFrames: this.readPositiveNumber("REALTIME_BARGE_IN_MIN_FRAMES", 2),
    cooldownMs: this.readPositiveNumber("REALTIME_BARGE_IN_COOLDOWN_MS", 900),
  };

  shouldInterrupt(frame: Buffer, responseActive: boolean) {
    if (!responseActive) {
      this.consecutiveSpeechFrames = 0;
      return false;
    }

    if (Date.now() - this.lastInterruptAt < this.options.cooldownMs) {
      return false;
    }

    if (this.rms(frame) >= this.options.rmsThreshold) {
      this.consecutiveSpeechFrames += 1;
    } else {
      this.consecutiveSpeechFrames = 0;
    }

    if (this.consecutiveSpeechFrames < this.options.minConsecutiveFrames) {
      return false;
    }

    this.lastInterruptAt = Date.now();
    this.consecutiveSpeechFrames = 0;
    return true;
  }

  private rms(frame: Buffer) {
    const samples = Math.floor(frame.length / 2);
    if (samples === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i + 1 < frame.length; i += 2) {
      const sample = frame.readInt16LE(i);
      sumSquares += sample * sample;
    }
    return Math.sqrt(sumSquares / samples);
  }

  private readPositiveNumber(name: string, fallback: number) {
    const raw = process.env[name];
    if (raw === undefined) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
