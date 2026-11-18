// 画面遷移とゲーム進行の管理（エンジン・描画・入力・保存をつなぐ）
import { PuzzleGame, STATUS, MOVE } from './game.js';
import { BoardRenderer } from './renderer.js';
import { BoardControls } from './controls.js';
import { loadPuzzleLibrary, loadTutorialData, DIFFICULTIES } from './puzzle-loader.js';
import { createStore } from './storage.js';
import { getFruit, DEFAULT_FRUIT_ID } from './fruits.js';
import { Stopwatch, formatTime } from './timer.js';
import { HowTo } from './howto.js';
import { MemoBoard, MEMO } from './memo.js';
import { HintSession } from './hint.js';
import { HintPanel } from './hint-ui.js';
import * as sound from './sound.js';

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  library: null,
  store: createStore(),
  fruit: getFruit(DEFAULT_FRUIT_ID), // 第4段階で「選んだフルーツ」に切り替える
  level: null,
  puzzle: null,
  game: null,
  renderer: null,
  stopwatch: new Stopwatch(),
  lastPuzzleId: {},   // 難易度ごとの直前の問題（同じ問題の連続出題を避ける）
  resultTimer: null,
  memo: null,         // 推理メモ（問題ごとに新しく作る。保存しない）
  mode: 'route',      // 'route' | 'memo'
  hint: null,         // HintSession
  tutorialData: null, // data/tutorial.json
};

// ---------------- 画面切り替え ----------------
const screens = ['title', 'howto', 'select', 'game'];
function show(name) {
  for (const s of screens) $(`#screen-${s}`).classList.toggle('active', s === name);
  if (name !== 'howto') howto && howto.close();
  if (name !== 'game') stopTicker();
  window.scrollTo(0, 0);
}

// ---------------- タイトル ----------------
$('#screen-title').addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  sound.unlockAudio();
  sound.play('tap');
  if (action === 'play') openSelect();
  if (action === 'howto') openHowto();
});

// ---------------- あそびかた ----------------
let howto = null;
function openHowto() {
  if (!state.tutorialData) return;
  if (!howto) {
    howto = new HowTo($('#screen-howto'), state.tutorialData, state.fruit);
    howto.onFinish = () => openSelect();
  }
  show('howto');
  howto.open();
}

// ---------------- 難易度選択 ----------------
function openSelect() {
  renderLevelList();
  show('select');
}

function renderLevelList() {
  const list = $('#level-list');
  const last = state.store.getLastDifficulty();
  list.replaceChildren(...DIFFICULTIES.map((d) => {
    const total = state.library.count(d.level);
    const ids = state.library.list(d.level).map((p) => p.id);
    const cleared = state.store.firstClearCount(ids);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'level-btn';
    btn.dataset.level = d.level;
    if (!total) {
      btn.disabled = true;
      btn.classList.add('coming-soon');
    }
    if (d.level === last && total) btn.classList.add('last');
    btn.innerHTML = `
      <span class="level-stars" aria-label="むずかしさ ${d.level}">${d.stars}</span>
      <span class="level-size">${d.size}×${d.size}</span>
      <span class="level-progress">${total ? `クリア <b>${cleared}</b> / ${total}` : '準備中'}</span>
      ${total && cleared === total ? '<span class="level-complete">ぜんぶクリア！</span>' : ''}`;
    return btn;
  }));
}

$('#level-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.level-btn');
  if (!btn || btn.disabled) return;
  sound.unlockAudio();
  sound.play('tap');
  const level = Number(btn.dataset.level);
  state.store.setLastDifficulty(level);
  startRandom(level);
});

// ---------------- ゲーム ----------------
function startRandom(level) {
  const puzzle = state.library.pickRandom(level, { excludeId: state.lastPuzzleId[level] });
  if (!puzzle) return openSelect();
  startPuzzle(puzzle);
}

