// フルーツコレクション：解放条件の判定と、選んだフルーツなどの保存（DOM 非依存）
//
// 解放されているかどうかは、いつもクリア記録（storage.js）から計算する（保存しない）。
// ここで保存するのは「選んだフルーツ」と「演出をもう見たか」だけ。
//   fruitMaze.collection.v1 = {
//     version: 1,
//     selectedFruit: 'banana',
//     seenUnlocks: ['strawberry', 'apple', ...],  // 解放演出をもう見たフルーツ
//     seenTrophies: [1, 2],                        // 獲得演出をもう見たトロフィー（難易度）
//     seenComplete: false,                         // 完全制覇の演出をもう見たか
//     zukanSeen: ['strawberry', ...],              // 図鑑で「NEW!」をもう見たフルーツ
//   }

import { FRUITS, DEFAULT_FRUIT_ID, getFruit } from './fruits.js';

export const COLLECTION_KEY = 'fruitMaze.collection.v1';
export const LEVELS = [1, 2, 3, 4, 5];
/** 「ランダム」：ゲットしたフルーツの中から、ステージを始めるたびにえらぶ（selectedFruit に保存する値） */
export const RANDOM_FRUIT_ID = 'random';

/**
 * ゲットしたフルーツからランダムに 1 つ（2 種類以上あれば、直前のフルーツは避ける）
 * @param {Iterable<string>} unlocked 解放済みの ID
 * @param {string|null} [excludeId] 直前のフルーツ
 */
export function pickRandomFruit(unlocked, excludeId = null, random = Math.random) {
  const ok = new Set(unlocked);
  let ids = FRUITS.map((f) => f.id).filter((id) => ok.has(id));
  if (!ids.length) return getFruit(DEFAULT_FRUIT_ID);
  if (ids.length > 1 && excludeId) ids = ids.filter((id) => id !== excludeId);
  return getFruit(ids[Math.floor(random() * ids.length)]);
}

/**
 * クリア記録から、ちがうステージのクリア数を数える。
 * @param {string[]} clearedIds   クリア済みの問題 ID（storage.clearedIds()）
 * @param {(id: string) => number|null|undefined} levelOf  問題 ID → 難易度（収録されていない ID は数えない）
 * @param {{taPlayed?: number}} [opt]  taPlayed … タイムアタックを最後まであそんだ むずかしさの数（challenge-storage の playedCount()）
 * @returns {{ total: number, byLevel: Record<number, number>, taPlayed: number }}
 */
export function clearStats(clearedIds, levelOf, { taPlayed = 0 } = {}) {
  const byLevel = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  let total = 0;
  for (const id of new Set(clearedIds)) {
    const level = levelOf(id);
    if (!LEVELS.includes(level)) continue;
    byLevel[level]++;
    total++;
  }
  return { total, byLevel, taPlayed: Math.max(0, Math.min(LEVELS.length, taPlayed | 0)) };
}

const STARS = (level) => '★'.repeat(level);

/**
 * 1 種類のフルーツの解放状況。
 * @returns {{ fruit, unlocked: boolean, current: number, need: number, remaining: number, condition: string, hint: string }}
 *   condition … 解放条件（例「★★を5ステージクリア」）
 *   hint      … 次の目標（例「★★★をあと2ステージクリア！」）。解放済みなら空
 */
export function fruitStatus(fruit, stats) {
  const u = fruit.unlock || { type: 'default' };
  if (u.type === 'default') return { fruit, unlocked: true, current: 0, need: 0, remaining: 0, condition: 'さいしょから つかえる', hint: '' };
  const have = u.type === 'total' ? stats.total
    : u.type === 'timeattack' ? (stats.taPlayed || 0)
    : (stats.byLevel[u.level] || 0);
  const need = u.count;
  const current = Math.min(have, need);
  const remaining = Math.max(0, need - have);
  const condition = u.type === 'total' ? `ステージを ぜんぶで${need}こクリア`
    : u.type === 'timeattack' ? `タイムアタックを ${need}つのむずかしさで あそぶ`
    : `${STARS(u.level)}を${need}ステージクリア`;
  const hint = remaining === 0 ? ''
    : u.type === 'total' ? `あと${remaining}ステージで解放！`
    : u.type === 'timeattack' ? `タイムアタックを あと${remaining}つのむずかしさで あそぼう！`
    : `${STARS(u.level)}をあと${remaining}ステージクリア！`;
  return { fruit, unlocked: remaining === 0, current, need, remaining, condition, hint };
}

