// ロジックの自動テスト：  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PuzzleGame, STATUS, MOVE } from '../js/game.js';
import { validatePuzzle } from '../js/puzzle-utils.js';
import { PuzzleLibrary, DIFFICULTIES } from '../js/puzzle-loader.js';
import { createStore, STORAGE_KEY } from '../js/storage.js';
import { countSolutions } from '../tools/solver.mjs';

const DATA = JSON.parse(readFileSync(new URL('../data/puzzles.json', import.meta.url), 'utf8'));

// テスト用の固定問題
//   S 🍓 🍓 🍓        行の数字 [3,1,3,1] / 列の数字 [3,2,3,0]
//   🍓 ・ 🍓 🍓       正解: (0,0)→(0,1)→(0,2)→(1,2)→(2,2)→(2,1)→(2,0)→(3,0)G
//   🍓 🍓 🍓 🍓
//   G 🍓 🍓 🍓
const FIXTURE = {
  id: 'fixture', difficulty: 1, rows: 4, cols: 4,
  grid: [[1, 1, 1, 1], [1, 0, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]],
  rowClues: [3, 1, 3, 1], colClues: [3, 2, 3, 0],
  start: { row: 0, col: 0, side: 'left' },
  goal: { row: 3, col: 0, side: 'bottom' },
  solution: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [3, 0]],
};
// 数字に余裕のある 3×3（判定の挙動だけを見るためのもの。正式な問題データではない）
const OPEN = {
  id: 'open', difficulty: 1, rows: 3, cols: 3,
  grid: [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
  rowClues: [3, 3, 3], colClues: [3, 3, 3],
  start: { row: 0, col: 0, side: 'left' },
  goal: { row: 2, col: 0, side: 'left' },
};
const play = (g, cells) => cells.map(([r, c]) => g.moveTo(r, c));

test('fixture は正しい問題データ', () => {
  assert.deepEqual(validatePuzzle(FIXTURE), []);
});

// ---------- 基本操作 ----------
test('スタートマスは最初から 1 個として数える', () => {
  const g = new PuzzleGame(FIXTURE, { startFrom: 'start' });
  assert.deepEqual(g.route, [[0, 0]]);
  assert.equal(g.rowCounts[0], 1);
  assert.equal(g.colCounts[0], 1);
});

test('隣接するフルーツへ進める', () => {
  const g = new PuzzleGame(FIXTURE, { startFrom: 'start' });
  assert.equal(g.moveTo(0, 1).type, MOVE.MOVED);
  assert.deepEqual(g.head, [0, 1]);
  assert.equal(g.rowCounts[0], 2);
  assert.equal(g.colCounts[1], 1);
});

test('斜め・離れたマスには進めない', () => {
  const g = new PuzzleGame(FIXTURE, { startFrom: 'start' });
  g.moveTo(0, 1);
  const r1 = g.moveTo(1, 2);
  assert.equal(r1.type, MOVE.IGNORED);
  assert.equal(r1.reason, 'not-adjacent');
  assert.equal(g.moveTo(0, 3).reason, 'not-adjacent');
  assert.deepEqual(g.head, [0, 1]);
});

test('空白マスへは進めない', () => {
  const g = new PuzzleGame(FIXTURE, { startFrom: 'start' });
  g.moveTo(0, 1);
  const r = g.moveTo(1, 1);
  assert.equal(r.type, MOVE.IGNORED);
  assert.equal(r.reason, 'blank');
});

test('通過済みのマスへは進めない（直前のマスは「もどる」になる）', () => {
  const g = new PuzzleGame(OPEN, { startFrom: 'start' });
  play(g, [[0, 1], [1, 1], [1, 0]]);
  // (1,0) から (0,0)=スタート は通過済み、直前ではない
  const r = g.moveTo(0, 0);
  assert.equal(r.type, MOVE.IGNORED);
  assert.equal(r.reason, 'visited');
  // 直前のマス (1,1) をタップ → 1 手もどる
  const u = g.moveTo(1, 1);
  assert.equal(u.type, MOVE.UNDONE);
  assert.deepEqual(g.head, [1, 1]);
  assert.equal(g.isVisited(1, 0), false);
});

test('1 手もどると数字が正しく減算される', () => {
  const g = new PuzzleGame(FIXTURE, { startFrom: 'start' });
  play(g, [[0, 1], [0, 2]]);
  assert.equal(g.rowCounts[0], 3);
  assert.equal(g.colCounts[2], 1);
  assert.equal(g.undo(), true);
  assert.equal(g.rowCounts[0], 2);
  assert.equal(g.colCounts[2], 0);
  assert.equal(g.isVisited(0, 2), false);
});

test('スタートだけの状態では もどれない', () => {
  const g = new PuzzleGame(FIXTURE, { startFrom: 'start' });
  assert.equal(g.undo(), false);
  assert.deepEqual(g.route, [[0, 0]]);
});

test('やり直しで初期状態に戻る（問題は変わらない）', () => {
  const g = new PuzzleGame(FIXTURE, { startFrom: 'start' });
  play(g, [[0, 1], [0, 2], [1, 2]]);
  g.reset();
  assert.deepEqual(g.route, [[0, 0]]);
  assert.deepEqual(g.rowCounts, [1, 0, 0, 0]);
  assert.deepEqual(g.colCounts, [1, 0, 0, 0]);
  assert.equal(g.status, STATUS.PLAYING);
  assert.equal(g.puzzle, FIXTURE);
});

// ---------- 数字判定 ----------
test('行の指定数を超える移動はできない（ルートは維持）', () => {
  const g = new PuzzleGame(FIXTURE, { startFrom: 'start' });
  play(g, [[1, 0], [2, 0], [2, 1], [3, 1]]); // 行3 = 1/1
  const before = g.route.map((x) => [...x]);
  const r = g.moveTo(3, 2);
  assert.equal(r.type, MOVE.BLOCKED);
  assert.equal(r.overRow, true);
  assert.equal(r.overCol, false);
  assert.deepEqual(g.route, before);
  assert.equal(g.rowCounts[3], 1);
});

test('列の指定数を超える移動はできない', () => {
  const g = new PuzzleGame(FIXTURE, { startFrom: 'start' });
  play(g, [[0, 1], [0, 2], [1, 2], [2, 2]]); // 列2 = 3/3
  const r = g.moveTo(3, 2);
  assert.equal(r.type, MOVE.BLOCKED);
  assert.equal(r.overRow, false);
  assert.equal(r.overCol, true);
  assert.equal(g.colCounts[2], 3);
});

test('数字 0 の列には入れない', () => {
  const g = new PuzzleGame(FIXTURE, { startFrom: 'start' });
  play(g, [[0, 1], [0, 2]]);
  const r = g.moveTo(0, 3);
  assert.equal(r.type, MOVE.BLOCKED);
  assert.equal(r.overCol, true);
});

test('行・列が指定数に達すると done になる', () => {
  const g = new PuzzleGame(FIXTURE, { startFrom: 'start' });
  play(g, [[0, 1], [0, 2]]);
  assert.equal(g.rowState(0).done, true);
  assert.equal(g.rowState(1).done, false);
  assert.deepEqual(g.colState(2), { count: 1, clue: 3, done: false, over: false });
});

test('条件を満たさずにゴールしてもクリアにならない／新しい移動は受け付けない', () => {
  const g = new PuzzleGame(OPEN, { startFrom: 'start' });
  const res = play(g, [[1, 0], [2, 0]]);
  assert.equal(res.at(-1).status, STATUS.AT_GOAL);
  assert.equal(g.status, STATUS.AT_GOAL);
  assert.equal(g.rowCounts[2], 1, 'ゴールマスも 1 個に数える');
  assert.equal(g.colCounts[0], 3);
  const r = g.moveTo(2, 1);
  assert.equal(r.type, MOVE.IGNORED);
  assert.equal(r.reason, 'locked');
  // もどれば再び進める
  assert.equal(g.moveTo(1, 0).type, MOVE.UNDONE);
  assert.equal(g.status, STATUS.PLAYING);
  assert.equal(g.moveTo(1, 1).type, MOVE.MOVED);
});

test('正解ルートでゴールするとクリア。クリア後は操作できない', () => {
  const g = new PuzzleGame(FIXTURE, { startFrom: 'start' });
  const res = play(g, FIXTURE.solution.slice(1));
  assert.ok(res.slice(0, -1).every((r) => r.type === MOVE.MOVED && r.status === STATUS.PLAYING));
  assert.equal(g.status, STATUS.CLEARED);
  assert.equal(g.allCluesSatisfied(), true);
  assert.equal(g.undo(), false);
  assert.equal(g.moveTo(2, 0).type, MOVE.IGNORED);
});

// ---------- 収録データ ----------
test('収録問題：すべて正しい形式で、正解ルートと数字が一致する', () => {
  assert.ok(DATA.puzzles.length > 0);
  for (const p of [...DATA.puzzles, DATA.tutorial]) assert.deepEqual(validatePuzzle(p), [], p.id);
});

test('収録問題：エンジンで正解ルートを再生するとクリアになる', () => {
  for (const p of [...DATA.puzzles, DATA.tutorial]) {
    const g = new PuzzleGame(p, { startFrom: 'start' });
    for (const [r, c] of p.solution.slice(1)) assert.equal(g.moveTo(r, c).type, MOVE.MOVED, `${p.id} (${r},${c})`);
    assert.equal(g.status, STATUS.CLEARED, p.id);
  }
});

test('収録問題：解はちょうど 1 つ（ソルバーで確認）', () => {
  for (const p of [...DATA.puzzles, DATA.tutorial]) {
    const { count, solutions } = countSolutions(p, 2);
    assert.equal(count, 1, `${p.id} の解の数`);
    assert.deepEqual(solutions[0], p.solution, p.id);
  }
});

test('収録問題：id 重複なし・盤面サイズが難易度と一致', () => {
  const ids = new Set();
  for (const p of DATA.puzzles) {
    assert.ok(!ids.has(p.id), `重複 ${p.id}`);
    ids.add(p.id);
    const d = DIFFICULTIES.find((x) => x.level === p.difficulty);
    assert.equal(p.rows, d.size, p.id);
    assert.equal(p.cols, d.size, p.id);
  }
});

// ---------- 問題管理 ----------
test('ライブラリ：難易度別に読み込み、無効な問題はスキップ', () => {
  const broken = { ...FIXTURE, id: 'broken', rowClues: [9, 1, 3, 1] };
  const skipped = [];
  const lib = new PuzzleLibrary({ puzzles: [...DATA.puzzles, broken], tutorial: DATA.tutorial }, { onInvalid: (id) => skipped.push(id) });
  assert.deepEqual(skipped, ['broken']);
  for (const d of DIFFICULTIES) {
    const expected = DATA.puzzles.filter((p) => p.difficulty === d.level).length;
    assert.equal(lib.count(d.level), expected);
    assert.ok(lib.list(d.level).every((p) => p.difficulty === d.level));
  }
  assert.ok(lib.tutorial);
});

test('ランダム出題：選んだ難易度から出し、直前の問題は避ける', () => {
  const lib = new PuzzleLibrary(DATA);
  const seen = new Set();
  let prev = null;
  for (let i = 0; i < 3000; i++) {
    const p = lib.pickRandom(1, { excludeId: prev });
    assert.equal(p.difficulty, 1);
    assert.notEqual(p.id, prev);
    seen.add(p.id);
    prev = p.id;
  }
  assert.equal(seen.size, lib.count(1), 'すべての問題が出題されうる');
});

test('ランダム出題：1 問しかなければ同じ問題を再出題、0 問なら null', () => {
  const lib = new PuzzleLibrary({ puzzles: [FIXTURE] });
  assert.equal(lib.pickRandom(1, { excludeId: 'fixture' }).id, 'fixture');
  assert.equal(lib.pickRandom(4), null);
});

test('ランダム出題：重み付け（将来の未クリア優先用）', () => {
  const lib = new PuzzleLibrary(DATA);
  const only = lib.list(2)[3].id;
  for (let i = 0; i < 50; i++) assert.equal(lib.pickRandom(2, { weight: (p) => (p.id === only ? 1 : 0) }).id, only);
});

// ---------- 保存 ----------
function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

test('初回クリア数は重複カウントしない', () => {
  const s = createStore(memoryStorage());
  assert.deepEqual(s.recordClear('easy-001'), { firstClear: true, clearCount: 1 });
  assert.deepEqual(s.recordClear('easy-001'), { firstClear: false, clearCount: 2 });
  s.recordClear('easy-002');
  s.recordClear('easy-001');
  assert.equal(s.firstClearCount(), 2);
  assert.equal(s.getRecord('easy-001').clearCount, 3);
  assert.equal(s.firstClearCount(['easy-002', 'normal-001']), 1);
});

test('保存データを読み込み直しても記録が維持される', () => {
  const backend = memoryStorage();
  const s1 = createStore(backend);
  const when = new Date('2026-11-18T10:00:00Z');
  s1.recordClear('hard-003', when);
  s1.setLastDifficulty(3);
  const s2 = createStore(backend);
  assert.equal(s2.isCleared('hard-003'), true);
  assert.equal(s2.getRecord('hard-003').firstClearedAt, when.toISOString());
  assert.equal(s2.getLastDifficulty(), 3);
  assert.deepEqual(s2.clearedIds(), ['hard-003']);
});

test('壊れた保存データ・保存不可の環境でも動く', () => {
  const backend = memoryStorage();
  backend.setItem(STORAGE_KEY, '{oops');
  const s = createStore(backend);
  assert.equal(s.firstClearCount(), 0);
  const noStore = createStore(null);
  assert.equal(noStore.recordClear('x').firstClear, true);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const s3 = createStore(throwing);
  assert.equal(s3.recordClear('y').firstClear, true);
});

test('ステージ番号：並び順の指定がないときは ID 順（easy-001〜050 など）', () => {
  const lib = new PuzzleLibrary(DATA);
  const prefix = { 1: 'easy', 2: 'normal', 3: 'hard', 4: 'expert', 5: 'master' };
  for (const level of [1, 2, 3, 4, 5]) {
    const list = lib.list(level);
    assert.equal(list.length, 50);
    list.forEach((p, i) => assert.equal(p.id, `${prefix[level]}-${String(i + 1).padStart(3, '0')}`, `★${level} ステージ${i + 1}`));
  }
});

import { Stopwatch } from '../js/timer.js';

test('タイマー：一時停止している間（設定画面など）は時間が進まない', () => {
  let t = 0;
  const sw = new Stopwatch(() => t);
  sw.start();
  t = 5000;
  sw.pause();
  assert.equal(sw.paused, true);
  t = 65000;                     // 止めている 60 秒
  assert.equal(sw.elapsed(), 5000);
  sw.resume();
  t = 70000;
  assert.equal(sw.elapsed(), 10000);
  sw.pause(); t = 90000; sw.stop(); // 一時停止中にクリアしても、止めていた時間は数えない
  assert.equal(sw.elapsed(), 10000);
  assert.equal(sw.running, false);
});

test('ヒントを使ったクリアでは ★ にならない。あとでヒントなしでクリアすると ★ になる', () => {
  const backend = memoryStorage();
  const s = createStore(backend);
  s.recordClear('easy-001', new Date(), { usedHint: true });
  assert.equal(s.isCleared('easy-001'), true, 'クリアは記録される（フルーツの解放などに数える）');
  assert.equal(s.isHintFreeCleared('easy-001'), false, 'ヒントを使ったので ★ なし');
  s.recordClear('easy-001', new Date(), { usedHint: true });
  assert.equal(s.isHintFreeCleared('easy-001'), false);
  s.recordClear('easy-001', new Date(), { usedHint: false });
  assert.equal(s.isHintFreeCleared('easy-001'), true, 'ヒントなしでクリア → ★');
  s.recordClear('easy-001', new Date(), { usedHint: true });
  assert.equal(s.isHintFreeCleared('easy-001'), true, 'あとでヒントを使っても ★ は消えない');
  assert.equal(s.getRecord('easy-001').clearCount, 4);
  // ヒントなしの初回クリア
  s.recordClear('easy-002');
  assert.equal(s.isHintFreeCleared('easy-002'), true);
  // 読み込み直しても残る
  const s2 = createStore(backend);
  assert.equal(s2.isHintFreeCleared('easy-001'), true);
  assert.equal(s2.isHintFreeCleared('easy-003'), false, 'クリアしていない');
});

test('ヒントの記録を始める前のクリア記録は、ヒントなしとみなす（★ は消えない）', () => {
  const backend = memoryStorage();
  backend.setItem(STORAGE_KEY, JSON.stringify({ version: 1, lastDifficulty: 1, cleared: { 'easy-005': { firstClearedAt: '2026-11-18T09:00:00.000Z', clearCount: 2 } } }));
  const s = createStore(backend);
  assert.equal(s.isHintFreeCleared('easy-005'), true);
  s.recordClear('easy-005', new Date(), { usedHint: true });
  assert.equal(s.isHintFreeCleared('easy-005'), true);
  assert.equal(s.getRecord('easy-005').clearCount, 3);
});

// ---- ステージの並び（同じ★の中で、難易度評価の低い順） ----
import { computeStageOrder, formatStageOrder } from '../tools/make-stage-order.mjs';
const STAGE_ORDER_TEXT = readFileSync(new URL('../data/stage-order.json', import.meta.url), 'utf8');
const STAGE_ORDER = JSON.parse(STAGE_ORDER_TEXT);

test('ステージの並び：data/stage-order.json は今の問題データと難易度評価から作ったものと一致する', () => {
  assert.equal(STAGE_ORDER_TEXT.replace(/\r\n/g, '\n'), formatStageOrder(computeStageOrder(DATA.puzzles)));
});

test('ステージの並び：各★の 50 問をすべて 1 回ずつ含み、評価の低い順。ステージ1〜10 はやさしく、41〜50 はむずかしい', () => {
  const lib = new PuzzleLibrary(DATA, { stageOrder: STAGE_ORDER });
  for (const level of [1, 2, 3, 4, 5]) {
    const list = lib.list(level);
    const ids = list.map((p) => p.id);
    assert.equal(list.length, 50);
    assert.deepEqual([...ids].sort(), DATA.puzzles.filter((p) => p.difficulty === level).map((p) => p.id).sort());
    const score = ids.map((id) => STAGE_ORDER.scores[id]);
    for (let i = 1; i < score.length; i++) assert.ok(score[i - 1] <= score[i], `★${level} ステージ${i}→${i + 1}`);
    assert.ok(Math.max(...score.slice(0, 10)) <= Math.min(...score.slice(40)), `★${level} 1〜10 と 41〜50`);
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    assert.ok(avg(score.slice(0, 10)) < avg(score.slice(40)));
  }
});

test('ステージの並び：並びにない問題はうしろに ID 順で付く・並びが壊れていても全問を出せる', () => {
  const lib = new PuzzleLibrary(DATA, { stageOrder: { levels: { 1: ['easy-030', 'easy-002', 'nothing'] }, 2: 'bad' } });
  const easy = lib.list(1).map((p) => p.id);
  assert.deepEqual(easy.slice(0, 3), ['easy-030', 'easy-002', 'easy-001']);
  assert.equal(easy.length, 50);
  assert.equal(lib.list(2)[0].id, 'normal-001');
});

// ---- どちらの青マスから始めてもよい ----
import { analyzeBoard } from '../js/hint.js';

test('青マス：はじめは道がなく、青マス以外からは始められない', () => {
  const p = DATA.puzzles[0];
  const g = new PuzzleGame(p);
  assert.equal(g.route.length, 0);
  assert.equal(g.head, null);
  const [r, c] = p.solution[1];
  assert.equal(g.moveTo(r, c).reason, 'not-endpoint');
  assert.equal(g.route.length, 0);
  assert.ok(g.isEndpoint(p.start.row, p.start.col) && g.isEndpoint(p.goal.row, p.goal.col));
});

test('青マス：start からでも goal からでも、正解の道でクリアできる（全 250 問）', () => {
  for (const p of DATA.puzzles) {
    for (const path of [p.solution, [...p.solution].reverse()]) {
      const g = new PuzzleGame(p);
      for (const [r, c] of path) assert.equal(g.moveTo(r, c).type, MOVE.MOVED, p.id);
      assert.equal(g.status, STATUS.CLEARED, p.id);
    }
  }
});

test('青マス：出発点だけのときにもう一方の青マスに触れると、そちらから始め直す。1手もどると道がなくなる', () => {
  const p = DATA.puzzles.find((x) => Math.abs(x.start.row - x.goal.row) + Math.abs(x.start.col - x.goal.col) > 1);
  const g = new PuzzleGame(p);
  g.moveTo(p.start.row, p.start.col);
  assert.ok(g.isStart(p.start.row, p.start.col) && g.isGoal(p.goal.row, p.goal.col));
  const res = g.moveTo(p.goal.row, p.goal.col);
  assert.equal(res.type, MOVE.MOVED);
  assert.deepEqual(g.route, [[p.goal.row, p.goal.col]]);
  assert.ok(g.isStart(p.goal.row, p.goal.col) && g.isGoal(p.start.row, p.start.col));
  assert.equal(g.rowCounts.reduce((a, b) => a + b, 0), 1, '数え直している');
  assert.equal(g.undo(), true);
  assert.equal(g.route.length, 0);
  assert.equal(g.origin, null);
  assert.equal(g.rowCounts.reduce((a, b) => a + b, 0), 0);
});

test('青マス：goal 側から始めても、ヒントは正しい道として扱う（まちがい扱いしない）', () => {
  for (const p of DATA.puzzles.filter((x) => x.difficulty <= 2).slice(0, 30)) {
    const rev = [...p.solution].reverse();
    const a = analyzeBoard(p, { route: rev.slice(0, 3), memo: [] });
    assert.notEqual(a.status, 'route-wrong', p.id);
    const empty = analyzeBoard(p, { route: [], memo: [] });
    assert.equal(empty.status, 'ok', p.id);
  }
});