function startPuzzle(puzzle) {
  clearTimeout(state.resultTimer);
  state.level = puzzle.difficulty;
  state.puzzle = puzzle;
  state.lastPuzzleId[puzzle.difficulty] = puzzle.id;
  state.game = new PuzzleGame(puzzle);
  state.memo = new MemoBoard(puzzle);   // 問題が変わったらメモは新しく
  state.hint = new HintSession(puzzle);
  closeHint();
  setMode('route');
  state.renderer = new BoardRenderer($('#board-area'), puzzle, state.fruit);
  state.stopwatch.reset();
  const d = DIFFICULTIES.find((x) => x.level === puzzle.difficulty);
  $('#game-stars').textContent = d.stars;
  $('#game-size').textContent = `${puzzle.rows}×${puzzle.cols}`;
  hideResult();
  show('game');
  controls.setEnabled(true);
  fitBoard();
  refresh();
  setMessage('START から なぞって、GOAL まで つなごう！', 'hint');
  updateTimer();
}

function fitBoard() {
  if (!state.renderer) return;
  const area = $('#board-area');
  const cs = getComputedStyle(area);
  const w = area.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = area.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  state.renderer.fit(w, h);
}

function refresh() {
  const g = state.game;
  const cleared = g.status === STATUS.CLEARED;
  state.renderer.update(g, state.memo);
  $('#btn-undo').disabled = g.route.length <= 1 || cleared;
  $('#btn-reset').disabled = (g.route.length <= 1 && !state.memo.hasAny()) || cleared;
  $('#btn-clear-memo').disabled = !state.memo.hasAny() || cleared;
  $('#btn-hint').disabled = cleared;
  document.querySelectorAll('#game-ctrl .mode-btn').forEach((b) => { b.disabled = cleared; });
}

/** ヒントに渡す今の盤面 */
const boardState = () => ({ route: state.game.route, memo: state.memo.entries(), cleared: state.game.status === STATUS.CLEARED });

// ---- 操作モード（ルート／メモ） ----
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('#game-ctrl .mode-btn').forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  $('#screen-game').classList.toggle('memo-mode', mode === 'memo');
}
$('#game-ctrl .mode-toggle').addEventListener('click', (e) => {
  const b = e.target.closest('.mode-btn');
  if (!b || b.disabled) return;
  sound.play('tap');
  setMode(b.dataset.mode);
  if (b.dataset.mode === 'memo') setMessage('マスをタップすると ○ → × → なし と かわるよ', 'hint', 2400);
  else setMessage(defaultMessage());
});

$('#btn-clear-memo').addEventListener('click', () => {
  if (!state.memo || !state.memo.clear()) return;
  sound.play('undo');
  refresh();
});

// ---- ヒント ----
const hintPanel = new HintPanel($('#game-hint'), {
  onMore: () => { sound.play('tap'); renderHint(state.hint.more()); },
  onNext: () => { sound.play('tap'); renderHint(state.hint.next(boardState())); },
  onClose: () => { sound.play('tap'); closeHint(); },
});
function renderHint(view) {
  hintPanel.render(view);
  state.renderer.showHint(view && view.highlight);
}
function openHint() {
  if (!state.game || state.game.status === STATUS.CLEARED) return;
  disarmReset();
  hintPanel.show();
  $('#game-ctrl').hidden = true;
  renderHint(state.hint.open(boardState())); // 盤面が変わっていなければ前回の段階のまま
}
function closeHint() {
  hintPanel.hide();
  $('#game-ctrl').hidden = false;
  if (state.renderer) state.renderer.clearHint(); // 閉じたら強調表示を消す（段階は HintSession が覚えている）
}
$('#btn-hint').addEventListener('click', () => { sound.play('tap'); openHint(); });

let msgTimer = null;
function setMessage(text, kind = '', duration = 0) {
  const el = $('#game-msg');
  clearTimeout(msgTimer);
  el.textContent = text;
  el.className = `game-msg ${kind}`;
  if (duration) msgTimer = setTimeout(() => setMessage(defaultMessage()), duration);
}
function defaultMessage() {
  const g = state.game;
  if (!g) return '';
  if (g.status === STATUS.AT_GOAL) return '';
  return g.route.length <= 1 ? 'START から なぞって、GOAL まで つなごう！' : '';
}

