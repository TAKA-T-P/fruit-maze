// 第4段階：フルーツの定義・解放判定・選択の保存のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRUITS, getFruit } from '../js/fruits.js';
import { clearStats, fruitStatus, allFruitStatuses, unlockedFruitIds, createCollectionStore, COLLECTION_KEY } from '../js/collection.js';
import { PuzzleLibrary } from '../js/puzzle-loader.js';
import { createStore } from '../js/storage.js';

const DATA = JSON.parse(readFileSync(new URL('../data/puzzles.json', import.meta.url), 'utf8'));
const lib = new PuzzleLibrary(DATA);
const levelOf = (id) => lib.get(id)?.difficulty;
const ids = (level, n) => lib.list(level).slice(0, n).map((p) => p.id);
const stats = (clearedIds) => clearStats(clearedIds, levelOf);
const unlocked = (clearedIds) => unlockedFruitIds(stats(clearedIds));
function mem() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; }

test('フルーツは 18 種類、仕様どおりの順番・解放条件', () => {
  const spec = [
    ['strawberry', '🍓', 'イチゴ', { type: 'default' }],
    ['apple', '🍎', 'リンゴ', { type: 'total', count: 3 }],
    ['orange', '🍊', 'ミカン', { type: 'total', count: 7 }],
    ['banana', '🍌', 'バナナ', { type: 'total', count: 12 }],
    ['grape', '🍇', 'ブドウ', { type: 'total', count: 20 }],
    ['watermelon', '🍉', 'スイカ', { type: 'total', count: 30 }],
    ['cherry', '🍒', 'サクランボ', { type: 'total', count: 40 }],
    ['peach', '🍑', 'モモ', { type: 'total', count: 50 }],
    ['lemon', '🍋', 'レモン', { type: 'difficulty', level: 2, count: 5 }],
    ['pear', '🍐', 'ナシ', { type: 'difficulty', level: 2, count: 15 }],
    ['pineapple', '🍍', 'パイナップル', { type: 'difficulty', level: 3, count: 5 }],
    ['kiwi', '🥝', 'キウイ', { type: 'difficulty', level: 3, count: 15 }],
    ['mango', '🥭', 'マンゴー', { type: 'difficulty', level: 4, count: 5 }],
    ['blueberry', '🫐', 'ブルーベリー', { type: 'difficulty', level: 4, count: 15 }],
    ['coconut', '🥥', 'ココナッツ', { type: 'difficulty', level: 5, count: 10 }],
    ['melon', '🍈', 'メロン', { type: 'difficulty', level: 5, count: 20 }],
    ['greenapple', '🍏', '青リンゴ', { type: 'timeattack', count: 2 }],
    ['avocado', '🥑', 'アボカド', { type: 'timeattack', count: 5 }],
  ];
  assert.equal(FRUITS.length, 18);
  FRUITS.forEach((f, i) => {
    assert.deepEqual([f.id, f.emoji, f.name, f.unlock], spec[i], f.id);
    assert.equal(f.order, i + 1);
    assert.match(f.color, /^#[0-9a-f]{6}$/i);
    assert.match(f.light, /^#[0-9a-f]{6}$/i);
  });
  assert.equal(new Set(FRUITS.map((f) => f.id)).size, 18, 'ID が重複しない');
  // 第1段階からある 9 種類の ID は変えていない
  for (const id of ['strawberry', 'apple', 'orange', 'banana', 'grape', 'watermelon', 'pineapple', 'peach', 'kiwi']) assert.ok(FRUITS.some((f) => f.id === id), id);
});

test('ステージのクリアで解放される 16 種類に、全 250 ステージは要らない', () => {
  // 必要なのは：★2 を 15、★3 を 15、★4 を 15、★5 を 20、合計 50 以上
  const set = [...ids(2, 15), ...ids(3, 15), ...ids(4, 15), ...ids(5, 20)];
  assert.equal(set.length, 65);
  assert.equal(unlocked(set).length, 16);
});

test('イチゴは最初から使える。何もクリアしていなければイチゴだけ', () => {
  assert.deepEqual(unlocked([]), ['strawberry']);
  assert.equal(fruitStatus(getFruit('strawberry'), stats([])).unlocked, true);
});

test('累計クリア数の条件（境目の前後）', () => {
  const easy = lib.list(1).map((p) => p.id);
  const at = (n) => new Set(unlocked(easy.slice(0, n)));
  assert.ok(!at(2).has('apple'));
  assert.ok(at(3).has('apple'));
  assert.ok(!at(6).has('orange') && at(7).has('orange'));
  assert.ok(!at(11).has('banana') && at(12).has('banana'));
  assert.ok(!at(19).has('grape') && at(20).has('grape'));
  assert.ok(!at(29).has('watermelon') && at(30).has('watermelon'));
  assert.ok(!at(39).has('cherry') && at(40).has('cherry'));
  assert.ok(!at(49).has('peach') && at(50).has('peach'));
  // ★1 だけでは、難易度別のフルーツは出ない
  assert.ok(!at(50).has('lemon'));
});

test('難易度別クリア数の条件。ほかの難易度のクリアは数えない', () => {
  assert.ok(!new Set(unlocked(ids(2, 4))).has('lemon'));
  assert.ok(new Set(unlocked(ids(2, 5))).has('lemon'));
  assert.ok(!new Set(unlocked([...ids(1, 50), ...ids(3, 50)])).has('lemon'), '★2 以外では解放されない');
  assert.ok(new Set(unlocked(ids(2, 15))).has('pear'));
  assert.ok(new Set(unlocked(ids(3, 5))).has('pineapple') && !new Set(unlocked(ids(3, 14))).has('kiwi'));
  assert.ok(new Set(unlocked(ids(4, 15))).has('blueberry') && new Set(unlocked(ids(4, 15))).has('mango'));
  assert.ok(!new Set(unlocked(ids(5, 9))).has('coconut') && new Set(unlocked(ids(5, 10))).has('coconut'));
  assert.ok(!new Set(unlocked(ids(5, 19))).has('melon') && new Set(unlocked(ids(5, 20))).has('melon'));
});

test('同じステージを何度クリアしても 1 回。収録されていない ID は数えない', () => {
  const backend = mem();
  const store = createStore(backend);
  for (let i = 0; i < 10; i++) store.recordClear('easy-001');
  store.recordClear('easy-002');
  const s = stats([...store.clearedIds(), 'tutorial-route', 'unknown-999']);
  assert.deepEqual(s, { total: 2, byLevel: { 1: 2, 2: 0, 3: 0, 4: 0, 5: 0 }, taPlayed: 0 });
  assert.ok(!new Set(unlockedFruitIds(s)).has('apple'));
  // 重複した ID の配列でも 1 回
  assert.equal(stats(['easy-001', 'easy-001', 'easy-001']).total, 1);
});

test('ヒントを使ったかどうかは関係ない（クリア記録には区別がない）', () => {
  const store = createStore(mem());
  for (const id of ids(1, 3)) store.recordClear(id);
  assert.ok(new Set(unlocked(store.clearedIds())).has('apple'));
});

test('複数のフルーツが同時に解放される（累計20 と ★3 の5 が同じクリアで）', () => {
  const before = [...ids(1, 15), ...ids(3, 4)];             // 19 ステージ、★3 は 4
  const after = [...before, lib.list(3)[4].id];              // 20 ステージ、★3 は 5
  const a = new Set(unlocked(before)), b = new Set(unlocked(after));
  assert.ok(!a.has('grape') && !a.has('pineapple'));
  assert.ok(b.has('grape') && b.has('pineapple'));
  assert.deepEqual([...b].filter((x) => !a.has(x)).sort(), ['grape', 'pineapple']);
});

test('進捗と残り（図鑑の表示用）', () => {
  const two = Object.fromEntries(allFruitStatuses(stats(ids(1, 2))).map((x) => [x.fruit.id, x]));
  assert.deepEqual([two.apple.current, two.apple.need, two.apple.remaining], [2, 3, 1]);
  assert.equal(two.apple.hint, 'あと1ステージで解放！');
  const s = stats([...ids(1, 2), ...ids(3, 3), ...ids(5, 12)]);
  const st = Object.fromEntries(allFruitStatuses(s).map((x) => [x.fruit.id, x]));
  assert.equal(st.pineapple.hint, '★★★をあと2ステージクリア！');
  assert.deepEqual([st.pineapple.current, st.pineapple.need], [3, 5]);
  assert.equal(st.melon.hint, '★★★★★をあと8ステージクリア！');
  assert.deepEqual([st.melon.current, st.melon.need], [12, 20]);
  assert.equal(st.coconut.unlocked, true);
  assert.equal(st.coconut.current, 10, '進捗は必要数で頭打ち');
  assert.equal(st.lemon.condition, '★★を5ステージクリア');
  assert.equal(st.apple.condition, 'ステージを ぜんぶで3こクリア');
});

test('既存のクリア記録（第3段階までの保存データ）から解放状況を復元できる', () => {
  const backend = mem();
  backend.setItem('fruitMaze.save.v1', JSON.stringify({
    version: 1, lastDifficulty: 3,
    cleared: Object.fromEntries([...ids(1, 12), ...ids(3, 5)].map((id) => [id, { firstClearedAt: '2026-11-18T09:00:00.000Z', clearCount: 2 }])),
  }));
  const store = createStore(backend);
  const got = new Set(unlocked(store.clearedIds()));
  for (const id of ['strawberry', 'apple', 'orange', 'banana', 'pineapple']) assert.ok(got.has(id), id);
  assert.ok(!got.has('grape'), '17 ステージなのでブドウはまだ');
  assert.equal(store.getRecord(ids(1, 1)[0]).clearCount, 2, 'クリア記録はそのまま');
});

// ---------------- 選択の保存 ----------------
test('解放済みのフルーツだけ選べる。保存され、読み込み直しても残る', () => {
  const backend = mem();
  const col = createCollectionStore(backend);
  const open = unlocked(ids(1, 12));
  assert.equal(col.selectedFruit(open).id, 'strawberry', '最初はイチゴ');
  assert.equal(col.select('grape', open), false, '未解放は選べない');
  assert.equal(col.select('banana', open), true);
  assert.equal(col.selectedFruit(open).id, 'banana');
  const again = createCollectionStore(backend);
  assert.equal(again.selectedFruit(open).id, 'banana', '再読み込み後も残る');
  assert.ok(JSON.parse(backend.getItem(COLLECTION_KEY)).selectedFruit === 'banana');
});

test('保存された ID が存在しない・未解放ならイチゴに戻る。壊れたデータでも止まらない', () => {
  const backend = mem();
  backend.setItem(COLLECTION_KEY, JSON.stringify({ selectedFruit: 'durian' }));
  assert.equal(createCollectionStore(backend).selectedFruit(['strawberry', 'durian']).id, 'strawberry');
  backend.setItem(COLLECTION_KEY, JSON.stringify({ selectedFruit: 'melon' }));
  assert.equal(createCollectionStore(backend).selectedFruit(['strawberry']).id, 'strawberry', '未解放');
  backend.setItem(COLLECTION_KEY, '{broken');
  const col = createCollectionStore(backend);
  assert.equal(col.isNew, true);
  assert.equal(col.selectedFruit(['strawberry']).id, 'strawberry');
  backend.setItem(COLLECTION_KEY, JSON.stringify({ selectedFruit: 3, seenUnlocks: 'x', seenTrophies: [9, 2, 'a'] }));
  const col2 = createCollectionStore(backend);
  assert.deepEqual([...col2.seenTrophies()], [2]);
  assert.equal(col2.seenUnlocks().size, 0);
  assert.equal(createCollectionStore(null).selectedFruit(['strawberry']).id, 'strawberry', '保存できない環境');
});

test('コレクションの保存は、クリア記録・設定とは別のキー', () => {
  const backend = mem();
  const store = createStore(backend);
  store.recordClear('easy-001');
  const col = createCollectionStore(backend);
  col.select('strawberry', ['strawberry']);
  assert.deepEqual([...backend._m.keys()].sort(), ['fruitMaze.collection.v1', 'fruitMaze.save.v1']);
  assert.ok(createStore(backend).isCleared('easy-001'));
});

// ---- 「ランダム」 ----
import { pickRandomFruit, RANDOM_FRUIT_ID } from '../js/collection.js';

test('ランダム：選べて保存される。ほかのフルーツを選ぶと解除', () => {
  const backend = mem();
  const col = createCollectionStore(backend);
  const open = ['strawberry', 'apple', 'banana'];
  assert.equal(col.isRandom(), false);
  assert.equal(col.select(RANDOM_FRUIT_ID, open), true);
  assert.equal(col.isRandom(), true);
  assert.equal(createCollectionStore(backend).isRandom(), true, '再読み込み後も残る');
  assert.equal(col.select('apple', open), true);
  assert.equal(col.isRandom(), false);
  assert.equal(col.selectedFruit(open).id, 'apple');
});

test('ランダム：ゲットしたフルーツだけから選び、2 種類以上なら直前のフルーツは避ける', () => {
  const open = ['strawberry', 'apple', 'banana'];
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const f = pickRandomFruit(open, 'apple');
    assert.ok(open.includes(f.id));
    assert.notEqual(f.id, 'apple');
    seen.add(f.id);
  }
  assert.deepEqual([...seen].sort(), ['banana', 'strawberry']);
  assert.equal(pickRandomFruit(['strawberry'], 'strawberry').id, 'strawberry', '1 種類だけならそれ');
  assert.equal(pickRandomFruit([], null).id, 'strawberry');
  assert.equal(pickRandomFruit(open, null, () => 0.999).id, 'banana');
});

// ---- タイムアタックで解放されるフルーツ（青リンゴ・アボカド） ----
import { createChallengeStore } from '../js/challenge-storage.js';
import { TimeAttack } from '../js/challenge.js';

test('青リンゴ：タイムアタックを 2 つのむずかしさ、アボカド：5 つのむずかしさで最後まであそぶと解放', () => {
  const st = (n) => clearStats([], () => 1, { taPlayed: n });
  const green = getFruit('greenapple'), avocado = getFruit('avocado');
  assert.equal(fruitStatus(green, st(1)).unlocked, false);
  assert.equal(fruitStatus(green, st(1)).hint, 'タイムアタックを あと1つのむずかしさで あそぼう！');
  assert.equal(fruitStatus(green, st(2)).unlocked, true);
  assert.equal(fruitStatus(avocado, st(4)).unlocked, false);
  assert.deepEqual([fruitStatus(avocado, st(4)).current, fruitStatus(avocado, st(4)).need], [4, 5]);
  assert.equal(fruitStatus(avocado, st(5)).unlocked, true);
  assert.equal(fruitStatus(avocado, st(5)).condition, 'タイムアタックを 5つのむずかしさで あそぶ');
  assert.equal(stats([]).taPlayed, 0, '指定しなければ 0');
  assert.equal(unlocked(ids(2, 50)).includes('greenapple'), false, 'ステージのクリアだけでは解放されない');
});

test('タイムアタックの「あそんだ」：最後まであそんだ挑戦だけ。0 問でも数える、同じむずかしさは 1 つ、途中でやめたら数えない', () => {
  const s = createChallengeStore(mem());
  assert.equal(s.playedCount(), 0);
  s.recordResult(1, 0); // 0 問でも、最後まであそんだら記録が残る
  assert.equal(s.playedCount(), 1);
  s.recordResult(1, 3);
  assert.equal(s.playedCount(), 1, '同じむずかしさは 1 つ');
  // 途中でやめた挑戦は recordResult されない（main.js の「やめる」は abort するだけ）
  const ta = new TimeAttack({ level: 2, puzzles: lib.list(2), now: () => 0 });
  ta.startCountdown(); ta.begin(); ta.abort();
  assert.equal(ta.endReason, 'aborted');
  assert.equal(s.playedCount(), 1);
  s.recordResult(3, 1);
  assert.equal(s.playedCount(), 2);
  assert.equal(unlockedFruitIds(clearStats([], () => 1, { taPlayed: s.playedCount() })).includes('greenapple'), true);
});

test('タイムアタックの「あそんだ」は保存され、古い記録（played がない）も回数・記録から判定する', () => {
  const b = mem();
  createChallengeStore(b).recordResult(4, 0);
  assert.equal(createChallengeStore(b).hasPlayed(4), true);
  const old = mem();
  old.setItem('fruitMaze.timeAttack.v1', JSON.stringify({ version: 1, levels: { 1: { bestClears: 0, playCount: 2 }, 2: { bestClears: 3, playCount: null }, 3: { bestClears: 0, playCount: 0 } } }));
  const s = createChallengeStore(old);
  assert.deepEqual([1, 2, 3, 4, 5].map((lv) => s.hasPlayed(lv)), [true, true, false, false, false]);
});

test('すべてのフルーツに、ずかんの説明文（desc）がある', () => {
  for (const f of FRUITS) assert.ok(typeof f.desc === 'string' && f.desc.length > 10, f.id);
});
