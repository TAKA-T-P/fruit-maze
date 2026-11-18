// 推理ソルバー：人間と同じように「確実に言えること」だけを積み重ねて解く（DOM 非依存）
// 全解探索（tools/solver.mjs）とは役割が違う：
//   - 全解探索 … 解の数を数える（唯一解の保証）
//   - 推理ソルバー … どんな推理を何段階重ねれば解けるかを記録する（難易度評価・第3段階のヒント用）
//
// 盤面の状態は「マス（通る／通らない／未定）」と「隣り合うマスの間の線（つながる／つながらない／未定）」で表す。
// 1 段階（wave）では、その時点の状態だけから言えることをすべて集め、まとめて反映する。
// 段階数＝推理の連鎖の長さ。
//
// 推理規則（rule）：
//   line-zero     行・列の数字が 0 → その行・列のフルーツは通らない            （仕様の規則 1）
//   line-all      数字 = 候補マス数 → すべて通る                                （規則 2）
//   line-full     通るマスが数字に達した → 残りは通らない                       （規則 3）
//   line-remain   残りの候補数 = 必要数 → 候補はすべて通る                      （規則 4）
//   degree-full   通るマスはつながりが 2 本（START/GOAL は 1 本）。そろったら他はつながらない（規則 8）
//   degree-fill   つながれる方向が必要数しかない → その方向とつながる
//   dead-end      つながれる方向が 1 つ以下のマスは通れない（行き止まり）          （規則 6）
//   loop          つなぐと輪になる線はつながらない（同じマスを 2 度通らない）      （規則 7）
//   early-goal    START と GOAL を途中でつないでしまう線はつながらない            （規則 5）
//   unreachable   START から たどり着けないマスは通らない                        （規則 5・6）
//   trial         仮に置いてみると矛盾する → 反対が正しい（1 段の仮定。複数条件の組み合わせ）

export const UNKNOWN = -1, OFF = 0, ON = 1;
const LINE_RULES = new Set(['line-zero', 'line-all', 'line-full', 'line-remain']);

/** 盤面の静的な構造（マス・線の番号付け） */
function buildModel(p) {
  const { rows, cols } = p;
  const N = rows * cols;
  const edges = [];          // [a, b]
  const cellEdges = Array.from({ length: N }, () => []);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    if (c + 1 < cols) { cellEdges[i].push(edges.length); cellEdges[i + 1].push(edges.length); edges.push([i, i + 1]); }
    if (r + 1 < rows) { cellEdges[i].push(edges.length); cellEdges[i + cols].push(edges.length); edges.push([i, i + cols]); }
  }
  const s = p.start.row * cols + p.start.col;
  const g = p.goal.row * cols + p.goal.col;
  const total = p.rowClues.reduce((a, b) => a + b, 0);
  const lines = [];
  for (let r = 0; r < rows; r++) lines.push({ kind: 'row', index: r, clue: p.rowClues[r], cells: Array.from({ length: cols }, (_, c) => r * cols + c) });
  for (let c = 0; c < cols; c++) lines.push({ kind: 'col', index: c, clue: p.colClues[c], cells: Array.from({ length: rows }, (_, r) => r * cols + c) });
  return { p, rows, cols, N, edges, cellEdges, s, g, total, lines };
}

function initialState(m) {
  const cell = new Int8Array(m.N).fill(UNKNOWN);
  const edge = new Int8Array(m.edges.length).fill(UNKNOWN);
  for (let i = 0; i < m.N; i++) if (m.p.grid[(i / m.cols) | 0][i % m.cols] !== 1) cell[i] = OFF;
  cell[m.s] = ON; cell[m.g] = ON;
  return { cell, edge };
}
const clone = (st) => ({ cell: st.cell.slice(), edge: st.edge.slice() });
const need = (m, i) => (i === m.s || i === m.g ? 1 : 2);

