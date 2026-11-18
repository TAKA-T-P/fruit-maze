// 開発用：全解探索ソルバー（解の数を数える。唯一解の検証に使う）
//
// countSolutions(puzzle, opts) → { status, count, solutions, nodes, complete }
//   status: 'none'     … 解なし（探索完了）
//           'unique'   … 解がちょうど 1 つ（探索完了）
//           'multiple' … 解が limit 個以上見つかった（確定）
//           'unknown'  … 探索上限に達した。唯一解とはみなさない
//   opts: number（= limit。旧形式）または { limit = 2, maxNodes = 3_000_000 }
//
// 枝刈り：
//   - 行・列の通過数が指定数を超える手は打たない
//   - ゴールに入るのは最後の 1 手だけ
//   - 盤面の市松模様の色によるルート長の偶奇チェック
//   - 毎ノードで「先頭から、まだ使えるマス（未通過・行列に空きあり）だけを通って」BFS し、
//       * ゴールに到達できない
//       * どこかの行・列で、到達できるマス数が必要数に足りない
//       * 到達できるマスの総数が残り必要数に足りない
//     のいずれかなら打ち切る

export const SOLVER_DEFAULT_MAX_NODES = 3_000_000;

export function countSolutions(p, opts = {}) {
  const { limit = 2, maxNodes = SOLVER_DEFAULT_MAX_NODES } = typeof opts === 'number' ? { limit: opts } : opts;
  const { rows, cols, grid, rowClues, colClues, start, goal } = p;
  const N = rows * cols;
  const total = rowClues.reduce((a, b) => a + b, 0);
  const result = (status, solutions = [], nodes = 0) =>
    ({ status, count: solutions.length, solutions, nodes, complete: status !== 'unknown' });

  if (total !== colClues.reduce((a, b) => a + b, 0)) return result('none');
  const s = start.row * cols + start.col;
  const g = goal.row * cols + goal.col;
  if (!grid[start.row][start.col] || !grid[goal.row][goal.col] || s === g) return result('none');
  // 市松模様：1 歩ごとに色が変わるので、total-1 歩後の色はゴールの色と一致しなければならない
  if (((start.row + start.col + total - 1) & 1) !== ((goal.row + goal.col) & 1)) return result('none');

  const rowOf = new Int16Array(N), colOf = new Int16Array(N), fruit = new Uint8Array(N);
  const nbr = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    rowOf[i] = r; colOf[i] = c; fruit[i] = grid[r][c] === 1 ? 1 : 0;
    const list = [];
    if (r > 0) list.push(i - cols);
    if (r < rows - 1) list.push(i + cols);
    if (c > 0) list.push(i - 1);
    if (c < cols - 1) list.push(i + 1);
    nbr.push(list);
  }

  const visited = new Uint8Array(N);
  const rc = new Int16Array(rows), cc = new Int16Array(cols);
  const path = [];
  const solutions = [];
  let nodes = 0;
  let aborted = false;

  // BFS 用の作業領域
  const seen = new Int32Array(N);
  let stamp = 0;
  const queue = new Int32Array(N);
  const rowReach = new Int16Array(rows), colReach = new Int16Array(cols);

  /** 先頭 head から先へ進める見込みがあるか */
  function feasible(head, len) {
    stamp++;
    rowReach.fill(0); colReach.fill(0);
    let qh = 0, qt = 0, reach = 0, goalReached = false;
    for (const nb of nbr[head]) {
      if (fruit[nb] && !visited[nb] && rc[rowOf[nb]] < rowClues[rowOf[nb]] && cc[colOf[nb]] < colClues[colOf[nb]]) {
        seen[nb] = stamp; queue[qt++] = nb;
      }
    }
    while (qh < qt) {
      const i = queue[qh++];
      reach++; rowReach[rowOf[i]]++; colReach[colOf[i]]++;
      if (i === g) { goalReached = true; continue; } // ゴールの先へは進めない
      for (const nb of nbr[i]) {
        if (seen[nb] === stamp || !fruit[nb] || visited[nb]) continue;
        if (rc[rowOf[nb]] >= rowClues[rowOf[nb]] || cc[colOf[nb]] >= colClues[colOf[nb]]) continue;
        seen[nb] = stamp; queue[qt++] = nb;
      }
    }
    if (!goalReached) return false;
    if (reach < total - len) return false;
    for (let r = 0; r < rows; r++) if (rc[r] + rowReach[r] < rowClues[r]) return false;
    for (let c = 0; c < cols; c++) if (cc[c] + colReach[c] < colClues[c]) return false;
    return true;
  }

  function dfs(i, len) {
    if (solutions.length >= limit || aborted) return;
    if (++nodes > maxNodes) { aborted = true; return; }
    if (i === g) {
      // 各行・列は指定数以下で、合計が total に一致 → すべての数字が一致
      if (len === total) solutions.push(path.map((k) => [rowOf[k], colOf[k]]));
      return;
    }
    if (len >= total || !feasible(i, len)) return;
    for (const nb of nbr[i]) {
      if (!fruit[nb] || visited[nb]) continue;
      const r = rowOf[nb], c = colOf[nb];
      if (rc[r] >= rowClues[r] || cc[c] >= colClues[c]) continue;
      if (nb === g && len + 1 !== total) continue;
      visited[nb] = 1; rc[r]++; cc[c]++; path.push(nb);
      dfs(nb, len + 1);
      visited[nb] = 0; rc[r]--; cc[c]--; path.pop();
      if (solutions.length >= limit || aborted) return;
    }
  }

  if (rowClues[start.row] >= 1 && colClues[start.col] >= 1) {
    visited[s] = 1; rc[start.row]++; cc[start.col]++; path.push(s);
    dfs(s, 1);
  }
  if (solutions.length >= limit) return result('multiple', solutions, nodes);
  if (aborted) return result('unknown', solutions, nodes);
  return result(solutions.length === 0 ? 'none' : solutions.length === 1 ? 'unique' : 'multiple', solutions, nodes);
}
