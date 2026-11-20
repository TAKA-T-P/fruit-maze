// 入力処理：タップ・ドラッグ（Pointer Events でマウス／タッチ／ペンを共通処理）・キーボード
import { MOVE } from './game.js';
import { memoToolForMode, isBlockedByMemo } from './memo.js';

const DRAG_TOLERANCE = 0.42; // ドラッグ中はマスの中心付近に入ったときだけ反応（角での斜め誤判定を防ぐ）
const TAP_TOLERANCE = 0.5;
const MAX_INTERPOLATE = 4;   // 速いドラッグで飛ばしたマスを補う最大距離

export class BoardControls {
  /**
   * @param {HTMLElement} surface  ポインター入力を受け取る要素（盤面のまわりも含めて広めに）
   * @param {object} opt
   * @param {() => import('./game.js').PuzzleGame} opt.getGame
   * @param {() => import('./renderer.js').BoardRenderer} opt.getRenderer
   * @param {(result: object, source: 'tap'|'drag'|'key') => void} opt.onResult  1 回の操作結果ごとに呼ばれる
   * @param {() => void} [opt.onUndoKey]
   * @param {() => string} [opt.getMode]  操作モード：'route'（既定）／'memo-on'／'memo-off'／'memo-erase'／'memo'（切り替え）
   * @param {() => import('./memo.js').MemoBoard} [opt.getMemo]
   * @param {(cell: {row:number,col:number}, value: number) => void} [opt.onMemo]  メモが変わったとき
   * @param {() => boolean} [opt.isBlocked]                 true の間は盤面の操作を受け付けない（ヒント表示中など）
   * @param {() => void} [opt.onBlocked]                    操作を受け付けなかったとき（ヒントを閉じる等）
   * @param {() => void} [opt.onToggleMode]                 M キー
   */
  constructor(surface, { getGame, getRenderer, onResult, onUndoKey, getMode = () => 'route', getMemo = () => null, onMemo = () => {}, isBlocked = () => false, onBlocked = () => {}, onToggleMode = null }) {
    this.surface = surface;
    this.getGame = getGame;
    this.getRenderer = getRenderer;
    this.onResult = onResult;
    this.onUndoKey = onUndoKey;
    this.getMode = getMode;
    this.getMemo = getMemo;
    this.onMemo = onMemo;
    this.isBlocked = isBlocked;
    this.onBlocked = onBlocked;
    this.onToggleMode = onToggleMode;
    this.memoStroke = false;
    this.enabled = true;
    this.pointerId = null;
    this.lastCellKey = null;

    surface.addEventListener('pointerdown', (e) => this._down(e));
    surface.addEventListener('pointermove', (e) => this._move(e));
    surface.addEventListener('pointerup', (e) => this._up(e));
    surface.addEventListener('pointercancel', (e) => this._up(e));
    surface.addEventListener('lostpointercapture', (e) => this._up(e));
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS Safari の古い版ではタッチのスクロールを止めるために touchmove の preventDefault も必要
    surface.addEventListener('touchmove', (e) => { if (this.pointerId !== null) e.preventDefault(); }, { passive: false });
    this._keyHandler = (e) => this._key(e);
    window.addEventListener('keydown', this._keyHandler);
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) {
      this.pointerId = null;
      if (this.memoStroke) { this.memoStroke = false; this.getMemo()?.endStroke(); }
    }
  }

  _down(e) {
    if (!this.enabled || this.pointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const renderer = this.getRenderer();
    if (!renderer) return;
    e.preventDefault();
    if (this.isBlocked()) { this.onBlocked(); return; } // ヒント表示中：最初のタップはヒントを閉じるだけ
    this.pointerId = e.pointerId;
    try { this.surface.setPointerCapture(e.pointerId); } catch { /* 古いブラウザ */ }
    const cell = renderer.cellFromPoint(e.clientX, e.clientY, TAP_TOLERANCE);
    this.lastCellKey = cell ? `${cell.row},${cell.col}` : null;
    this.dragBlocked = false;
    const tool = memoToolForMode(this.getMode());
    if (tool) {
      // メモ（○つけ・×つけ・消す）：最初に触れたマスで決まった値を、なぞったマスにも付ける
      const memo = this.getMemo();
      if (!memo) return;
      memo.beginStroke(tool);
      this.memoStroke = true;
      if (cell) this._memoAt(cell);
      return;
    }
    if (!cell) return;
    const game = this.getGame();
    const head = game.head;
    if (head && cell.row === head[0] && cell.col === head[1]) return; // 先頭マスから なぞり始める
    // タップ：青マスから道を始める／隣のマスへ進む／直前のマスなら 1 手もどる
    this.onResult(this._tryMove(cell.row, cell.col), 'tap');
  }

  /**
   * ルートを 1 マス進める（直前のマスなら 1 手もどる）。
   * ×を付けたマスには進めない：ゲームのルール上は進めるマスでも、ここで止めて reason 'memo-x' を返す。
   */
  _tryMove(r, c) {
    const game = this.getGame();
    if (game.check(r, c).type === MOVE.MOVED && isBlockedByMemo(this.getMemo(), r, c)) {
      this.dragBlocked = true; // このなぞりでは、もうマス飛ばしの補いをしない（×のまわりを勝手に回り込まない）
      return { type: MOVE.IGNORED, reason: 'memo-x', row: r, col: c, status: game.status };
    }
    return game.moveTo(r, c);
  }

  _move(e) {
    if (e.pointerId !== this.pointerId || !this.enabled) return;
    e.preventDefault();
    const renderer = this.getRenderer();
    // 高速なマウス移動では coalesced events で途中の点も拾う
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of (events.length ? events : [e])) {
      const cell = renderer.cellFromPoint(ev.clientX, ev.clientY, DRAG_TOLERANCE);
      if (!cell) continue; // 盤面の外やマスの境目：ルートはそのまま
      const key = `${cell.row},${cell.col}`;
      if (key === this.lastCellKey) continue;
      this.lastCellKey = key;
      if (this.memoStroke) this._memoAt(cell);
      else this._dragTo(cell.row, cell.col);
    }
  }

  _up(e) {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.lastCellKey = null;
    if (this.memoStroke) { this.memoStroke = false; this.getMemo()?.endStroke(); }
  }

  _memoAt(cell) {
    const memo = this.getMemo();
    const v = memo.strokeAt(cell.row, cell.col, this.getGame());
    if (v !== null) this.onMemo(cell, v);
  }

  /** ドラッグで指が入ったマスに向かってルートを伸ばす（または戻す） */
  _dragTo(r, c) {
    const game = this.getGame();
    if (!game.head) {
      // まだ道がない：青マスまで指を動かしたら、そこから始める
      if (game.isEndpoint(r, c)) this.onResult(this._tryMove(r, c), 'drag');
      return;
    }
    const [hr, hc] = game.head;
    if (r === hr && c === hc) return;

    // ルート上のマスまで指を戻した → そこまで 1 手ずつもどる
    const idx = game.routeIndexOf(r, c);
    if (idx >= 0 && idx < game.route.length - 1) {
      if (game.status === 'cleared') return;
      while (game.route.length - 1 > idx) {
        const res = game.moveTo(...game.previous);
        this.onResult(res, 'drag');
        if (res.type !== MOVE.UNDONE) break;
      }
      return;
    }

    const dist = Math.abs(r - hr) + Math.abs(c - hc);
    if (dist === 1 || dist > MAX_INTERPOLATE || this.dragBlocked) {
      if (dist === 1) this.onResult(this._tryMove(r, c), 'drag');
      return;
    }
    // 指が速くてマスを飛ばした：目的のマスへ 1 マスずつ補って進む
    for (let i = 0; i < dist; i++) {
      const [cr, cc] = game.head;
      if (cr === r && cc === c) break;
      const dr = Math.sign(r - cr), dc = Math.sign(c - cc);
      const tries = Math.abs(r - cr) >= Math.abs(c - cc)
        ? [[cr + dr, cc], [cr, cc + dc]]
        : [[cr, cc + dc], [cr + dr, cc]];
      let moved = false;
      for (const [nr, nc] of tries) {
        if ((nr === cr && nc === cc) || game.check(nr, nc).type !== MOVE.MOVED || isBlockedByMemo(this.getMemo(), nr, nc)) continue;
        this.onResult(game.moveTo(nr, nc), 'drag');
        moved = true;
        break;
      }
      if (!moved) {
        // 進めない理由（数字の超過など）を知らせるため、第一候補の結果だけ通知する
        const [nr, nc] = tries.find(([a, b]) => a !== cr || b !== cc) || tries[0];
        const res = game.check(nr, nc);
        if (res.type === MOVE.BLOCKED) this.onResult({ ...res, row: nr, col: nc, status: game.status }, 'drag');
        else if (res.type === MOVE.MOVED && isBlockedByMemo(this.getMemo(), nr, nc)) this.onResult(this._tryMove(nr, nc), 'drag');
        break;
      }
    }
  }

  _key(e) {
    if (!this.enabled || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!this.surface.isConnected || this.surface.offsetParent === null) return; // ゲーム画面が表示されていない
    if ((e.key === 'm' || e.key === 'M') && this.onToggleMode) { e.preventDefault(); this.onToggleMode(); return; }
    if (this.isBlocked()) return;
    const dirs = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (dirs[e.key]) {
      e.preventDefault();
      const game = this.getGame();
      if (!game.head) { const { start } = game.puzzle; this.onResult(this._tryMove(start.row, start.col), 'key'); return; } // 矢印キー：まだ道がなければ青マスの一方から始める
      const [hr, hc] = game.head;
      this.onResult(this._tryMove(hr + dirs[e.key][0], hc + dirs[e.key][1]), 'key');
    } else if ((e.key === 'Backspace' || e.key === 'z' || e.key === 'Z') && this.onUndoKey) {
      e.preventDefault();
      this.onUndoKey();
    }
  }
}
