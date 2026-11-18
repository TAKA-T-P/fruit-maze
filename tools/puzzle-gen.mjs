// 開発用：問題生成のコア（CLI は generate-puzzles.mjs）
//
// 1 問の生成手順：
//   1. ルートの「型」（まっすぐ・くねくね・中央寄り・外周寄り・自由）を選ぶ
//   2. 外周のマスから外周のマスへ、型に沿った自己回避ルートを作る（START と GOAL は一定以上離す）
//   3. ルート以外のマスに、ランダムな密度でフルーツを置く
//   4. 行・列の数字を計算
//   5. 全解探索で解の数を数える。別解があれば「別解だけが通るマス」を空白にして数え直す
//      （一定回数で唯一解にならない／探索が上限に達した → 不採用）
//   6. 推理ソルバーで最後まで論理的に解けることを確認し、難易度スコアを計算
//   7. スコアがその★の目標範囲に入り、既存問題と重複・類似していなければ採用

import { countSolutions } from './solver.mjs';
import { ratePuzzle } from './rating.mjs';
import { canonicalKey, similarity } from './symmetry.mjs';
import { validatePuzzle, sidesForCell, countRoute } from '../js/puzzle-utils.js';

/**
 * 難易度ごとの設定
 *   size     盤面サイズ（★とサイズの対応は第1段階から変えない）
 *   len      ルートの長さ（マス数）の範囲
 *   minDist  START と GOAL のマンハッタン距離の下限（近すぎて考えずに解ける問題を除く）
 *   fill     ルート以外のマスにフルーツを置く確率の範囲
 *   score    採用する難易度スコアの範囲（rating.mjs）
 *   minBlanks 空白マスの最少数（空白も推理の手がかりになる。★1 でも適度に置く）
 *   maxTrials 仮定（trial）による推理の回数の上限（力任せの試行錯誤が必要な問題を除く）
 *   minStages 推理の段階数の下限（★3 以上は推理の連鎖を必要とする）
 *   maxSim   同じ★の問題との類似度の上限
 *   maxNodes 全解探索 1 回あたりの探索ノード上限（超えたら unknown → 不採用）
 */
export const LEVEL_CONF = {
  1: { minBlanks: 1, prefix: 'easy', size: 4, len: [7, 12], minDist: 2, fill: [0.75, 0.95], score: [5, 26], maxTrials: 0, minStages: 0, maxSim: 0.9, maxNodes: 200_000 },
  2: { minBlanks: 1, prefix: 'normal', size: 5, len: [10, 18], minDist: 3, fill: [0.75, 0.95], score: [14, 40], maxTrials: 1, minStages: 4, maxSim: 0.85, maxNodes: 500_000 },
  3: { minBlanks: 1, prefix: 'hard', size: 6, len: [14, 26], minDist: 3, fill: [0.75, 0.95], score: [28, 60], maxTrials: 3, minStages: 8, maxSim: 0.8, maxNodes: 1_000_000 },
  4: { minBlanks: 2, prefix: 'expert', size: 7, len: [19, 34], minDist: 4, fill: [0.75, 0.95], score: [42, 76], maxTrials: 5, minStages: 12, maxSim: 0.8, maxNodes: 2_000_000 },
  5: { minBlanks: 2, prefix: 'master', size: 8, len: [25, 44], minDist: 4, fill: [0.75, 0.95], score: [55, 88], maxTrials: 8, minStages: 15, maxSim: 0.8, maxNodes: 3_000_000 },
};

export const ROUTE_STYLES = ['straight', 'winding', 'center', 'edge', 'free'];

// ---- 乱数（シード付き） ----
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 難易度ごとに独立した乱数列（ある★の生成数を変えても、他の★の結果は変わらない） */
export const levelRng = (seed, level) => mulberry32((seed * 2654435761 + level * 97531) >>> 0);

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const onEdge = (n, r, c) => r === 0 || c === 0 || r === n - 1 || c === n - 1;

