// 引継ぎコードのテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PUZZLE_IDS_V1, FRUIT_IDS_V1, CODE_PREFIX, MAX_INPUT_LENGTH, RESTORE_KEYS,
  readRecord, encodeRecord, decodeCode, summarize, buildRestoreData, applyRestore, crc32, toBase64Url, fromBase64Url,
} from '../js/transfer-code.js';
import { createStore, STORAGE_KEY } from '../js/storage.js';
import { createCollectionStore, COLLECTION_KEY, clearStats, unlockedFruitIds } from '../js/collection.js';
import { createChallengeStore, TIME_ATTACK_KEY } from '../js/challenge-storage.js';
import { createSettings, SETTINGS_KEY } from '../js/settings.js';
import { pendingRewards } from '../js/rewards.js';
import { titleFor } from '../js/challenge-titles.js';
import { FRUITS } from '../js/fruits.js';

const DATA = JSON.parse(readFileSync(new URL('../data/puzzles.json', import.meta.url), 'utf8'));
function mem(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
function rng(seed) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }

/** n 問クリアした保存データ（ヒントあり・なしを混ぜる）を作る */
function playedBackend(n, { seed = 1, fruit = 'strawberry', ta = [0, 0, 0, 0, 0], sound = true, clueStyle = 'target' } = {}) {
  const b = mem();
  const r = rng(seed);
  const ids = [...PUZZLE_IDS_V1].sort(() => r() - 0.5).slice(0, n);
  const store = createStore(b);
  for (const id of ids) store.recordClear(id, new Date('2026-11-01T00:00:00Z'), { usedHint: r() < 0.3 });
  const col = createCollectionStore(b);
  const unlocked = unlockedFruitIds(clearStats(ids, (id) => DATA.puzzles.find((p) => p.id === id).difficulty));
  col.select(fruit, unlocked);
  const s = createChallengeStore(b);
  ta.forEach((v, i) => { if (v) s.recordResult(i + 1, v, new Date('2026-11-02T00:00:00Z')); });
  const st = createSettings(b);
  st.set('sound', sound); st.set('clueStyle', clueStyle);
  return { b, ids };
}

// ---------------- 形式 ----------------
test('固定の問題 ID 表：250 問すべてが収録問題と一致し、画面の並び（stage-order）とは独立', () => {
  assert.equal(PUZZLE_IDS_V1.length, 250);
  assert.deepEqual([...PUZZLE_IDS_V1].sort(), DATA.puzzles.map((p) => p.id).sort());
  assert.equal(PUZZLE_IDS_V1[0], 'easy-001');
  assert.equal(PUZZLE_IDS_V1[249], 'master-050');
  assert.deepEqual([...FRUIT_IDS_V1], FRUITS.map((f) => f.id), 'フルーツ表');
});

test('Base64URL と CRC32', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
  for (const len of [0, 1, 2, 3, 4, 75]) {
    const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11) & 255);
    assert.deepEqual([...fromBase64Url(toBase64Url(bytes))], [...bytes]);
  }
  assert.equal(fromBase64Url('ab+c'), null);
});

// ---------------- 生成・復元 ----------------
test('コード生成：0・50・100・250 問クリアで生成でき、いつも 104 文字（200 文字以内）', () => {
  for (const n of [0, 50, 100, 250]) {
    const { b } = playedBackend(n, { seed: n + 3 });
    const code = encodeRecord(readRecord(b));
    assert.ok(code.startsWith(CODE_PREFIX));
    assert.match(code, /^FM1-[A-Za-z0-9_-]+$/);
    assert.equal(code.length, 104, `${n} 問`);
  }
});

test('コード復元：クリア・ヒントなし・タイムアタック・フルーツ・設定が完全に一致する', () => {
  const cases = [
    { n: 0 },
    { n: 50, seed: 7, ta: [8, 5, 3, 2, 1], sound: false },
    { n: 100, seed: 9, fruit: 'random', clueStyle: 'fraction' },
    { n: 250, seed: 11, fruit: 'melon', ta: [255, 0, 7, 4, 3] },
  ];
  for (const c of cases) {
    const { b } = playedBackend(c.n, c);
    const rec = readRecord(b);
    const d = decodeCode(encodeRecord(rec));
    assert.equal(d.ok, true);
    assert.deepEqual([...d.record.cleared].sort(), [...rec.cleared].sort());
    assert.deepEqual([...d.record.hintFree].sort(), [...rec.hintFree].sort());
    assert.deepEqual(d.record.taBest, rec.taBest);
    assert.equal(d.record.fruit, rec.fruit);
    assert.equal(d.record.sound, rec.sound);
    assert.equal(d.record.clueStyle, rec.clueStyle);
  }
});

