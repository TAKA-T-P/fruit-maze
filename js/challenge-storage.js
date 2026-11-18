// タイムアタックの記録の保存（DOM 非依存）。通常モードのクリア記録・コレクション・設定とは別のキー。
//
//   fruitMaze.timeAttack.v1 = {
//     version: 1,
//     levels: {
//       "1": { bestClears, playCount, lastClears, bestAt, masterAchievedAt, lastPlayedAt },
//       ...
//     },
//     completeAt: null   // 5 難易度すべてで「めいろ皆伝」になった日時（一度なったら残す）
//   }
// 最後まで遊んだ挑戦だけを記録する（途中でやめた挑戦は記録しない・プレイ回数にも数えない）。

import { TA_LEVELS } from './challenge-config.js';
import { titleFor, isMaster, allMaster } from './challenge-titles.js';

export const TIME_ATTACK_KEY = 'fruitMaze.timeAttack.v1';

const emptyLevel = () => ({ bestClears: 0, playCount: 0, lastClears: null, bestAt: null, masterAchievedAt: null, lastPlayedAt: null });
const emptyData = () => ({ version: 1, levels: Object.fromEntries(TA_LEVELS.map((c) => [String(c.level), emptyLevel()])), completeAt: null });
const nonNegInt = (v) => Number.isInteger(v) && v >= 0;
const isoOrNull = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);

/** @param {Storage|null} backend localStorage 互換（テスト時は差し替え可能） */
export function createChallengeStore(backend = safeLocalStorage()) {
  let data = read();

  function read() {
    const out = emptyData();
    try {
      const raw = backend && backend.getItem(TIME_ATTACK_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved === 'object' && saved.levels && typeof saved.levels === 'object') {
        for (const c of TA_LEVELS) {
          const s = saved.levels[String(c.level)];
          if (!s || typeof s !== 'object') continue;
          const L = out.levels[String(c.level)];
          if (nonNegInt(s.bestClears)) L.bestClears = s.bestClears;
          if (nonNegInt(s.playCount)) L.playCount = s.playCount;
          if (nonNegInt(s.lastClears)) L.lastClears = s.lastClears;
          L.bestAt = isoOrNull(s.bestAt);
          L.masterAchievedAt = isoOrNull(s.masterAchievedAt);
          L.lastPlayedAt = isoOrNull(s.lastPlayedAt);
        }
        out.completeAt = isoOrNull(saved.completeAt);
      }
    } catch { /* 壊れていたら空の記録から */ }
    return out;
  }
  function write() {
    try { backend && backend.setItem(TIME_ATTACK_KEY, JSON.stringify(data)); } catch { /* 保存できなくても続ける */ }
  }

  return {
    /** 難易度ごとの記録（コピー） */
    get(level) { return { ...data.levels[String(level)] }; },
    bestByLevel() { return Object.fromEntries(TA_LEVELS.map((c) => [c.level, data.levels[String(c.level)].bestClears])); },
    /** 5 難易度すべてで「めいろ皆伝」になったことがある */
    isComplete() { return !!data.completeAt; },
    completeAt() { return data.completeAt; },
    /**
     * 最後まで遊んだ挑戦の結果を記録する。
     * @returns {{ clears, prevBest, best, newRecord: boolean, titleUp: boolean, title, prevTitle, firstMaster: boolean, newlyComplete: boolean }}
     *   newRecord … 自己ベスト更新（同点は更新ではない）
     *   titleUp   … 今回、これまでより上の称号になった
     */
    recordResult(level, clears, now = new Date()) {
      const L = data.levels[String(level)];
      const iso = now.toISOString();
      const prevBest = L.bestClears;
      const prevTitle = titleFor(level, prevBest);
      L.playCount++;
      L.lastClears = clears;
      L.lastPlayedAt = iso;
      const newRecord = clears > prevBest;
      if (newRecord) { L.bestClears = clears; L.bestAt = iso; }
      const title = titleFor(level, L.bestClears);
      const firstMaster = isMaster(level, L.bestClears) && !L.masterAchievedAt;
      if (firstMaster) L.masterAchievedAt = iso;
      const newlyComplete = !data.completeAt && allMaster(this.bestByLevel());
      if (newlyComplete) data.completeAt = iso;
      write();
      return {
        clears, prevBest, best: L.bestClears, newRecord,
        titleUp: !!title && (!prevTitle || title.id !== prevTitle.id),
        title, prevTitle, firstMaster, newlyComplete,
      };
    },
    raw() { return JSON.parse(JSON.stringify(data)); },
  };
}

function safeLocalStorage() {
  try { const ls = globalThis.localStorage; ls.getItem(TIME_ATTACK_KEY); return ls; } catch { return null; }
}
