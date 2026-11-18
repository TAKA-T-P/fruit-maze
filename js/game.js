// ゲームエンジン（ルール・判定のみ。DOM や描画には一切依存しない）
// タイマー・スコア・効果音などは呼び出し側（main.js 等）が担当する。

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
  /** @param {object} puzzle  puzzles.json の 1 問分 */
  /**
   * @param {object} puzzle  puzzles.json の 1 問分
   * @param {{allowClueOverflow?: boolean}} [opt]
   *   allowClueOverflow … 行・列の数字をこえる移動を許すか（タイムアタック用。既定 false＝通常モード）。
   *   許しても、クリア判定（すべての数字がぴったり一致して GOAL）は同じ。
   */
  constructor(puzzle, { allowClueOverflow = false } = {}) {
    this.puzzle = puzzle;
    this.allowClueOverflow = allowClueOverflow;
    this.rows = puzzle.rows;
    this.cols = puzzle.cols;
    this.reset();
  }

  reset() {
    const { start } = this.puzzle;
    this.route = [];                                   // [[row, col], ...]
    this.visited = new Uint8Array(this.rows * this.cols); // 0 = 未通過, 1 = 通過済み
    this.rowCounts = new Array(this.rows).fill(0);
    this.colCounts = new Array(this.cols).fill(0);
    this.status = STATUS.PLAYING;
    this.moveCount = 0;                                // 操作回数（将来のスコア用）
    this._push(start.row, start.col);                  // スタートマスも 1 個に数える
  }

  // ---- 参照系 ----
  inBoard(r, c) { return r >= 0 && r < this.rows && c >= 0 && c < this.cols; }
  isFruit(r, c) { return this.inBoard(r, c) && this.puzzle.grid[r][c] === 1; }
  isVisited(r, c) { return this.inBoard(r, c) && this.visited[r * this.cols + c] === 1; }
  get head() { return this.route[this.route.length - 1]; }
  get previous() { return this.route.length >= 2 ? this.route[this.route.length - 2] : null; }
  isStart(r, c) { return r === this.puzzle.start.row && c === this.puzzle.start.col; }
  isGoal(r, c) { return r === this.puzzle.goal.row && c === this.puzzle.goal.col; }
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
    const prev = this.previous;
    if (prev && prev[0] === r && prev[1] === c) return { type: MOVE.UNDONE };
    if (this.status !== STATUS.PLAYING) return { type: MOVE.IGNORED, reason: 'locked' };
    if (!this.inBoard(r, c)) return { type: MOVE.IGNORED, reason: 'outside' };
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
    } else if (result.type === MOVE.MOVED) {
      this._push(r, c);
      this.moveCount++;
      if (this.isGoal(r, c)) {
        this.status = this.allCluesSatisfied() ? STATUS.CLEARED : STATUS.AT_GOAL;
      }
    }
    return { ...result, row: r, col: c, status: this.status };
  }

  /** 1 手もどる。スタートマスだけの状態では何もしない。クリア後は戻せない。 */
  undo() {
    if (this.route.length <= 1 || this.status === STATUS.CLEARED) return false;
    const [r, c] = this.route.pop();
    this.visited[r * this.cols + c] = 0;
    this.rowCounts[r]--;
    this.colCounts[c]--;
    this.status = STATUS.PLAYING;
    this.moveCount++;
    return true;
  }

  _push(r, c) {
    this.route.push([r, c]);
    this.visited[r * this.cols + c] = 1;
    this.rowCounts[r]++;
    this.colCounts[c]++;
  }
}