test('ヒントなしクリアの記録がない古いクリアは、ヒントなしとして引き継ぐ（既存の互換性）', () => {
  const b = mem({ [STORAGE_KEY]: JSON.stringify({ version: 1, cleared: { 'easy-001': { firstClearedAt: '2026-01-01T00:00:00Z', clearCount: 2 } } }) });
  const rec = readRecord(b);
  assert.ok(rec.hintFree.has('easy-001'));
});

// ---------------- 不正コード ----------------
test('不正なコードは読みこまない（アプリは止まらない）', () => {
  const { b } = playedBackend(60, { seed: 5, ta: [3, 2, 1, 1, 1] });
  const good = encodeRecord(readRecord(b));
  const body = good.slice(4);
  const flip = (s, i) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
  const bad = {
    empty: ['', '   \n '],
    'too-long': ['x'.repeat(MAX_INPUT_LENGTH + 1)],
    version: [`FM2-${body}`, `FM9-${body}`],
    invalid: [good.slice(0, 50), flip(good, 20), flip(good, 103), `XX1-${body}`, `${good}AAAA`, 'FM1-!!!!', 'こんにちは', null, 123],
  };
  for (const [err, list] of Object.entries(bad)) {
    for (const s of list) {
      const r = decodeCode(s);
      assert.equal(r.ok, false, String(s).slice(0, 20));
      assert.equal(r.error, err, String(s).slice(0, 20));
    }
  }
  // 前後の空白・途中の改行は取り除いて読める
  assert.equal(decodeCode(`  ${good.slice(0, 40)}\n${good.slice(40)}  \r\n`).ok, true);
});

/** バイト列を直接書きかえて、チェックサムだけ正しくしたコードを作る（中身の検証のテスト用） */
function forge(mutate) {
  const { b } = playedBackend(10, { seed: 2 });
  const bytes = fromBase64Url(encodeRecord(readRecord(b)).slice(4));
  mutate(bytes);
  const body = bytes.subarray(0, 71);
  const crc = crc32(Uint8Array.from([...'FM1'].map((c) => c.charCodeAt(0)).concat([...body])));
  bytes[71] = crc >>> 24; bytes[72] = (crc >>> 16) & 255; bytes[73] = (crc >>> 8) & 255; bytes[74] = crc & 255;
  return `FM1-${toBase64Url(bytes)}`;
}

test('チェックサムが合っていても、ありえない値は読みこまない', () => {
  assert.equal(decodeCode(forge(() => {})).ok, true, '書きかえなしなら読める');
  assert.equal(decodeCode(forge((x) => { x[31] |= 0x80; })).error, 'invalid', '存在しない問題（251 番目以降のビット）');
  assert.equal(decodeCode(forge((x) => { x[0] = 0; x[32] = 1; })).error, 'invalid', 'ヒントなしなのに未クリア');
  assert.equal(decodeCode(forge((x) => { x[69] = 17; })).error, 'invalid', '不正なフルーツ');
  assert.equal(decodeCode(forge((x) => { x[70] = 4; })).error, 'invalid', '不正な設定');
  assert.equal(decodeCode(forge((x) => { x[69] = 16; })).record.fruit, 'random');
});

