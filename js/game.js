// ゲームエンジン（ルール・判定のみ。DOM や描画には一切依存しない）
// タイマー・スコア・効果音などは呼び出し側（main.js 等）が担当する。
//
// ルール：2 つの青マス（問題データの start / goal）を 1 本の道でつなぐ。どちらの青マスから始めてもよい。
//   ・はじめは道がない。最初に触れた青マスが「出発点」になり、もう一方の青マスが「到着点」になる
//   ・道が出発点だけのときに、もう一方の青マスに触れると、そちらから始め直す
//   ・出発点・到着点も 1 個に数える

export const STATUS = Object.freeze({
  PLAYING: 'playing',   // プレイ中
  AT_GOAL: 'at-goal',   // ゴールに着いたが数字がそろっていない
  CLEARED: 'cleared',   // 正解
});

export const MOVE = Object.freeze({
  MOVED: 'moved',       // 1マス進んだ
  UNDONE: 'undone',     // 直前のマスに戻った（1手もどる）
  BLOCKED: 'blocked',   // 数字の超過のため進めない
  IGNORED: 'ignored',   // 無効な操作（隣接していない・空白・通過済み など）
});

export class PuzzleGame {
  /**
   * @param {object} puzzle  puzzles.json の 1 問分
   * @param {{allowClueOverflow?: boolean, startFrom?: 'start'|'goal'|null}} [opt]
   *   allowClueOverflow … 行・列の数字をこえる移動を許すか（タイムアタック用。既定 false＝通常モード）。
   *                       許しても、クリア判定（すべての数字がぴったり一致して到着点）は同じ。
   *   startFrom         … 出発点を決めておく（開発用ツール・テスト用）。既定 null＝プレイヤーが選ぶ
   */
  constructor(puzzle, { allowClueOverflow = false, startFrom = null } = {}) {
    this.puzzle = puzzle;
    this.allowClueOverflow = allowClueOverflow;
    this.startFrom = startFrom;
    this.ends = [puzzle.start, puzzle.goal];
    this.rows = puzzle.rows;
    this.cols = puzzle.cols;
    this.reset();
  }

  reset() {
    this.route = [];                                   // [[row, col], ...]
    this.visited = new Uint8Array(this.rows * this.cols); // 0 = 未通過, 1 = 通過済み
    this.rowCounts = new Array(this.rows).fill(0);
    this.colCounts = new Array(this.cols).fill(0);
    this.status = STATUS.PLAYING;
    this.moveCount = 0;                                // 操作回数（将来のスコア用）
    this.origin = null;                                // 出発点（青マスのどちらか）
    this.target = null;                                // 到着点（もう一方の青マス）
    if (this.startFrom) {
      const p = this.startFrom === 'goal' ? this.puzzle.goal : this.puzzle.start;
      this._begin(p.row, p.col);
    }
  }

  // ---- 参照系 ----
  inBoard(r, c) { return r >= 0 && r < this.rows && c >= 0 && c < this.cols; }
  isFruit(r, c) { return this.inBoard(r, c) && this.puzzle.grid[r][c] === 1; }
  isVisited(r, c) { return this.inBoard(r, c) && this.visited[r * this.cols + c] === 1; }
  get head() { return this.route.length ? this.route[this.route.length - 1] : null; }
  get previous() { return this.route.length >= 2 ? this.route[this.route.length - 2] : null; }
  /** 青マス（問題の start / goal のどちらか） */
  isEndpoint(r, c) { return this.ends.some((p) => p.row === r && p.col === c); }
  /** 出発点（まだ道がなければ false） */
  isStart(r, c) { return !!this.origin && r === this.origin.row && c === this.origin.col; }
  /** 到着点（まだ道がなければ false） */
  isGoal(r, c) { return !!this.target && r === this.target.row && c === this.target.col; }
  /** 出発点から見た問題（出発点が goal 側なら start と goal を入れかえ、正解ルートも逆にしたもの）。ヒント・推理用 */
  get orientedPuzzle() {
    if (!this.origin || this.origin === this.puzzle.start) return this.puzzle;
    return swapEnds(this.puzzle);
  }
  routeIndexOf(r, c) {
    if (!this.isVisited(r, c)) return -1;
    return this.route.findIndex(([rr, cc]) => rr === r && cc === c);
  }

  rowState(r) {
    const clue = this.puzzle.rowClues[r];
    const count = this.rowCounts[r];
    return { count, clue, done: count === clue, over: count > clue };
  }
  colState(c) {
    const clue = this.puzzle.colClues[c];
    const count = this.colCounts[c];
    return { count, clue, done: count === clue, over: count > clue };
  }

