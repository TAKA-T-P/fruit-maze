// あそびかた（7 ページのチュートリアル）。盤面は本編と同じエンジン・描画・操作・メモ・ヒントを使う。
// 練習の結果はクリア記録に入れない（storage を使わない）。
//
//   1 数字の意味 / 2 ルートをつなごう / 3 通れない道 / 4 数字から推理しよう
//   5 推理メモを使おう / 6 ヒントを使おう / 7 ミニチャレンジ

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

export class HowTo {
  /**
   * @param {HTMLElement} root     #screen-howto
   * @param {{pages: Record<string, object>}} data  data/tutorial.json
   * @param {object} fruit
   */
  constructor(root, data, fruit) {
    this.root = root;
    this.fruit = fruit;
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
      const m = e.target.closest('.mode-btn');
      if (m && !m.disabled) { sound.play('tap'); this._setMode(m.dataset.mode); return; }
      const t = e.target.closest('[data-tool]');
      if (!t || t.disabled) return;
      sound.play('tap');
      if (t.dataset.tool === 'undo') this._undo();
      if (t.dataset.tool === 'reset') { this.game.reset(); this.memo.clear(); this.page.onReset?.(); this.controls.setEnabled(true); this.renderer.clearFx(); this.refresh(); }
      if (t.dataset.tool === 'clear-memo') { this.memo.clear(); this.refresh(); }
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
    const check = { diagonal: 'ななめに進む', blank: '何もないマスに進む', visited: '通ったマスにもう一度進む', overflow: '数字をこえて進む' };

    return [
      {
        title: '① 数字の意味',
        puzzle: R, interactive: false, tools: [],
        text: `右の数字は、その<b>行（よこ）</b>で通るフルーツの数。上の数字は、その<b>列（たて）</b>で通る数だよ。`,
        setup: () => this.renderer.showHint({ lines: [{ kind: 'row', index: bigRow }], clues: [{ kind: 'row', index: bigRow }] }),
        task: () => `黄色の行の数字は「${R.rowClues[bigRow]}」。この行では <b>${R.rowClues[bigRow]}つ</b> のフルーツを通るよ！<br><small>「0/${R.rowClues[bigRow]}」の左は、今までに通った数だよ。</small>`,
      },
      {
        title: '② ルートをつなごう',
        puzzle: R, tools: ['undo', 'reset'],
        text: '<b>START</b> から指でなぞって、<b>GOAL</b> までつないでみよう！ となりのフルーツをタップしても進めるよ。',
        task: () => {
          if (this.game.status === STATUS.CLEARED) return '<span class="ok">✓ できた！ すべての数字がそろったね</span>';
          if (this.game.status === STATUS.AT_GOAL) return '数字がそろっていないよ。「もどる」で道をなおそう';
          return 'すべての数字をそろえて GOAL まで行こう';
        },
      },
      {
        title: '③ 通れない道',
        puzzle: R, tools: ['undo', 'reset'],
        text: 'わざと まちがえてみよう！ 下の4つをためすと ✓ が付くよ。',
        setup: () => { this.tried = new Set(); this.flash = ''; },
        onResult: (res) => {
          const g = this.game;
          let kind = null;
          if (res.type === MOVE.BLOCKED) kind = 'overflow';
          else if (res.type === MOVE.IGNORED) {
            if (!g.isFruit(res.row, res.col)) kind = 'blank';
            else if (g.isVisited(res.row, res.col)) kind = 'visited';
            else if (res.reason === 'not-adjacent') {
              const [hr, hc] = g.head;
              if (Math.abs(res.row - hr) === 1 && Math.abs(res.col - hc) === 1) kind = 'diagonal';
              else this.flash = 'となりのフルーツをえらんでね';
            }
          }
          const say = { diagonal: 'ななめには進めないよ！', blank: '何もないマスには進めないよ！', visited: '同じフルーツは2回通れないよ！', overflow: '数字をこえる道には進めないよ！' };
          if (kind) { this.tried.add(kind); this.flash = say[kind]; }
        },
        task: () => {
          const done = this.tried.size === 4;
          const list = Object.entries(check).map(([k, label]) => `<span class="check ${this.tried.has(k) ? 'on' : ''}">${this.tried.has(k) ? '✓' : '□'} ${label}</span>`).join('');
          const head = done ? '<span class="ok">✓ ぜんぶ ためせたね！</span>' : (this.flash || 'STARTのとなりや、ななめのマスをタップしてみよう');
          return `${head}<span class="checklist">${list}</span>`;
        },
      },
      {
        title: '④ 数字から推理しよう',
        puzzle: pz.deduce, tools: [], mode: 'memo',
        memo: allLine ? { cycle: [MEMO.NONE, MEMO.ON], filter: (r, c) => has(allLine.cells, r, c) } : {},
        text: allLine
          ? `${lineName(allLine.line)}には、フルーツが${allLine.cells.length}個あって、数字も${allLine.clue}。ということは……全部通るね！`
          : '数字とフルーツの数をくらべてみよう。',
        setup: () => allLine && this.renderer.showHint({ lines: [allLine.line], clues: [allLine.line] }),
        task: () => {
          if (!allLine) return '';
          const n = allLine.cells.filter(([r, c]) => this.memo.get(r, c) === MEMO.ON).length;
          if (n === allLine.cells.length) return '<span class="ok">✓ 正解！ 数字から、必ず通るマスが分かったね</span>';
          return `黄色の${allLine.line.kind === 'row' ? '行' : '列'}のフルーツをタップして ○ を付けよう（${n} / ${allLine.cells.length}）`;
        },
      },
      {
        title: '⑤ 推理メモを使おう',
        puzzle: pz.memo, tools: ['mode', 'clear-memo'],
        text: zeroLine
          ? `${lineName(zeroLine.line)}の数字は0。だから、どのフルーツも通らないね。「✏️ メモ」に切りかえて、×を付けよう！`
          : '「✏️ メモ」に切りかえて、○や×を付けてみよう。',
        setup: () => zeroLine && this.renderer.showHint({ lines: [zeroLine.line], clues: [zeroLine.line] }),
        task: () => {
          if (!zeroLine) return '';
          const n = zeroLine.cells.filter(([r, c]) => this.memo.get(r, c) === MEMO.OFF).length;
          if (n === zeroLine.cells.length) return '<span class="ok">✓ できた！ メモはルートとは別だから、あとで消すこともできるよ</span>';
          if (this.mode === 'route') return '下の「✏️ メモ」を押してね';
          return `マスをタップするたびに ○ → × → なし と変わるよ（× ${n} / ${zeroLine.cells.length}）`;
        },
      },
      {
        title: '⑥ ヒントを使おう',
        puzzle: pz.hint, tools: ['hint', 'undo'],
        text: 'こまったら「💡 ヒント」を押そう。「もっとヒント」で、ヒント1 → 2 → 3 とだんだんくわしくなるよ。',
        setup: () => { this.maxHintLevel = 0; },
        onHint: (view) => { if (view && view.kind !== 'none') this.maxHintLevel = Math.max(this.maxHintLevel, view.level); },
        task: () => {
          if (this.maxHintLevel >= 3) return '<span class="ok">✓ ヒント3まで見られたね！ ヒントは道やメモを勝手に変えないよ。自分で進めてみよう</span>';
          if (this.maxHintLevel > 0) return `ヒント${this.maxHintLevel}まで見たよ。「もっとヒント」を押してみよう`;
          return '下の「💡 ヒント」を押してみよう';
        },
      },
      {
        title: '⑦ ミニチャレンジ',
        puzzle: pz.challenge, tools: ['mode', 'hint', 'undo', 'reset', 'clear-memo'],
        text: 'さいごに 4×4 の問題を解いてみよう！ メモやヒントも使えるよ。',
        task: () => {
          if (this.game.status === STATUS.CLEARED) return '<span class="ok big">🎉 じゅんびOK！ フルーツめいろに挑戦しよう！</span>';
          if (this.game.status === STATUS.AT_GOAL) return '数字がそろっていないよ。「もどる」で道をなおそう';
          return 'STARTからGOALまで、数字をそろえてつなごう';
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
    this.nextBtn.textContent = this.index === this.pages.length - 1 ? 'ゲームをはじめる ▶' : 'つぎへ ▶';

    const puzzle = page.puzzle;
    this.game = new PuzzleGame(puzzle);
    this.memo = new MemoBoard(puzzle, page.memo || {});
    this.hint = new HintSession(puzzle);
    this.renderer = new BoardRenderer(this.boardHost, puzzle, this.fruit);
    this.renderer.board.classList.toggle('static', page.interactive === false);
    this.controls.setEnabled(page.interactive !== false);
    for (const el of this.toolsEl.querySelectorAll('[data-tool]')) el.hidden = !(page.tools || []).includes(el.dataset.tool);
    this.toolsEl.hidden = !(page.tools || []).length;
    this.fit();
    page.setup?.();            // ページの状態を先に用意してから
    this._setMode(page.mode || 'route', false);
    this.refresh();
  }

  refresh() {
    if (!this.game) return;
    const cleared = this.game.status === STATUS.CLEARED;
    this.renderer.update(this.game, this.memo);
    const tool = (name) => this.toolsEl.querySelector(`[data-tool="${name}"]`);
    tool('undo').disabled = this.game.route.length <= 1 || cleared;
    tool('reset').disabled = this.game.route.length <= 1 && !this.memo.hasAny();
    tool('clear-memo').disabled = !this.memo.hasAny() || cleared;
    tool('hint').disabled = cleared;
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
      if (this.memo.get(res.row, res.col) === MEMO.OFF) this.memo.erase(res.row, res.col);
      if (g.status === STATUS.CLEARED) {
        sound.play('clear');
        this.controls.setEnabled(false);
        this.renderer.celebrate();
      } else sound.play(g.status === STATUS.AT_GOAL ? 'goalMiss' : 'step');
    } else if (res.type === MOVE.UNDONE) sound.play('undo');
    else if (res.type === MOVE.BLOCKED) { sound.play('error'); this.renderer.flashOverflow(res); }
    else if (res.type === MOVE.IGNORED && source === 'tap') this.renderer.nudge(res.row, res.col);
    this.page.onResult?.(res, source);
    this.refresh();
  }

  _undo() {
    if (this.game && this.game.status !== STATUS.CLEARED && this.game.undo()) this._onResult({ type: MOVE.UNDONE });
  }

  _setMode(mode, refresh = true) {
    this.mode = mode;
    this.toolsEl.querySelectorAll('.mode-btn').forEach((b) => {
      b.classList.toggle('on', b.dataset.mode === mode);
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
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
