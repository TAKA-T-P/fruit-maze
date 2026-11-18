// ストップウォッチ（ゲームエンジンとは独立。第5段階の 3分チャレンジではカウントダウンを追加予定）
// 一時停止（設定画面を開いている間など）に対応する。

export class Stopwatch {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.reset();
  }
  reset() { this.startedAt = null; this.stoppedAt = null; this.pausedAt = null; this.pausedTotal = 0; }
  start() { this.startedAt = this.now(); this.stoppedAt = null; this.pausedAt = null; this.pausedTotal = 0; }
  stop() {
    if (this.startedAt === null || this.stoppedAt !== null) return;
    this.resume();
    this.stoppedAt = this.now();
  }
  /** 一時停止（止まっている間の時間は数えない） */
  pause() { if (this.running && this.pausedAt === null) this.pausedAt = this.now(); }
  resume() {
    if (this.pausedAt === null) return;
    this.pausedTotal += this.now() - this.pausedAt;
    this.pausedAt = null;
  }
  get running() { return this.startedAt !== null && this.stoppedAt === null; }
  get paused() { return this.pausedAt !== null; }
  /** 経過ミリ秒（一時停止していた時間はのぞく） */
  elapsed() {
    if (this.startedAt === null) return 0;
    const end = this.stoppedAt ?? this.pausedAt ?? this.now();
    return end - this.startedAt - this.pausedTotal;
  }
}

/** 123456 ms → "2:03" */
export function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
