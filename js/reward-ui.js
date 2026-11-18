// 報酬の演出（トロフィー獲得 → 完全制覇 → フルーツ解放 の順に、1 つの流れで見せる）
// 判定は rewards.js。ここは表示だけ。

import * as sound from './sound.js';

function sparks(colors) {
  let html = '';
  for (let i = 0; i < 22; i++) {
    const a = (Math.PI * 2 * i) / 22 + Math.random() * 0.3;
    const d = 80 + Math.random() * 90;
    html += `<span class="spark" style="--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--c:${colors[i % colors.length]};--d:${(Math.random() * 0.2).toFixed(2)}s">${i % 3 === 0 ? '✦' : ''}</span>`;
  }
  return `<div class="rw-sparks" aria-hidden="true">${html}</div>`;
}

export class RewardOverlay {
  /** @param {HTMLElement} root  #reward */
  constructor(root) {
    this.root = root;
    this.card = root.querySelector('.reward-card');
    this.card.addEventListener('click', (e) => this._click(e));
  }

  get isOpen() { return !this.root.hidden; }

  /**
   * @param {{trophies: object[], complete: boolean, fruits: object[]}} rewards
   * @param {{onUseFruit: (id: string) => void, onDone: () => void}} handlers
   */
  show(rewards, { onUseFruit, onDone }) {
    this.steps = [
      ...rewards.trophies.map((t) => ({ kind: 'trophy', t })),
      ...(rewards.complete ? [{ kind: 'complete' }] : []),
      ...(rewards.fruits.length ? [{ kind: 'fruits', fruits: rewards.fruits }] : []),
    ];
    this.onUseFruit = onUseFruit;
    this.onDone = onDone;
    this.index = 0;
    if (!this.steps.length) { onDone(); return; }
    this.root.hidden = false;
    this._render();
  }

  _render() {
    const s = this.steps[this.index];
    const last = this.index === this.steps.length - 1;
    const nextLabel = last ? 'OK！' : 'つぎへ ▶';
    let html = '';
    if (s.kind === 'trophy') {
      html = `
        <p class="rw-label">トロフィー ゲット！</p>
        <div class="rw-big rw-trophy" aria-hidden="true">${s.t.icon}</div>
        <h2 id="reward-title" class="rw-title">${s.t.name}トロフィー ゲット！</h2>
        <p class="rw-sub">${s.t.stars}の50ステージを すべてクリア！</p>
        <div class="rw-actions"><button type="button" class="btn primary big" data-rw="next">${nextLabel}</button></div>`;
    } else if (s.kind === 'complete') {
      html = `
        <p class="rw-label">おめでとう！</p>
        <div class="rw-big rw-trophy" aria-hidden="true">👑</div>
        <h2 id="reward-title" class="rw-title">フルーツめいろ 完全制覇！</h2>
        <p class="rw-sub">全250ステージ クリア達成！</p>
        <div class="rw-actions"><button type="button" class="btn primary big" data-rw="next">${nextLabel}</button></div>`;
    } else if (s.fruits.length === 1) {
      const f = s.fruits[0];
      html = `
        <p class="rw-label">あたらしいフルーツを ゲット！</p>
        <div class="rw-big rw-fruit" aria-hidden="true">${f.emoji}</div>
        <h2 id="reward-title" class="rw-title">${f.name}が なかまになった！</h2>
        <div class="rw-actions">
          <button type="button" class="btn primary big" data-rw="use" data-id="${f.id}">このフルーツを つかう</button>
          <button type="button" class="btn ghost" data-rw="keep">いまのフルーツのまま</button>
        </div>`;
    } else {
      html = `
        <p class="rw-label">あたらしいフルーツを ${s.fruits.length}しゅるい ゲット！</p>
        <div class="rw-fruits">${s.fruits.map((f) => `
          <button type="button" class="rw-pick" data-rw="use" data-id="${f.id}" aria-label="${f.name}をつかう">
            <span class="rw-pick-emoji" aria-hidden="true">${f.emoji}</span><span class="rw-pick-name">${f.name}</span>
          </button>`).join('')}</div>
        <h2 id="reward-title" class="rw-title">${s.fruits.map((f) => f.name).join('と')}が なかまになった！</h2>
        <p class="rw-sub">つかいたいフルーツを タップしてね</p>
        <div class="rw-actions"><button type="button" class="btn ghost" data-rw="keep">いまのフルーツのまま</button></div>`;
    }
    const colors = s.kind === 'fruits' ? [...s.fruits.map((f) => f.color), '#ffd84d', '#ffffff'] : ['#ffd84d', '#ffe066', '#ffffff', '#f5a623'];
    this.card.className = `reward-card rw-${s.kind}`;
    this.card.innerHTML = sparks(colors) + html;
    sound.play('reward');
    this.card.querySelector('[data-rw]')?.focus({ preventScroll: true });
  }

  _click(e) {
    const b = e.target.closest('[data-rw]');
    if (!b) return;
    sound.play('tap');
    if (b.dataset.rw === 'use') this.onUseFruit(b.dataset.id);
    // フルーツはいつも最後の段なので、use / keep で終わり
    if (b.dataset.rw === 'next' && this.index < this.steps.length - 1) { this.index++; this._render(); return; }
    this.root.hidden = true;
    this.card.replaceChildren();
    this.onDone();
  }
}
