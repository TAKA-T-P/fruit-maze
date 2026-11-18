// パズルデータに関する純粋関数（DOM 非依存。ブラウザと Node の両方で動く）

export const SIDES = ['top', 'right', 'bottom', 'left'];

/** 盤面の外周マスかつ、その辺 (side) に面しているか */
export function isOnSide(puzzle, cell, side) {
  const { rows, cols } = puzzle;
  switch (side) {
    case 'top': return cell.row === 0;
    case 'bottom': return cell.row === rows - 1;
    case 'left': return cell.col === 0;
    case 'right': return cell.col === cols - 1;
    default: return false;
  }
}

/** 外周マスが面している辺の候補を返す（角のマスは 2 つ） */
export function sidesForCell(rows, cols, row, col) {
  const s = [];
  if (row === 0) s.push('top');
  if (col === cols - 1) s.push('right');
  if (row === rows - 1) s.push('bottom');
  if (col === 0) s.push('left');
  return s;
}

/** ルート（[[r,c],...]）から行・列ごとの通過数を数える */
export function countRoute(rows, cols, route) {
  const rowCounts = new Array(rows).fill(0);
  const colCounts = new Array(cols).fill(0);
  for (const [r, c] of route) {
    rowCounts[r]++;
    colCounts[c]++;
  }
  return { rowCounts, colCounts };
}

/**
 * パズルデータの整合性を検証する。
 * 返り値: エラーメッセージの配列（空なら正常）
 * ※ 唯一解かどうかの検証は第2段階で実装予定。ここでは「正解ルートが実際に成立するか」を確認する。
 */
export function validatePuzzle(p) {
  const errors = [];
  const err = (m) => errors.push(`${p && p.id ? p.id : '(no id)'}: ${m}`);
  if (!p || typeof p !== 'object') return ['puzzle is not an object'];
  if (typeof p.id !== 'string' || !p.id) err('id がありません');
  if (!Number.isInteger(p.difficulty) || p.difficulty < 1 || p.difficulty > 5) err('difficulty は 1〜5');
  if (!Number.isInteger(p.rows) || p.rows < 2) err('rows が不正');
  if (!Number.isInteger(p.cols) || p.cols < 2) err('cols が不正');
  if (errors.length) return errors;

  const { rows, cols } = p;
  if (!Array.isArray(p.grid) || p.grid.length !== rows || p.grid.some((row) => !Array.isArray(row) || row.length !== cols || row.some((v) => v !== 0 && v !== 1))) {
    err('grid の形または値が不正');
    return errors;
  }
  if (!Array.isArray(p.rowClues) || p.rowClues.length !== rows) err('rowClues の長さが不正');
  if (!Array.isArray(p.colClues) || p.colClues.length !== cols) err('colClues の長さが不正');

  const inBoard = (r, c) => Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < rows && c >= 0 && c < cols;
  for (const key of ['start', 'goal']) {
    const pt = p[key];
    if (!pt || !inBoard(pt.row, pt.col)) { err(`${key} の位置が不正`); continue; }
    if (p.grid[pt.row][pt.col] !== 1) err(`${key} がフルーツマスではありません`);
    if (!SIDES.includes(pt.side) || !isOnSide(p, pt, pt.side)) err(`${key} の side が外周と一致しません`);
  }
  if (errors.length) return errors;
  if (p.start.row === p.goal.row && p.start.col === p.goal.col) err('start と goal が同じマスです');

  const sol = p.solution;
  if (!Array.isArray(sol) || sol.length < 2) { err('solution がありません'); return errors; }
  const seen = new Set();
  for (let i = 0; i < sol.length; i++) {
    const [r, c] = sol[i] || [];
    if (!inBoard(r, c)) { err(`solution[${i}] が盤面外`); return errors; }
    if (p.grid[r][c] !== 1) err(`solution[${i}] が空白マス`);
    const k = r * cols + c;
    if (seen.has(k)) err(`solution[${i}] が重複`);
    seen.add(k);
    if (i > 0) {
      const [pr, pc] = sol[i - 1];
      if (Math.abs(pr - r) + Math.abs(pc - c) !== 1) err(`solution[${i}] が前のマスと隣接していません`);
    }
  }
  const [sr, sc] = sol[0];
  const [gr, gc] = sol[sol.length - 1];
  if (sr !== p.start.row || sc !== p.start.col) err('solution がスタートから始まっていません');
  if (gr !== p.goal.row || gc !== p.goal.col) err('solution がゴールで終わっていません');

  if (Array.isArray(p.rowClues) && Array.isArray(p.colClues)) {
    const { rowCounts, colCounts } = countRoute(rows, cols, sol);
    rowCounts.forEach((n, r) => { if (n !== p.rowClues[r]) err(`行${r + 1}: 数字 ${p.rowClues[r]} と正解ルート ${n} が不一致`); });
    colCounts.forEach((n, c) => { if (n !== p.colClues[c]) err(`列${c + 1}: 数字 ${p.colClues[c]} と正解ルート ${n} が不一致`); });
  }
  return errors;
}