  /** すべての行・列の数字が一致しているか */
  allCluesSatisfied() {
    return this.rowCounts.every((n, r) => n === this.puzzle.rowClues[r]) &&
      this.colCounts.every((n, c) => n === this.puzzle.colClues[c]);
  }

  /**
   * 指定マスへ進もうとしたときに、どうなるかを判定する（状態は変えない）。
   * @returns {{type: string, reason?: string, overRow?: boolean, overCol?: boolean}}
   */
  check(r, c) {
    if (this.status === STATUS.CLEARED) return { type: MOVE.IGNORED, reason: 'cleared' };
    if (!this.inBoard(r, c)) return { type: MOVE.IGNORED, reason: 'outside' };
    // まだ道がない：青マスから始める
    if (!this.route.length) return this.isEndpoint(r, c) ? { type: MOVE.MOVED, begin: true } : { type: MOVE.IGNORED, reason: 'not-endpoint' };
    // 道が出発点だけ：もう一方の青マス（となりでない）に触れたら、そちらから始め直す
    if (this.route.length === 1 && !this.startFrom && this.isGoal(r, c) && Math.abs(this.head[0] - r) + Math.abs(this.head[1] - c) !== 1) {
      return { type: MOVE.MOVED, begin: true };
    }
    const prev = this.previous;
    if (prev && prev[0] === r && prev[1] === c) return { type: MOVE.UNDONE };
    if (this.status !== STATUS.PLAYING) return { type: MOVE.IGNORED, reason: 'locked' };
    const [hr, hc] = this.head;
    if (Math.abs(hr - r) + Math.abs(hc - c) !== 1) return { type: MOVE.IGNORED, reason: 'not-adjacent' };
    if (!this.isFruit(r, c)) return { type: MOVE.IGNORED, reason: 'blank' };
    if (this.isVisited(r, c)) return { type: MOVE.IGNORED, reason: 'visited' };
    const overRow = this.rowCounts[r] + 1 > this.puzzle.rowClues[r];
    const overCol = this.colCounts[c] + 1 > this.puzzle.colClues[c];
    if ((overRow || overCol) && !this.allowClueOverflow) return { type: MOVE.BLOCKED, reason: 'overflow', overRow, overCol };
    return { type: MOVE.MOVED };
  }

  /**
   * 指定マスへ進む（直前のマスなら 1 手もどる）。
   * @returns {{type: string, reason?: string, overRow?: boolean, overCol?: boolean, row: number, col: number, status: string}}
   */
  moveTo(r, c) {
    const result = this.check(r, c);
    if (result.type === MOVE.UNDONE) {
      this.undo();
    } else if (result.type === MOVE.MOVED && result.begin) {
      this._clear();
      this._begin(r, c);
    } else if (result.type === MOVE.MOVED) {
      this._push(r, c);
      this.moveCount++;
      if (this.isGoal(r, c)) {
        this.status = this.allCluesSatisfied() ? STATUS.CLEARED : STATUS.AT_GOAL;
      }
    }
    return { ...result, row: r, col: c, status: this.status };
  }

  /** 1 手もどる。出発点だけのときは、道をなくして青マスを選び直せるようにする（startFrom を決めたときは何もしない）。クリア後は戻せない。 */
  undo() {
    const min = this.startFrom ? 1 : 0;
    if (this.route.length <= min || this.status === STATUS.CLEARED) return false;
    const [r, c] = this.route.pop();
    this.visited[r * this.cols + c] = 0;
    this.rowCounts[r]--;
    this.colCounts[c]--;
    if (!this.route.length) { this.origin = null; this.target = null; }
    this.status = STATUS.PLAYING;
    this.moveCount++;
    return true;
  }

  /** 青マス (r, c) を出発点にして道を始める */
  _begin(r, c) {
    const { start, goal } = this.puzzle;
    const fromStart = r === start.row && c === start.col;
    this.origin = fromStart ? start : goal;
    this.target = fromStart ? goal : start;
    this._push(r, c); // 出発点も 1 個に数える
  }

  /** 道を消す（数・状態は初期化。操作回数はそのまま） */
  _clear() {
    for (const [r, c] of this.route) {
      this.visited[r * this.cols + c] = 0;
      this.rowCounts[r]--;
      this.colCounts[c]--;
    }
    this.route = [];
    this.origin = null;
    this.target = null;
    this.status = STATUS.PLAYING;
  }

  _push(r, c) {
    this.route.push([r, c]);
    this.visited[r * this.cols + c] = 1;
    this.rowCounts[r]++;
    this.colCounts[c]++;
  }
}

/** start と goal を入れかえた問題（正解ルートも逆向き）。どちらから解いても同じ問題として扱うため */
export function swapEnds(puzzle) {
  return { ...puzzle, start: puzzle.goal, goal: puzzle.start, solution: [...puzzle.solution].reverse() };
}
