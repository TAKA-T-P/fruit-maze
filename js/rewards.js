// 報酬（フルーツ解放・トロフィー獲得・完全制覇）の判定と、演出をもう見たかの管理（DOM 非依存）
//
// 「解放・獲得しているか」はクリア記録から計算し、「演出を見たか」は collection の seen* で区別する。
// 演出をとばしても、報酬そのもの（解放・獲得）はクリア記録から決まるので失われない。

import { allFruitStatuses } from './collection.js';
import { allTrophyStatuses, isAllComplete } from './trophies.js';

/**
 * まだ演出を見ていない報酬をまとめて返す（1 回のクリアで複数あっても 1 回の演出で見せる）。
 * @returns {{ fruits: object[], trophies: object[], complete: boolean, isEmpty: boolean }}
 */
export function pendingRewards(stats, col, totalOf) {
  const seenF = col.seenUnlocks();
  const seenT = col.seenTrophies();
  const fruits = allFruitStatuses(stats).filter((s) => s.unlocked && s.fruit.unlock.type !== 'default' && !seenF.has(s.fruit.id)).map((s) => s.fruit);
  const trophies = allTrophyStatuses(stats, totalOf).filter((s) => s.earned && !seenT.has(s.trophy.level)).map((s) => s.trophy);
  const complete = isAllComplete(stats, totalOf) && !col.seenComplete();
  return { fruits, trophies, complete, isEmpty: !fruits.length && !trophies.length && !complete };
}

/** 演出を見たことにする（同じ演出を二度出さない） */
export function markRewardsSeen(col, rewards) {
  col.markUnlocksSeen(rewards.fruits.map((f) => f.id));
  col.markTrophiesSeen(rewards.trophies.map((t) => t.level));
  if (rewards.complete) col.markCompleteSeen();
}

/**
 * はじめての起動（第4段階へのアップデート直後を含む）の処理。
 * すでに条件を満たしているフルーツ・トロフィーは、演出を出さずにまとめて「見た」ことにする。
 * @returns {{ newFruits: number, trophies: number }} お知らせ用（イチゴ以外に使えるようになった数など）
 */
export function migrateFirstRun(stats, col, totalOf) {
  const p = pendingRewards(stats, col, totalOf);
  markRewardsSeen(col, p);
  col.markUnlocksSeen(['strawberry']);
  col.save();
  return { newFruits: p.fruits.length, trophies: p.trophies.length };
}
