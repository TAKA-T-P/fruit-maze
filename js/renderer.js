// 盤面の描画（ゲームの状態を読み取って DOM に反映するだけ。判定は行わない）

const LINK_DIR = { '-1,0': 'up', '1,0': 'down', '0,-1': 'left', '0,1': 'right' };
const SIDE_TO_DIR = { top: 'up', bottom: 'down', left: 'left', right: 'right' };
const LABEL_SIZE = 1.0;   // スタート/ゴールの列・行の幅（マス何個分）
const NO_LABEL_SIZE = 0.15;
const CLUE_SIZE = 0.95;
const LABEL_MIN_PX = 44;  // 左右のラベルは、マスが小さくても START / GOAL の文字が入る幅を確保する

/** ラベルの矢印：スタートは盤面へ入る向き、ゴールは盤面から出る向き */
const ARROWS = {
  start: { left: '▶', right: '◀', top: '▼', bottom: '▲' },
  goal: { left: '◀', right: '▶', top: '▲', bottom: '▼' },
};

export class BoardRenderer {
  /**
   * @param {HTMLElement} host  盤面を入れる要素
   * @param {object} puzzle
   * @param {{emoji: string, color: string, light: string}} fruit
   * @param {{clueStyle?: 'target'|'fraction'}} [opt]
   *   clueStyle … 行・列の数字の表示。'target'＝「3」のように指定数だけを大きく（既定）、'fraction'＝「1/3」
   */
  constructor(host, puzzle, fruit, { clueStyle = 'target' } = {}) {
    this.host = host;
    this.puzzle = puzzle;
    this.fruit = fruit;
    this.cellEls = [];
    this.rowClueEls = [];
    this.colClueEls = [];
    this._build();
    this.setClueStyle(clueStyle);
  }

  /** 行・列の数字の表示を切り替える（'target' ⇔ 'fraction'） */
  setClueStyle(style) {
    this.clueStyle = style === 'fraction' ? 'fraction' : 'target';
    this.board.classList.toggle('clue-target', this.clueStyle === 'target');
  }

