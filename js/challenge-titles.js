// タイムアタックの称号（DOM 非依存）。1 回のタイムアタックで正解した問題数で決まる。難易度ごとに別々。
// 必要な正解数は challenge-config.js の titles。称号そのものは保存せず、自己ベストから毎回計算する。

import { taConfig, TA_LEVELS } from './challenge-config.js';

/** 称号（下から順） */
export const TITLES = [
  { id: 'rookie', icon: '🌱', name: 'めいろルーキー' },
  { id: 'challenger', icon: '🍀', name: 'めいろチャレンジャー' },
  { id: 'meijin', icon: '⭐', name: 'めいろ名人' },
  { id: 'tatsujin', icon: '🔥', name: 'めいろ達人' },
  { id: 'kaiden', icon: '👑', name: 'めいろ皆伝' },
];
export const MASTER_TITLE_ID = 'kaiden';

/** その難易度で設定されている称号と必要数（下から順） */
export function titlesOf(level) {
  const need = taConfig(level).titles;
  return TITLES.filter((t) => need[t.id] != null).map((t) => ({ ...t, need: need[t.id] }));
}

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

export const isMaster = (level, clears) => clears >= taConfig(level).masterClears;

/** 「次の称号まで あと1問」などの短い文 */
export function nextTitleText(level, clears) {
  const n = nextTitle(level, clears);
  if (!n) return '👑 めいろ皆伝！';
  if (n.title.id === MASTER_TITLE_ID) return `あと${n.remaining}問で 👑 めいろ皆伝！`;
  return `次の称号まで あと${n.remaining}問`;
}

/** 5 つの難易度すべてで最高称号 */
export function allMaster(bestByLevel) {
  return TA_LEVELS.every((c) => isMaster(c.level, bestByLevel[c.level] || 0));
}
