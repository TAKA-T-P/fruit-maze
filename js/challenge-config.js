// タイムアタックの設定（制限時間・ロスタイム・称号の条件）。調整はこのファイルだけで行う。
//
//   normalSeconds   … 通常の制限時間（秒）
//   overtimeSeconds … ロスタイム（最終問題に使える時間）＝ (難易度 + 1) × 5 秒
//   titles          … 称号ごとに必要な正解数（null はその難易度では設定しない）
//                     masterClears（最高称号「めいろ皆伝」の条件）は titles.kaiden

export const overtimeSecondsOf = (level) => (level + 1) * 5;

export const TA_LEVELS = [
  { level: 1, size: 4, normalSeconds: 120, titles: { rookie: 1, challenger: 3, meijin: 5, tatsujin: 7, kaiden: 10 } },
  { level: 2, size: 5, normalSeconds: 180, titles: { rookie: 1, challenger: 2, meijin: 4, tatsujin: 5, kaiden: 7 } },
  { level: 3, size: 6, normalSeconds: 240, titles: { rookie: 1, challenger: 2, meijin: 3, tatsujin: 4, kaiden: 5 } },
  { level: 4, size: 7, normalSeconds: 300, titles: { rookie: null, challenger: 1, meijin: 2, tatsujin: 3, kaiden: 4 } },
  { level: 5, size: 8, normalSeconds: 300, titles: { rookie: null, challenger: 1, meijin: null, tatsujin: 2, kaiden: 3 } },
].map((c) => ({ ...c, overtimeSeconds: overtimeSecondsOf(c.level), masterClears: c.titles.kaiden, stars: '★'.repeat(c.level) }));

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
