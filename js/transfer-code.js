// 引継ぎコード（DOM 非依存）
//
// プレイ記録を短い文字列にして、別の端末・ブラウザで復元できるようにする。サーバーは使わない。
//
// ■ コードの形式（バージョン 1）
//   "FM1-" ＋ Base64URL（パディングなし）で 75 バイト → いつも 104 文字
//
//   バイト   内容
//   0〜31    通常ステージのクリア（250 ビット。下の固定の問題 ID 表の順。1 = クリア済み）
//   32〜63   ヒントなしクリア（250 ビット。1 のステージは必ずクリア済み）
//   64〜68   タイムアタック ★〜★★★★★ の最高クリア数（各 0〜255）
//   69       選んでいるフルーツ（0〜15 = 下のフルーツ表、16 = ランダム、17〜 = あとから追加したフルーツ）
//   70       設定など（bit0 = 効果音 ON、bit1 = 数字の表示が「分数表示」、bit2〜6 = タイムアタック ★〜★★★★★ を最後まであそんだ。bit7 は 0）
//   71〜74   チェックサム（"FM1" と バイト 0〜70 の CRC32。入力ミス・破損の検出用で、改ざん防止ではない）
//   ビットの並びは、i 番目 → バイト i>>3 の (i & 7) ビット目（下位ビットから）
//
// ■ 問題 ID とビットの対応は固定（画面のステージ順 data/stage-order.json とは関係ない）
//   easy-001〜050, normal-001〜050, hard-001〜050, expert-001〜050, master-001〜050 の順。
//   問題を追加しても、この表は変えない（追加した問題を含めたいときは、コードのバージョンを上げて新しい表を作る）。
//
// ■ 引き継がないもの：日時・クリア回数・タイムアタックの回数や直近の結果・演出を見た履歴・プレイ中の盤面
//   復元するときは「不明（null）」にして、現在時刻などで作らない。

import { STORAGE_KEY, createStore } from './storage.js';
import { COLLECTION_KEY, createCollectionStore, clearStats, unlockedFruitIds, RANDOM_FRUIT_ID } from './collection.js';
import { TIME_ATTACK_KEY, createChallengeStore } from './challenge-storage.js';
import { SETTINGS_KEY, createSettings } from './settings.js';
import { allTrophyStatuses, isAllComplete } from './trophies.js';
import { FRUITS, getFruit, DEFAULT_FRUIT_ID } from './fruits.js';

export const CODE_APP = 'FM';
export const CODE_VERSION = 1;
export const CODE_PREFIX = `${CODE_APP}${CODE_VERSION}-`;
/** 読みこむ文字列の上限（これより長いものは解析しない）。将来コードが長くなっても入るよう余裕をもたせる */
export const MAX_INPUT_LENGTH = 2000;

const PREFIXES_V1 = ['easy', 'normal', 'hard', 'expert', 'master'];
/** 問題 ID の固定表（バージョン 1）。ビット位置 = この配列の番号 */
export const PUZZLE_IDS_V1 = Object.freeze(PREFIXES_V1.flatMap((p) => Array.from({ length: 50 }, (_, i) => `${p}-${String(i + 1).padStart(3, '0')}`)));
/** フルーツの固定表（バージョン 1）。番号 16 は「ランダム」。あとから追加したフルーツは 17 から（番号は変えない） */
export const FRUIT_IDS_V1 = Object.freeze(['strawberry', 'apple', 'orange', 'banana', 'grape', 'watermelon', 'cherry', 'peach',
  'lemon', 'pear', 'pineapple', 'kiwi', 'mango', 'blueberry', 'coconut', 'melon']);
const RANDOM_INDEX = 16;
export const FRUIT_IDS_ADDED = Object.freeze(['greenapple', 'avocado']); // 17, 18
const fruitToIndex = (id) => {
  if (id === RANDOM_FRUIT_ID) return RANDOM_INDEX;
  const a = FRUIT_IDS_V1.indexOf(id);
  if (a >= 0) return a;
  const b = FRUIT_IDS_ADDED.indexOf(id);
  return b >= 0 ? RANDOM_INDEX + 1 + b : -1;
};
const indexToFruit = (i) => (i < RANDOM_INDEX ? FRUIT_IDS_V1[i] : i === RANDOM_INDEX ? RANDOM_FRUIT_ID : FRUIT_IDS_ADDED[i - RANDOM_INDEX - 1] || null);

