// あそびかた（6 ページのチュートリアル）。盤面は本編と同じエンジン・描画・操作・メモ・ヒントを使う。
// 練習の結果はクリア記録に入れない（storage を使わない）。
//
//   1 数字の意味 / 2 ルートをつなごう / 3 通れない道 / 4 ○印をつけよう
//   5 ×印をつけよう / 6 ミニチャレンジ（ヒントの使い方もここで説明）
// 操作ボタンはプレイ画面と同じ 5ボタン（ルート／○／×／消す／💡）。

import { PuzzleGame, STATUS, MOVE } from './game.js';
import { BoardRenderer } from './renderer.js';
import { BoardControls } from './controls.js';
import { MemoBoard, MEMO } from './memo.js';
import { HintSession, lineName } from './hint.js';
import { HintPanel } from './hint-ui.js';
import { deduce } from './deduce.js';
import * as sound from './sound.js';

/** 推理の 1 段階目で、指定の規則で決まるマスがいちばん多い行・列 */
function firstLineGroup(puzzle, rule) {
  const groups = {};
  for (const s of deduce(puzzle).steps) {
    if (s.wave !== 1 || s.rule !== rule) continue;
    const L = s.reason.line;
    const k = `${L.kind}${L.index}`;
    (groups[k] ||= { line: L, clue: s.reason.clue, cells: [] }).cells.push([s.row, s.col]);
  }
  return Object.values(groups).sort((a, b) => b.cells.length - a.cells.length)[0] || null;
}

const has = (cells, r, c) => cells.some(([a, b]) => a === r && b === c);

/**
 * ③「通れない道」の説明用の小さな図（HTML）。
 * @param {object} o
 * @param {number} o.rows / o.cols   マスの数
 * @param {number[][]} [o.route]      通った道（[row, col] の順）
 * @param {number[][]} [o.blanks]     何もないマス
 * @param {number[]} [o.from] / [o.to] 進もうとして進めない方向（赤い点線の矢印）。to には ✕ を付ける
 * @param {{col:number, value:number}} [o.clue]  列の上に出す数字
 * @param {string} o.caption         図の下の説明
 */
function miniIllust({ rows, cols, route = [], blanks = [], from, to, clue, caption, fruit }) {
  const S = 30; // マスの大きさ（px）
  const isRoute = (r, c) => has(route, r, c);
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const blank = has(blanks, r, c);
    const cls = ['mini-cell', blank ? 'blank' : '', isRoute(r, c) ? 'on' : '', to && to[0] === r && to[1] === c ? 'x' : ''].join(' ');
    cells.push(`<span class="${cls}">${blank ? '' : fruit}</span>`);
  }
  const ctr = ([r, c]) => [(c + 0.5) * S, (r + 0.5) * S];
  const path = route.length > 1 ? `<polyline class="mini-route" points="${route.map((x) => ctr(x).join(',')).join(' ')}"/>` : '';
  const arrow = from && to ? `<line class="mini-ng" x1="${ctr(from)[0]}" y1="${ctr(from)[1]}" x2="${ctr(to)[0]}" y2="${ctr(to)[1]}"/>` : '';
  const clueRow = clue ? `<div class="mini-clues" style="grid-template-columns: repeat(${cols}, ${S}px)">${
    Array.from({ length: cols }, (_, c) => `<span class="${c === clue.col ? 'mini-clue' : ''}">${c === clue.col ? clue.value : ''}</span>`).join('')}</div>` : '';
  return `<figure class="mini">
    ${clueRow}
    <div class="mini-board" style="width:${cols * S}px; height:${rows * S}px">
      <div class="mini-grid" style="grid-template-columns: repeat(${cols}, ${S}px)">${cells.join('')}</div>
      <svg class="mini-svg" viewBox="0 0 ${cols * S} ${rows * S}" aria-hidden="true">${path}${arrow}</svg>
    </div>
    <figcaption>${caption}</figcaption>
  </figure>`;
}