  _build() {
    const { rows, cols, grid, start, goal } = this.puzzle;
    const board = document.createElement('div');
    board.className = 'board';
    board.style.setProperty('--fruit-color', this.fruit.color);
    board.style.setProperty('--fruit-light', this.fruit.light);

    const has = (side) => start.side === side || goal.side === side;
    this.trackFactors = {
      top: has('top') ? LABEL_SIZE : NO_LABEL_SIZE,
      bottom: has('bottom') ? LABEL_SIZE : NO_LABEL_SIZE,
      left: has('left') ? LABEL_SIZE : NO_LABEL_SIZE,
      right: has('right') ? LABEL_SIZE : NO_LABEL_SIZE,
    };
    const f = this.trackFactors;
    const t = (x) => `calc(var(--cell) * ${x})`;
    const side = (x) => (x === LABEL_SIZE ? `max(${t(x)}, ${LABEL_MIN_PX}px)` : t(x));
    board.style.gridTemplateColumns = `${side(f.left)} repeat(${cols}, var(--cell)) ${t(CLUE_SIZE)} ${side(f.right)}`;
    board.style.gridTemplateRows = `${t(f.top)} ${t(CLUE_SIZE)} repeat(${rows}, var(--cell)) ${t(f.bottom)}`;

    const place = (el, row, col) => { el.style.gridRow = String(row); el.style.gridColumn = String(col); board.appendChild(el); };

    // 列の数字（上側）
    for (let c = 0; c < cols; c++) {
      const el = document.createElement('div');
      el.className = 'clue clue-col';
      el.setAttribute('aria-label', `${c + 1}列め`);
      place(el, 2, c + 2);
      this.colClueEls.push(el);
    }
    // マス
    for (let r = 0; r < rows; r++) {
      const rowEls = [];
      for (let c = 0; c < cols; c++) {
        const el = document.createElement('div');
        const isFruit = grid[r][c] === 1;
        el.className = isFruit ? 'cell fruit' : 'cell blank';
        el.dataset.row = r; el.dataset.col = c;
        if (isFruit) {
          const span = document.createElement('span');
          span.className = 'fruit-emoji';
          span.textContent = this.fruit.emoji;
          el.appendChild(span);
          const mark = document.createElement('span'); // 推理メモの ○・× 表示
          mark.className = 'memo-mark';
          mark.setAttribute('aria-hidden', 'true');
          el.appendChild(mark);
        }
        // START・GOAL は必ず通るので、はじめから ○ を表示する（メモとしては編集できない）
        if (r === start.row && c === start.col) el.classList.add('start', 'end-circle');
        if (r === goal.row && c === goal.col) el.classList.add('goal', 'end-circle');
        place(el, r + 3, c + 2);
        rowEls.push(el);
      }
      this.cellEls.push(rowEls);
      // 行の数字（右側）
      const clue = document.createElement('div');
      clue.className = 'clue clue-row';
      clue.setAttribute('aria-label', `${r + 1}行め`);
      place(clue, r + 3, cols + 2);
      this.rowClueEls.push(clue);
    }
    // スタート・ゴールのラベル
    for (const kind of ['start', 'goal']) {
      const pt = this.puzzle[kind];
      const el = document.createElement('div');
      el.className = `edge-label ${kind} side-${pt.side}`;
      const arrow = `<span class="arrow">${ARROWS[kind][pt.side]}</span>`;
      const text = `<span class="text">${kind === 'start' ? 'START' : 'GOAL'}</span>`;
      // 矢印がマス側に来るように並べる
      el.innerHTML = (pt.side === 'left' || pt.side === 'top') ? text + arrow : arrow + text;
      const pos = {
        top: [1, pt.col + 2], bottom: [rows + 3, pt.col + 2],
        left: [pt.row + 3, 1], right: [pt.row + 3, cols + 3],
      }[pt.side];
      place(el, pos[0], pos[1]);
      // 右側・上側のラベルは数字の列／行をはさむので、つなぎの点線を入れて対応を分かりやすくする
      if (pt.side === 'right' || pt.side === 'top') {
        const bridge = document.createElement('div');
        bridge.className = `edge-bridge ${kind} ${pt.side === 'top' ? 'vertical' : ''}`;
        if (pt.side === 'right') place(bridge, pt.row + 3, cols + 2);
        else place(bridge, 2, pt.col + 2);
      }
    }

    // メッセージ・演出用のレイヤー
    this.fx = document.createElement('div');
    this.fx.className = 'board-fx';
    board.appendChild(this.fx);

    this.board = board;
    this.host.replaceChildren(board);
  }

  /** 表示領域に合わせてマスの大きさを決める */
  fit(maxWidth, maxHeight, { min = 30, max = 84 } = {}) {
    const f = this.trackFactors;
    const { rows, cols } = this.puzzle;
    const hUnits = rows + CLUE_SIZE + f.top + f.bottom;
    // 横方向：左右のラベル列は「マス 1 個分」か LABEL_MIN_PX の大きいほう
    const lr = [f.left, f.right];
    let widthCell = maxWidth / (cols + CLUE_SIZE + f.left + f.right);
    if (lr.some((x) => x === LABEL_SIZE && widthCell * x < LABEL_MIN_PX)) {
      const fixedPx = lr.filter((x) => x === LABEL_SIZE).length * LABEL_MIN_PX;
      const units = cols + CLUE_SIZE + lr.filter((x) => x !== LABEL_SIZE).reduce((a, b) => a + b, 0);
      widthCell = (maxWidth - fixedPx) / units;
    }
    const cell = Math.floor(Math.max(min, Math.min(max, widthCell, maxHeight / hUnits)));
    this.board.style.setProperty('--cell', `${cell}px`);
    if (this.guide) this._drawGuide(); // マスの大きさが変わったらガイドも描き直す
    return cell;
  }

