// 第3段階：推理メモのテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MemoBoard, MEMO, isBlockedByMemo } from '../js/memo.js';
import { PuzzleGame, STATUS, MOVE } from '../js/game.js';

const DATA = JSON.parse(readFileSync(new URL('../data/puzzles.json', import.meta.url), 'utf8'));
// 4×4、(1,1) が空白。START (0,0)、GOAL (3,0)
const P = {
  id: 'fixture', difficulty: 1, rows: 4, cols: 4,
  grid: [[1, 1, 1, 1], [1, 0, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]],
  rowClues: [3, 1, 3, 1], colClues: [3, 2, 3, 0],
  start: { row: 0, col: 0, side: 'left' }, goal: { row: 3, col: 0, side: 'bottom' },
  solution: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [3, 0]],
};

test('メモ：未確定 → ○ → × → 未確定 と切り替わる', () => {
  const m = new MemoBoard(P);
  assert.equal(m.get(2, 3), MEMO.NONE);
  assert.equal(m.tap(2, 3), MEMO.ON);
  assert.equal(m.tap(2, 3), MEMO.OFF);
  assert.equal(m.tap(2, 3), MEMO.NONE);
  assert.equal(m.get(2, 3), MEMO.NONE);
});

test('メモ：空白・START・GOAL・盤面の外には付けられない', () => {
  const m = new MemoBoard(P);
  assert.equal(m.tap(1, 1), null, '空白');
  assert.equal(m.tap(0, 0), null, 'START');
  assert.equal(m.tap(3, 0), null, 'GOAL');
  assert.equal(m.tap(9, 9), null, '盤面の外');
  assert.equal(m.hasAny(), false);
});

test('メモ：ルートが通っているマスは編集できない', () => {
  const g = new PuzzleGame(P, { startFrom: 'start' });
  const m = new MemoBoard(P);
  g.moveTo(0, 1);
  assert.equal(m.canEdit(0, 1, g), false);
  assert.equal(m.tap(0, 1, g), null);
  assert.equal(m.canEdit(0, 2, g), true);
  g.undo();
  assert.equal(m.canEdit(0, 1, g), true, '1手もどれば、また編集できる');
});

test('メモ：なぞると最初のマスで決まった値を連続で付け、同じマスは 1 回しか変えない', () => {
  const m = new MemoBoard(P);
  m.set(2, 3, MEMO.OFF);
  m.beginStroke();
  assert.equal(m.strokeAt(1, 3), MEMO.ON, '最初のマス：未確定 → ○');
  assert.equal(m.strokeAt(2, 3), MEMO.ON, '× のマスも ○ に（同じ値を付ける）');
  assert.equal(m.strokeAt(1, 3), null, '同じマスをもう一度通っても変えない');
  assert.equal(m.strokeAt(1, 1), null, '空白は飛ばす');
  assert.equal(m.strokeAt(3, 3), MEMO.ON);
  m.endStroke();
  assert.deepEqual(m.entries(), [
    { row: 1, col: 3, value: 'on' }, { row: 2, col: 3, value: 'on' }, { row: 3, col: 3, value: 'on' },
  ]);
  // 次の操作は新しく決まる（○ → ×）
  m.beginStroke();
  assert.equal(m.strokeAt(1, 3), MEMO.OFF);
  assert.equal(m.strokeAt(2, 3), MEMO.OFF);
  m.endStroke();
});

test('メモ：なぞり始めが編集できないマスなら、最初に編集できたマスで値が決まる', () => {
  const g = new PuzzleGame(P, { startFrom: 'start' });
  const m = new MemoBoard(P);
  m.set(0, 2, MEMO.ON);
  m.beginStroke();
  assert.equal(m.strokeAt(0, 0, g), null, 'START');
  assert.equal(m.strokeAt(0, 2, g), MEMO.OFF, '○ の次は ×');
  assert.equal(m.strokeAt(0, 3, g), MEMO.OFF);
  m.endStroke();
});

