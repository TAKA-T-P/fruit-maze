// 第2段階：ソルバー・推理ソルバー・難易度評価・重複判定・問題生成のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countSolutions } from '../tools/solver.mjs';
import { deduce } from '../js/deduce.js';
import { ratePuzzle } from '../tools/rating.mjs';
import { canonicalKey, transformPuzzle, similarity } from '../tools/symmetry.mjs';
import { generateLevel, makeCandidate, levelRng, nextId, LEVEL_CONF, checkLevelFit } from '../tools/puzzle-gen.mjs';
import { formatPuzzleFile } from '../tools/puzzle-io.mjs';
import { validatePuzzle } from '../js/puzzle-utils.js';

const DATA = JSON.parse(readFileSync(new URL('../data/puzzles.json', import.meta.url), 'utf8'));
const STAGE1 = JSON.parse(readFileSync(new URL('./fixtures/stage1-puzzles.json', import.meta.url), 'utf8'));
const byLevel = (l) => DATA.puzzles.filter((p) => p.difficulty === l);

// 唯一解の小さな問題（logic.test.mjs と同じ）
const UNIQUE = {
  id: 'fixture', difficulty: 1, rows: 4, cols: 4,
  grid: [[1, 1, 1, 1], [1, 0, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]],
  rowClues: [3, 1, 3, 1], colClues: [3, 2, 3, 0],
  start: { row: 0, col: 0, side: 'left' }, goal: { row: 3, col: 0, side: 'bottom' },
  solution: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [3, 0]],
};
// 3×3 をすべて通る道は 2 通り（横にジグザグ／縦にジグザグ）→ 複数解
const MULTI = {
  id: 'multi', difficulty: 1, rows: 3, cols: 3,
  grid: [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
  rowClues: [3, 3, 3], colClues: [3, 3, 3],
  start: { row: 0, col: 0, side: 'left' }, goal: { row: 2, col: 2, side: 'right' },
  solution: [[0, 0], [0, 1], [0, 2], [1, 2], [1, 1], [1, 0], [2, 0], [2, 1], [2, 2]],
};
// 中央の列が空白で、左右がつながらない → 解なし
const NONE = {
  id: 'none', difficulty: 1, rows: 3, cols: 3,
  grid: [[1, 0, 1], [1, 0, 1], [1, 0, 1]],
  rowClues: [2, 0, 0], colClues: [1, 0, 1],
  start: { row: 0, col: 0, side: 'left' }, goal: { row: 0, col: 2, side: 'right' },
  solution: [[0, 0], [0, 2]],
};

// ---------- 全解探索ソルバー ----------
test('ソルバー：唯一解・複数解・解なしを区別する', () => {
  const u = countSolutions(UNIQUE);
  assert.equal(u.status, 'unique');
  assert.deepEqual(u.solutions[0], UNIQUE.solution);
  assert.equal(countSolutions(MULTI).status, 'multiple');
  assert.equal(countSolutions(MULTI, { limit: 5 }).count, 2);
  assert.equal(countSolutions(NONE).status, 'none');
});

test('ソルバー：探索上限に達したら unknown（唯一解と判定しない）', () => {
  for (const p of byLevel(5).slice(0, 10)) {
    const r = countSolutions(p, { maxNodes: 3 });
    assert.equal(r.status, 'unknown', p.id);
    assert.equal(r.complete, false);
    assert.notEqual(r.status, 'unique');
  }
});

test('ソルバー：旧形式の呼び出し countSolutions(p, 2) も使える', () => {
  assert.equal(countSolutions(UNIQUE, 2).count, 1);
});

test('ソルバー：8×8 でも探索が上限内・短時間で終わる', () => {
  const t0 = Date.now();
  for (const p of byLevel(5)) {
    const r = countSolutions(p, { maxNodes: LEVEL_CONF[5].maxNodes });
    assert.equal(r.status, 'unique', p.id);
    assert.ok(r.nodes < LEVEL_CONF[5].maxNodes);
  }
  assert.ok(Date.now() - t0 < 20_000, `${Date.now() - t0} ms`);
});

// ---------- 推理ソルバー ----------
test('推理ソルバー：全収録問題を論理だけで解き、正解と一致する', () => {
  for (const p of [DATA.tutorial, ...DATA.puzzles]) {
    const r = deduce(p);
    assert.equal(r.status, 'solved', p.id);
    assert.equal(r.matchesSolution, true, p.id);
    assert.ok(r.steps.length > 0 && r.steps.every((s) => s.wave >= 1 && typeof s.rule === 'string'));
  }
});

test('推理ソルバー：数字だけで決まる問題は、行・列の規則だけで解ける', () => {
  const r = deduce(UNIQUE, { allowTrial: false });
  assert.equal(r.status, 'solved');
  assert.equal(r.trialWaves, 0);
  assert.ok(r.ruleCounts['line-zero'] >= 1, '数字 0 の列を使う');
});

test('推理ソルバー：解が 1 つに決まらない問題は「解き切れない」と報告する', () => {
  const r = deduce(MULTI);
  assert.notEqual(r.status, 'solved');
  assert.ok(r.unknownCells > 0 || r.status === 'stuck');
  assert.equal(deduce(NONE).status, 'contradiction');
});

// ---------- 難易度評価 ----------
test('難易度評価：同じ問題は同じ結果（決定的）', () => {
  for (const p of [byLevel(1)[0], byLevel(3)[5], byLevel(5)[7]]) {
    assert.deepEqual(ratePuzzle(p), ratePuzzle(p));
  }
});

test('難易度評価：簡単な問題は高く評価されず、★が上がるほど平均スコアが上がる', () => {
  assert.ok(ratePuzzle(UNIQUE).score < 25, `fixture score ${ratePuzzle(UNIQUE).score}`);
  const avg = (l) => byLevel(l).reduce((s, p) => s + ratePuzzle(p).score, 0) / byLevel(l).length;
  const avgs = [1, 2, 3, 4, 5].map(avg);
  for (let i = 1; i < avgs.length; i++) assert.ok(avgs[i] > avgs[i - 1], `平均スコア ${avgs.map(Math.round).join(' < ')}`);
  // 推理の段階数も ★1 より ★5 のほうが明らかに多い
  const stages = (l) => byLevel(l).reduce((s, p) => s + ratePuzzle(p).metrics.stages, 0) / byLevel(l).length;
  assert.ok(stages(5) > stages(1) * 3);
});

test('難易度評価：評価できない場合は理由を返す', () => {
  const r = ratePuzzle(MULTI);
  assert.equal(r.evaluable, false);
  assert.match(r.reason, /確定できない/);
});

// ---------- 重複・類似 ----------
test('重複判定：回転・反転・START/GOAL 入れ替えを同じ問題とみなす', () => {
  const p = byLevel(4)[3];
  const key = canonicalKey(p);
  const n = p.rows, R = n - 1;
  const maps = [(r, c) => [c, R - r], (r, c) => [R - r, R - c], (r, c) => [r, R - c], (r, c) => [c, r], (r, c) => [R - c, R - r]];
  for (const f of maps) {
    const q = transformPuzzle(p, { rows: n, cols: n, f });
    assert.deepEqual(validatePuzzle(q), [], '変換後も正しい問題');
    assert.equal(countSolutions(q).status, 'unique');
    assert.equal(canonicalKey(q), key);
  }
  const swapped = { ...p, start: p.goal, goal: p.start, solution: [...p.solution].reverse() };
  assert.equal(canonicalKey(swapped), key);
  assert.notEqual(canonicalKey(byLevel(4)[4]), key);
  assert.equal(similarity(p, transformPuzzle(p, { rows: n, cols: n, f: maps[0] })), 1);
});

test('収録問題：回転・反転を含めて重複がない', () => {
  const keys = new Set(DATA.puzzles.map(canonicalKey));
  assert.equal(keys.size, DATA.puzzles.length);
});

test('収録問題：第2段階で追加した問題は、同じ★の問題と似すぎていない', () => {
  const old = new Set(STAGE1.puzzles.map((p) => p.id));
  for (const l of [1, 2, 3, 4, 5]) {
    const ps = byLevel(l);
    for (const a of ps) {
      if (old.has(a.id)) continue;
      for (const b of ps) if (a !== b && a.id > b.id) assert.ok(similarity(a, b) <= LEVEL_CONF[l].maxSim, `${a.id} ~ ${b.id}`);
    }
  }
});

// ---------- 収録データと既存データの互換性 ----------
test('既存 36 問と例題は、ID も内容も第1段階のまま', () => {
  const now = new Map(DATA.puzzles.map((p) => [p.id, p]));
  for (const p of STAGE1.puzzles) assert.deepEqual(now.get(p.id), p, p.id);
  assert.deepEqual(DATA.tutorial, STAGE1.tutorial);
});

test('全難易度に 50 問ずつ収録（★4・★5 は 10 問以上が条件）', () => {
  for (const l of [1, 2, 3, 4, 5]) assert.equal(byLevel(l).length, 50, `★${l}`);
});

test('追加した問題は、すべてその★の採用条件を満たす', () => {
  const old = new Set(STAGE1.puzzles.map((p) => p.id));
  for (const p of DATA.puzzles) {
    if (old.has(p.id)) continue;
    assert.equal(checkLevelFit(ratePuzzle(p), LEVEL_CONF[p.difficulty]), null, p.id);
    assert.ok(p.grid.flat().filter((v) => v === 0).length >= LEVEL_CONF[p.difficulty].minBlanks, p.id);
  }
});

test('問題ファイルの書式：読み込んで書き出すと同じ内容になる', () => {
  assert.equal(formatPuzzleFile(DATA), readFileSync(new URL('../data/puzzles.json', import.meta.url), 'utf8'));
});

// ---------- 生成 ----------
test('生成：ID は既存の続き番号で衝突しない', () => {
  assert.equal(nextId('easy', ['easy-001', 'easy-012', 'normal-020']), 'easy-013');
  assert.equal(nextId('expert', []), 'expert-001');
});

test('生成：同じシードなら同じ問題、別のシードなら別の問題', () => {
  const existing = STAGE1.puzzles.slice();
  const a = generateLevel({ level: 2, target: 16, existing, seed: 7 });
  const b = generateLevel({ level: 2, target: 16, existing, seed: 7 });
  const c = generateLevel({ level: 2, target: 16, existing, seed: 8 });
  assert.equal(a.added.length, 4);
  assert.deepEqual(a.added.map((x) => x.puzzle), b.added.map((x) => x.puzzle));
  assert.notDeepEqual(a.added.map((x) => x.puzzle.grid), c.added.map((x) => x.puzzle.grid));
});

test('生成：採用されるのは唯一解・推理で解ける・条件に合う問題だけ。既存問題は変わらない', () => {
  const existing = STAGE1.puzzles.slice();
  const snapshot = JSON.stringify(existing);
  const r = generateLevel({ level: 3, target: 18, existing, seed: 42 });
  assert.equal(JSON.stringify(existing), snapshot, '既存問題の配列を変更しない');
  assert.equal(r.total, 18);
  const ids = new Set(existing.map((p) => p.id));
  for (const { puzzle, rating } of r.added) {
    assert.ok(!ids.has(puzzle.id), puzzle.id);
    assert.match(puzzle.id, /^hard-0(1[3-9])$/);
    assert.deepEqual(validatePuzzle(puzzle), []);
    assert.equal(countSolutions(puzzle).status, 'unique');
    assert.equal(rating.evaluable, true);
    assert.equal(checkLevelFit(rating, LEVEL_CONF[3]), null);
  }
});

test('生成：唯一解にならない候補は採用しない（候補単位）', () => {
  const rand = levelRng(1, 4);
  let accepted = 0;
  for (let i = 0; i < 60; i++) {
    const c = makeCandidate(rand, 4);
    if (c.reject) { assert.ok(!c.puzzle || c.reject === 'logic-unsolved'); continue; }
    accepted++;
    assert.equal(countSolutions(c.puzzle).status, 'unique');
  }
  assert.ok(accepted > 0);
});

test('生成：時間の上限で必ず止まる', () => {
  const t0 = Date.now();
  const r = generateLevel({ level: 5, target: 10_000, existing: [], seed: 3, maxMillis: 300 });
  assert.ok(Date.now() - t0 < 5_000);
  assert.ok(r.total < 10_000);
});