// ---------------- 復元データ ----------------
test('復元：既存の読みこみ処理で、クリア・★・フルーツ・トロフィー・称号・設定がそのとおりになる', () => {
  const { b, ids } = playedBackend(120, { seed: 13, fruit: 'banana', ta: [10, 7, 5, 4, 3], sound: false, clueStyle: 'fraction' });
  const src = readRecord(b);
  const code = encodeRecord(src);
  const target = mem({ [STORAGE_KEY]: JSON.stringify({ version: 1, cleared: { 'master-050': { firstClearedAt: '2020-01-01T00:00:00Z', clearCount: 9, hintFree: true } } }) });
  const res = applyRestore(target, buildRestoreData(decodeCode(code).record));
  assert.equal(res.ok, true);
  const store = createStore(target);
  assert.deepEqual(store.clearedIds().sort(), [...ids].sort(), '古い記録は混ざらない');
  for (const id of ids) {
    assert.equal(store.isHintFreeCleared(id), src.hintFree.has(id), id);
    assert.equal(store.getRecord(id).firstClearedAt, null, '日時は作らない');
    assert.equal(store.getRecord(id).clearCount, null, '回数は作らない');
  }
  const col = createCollectionStore(target);
  assert.equal(col.isNew, false);
  const levelOf = (id) => DATA.puzzles.find((p) => p.id === id).difficulty;
  const stats = clearStats(store.clearedIds(), levelOf);
  assert.equal(col.selectedFruit(unlockedFruitIds(stats)).id, unlockedFruitIds(stats).includes('banana') ? 'banana' : 'strawberry');
  assert.equal(pendingRewards(stats, col, () => 50).isEmpty, true, '古い演出は出ない');
  const ta = createChallengeStore(target);
  assert.deepEqual(ta.bestByLevel(), { 1: 10, 2: 7, 3: 5, 4: 4, 5: 3 });
  assert.equal(ta.isComplete(), true, '完全制覇も最高記録から復元');
  assert.equal(titleFor(1, ta.get(1).bestClears).id, 'kaiden');
  assert.equal(ta.get(1).playCount, null, '回数は不明');
  assert.equal(ta.get(1).bestAt, null);
  const st = createSettings(target);
  assert.deepEqual([st.get('sound'), st.get('clueStyle')], [false, 'fraction']);

  // 復元後もふつうに記録できる（最高称号の演出を二度出さない・回数は 1 から数える）
  const r = ta.recordResult(1, 6);
  assert.equal(r.firstMaster, false);
  assert.equal(r.newlyComplete, false);
  assert.equal(createChallengeStore(target).get(1).playCount, 1);
  assert.equal(store.recordClear(ids[0]).firstClear, false);
  assert.equal(store.recordClear('master-049').firstClear, !ids.includes('master-049'));
});

test('復元：解放されていないフルーツはイチゴにもどす。ランダムはそのまま', () => {
  const rec = { cleared: new Set(['easy-001']), hintFree: new Set(), taBest: [0, 0, 0, 0, 0], fruit: 'melon', sound: true, clueStyle: 'target' };
  assert.equal(JSON.parse(buildRestoreData(rec)[COLLECTION_KEY]).selectedFruit, 'strawberry');
  assert.equal(summarize(rec).fruit.id, 'strawberry');
  rec.fruit = 'random';
  assert.equal(JSON.parse(buildRestoreData(rec)[COLLECTION_KEY]).selectedFruit, 'random');
});

test('確認画面の内容', () => {
  const { b } = playedBackend(250, { seed: 21, ta: [8, 5, 3, 2, 1] });
  const s = summarize(decodeCode(encodeRecord(readRecord(b))).record);
  assert.equal(s.cleared, 250);
  assert.equal(s.total, 250);
  assert.equal(s.fruitsUnlocked, 16);
  assert.equal(s.trophies, 5);
  assert.deepEqual(s.taBest, [8, 5, 3, 2, 1]);
});

// ---------------- 既存記録の保護 ----------------
test('書き込みに失敗したら、元の記録にもどす', () => {
  const before = { [STORAGE_KEY]: '{"version":1,"cleared":{"easy-001":{}}}', [SETTINGS_KEY]: '{"sound":false}' };
  const b = mem(before);
  let n = 0;
  const failing = { ...b, setItem: (k, v) => { if (++n === 3) throw new Error('QuotaExceeded'); b.setItem(k, v); } };
  const rec = { cleared: new Set(['normal-001']), hintFree: new Set(), taBest: [1, 0, 0, 0, 0], fruit: 'strawberry', sound: true, clueStyle: 'target' };
  const res = applyRestore(failing, buildRestoreData(rec));
  assert.equal(res.ok, false);
  assert.equal(b.getItem(STORAGE_KEY), before[STORAGE_KEY]);
  assert.equal(b.getItem(SETTINGS_KEY), before[SETTINGS_KEY]);
  assert.equal(b.getItem(COLLECTION_KEY), null, 'なかったキーは消す');
  assert.equal(b.getItem(TIME_ATTACK_KEY), null);
  assert.equal(applyRestore(null, {}).ok, false);
  assert.equal(applyRestore(b, { other: 'x' }).ok, false, '関係ないキーは書かない');
  assert.deepEqual([...RESTORE_KEYS].sort(), [STORAGE_KEY, COLLECTION_KEY, TIME_ATTACK_KEY, SETTINGS_KEY].sort());
});

test('読みこみ・確認だけでは、保存データを変えない', () => {
  const { b } = playedBackend(30, { seed: 4 });
  const snapshot = JSON.stringify([...b._m]);
  const code = encodeRecord(readRecord(b));
  const d = decodeCode(code);
  summarize(d.record);
  buildRestoreData(d.record);
  decodeCode('FM1-broken');
  assert.equal(JSON.stringify([...b._m]), snapshot);
});
