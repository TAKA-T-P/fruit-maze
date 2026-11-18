// ヒントパネル（表示部品）。中身の決定は hint.js の HintSession が行う。
// ゲーム画面とあそびかた画面の両方で使う。

export class HintPanel {
  /**
   * @param {HTMLElement} root  パネルを入れる要素
   * @param {{onMore: () => void, onNext: () => void, onClose: () => void}} handlers
   */
  constructor(root, { onMore, onNext, onClose }) {
    this.root = root;
    root.classList.add('hint-panel');
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'ヒント');
    root.innerHTML = `
      <div class="hint-head">
        <span class="hint-title">💡 <span class="hint-label">ヒント</span></span>
        <span class="hint-steps" aria-hidden="true"><i></i><i></i><i></i></span>
        <button type="button" class="hint-close btn ghost">とじる</button>
      </div>
      <p class="hint-text" aria-live="polite"></p>
      <div class="hint-actions">
        <button type="button" class="btn primary hint-more">もっとヒント ▶</button>
        <button type="button" class="btn secondary hint-next">次のヒントをみる</button>
      </div>`;
    this.textEl = root.querySelector('.hint-text');
    this.labelEl = root.querySelector('.hint-label');
    this.stepEls = [...root.querySelectorAll('.hint-steps i')];
    this.moreBtn = root.querySelector('.hint-more');
    this.nextBtn = root.querySelector('.hint-next');
    this.moreBtn.addEventListener('click', onMore);
    this.nextBtn.addEventListener('click', onNext);
    root.querySelector('.hint-close').addEventListener('click', onClose);
  }

  get isOpen() { return !this.root.hidden; }

  /** @param {ReturnType<import('./hint.js').HintSession['view']>} view */
  render(view) {
    if (!view) return;
    const kind = view.kind;
    this.root.dataset.kind = kind;
    this.labelEl.textContent = kind === 'none' ? 'ヒント' : view.total > 1 ? `ヒント${view.level}` : 'ヒント';
    this.stepEls.forEach((el, i) => {
      el.hidden = kind === 'none';
      el.classList.toggle('on', i < view.level);
    });
    this.textEl.textContent = view.text;
    this.moreBtn.hidden = !view.canMore;
    this.nextBtn.hidden = !view.canNext;
  }

  show() { this.root.hidden = false; }
  hide() { this.root.hidden = true; }
}
