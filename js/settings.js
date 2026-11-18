// 設定（効果音・マス数の表示）の保存。クリア記録（storage.js）とは別のキーに保存する。
export const SETTINGS_KEY = 'fruitMaze.settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  sound: true,          // 効果音 ON/OFF
  clueStyle: 'target',  // 行・列の数字：'target'＝「3」／'fraction'＝「1/3」
  buttons: 'cycle',     // 操作ボタン：'cycle'＝1つのボタンで切り替え／'five'＝「ルート」「○」「×」「消す」「💡」の5ボタン
});

const VALID = {
  sound: (v) => typeof v === 'boolean',
  clueStyle: (v) => v === 'target' || v === 'fraction',
  buttons: (v) => v === 'cycle' || v === 'five',
};

/** @param {Storage|null} backend localStorage 互換（テスト時は差し替え可能） */
export function createSettings(backend = safeLocalStorage()) {
  let data = read();
  function read() {
    const out = { ...DEFAULT_SETTINGS };
    try {
      const raw = backend && backend.getItem(SETTINGS_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      for (const k of Object.keys(VALID)) if (saved && VALID[k](saved[k])) out[k] = saved[k];
    } catch { /* 壊れていたら既定値 */ }
    return out;
  }
  return {
    get(key) { return data[key]; },
    set(key, value) {
      if (!VALID[key] || !VALID[key](value)) return false;
      data[key] = value;
      try { backend && backend.setItem(SETTINGS_KEY, JSON.stringify(data)); } catch { /* 保存できなくても続ける */ }
      return true;
    },
    all() { return { ...data }; },
  };
}

function safeLocalStorage() {
  try { const ls = globalThis.localStorage; ls.getItem(SETTINGS_KEY); return ls; } catch { return null; }
}
