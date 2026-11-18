// 第4段階：トロフィー・報酬（演出の重複防止・はじめての起動）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TROPHIES, trophyStatus, allTrophyStatuses, isAllComplete } from '../js/trophies.js';
import { clearStats, createCollectionStore } from '../js/collection.js';
import { pendingRewards, markRewardsSeen, migrateFirstRun } from '../js/rewards.js';
import { PuzzleLibrary } from '../js/puzzle-loader.js';
import { createStore } from '../js/storage.js';

const DATA = JSON.parse(readFileSync(new URL('../data/puzzles.json', import.meta.url), 'utf8'));
const lib = new PuzzleLibrary(DATA);
const levelOf = (id) => lib.get(id)?.difficulty;
const totalOf = (level) => lib.count(level);
const ids = (level, n) => lib.list(level).slice(0, n).map((p) => p.id);
const stats = (cleared) => clearStats(cleared, levelOf);
function mem() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; }

test('トロフィーは 5 種類（ブロンズ〜マスター）', () => {
  assert.deepEqual(TROPHIES.map((t) => [t.level, t.icon, t.name]), [
    [1, '🥉', 'ブロンズ'], [2, '🥈', 'シルバー'], [3, '🥇', 'ゴールド'], [4, '🏆', 'プラチナ'], [5, '👑', 'マスター'],
  ]);
});

test('各難易度 50 ステージで獲得、49 ステージでは獲得しない', () => {
  for (const t of TROPHIES) {
    const s49 = trophyStatus(t, stats(ids(t.level, 49)), totalOf);
    assert.equal(s49.earned, false);
    assert.deepEqual([s49.current, s49.need, s49.remaining], [49, 50, 1]);
    assert.equal(trophyStatus(t, stats(ids(t.level, 50)), totalOf).earned, true);
  }
});

test('同じステージの再クリアは重複して数えない', () => {
  const store = createStore(mem());
  for (const id of ids(1, 49)) { store.recordClear(id); store.recordClear(id); }
  store.recordClear(ids(1, 1)[0]);
  assert.equal(trophyStatus(TROPHIES[0], stats(store.clearedIds()), totalOf).earned, false);
});

test('5 種類はそれぞれ独立して判定する', () => {
  const s = stats([...ids(2, 50), ...ids(4, 50), ...ids(5, 30)]);
  assert.deepEqual(allTrophyStatuses(s, totalOf).map((x) => x.earned), [false, true, false, true, false]);
  assert.equal(isAllComplete(s, totalOf), false);
});

test('全 5 種類で完全制覇', () => {
  const all = [1, 2, 3, 4, 5].flatMap((l) => ids(l, 50));
  assert.equal(all.length, 250);
  assert.equal(isAllComplete(stats(all), totalOf), true);
});

test('獲得は再読み込み後もクリア記録から決まる', () => {
  const backend = mem();
  const store = createStore(backend);
  for (const id of ids(3, 50)) store.recordClear(id);
  const reloaded = createStore(backend);
  assert.equal(trophyStatus(TROPHIES[2], stats(reloaded.clearedIds()), totalOf).earned, true);
});

// ---------------- 報酬演出 ----------------
test('新しいフルーツ・トロフィーは 1 回だけ演出し、見たあとは出さない', () => {
  const col = createCollectionStore(mem());
  col.save();
  let cleared = ids(1, 2);
  assert.equal(pendingRewards(stats(cleared), col, totalOf).isEmpty, true);
  cleared = ids(1, 3);
  let p = pendingRewards(stats(cleared), col, totalOf);
  assert.deepEqual(p.fruits.map((f) => f.id), ['apple']);
  markRewardsSeen(col, p);
  assert.equal(pendingRewards(stats(cleared), col, totalOf).isEmpty, true, 'もう一度は出さない');
  // ★1 を 50 → ミカン〜モモ（累計）とブロンズを 1 回でまとめて
  cleared = ids(1, 50);
  p = pendingRewards(stats(cleared), col, totalOf);
  assert.deepEqual(p.fruits.map((f) => f.id), ['orange', 'banana', 'grape', 'watermelon', 'cherry', 'peach']);
  assert.deepEqual(p.trophies.map((t) => t.level), [1]);
  assert.equal(p.complete, false);
  markRewardsSeen(col, p);
  assert.equal(pendingRewards(stats(cleared), col, totalOf).isEmpty, true);
});

test('フルーツ解放とトロフィー獲得が同時でも、1 回の演出にまとまる', () => {
  const col = createCollectionStore(mem());
  col.save();
  const before = [...ids(1, 49), ...ids(2, 4)];
  markRewardsSeen(col, pendingRewards(stats(before), col, totalOf));
  const after = [...ids(1, 50), ...ids(2, 4)];        // 54 ステージ（モモは50で解放済み）、★1 コンプリート
  const p = pendingRewards(stats(after), col, totalOf);
  assert.deepEqual(p.trophies.map((t) => t.level), [1]);
  const after2 = [...after, lib.list(2)[4].id];        // ★2 の 5 ステージ目 → レモン
  markRewardsSeen(col, p);
  assert.deepEqual(pendingRewards(stats(after2), col, totalOf).fruits.map((f) => f.id), ['lemon']);
});

test('演出をとばしても報酬は失われない（解放・獲得はクリア記録から決まる）', () => {
  const col = createCollectionStore(mem());
  col.save();
  const s = stats(ids(1, 50));
  // 演出を見ないまま（markRewardsSeen しない）でも、フルーツは選べる
  const p = pendingRewards(s, col, totalOf);
  assert.ok(p.fruits.some((f) => f.id === 'peach'));
  assert.equal(col.select('peach', ['strawberry', ...p.fruits.map((f) => f.id)]), true);
  assert.equal(trophyStatus(TROPHIES[0], s, totalOf).earned, true);
});

test('完全制覇の演出は 1 回だけ', () => {
  const col = createCollectionStore(mem());
  col.save();
  const almost = [1, 2, 3, 4, 5].flatMap((l) => ids(l, 50)).slice(0, 249);
  markRewardsSeen(col, pendingRewards(stats(almost), col, totalOf));
  const all = [1, 2, 3, 4, 5].flatMap((l) => ids(l, 50));
  const p = pendingRewards(stats(all), col, totalOf);
  assert.equal(p.complete, true);
  assert.deepEqual(p.trophies.map((t) => t.level), [5]);
  markRewardsSeen(col, p);
  assert.equal(pendingRewards(stats(all), col, totalOf).complete, false);
});

test('はじめての起動（アップデート直後）：すでに達成済みのものは演出せず、数だけ知らせる', () => {
  const backend = mem();
  const col = createCollectionStore(backend);
  assert.equal(col.isNew, true);
  const s = stats([...ids(1, 50), ...ids(3, 5)]);
  const notice = migrateFirstRun(s, col, totalOf);
  assert.equal(notice.newFruits, 8, 'リンゴ〜モモの 7 種類＋パイナップル');
  assert.equal(notice.trophies, 1);
  assert.equal(pendingRewards(s, col, totalOf).isEmpty, true, '演出は出さない');
  const reopened = createCollectionStore(backend);
  assert.equal(reopened.isNew, false, '2 回目の起動ではお知らせしない');
  // そのあとの新しい解放は、ふつうに演出する
  const s2 = stats([...ids(1, 50), ...ids(3, 5), ...ids(2, 5)]);
  assert.deepEqual(pendingRewards(s2, reopened, totalOf).fruits.map((f) => f.id), ['lemon']);
});
