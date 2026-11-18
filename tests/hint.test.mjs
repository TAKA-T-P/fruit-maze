// 第3段階：段階別ヒント・推理ソルバー拡張・チュートリアル問題のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeBoard, HintSession, CATEGORY, NO_NEW_HINT, ALL_KNOWN } from '../js/hint.js';
import { deduce } from '../js/deduce.js';
import { PuzzleGame, MOVE } from '../js/game.js';
import { MemoBoard, MEMO } from '../js/memo.js';
import { parseTutorialData } from '../js/puzzle-loader.js';
import { countSolutions } from '../tools/solver.mjs';
import { canonicalKey } from '../tools/symmetry.mjs';
import { PAGE_RULES } from '../tools/make-tutorial.mjs';

const DATA = JSON.parse(readFileSync(new URL('../data/puzzles.json', import.meta.url), 'utf8'));
const TUTORIAL = JSON.parse(readFileSync(new URL('../data/tutorial.json', import.meta.url), 'utf8'));
const ALL = DATA.puzzles;

// 再現できる乱数
function rng(seed) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }
const key = (r, c) => `${r},${c}`;
const solSet = (p) => new Set(p.solution.map(([r, c]) => key(r, c)));
const isEnd = (p, r, c) => (r === p.start.row && c === p.start.col) || (r === p.goal.row && c === p.goal.col);

/** 正しいメモ（正解と合う ○・×）をランダムに付ける */
function correctMemo(p, route, rand, rate = 0.25) {
  const sol = solSet(p);
  const onRoute = new Set(route.map(([r, c]) => key(r, c)));
  const out = [];
  for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) {
    if (p.grid[r][c] !== 1 || isEnd(p, r, c) || onRoute.has(key(r, c)) || rand() > rate) continue;
    out.push({ row: r, col: c, value: sol.has(key(r, c)) ? 'on' : 'off' });
  }
  return out;
}

/** ヒントの中身が論理的に正しいか（確定するマスが正解と一致し、すでに分かっているマスではない） */
function assertSoundHint(p, h, board, label) {
  const sol = solSet(p);
  const known = new Set([...board.route.map(([r, c]) => key(r, c)), ...board.memo.map((e) => key(e.row, e.col))]);
  assert.equal(h.levels.length, 3, `${label}: 3 段階`);
  for (const lv of h.levels) {
    assert.ok(lv.text && lv.text.length <= 90, `${label}: 文章は短く（${lv.text.length} 文字）`);
    assert.ok(!/[a-z]+-[a-z]+/.test(lv.text), `${label}: 内部の規則名を表示しない: ${lv.text}`);
  }
  assert.equal(h.levels[0].highlight.marks.length, 0, `${label}: ヒント1では確定マスを見せない`);
  assert.equal(h.levels[1].highlight.marks.length, 0, `${label}: ヒント2でも確定マスはまだ見せない`);
  assert.ok(h.levels[0].highlight.lines.length > 0, `${label}: ヒント1は行・列を強調`);
  if (h.rule === 'line-full' || h.rule === 'line-remain') {
    // ヒント2で光らせる「通ると分かっているマス」の数が、推理の根拠（on）と一致する
    const shown = h.levels[1].highlight.cells;
    assert.equal(shown.length, h.reason.on, `${label}: ヒント2の根拠マスの数`);
    for (const c of shown) assert.ok(sol.has(key(c.row, c.col)), `${label}: 根拠のマスは通るマス`);
  }
  const marks = h.levels[2].highlight.marks;
  assert.ok(marks.length > 0, `${label}: ヒント3で確定マスを示す`);
  for (const t of h.targets) {
    assert.ok(!known.has(key(t.row, t.col)), `${label}: すでに分かっているマスをくり返さない (${t.row},${t.col})`);
    assert.equal(t.value === 'on', sol.has(key(t.row, t.col)), `${label}: (${t.row},${t.col}) は ${t.value} のはず`);
    assert.ok(marks.some((m) => m.row === t.row && m.col === t.col && m.tone === t.value), `${label}: 強調が対象と一致`);
  }
}

// ---------- 推理ソルバーの拡張 ----------
test('deduce：従来の呼び出しは結果が変わらない（initialState なし＝何も分かっていない盤面）', () => {
  for (const p of ALL.filter((_, i) => i % 10 === 0)) {
    const a = deduce(p), b = deduce(p, {}), c = deduce(p, { initialState: null });
    assert.deepEqual(a, b, p.id);
    assert.deepEqual(a, c, p.id);
    assert.equal(a.status, 'solved');
    assert.equal(a.contradiction, null);
  }
});

