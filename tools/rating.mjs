// 開発用：問題の難易度評価
// 指標（仕様 4-2）をそれぞれ 0〜100 に正規化し、重み付きで総合スコアを出す。
// 正規化の上限値（CAP）は盤面サイズに関係なく共通。★とサイズの対応は固定なので、
// 同じ★の中での相対比較と、★の間での大まかな比較の両方に使える。

import { PuzzleGame, MOVE } from '../js/game.js';
import { deduce } from '../js/deduce.js';

export const WEIGHTS = {
  route: 0.15,     // A. ルート長・盤面の複雑さ
  branch: 0.15,    // B. 分岐の多さ
  turns: 0.10,     // C. 方向転換・迂回
  basic: 0.20,     // D. 基本的な数字条件からの確定しにくさ
  combo: 0.15,     // E. 複数条件の組み合わせ
  stages: 0.25,    // F. 推理の段階数
};

const CAP = {
  route: [6, 46],   // ルートのマス数：6 → 0点、46 → 100点
  branch: 16,       // 分岐点の数
  turns: 20,        // 曲がる回数
  combo: 24,        // つながり規則で決まったマス + 仮定で決まったマス×4
  stages: 26,       // 推理の段階数
};
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const pct = (x) => Math.round(clamp01(x) * 100);

export function countTurns(path) {
  let t = 0;
  for (let i = 2; i < path.length; i++) {
    const d1r = path[i - 1][0] - path[i - 2][0], d1c = path[i - 1][1] - path[i - 2][1];
    const d2r = path[i][0] - path[i - 1][0], d2c = path[i][1] - path[i - 1][1];
    if (d1r !== d2r || d1c !== d2c) t++;
  }
  return t;
}

/**
 * 正解ルートをたどりながら、各地点で「数字の条件を守って進める方向」が 2 つ以上ある回数を数える。
 * ゲームエンジンの判定（check）をそのまま使うので、数字で禁止される方向は自動的に除外される。
 */
export function countBranches(puzzle) {
  const g = new PuzzleGame(puzzle, { startFrom: 'start' });
  let branchPoints = 0, options = 0;
  for (let i = 1; i < puzzle.solution.length; i++) {
    const [hr, hc] = g.head;
    let n = 0;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const res = g.check(hr + dr, hc + dc);
      if (res.type === MOVE.MOVED) {
        // ゴールに早く着いても数字がそろわないので、最後の 1 手以外のゴールは候補から外す
        const isGoal = hr + dr === puzzle.goal.row && hc + dc === puzzle.goal.col;
        if (!isGoal || i === puzzle.solution.length - 1) n++;
      }
    }
    options += n;
    if (n >= 2) branchPoints++;
    g.moveTo(...puzzle.solution[i]);
  }
  return { branchPoints, avgOptions: options / (puzzle.solution.length - 1) };
}

/**
 * @returns {{ score: number, parts: object, metrics: object, logic: object }}
 *   logic.status が 'solved' 以外のときは、推理ソルバーで最後まで確定できなかった（評価は参考値）
 */
export function ratePuzzle(puzzle, { withSteps = false } = {}) {
  const logic = deduce(puzzle);
  const len = puzzle.solution.length;
  const blanks = puzzle.grid.flat().filter((v) => v === 0).length;
  const turns = countTurns(puzzle.solution);
  const { branchPoints, avgOptions } = countBranches(puzzle);
  const openCells = logic.fruitCells - 2; // START・GOAL は最初から確定
  const solved = logic.status === 'solved';

  const parts = {
    route: pct((len - CAP.route[0]) / (CAP.route[1] - CAP.route[0])),
    branch: pct(branchPoints / CAP.branch),
    turns: pct(turns / CAP.turns),
    basic: pct(openCells > 0 ? 1 - logic.lineOnlyCells / openCells : 0),
    combo: solved ? pct((logic.cellsByPath + 4 * logic.cellsByTrial) / CAP.combo) : 100,
    stages: solved ? pct(logic.waves / CAP.stages) : 100,
  };
  const score = Math.round(Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * parts[k], 0));
  const { steps, ...logicSummary } = logic;
  return {
    score,
    parts,
    metrics: {
      size: `${puzzle.rows}x${puzzle.cols}`,
      routeLength: len,
      branchPoints,
      avgOptions: Math.round(avgOptions * 100) / 100,
      turns,
      blanks,
      stages: logic.waves,
      trialSteps: logic.trialWaves,
      lineOnlyCells: logic.lineOnlyCells,
      startSide: puzzle.start.side,
      goalSide: puzzle.goal.side,
    },
    logic: withSteps ? { ...logicSummary, steps } : logicSummary,
    evaluable: solved && logic.matchesSolution === true,
    reason: solved ? (logic.matchesSolution ? null : '推理ソルバーの結果が正解と一致しません') : `推理ソルバーで確定できないマスが ${logic.unknownCells} 個残りました（${logic.status}）`,
  };
}