/** 型に沿ったランダムな自己回避ルート（外周 → 外周）。作れなければ null */
export function randomPath(rand, n, conf, style) {
  const [minL, maxL] = conf.len;
  const target = minL + Math.floor(rand() * (maxL - minL + 1));
  const edges = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (onEdge(n, r, c)) edges.push([r, c]);
  const start = edges[Math.floor(rand() * edges.length)];
  const mid = (n - 1) / 2;
  const used = new Uint8Array(n * n);
  const path = [start];
  used[start[0] * n + start[1]] = 1;
  let budget = 6000;

  const weight = (r, c, nr, nc, prev) => {
    const w = rand();
    const straight = prev && nr - r === r - prev[0] && nc - c === c - prev[1];
    switch (style) {
      case 'straight': return w + (straight ? 0.7 : 0);
      case 'winding': return w + (straight ? 0 : 0.6);
      case 'center': return w + 0.25 * (Math.abs(r - mid) + Math.abs(c - mid) - Math.abs(nr - mid) - Math.abs(nc - mid));
      case 'edge': return w + 0.25 * (Math.min(r, c, n - 1 - r, n - 1 - c) - Math.min(nr, nc, n - 1 - nr, n - 1 - nc));
      default: return w;
    }
  };
  function dfs() {
    if (--budget < 0) return false;
    const [r, c] = path[path.length - 1];
    if (path.length === target) {
      return onEdge(n, r, c) && Math.abs(r - start[0]) + Math.abs(c - start[1]) >= conf.minDist;
    }
    const prev = path[path.length - 2];
    const next = DIRS.map(([dr, dc]) => [r + dr, c + dc])
      .filter(([nr, nc]) => nr >= 0 && nc >= 0 && nr < n && nc < n && !used[nr * n + nc])
      .map((x) => [x, weight(r, c, x[0], x[1], prev)])
      .sort((a, b) => b[1] - a[1])
      .map(([x]) => x);
    for (const nx of next) {
      used[nx[0] * n + nx[1]] = 1; path.push(nx);
      if (dfs()) return true;
      used[nx[0] * n + nx[1]] = 0; path.pop();
      if (budget < 0) return false;
    }
    return false;
  }
  return dfs() ? path : null;
}

/**
 * 1 問ぶんの候補を作って検証する。
 * @returns {{ puzzle?: object, rating?: object, reject?: string }}
 */
export function makeCandidate(rand, level, conf = LEVEL_CONF[level]) {
  const n = conf.size;
  const style = ROUTE_STYLES[Math.floor(rand() * ROUTE_STYLES.length)];
  const path = randomPath(rand, n, conf, style);
  if (!path) return { reject: 'no-path' };
  const { rowCounts, colCounts } = countRoute(n, n, path);
  if (rowCounts.filter((x) => x === 0).length + colCounts.filter((x) => x === 0).length > 1) return { reject: 'too-many-zero-lines' };

  const onPath = new Set(path.map(([r, c]) => r * n + c));
  const fill = conf.fill[0] + rand() * (conf.fill[1] - conf.fill[0]);
  const grid = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => (onPath.has(r * n + c) || rand() < fill ? 1 : 0)));
  const pickSide = (r, c) => { const s = sidesForCell(n, n, r, c); return s[Math.floor(rand() * s.length)]; };
  const [sr, sc] = path[0];
  const [gr, gc] = path[path.length - 1];
  const puzzle = {
    id: 'candidate', difficulty: level, rows: n, cols: n, grid,
    rowClues: rowCounts, colClues: colCounts,
    start: { row: sr, col: sc, side: pickSide(sr, sc) },
    goal: { row: gr, col: gc, side: pickSide(gr, gc) },
    solution: path,
  };

  // 別解の除去（正解ルート上のマスは空白にしない）
  const maxHoles = Math.round(n * n * 0.25);
  let unique = false;
  for (let k = 0; k < 16; k++) {
    const res = countSolutions(puzzle, { limit: 2, maxNodes: conf.maxNodes });
    if (res.status === 'unique') { unique = true; break; }
    if (res.status === 'unknown') return { reject: 'search-limit' };
    if (res.status === 'none') return { reject: 'no-solution' }; // 起こらないはず（正解ルートがある）
    const holes = grid.flat().filter((v) => v === 0).length;
    if (holes >= maxHoles) return { reject: 'too-many-holes' };
    const alt = res.solutions.find((s) => s.some(([r, c]) => !onPath.has(r * n + c)));
    if (!alt) return { reject: 'same-cells-alt' }; // 正解と同じマスを別の順で通る別解：空白化では消せない
    const cand = alt.filter(([r, c]) => !onPath.has(r * n + c));
    const [hr, hc] = cand[Math.floor(rand() * cand.length)];
    grid[hr][hc] = 0;
  }
  if (!unique) return { reject: 'not-unique' };
  // 空白マスが少なすぎる場合は、ルート外のマスを空白にして補う。
  // マスを減らしても解は増えない（正解ルートは残る）ので、唯一解のまま。
  const offPath = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (grid[r][c] === 1 && !onPath.has(r * n + c)) offPath.push([r, c]);
  let blanks = n * n - path.length - offPath.length;
  while (blanks < conf.minBlanks && offPath.length) {
    const [r, c] = offPath.splice(Math.floor(rand() * offPath.length), 1)[0];
    grid[r][c] = 0;
    blanks++;
  }
  if (validatePuzzle(puzzle).length) return { reject: 'invalid' };

  const rating = ratePuzzle(puzzle);
  if (!rating.evaluable) return { reject: 'logic-unsolved', puzzle, rating };
  rating.style = style;
  return { puzzle, rating };
}