const N = PUZZLE_IDS_V1.length;          // 250
const BITS_BYTES = Math.ceil(N / 8);     // 32
const OFS = { cleared: 0, hintFree: BITS_BYTES, ta: BITS_BYTES * 2, fruit: BITS_BYTES * 2 + 5, settings: BITS_BYTES * 2 + 6, crc: BITS_BYTES * 2 + 7 };
const BODY_LENGTH = OFS.crc;             // 71
const TOTAL_LENGTH = OFS.crc + 4;        // 75
const SETTING_BITS = { sound: 1, fraction: 2 };
const PLAYED_SHIFT = 2; // bit2〜6：タイムアタックを最後まであそんだ むずかしさ
const SETTING_MASK = SETTING_BITS.sound | SETTING_BITS.fraction | (0b11111 << PLAYED_SHIFT);

const levelOfId = (id) => PREFIXES_V1.indexOf(id.split('-')[0]) + 1;
const totalOf = (level) => PUZZLE_IDS_V1.filter((id) => levelOfId(id) === level).length;

// ---------------------------------------------------------------- 記録の読み取り
/**
 * 今の保存データ（localStorage 互換の backend）から、引き継ぐ記録を取り出す。
 * @returns {{cleared: Set<string>, hintFree: Set<string>, taBest: number[], taPlayed: Set<number>, fruit: string, sound: boolean, clueStyle: 'target'|'fraction'}}
 */
export function readRecord(backend) {
  const store = createStore(backend);
  const ids = new Set(PUZZLE_IDS_V1);
  const cleared = new Set(store.clearedIds().filter((id) => ids.has(id)));
  const hintFree = new Set([...cleared].filter((id) => store.isHintFreeCleared(id)));
  const taStore = createChallengeStore(backend);
  const ta = taStore.bestByLevel();
  const taPlayed = new Set([1, 2, 3, 4, 5].filter((lv) => taStore.hasPlayed(lv)));
  const col = createCollectionStore(backend);
  const unlocked = unlockedFruitIds(clearStats([...cleared], levelOfId, { taPlayed: taPlayed.size }));
  const fruit = col.isRandom() ? RANDOM_FRUIT_ID : col.selectedFruit(unlocked).id;
  const settings = createSettings(backend);
  return {
    cleared, hintFree,
    taBest: [1, 2, 3, 4, 5].map((lv) => ta[lv] || 0),
    taPlayed,
    fruit, sound: settings.get('sound') !== false, clueStyle: settings.get('clueStyle') === 'fraction' ? 'fraction' : 'target',
  };
}

// ---------------------------------------------------------------- コードの生成
/** 記録 → 引継ぎコード */
export function encodeRecord(rec) {
  const bytes = new Uint8Array(TOTAL_LENGTH);
  PUZZLE_IDS_V1.forEach((id, i) => {
    const hf = rec.hintFree.has(id);
    if (rec.cleared.has(id) || hf) setBit(bytes, OFS.cleared, i); // ヒントなしクリアは必ずクリア済み
    if (hf) setBit(bytes, OFS.hintFree, i);
  });
  rec.taBest.forEach((n, i) => { bytes[OFS.ta + i] = Math.max(0, Math.min(255, Math.floor(n) || 0)); });
  const fi = fruitToIndex(rec.fruit);
  bytes[OFS.fruit] = fi >= 0 ? fi : 0;
  const played = playedLevelsOf(rec);
  bytes[OFS.settings] = (rec.sound ? SETTING_BITS.sound : 0) | (rec.clueStyle === 'fraction' ? SETTING_BITS.fraction : 0)
    | [1, 2, 3, 4, 5].reduce((m, lv) => (played.has(lv) ? m | (1 << (PLAYED_SHIFT + lv - 1)) : m), 0);
  writeU32(bytes, OFS.crc, checksum(bytes.subarray(0, BODY_LENGTH)));
  return CODE_PREFIX + toBase64Url(bytes);
}

// ---------------------------------------------------------------- コードの解析・検証
/**
 * 引継ぎコード → 記録。保存データには一切ふれない。
 * @returns {{ok: true, record: object} | {ok: false, error: 'empty'|'too-long'|'invalid'|'version'}}
 */