/** 全種類の解放状況（図鑑の順） */
export function allFruitStatuses(stats) {
  return [...FRUITS].sort((a, b) => a.order - b.order).map((f) => fruitStatus(f, stats));
}

/** 解放済みのフルーツ ID */
export function unlockedFruitIds(stats) {
  return allFruitStatuses(stats).filter((s) => s.unlocked).map((s) => s.fruit.id);
}

// ---------------- 保存 ----------------
function emptyData() {
  return { version: 1, selectedFruit: DEFAULT_FRUIT_ID, seenUnlocks: [], seenTrophies: [], seenComplete: false, zukanSeen: [] };
}

/**
 * @param {Storage|null} backend localStorage 互換（テスト時は差し替え可能）
 */
export function createCollectionStore(backend = safeLocalStorage()) {
  let isNew = false;
  let data = read();

  function read() {
    try {
      const raw = backend && backend.getItem(COLLECTION_KEY);
      if (!raw) { isNew = true; return emptyData(); }
      const saved = JSON.parse(raw);
      const out = emptyData();
      if (saved && typeof saved === 'object') {
        if (typeof saved.selectedFruit === 'string') out.selectedFruit = saved.selectedFruit;
        for (const k of ['seenUnlocks', 'zukanSeen']) if (Array.isArray(saved[k])) out[k] = saved[k].filter((x) => typeof x === 'string');
        if (Array.isArray(saved.seenTrophies)) out.seenTrophies = saved.seenTrophies.filter((x) => LEVELS.includes(x));
        out.seenComplete = saved.seenComplete === true;
      }
      return out;
    } catch {
      isNew = true; // 壊れていたら、はじめから（クリア記録から解放状況は復元できる）
      return emptyData();
    }
  }
  function write() {
    try { backend && backend.setItem(COLLECTION_KEY, JSON.stringify(data)); } catch { /* 保存できなくても続ける */ }
  }
  const addAll = (key, values) => {
    const set = new Set(data[key]);
    let changed = false;
    for (const v of values) if (!set.has(v)) { set.add(v); changed = true; }
    if (changed) { data[key] = [...set]; write(); }
  };

  return {
    /** 保存データがまだなかった（はじめての起動、または第4段階へのアップデート直後） */
    get isNew() { return isNew; },
    /**
     * 選んでいるフルーツ。保存された ID がない・未解放なら イチゴ。
     * @param {Set<string>|string[]} unlocked 解放済みの ID
     */
    selectedFruit(unlocked) {
      const ok = new Set(unlocked);
      if (data.selectedFruit === RANDOM_FRUIT_ID) return getFruit(DEFAULT_FRUIT_ID); // ランダムのときの実際のフルーツは pickRandomFruit で
      return ok.has(data.selectedFruit) && FRUITS.some((f) => f.id === data.selectedFruit) ? getFruit(data.selectedFruit) : getFruit(DEFAULT_FRUIT_ID);
    },
    /** フルーツを選ぶ（未解放なら選べない）。選べたら true */
    select(id, unlocked) {
      const ok = id === RANDOM_FRUIT_ID || (new Set(unlocked).has(id) && FRUITS.some((f) => f.id === id));
      if (!ok) return false;
      data.selectedFruit = id;
      write();
      return true;
    },
    /** 「ランダム」を選んでいる */
    isRandom() { return data.selectedFruit === RANDOM_FRUIT_ID; },
    seenUnlocks() { return new Set(data.seenUnlocks); },
    seenTrophies() { return new Set(data.seenTrophies); },
    seenComplete() { return data.seenComplete; },
    zukanSeen() { return new Set(data.zukanSeen); },
    markUnlocksSeen(ids) { addAll('seenUnlocks', ids); },
    markTrophiesSeen(levels) { addAll('seenTrophies', levels); },
    markCompleteSeen() { if (!data.seenComplete) { data.seenComplete = true; write(); } },
    markZukanSeen(ids) { addAll('zukanSeen', ids); },
    /** 今の状態をファイルに書く（はじめての起動の記録用） */
    save() { write(); isNew = false; },
    raw() { return JSON.parse(JSON.stringify(data)); },
  };
}

function safeLocalStorage() {
  try { const ls = globalThis.localStorage; ls.getItem(COLLECTION_KEY); return ls; } catch { return null; }
}