test('メモを消してもルートは変わらない', () => {
  const g = new PuzzleGame(P, { startFrom: 'start' });
  const m = new MemoBoard(P);
  g.moveTo(0, 1); g.moveTo(0, 2);
  m.set(2, 3, MEMO.ON); m.set(3, 3, MEMO.OFF);
  const route = JSON.stringify(g.route);
  assert.equal(m.clear(), true);
  assert.equal(m.hasAny(), false);
  assert.equal(JSON.stringify(g.route), route);
  assert.deepEqual(g.rowCounts, [3, 0, 0, 0]);
});

test('「はじめから」（ルートのリセット＋メモの消去）で両方とも初期状態に戻る', () => {
  const g = new PuzzleGame(P, { startFrom: 'start' });
  const m = new MemoBoard(P);
  g.moveTo(0, 1); m.set(3, 3, MEMO.OFF);
  g.reset(); m.clear();
  assert.deepEqual(g.route, [[0, 0]]);
  assert.equal(m.hasAny(), false);
});

test('問題が変わると新しいメモになる（前の問題のメモは持ち越さない）', () => {
  const [a, b] = DATA.puzzles;
  const ma = new MemoBoard(a);
  ma.tap(1, 1); ma.tap(2, 2);
  const mb = new MemoBoard(b);
  assert.equal(mb.hasAny(), false);
  assert.equal(mb.rows, b.rows);
});

test('メモはゲームのルール・クリア判定を変えない（エンジンはメモを見ない）', () => {
  for (const p of [P, ...DATA.puzzles.filter((_, i) => i % 25 === 0)]) {
    const g = new PuzzleGame(p, { startFrom: 'start' });
    const m = new MemoBoard(p);
    // 正解ルートのマスに全部 × を付け、ほかのマスに ○ を付ける（全部まちがったメモ）
    const onSol = new Set(p.solution.map(([r, c]) => `${r},${c}`));
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) m.set(r, c, onSol.has(`${r},${c}`) ? MEMO.OFF : MEMO.ON);
    const before = JSON.stringify(m.entries());
    for (const [r, c] of p.solution.slice(1)) assert.equal(g.moveTo(r, c).type, MOVE.MOVED, `${p.id} (${r},${c})`);
    assert.equal(g.status, STATUS.CLEARED, p.id);
    assert.equal(JSON.stringify(m.entries()), before, 'ルートを動かしてもメモは変わらない');
  }
});

test('× を付けたマスには、ルートで進めない（操作の側で止める）。× を消せば進める', () => {
  const g = new PuzzleGame(P, { startFrom: 'start' });
  const m = new MemoBoard(P);
  m.set(0, 1, MEMO.OFF);
  assert.equal(isBlockedByMemo(m, 0, 1), true, '×');
  m.set(0, 1, MEMO.ON);
  assert.equal(isBlockedByMemo(m, 0, 1), false, '○ は通れる');
  m.set(0, 1, MEMO.NONE);
  assert.equal(isBlockedByMemo(m, 0, 1), false, 'なし');
  assert.equal(isBlockedByMemo(m, 1, 1), false, '空白（そもそも進めない）');
  assert.equal(isBlockedByMemo(null, 0, 1), false, 'メモなし');
  // START・GOAL・通ったマスには × を付けられないので、もどる操作をじゃますることはない
  g.moveTo(0, 1);
  assert.equal(m.canEdit(0, 1, g), false);
  assert.equal(m.canEdit(0, 0, g), false);
});

test('あそびかた用：切り替え順と編集できるマスを限定できる', () => {
  const m = new MemoBoard(P, { cycle: [MEMO.NONE, MEMO.ON], filter: (r) => r === 2 });
  assert.equal(m.tap(2, 3), MEMO.ON);
  assert.equal(m.tap(2, 3), MEMO.NONE, '○ ↔ なし だけ');
  assert.equal(m.tap(3, 3), null, '2 行目以外は不可');
});

// ---------- 操作モード（1 つのボタンで切り替え）----------
import { PLAY_MODES, nextMode, memoToolForMode } from '../js/memo.js';
import { createSettings, SETTINGS_KEY, DEFAULT_SETTINGS } from '../js/settings.js';

