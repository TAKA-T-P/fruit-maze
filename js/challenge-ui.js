// タイムアタックの画面の表示（難易度選択・開始前・結果・記録）。判定・記録は challenge*.js。

import { TA_LEVELS, taConfig, challengeName } from './challenge-config.js';
import { titleFor, nextTitle, nextTitleText, titlesOf } from './challenge-titles.js';

const titleLabel = (t) => (t ? `${t.icon} ${t.name}` : 'まだ なし');
const timeText = (sec) => (sec % 60 === 0 ? `${sec / 60}分` : `${sec}秒`);

/** 難易度選択：★・盤面・何分チャレンジ・自己ベスト・称号 */
export function renderTaSelect(listEl, store, selected = 1) {
  listEl.replaceChildren(...TA_LEVELS.map((c) => {
    const rec = store.get(c.level);
    const t = titleFor(c.level, rec.bestClears);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ta-level-btn${t && t.id === 'kaiden' ? ' master' : ''}${c.level === selected ? ' selected' : ''}`;
    btn.dataset.level = c.level;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(c.level === selected));
    btn.innerHTML = `
      <span class="ta-lv-head"><span class="level-stars">${c.stars}</span><span class="level-size">${c.size}×${c.size}</span><span class="ta-lv-time">⏱️ ${challengeName(c.level)}</span></span>
      <span class="ta-lv-rec">自己ベスト <b>${rec.bestClears}</b>問　<span class="ta-lv-title">${titleLabel(t)}</span></span>`;
    btn.setAttribute('aria-label', `${c.stars} ${c.size}×${c.size} ${challengeName(c.level)}。自己ベスト ${rec.bestClears}問。称号 ${t ? t.name : 'なし'}`);
    return btn;
  }));
}

/** せつめい：ルールの説明 */
export function renderTaIntro(el, level, store) {
  const c = taConfig(level);
  const best = store.get(level).bestClears;
  el.innerHTML = `
    <div class="ta-intro-head">
      <span class="level-stars">${c.stars}</span> <span class="level-size">${c.size}×${c.size}</span>
      <h3 class="ta-intro-title">⏱️ ${challengeName(level)}</h3>
      <p class="ta-intro-best">自己ベスト ${best}問　${titleLabel(titleFor(level, best))}</p>
    </div>
    <ul class="ta-rules">
      <li>⏱️ 制限時間は <b>${timeText(c.normalSeconds)}</b>。何問クリアできるかな？</li>
      <li>👑 <b>${c.masterClears}問</b>クリアで 最高の称号「めいろ皆伝」！</li>
      <li>💡 ヒントは つかえないよ（○・× のメモは つかえる）</li>
      <li>🔢 数字を こえても 道を のばせるよ。GOAL で 数字が ぴったりなら クリア！</li>
      <li>🔁 まちがえても 何度でも やり直せるよ</li>
      <li>🏁 時間が 0 になっても、いまの問題は「<b>最終問題</b>」として 少しだけ つづけられるよ</li>
    </ul>`;
}

/** 結果画面 */
export function renderTaResult(el, { level, clears, result, reason }) {
  const c = taConfig(level);
  const t = result.title;
  const next = nextTitle(level, result.best);
  el.innerHTML = `
    <p class="ta-res-label">⏱️ タイムアタック終了！</p>
    <p class="ta-res-level">むずかしさ：<span class="stars">${c.stars}</span>${reason === 'final-cleared' ? '　<span class="ta-res-final">最終問題もクリア！</span>' : ''}</p>
    ${result.newRecord ? '<p class="ta-res-new">NEW RECORD!</p>' : ''}
    <div class="ta-res-stats">
      <div><span class="ta-res-k">今回の記録</span><span class="ta-res-v"><b>${clears}</b>問クリア</span></div>
      <div><span class="ta-res-k">自己ベスト</span><span class="ta-res-v"><b>${result.best}</b>問</span></div>
    </div>
    ${result.firstMaster ? '<p class="ta-res-master">👑 めいろ皆伝 達成！</p>' : ''}
    ${result.newlyComplete ? '<p class="ta-res-master">🌟 タイムアタック完全制覇！</p>' : ''}
    <div class="ta-res-title${result.titleUp ? ' up' : ''}">
      ${result.titleUp ? '<span class="ta-res-up">称号アップ！</span>' : ''}
      <span class="ta-res-title-name">${t ? `${t.icon} ${t.name}` : 'まだ称号はないよ。まずは1問クリアをめざそう！'}</span>
    </div>
    <p class="ta-res-next">${next ? (next.title.id === 'kaiden' ? `あと${next.remaining}問で<br>👑 めいろ皆伝！` : `あと${next.remaining}問で<br>${next.title.icon} ${next.title.name}`) : 'いちばん上の称号だよ！'}</p>`;
}

/** 記録画面 */
export function renderTaRecords(el, store) {
  const rows = TA_LEVELS.map((c) => {
    const rec = store.get(c.level);
    const t = titleFor(c.level, rec.bestClears);
    const ladder = titlesOf(c.level).map((x) => `<span class="ta-ladder-step${rec.bestClears >= x.need ? ' on' : ''}" title="${x.name}：${x.need}問">${x.icon}<small>${x.need}</small></span>`).join('');
    return `
      <div class="ta-rec-card${t && t.id === 'kaiden' ? ' master' : ''}" role="listitem">
        <div class="ta-rec-head"><span class="level-stars">${c.stars}</span><span class="ta-rec-time">⏱️ ${timeText(c.normalSeconds)}</span><span class="ta-rec-best">最高 <b>${rec.bestClears}</b>問</span></div>
        <div class="ta-rec-title">${titleLabel(t)}</div>
        <div class="ta-ladder" aria-hidden="true">${ladder}</div>
        <div class="ta-rec-foot"><span>${nextTitleText(c.level, rec.bestClears)}</span><span>あそんだ回数 ${rec.playCount}回</span></div>
      </div>`;
  }).join('');
  el.innerHTML = `
    ${store.isComplete() ? '<div class="ta-complete"><span class="tc-crown" aria-hidden="true">🌟</span><p class="tc-title">タイムアタック完全制覇！</p><p class="tc-sub">5つの むずかしさで「めいろ皆伝」</p></div>' : ''}
    <div class="ta-rec-list" role="list">${rows}</div>`;
}
