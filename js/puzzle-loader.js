// 問題データの読み込み・難易度別の索引・ランダム出題
import { validatePuzzle } from './puzzle-utils.js';

/** 難易度の定義（盤面サイズと表示名） */
export const DIFFICULTIES = [
  { level: 1, size: 4, stars: '★' },
  { level: 2, size: 5, stars: '★★' },
  { level: 3, size: 6, stars: '★★★' },
  { level: 4, size: 7, stars: '★★★★' },
  { level: 5, size: 8, stars: '★★★★★' },
];

export class PuzzleLibrary {
  /**
   * @param {{puzzles: object[], tutorial?: object}} data
   * @param {object} [opt]
   * @param {{levels: Object<string, string[]>}} [opt.stageOrder] ステージの並び（data/stage-order.json）。
   *   ないときは ID 順。並びにない問題は、そのうしろに ID 順で付ける
   */
  constructor(data, { onInvalid = (id, errors) => console.warn('[puzzle] 無効な問題をスキップ:', id, errors), stageOrder = null } = {}) {
    this.byId = new Map();
    this.byLevel = new Map(DIFFICULTIES.map((d) => [d.level, []]));
    for (const p of data.puzzles || []) {
      const errors = validatePuzzle(p);
      if (errors.length) { onInvalid(p && p.id, errors); continue; }
      if (this.byId.has(p.id)) { onInvalid(p.id, ['id が重複']); continue; }
      this.byId.set(p.id, p);
      this.byLevel.get(p.difficulty).push(p);
    }
    this.tutorial = data.tutorial && validatePuzzle(data.tutorial).length === 0 ? data.tutorial : null;
    if (stageOrder && stageOrder.levels) this._applyStageOrder(stageOrder.levels);
  }

  /** 同じ ★ の中を、指定された順（やさしい → むずかしい）に並べ替える */
  _applyStageOrder(levels) {
    for (const [level, list] of this.byLevel) {
      const ids = Array.isArray(levels[level]) ? levels[level] : [];
      const rank = new Map();
      ids.forEach((id, i) => { if (!rank.has(id)) rank.set(id, i); });
      list.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
    }
  }

  get(id) { return this.byId.get(id) || null; }
  list(level) { return this.byLevel.get(level) || []; }
  count(level) { return this.list(level).length; }

  /**
   * 指定難易度からランダムに 1 問選ぶ。
   * @param {number} level
   * @param {object} [opt]
   * @param {string} [opt.excludeId]  直前の問題（候補が 2 問以上あれば避ける）
   * @param {(p: object) => number} [opt.weight] 出題の重み（将来「未クリア優先」に使う。既定はすべて 1）
   * @param {() => number} [opt.random] 乱数関数（テスト用）
   */
  pickRandom(level, { excludeId = null, weight = () => 1, random = Math.random } = {}) {
    let candidates = this.list(level);
    if (!candidates.length) return null;
    if (excludeId && candidates.length > 1) candidates = candidates.filter((p) => p.id !== excludeId);
    const weights = candidates.map((p) => Math.max(0, weight(p)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return candidates[Math.floor(random() * candidates.length)];
    let x = random() * total;
    for (let i = 0; i < candidates.length; i++) {
      x -= weights[i];
      if (x < 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }
}

/**
 * あそびかた（チュートリアル）専用の問題を読み込む。本編の問題・クリア記録とは別。
 * 形式：{ version, pages: { route, deduce, memo, hint, challenge } }（各値は通常の問題と同じ形式）
 * 不正な問題は取り除く。
 */
export function parseTutorialData(data) {
  const pages = {};
  for (const [name, p] of Object.entries((data && data.pages) || {})) {
    const errors = validatePuzzle(p);
    if (errors.length) console.warn('[tutorial] 無効な問題をスキップ:', name, errors);
    else pages[name] = p;
  }
  return { ...data, pages };
}

export async function loadTutorialData(url = 'data/tutorial.json') {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`あそびかたの問題を読み込めませんでした (${res.status})`);
  return parseTutorialData(await res.json());
}

/** ステージの並び（読めなければ null → ID 順のまま） */
async function loadStageOrder(url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    return res.ok ? await res.json() : null;
  } catch (err) {
    console.warn('[stage-order] 読み込めませんでした（ID 順で表示します）', err);
    return null;
  }
}

export async function loadPuzzleLibrary(url = 'data/puzzles.json', { orderUrl = 'data/stage-order.json' } = {}) {
  const [res, stageOrder] = await Promise.all([fetch(url, { cache: 'no-cache' }), orderUrl ? loadStageOrder(orderUrl) : null]);
  if (!res.ok) throw new Error(`問題データを読み込めませんでした (${res.status})`);
  return new PuzzleLibrary(await res.json(), { stageOrder });
}
