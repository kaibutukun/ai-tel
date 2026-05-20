export class RealtimeSessionClock {
  private startedAtMs = Date.now();

  restart() {
    this.startedAtMs = Date.now();
  }

  elapsedSeconds() {
    return Math.max(0, (Date.now() - this.startedAtMs) / 1000);
  }

  elapsedWholeSeconds() {
    return Math.max(0, Math.round(this.elapsedSeconds()));
  }
}