/** 入力 1 回ごとの結果を処理する */
function handleResult(res) {
  const g = state.game;
  switch (res.type) {
    case MOVE.MOVED:
      // ×のメモを付けたマスにも進める。そのときは×を消してからルートを通す（○は残し、ルート表示を優先）
      if (state.memo.get(res.row, res.col) === MEMO.OFF) state.memo.erase(res.row, res.col);
      if (!state.stopwatch.running && g.status !== STATUS.CLEARED) { state.stopwatch.start(); startTicker(); }
      if (g.status === STATUS.CLEARED) return onCleared();
      if (g.status === STATUS.AT_GOAL) {
        sound.play('goalMiss');
        setMessage('数字が まだ そろっていないよ！ もどって 道を なおそう', 'warn');
      } else {
        sound.play('step');
        setMessage(defaultMessage());
      }
      break;
    case MOVE.UNDONE:
      sound.play('undo');
      setMessage(defaultMessage());
      break;
    case MOVE.BLOCKED:
      sound.play('error');
      state.renderer.flashOverflow(res);
      setMessage(`${res.overRow && res.overCol ? '行と列' : res.overRow ? 'その行' : 'その列'}の 数字を こえちゃうよ！`, 'error', 1400);
      break;
    case MOVE.IGNORED:
      if (res.reason === 'locked') {
        state.renderer.nudge(res.row, res.col);
        setMessage('数字が まだ そろっていないよ！ もどって 道を なおそう', 'warn');
      }
      break;
  }
  refresh();
}

function onCleared() {
  state.stopwatch.stop();
  stopTicker();
  updateTimer();
  controls.setEnabled(false);
  closeHint();
  refresh();
  sound.play('clear');
  setMessage('やったね！', 'success');
  state.renderer.celebrate();
  const rec = state.store.recordClear(state.puzzle.id);
  state.resultTimer = setTimeout(() => showResult(rec), 1500);
  // 演出中にタップしたら すぐ結果へ
  const skip = () => { clearTimeout(state.resultTimer); showResult(rec); };
  $('#board-area').addEventListener('pointerdown', skip, { once: true });
  state.skipHandler = skip;
}

function showResult(rec) {
  if (state.skipHandler) { $('#board-area').removeEventListener('pointerdown', state.skipHandler); state.skipHandler = null; }
  const d = DIFFICULTIES.find((x) => x.level === state.level);
  $('#result-stars').textContent = d.stars;
  $('#result-size').textContent = `${state.puzzle.rows}×${state.puzzle.cols}`;
  $('#result-time').textContent = formatTime(state.stopwatch.elapsed());
  const badge = $('#result-badge');
  badge.textContent = rec.firstClear ? '🎉 はじめて クリア！' : `${rec.clearCount}回めの クリア`;
  badge.classList.toggle('first', rec.firstClear);
  $('#result-fruit').textContent = state.fruit.emoji;
  const overlay = $('#result');
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('show'));
  $('#btn-next').focus({ preventScroll: true });
}
function hideResult() {
  const overlay = $('#result');
  overlay.classList.remove('show');
  overlay.hidden = true;
  if (state.skipHandler) { $('#board-area').removeEventListener('pointerdown', state.skipHandler); state.skipHandler = null; }
}

// タイマー表示
let ticker = null;
function startTicker() { stopTicker(); ticker = setInterval(updateTimer, 250); }
function stopTicker() { clearInterval(ticker); ticker = null; }
function updateTimer() { $('#game-timer').textContent = formatTime(state.stopwatch.elapsed()); }

// ボタン
function undo() {
  if (!state.game || state.game.status === STATUS.CLEARED) return;
  if (state.game.undo()) handleResult({ type: MOVE.UNDONE });
}
$('#btn-undo').addEventListener('click', undo);

