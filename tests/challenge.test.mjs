// 第5段階：タイムアタック（設定・称号・記録・進行・数字超過のルール）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TA_LEVELS, taConfig, overtimeSecondsOf, challengeName } from '../js/challenge-config.js';
import { titleFor, nextTitle, nextTitleText, titlesOf, isMaster, allMaster, masterClearsOf, TITLE_TABLE } from '../js/challenge-titles.js';
import { createChallengeStore, TIME_ATTACK_KEY } from '../js/challenge-storage.js';
import { TimeAttack, TA_STATE, formatRemaining } from '../js/challenge.js';
import { PuzzleGame, MOVE, STATUS } from '../js/game.js';
import { PuzzleLibrary } from '../js/puzzle-loader.js';
import { createStore } from '../js/storage.js';

const DATA = JSON.parse(readFileSync(new URL('../data/puzzles.json', import.meta.url), 'utf8'));
const lib = new PuzzleLibrary(DATA);
function mem() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; }
/** 時計を自由に進められるタイムアタック */
function session(level, { random = Math.random } = {}) {
  const clock = { t: 1_000_000 };
  const ta = new TimeAttack({ level, puzzles: lib.list(level), now: () => clock.t, random });
  return { ta, clock };
}

// ---------------- 難易度・時間 ----------------
test('難易度ごとの制限時間・ロスタイム・最高称号の条件', () => {
  const spec = [[1, 120, 10, 10], [2, 180, 15, 7], [3, 240, 20, 5], [4, 300, 25, 4], [5, 300, 30, 3]];
  assert.equal(TA_LEVELS.length, 5);
  for (const [level, normal, over, master] of spec) {
    const c = taConfig(level);
    assert.deepEqual([c.normalSeconds, c.overtimeSeconds, masterClearsOf(level)], [normal, over, master], `★${level}`);
    assert.equal(overtimeSecondsOf(level), (level + 1) * 5);
  }
  assert.equal(challengeName(3), '4分チャレンジ');
  assert.equal(challengeName(1), '2分チャレンジ');
});

// ---------------- 称号 ----------------
test('称号：正解数 0 では称号なし、各難易度の条件どおり', () => {
  const ids = (level, n) => titleFor(level, n)?.id ?? null;
  for (const c of TA_LEVELS) assert.equal(titleFor(c.level, 0), null);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => ids(1, n)),
    [null, 'rookie', 'rookie', 'challenger', 'challenger', 'meijin', 'meijin', 'tatsujin', 'tatsujin', 'tatsujin', 'kaiden', 'kaiden']);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((n) => ids(2, n)), ['rookie', 'challenger', 'challenger', 'meijin', 'tatsujin', 'tatsujin', 'kaiden']);
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => ids(3, n)), ['rookie', 'challenger', 'meijin', 'tatsujin', 'kaiden']);
  assert.deepEqual([1, 2, 3, 4].map((n) => ids(4, n)), ['challenger', 'meijin', 'tatsujin', 'kaiden']);
  assert.deepEqual([1, 2, 3].map((n) => ids(5, n)), ['challenger', 'tatsujin', 'kaiden']);
  assert.deepEqual(TA_LEVELS.map((c) => titlesOf(c.level).length), [5, 5, 5, 4, 3]);
});

test('称号：最高称号と、次の称号までの残り', () => {
  assert.equal(isMaster(1, 9), false);
  assert.equal(isMaster(1, 10), true);
  assert.equal(isMaster(5, 3), true);
  assert.deepEqual(((n) => [n.title.id, n.remaining])(nextTitle(1, 0)), ['rookie', 1]);
  assert.deepEqual(((n) => [n.title.id, n.remaining])(nextTitle(1, 8)), ['kaiden', 2]);
  assert.deepEqual(((n) => [n.title.id, n.remaining])(nextTitle(5, 1)), ['tatsujin', 1]);
  assert.equal(nextTitle(3, 5), null);
  assert.equal(nextTitleText(3, 3), '次の称号まで あと1問');
  assert.equal(nextTitleText(5, 2), 'あと1問で 👑 フルーツめいろの神！');
  assert.equal(nextTitleText(4, 4), '最高称号達成！');
  assert.equal(allMaster({ 1: 10, 2: 7, 3: 5, 4: 4, 5: 2 }), false);
  assert.equal(allMaster({ 1: 12, 2: 7, 3: 5, 4: 4, 5: 3 }), true);
});