  /**
   * ゲームの状態を盤面に反映する
   * @param {import('./game.js').PuzzleGame} game
   * @param {import('./memo.js').MemoBoard} [memo]  推理メモ（ルートが通っているマスではルート表示を優先）
   */
  update(game, memo = null) {
    const { rows, cols, start, goal } = this.puzzle;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const el = this.cellEls[r][c];
        el.classList.remove('visited', 'head', 'link-up', 'link-down', 'link-left', 'link-right');
        el.style.removeProperty('--order');
        const v = memo && !game.isVisited(r, c) ? memo.get(r, c) : 0;
        el.classList.toggle('memo-on', v === 1);
        el.classList.toggle('memo-off', v === 2);
      }
    }
    const route = game.route;
    route.forEach(([r, c], i) => {
      const el = this.cellEls[r][c];
      el.classList.add('visited');
      el.style.setProperty('--order', i);
      for (const nb of [route[i - 1], route[i + 1]]) {
        if (!nb) continue;
        el.classList.add(`link-${LINK_DIR[`${nb[0] - r},${nb[1] - c}`]}`);
      }
    });
    // スタートは常に外側の START とつなぐ。ゴールは到達したら GOAL とつなぐ。
    this.cellEls[start.row][start.col].classList.add(`link-${SIDE_TO_DIR[start.side]}`);
    const [hr, hc] = game.head;
    if (hr === goal.row && hc === goal.col) {
      this.cellEls[goal.row][goal.col].classList.add(`link-${SIDE_TO_DIR[goal.side]}`);
    }
    this.cellEls[hr][hc].classList.add('head');

    for (let r = 0; r < rows; r++) this._setClue(this.rowClueEls[r], game.rowState(r));
    for (let c = 0; c < cols; c++) this._setClue(this.colClueEls[c], game.colState(c));

    this.board.classList.toggle('at-goal', game.status === 'at-goal');
    this.board.classList.toggle('cleared', game.status === 'cleared');
    this._lastRoute = game.route;
    if (this.guide) this._drawGuide();
  }

  _setClue(el, { count, clue, done }) {
    const html = `<span class="clue-inner"><span class="count">${count}</span><span class="slash">/</span><span class="target">${clue}</span></span>`;
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
    el.classList.toggle('done', done);
  }

  /** 数字の超過：該当する行・列の数字を赤く点滅させる */
  flashOverflow({ row, col, overRow, overCol }) {
    if (overRow) restartAnimation(this.rowClueEls[row], 'flash');
    if (overCol) restartAnimation(this.colClueEls[col], 'flash');
    restartAnimation(this.cellEls[row][col], 'denied');
  }

  /** 無効な操作（空白・通過済みなど）を軽く知らせる */
  nudge(row, col) {
    const el = this.cellEls[row] && this.cellEls[row][col];
    if (el) restartAnimation(el, 'nudge');
  }

  /** クリア演出：キラキラのパーティクル＋CLEAR! */
  celebrate() {
    const burst = document.createElement('div');
    burst.className = 'clear-burst';
    burst.innerHTML = '<div class="clear-text">CLEAR!</div>';
    const colors = ['#ffd84d', '#ff7a93', '#7ed957', '#6cc7ff', '#ffffff', this.fruit.color];
    for (let i = 0; i < 28; i++) {
      const s = document.createElement('span');
      s.className = 'spark';
      const angle = (Math.PI * 2 * i) / 28 + Math.random() * 0.3;
      const dist = 90 + Math.random() * 120;
      s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      s.style.setProperty('--c', colors[i % colors.length]);
      s.style.setProperty('--d', `${Math.random() * 0.15}s`);
      s.textContent = i % 3 === 0 ? '✦' : '';
      burst.appendChild(s);
    }
    this.fx.replaceChildren(burst);
  }

  clearFx() { this.fx.replaceChildren(); }

  /**
   * なぞる練習用のガイド（点線）。path は [[row, col], ...]。null で消す。
   * プレイヤーがなぞり終えた部分の点線は消え、残りだけを表示する。
   */
  setGuide(path) {
    this.guide = path || null;
    this._drawGuide();
  }

  _drawGuide() {
    if (!this.guide) {
      this.guideEl?.remove();
      this.guideEl = null;
      return;
    }
    const NS = 'http://www.w3.org/2000/svg';
    if (!this.guideEl) {
      this.guideEl = document.createElementNS(NS, 'svg');
      this.guideEl.classList.add('route-guide');
      this.guideEl.setAttribute('aria-hidden', 'true');
      this.board.appendChild(this.guideEl);
    }
    // なぞり終えたところ（ガイドと同じ順に通っている部分）を数える
    const route = this._lastRoute || [];
    let k = 0;
    while (k < route.length && k < this.guide.length && route[k][0] === this.guide[k][0] && route[k][1] === this.guide[k][1]) k++;
    const rest = this.guide.slice(Math.max(0, k - 1));
    const svg = this.guideEl;
    const w = this.board.clientWidth, h = this.board.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    if (rest.length < 2 || !w) { svg.replaceChildren(); return; }
    const pts = rest.map(([r, c]) => {
      const el = this.cellEls[r][c];
      return [el.offsetLeft + el.offsetWidth / 2, el.offsetTop + el.offsetHeight / 2];
    });
    const size = this.cellEls[0][0].offsetWidth || 40;
    const line = document.createElementNS(NS, 'polyline');
    line.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
    line.setAttribute('stroke-width', String(Math.max(3, size * 0.11)));
    line.setAttribute('stroke-dasharray', `${size * 0.16} ${size * 0.14}`);
    const dots = pts.slice(1).map(([x, y]) => {
      const d = document.createElementNS(NS, 'circle');
      d.setAttribute('cx', x); d.setAttribute('cy', y); d.setAttribute('r', String(Math.max(3, size * 0.08)));
      return d;
    });
    svg.replaceChildren(line, ...dots);
  }

  /**
   * ヒントの強調表示（hint.js の highlight）。表示するだけで、ルートやメモは変えない。
   *   lines → 行・列の帯（淡い黄色） / clues・cells → 注目（オレンジの枠） / marks → 確定するマス（緑・赤・青の点線）
   */
  showHint(h) {
    this.clearHint();
    if (!h) return;
    const add = (el, cls) => { if (el) { el.classList.add(cls); this._hinted.push([el, cls]); } };
    for (const L of h.lines || []) {
      const n = L.kind === 'row' ? this.puzzle.cols : this.puzzle.rows;
      for (let k = 0; k < n; k++) add(L.kind === 'row' ? this.cellEls[L.index][k] : this.cellEls[k][L.index], 'hint-band');
      add(L.kind === 'row' ? this.rowClueEls[L.index] : this.colClueEls[L.index], 'hint-band');
    }
    for (const L of h.clues || []) add(L.kind === 'row' ? this.rowClueEls[L.index] : this.colClueEls[L.index], 'hint-focus');
    for (const { row, col } of h.cells || []) add(this.cellEls[row]?.[col], 'hint-focus');
    for (const { row, col, tone } of h.marks || []) add(this.cellEls[row]?.[col], `hint-mark-${tone}`);
    this.board.classList.add('hinting');
    this._hinted.push([this.board, 'hinting']);
  }

  clearHint() {
    for (const [el, cls] of this._hinted || []) el.classList.remove(cls);
    this._hinted = [];
  }

  /** 画面座標 → マス（中心から一定距離内のときだけ返す。角での誤判定を防ぐ） */
  cellFromPoint(clientX, clientY, tolerance = 0.5) {
    const { rows, cols } = this.puzzle;
    const first = this.cellEls[0][0].getBoundingClientRect();
    const size = first.width;
    if (!size) return null;
    const x = (clientX - first.left) / size;
    const y = (clientY - first.top) / size;
    const col = Math.floor(x), row = Math.floor(y);
    if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
    const dx = Math.abs(x - (col + 0.5)), dy = Math.abs(y - (row + 0.5));
    if (dx > tolerance || dy > tolerance) return null;
    return { row, col };
  }
}

function restartAnimation(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // リフローしてアニメーションをやり直す
  el.classList.add(cls);
  clearTimeout(el[`_${cls}Timer`]);
  el[`_${cls}Timer`] = setTimeout(() => el.classList.remove(cls), 700);
}
