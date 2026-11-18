// ストップウォッチ（ゲームエンジンとは独立。第5段階の 3分チャレンジではカウントダウンを追加予定）

export class Stopwatch {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.reset();
  }
  reset() { this.startedAt = null; this.stoppedAt = null; }
  start() { this.startedAt = this.now(); this.stoppedAt = null; }
  stop() { if (this.startedAt !== null && this.stoppedAt === null) this.stoppedAt = this.now(); }
  get running() { return this.startedAt !== null && this.stoppedAt === null; }
  /** 経過ミリ秒 */
  elapsed() {
    if (this.startedAt === null) return 0;
    return (this.stoppedAt ?? this.now()) - this.startedAt;
  }
}

/** 123456 ms → "2:03" */
export function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