// ---------------- 記録 ----------------
test('記録：自己ベストの更新（同点は更新ではない）、難易度ごとに独立', () => {
  const backend = mem();
  const s = createChallengeStore(backend);
  let r = s.recordResult(2, 3, new Date('2026-11-19T10:00:00Z'));
  assert.equal(r.newRecord, true);
  assert.equal(r.titleUp, true);
  assert.equal(r.title.id, 'challenger');
  r = s.recordResult(2, 3);
  assert.equal(r.newRecord, false, '同点');
  assert.equal(r.titleUp, false);
  r = s.recordResult(2, 1);
  assert.equal(r.newRecord, false);
  assert.equal(r.best, 3);
  const L = s.get(2);
  assert.deepEqual([L.bestClears, L.playCount, L.lastClears, L.bestAt], [3, 3, 1, '2026-11-19T10:00:00.000Z']);
  assert.equal(s.get(1).playCount, 0, 'ほかの難易度は別');
  r = s.recordResult(2, 0);
  assert.equal(r.newRecord, false);
  // 再読み込みしても残る
  const again = createChallengeStore(backend);
  assert.equal(again.get(2).bestClears, 3);
  assert.equal(again.get(2).playCount, 4);
});

test('記録：最高称号ははじめての 1 回だけ「達成」、5 難易度すべてで完全制覇（ずっと残る）', () => {
  const backend = mem();
  const s = createChallengeStore(backend);
  let r = s.recordResult(5, 3, new Date('2026-11-19T11:00:00Z'));
  assert.equal(r.firstMaster, true);
  assert.equal(s.get(5).masterAchievedAt, '2026-11-19T11:00:00.000Z');
  r = s.recordResult(5, 4);
  assert.equal(r.firstMaster, false);
  for (const [lv, n] of [[1, 10], [2, 7], [3, 5]]) assert.equal(s.recordResult(lv, n).newlyComplete, false);
  r = s.recordResult(4, 4);
  assert.equal(r.newlyComplete, true);
  assert.equal(s.isComplete(), true);
  assert.equal(s.recordResult(4, 4).newlyComplete, false, '2 回目は出さない');
  assert.equal(createChallengeStore(backend).isComplete(), true);
});

test('記録：別のキーに保存し、通常モードのクリア記録などは変えない。壊れたデータでも止まらない', () => {
  const backend = mem();
  const store = createStore(backend);
  store.recordClear('easy-001');
  const before = backend.getItem('fruitMaze.save.v1');
  createChallengeStore(backend).recordResult(1, 5);
  assert.equal(backend.getItem('fruitMaze.save.v1'), before);
  assert.deepEqual([...backend._m.keys()].sort(), ['fruitMaze.save.v1', TIME_ATTACK_KEY].sort());
  backend.setItem(TIME_ATTACK_KEY, '{broken');
  assert.equal(createChallengeStore(backend).get(1).bestClears, 0);
  backend.setItem(TIME_ATTACK_KEY, JSON.stringify({ levels: { 1: { bestClears: -3, playCount: 'x', bestAt: 'nope' }, 9: {} }, completeAt: 5 }));
  const s = createChallengeStore(backend);
  assert.deepEqual([s.get(1).bestClears, s.get(1).playCount, s.get(1).bestAt, s.isComplete()], [0, 0, null, false]);
  assert.equal(createChallengeStore(null).recordResult(1, 2).newRecord, true);
});

// ---------------- 進行 ----------------
test('開始：カウントダウンの時間は含めず、選んだ難易度の問題を出す', () => {
  const { ta, clock } = session(3);
  assert.equal(ta.state, TA_STATE.READY);
  ta.startCountdown();
  assert.equal(ta.state, TA_STATE.COUNTDOWN);
  clock.t += 2400; // 3・2・1
  const p = ta.begin();
  assert.equal(ta.state, TA_STATE.PLAYING);
  assert.equal(p.difficulty, 3);
  assert.equal(ta.normalDeadline - ta.startedAt, 240_000);
  assert.equal(ta.finalDeadline - ta.normalDeadline, 20_000);
  assert.equal(formatRemaining(ta.normalLeftMs()), '04:00');
  clock.t += 84_600;
  assert.equal(formatRemaining(ta.normalLeftMs()), '02:36');
});

