// ヒントパネル（表示部品）。中身の決定は hint.js の HintSession が行う。
// ゲーム画面とあそびかた画面の両方で使う。
// 小さく収めるため、ボタンは見出しの行に「次へ」「とじる」の 2 つだけ置く。
//   次へ … ヒント1・2のときは次の段階へ、ヒント3のときは別の推理（次のヒント）へ

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
        <button type="button" class="btn primary hint-forward">次へ ▶</button>
        <button type="button" class="hint-close btn ghost">とじる</button>
      </div>
      <p class="hint-text" aria-live="polite"></p>`;
    this.textEl = root.querySelector('.hint-text');
    this.labelEl = root.querySelector('.hint-label');
    this.stepEls = [...root.querySelectorAll('.hint-steps i')];
    this.forwardBtn = root.querySelector('.hint-forward');
    this.view = null;
    this.forwardBtn.addEventListener('click', () => {
      if (!this.view) return;
      if (this.view.canMore) onMore();
      else if (this.view.canNext) onNext();
    });
    root.querySelector('.hint-close').addEventListener('click', onClose);
  }

  get isOpen() { return !this.root.hidden; }

  /** @param {ReturnType<import('./hint.js').HintSession['view']>} view */
  render(view) {
    if (!view) return;
    this.view = view;
    const kind = view.kind;
    this.root.dataset.kind = kind;
    this.labelEl.textContent = kind === 'none' || view.total <= 1 ? 'ヒント' : `ヒント${view.level}`;
    this.stepEls.forEach((el, i) => {
      el.hidden = kind === 'none';
      el.classList.toggle('on', i < view.level);
    });
    this.textEl.textContent = view.text;
    this.forwardBtn.hidden = !view.canMore && !view.canNext;
    this.forwardBtn.setAttribute('aria-label', view.canMore ? 'もっとくわしいヒントへ' : '次のヒントへ');
  }

  show() { this.root.hidden = false; }
  hide() { this.root.hidden = true; }
}
