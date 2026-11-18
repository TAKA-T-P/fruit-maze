// トロフィー：各難易度の 50 ステージをすべてクリアすると獲得（DOM 非依存）
// フルーツの解放とは別に判定する。獲得しているかどうかはクリア記録から計算する。

export const TROPHIES = [
  { level: 1, icon: '🥉', name: 'ブロンズ', stars: '★' },
  { level: 2, icon: '🥈', name: 'シルバー', stars: '★★' },
  { level: 3, icon: '🥇', name: 'ゴールド', stars: '★★★' },
  { level: 4, icon: '🏆', name: 'プラチナ', stars: '★★★★' },
  { level: 5, icon: '👑', name: 'マスター', stars: '★★★★★' },
];

export const getTrophy = (level) => TROPHIES.find((t) => t.level === level) || null;

/**
 * @param {{byLevel: Record<number, number>}} stats  collection.js の clearStats()
 * @param {(level: number) => number} totalOf        その難易度の収録数（通常 50）
 * @returns {{ trophy, earned: boolean, current: number, need: number, remaining: number }}
 */
export function trophyStatus(trophy, stats, totalOf) {
  const need = totalOf(trophy.level);
  const current = Math.min(stats.byLevel[trophy.level] || 0, need);
  return { trophy, earned: need > 0 && current >= need, current, need, remaining: Math.max(0, need - current) };
}

export function allTrophyStatuses(stats, totalOf) {
  return TROPHIES.map((t) => trophyStatus(t, stats, totalOf));
}

/** 5 種類すべて獲得（全 250 ステージクリア） */
export function isAllComplete(stats, totalOf) {
  return allTrophyStatuses(stats, totalOf).every((s) => s.earned);
}