test('正解でクリア数が増え、次の問題へ。1 回の挑戦で同じ問題は出ない（50 問をこえたら一巡）', () => {
  const { ta, clock } = session(1);
  ta.begin();
  const seen = [ta.current.id];
  for (let i = 0; i < 49; i++) {
    clock.t += 100;
    const r = ta.solved();
    assert.equal(r.type, 'next');
    assert.equal(r.puzzle.difficulty, 1);
    seen.push(r.puzzle.id);
  }
  assert.equal(ta.clears, 49);
  assert.equal(new Set(seen).size, 50, '50 問すべてちがう');
  const last = ta.current.id;
  const r = ta.solved();
  assert.notEqual(r.puzzle.id, last, '一巡したあとも直前と同じ問題は出さない');
  assert.equal(ta.clears, 50);
});

test('通常時間 0 秒で最終問題へ。問題は変わらない', () => {
  const { ta, clock } = session(2);
  ta.begin();
  const p = ta.current;
  clock.t = ta.normalDeadline - 1;
  assert.deepEqual(ta.update(), []);
  clock.t = ta.normalDeadline;
  assert.deepEqual(ta.update(), ['final']);
  assert.equal(ta.state, TA_STATE.FINAL);
  assert.equal(ta.current, p, '新しい問題には切り替えない');
  assert.deepEqual(ta.update(), [], '2 回目は何も起きない');
});

test('ケースA：通常時間の終わり直前に正解 → 1 問加算、次の問題が（時間が過ぎていれば）最終問題', () => {
  const { ta, clock } = session(1);
  ta.begin();
  clock.t = ta.normalDeadline - 300;
  const r = ta.solved();
  assert.deepEqual([r.type, r.final, ta.clears], ['next', false, 1]);
  clock.t = ta.normalDeadline + 100;
  assert.deepEqual(ta.update(), ['final']);
  assert.equal(ta.current, r.puzzle, '次の問題がそのまま最終問題');
});

test('ケースB：0 秒ちょうどで正解 → 1 回だけ加算し、次の問題が最終問題', () => {
  const { ta, clock } = session(1);
  ta.begin();
  clock.t = ta.normalDeadline;
  const r = ta.solved();
  assert.deepEqual([r.type, r.final, ta.clears, ta.state], ['next', true, 1, TA_STATE.FINAL]);
  // 最終問題を正解 → 2 問目として 1 回だけ加算して終了
  clock.t += 5000;
  const r2 = ta.solved();
  assert.deepEqual([r2.type, r2.reason, ta.clears], ['finished', 'final-cleared', 2]);
});

test('ケースC：最終問題中に正解 → 1 問加算して終了、次の問題は出さない', () => {
  const { ta, clock } = session(4);
  ta.begin();
  const first = ta.current;
  clock.t = ta.normalDeadline + 10_000;
  ta.update();
  const r = ta.solved();
  assert.deepEqual([r.type, r.reason, r.counted, ta.clears, ta.state], ['finished', 'final-cleared', true, 1, TA_STATE.FINISHED]);
  assert.equal(ta.current, first);
  assert.deepEqual(ta.solved(), { type: 'ignored' }, '終了後の正解は数えない（二重加算しない）');
  assert.deepEqual(ta.update(clock.t + 999_999), [], '終了処理は 1 回だけ');
  assert.equal(ta.clears, 1);
});

test('ケースD：最終問題の締め切りちょうどは正解、1 ミリ秒でも過ぎたら時間切れ', () => {
  const a = session(5);
  a.ta.begin();
  a.clock.t = a.ta.finalDeadline;
  assert.equal(a.ta.solved().reason, 'final-cleared');
  assert.equal(a.ta.clears, 1);
  const b = session(5);
  b.ta.begin();
  b.clock.t = b.ta.finalDeadline + 1;
  const r = b.ta.solved();
  assert.deepEqual([r.type, r.reason, r.counted, b.ta.clears], ['finished', 'timeup', false, 0]);
});