export function decodeCode(input) {
  if (typeof input !== 'string') return { ok: false, error: 'invalid' };
  if (input.length > MAX_INPUT_LENGTH) return { ok: false, error: 'too-long' };
  // コピーのときに入った空白・改行・見えない文字を取り除く（内容を推測して直すことはしない）
  const text = input.replace(/[\s​-‍﻿]/g, '');
  if (!text) return { ok: false, error: 'empty' };
  const m = /^([A-Za-z]+)(\d+)-([A-Za-z0-9_-]+)$/.exec(text);
  if (!m || m[1] !== CODE_APP) return { ok: false, error: 'invalid' };
  if (Number(m[2]) !== CODE_VERSION) return { ok: false, error: 'version' };
  const bytes = fromBase64Url(m[3]);
  if (!bytes || bytes.length !== TOTAL_LENGTH) return { ok: false, error: 'invalid' };
  if (readU32(bytes, OFS.crc) !== checksum(bytes.subarray(0, BODY_LENGTH))) return { ok: false, error: 'invalid' };

  // 中身の検証（チェックサムが合っていても、ありえない値なら読みこまない）
  for (let i = N; i < BITS_BYTES * 8; i++) {
    if (getBit(bytes, OFS.cleared, i) || getBit(bytes, OFS.hintFree, i)) return { ok: false, error: 'invalid' }; // 使っていないビット
  }
  const cleared = new Set();
  const hintFree = new Set();
  for (let i = 0; i < N; i++) {
    const c = getBit(bytes, OFS.cleared, i);
    const h = getBit(bytes, OFS.hintFree, i);
    if (h && !c) return { ok: false, error: 'invalid' }; // ヒントなしクリアなのに未クリア
    if (c) cleared.add(PUZZLE_IDS_V1[i]);
    if (h) hintFree.add(PUZZLE_IDS_V1[i]);
  }
  const fruit = indexToFruit(bytes[OFS.fruit]);
  if (!fruit) return { ok: false, error: 'invalid' };
  const st = bytes[OFS.settings];
  if (st & ~SETTING_MASK) return { ok: false, error: 'invalid' };
  const taBest = Array.from(bytes.subarray(OFS.ta, OFS.ta + 5));
  const taPlayed = new Set([1, 2, 3, 4, 5].filter((lv) => (st >> (PLAYED_SHIFT + lv - 1)) & 1 || taBest[lv - 1] > 0));
  return {
    ok: true,
    record: {
      cleared, hintFree,
      taBest,
      taPlayed,
      fruit,
      sound: !!(st & SETTING_BITS.sound),
      clueStyle: st & SETTING_BITS.fraction ? 'fraction' : 'target',
    },
  };
}

/** 確認画面に出す内容 */
export function summarize(rec) {
  const stats = clearStats([...rec.cleared], levelOfId, { taPlayed: playedLevelsOf(rec).size });
  const unlocked = unlockedFruitIds(stats);
  const fruitUsable = rec.fruit === RANDOM_FRUIT_ID || unlocked.includes(rec.fruit);
  return {
    cleared: rec.cleared.size,
    total: N,
    hintFree: rec.hintFree.size,
    taBest: [...rec.taBest],
    fruit: rec.fruit === RANDOM_FRUIT_ID ? { id: RANDOM_FRUIT_ID, emoji: '🎲', name: 'ランダム' } : getFruit(fruitUsable ? rec.fruit : DEFAULT_FRUIT_ID),
    fruitsUnlocked: unlocked.length,
    fruitsTotal: FRUITS.length,
    trophies: allTrophyStatuses(stats, totalOf).filter((s) => s.earned).length,
  };
}

// ---------------------------------------------------------------- 復元
/**
 * 記録から、4 つの保存データ（localStorage に書く文字列）を作る。
 * 日時・回数は不明（null）。演出を見た履歴は「今の実績はすべて見たことにする」（古い演出が大量に出ないように）。
 * @returns {Record<string, string>} キー → 保存する JSON 文字列
 */
export function buildRestoreData(rec) {
  const cleared = {};
  for (const id of PUZZLE_IDS_V1) {
    if (!rec.cleared.has(id)) continue;
    cleared[id] = { firstClearedAt: null, clearCount: null, hintFree: rec.hintFree.has(id) }; // ヒントなしかどうかは明示する
  }
  const played = playedLevelsOf(rec);
  const stats = clearStats([...rec.cleared], levelOfId, { taPlayed: played.size });
  const unlocked = unlockedFruitIds(stats);
  const trophies = allTrophyStatuses(stats, totalOf).filter((s) => s.earned).map((s) => s.trophy.level);
  const selected = rec.fruit === RANDOM_FRUIT_ID || unlocked.includes(rec.fruit) ? rec.fruit : DEFAULT_FRUIT_ID; // 未解放ならイチゴ
  const levels = {};
  rec.taBest.forEach((best, i) => {
    levels[String(i + 1)] = { bestClears: best, playCount: null, lastClears: null, bestAt: null, masterAchievedAt: null, lastPlayedAt: null, played: played.has(i + 1) };
  });
  return {
    [STORAGE_KEY]: JSON.stringify({ version: 1, cleared, lastDifficulty: null }),
    [COLLECTION_KEY]: JSON.stringify({
      version: 1, selectedFruit: selected,
      seenUnlocks: unlocked, seenTrophies: trophies, seenComplete: isAllComplete(stats, totalOf), zukanSeen: unlocked,
    }),
    [TIME_ATTACK_KEY]: JSON.stringify({ version: 1, levels, completeAt: null }),
    [SETTINGS_KEY]: JSON.stringify({ sound: rec.sound, clueStyle: rec.clueStyle }),
  };
}

