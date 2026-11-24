// エンディング演出の中身（DOM 非依存）。表示は ending-ui.js。
//
// 2 種類：
//   trophy … 全 250 ステージをクリアして、5 つのトロフィーをコンプリートしたとき
//   ta     … タイムアタックの 5 つの難易度すべてで、最高称号をゲットしたとき
// どちらも「オープニング → 5 つの記録（3 秒ずつ）→ クレジット」の順に見せる。

import { TROPHIES } from './trophies.js';
import { TA_LEVELS, challengeName } from './challenge-config.js';
import { masterTitleOf } from './challenge-titles.js';

export const ENDING_CREDIT = '製作　T.TAKEMOTO / KEC Glows';
export const ENDING_THANKS = 'あそんでくれて ありがとう！';

/**
 * トロフィーのエンディング
 * @param {(level: number) => number} totalOf     その難易度の収録数（通常 50）
 * @param {(level: number) => number} hintFreeOf  その難易度で、ヒントなしでクリアしたステージ数
 */
export function trophyEnding({ totalOf, hintFreeOf }) {
  const total = TROPHIES.reduce((n, t) => n + totalOf(t.level), 0);
  return {
    id: 'trophy',
    opening: { kicker: 'おめでとう！', title: 'フルーツめいろ<br>完全制覇！', sub: `全${total}ステージ クリア達成！` },
    items: TROPHIES.map((t) => ({
      kicker: t.stars,
      icon: t.icon,
      title: `${t.name}トロフィー`,
      lines: [`${totalOf(t.level)}ステージ コンプリート！`, `ヒントなしクリア <b>${hintFreeOf(t.level)}</b>問`],
      badge: t.icon,
      label: t.stars,
    })),
    credits: { thanks: ENDING_THANKS, credit: ENDING_CREDIT },
  };
}

/**
 * タイムアタックのエンディング
 * @param {Record<number, number>} bestByLevel  難易度ごとの最高記録（challenge-storage.js の bestByLevel()）
 */
export function taEnding(bestByLevel) {
  return {
    id: 'ta',
    opening: { kicker: 'おめでとう！', title: 'タイムアタック<br>完全制覇！', sub: '5つの むずかしさで 最高の称号を ゲット！' },
    items: TA_LEVELS.map((c) => {
      const m = masterTitleOf(c.level);
      return {
        kicker: `${c.stars}　⏱️ ${challengeName(c.level)}`,
        icon: m.icon,
        title: m.name,
        lines: [`最高記録 <b>${bestByLevel[c.level] || 0}</b>問クリア`],
        badge: m.icon,
        label: c.stars,
      };
    }),
    credits: { thanks: ENDING_THANKS, credit: ENDING_CREDIT },
  };
}