test('ロスタイム切れ：時間切れで終了（1 回だけ）。ロスタイムは難易度ごと', () => {
  for (const c of TA_LEVELS) {
    const { ta, clock } = session(c.level);
    ta.begin();
    clock.t = ta.normalDeadline + c.overtimeSeconds * 1000;
    assert.deepEqual(ta.update(), ['final'], `★${c.level}：締め切りちょうどはまだ`);
    clock.t += 1;
    assert.deepEqual(ta.update(), ['timeup']);
    assert.equal(ta.endReason, 'timeup');
    assert.deepEqual(ta.update(), []);
  }
});

test('ケースE・F：画面の更新が止まっていても（設定画面・タブ切り替え・スリープ）、時間は延びない', () => {
  const { ta, clock } = session(3);
  ta.begin();
  // 一度も update しないまま、ロスタイムの終わりまで時間がたった
  clock.t = ta.finalDeadline + 5000;
  assert.deepEqual(ta.update(), ['final', 'timeup'], '復帰した時点で最終問題 → 時間切れまで進める');
  // 止まっていた間の正解は数えない
  const t2 = session(3);
  t2.ta.begin();
  t2.clock.t = t2.ta.finalDeadline + 1;
  assert.equal(t2.ta.solved().counted, false);
  // 通常時間中に止まり、ロスタイム中に復帰して正解 → 最終問題の正解として 1 問（次の問題は出さない）
  const t3 = session(3);
  t3.ta.begin();
  t3.clock.t = t3.ta.normalDeadline + 3000;
  assert.equal(t3.ta.solved().reason, 'final-cleared');
});

test('途中でやめる：終了扱い（結果として記録しない）', () => {
  const { ta } = session(1);
  ta.begin();
  ta.abort();
  assert.equal(ta.endReason, 'aborted');
  assert.equal(ta.isActive, false);
  assert.deepEqual(ta.solved(), { type: 'ignored' });
});

// ---------------- 数字をこえる移動（エンジン） ----------------
const P = {
  id: 'fixture', difficulty: 1, rows: 4, cols: 4,
  grid: [[1, 1, 1, 1], [1, 0, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]],
  rowClues: [3, 1, 3, 1], colClues: [3, 2, 3, 0],
  start: { row: 0, col: 0, side: 'left' }, goal: { row: 3, col: 0, side: 'bottom' },
  solution: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [3, 0]],
};

test('通常モード（既定）では数字をこえる移動はできない', () => {
  const g = new PuzzleGame(P, { startFrom: 'start' });
  assert.equal(g.allowClueOverflow, false);
  g.moveTo(0, 1); g.moveTo(0, 2);
  assert.equal(g.moveTo(0, 3).type, MOVE.BLOCKED, '列の数字 0');
});

test('タイムアタックでは数字をこえて道をのばせる。ほかの制限はそのまま', () => {
  const g = new PuzzleGame(P, { allowClueOverflow: true, startFrom: 'start' });
  g.moveTo(0, 1); g.moveTo(0, 2);
  assert.equal(g.moveTo(0, 3).type, MOVE.MOVED, '列の数字 0 をこえて進める');
  assert.equal(g.colState(3).over, true);
  assert.equal(g.rowState(0).over, true, '行も 4 / 3');
  assert.equal(g.moveTo(1, 2).reason, 'not-adjacent', 'ななめは不可');
  g.moveTo(1, 3);
  assert.equal(g.moveTo(1, 2).type, MOVE.MOVED);
  assert.equal(g.moveTo(1, 1).reason, 'blank', '空白は不可');
  assert.equal(g.moveTo(0, 2).reason, 'visited', '通ったマスは不可');
  assert.equal(g.moveTo(1, 3).type, MOVE.UNDONE, 'もどれる');
});

