export const NTT_CPAAS_SAMPLE_RATE = 24000;
export const NTT_CPAAS_FRAME_BYTES = 960;

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