test('deduce：正しいルートの途中から推理でき、すでに分かっているマスは結果に含めない', () => {
  for (const p of ALL.filter((_, i) => i % 5 === 0)) {
    const route = p.solution.slice(0, Math.ceil(p.solution.length / 2));
    const r = deduce(p, { initialState: { route } });
    assert.equal(r.status, 'solved', p.id);
    assert.equal(r.matchesSolution, true, p.id);
    const onRoute = new Set(route.map(([a, b]) => key(a, b)));
    assert.ok(r.steps.every((s) => !onRoute.has(key(s.row, s.col))), p.id);
  }
});

test('deduce：矛盾した前提（正解のマスを「通らない」）を検出する', () => {
  for (const p of ALL.filter((_, i) => i % 5 === 0)) {
    const [r, c] = p.solution[Math.floor(p.solution.length / 2)];
    const res = deduce(p, { initialState: { route: [p.solution[0]], off: [[r, c]] } });
    assert.equal(res.status, 'contradiction', p.id);
    assert.ok(res.contradiction, p.id);
  }
  const p = ALL[0];
  assert.equal(deduce(p, { initialState: { route: [p.solution[1]] } }).contradiction, 'route-not-from-start');
});

test('deduce：各ステップの規則と根拠データ（行・列・元のマス）が正しい', () => {
  for (const p of ALL.filter((_, i) => i % 7 === 0)) {
    const sol = solSet(p);
    for (const s of deduce(p).steps) {
      assert.equal(s.value === 'on', sol.has(key(s.row, s.col)), `${p.id} ${s.rule}`);
      if (s.rule.startsWith('line-')) {
        const L = s.reason.line;
        assert.equal(L.kind === 'row' ? s.row : s.col, L.index, `${p.id}: マスがその行・列にある`);
        assert.equal(s.reason.clue, L.kind === 'row' ? p.rowClues[L.index] : p.colClues[L.index]);
      } else if (s.rule === 'degree-fill') {
        const [fr, fc] = s.reason.from;
        assert.equal(Math.abs(fr - s.row) + Math.abs(fc - s.col), 1, `${p.id}: となりのマス`);
      } else if (s.rule === 'trial') {
        assert.ok(['on', 'off'].includes(s.reason.assumed) && s.reason.assumed !== s.value && s.reason.contradiction);
      }
    }
  }
});

// ---------- 盤面に応じたヒント ----------
test('全250問：正しいルート・正しいメモの盤面で、正しいヒントが出る', () => {
  const rand = rng(12345);
  let hints = 0;
  for (const p of ALL) {
    for (const frac of [0, 0.35, 0.7]) {
      const route = p.solution.slice(0, Math.max(1, Math.floor(p.solution.length * frac)));
      const memo = correctMemo(p, route, rand, frac === 0 ? 0 : 0.2);
      const board = { route, memo };
      const a = analyzeBoard(p, board);
      assert.equal(a.status, 'ok', p.id);
      assert.ok(a.candidates.length > 0 || a.allKnown, `${p.id}: ヒントがある`);
      // 優先順位：早い段階 → 同じ段階なら数字(3) → つながり(4) → 組み合わせ(5) → 仮定(6)
      for (let i = 1; i < a.candidates.length; i++) {
        const x = a.candidates[i - 1], y = a.candidates[i];
        assert.ok(x.wave < y.wave || (x.wave === y.wave && CATEGORY[x.rule] <= CATEGORY[y.rule]), `${p.id}: 並び順`);
      }
      for (const h of a.candidates.slice(0, 4)) { assertSoundHint(p, h, board, `${p.id}@${frac}`); hints++; }
    }
  }
  assert.ok(hints > 1500);
});

test('★1・★2 の最初のヒントは、仮定を使わない', () => {
  for (const p of ALL.filter((x) => x.difficulty <= 2)) {
    const first = analyzeBoard(p, { route: [p.solution[0]], memo: [] }).candidates[0];
    assert.notEqual(first.rule, 'trial', p.id);
  }
});