/** 自明な連動（線が OFF のマスに接する → OFF、線が ON → 両端 ON）。矛盾なら文字列を返す */
function closure(m, st) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let e = 0; e < m.edges.length; e++) {
      const [a, b] = m.edges[e];
      if (st.edge[e] === UNKNOWN && (st.cell[a] === OFF || st.cell[b] === OFF)) { st.edge[e] = OFF; changed = true; }
      if (st.edge[e] === ON) {
        for (const x of [a, b]) {
          if (st.cell[x] === OFF) return 'on-edge-to-off-cell';
          if (st.cell[x] === UNKNOWN) { st.cell[x] = ON; changed = true; }
        }
      }
    }
  }
  return null;
}

/** ON の線でつながったマスのまとまり（union-find）。輪ができていれば cycle=true */
function components(m, st) {
  const parent = Int32Array.from({ length: m.N }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  let cycle = false;
  for (let e = 0; e < m.edges.length; e++) {
    if (st.edge[e] !== ON) continue;
    const [a, b] = m.edges[e];
    const ra = find(a), rb = find(b);
    if (ra === rb) cycle = true; else parent[ra] = rb;
  }
  const size = new Int32Array(m.N);
  for (let i = 0; i < m.N; i++) if (st.cell[i] === ON) size[find(i)]++;
  return { find, size, cycle };
}

/**
 * 現在の状態から 1 段階で言えることを集める（状態は変えない）。
 * @returns {{ deductions: Array<{type:'cell'|'edge', id:number, value:number, rule:string, line?:object}>, contradiction: string|null }}
 */
function basicDeductions(m, st, { lineOnly = false } = {}) {
  const out = [];
  const push = (type, id, value, rule, extra) => out.push({ type, id, value, rule, ...extra });

  // 行・列の数字
  for (const L of m.lines) {
    let on = 0; const unk = [];
    for (const i of L.cells) { if (st.cell[i] === ON) on++; else if (st.cell[i] === UNKNOWN) unk.push(i); }
    if (on > L.clue) return { deductions: [], contradiction: `${L.kind}${L.index}-over` };
    if (on + unk.length < L.clue) return { deductions: [], contradiction: `${L.kind}${L.index}-short` };
    if (!unk.length) continue;
    // reason：ヒントの説明に使う根拠（推理する前の、その行・列の様子）
    const where = { line: { kind: L.kind, index: L.index }, reason: { line: { kind: L.kind, index: L.index }, clue: L.clue, on, unknown: unk.length } };
    if (on === L.clue) for (const i of unk) push('cell', i, OFF, L.clue === 0 ? 'line-zero' : 'line-full', where);
    else if (on + unk.length === L.clue) for (const i of unk) push('cell', i, ON, on === 0 ? 'line-all' : 'line-remain', where);
  }
  if (lineOnly) return { deductions: out, contradiction: null };

  // つながりの本数
  for (let i = 0; i < m.N; i++) {
    if (st.cell[i] === OFF) continue;
    let on = 0, possible = 0; const unk = [];
    for (const e of m.cellEdges[i]) {
      if (st.edge[e] === ON) { on++; possible++; } else if (st.edge[e] === UNKNOWN) { unk.push(e); possible++; }
    }
    if (st.cell[i] === ON) {
      const d = need(m, i);
      if (on > d) return { deductions: [], contradiction: `degree-over@${i}` };
      if (possible < d) return { deductions: [], contradiction: `degree-short@${i}` };
      if (!unk.length) continue;
      const reason = { from: i, need: d, connected: on, possible };
      if (on === d) for (const e of unk) push('edge', e, OFF, 'degree-full', { reason });
      else if (possible === d) for (const e of unk) push('edge', e, ON, 'degree-fill', { reason });
    } else if (possible < 2) {
      push('cell', i, OFF, 'dead-end', { reason: { possible } });
    }
  }

  // 輪・途中でゴールにつながる線
  const comp = components(m, st);
  if (comp.cycle) return { deductions: [], contradiction: 'cycle' };
  let onCells = 0;
  for (let i = 0; i < m.N; i++) if (st.cell[i] === ON) onCells++;
  const rs = comp.find(m.s), rg = comp.find(m.g);
  if (rs === rg) {
    // START と GOAL がすでにつながった：これで全部でなければ矛盾
    if (comp.size[rs] !== onCells || onCells !== m.total) return { deductions: [], contradiction: 'closed-early' };
  }
  for (let e = 0; e < m.edges.length; e++) {
    if (st.edge[e] !== UNKNOWN) continue;
    const [a, b] = m.edges[e];
    if (st.cell[a] === OFF || st.cell[b] === OFF) continue;
    const ra = comp.find(a), rb = comp.find(b);
    if (ra === rb) { push('edge', e, OFF, 'loop'); continue; }
    if ((ra === rs && rb === rg) || (ra === rg && rb === rs)) {
      const merged = comp.size[ra] + comp.size[rb];
      if (merged !== m.total || merged !== onCells) push('edge', e, OFF, 'early-goal');
    }
  }

  // START からたどり着けるか（GOAL の先へは進めない）
  const seen = new Uint8Array(m.N);
  const queue = [m.s]; seen[m.s] = 1;
  while (queue.length) {
    const i = queue.pop();
    if (i === m.g) continue;
    for (const e of m.cellEdges[i]) {
      if (st.edge[e] === OFF) continue;
      const [a, b] = m.edges[e];
      const j = a === i ? b : a;
      if (seen[j] || st.cell[j] === OFF) continue;
      seen[j] = 1; queue.push(j);
    }
  }
  if (!seen[m.g]) return { deductions: [], contradiction: 'goal-unreachable' };
  for (let i = 0; i < m.N; i++) {
    if (seen[i] || st.cell[i] === OFF) continue;
    if (st.cell[i] === ON) return { deductions: [], contradiction: `unreachable-on@${i}` };
    push('cell', i, OFF, 'unreachable');
  }
  return { deductions: out, contradiction: null };
}

/** 推論結果を状態に反映。矛盾（同じものに逆の値）なら文字列 */
function apply(m, st, deductions) {
  for (const d of deductions) {
    const arr = d.type === 'cell' ? st.cell : st.edge;
    if (arr[d.id] === UNKNOWN) arr[d.id] = d.value;
    else if (arr[d.id] !== d.value) return 'conflict';
  }
  return closure(m, st);
}

function isComplete(st) {
  return !st.cell.includes(UNKNOWN) && !st.edge.includes(UNKNOWN);
}

/**
 * 規則だけで行けるところまで進める（仮定なし）。
 * @returns {{error: string|null, depth: number}} 矛盾したら error と、矛盾までの段階数
 */
function propagate(m, st, maxWaves = 200) {
  for (let w = 1; w <= maxWaves; w++) {
    const { deductions, contradiction } = basicDeductions(m, st);
    if (contradiction) return { error: contradiction, depth: w };
    if (!deductions.length) return { error: null, depth: w };
    const err = apply(m, st, deductions);
    if (err) return { error: err, depth: w };
  }
  return { error: null, depth: maxWaves };
}

/**
 * 仮定法：未定のマス（なければ線）を仮に決め、矛盾したら反対に確定する。
 * 人が「ここを通ると仮定すると…」と 1 つずつ考えるのに合わせ、
 * いちばん早く矛盾に行き着く 1 つだけを返す（同じ深さなら番号の小さいもの。結果は決定的）。
 */
function trialDeduction(m, st) {
  let best = null;
  for (const [type, arr] of [['cell', st.cell], ['edge', st.edge]]) {
    for (let id = 0; id < arr.length; id++) {
      if (arr[id] !== UNKNOWN) continue;
      for (const v of [ON, OFF]) {
        const t = clone(st);
        (type === 'cell' ? t.cell : t.edge)[id] = v;
        const c = closure(m, t);
        const { error, depth } = c ? { error: c, depth: 0 } : propagate(m, t, best ? best.depth : 200);
        if (error && (!best || depth < best.depth)) {
          best = { type, id, value: v === ON ? OFF : ON, rule: 'trial', depth, reason: { assumed: v === ON ? 'on' : 'off', contradiction: error, depth } };
        }
      }
    }
    if (best) break; // マスで見つかれば線は調べない
  }
  return best;
}

/** 内部の番号（マス番号）を [row, col] に直した根拠データ */
function publicReason(m, reason) {
  if (!reason) return null;
  const out = { ...reason };
  if (typeof reason.from === 'number') out.from = [(reason.from / m.cols) | 0, reason.from % m.cols];
  return out;
}

/**
 * 途中の盤面（プレイヤーのルートや、前提にしたいマス）を推理の出発点にする。
 * @param {object} init
 * @param {Array<[number, number]>} [init.route]  START から続くルート。マスは「通る」、隣どうしは「つながる」
 * @param {Array<[number, number]>} [init.on]     通ると分かっているマス
 * @param {Array<[number, number]>} [init.off]    通らないと分かっているマス
 * @returns {string|null} 前提そのものが矛盾していれば理由
 */
function applyInitialState(m, st, init) {
  const idx = ([r, c]) => (r >= 0 && r < m.rows && c >= 0 && c < m.cols ? r * m.cols + c : -1);
  const setCell = (i, v) => {
    if (i < 0) return 'outside';
    if (st.cell[i] === UNKNOWN) st.cell[i] = v;
    else if (st.cell[i] !== v) return 'conflict';
    return null;
  };
  const route = init.route || [];
  if (route.length && idx(route[0]) !== m.s) return 'route-not-from-start';
  for (let k = 0; k < route.length; k++) {
    const i = idx(route[k]);
    const err = setCell(i, ON);
    if (err) return err;
    if (k > 0) {
      const j = idx(route[k - 1]);
      const e = m.cellEdges[i].find((x) => m.edges[x][0] === j || m.edges[x][1] === j);
      if (e === undefined) return 'route-not-adjacent';
      st.edge[e] = ON;
    }
  }
  for (const rc of init.on || []) { const err = setCell(idx(rc), ON); if (err) return err; }
  for (const rc of init.off || []) { const err = setCell(idx(rc), OFF); if (err) return err; }
  return null;
}

/**
 * 推理ソルバー本体
 * @param {object} puzzle
 * @param {{allowTrial?: boolean, maxWaves?: number, initialState?: {route?: number[][], on?: number[][], off?: number[][]}}} [opt]
 *   initialState を省略すると、何も分かっていない盤面から解く（第2段階までと同じ結果）。
 * @returns {{
 *   status: 'solved'|'stuck'|'contradiction',
 *   contradiction: string|null,           // 矛盾したときの理由（例 'row2-short', 'goal-unreachable'）
 *   waves: number, trialWaves: number,
 *   ruleCounts: Record<string, number>,   // マスを確定させた規則ごとの数
 *   cellsByLine: number, cellsByPath: number, cellsByTrial: number,
 *   lineOnlyCells: number,                 // 行・列の数字だけ（つながりを考えない）で確定するマス数
 *   fruitCells: number, unknownCells: number,
 *   steps: Array<{wave:number, row:number, col:number, value:'on'|'off', rule:string, reason:object|null}>,
 *   matchesSolution: boolean|null,
 * }}
 *   steps[].reason（説明を組み立てるための根拠データ。行・列・マスは [row, col] や {kind, index} で表す）
 *     line-*      { line: {kind, index}, clue, on, unknown }  … 推理前に「通る」と分かっていた数と、未定の数
 *     degree-fill { from: [r, c], need, connected, possible } … このマスのつながりから、となりのマスが決まった
 *     dead-end    { possible }                              … 進める方向の数
 *     trial       { assumed: 'on'|'off', contradiction, depth } … 仮に置くと何が起きるか
 *     unreachable / connect … なし（null）
 */
export function deduce(puzzle, { allowTrial = true, maxWaves = 400, initialState: init = null } = {}) {
  const m = buildModel(puzzle);
  const st = initialState(m);
  const steps = [];
  const ruleCounts = {};
  let waves = 0, trialWaves = 0, cellsByLine = 0, cellsByPath = 0, cellsByTrial = 0;
  let trialDepthSum = 0, trialDepthMax = 0;
  let status = 'stuck';
  let err = (init && applyInitialState(m, st, init)) || closure(m, st);
  const fruitCells = puzzle.grid.flat().filter((v) => v === 1).length;

  // 行・列の数字だけで確定するマス（基本的な数字条件からの確定しやすさ）
  const lo = clone(st);
  for (let w = 0; w < 100; w++) {
    const { deductions, contradiction } = basicDeductions(m, lo, { lineOnly: true });
    if (contradiction || !deductions.length) break;
    if (apply(m, lo, deductions)) break;
  }
  let lineOnlyCells = 0;
  for (let i = 0; i < m.N; i++) if (puzzle.grid[(i / m.cols) | 0][i % m.cols] === 1 && i !== m.s && i !== m.g && lo.cell[i] !== UNKNOWN) lineOnlyCells++;

  while (!err && waves < maxWaves) {
    if (isComplete(st)) { status = 'solved'; break; }
    let { deductions, contradiction } = basicDeductions(m, st);
    if (contradiction) { err = contradiction; break; }
    let trial = false;
    if (!deductions.length) {
      if (!allowTrial) break;
      const t = trialDeduction(m, st);
      if (!t) break;
      deductions = [t];
      trial = true;
      trialDepthSum += t.depth;
      trialDepthMax = Math.max(trialDepthMax, t.depth);
    }
    const before = st.cell.slice();
    err = apply(m, st, deductions);
    waves++;
    if (trial) trialWaves++;
    // 新しく確定したマスを記録（同じマスに複数の規則が当たった場合は最初の規則）
    const ruleOf = new Map();
    for (const d of deductions) if (d.type === 'cell' && !ruleOf.has(d.id)) ruleOf.set(d.id, d);
    // 「このマスから進める方向はここしかない」（degree-fill）で線がつながり、となりのマスが決まった場合
    for (const d of deductions) {
      if (d.type !== 'edge' || d.rule !== 'degree-fill' || d.value !== ON) continue;
      for (const x of m.edges[d.id]) if (before[x] === UNKNOWN && !ruleOf.has(x)) ruleOf.set(x, d);
    }
    for (let i = 0; i < m.N; i++) {
      if (before[i] !== UNKNOWN || st.cell[i] === UNKNOWN) continue;
      const d = ruleOf.get(i);
      const rule = d ? d.rule : 'connect'; // connect = 線が決まった結果としてマスが決まった
      ruleCounts[rule] = (ruleCounts[rule] || 0) + 1;
      if (rule === 'trial') cellsByTrial++;
      else if (LINE_RULES.has(rule)) cellsByLine++;
      else cellsByPath++;
      steps.push({ wave: waves, row: (i / m.cols) | 0, col: i % m.cols, value: st.cell[i] === ON ? 'on' : 'off', rule, reason: d ? publicReason(m, d.reason) : null });
    }
  }
  if (err) status = 'contradiction';

  let matchesSolution = null;
  if (status === 'solved' && Array.isArray(puzzle.solution)) {
    const set = new Set(puzzle.solution.map(([r, c]) => r * m.cols + c));
    matchesSolution = set.size === m.total && [...st.cell].every((v, i) => (v === ON) === set.has(i));
  }
  return {
    status, contradiction: err || null, waves, trialWaves, trialDepthSum, trialDepthMax, ruleCounts,
    cellsByLine, cellsByPath, cellsByTrial,
    lineOnlyCells, fruitCells,
    unknownCells: [...st.cell].filter((v) => v === UNKNOWN).length,
    steps, matchesSolution,
  };
}
