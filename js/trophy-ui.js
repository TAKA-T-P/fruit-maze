// トロフィー画面の表示（判定は trophies.js）

/**
 * @param {object} dom  { count, gauge, list, complete }
 * @param {ReturnType<import('./trophies.js').allTrophyStatuses>} statuses
 */
export function renderTrophies(dom, statuses) {
  const got = statuses.filter((s) => s.earned).length;
  dom.count.innerHTML = `トロフィー <b>${got}</b> / ${statuses.length} こ ゲット！`;
  dom.gauge.style.width = `${Math.round((got / statuses.length) * 100)}%`;
  dom.complete.hidden = got < statuses.length;
  dom.list.replaceChildren(...statuses.map((s) => {
    const t = s.trophy;
    const el = document.createElement('div');
    el.className = `trophy-card ${s.earned ? 'earned' : 'locked'}`;
    el.setAttribute('role', 'listitem');
    const pct = s.need ? Math.round((s.current / s.need) * 100) : 0;
    el.innerHTML = `
      <span class="tr-icon" aria-hidden="true">${t.icon}</span>
      <span class="tr-main">
        <span class="tr-name">${t.name}<span class="tr-stars">${t.stars}</span></span>
        <span class="tr-bar"><i style="width:${pct}%"></i></span>
        <span class="tr-progress">${s.earned
          ? '<b class="tr-get">GET!</b> コンプリート！'
          : `${s.current} / ${s.need}　<b>あと${s.remaining}ステージ！</b>`}</span>
      </span>`;
    el.setAttribute('aria-label', `${t.name}トロフィー（${t.stars}）：${s.earned ? 'ゲット' : `${s.current} / ${s.need}、あと${s.remaining}ステージ`}`);
    return el;
  }));
}