test('全250問：まちがったルートには、ルートの見直しだけを示す（推理のヒントは出さない）', () => {
  let tested = 0;
  for (const p of ALL) {
    for (const frac of [0.3, 0.6]) {
      const k = Math.max(1, Math.floor(p.solution.length * frac));
      const g = new PuzzleGame(p);
      for (const [r, c] of p.solution.slice(1, k)) g.moveTo(r, c);
      const [hr, hc] = g.head;
      const [nr, nc] = p.solution[k];
      // 数字のルールでは進めるが、正解ではない方向
      const wrong = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([a, b]) => [hr + a, hc + b])
        .find(([r, c]) => (r !== nr || c !== nc) && g.check(r, c).type === MOVE.MOVED);
      if (!wrong) continue;
      g.moveTo(...wrong);
      const a = analyzeBoard(p, { route: g.route, memo: [] });
      assert.equal(a.status, 'route-wrong', p.id);
      assert.equal(a.candidates.length, 1);
      const h = a.candidates[0];
      assert.equal(h.levels[0].highlight.marks.length, 0, 'ヒント1ではマスを示さない');
      const back = h.levels[2].highlight.marks[0];
      assert.deepEqual([back.row, back.col, back.tone], [hr, hc, 'back'], `${p.id}: もどる位置`);
      assert.match(h.levels[2].text, /1回もどって/);
      tested++;
    }
  }
  assert.ok(tested > 150, `${tested}`);
});

test('ゴールに着いたが数字が合わない盤面も「ルートの見直し」になる', () => {
  const p = { id: 'g', difficulty: 1, rows: 3, cols: 3, grid: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], rowClues: [2, 1, 2], colClues: [1, 1, 3], start: { row: 0, col: 1, side: 'top' }, goal: { row: 2, col: 2, side: 'right' }, solution: [[0, 1], [0, 2], [1, 2], [2, 2]] };
  // 正解は右上を回る道。下を回って GOAL に着いたルート（正解の途中ではない）
  const a = analyzeBoard(p, { route: [[0, 1], [1, 1], [2, 1], [2, 2]], memo: [] });
  assert.equal(a.status, 'route-wrong');
  const back = a.candidates[0].levels[2].highlight.marks[0];
  assert.deepEqual([back.row, back.col], [0, 1], 'START までもどる');
});

test('全250問：まちがったメモを正しい前提として扱わず、見直しを示す', () => {
  const rand = rng(99);
  for (const p of ALL) {
    const sol = solSet(p);
    // × を正解ルートのマスに、○ を通らないフルーツに
    const midOn = p.solution.slice(1, -1).find(([r, c]) => !isEnd(p, r, c));
    const off = [];
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) if (p.grid[r][c] === 1 && !sol.has(key(r, c))) off.push([r, c]);
    const cases = [{ row: midOn[0], col: midOn[1], value: 'off' }];
    if (off.length) { const [r, c] = off[Math.floor(rand() * off.length)]; cases.push({ row: r, col: c, value: 'on' }); }
    for (const bad of cases) {
      const memo = [...correctMemo(p, [p.solution[0]], rand, 0.15).filter((e) => e.row !== bad.row || e.col !== bad.col), bad];
      const a = analyzeBoard(p, { route: [p.solution[0]], memo });
      assert.equal(a.status, 'memo-wrong', p.id);
      assert.ok(a.candidates.every((h) => h.kind === 'memo-wrong'), '推理のヒントは出さない');
      const h = a.candidates.find((x) => x.targets[0].row === bad.row && x.targets[0].col === bad.col);
      assert.ok(h, `${p.id}: まちがったメモが指摘される`);
      assert.equal(h.levels[0].highlight.lines.length + h.levels[0].highlight.cells.length + h.levels[0].highlight.marks.length, 0, 'ヒント1では場所を教えない');
      assert.equal(h.levels[1].highlight.marks.length, 0, 'ヒント2ではまだマスを示さない');
      assert.deepEqual(h.levels[2].highlight.marks, [{ row: bad.row, col: bad.col, tone: bad.value === 'on' ? 'off' : 'on' }]);
    }
  }
});

