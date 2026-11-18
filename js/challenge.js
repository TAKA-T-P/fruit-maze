// タイムアタックの進行（DOM 非依存）
//
// 状態：ready → countdown → playing → final-question → finished → results
//   playing        … 通常の制限時間内
//   final-question … 通常時間が終わったあと、いま表示している問題だけをロスタイム内に解ける
//   finished       … 終了処理中（時間切れ／最終問題を正解／途中でやめた）
//
// 時間はすべて「実際の時刻」（now()）と、開始時に決めた 2 つの締め切りで判定する。
//   normalDeadline = startedAt + 通常の制限時間
//   finalDeadline  = normalDeadline + ロスタイム   ← ロスタイムは「通常時間が実際に終わった時刻」から
// 画面の更新（setInterval など）が遅れたり止まったり（タブ切り替え・スリープ）しても、時間は延びない。
// 正解は「正解した時刻」で判定する：
//   ・normalDeadline 以前 … 1 問加算して次の問題へ（ちょうど 0 秒の正解もここ。次の問題が最終問題になる）
//   ・finalDeadline 以前  … 1 問加算して終了（次の問題は出さない）
//   ・それより後          … 時間切れ（加算しない）
// 終了処理は 1 回だけ（finish は 2 回目以降なにもしない）。

import { taConfig } from './challenge-config.js';

export const TA_STATE = Object.freeze({
  READY: 'ready', COUNTDOWN: 'countdown', PLAYING: 'playing', FINAL: 'final-question', FINISHED: 'finished', RESULTS: 'results',
});

export class TimeAttack {
  /**
   * @param {object} o
   * @param {number} o.level
   * @param {object[]} o.puzzles     その難易度の問題（50 問）
   * @param {() => number} [o.now]   現在時刻（ミリ秒）。テストで差し替える
   * @param {() => number} [o.random]
   */
  constructor({ level, puzzles, now = () => Date.now(), random = Math.random }) {
    if (!puzzles || !puzzles.length) throw new Error('タイムアタックの問題がありません');
    this.config = taConfig(level);
    this.level = level;
    this.puzzles = puzzles;
    this.now = now;
    this.random = random;
    this.state = TA_STATE.READY;
    this.clears = 0;
    this.served = new Set();   // この挑戦で出した問題 ID
    this.current = null;
    this.endReason = null;     // 'timeup' | 'final-cleared' | 'aborted'
  }

  startCountdown() {
    if (this.state === TA_STATE.READY) this.state = TA_STATE.COUNTDOWN;
  }

  /** 計測を始めて、最初の問題を返す（カウントダウンの時間は制限時間に含めない） */
  begin() {
    if (this.state !== TA_STATE.READY && this.state !== TA_STATE.COUNTDOWN) return this.current;
    this.startedAt = this.now();
    this.normalDeadline = this.startedAt + this.config.normalSeconds * 1000;
    this.finalDeadline = this.normalDeadline + this.config.overtimeSeconds * 1000;
    this.state = TA_STATE.PLAYING;
    this.current = this._pick();
    return this.current;
  }

  /** まだ出していない問題からランダムに 1 問。全部出したら最初から（直前の問題は避ける） */
  _pick() {
    let candidates = this.puzzles.filter((p) => !this.served.has(p.id));
    if (!candidates.length) {
      this.served.clear();
      candidates = this.puzzles.filter((p) => !this.current || p.id !== this.current.id);
      if (!candidates.length) candidates = this.puzzles;
    }
    const p = candidates[Math.floor(this.random() * candidates.length)];
    this.served.add(p.id);
    return p;
  }

  get isActive() { return this.state === TA_STATE.PLAYING || this.state === TA_STATE.FINAL; }

  /**
   * 時刻を進めて状態を更新する（画面の更新ごと・タブ復帰時に呼ぶ）。
   * @returns {string[]} 起きたこと：'final'（最終問題に入った）／'timeup'（時間切れで終了）
   */
  update(t = this.now()) {
    const events = [];
    if (this.state === TA_STATE.PLAYING && t >= this.normalDeadline) {
      this.state = TA_STATE.FINAL;
      events.push('final');
    }
    if (this.state === TA_STATE.FINAL && t > this.finalDeadline) {
      if (this._finish('timeup')) events.push('timeup');
    }
    return events;
  }

  /**
   * いまの問題を正解した。
   * @param {number} t 正解した時刻
   * @returns {{type: 'next', puzzle, final: boolean} | {type: 'finished', reason: string, counted: boolean} | {type: 'ignored'}}
   */
  solved(t = this.now()) {
    if (!this.isActive) return { type: 'ignored' };
    if (t <= this.normalDeadline) {
      this.clears++;
      this.current = this._pick();
      this.update(t); // ちょうど 0 秒なら、次の問題が最終問題になる
      return { type: 'next', puzzle: this.current, final: this.state === TA_STATE.FINAL };
    }
    if (t <= this.finalDeadline) {
      this.clears++;
      this._finish('final-cleared');
      return { type: 'finished', reason: 'final-cleared', counted: true };
    }
    this._finish('timeup');
    return { type: 'finished', reason: 'timeup', counted: false };
  }

  /** 途中でやめる（記録しない） */
  abort() { this._finish('aborted'); }

  /** 結果画面を表示した */
  markResults() { if (this.state === TA_STATE.FINISHED) this.state = TA_STATE.RESULTS; }

  _finish(reason) {
    if (this.state === TA_STATE.FINISHED || this.state === TA_STATE.RESULTS) return false; // 終了処理は 1 回だけ
    this.state = TA_STATE.FINISHED;
    this.endReason = reason;
    this.endedAt = this.now();
    return true;
  }

  /** 通常時間の残り（ミリ秒）。最終問題・終了後は 0 */
  normalLeftMs(t = this.now()) {
    if (this.normalDeadline == null) return this.config.normalSeconds * 1000;
    return Math.max(0, this.normalDeadline - t);
  }
}

/** 残り時間の表示（155000 ms → "02:35"）。秒は切り上げ（0.2 秒残っていれば 00:01） */
export function formatRemaining(ms) {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
