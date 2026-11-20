// 推理メモ（DOM 非依存）
// 各フルーツマスに「未確定 / ○（通ると予想）/ ×（通らないと予想）」を記録する。
// ルート（PuzzleGame）とは別の状態で、メモを付けてもルートや行・列の通過数は変わらない。
// ゲームのルール上の制約にもならない（×のマスもルートは通れる）。

export const MEMO = Object.freeze({ NONE: 0, ON: 1, OFF: 2 });
const NAME = ['none', 'on', 'off'];

/**
 * プレイ画面の操作モード。1 つのボタンを押すたびに この順で切り替わる。
 *   route      … ルートをつなぐ
 *   memo-on    … ○ を付ける（○ のマスをもう一度タップすると消える）
 *   memo-off   … × を付ける（× のマスをもう一度タップすると消える）
 *   memo-erase … ○・× を消す
 */
export const PLAY_MODES = ['route', 'memo-on', 'memo-off', 'memo-erase'];
export const nextMode = (mode) => PLAY_MODES[(PLAY_MODES.indexOf(mode) + 1) % PLAY_MODES.length];

/** モードごとのメモの付け方（beginStroke に渡す）。route は null */
export function memoToolForMode(mode) {
  switch (mode) {
    case 'memo-on': return { value: MEMO.ON, toggle: true };
    case 'memo-off': return { value: MEMO.OFF, toggle: true };
    case 'memo-erase': return { value: MEMO.NONE, toggle: false };
    case 'memo': return {};        // 切り替え（なし → ○ → × → なし）
    default: return null;
  }
}

/**
 * ×（通らないと予想）を付けたマスには、ルートで進めない（操作の側で止める。ゲームのルール自体は変えない）。
 * ×を消せば、また通れる。
 * @param {MemoBoard|null} memo
 */
export function isBlockedByMemo(memo, r, c) {
  return !!memo && memo.get(r, c) === MEMO.OFF;
}

export class MemoBoard {
  /**
   * @param {object} puzzle
   * @param {{cycle?: number[], filter?: (r: number, c: number) => boolean}} [opt]
   *   cycle  タップで切り替わる順番（既定：未確定 → ○ → × → 未確定）
   *   filter メモを付けられるマスをさらに限定する（あそびかたの練習用）
   */
  constructor(puzzle, { cycle = [MEMO.NONE, MEMO.ON, MEMO.OFF], filter = null } = {}) {
    this.puzzle = puzzle;
    this.rows = puzzle.rows;
    this.cols = puzzle.cols;
    this.cycle = cycle;
    this.filter = filter;
    this.cells = new Uint8Array(this.rows * this.cols);
    this.stroke = null;
  }

  inBoard(r, c) { return r >= 0 && r < this.rows && c >= 0 && c < this.cols; }
  get(r, c) { return this.inBoard(r, c) ? this.cells[r * this.cols + c] : MEMO.NONE; }

  /**
   * メモを付けられるマスか。空白・青マス（2 つの端）・ルートが通っているマスは不可。
   * @param {import('./game.js').PuzzleGame} [game]
   */
  canEdit(r, c, game = null) {
    const p = this.puzzle;
    if (!this.inBoard(r, c) || p.grid[r][c] !== 1) return false;
    if ((r === p.start.row && c === p.start.col) || (r === p.goal.row && c === p.goal.col)) return false;
    if (game && game.isVisited(r, c)) return false;
    if (this.filter && !this.filter(r, c)) return false;
    return true;
  }

  /** 値を設定する（編集できないマスなら何もしない）。変わったら true */
  set(r, c, value, game = null) {
    if (!this.canEdit(r, c, game)) return false;
    const i = r * this.cols + c;
    if (this.cells[i] === value) return false;
    this.cells[i] = value;
    return true;
  }

  /** ルートが × のマスを通ったときなど、条件に関係なくそのマスのメモを消す */
  erase(r, c) {
    if (!this.inBoard(r, c)) return false;
    const i = r * this.cols + c;
    const had = this.cells[i] !== MEMO.NONE;
    this.cells[i] = MEMO.NONE;
    return had;
  }

  /** タップしたときの次の値 */
  nextValue(r, c) {
    const k = this.cycle.indexOf(this.get(r, c));
    return this.cycle[(k + 1) % this.cycle.length];
  }

  /** 1 回タップ（切り替え）。変わったら新しい値、変わらなければ null */
  tap(r, c, game = null) {
    if (!this.canEdit(r, c, game)) return null;
    const v = this.nextValue(r, c);
    return this.set(r, c, v, game) ? v : null;
  }

  // ---- なぞって連続でメモ ----
  // 最初に触れた（編集できる）マスで決まった値を、なぞった他のマスにも付ける。
  // 1 回の操作で同じマスを何度通っても、変更は 1 回だけ。
  /**
   * @param {{value?: number, toggle?: boolean}} [tool]
   *   value を省略 … 最初のマスの「次の値」（なし → ○ → × → なし）
   *   value を指定 … その値を付ける。toggle が true で、最初のマスがすでにその値なら「消す」操作になる
   */
  beginStroke(tool = {}) { this.stroke = { value: null, tool: tool || {}, touched: new Set() }; }
  /** なぞったマスに適用。変わったら新しい値、変わらなければ null */
  strokeAt(r, c, game = null) {
    if (!this.stroke) this.beginStroke();
    const key = r * this.cols + c;
    if (this.stroke.touched.has(key) || !this.canEdit(r, c, game)) return null;
    this.stroke.touched.add(key);
    if (this.stroke.value === null) {
      const { value, toggle } = this.stroke.tool;
      if (value === undefined) this.stroke.value = this.nextValue(r, c);
      else this.stroke.value = toggle && this.get(r, c) === value ? MEMO.NONE : value;
    }
    return this.set(r, c, this.stroke.value, game) ? this.stroke.value : null;
  }
  endStroke() { this.stroke = null; }

  clear() { const had = this.hasAny(); this.cells.fill(MEMO.NONE); return had; }
  /** 今のメモの状態（「1つ戻る」用） */
  snapshot() { return Uint8Array.from(this.cells); }
  /** snapshot() でとった状態にもどす */
  restore(snap) { if (snap && snap.length === this.cells.length) this.cells.set(snap); }
  hasAny() { return this.cells.some((v) => v !== MEMO.NONE); }
  count(value) { let n = 0; for (const v of this.cells) if (v === value) n++; return n; }

  /** @returns {Array<{row:number, col:number, value:'on'|'off'}>} */
  entries() {
    const out = [];
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] !== MEMO.NONE) out.push({ row: (i / this.cols) | 0, col: i % this.cols, value: NAME[this.cells[i]] });
    }
    return out;
  }
}
