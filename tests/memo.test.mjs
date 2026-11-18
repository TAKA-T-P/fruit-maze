// 第3段階：推理メモのテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MemoBoard, MEMO } from '../js/memo.js';
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
  const g = new PuzzleGame(P);
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
  const g = new PuzzleGame(P);
  const m = new MemoBoard(P);
  m.set(0, 2, MEMO.ON);
  m.beginStroke();
  assert.equal(m.strokeAt(0, 0, g), null, 'START');
  assert.equal(m.strokeAt(0, 2, g), MEMO.OFF, '○ の次は ×');
  assert.equal(m.strokeAt(0, 3, g), MEMO.OFF);
  m.endStroke();
});

test('メモを消してもルートは変わらない', () => {
  const g = new PuzzleGame(P);
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
  const g = new PuzzleGame(P);
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

test('メモはクリア判定に影響しない（× を付けたマスもルートは通れる）', () => {
  for (const p of [P, ...DATA.puzzles.filter((_, i) => i % 25 === 0)]) {
    const g = new PuzzleGame(p);
    const m = new MemoBoard(p);
    // 正解ルートのマスに全部 × を付け、ほかのマスに ○ を付ける（全部まちがったメモ）
    const onSol = new Set(p.solution.map(([r, c]) => `${r},${c}`));
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) m.set(r, c, onSol.has(`${r},${c}`) ? MEMO.OFF : MEMO.ON);
    for (const [r, c] of p.solution.slice(1)) {
      const res = g.moveTo(r, c);
      assert.equal(res.type, MOVE.MOVED, `${p.id} (${r},${c})`);
      if (m.get(r, c) === MEMO.OFF) m.erase(r, c); // 画面側の処理：× のマスを通ったら × を消す
      assert.equal(m.get(r, c), MEMO.NONE);
    }
    assert.equal(g.status, STATUS.CLEARED, p.id);
  }
});

test('あそびかた用：切り替え順と編集できるマスを限定できる', () => {
  const m = new MemoBoard(P, { cycle: [MEMO.NONE, MEMO.ON], filter: (r) => r === 2 });
  assert.equal(m.tap(2, 3), MEMO.ON);
  assert.equal(m.tap(2, 3), MEMO.NONE, '○ ↔ なし だけ');
  assert.equal(m.tap(3, 3), null, '2 行目以外は不可');
});
