// 開発用：問題の重複・類似の判定
//   canonicalKey … 回転・反転（8 通り）と START/GOAL の入れ替えをすべて同一視した識別キー
//   similarity   … 2 問の「似ている度合い」0〜1（ルートの形と空白の配置を、8 通りの向きで比べた最大値）

import { countRoute } from '../js/puzzle-utils.js';

const SIDE_DIR = { top: [-1, 0], bottom: [1, 0], left: [0, -1], right: [0, 1] };
const DIR_SIDE = { '-1,0': 'top', '1,0': 'bottom', '0,-1': 'left', '0,1': 'right' };

/** 8 通りの対称変換。正方形でない盤面では、形が変わらない 4 通りだけを使う */
function transforms(rows, cols) {
  const R = rows - 1, C = cols - 1;
  const all = [
    { rows, cols, f: (r, c) => [r, c] },
    { rows, cols, f: (r, c) => [R - r, C - c] },
    { rows, cols, f: (r, c) => [r, C - c] },
    { rows, cols, f: (r, c) => [R - r, c] },
    { rows: cols, cols: rows, f: (r, c) => [c, R - r] },   // 90° 回転
    { rows: cols, cols: rows, f: (r, c) => [C - c, r] },   // 270° 回転
    { rows: cols, cols: rows, f: (r, c) => [c, r] },       // 転置
    { rows: cols, cols: rows, f: (r, c) => [C - c, R - r] }, // 反転対角
  ];
  return rows === cols ? all : all.slice(0, 4);
}

function mapEnd(t, pt) {
  const [r, c] = t.f(pt.row, pt.col);
  const [dr, dc] = SIDE_DIR[pt.side];
  // 辺の向きは、マスから外へ 1 歩出た点の写り先で決める
  const [or, oc] = t.f(pt.row + dr, pt.col + dc);
  return { row: r, col: c, side: DIR_SIDE[`${or - r},${oc - c}`] };
}

/** 問題を対称変換する（数字は変換後の正解ルートから数え直す） */
export function transformPuzzle(p, t) {
  const grid = Array.from({ length: t.rows }, () => new Array(t.cols).fill(0));
  for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) {
    const [nr, nc] = t.f(r, c);
    grid[nr][nc] = p.grid[r][c];
  }
  const solution = p.solution.map(([r, c]) => t.f(r, c));
  const { rowCounts, colCounts } = countRoute(t.rows, t.cols, solution);
  return { ...p, rows: t.rows, cols: t.cols, grid, solution, rowClues: rowCounts, colClues: colCounts, start: mapEnd(t, p.start), goal: mapEnd(t, p.goal) };
}

function rawKey(p) {
  const e = (x) => `${x.row},${x.col},${x.side[0]}`;
  return `${p.rows}x${p.cols}|${p.grid.map((row) => row.join('')).join('/')}|${p.rowClues.join(',')}|${p.colClues.join(',')}|${e(p.start)}|${e(p.goal)}`;
}

/** 回転・反転・START/GOAL の入れ替えで同じになる問題は、同じキーになる */
export function canonicalKey(p) {
  let best = null;
  for (const t of transforms(p.rows, p.cols)) {
    const q = transformPuzzle(p, t);
    const swapped = { ...q, start: q.goal, goal: q.start, solution: [...q.solution].reverse() };
    for (const k of [rawKey(q), rawKey(swapped)]) if (best === null || k < best) best = k;
  }
  return best;
}

const jaccard = (a, b) => {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni ? inter / uni : 1;
};

/**
 * 似ている度合い（0〜1）。ルートが通るマスの重なり（7 割）と空白マスの重なり（3 割）を、
 * b を 8 通りに変換したうえで比べ、いちばん似ている向きの値を返す。
 */
export function similarity(a, b) {
  if (a.rows * a.cols !== b.rows * b.cols) return 0;
  const cellsOf = (p) => ({
    path: new Set(p.solution.map(([r, c]) => r * p.cols + c)),
    blank: new Set(p.grid.flatMap((row, r) => row.map((v, c) => (v === 0 ? r * p.cols + c : -1))).filter((x) => x >= 0)),
  });
  const A = cellsOf(a);
  let best = 0;
  for (const t of transforms(b.rows, b.cols)) {
    if (t.rows !== a.rows || t.cols !== a.cols) continue;
    const B = cellsOf(transformPuzzle(b, t));
    const s = 0.7 * jaccard(A.path, B.path) + 0.3 * jaccard(A.blank, B.blank);
    if (s > best) best = s;
  }
  return best;
}