let resetArmed = null;
$('#btn-reset').addEventListener('click', () => {
  const btn = $('#btn-reset');
  if (!state.game || (state.game.route.length <= 1 && !state.memo.hasAny())) return;
  // 誤操作防止：2 回押すとやり直し（ダイアログは出さない）。ルートと推理メモの両方を初期化する
  if (!resetArmed) {
    btn.classList.add('armed');
    btn.querySelector('.label').textContent = 'もう1回で リセット';
    resetArmed = setTimeout(disarmReset, 2500);
    return;
  }
  disarmReset();
  state.game.reset();
  state.memo.clear();
  sound.play('undo');
  setMessage(defaultMessage());
  refresh();
});
function disarmReset() {
  clearTimeout(resetArmed);
  resetArmed = null;
  const btn = $('#btn-reset');
  btn.classList.remove('armed');
  btn.querySelector('.label').textContent = 'はじめから';
}

$('#btn-next').addEventListener('click', () => { sound.play('tap'); startRandom(state.level); });
$('#btn-retry').addEventListener('click', () => { sound.play('tap'); startPuzzle(state.puzzle); });
$('#btn-to-select').addEventListener('click', () => { sound.play('tap'); hideResult(); openSelect(); });

// 戻るボタン（各画面の左上）
document.addEventListener('click', (e) => {
  const back = e.target.closest('[data-back]');
  if (!back) return;
  sound.play('tap');
  disarmReset();
  if (back.dataset.back === 'title') show('title');
  if (back.dataset.back === 'select') { hideResult(); clearTimeout(state.resultTimer); openSelect(); }
});

// 効果音 ON/OFF
function renderSoundButtons() {
  const on = sound.isSoundEnabled();
  document.querySelectorAll('[data-sound-toggle]').forEach((b) => {
    b.textContent = on ? '🔊' : '🔈';
    b.setAttribute('aria-label', on ? '効果音 ON（おすとOFF）' : '効果音 OFF（おすとON）');
    b.classList.toggle('off', !on);
  });
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-sound-toggle]')) return;
  sound.setSoundEnabled(!sound.isSoundEnabled());
  sound.unlockAudio();
  sound.play('tap');
  renderSoundButtons();
});

// 入力
const controls = new BoardControls($('#board-area'), {
  getGame: () => state.game,
  getRenderer: () => state.renderer,
  onResult: (res) => { sound.unlockAudio(); handleResult(res); },
  onUndoKey: undo,
  getMode: () => state.mode,
  getMemo: () => state.memo,
  onMemo: () => { sound.unlockAudio(); sound.play('tap'); refresh(); },
  isBlocked: () => hintPanel.isOpen,       // ヒント表示中は盤面を操作しない
  onBlocked: () => closeHint(),            // 盤面をタップしたらヒントを閉じるだけ
  onToggleMode: () => { if (state.game && state.game.status !== STATUS.CLEARED) setMode(state.mode === 'route' ? 'memo' : 'route'); },
});

// 画面サイズの変化に追従
const ro = new ResizeObserver(() => { fitBoard(); howto && howto.fit(); });
ro.observe($('#board-area'));
ro.observe($('#screen-howto'));

// ---------------- 起動 ----------------
async function boot() {
  renderSoundButtons();
  try {
    state.library = await loadPuzzleLibrary('data/puzzles.json');
    // あそびかた専用の問題（読めなければ、従来の例題 1 問だけで説明する）
    state.tutorialData = await loadTutorialData('data/tutorial.json').catch((err) => {
      console.warn(err);
      return { pages: { route: state.library.tutorial } };
    });
    document.body.classList.remove('loading');
  } catch (err) {
    console.error(err);
    document.body.classList.remove('loading');
    $('#load-error').hidden = false;
    $('#title-menu').hidden = true;
  }
}
boot();

// デバッグ・テスト用（ブラウザのコンソールから参照できる）
window.fruitMaze = { state, get howto() { return howto; } };