// ---------- ヒントの進み方 ----------
test('ヒント1 → 2 → 3 と進み、開き直しても段階を保つ。盤面が変われば再評価する', () => {
  const p = ALL.find((x) => x.id === 'normal-020');
  const s = new HintSession(p);
  const board = { route: [p.solution[0]], memo: [] };
  let v = s.open(board);
  assert.equal(v.level, 1); assert.ok(v.canMore); assert.ok(!v.canNext);
  v = s.more(); assert.equal(v.level, 2);
  v = s.more(); assert.equal(v.level, 3); assert.ok(!v.canMore); assert.ok(v.canNext);
  v = s.more(); assert.equal(v.level, 3, '3 より先には進まない');
  const k = v.key;
  // とじて、同じ盤面で開き直す → 同じヒントの 3 段階目
  v = s.open({ route: [...board.route], memo: [] });
  assert.equal(v.key, k); assert.equal(v.level, 3);
  // ヒントと関係ないメモを正しく付けても、同じ推理が有効なら段階を保つ
  const other = analyzeBoard(p, board).candidates[3].targets[0];
  v = s.open({ route: board.route, memo: [{ row: other.row, col: other.col, value: other.value }] });
  assert.equal(v.key, k); assert.equal(v.level, 3);
  // ヒント3のマスを自分でメモすると、そのヒントは終わり、次の推理（ヒント1から）になる
  const memo = v.targets.map((t) => ({ row: t.row, col: t.col, value: t.value }));
  v = s.open({ route: board.route, memo });
  assert.notEqual(v.key, k); assert.equal(v.level, 1);
});

test('「次のヒントをみる」で同じ推理をくり返さず、なくなったらメッセージを出す', () => {
  for (const p of [ALL[0], ALL[60], ALL[120], ALL[180], ALL[240]]) {
    const s = new HintSession(p);
    const board = { route: [p.solution[0]], memo: [] };
    const total = analyzeBoard(p, board).candidates.length;
    const keys = new Set();
    let v = s.open(board);
    for (let i = 0; i < total + 2 && v.kind !== 'none'; i++) {
      assert.ok(!keys.has(v.key), `${p.id}: くり返さない`);
      keys.add(v.key);
      v = s.next(board);
    }
    assert.equal(v.kind, 'none');
    assert.equal(v.text, NO_NEW_HINT);
    assert.equal(keys.size, total);
  }
});

test('すべて分かっている盤面・クリア済みの盤面では、無理にヒントを作らない', () => {
  const p = ALL[5];
  const sol = solSet(p);
  const memo = [];
  for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) {
    if (p.grid[r][c] === 1 && !isEnd(p, r, c)) memo.push({ row: r, col: c, value: sol.has(key(r, c)) ? 'on' : 'off' });
  }
  const v = new HintSession(p).open({ route: [p.solution[0]], memo });
  assert.equal(v.kind, 'none');
  assert.equal(v.text, ALL_KNOWN);
  assert.equal(new HintSession(p).open({ route: p.solution, memo: [], cleared: true }).kind, 'none');
});

test('ヒントを出してもルート・メモは変わらない', () => {
  const p = ALL[200];
  const g = new PuzzleGame(p);
  for (const [r, c] of p.solution.slice(1, 6)) g.moveTo(r, c);
  const m = new MemoBoard(p);
  const sol = solSet(p);
  for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) if (m.canEdit(r, c, g) && (r + c) % 4 === 0) m.set(r, c, sol.has(key(r, c)) ? MEMO.ON : MEMO.OFF, g);
  const before = [JSON.stringify(g.route), JSON.stringify(m.entries()), JSON.stringify(g.rowCounts)];
  const s = new HintSession(p);
  const board = () => ({ route: g.route, memo: m.entries() });
  s.open(board()); s.more(); s.more(); s.next(board()); s.more();
  analyzeBoard(p, board());
  assert.deepEqual([JSON.stringify(g.route), JSON.stringify(m.entries()), JSON.stringify(g.rowCounts)], before);
});

test('ヒントの計算は 8×8 でも速い', () => {
  const t0 = Date.now();
  for (const p of ALL.filter((x) => x.difficulty === 5)) analyzeBoard(p, { route: [p.solution[0]], memo: [] });
  assert.ok(Date.now() - t0 < 5000, `${Date.now() - t0} ms`);
});

// ---------- チュートリアル ----------
test('チュートリアルの問題：唯一解・推理で解ける・ページの条件に合う・本編と重複しない', () => {
  const t = parseTutorialData(TUTORIAL);
  const mainKeys = new Set(ALL.map(canonicalKey));
  for (const name of Object.keys(PAGE_RULES)) {
    const p = t.pages[name];
    assert.ok(p, name);
    assert.equal(countSolutions(p).status, 'unique', name);
    const r = deduce(p);
    assert.equal(r.status, 'solved', name);
    assert.ok(PAGE_RULES[name](p, r), `${name} の条件`);
    assert.ok(!mainKeys.has(canonicalKey(p)), `${name} は本編と別の問題`);
    assert.ok(!ALL.some((q) => q.id === p.id), 'ID も本編と別');
  }
});