/** 評価結果がその★の採用条件に合うか。合わなければ理由を返す */
export function checkLevelFit(rating, conf) {
  if (!rating.evaluable) return 'logic-unsolved';
  if (rating.score < conf.score[0]) return 'score-too-low';
  if (rating.score > conf.score[1]) return 'score-too-high';
  if (rating.metrics.trialSteps > conf.maxTrials) return 'too-many-trials';
  if (rating.metrics.stages < conf.minStages) return 'too-few-stages';
  return null;
}

/** 既存 ID と衝突しない次の連番 ID */
export function nextId(prefix, usedIds) {
  let max = 0;
  for (const id of usedIds) {
    const m = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/**
 * 指定した★の問題を、収録数が target に達するまで追加生成する。既存問題は変更しない。
 * @param {object} o
 * @param {number} o.level
 * @param {number} o.target         その★の目標収録数（既存を含む）
 * @param {object[]} o.existing     収録済みの全問題（重複判定・ID 採番に使う）
 * @param {number} o.seed
 * @param {number} [o.maxMillis]    時間の上限（超えたら途中までの結果を返す）
 * @param {number} [o.maxAttempts]  候補生成回数の上限
 * @param {(msg: string) => void} [o.log]
 */
export function generateLevel({ level, target, existing, seed, maxMillis = 20 * 60_000, maxAttempts = 2_000_000, log = () => {} }) {
  const conf = LEVEL_CONF[level];
  const rand = levelRng(seed, level);
  const t0 = Date.now();
  const keys = new Set(existing.map(canonicalKey));
  const usedIds = new Set(existing.map((p) => p.id));
  const sameLevel = existing.filter((p) => p.difficulty === level);
  const added = [];
  const rejects = {};
  let attempts = 0;
  const reject = (why) => { rejects[why] = (rejects[why] || 0) + 1; };

  while (sameLevel.length < target) {
    if (attempts >= maxAttempts || Date.now() - t0 > maxMillis) { log(`★${level}: 上限に達したため ${sameLevel.length} 問で終了`); break; }
    attempts++;
    const { puzzle, rating, reject: why } = makeCandidate(rand, level, conf);
    if (why) { reject(why); continue; }
    const fit = checkLevelFit(rating, conf);
    if (fit) { reject(fit); continue; }
    const key = canonicalKey(puzzle);
    if (keys.has(key)) { reject('duplicate'); continue; }
    if (sameLevel.some((q) => similarity(puzzle, q) > conf.maxSim)) { reject('similar'); continue; }
    puzzle.id = nextId(conf.prefix, usedIds);
    usedIds.add(puzzle.id);
    keys.add(key);
    sameLevel.push(puzzle);
    added.push({ puzzle, rating });
    log(`  + ${puzzle.id}  score ${rating.score}  stages ${rating.metrics.stages}  route ${rating.metrics.routeLength}  (${rating.style})`);
  }
  return { added, rejects, attempts, millis: Date.now() - t0, total: sameLevel.length };
}