export class HowTo {
  /**
   * @param {HTMLElement} root     #screen-howto
   * @param {{pages: Record<string, object>}} data  data/tutorial.json
   * @param {object} fruit
   * @param {{getClueStyle?: () => 'target'|'fraction'}} [opt]  行・列の数字の表示（設定に合わせる）
   */
  constructor(root, data, fruit, { getClueStyle = () => 'target' } = {}) {
    this.root = root;
    this.fruit = fruit;
    this.getClueStyle = getClueStyle;
    const P = data.pages || {};
    this.puzzles = { route: P.route, deduce: P.deduce || P.route, memo: P.memo || P.route, hint: P.hint || P.route, challenge: P.challenge || P.route };
    this.boardHost = root.querySelector('.howto-board');
    this.titleEl = root.querySelector('.howto-title');
    this.textEl = root.querySelector('.howto-text');
    this.taskEl = root.querySelector('.howto-task');
    this.stepEl = root.querySelector('.howto-step');
    this.dotsEl = root.querySelector('.howto-dots');
    this.toolsEl = root.querySelector('.howto-tools');
    this.prevBtn = root.querySelector('[data-howto="prev"]');
    this.nextBtn = root.querySelector('[data-howto="next"]');
    this.mode = 'route';
    this.game = null; this.memo = null; this.renderer = null; this.hint = null;

    this.hintPanel = new HintPanel(root.querySelector('.howto-hint'), {
      onMore: () => { sound.play('tap'); this._renderHint(this.hint.more()); },
      onNext: () => { sound.play('tap'); this._renderHint(this.hint.next(this._board())); },
      onClose: () => { sound.play('tap'); this._closeHint(); },
    });

    this.controls = new BoardControls(this.boardHost, {
      getGame: () => this.game,
      getRenderer: () => this.renderer,
      getMode: () => this.mode,
      getMemo: () => this.memo,
      onResult: (res, source) => { sound.unlockAudio(); this._onResult(res, source); },
      onMemo: (cell, v) => { sound.unlockAudio(); sound.play('tap'); this.page.onMemo?.(cell, v); this.refresh(); },
      onUndoKey: () => this._undo(),
      isBlocked: () => this.hintPanel.isOpen,
      onBlocked: () => this._closeHint(),
    });

    this.toolsEl.addEventListener('click', (e) => {
      const m = e.target.closest('.five-btn');
      if (m) {
        if (m.disabled) return;
        sound.play('tap');
        this._setMode(m.dataset.mode);
        return;
      }
      const t = e.target.closest('[data-tool]');
      if (!t || t.disabled || t.dataset.tool === 'mode') return;
      sound.play('tap');
      if (t.dataset.tool === 'reset') { this.game.reset(); this.memo.clear(); this.page.onReset?.(); this.controls.setEnabled(true); this.renderer.clearFx(); this.refresh(); }
      if (t.dataset.tool === 'hint') this._openHint();
    });

    this.pages = this._buildPages();
    this.index = 0;
    this.dotsEl.innerHTML = this.pages.map(() => '<span class="dot"></span>').join('');
    this.prevBtn.addEventListener('click', () => { sound.play('tap'); this.go(this.index - 1); });
    this.nextBtn.addEventListener('click', () => {
      sound.play('tap');
      if (this.index < this.pages.length - 1) this.go(this.index + 1);
      else this.onFinish && this.onFinish();
    });
  }

