// エンディング演出の表示（約 25 秒）。中身は ending.js。
//
//   0 秒      オープニング（「完全制覇！」）
//   3〜18 秒  5 つの記録を 3 秒ずつ順番に
//   18 秒〜   クレジット（製作　T.TAKEMOTO / KEC Glows）
//   21 秒〜   画面をタップすると とじる（「スキップ」はいつでも押せる）
// 音楽は assets/sounds/ending.mp3。設定で効果音を OFF にしているときは鳴らさない。

import { FRUITS } from './fruits.js';
import * as sound from './sound.js';

export const ENDING_MUSIC = 'assets/sounds/ending.mp3';
export const ENDING_TIMING = { firstItem: 3000, step: 3000, credits: 18000, closable: 21000 };
const MUSIC_VOLUME = 0.8;
const FADE_MS = 700;

function sky() {
  let html = '';
  for (let i = 0; i < 28; i++) {
    html += `<span class="ed-star" style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 3).toFixed(2)}s"></span>`;
  }
  FRUITS.forEach((f, i) => {
    html += `<span class="ed-fruit" style="left:${((i + 0.5) * (100 / FRUITS.length)).toFixed(1)}%;--d:${(Math.random() * 8).toFixed(2)}s;--t:${(8 + Math.random() * 5).toFixed(1)}s">${f.emoji}</span>`;
  });
  return `<div class="ed-sky" aria-hidden="true">${html}</div>`;
}

export class EndingPlayer {
  /** @param {HTMLElement} root  #ending */
  constructor(root) {
    this.root = root;
    this.timers = [];
    this.audio = null;
    this.onDone = null;
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-ed="close"]') || this.closable) this.close();
    });
    document.addEventListener('keydown', (e) => { if (this.isOpen && e.key === 'Escape') this.close(); });
  }

  get isOpen() { return !this.root.hidden; }

  /**
   * @param {ReturnType<import('./ending.js').trophyEnding>} ending
   * @param {() => void} [onDone]  とじたあと
   */
  play(ending, onDone) {
    this._stop();
    this.onDone = onDone || null;
    this.closable = false;
    const o = ending.opening;
    const scenes = [
      `<div class="ed-scene ed-opening">
        <p class="ed-kicker">${o.kicker}</p>
        <div class="ed-crown" aria-hidden="true">👑</div>
        <h2 class="ed-title">${o.title}</h2>
        <p class="ed-sub">${o.sub}</p>
      </div>`,
      ...ending.items.map((it) => `
      <div class="ed-scene ed-item">
        <p class="ed-kicker">${it.kicker}</p>
        <div class="ed-icon" aria-hidden="true">${it.icon}</div>
        <h3 class="ed-item-title">${it.title}</h3>
        ${it.lines.map((l) => `<p class="ed-line">${l}</p>`).join('')}
      </div>`),
      `<div class="ed-scene ed-credits">
        <p class="ed-thanks">${ending.credits.thanks}</p>
        <p class="ed-credit">${ending.credits.credit}</p>
      </div>`,
    ];
    this.root.className = `ending-overlay ed-${ending.id}`;
    this.root.innerHTML = `
      ${sky()}
      <button type="button" class="ed-skip" data-ed="close">スキップ ✕</button>
      <div class="ed-stage" role="dialog" aria-modal="true" aria-label="エンディング" aria-live="polite">${scenes.join('')}</div>
      <div class="ed-row" aria-hidden="true">${ending.items.map((it) => `<span class="ed-dot"><span class="ed-dot-icon">${it.badge}</span><small>${it.label}</small></span>`).join('')}</div>
      <p class="ed-tap" hidden>タップで とじる</p>`;
    this.root.hidden = false;
    this.root.querySelector('.ed-skip').focus({ preventScroll: true });

    const sceneEls = [...this.root.querySelectorAll('.ed-scene')];
    const dots = [...this.root.querySelectorAll('.ed-dot')];
    const showScene = (k) => sceneEls.forEach((el, i) => { el.classList.toggle('on', i === k); el.classList.toggle('past', i < k); });
    showScene(0);
    const { firstItem, step, credits, closable } = ENDING_TIMING;
    ending.items.forEach((_, i) => this._at(firstItem + i * step, () => { showScene(i + 1); dots[i]?.classList.add('lit'); }));
    this._at(credits, () => { showScene(sceneEls.length - 1); this.root.classList.add('ed-final'); });
    this._at(closable, () => { this.closable = true; this.root.querySelector('.ed-tap').hidden = false; });
    this._music();
  }

  close() {
    if (!this.isOpen) return;
    this._stop();
    this.root.hidden = true;
    this.root.replaceChildren();
    const done = this.onDone;
    this.onDone = null;
    done && done();
  }

  _at(ms, fn) { this.timers.push(setTimeout(fn, ms)); }

  _music() {
    if (!sound.isSoundEnabled()) return;
    try {
      const a = new Audio(ENDING_MUSIC);
      a.volume = MUSIC_VOLUME;
      this.audio = a;
      a.play().catch(() => { /* 再生できなくても演出は続ける */ });
    } catch { /* なし */ }
  }

  _stop() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    const a = this.audio;
    this.audio = null;
    if (!a) return;
    // 途中でとじたときは、すっと小さくしてから止める
    const start = a.volume;
    const t0 = performance.now();
    const fade = () => {
      const k = Math.min(1, (performance.now() - t0) / FADE_MS);
      try { a.volume = Math.max(0, start * (1 - k)); } catch { /* iOS は volume を変えられない */ }
      if (k < 1 && !a.paused) requestAnimationFrame(fade);
      else a.pause();
    };
    requestAnimationFrame(fade);
  }
}
