// タイムアタックの設定（制限時間・ロスタイム・演出の長さ）。
// 称号（必要な正解数・名前・絵文字）は challenge-titles.js の TITLE_TABLE で管理する。
//
//   normalSeconds   … 通常の制限時間（秒）
//   overtimeSeconds … ロスタイム（最終問題に使える時間）＝ (難易度 + 1) × 5 秒

export const overtimeSecondsOf = (level) => (level + 1) * 5;

export const TA_LEVELS = [
  { level: 1, size: 4, normalSeconds: 120 },
  { level: 2, size: 5, normalSeconds: 180 },
  { level: 3, size: 6, normalSeconds: 240 },
  { level: 4, size: 7, normalSeconds: 300 },
  { level: 5, size: 8, normalSeconds: 300 },
].map((c) => ({ ...c, overtimeSeconds: overtimeSecondsOf(c.level), stars: '★'.repeat(c.level) }));

export function taConfig(level) {
  const c = TA_LEVELS.find((x) => x.level === level);
  if (!c) throw new Error(`タイムアタックの難易度が不正です: ${level}`);
  return c;
}

/** 制限時間の呼び名（120 秒 → 「2分チャレンジ」） */
export const challengeName = (level) => {
  const s = taConfig(level).normalSeconds;
  return s % 60 === 0 ? `${s / 60}分チャレンジ` : `${s}秒チャレンジ`;
};

/** 開始前の 3・2・1 の 1 カウントの長さ（ミリ秒） */
export const COUNTDOWN_STEP_MS = 800;
/** 正解したときの短い演出（ミリ秒）。この間も時間は進む */
export const CLEAR_FX_MS = 800;
/** 時間切れの表示（ミリ秒） */
export const TIMEUP_MS = 1000;
/** 残り時間をあかく目立たせる秒数 */
export const LOW_TIME_SECONDS = 10;