test('数字をこえたまま GOAL に着いてもクリアにならない。もどって直せばクリア', () => {
  const g = new PuzzleGame(P, { allowClueOverflow: true, startFrom: 'start' });
  for (const [r, c] of [[1, 0], [2, 0], [3, 0]]) g.moveTo(r, c);  // 列 0 が 4 / 3 で GOAL
  assert.equal(g.colState(0).over, true);
  assert.equal(g.status, STATUS.AT_GOAL, 'クリアではない');
  assert.equal(g.moveTo(3, 1).reason, 'locked', 'GOAL のあとは進めない');
  g.reset();
  for (const [r, c] of P.solution.slice(1)) g.moveTo(r, c);
  assert.equal(g.status, STATUS.CLEARED);
});

test('数字こえの許可は、そのゲームだけ（通常モードのゲームには残らない）', () => {
  const ta = new PuzzleGame(P, { allowClueOverflow: true, startFrom: 'start' });
  const normal = new PuzzleGame(P, { startFrom: 'start' });
  ta.moveTo(0, 1); ta.moveTo(0, 2);
  normal.moveTo(0, 1); normal.moveTo(0, 2);
  assert.equal(ta.moveTo(0, 3).type, MOVE.MOVED);
  assert.equal(normal.moveTo(0, 3).type, MOVE.BLOCKED);
});

test('全 250 問：タイムアタックのルールでも正解ルートでクリアでき、クリア判定は同じ', () => {
  for (const p of DATA.puzzles) {
    const g = new PuzzleGame(p, { allowClueOverflow: true, startFrom: 'start' });
    for (const [r, c] of p.solution.slice(1)) assert.equal(g.moveTo(r, c).type, MOVE.MOVED, p.id);
    assert.equal(g.status, STATUS.CLEARED, p.id);
  }
});

test('称号：難易度ごとに別の名前（全 22 種類・重複なし）。絵文字は段階ごとに共通', () => {
  const expected = {
    1: [[1, '🌱', 'めいろのたまご'], [3, '🍀', 'フルーツたんけんたい'], [5, '⭐', 'めいろの道しるべ'], [7, '🔥', 'フルーツスピードスター'], [10, '👑', 'フルーツスピード王']],
    2: [[1, '🌱', 'めいろの見習い'], [2, '🍀', 'フルーツトラベラー'], [4, '⭐', 'ひらめきナビゲーター'], [5, '🔥', 'めいろの達人'], [7, '👑', 'フルーツひらめき王']],
    3: [[1, '🌱', 'すいりのチャレンジャー'], [2, '🍀', 'めいろハンター'], [3, '⭐', 'ひらめきマスター'], [4, '🔥', 'フルーツの賢者'], [5, '👑', 'フルーツ知恵の王']],
    4: [[1, '🍀', 'めいろの探究者'], [2, '⭐', 'すいりのエキスパート'], [3, '🔥', 'めいろの大賢者'], [4, '👑', 'フルーツ太陽王']],
    5: [[1, '🍀', '伝説への挑戦者'], [2, '🔥', '究極のめいろマスター'], [3, '👑', 'フルーツめいろの神']],
  };
  for (const level of [1, 2, 3, 4, 5]) {
    assert.deepEqual(titlesOf(level).map((t) => [t.need, t.icon, t.name]), expected[level], `★${level}`);
  }
  const names = Object.values(TITLE_TABLE).flat().map((t) => t.name);
  assert.equal(names.length, 22);
  assert.equal(new Set(names).size, 22, '重複なし');
  assert.equal(titleFor(1, 4).name, 'フルーツたんけんたい');
  assert.equal(titleFor(5, 1).name, '伝説への挑戦者');
  assert.equal(titleFor(4, 0), null);
});

test('称号：保存済みの最高クリア数から、新しい名前の称号が計算される（記録はそのまま）', () => {
  const backend = mem();
  backend.setItem('fruitMaze.timeAttack.v1', JSON.stringify({ version: 1, levels: { 2: { bestClears: 5, playCount: 9, lastClears: 3 } } }));
  const s = createChallengeStore(backend);
  assert.deepEqual([s.get(2).bestClears, s.get(2).playCount, s.get(2).lastClears], [5, 9, 3]);
  assert.equal(titleFor(2, s.get(2).bestClears).name, 'めいろの達人');
});
