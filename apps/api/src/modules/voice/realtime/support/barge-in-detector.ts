export class Pcm16BargeInDetector {
  private consecutiveSpeechFrames = 0;
  private lastInterruptAt = 0;

  // 既定値は「AI 応答の冒頭で環境音 / 息遣い / マイクオン直後のノイズで誤発火しない」ことを優先。
  // OpenAI 側にも server_vad があり、speech_started イベントは別経路で来るので、
  // local barge-in は OpenAI が反応するまでの保険として控えめに振っている。
  private readonly options = {
    rmsThreshold: this.readPositiveNumber("REALTIME_BARGE_IN_RMS_THRESHOLD", 1200),
    minConsecutiveFrames: this.readPositiveNumber("REALTIME_BARGE_IN_MIN_FRAMES", 3),
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