export const RESTORE_KEYS = Object.freeze([STORAGE_KEY, COLLECTION_KEY, TIME_ATTACK_KEY, SETTINGS_KEY]);

/**
 * 保存データを書きかえる。先に今のデータを退避し、書き込みに失敗したら元にもどす。
 * （localStorage は複数のキーをまとめて書く仕組みがないので、できる範囲でもどす）
 * @returns {{ok: boolean, error?: string}}
 */
export function applyRestore(backend, data) {
  if (!backend) return { ok: false, error: 'no-storage' };
  const keys = Object.keys(data);
  if (keys.some((k) => !RESTORE_KEYS.includes(k))) return { ok: false, error: 'bad-key' };
  let backup;
  try {
    backup = Object.fromEntries(keys.map((k) => [k, backend.getItem(k)]));
  } catch {
    return { ok: false, error: 'no-storage' };
  }
  try {
    for (const k of keys) backend.setItem(k, data[k]);
    for (const k of keys) if (backend.getItem(k) !== data[k]) throw new Error(`verify ${k}`);
    return { ok: true };
  } catch (err) {
    for (const k of keys) {
      try {
        if (backup[k] === null) backend.removeItem(k);
        else backend.setItem(k, backup[k]);
      } catch { /* もどせなかったキーは、そのまま */ }
    }
    return { ok: false, error: String(err && err.message || err) };
  }
}

/** 「記録を消す」で消すキー（クリア・コレクション・タイムアタック。設定は残す） */
export const ERASE_KEYS = Object.freeze([STORAGE_KEY, COLLECTION_KEY, TIME_ATTACK_KEY]);

/**
 * 記録を消す（クリア状況・フルーツの選択と演出の履歴・タイムアタックの記録）。効果音などの設定は残す。
 * @returns {{ok: boolean}}
 */
export function eraseRecords(backend) {
  if (!backend) return { ok: false };
  try {
    for (const k of ERASE_KEYS) backend.removeItem(k);
    return { ok: ERASE_KEYS.every((k) => backend.getItem(k) === null) };
  } catch {
    return { ok: false };
  }
}

/** タイムアタックを最後まであそんだ むずかしさ（最高記録が 1 以上なら、あそんだことにする） */
function playedLevelsOf(rec) {
  const s = new Set(rec.taPlayed || []);
  (rec.taBest || []).forEach((n, i) => { if (n > 0) s.add(i + 1); });
  return s;
}

// ---------------------------------------------------------------- 小さな道具
function setBit(bytes, ofs, i) { bytes[ofs + (i >> 3)] |= 1 << (i & 7); }
function getBit(bytes, ofs, i) { return (bytes[ofs + (i >> 3)] >> (i & 7)) & 1; }
function writeU32(b, o, v) { b[o] = v >>> 24; b[o + 1] = (v >>> 16) & 255; b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255; }
function readU32(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }

let CRC_TABLE = null;
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
/** アプリ識別子・バージョンもふくめて計算する（ほかのアプリやバージョンのデータと取りちがえないように） */
function checksum(body) {
  const head = [...`${CODE_APP}${CODE_VERSION}`].map((ch) => ch.charCodeAt(0));
  return crc32(Uint8Array.from([...head, ...body]));
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function toBase64Url(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = [n >> 18, (n >> 12) & 63, (n >> 6) & 63, n & 63].map((x) => B64[x]);
    out += chars.slice(0, Math.min(4, bytes.length - i + 1)).join('');
  }
  return out;
}
/** 不正な文字・長さなら null */
export function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const out = [];
  for (let i = 0; i < text.length; i += 4) {
    const chunk = text.slice(i, i + 4);
    const v = [...chunk].map((ch) => B64.indexOf(ch));
    const n = (v[0] << 18) | (v[1] << 12) | ((v[2] ?? 0) << 6) | (v[3] ?? 0);
    out.push((n >> 16) & 255);
    if (chunk.length > 2) out.push((n >> 8) & 255);
    if (chunk.length > 3) out.push(n & 255);
  }
  return Uint8Array.from(out);
}
