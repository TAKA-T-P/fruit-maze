// タイムアタックの称号（DOM 非依存）。1 回のタイムアタックで正解した問題数で決まる。難易度ごとに別々。
//
// 称号のデータ（必要な正解数・名前・絵文字）は、このファイルの TITLE_TABLE だけで管理する。
// 難易度選択・開始前のせつめい・プレイ中の表示・結果・きろくは、すべてここを参照する。
// 称号そのものは保存せず、保存されている「難易度別の最高クリア数」から毎回計算する
// （名前を変えても、保存済みの記録はそのまま使える）。

import { TA_LEVELS } from './challenge-config.js';

/** 段階（絵文字は段階ごとに共通） */
export const TIERS = [
  { id: 'rookie', icon: '🌱' },
  { id: 'challenger', icon: '🍀' },
  { id: 'meijin', icon: '⭐' },
  { id: 'tatsujin', icon: '🔥' },
  { id: 'kaiden', icon: '👑' },   // 最高称号
];
export const MASTER_TITLE_ID = 'kaiden';

/**
 * 難易度ごとの称号（下から順）。id は段階（絵文字・最高称号の判定に使う）、need は必要な正解数。
 * 全 22 種類の名前は重複しない（テストで確認）。
 */
export const TITLE_TABLE = {
  1: [
    { id: 'rookie', need: 1, name: 'めいろのたまご' },
    { id: 'challenger', need: 3, name: 'フルーツたんけんたい' },
    { id: 'meijin', need: 5, name: 'めいろの道しるべ' },
    { id: 'tatsujin', need: 7, name: 'フルーツスピードスター' },
    { id: 'kaiden', need: 10, name: 'フルーツスピード王' },
  ],
  2: [
    { id: 'rookie', need: 1, name: 'めいろの見習い' },
    { id: 'challenger', need: 2, name: 'フルーツトラベラー' },
    { id: 'meijin', need: 4, name: 'ひらめきナビゲーター' },
    { id: 'tatsujin', need: 5, name: 'めいろの達人' },
    { id: 'kaiden', need: 7, name: 'フルーツひらめき王' },
  ],
  3: [
    { id: 'rookie', need: 1, name: 'すいりのチャレンジャー' },
    { id: 'challenger', need: 2, name: 'めいろハンター' },
    { id: 'meijin', need: 3, name: 'ひらめきマスター' },
    { id: 'tatsujin', need: 4, name: 'フルーツの賢者' },
    { id: 'kaiden', need: 5, name: 'フルーツ知恵の王' },
  ],
  4: [
    { id: 'challenger', need: 1, name: 'めいろの探究者' },
    { id: 'meijin', need: 2, name: 'すいりのエキスパート' },
    { id: 'tatsujin', need: 3, name: 'めいろの大賢者' },
    { id: 'kaiden', need: 4, name: 'フルーツ太陽王' },
  ],
  5: [
    { id: 'challenger', need: 1, name: '伝説への挑戦者' },
    { id: 'tatsujin', need: 2, name: '究極のめいろマスター' },
    { id: 'kaiden', need: 3, name: 'フルーツめいろの神' },
  ],
};

const iconOf = (id) => TIERS.find((t) => t.id === id).icon;

/** その難易度の称号と必要数（下から順）。{ id, icon, name, need, level } */
export function titlesOf(level) {
  const list = TITLE_TABLE[level];
  if (!list) throw new Error(`タイムアタックの難易度が不正です: ${level}`);
  return list.map((t) => ({ ...t, icon: iconOf(t.id), level }));
}

/** その難易度の最高称号 */
export const masterTitleOf = (level) => titlesOf(level).find((t) => t.id === MASTER_TITLE_ID);
/** 最高称号に必要な正解数 */
export const masterClearsOf = (level) => masterTitleOf(level).need;

/** 正解数に対する称号（いちばん上のもの）。まだなければ null */
export function titleFor(level, clears) {
  let got = null;
  for (const t of titlesOf(level)) if (clears >= t.need) got = t;
  return got;
}

/** 次の称号と、あと何問か。最高称号まで取っていれば null */
export function nextTitle(level, clears) {
  const t = titlesOf(level).find((x) => clears < x.need);
  return t ? { title: t, remaining: t.need - clears } : null;
}

export const isMaster = (level, clears) => clears >= masterClearsOf(level);

/** 「次の称号まで あと1問」などの短い文 */
export function nextTitleText(level, clears) {
  const n = nextTitle(level, clears);
  const m = masterTitleOf(level);
  if (!n) return '最高称号達成！'; // 最高称号は上の行に表示しているので、ここでは名前をくり返さない
  if (n.title.id === MASTER_TITLE_ID) return `あと${n.remaining}問で ${m.icon} ${m.name}！`;
  return `次の称号まで あと${n.remaining}問`;
}

/** 5 つの難易度すべてで最高称号 */
export function allMaster(bestByLevel) {
  return TA_LEVELS.every((c) => isMaster(c.level, bestByLevel[c.level] || 0));
}