test('操作モードは ルート → ○つけ → ×つけ → 消す → ルート の順に切り替わる', () => {
  assert.deepEqual(PLAY_MODES, ['route', 'memo-on', 'memo-off', 'memo-erase']);
  let m = 'route';
  const seen = [];
  for (let i = 0; i < 5; i++) { seen.push(m); m = nextMode(m); }
  assert.deepEqual(seen, ['route', 'memo-on', 'memo-off', 'memo-erase', 'route']);
  assert.equal(memoToolForMode('route'), null, 'ルートモードではメモを付けない');
});

test('○つけ：タップで ○、○ のマスをもう一度タップすると消える。なぞると連続で ○', () => {
  const m = new MemoBoard(P);
  const tap = (r, c, mode) => { m.beginStroke(memoToolForMode(mode)); const v = m.strokeAt(r, c); m.endStroke(); return v; };
  assert.equal(tap(2, 3, 'memo-on'), MEMO.ON);
  assert.equal(tap(2, 3, 'memo-on'), MEMO.NONE, 'もう一度で消える');
  m.set(3, 3, MEMO.OFF);
  assert.equal(tap(3, 3, 'memo-on'), MEMO.ON, '× のマスも ○ に');
  m.clear();
  m.beginStroke(memoToolForMode('memo-on'));
  [[1, 3], [2, 3], [3, 3], [2, 3]].forEach(([r, c]) => m.strokeAt(r, c));
  m.endStroke();
  assert.deepEqual(m.entries().map((e) => e.value), ['on', 'on', 'on']);
});

test('×つけ・消す：× を付ける、○・× を消す', () => {
  const m = new MemoBoard(P);
  const tap = (r, c, mode) => { m.beginStroke(memoToolForMode(mode)); const v = m.strokeAt(r, c); m.endStroke(); return v; };
  assert.equal(tap(2, 3, 'memo-off'), MEMO.OFF);
  assert.equal(tap(2, 3, 'memo-off'), MEMO.NONE);
  m.set(1, 3, MEMO.ON); m.set(2, 3, MEMO.OFF);
  m.beginStroke(memoToolForMode('memo-erase'));
  m.strokeAt(1, 3); m.strokeAt(2, 3); m.strokeAt(3, 3);
  m.endStroke();
  assert.equal(m.hasAny(), false);
  assert.equal(tap(0, 0, 'memo-on'), null, 'START には付けられない（はじめから ○ の表示だけ）');
  assert.equal(tap(3, 0, 'memo-off'), null, 'GOAL にも付けられない');
});

// ---------- 設定 ----------
function mem() { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; }

test('設定：既定は 効果音ON・数字「3」表示。変更は保存され、読み込み直しても残る', () => {
  const b = mem();
  const s = createSettings(b);
  assert.deepEqual(s.all(), { ...DEFAULT_SETTINGS });
  assert.equal(s.get('clueStyle'), 'target');
  assert.equal(s.set('clueStyle', 'fraction'), true);
  assert.equal(s.set('sound', false), true);
  assert.equal(s.set('clueStyle', 'xxx'), false, '不正な値は受け付けない');
  const s2 = createSettings(b);
  assert.equal(s2.get('clueStyle'), 'fraction');
  assert.equal(s2.get('sound'), false);
  b.setItem(SETTINGS_KEY, '{broken');
  assert.deepEqual(createSettings(b).all(), { ...DEFAULT_SETTINGS }, '壊れた保存データは既定値に');
  assert.deepEqual(createSettings(null).all(), { ...DEFAULT_SETTINGS }, '保存できない環境でも動く');
});

test('設定：ボタン表示の設定はなくなった（5ボタンが標準）。古い保存データの buttons は無視する', () => {
  const b = mem();
  b.setItem(SETTINGS_KEY, JSON.stringify({ sound: false, buttons: 'cycle' }));
  const s = createSettings(b);
  assert.equal(s.get('buttons'), undefined);
  assert.equal(s.get('sound'), false, 'ほかの設定はそのまま');
  assert.equal(s.set('buttons', 'five'), false);
});