  // ------------------------------------------------------------------
  _buildPages() {
    const pz = this.puzzles;
    const R = pz.route;
    const bigRow = R.rowClues.indexOf(Math.max(...R.rowClues));
    const allLine = firstLineGroup(pz.deduce, 'line-all');
    const zeroLine = firstLineGroup(pz.memo, 'line-zero');

    return [
      {
        title: '① 数字の意味',
        puzzle: R, interactive: false, tools: [], showSolution: true,
        text: `右の数字は、その<b>行（よこ）</b>で通るフルーツの数。上の数字は、その<b>列（たて）</b>で通る数だよ。下は START から GOAL までの正解の道。どの行・列も、通ったフルーツの数が数字と同じになっているね！`,
        setup: () => this.renderer.showHint({ lines: [{ kind: 'row', index: bigRow }], clues: [{ kind: 'row', index: bigRow }] }),
        task: () => `黄色の行の数字は「${R.rowClues[bigRow]}」。この行では <b>${R.rowClues[bigRow]}つ</b> のフルーツを通っているよ！<br><small>START と GOAL の ○ は「かならず通る」印だよ。</small>`,
      },
      {
        title: '② ルートをつなごう',
        puzzle: R, tools: ['reset'],
        text: '<b>START</b> から、うすい点線の上を指でなぞって <b>GOAL</b> までつないでみよう！ となりのフルーツをタップしても進めるよ。',
        setup: () => this.renderer.setGuide(R.solution),
        task: () => {
          if (this.game.status === STATUS.CLEARED) return '<span class="ok">✓ できた！ すべての数字がそろったね</span>';
          if (this.game.status === STATUS.AT_GOAL) return '数字がそろっていないよ。ひとつ前のフルーツをタップして、道をなおそう';
          return 'まちがえたら、ひとつ前のフルーツをタップするともどれるよ';
        },
      },
      {
        title: '③ 通れない道',
        puzzle: R, tools: [],
        text: 'ななめに進んだり、一度通ったマスをもう一度通ることはできないよ。何もないマスにも進めないよ。<br>その列の数字をこえて進むこともできないよ。例えば、<b>②</b>の列で3マス目には進めないよ。',
        illust: () => `<div class="mini-list">${[
          miniIllust({ rows: 2, cols: 2, route: [[1, 0]], from: [1, 0], to: [0, 1], fruit: this.fruit.emoji, caption: 'ななめには進めない' }),
          miniIllust({ rows: 2, cols: 2, route: [[0, 0], [0, 1], [1, 1], [1, 0]], from: [1, 0], to: [0, 0], fruit: this.fruit.emoji, caption: '一度通ったマスは通れない' }),
          miniIllust({ rows: 2, cols: 2, route: [[1, 0]], blanks: [[1, 1]], from: [1, 0], to: [1, 1], fruit: this.fruit.emoji, caption: '何もないマスには進めない' }),
          miniIllust({ rows: 3, cols: 1, route: [[0, 0], [1, 0]], clue: { col: 0, value: 2 }, from: [1, 0], to: [2, 0], fruit: this.fruit.emoji, caption: '2の列で3マス目には進めない' }),
        ].join('')}</div>`,
        task: () => '<small>進めないマスに進もうとすると、数字が赤く光ったり、フルーツがゆれたりして教えてくれるよ。</small>',
      },
      {
        title: '④ ○印をつけよう',
        puzzle: pz.deduce, tools: ['mode'],
        text: allLine
          ? `${lineName(allLine.line)}には、フルーツが${allLine.cells.length}個あって、数字も${allLine.clue}。だから、全部通るね！ 下の「○」ボタンを押して、○を付けよう！`
          : '下の「○」ボタンを押して、通ると思うマスに ○ を付けてみよう。',
        setup: () => allLine && this.renderer.showHint({ lines: [allLine.line], clues: [allLine.line] }),
        task: () => {
          if (!allLine) return '';
          const n = allLine.cells.filter(([r, c]) => this.memo.get(r, c) === MEMO.ON).length;
          if (n === allLine.cells.length) return '<span class="ok">✓ 正解！ 数字から、かならず通るマスが分かったね</span>';
          if (this.mode !== 'memo-on') return '下の「○」ボタンを押してね';
          return `黄色の${allLine.line.kind === 'row' ? '行' : '列'}のフルーツをタップして ○ を付けよう。なぞると続けて付けられるよ（○ ${n} / ${allLine.cells.length}）`;
        },
      },
      {
        title: '⑤ ×印をつけよう',
        puzzle: pz.memo, tools: ['mode'],
        text: zeroLine
          ? `${lineName(zeroLine.line)}の数字は0。だから、どのフルーツも通らないね。下の「×」ボタンを押して、×を付けよう！`
          : '下の「×」ボタンを押して、通らないと思うマスに × を付けてみよう。',
        setup: () => zeroLine && this.renderer.showHint({ lines: [zeroLine.line], clues: [zeroLine.line] }),
        task: () => {
          if (!zeroLine) return '';
          const n = zeroLine.cells.filter(([r, c]) => this.memo.get(r, c) === MEMO.OFF).length;
          if (n === zeroLine.cells.length) return '<span class="ok">✓ できた！ ○や×はメモだから、あとで「消す」で消すこともできるよ</span>';
          if (this.mode !== 'memo-off') return '下の「×」ボタンを押してね';
          return `フルーツをタップして × を付けよう。なぞると続けて付けられるよ（× ${n} / ${zeroLine.cells.length}）`;
        },
      },
      {
        title: '⑥ ミニチャレンジ',
        puzzle: pz.challenge, tools: ['mode', 'hint', 'reset'],
        text: 'さいごに 4×4 の問題を解いてみよう！<br>💡を押すとヒントが見られるよ。',
        task: () => {
          if (this.game.status === STATUS.CLEARED) return '<span class="ok big">🎉 じゅんびOK！ フルーツめいろに挑戦しよう！</span>';
          if (this.game.status === STATUS.AT_GOAL) return '数字がそろっていないよ。ひとつ前のフルーツをタップして、道をなおそう';
          return '<span class="one-line">STARTからGOALまで、数字をそろえてつなごう</span>';
        },
      },
    ];
  }

  // ------------------------------------------------------------------
  open() { this.go(0); }
  close() { this._closeHint(); }

