// フルーツずかんの表示と操作（判定は collection.js）

/**
 * @param {object} dom  { count, gauge, grid, detail }（要素）
 * @param {object} o
 * @param {ReturnType<import('./collection.js').allFruitStatuses>} o.statuses
 * @param {string} o.selectedId       選んでいるフルーツ
 * @param {Set<string>} o.newIds      「NEW!」を付けるフルーツ
 * @param {boolean} [o.random]        「ランダム」を選んでいる（このときフルーツのカードには「つかってる」を付けない）
 */
export function renderZukan(dom, { statuses, selectedId, newIds, random = false }) {
  const got = statuses.filter((s) => s.unlocked).length;
  dom.count.innerHTML = `フルーツ <b>${got}</b> / ${statuses.length} しゅるい ゲット！`;
  dom.gauge.style.width = `${Math.round((got / statuses.length) * 100)}%`;
  if (random) selectedId = null;
  // いちばん前：「ランダム」（ゲットしたフルーツから、ステージごとにえらぶ）
  const rnd = document.createElement('button');
  rnd.type = 'button';
  rnd.className = `zukan-card unlocked random-card${random ? ' selected' : ''}`;
  rnd.dataset.id = 'random';
  rnd.setAttribute('role', 'listitem');
  rnd.style.setProperty('--fc', '#9c6ade');
  rnd.style.setProperty('--fl', '#f3ecff');
  rnd.setAttribute('aria-label', `ランダム（ゲットしたフルーツから、ステージごとにえらぶ）${random ? '（つかっている）' : '（タップでセット）'}`);
  rnd.innerHTML = `
    ${random ? '<span class="zc-using">つかってる</span>' : ''}
    <span class="zc-emoji" aria-hidden="true">🎲</span>
    <span class="zc-name">ランダム</span>`;
  dom.grid.replaceChildren(rnd, ...statuses.map((s) => {
    const f = s.fruit;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `zukan-card ${s.unlocked ? 'unlocked' : 'locked'}${f.id === selectedId ? ' selected' : ''}`;
    card.dataset.id = f.id;
    card.setAttribute('role', 'listitem');
    card.style.setProperty('--fc', f.color);
    card.style.setProperty('--fl', f.light);
    card.setAttribute('aria-label', s.unlocked
      ? `${f.name}${f.id === selectedId ? '（つかっているフルーツ）' : '（タップでセット）'}`
      : `${f.name}（まだ。${s.condition}。いま ${s.current} / ${s.need}）`);
    const pct = s.need ? Math.round((s.current / s.need) * 100) : 100;
    card.innerHTML = `
      <span class="zc-no">${f.order}</span>
      ${newIds.has(f.id) && s.unlocked ? '<span class="zc-new">NEW!</span>' : ''}
      ${f.id === selectedId ? '<span class="zc-using">つかってる</span>' : ''}
      <span class="zc-emoji" aria-hidden="true">${f.emoji}</span>
      ${s.unlocked ? '' : '<span class="zc-lock" aria-hidden="true">🔒</span>'}
      <span class="zc-name">${f.name}</span>
      ${s.unlocked ? '' : `<span class="zc-progress">${s.current} / ${s.need}</span><span class="zc-bar"><i style="width:${pct}%"></i></span>`}`;
    return card;
  }));
}

/** 未解放のフルーツをタップしたときの説明 */
export function lockedDetail(s) {
  return `<span class="zd-emoji" aria-hidden="true">${s.fruit.emoji}</span><b>${s.fruit.name}</b>：${s.condition}<br>${s.hint}（${s.current} / ${s.need}）`;
}
