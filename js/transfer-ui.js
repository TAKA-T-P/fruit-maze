// 引継ぎコードの画面（コードをつくる・読みこむ・確認・上書きの確認）。
// コードの生成・解析・保存は transfer-code.js。ここでは表示と操作だけを行う。

import { readRecord, encodeRecord, decodeCode, summarize, buildRestoreData, applyRestore } from './transfer-code.js';

const MSG = {
  invalid: 'このコードは読みこめないよ。コピーしなおしてみてね！',
  'too-long': 'このコードは読みこめないよ。コピーしなおしてみてね！',
  version: 'このコードは、ちがうバージョンのものだよ',
  empty: '引継ぎコードを はりつけてね',
  save: '記録を保存できなかったよ。この端末の記録は そのままだよ',
};
const STARS = ['★', '★★', '★★★', '★★★★', '★★★★★'];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class TransferDialog {
  /**
   * @param {HTMLElement} overlay  #transfer（.modal-overlay）
   * @param {object} o
   * @param {() => Storage|null} o.getBackend  保存先（localStorage）
   * @param {() => void} o.onRestored          復元が終わったあと（再読み込みなど）
   * @param {(text: string) => void} [o.toast]
   * @param {(name: string) => void} [o.sound]
   */
  constructor(overlay, { getBackend, onRestored, toast = () => {}, sound = () => {} }) {
    this.overlay = overlay;
    this.card = overlay.querySelector('.modal-card');
    this.getBackend = getBackend;
    this.onRestored = onRestored;
    this.toast = toast;
    this.sound = sound;
    this.pending = null; // 確認中の記録（まだ保存しない）
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { this.close(); return; }
      const b = e.target.closest('[data-tr]');
      if (!b || b.disabled) return;
      this.sound('tap');
      this._action(b.dataset.tr);
    });
  }

  get isOpen() { return !this.overlay.hidden; }

  /** 📋 引継ぎコードをつくる：今の記録からコードを作って表示する */
  openExport() {
    let code = '';
    try { code = encodeRecord(readRecord(this.getBackend())); } catch { code = ''; }
    this._render(`
      <h2 class="modal-title">📋 引継ぎコード</h2>
      <p class="tr-lead">このコードをコピーして、<br>ほかの端末に送ってね！</p>
      <textarea class="tr-code" readonly rows="5" aria-label="引継ぎコード" spellcheck="false">${esc(code)}</textarea>
      <p class="tr-count">文字数：${code.length}文字</p>
      <p class="tr-note">コードは、いまの記録だよ。このあと あそんだ記録は入らないので、引きつぐ前に もう一度つくってね。</p>
      <p class="tr-status" aria-live="polite"></p>
      <button type="button" class="btn primary" data-tr="copy">📋 コピーする</button>
      <button type="button" class="btn secondary" data-tr="close">とじる</button>`);
    this.code = code;
  }

  /** 📥 引継ぎコードを読みこむ */
  openImport() {
    this.pending = null;
    this._render(`
      <h2 class="modal-title">📥 引継ぎコードを読みこむ</h2>
      <p class="tr-lead">ほかの端末でつくった 引継ぎコードを はりつけてね。</p>
      <textarea class="tr-input" rows="4" aria-label="引継ぎコードを入力" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="FM1-…"></textarea>
      <p class="tr-status error" aria-live="polite"></p>
      <button type="button" class="btn primary" data-tr="check">記録を確認する</button>
      <button type="button" class="btn secondary" data-tr="close">とじる</button>`);
    this.card.querySelector('.tr-input').focus({ preventScroll: true });
  }

  close() {
    this.overlay.hidden = true;
    this.pending = null;
  }

  _render(html) {
    this.card.innerHTML = html;
    this.overlay.hidden = false;
    this.card.scrollTop = 0;
  }

  _status(text, kind = '') {
    const el = this.card.querySelector('.tr-status');
    if (!el) return;
    el.textContent = text;
    el.className = `tr-status ${kind}`;
  }

  _action(name) {
    if (name === 'close' || name === 'cancel') return this.close();
    if (name === 'copy') return this._copy();
    if (name === 'check') return this._check();
    if (name === 'save') return this._confirm();
    if (name === 'back') return this._preview();
    if (name === 'restore') return this._restore();
  }

  async _copy() {
    const ta = this.card.querySelector('.tr-code');
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(this.code); ok = true; }
    } catch { ok = false; }
    if (!ok) {
      // Clipboard API が使えないとき：選んで、昔の方法でコピーする
      try { ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length); ok = document.execCommand('copy'); } catch { ok = false; }
    }
    if (ok) {
      this._status('コードをコピーしたよ！', 'ok');
      this.toast('コードをコピーしたよ！');
    } else {
      ta.focus(); ta.select();
      this._status('コピーできなかったよ。コードを長押しして「コピー」してね', 'error');
    }
  }

  _check() {
    const input = this.card.querySelector('.tr-input').value;
    const r = decodeCode(input);
    if (!r.ok) { this.sound('error'); this._status(MSG[r.error] || MSG.invalid, 'error'); return; }
    this.pending = r.record;
    this._preview();
  }

  /** 読みこんだ内容を見せる（まだ保存しない） */
  _preview() {
    const s = summarize(this.pending);
    const ta = s.taBest.map((n, i) => `<span class="tr-ta-item"><span class="tr-ta-star">${STARS[i]}</span><span><b>${n}</b>問</span></span>`).join('');
    this._render(`
      <h2 class="modal-title">📥 引継ぎする記録</h2>
      <dl class="tr-summary">
        <div class="tr-row"><dt>通常ステージ</dt><dd><b>${s.cleared}</b> / ${s.total}問 クリア</dd></div>
        <div class="tr-row"><dt>ヒントなしクリア</dt><dd><b>${s.hintFree}</b>問</dd></div>
        <div class="tr-row"><dt>フルーツ</dt><dd><b>${s.fruitsUnlocked}</b> / 16しゅるい</dd></div>
        <div class="tr-row"><dt>トロフィー</dt><dd><b>${s.trophies}</b> / 5</dd></div>
        <div class="tr-row"><dt>使っているフルーツ</dt><dd><span class="tr-fruit">${s.fruit.emoji}</span> ${esc(s.fruit.name)}</dd></div>
        <div><dt>タイムアタック（最高記録）</dt><dd class="tr-ta">${ta}</dd></div>
      </dl>
      <button type="button" class="btn primary" data-tr="save">この端末に保存する</button>
      <button type="button" class="btn secondary" data-tr="cancel">キャンセル</button>`);
  }

  /** 上書きの確認 */
  _confirm() {
    this._render(`
      <h2 class="modal-title">⚠️ 記録の上書き</h2>
      <p class="tr-lead">この端末にある記録が、引継ぎコードの記録に かわるよ。よろしいですか？</p>
      <p class="tr-status error" aria-live="polite"></p>
      <button type="button" class="btn primary" data-tr="restore">記録を引きつぐ</button>
      <button type="button" class="btn secondary" data-tr="back">キャンセル</button>`);
  }

  _restore() {
    if (!this.pending) return this.close();
    let res;
    try {
      res = applyRestore(this.getBackend(), buildRestoreData(this.pending));
    } catch {
      res = { ok: false };
    }
    if (!res.ok) { this.sound('error'); this._status(MSG.save, 'error'); return; }
    this.pending = null;
    this.overlay.hidden = true;
    this.onRestored();
  }
}
