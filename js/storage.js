// クリア記録の保存（localStorage）
// 第1段階で保存するもの：クリア済み問題ID / 初回クリア日時 / クリア回数 / 最後に選んだ難易度

export const STORAGE_KEY = 'fruitMaze.save.v1';

function emptySave() {
  return { version: 1, cleared: {}, lastDifficulty: null };
}

/**
 * @param {Storage|null} backend  localStorage 互換オブジェクト（テスト時は差し替え可能）
 */
export function createStore(backend = safeLocalStorage()) {
  let data = read();

  function read() {
    try {
      const raw = backend && backend.getItem(STORAGE_KEY);
      if (!raw) return emptySave();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.cleared !== 'object' || parsed.cleared === null) return emptySave();
      return { ...emptySave(), ...parsed };
    } catch {
      return emptySave();
    }
  }
  function write() {
    try { backend && backend.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* 保存できなくてもゲームは続ける */ }
  }

  return {
    /** クリアを記録する。初回クリアかどうかを返す。 */
    recordClear(puzzleId, now = new Date()) {
      const rec = data.cleared[puzzleId];
      if (rec) {
        rec.clearCount = (rec.clearCount || 1) + 1;
        write();
        return { firstClear: false, clearCount: rec.clearCount };
      }
      data.cleared[puzzleId] = { firstClearedAt: now.toISOString(), clearCount: 1 };
      write();
      return { firstClear: true, clearCount: 1 };
    },
    isCleared(puzzleId) { return Object.prototype.hasOwnProperty.call(data.cleared, puzzleId); },
    getRecord(puzzleId) { return data.cleared[puzzleId] || null; },
    clearedIds() { return Object.keys(data.cleared); },
    /** 初回クリア数（ユニークな問題ID数）。同じ問題を何度クリアしても 1。 */
    firstClearCount(ids = null) {
      const all = Object.keys(data.cleared);
      if (!ids) return all.length;
      const set = new Set(ids);
      return all.filter((id) => set.has(id)).length;
    },
    getLastDifficulty() { return data.lastDifficulty; },
    setLastDifficulty(level) { data.lastDifficulty = level; write(); },
    reload() { data = read(); },
    resetAll() { data = emptySave(); write(); },
  };
}

function safeLocalStorage() {
  try {
    const ls = globalThis.localStorage;
    const k = '__fm_test__';
    ls.setItem(k, '1'); ls.removeItem(k);
    return ls;
  } catch {
    return null; // プライベートモード等。記録は保存されないが遊べる。
  }
}