  go(i) {
    this._closeHint();
    this.index = Math.max(0, Math.min(this.pages.length - 1, i));
    const page = this.pages[this.index];
    this.page = page;
    this.titleEl.textContent = page.title;
    this.textEl.innerHTML = page.text;
    this.stepEl.textContent = `${this.index + 1} / ${this.pages.length}`;
    [...this.dotsEl.children].forEach((d, j) => d.classList.toggle('on', j === this.index));
    this.prevBtn.disabled = this.index === 0;
    this.nextBtn.textContent = this.index === this.pages.length - 1 ? 'はじめる ▶' : 'つぎへ ▶';
    // ページを切り替えたら、上下のスクロール位置を一番上にもどす
    this.root.querySelector('.howto-body').scrollTop = 0;
    this.root.scrollTop = 0;
    window.scrollTo(0, 0);

    const puzzle = page.puzzle;
    this.game = new PuzzleGame(puzzle);
    this.memo = new MemoBoard(puzzle, page.memo || {});
    this.hint = new HintSession(puzzle);
    if (page.illust) {
      // 説明とイラストだけのページ（盤面は操作しない）
      this.renderer = null;
      this.boardHost.innerHTML = page.illust();
      this.controls.setEnabled(false);
    } else {
      this.renderer = new BoardRenderer(this.boardHost, puzzle, this.fruit, { clueStyle: this.getClueStyle() });
      this.renderer.board.classList.toggle('static', page.interactive === false);
      this.controls.setEnabled(page.interactive !== false);
      // 正解ルートを見せるページ：正解の道をたどった状態にする
      if (page.showSolution) for (const [r, c] of puzzle.solution.slice(1)) this.game.moveTo(r, c);
    }
    for (const el of this.toolsEl.querySelectorAll('[data-tool]')) el.hidden = !(page.tools || []).includes(el.dataset.tool);
    this.toolsEl.hidden = !(page.tools || []).length;
    this.fit();
    if (this.renderer) page.setup?.(); // ページの状態を先に用意してから
    this._setMode(page.mode || 'route', false);
    this.refresh();
  }

  refresh() {
    if (!this.game) return;
    const cleared = this.game.status === STATUS.CLEARED;
    if (this.renderer) {
      this.renderer.update(this.game, this.memo);
      // 正解ルートを見せるだけのページでは、クリアの演出（フルーツが跳ねる）はしない
      if (this.page.showSolution) this.renderer.board.classList.remove('cleared');
    }
    const tool = (name) => this.toolsEl.querySelector(`[data-tool="${name}"]`);
    tool('reset').disabled = this.game.route.length <= 1 && !this.memo.hasAny();
    tool('hint').disabled = cleared;
    this.toolsEl.querySelectorAll('.five-btn').forEach((b) => { b.disabled = cleared; });
    this.taskEl.innerHTML = this.page.task ? this.page.task() : '';
  }

  fit() {
    if (!this.renderer) return;
    const w = this.boardHost.clientWidth || 300;
    const h = Math.max(170, Math.min(window.innerHeight * 0.36, 300));
    this.renderer.fit(w, h, { min: 26, max: 60 });
  }

  // ---- 操作 ----
  _onResult(res, source) {
    const g = this.game;
    if (res.type === MOVE.MOVED) {
      if (g.status === STATUS.CLEARED) {
        sound.play('clear');
        this.controls.setEnabled(false);
        this.renderer.celebrate();
      } else sound.play(g.status === STATUS.AT_GOAL ? 'goalMiss' : 'step');
    } else if (res.type === MOVE.UNDONE) sound.play('undo');
    else if (res.type === MOVE.BLOCKED) { sound.play('error'); this.renderer.flashOverflow(res); }
    else if (res.type === MOVE.IGNORED && res.reason === 'memo-x') { sound.play('error'); this.renderer.nudge(res.row, res.col); }
    else if (res.type === MOVE.IGNORED && source === 'tap') this.renderer.nudge(res.row, res.col);
    this.page.onResult?.(res, source);
    this.refresh();
  }

  _undo() {
    if (this.game && this.game.status !== STATUS.CLEARED && this.game.undo()) this._onResult({ type: MOVE.UNDONE });
  }

  _setMode(mode, refresh = true) {
    this.mode = mode;
    this.toolsEl.querySelectorAll('.five-btn').forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (refresh && this.page) this.refresh();
  }

  _board() { return { route: this.game.route, memo: this.memo.entries(), cleared: this.game.status === STATUS.CLEARED }; }

  _openHint() {
    if (this.game.status === STATUS.CLEARED) return;
    this.hintPanel.show();
    this.toolsEl.hidden = true;
    this._renderHint(this.hint.open(this._board()));
  }

  _renderHint(view) {
    this.hintPanel.render(view);
    this.renderer.showHint(view && view.highlight);
    this.page.onHint?.(view);
    this.taskEl.innerHTML = this.page.task ? this.page.task() : '';
  }

  _closeHint() {
    if (!this.hintPanel.isOpen) return;
    this.hintPanel.hide();
    this.toolsEl.hidden = !(this.page?.tools || []).length;
    this.renderer?.clearHint();
  }
}
