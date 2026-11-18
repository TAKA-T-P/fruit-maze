// 画面遷移とゲーム進行の管理（エンジン・描画・入力・保存をつなぐ）
import { PuzzleGame, STATUS, MOVE } from './game.js';
import { BoardRenderer } from './renderer.js';
import { BoardControls } from './controls.js';
import { loadPuzzleLibrary, loadTutorialData, DIFFICULTIES } from './puzzle-loader.js';
import { createStore } from './storage.js';
import { getFruit, DEFAULT_FRUIT_ID } from './fruits.js';
import { Stopwatch, formatTime } from './timer.js';
import { HowTo } from './howto.js';
import { MemoBoard, MEMO, nextMode } from './memo.js';
import { HintSession } from './hint.js';
import { HintPanel } from './hint-ui.js';
import { createSettings } from './settings.js';
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
  stage: null,        // 遊んでいるステージ番号（1〜）
  fromRandom: false,  // 「ランダム」で始めたか（結果画面の「つぎの問題」の動きが変わる）
  resultTimer: null,
  memo: null,         // 推理メモ（問題ごとに新しく作る。保存しない）
  mode: 'route',      // 'route' | 'memo-on' | 'memo-off' | 'memo-erase'（1 つのボタンで順に切り替え）
  hint: null,         // HintSession
  tutorialData: null, // data/tutorial.json
  settings: createSettings(), // 効果音・マス数の表示（クリア記録とは別に保存）
};
sound.setSoundEnabled(state.settings.get('sound'));

// ---------------- 画面切り替え ----------------
const screens = ['title', 'howto', 'select', 'stage', 'game'];
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
    howto = new HowTo($('#screen-howto'), state.tutorialData, state.fruit, { getClueStyle: () => state.settings.get('clueStyle') });
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
    if (total && cleared === total) btn.classList.add('complete');
    // ★・盤面サイズ・クリア数を 1 行にならべる
    btn.innerHTML = `
      <span class="level-stars" aria-label="むずかしさ ${d.level}">${d.stars}</span>
      <span class="level-size">${d.size}×${d.size}</span>
      <span class="level-progress">${total ? `${cleared === total ? '🏆 ' : ''}クリア <b>${cleared}</b> / ${total}` : '準備中'}</span>`;
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
  openStage(level);
});

// ---------------- ステージ選択 ----------------
/** ステージ番号（1〜）は、その難易度の問題の並び順（easy-001 → ステージ1 …） */
const stageOf = (puzzle) => state.library.list(puzzle.difficulty).indexOf(puzzle) + 1;

function openStage(level = state.level) {
  state.level = level;
  renderStageGrid();
  show('stage');
  // 前回遊んだステージが見えるようにスクロール
  $('#stage-grid .stage-btn.last')?.scrollIntoView({ block: 'nearest' });
}

function renderStageGrid() {
  const level = state.level;
  const d = DIFFICULTIES.find((x) => x.level === level);
  const list = state.library.list(level);
  const cleared = state.store.firstClearCount(list.map((p) => p.id));
  $('#stage-stars').textContent = d.stars;
  $('#stage-size').textContent = `${d.size}×${d.size}`;
  $('#stage-progress').innerHTML = `クリア <b>${cleared}</b> / ${list.length}`;
  const lastId = state.lastPuzzleId[level];
  $('#stage-grid').replaceChildren(...list.map((p, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stage-btn';
    btn.dataset.stage = String(i + 1);
    btn.setAttribute('role', 'listitem');
    const done = state.store.isCleared(p.id);
    if (done) btn.classList.add('cleared');
    if (p.id === lastId) btn.classList.add('last');
    btn.setAttribute('aria-label', `ステージ${i + 1}${done ? '（クリアずみ）' : ''}`);
    btn.innerHTML = `<span class="stage-no">${i + 1}</span>${done ? '<span class="stage-star" aria-hidden="true">★</span>' : ''}`;
    return btn;
  }));
}

$('#stage-grid').addEventListener('click', (e) => {
  const btn = e.target.closest('.stage-btn');
  if (!btn) return;
  sound.unlockAudio();
  sound.play('tap');
  startStage(state.level, Number(btn.dataset.stage));
});
$('#btn-stage-random').addEventListener('click', () => {
  sound.unlockAudio();
  sound.play('tap');
  startRandom(state.level);
});

function startStage(level, stage) {
  const puzzle = state.library.list(level)[stage - 1];
  if (!puzzle) return openStage(level);
  state.fromRandom = false;
  startPuzzle(puzzle);
}

// ---------------- ゲーム ----------------
function startRandom(level) {
  const puzzle = state.library.pickRandom(level, { excludeId: state.lastPuzzleId[level] });
  if (!puzzle) return openSelect();
  state.fromRandom = true;
  startPuzzle(puzzle);
}

function startPuzzle(puzzle) {
  clearTimeout(state.resultTimer);
  state.level = puzzle.difficulty;
  state.puzzle = puzzle;
  state.lastPuzzleId[puzzle.difficulty] = puzzle.id;
  state.stage = stageOf(puzzle);
  state.game = new PuzzleGame(puzzle);
  state.memo = new MemoBoard(puzzle);   // 問題が変わったらメモは新しく
  state.hint = new HintSession(puzzle);
  closeHint();
  setMode('route');
  state.renderer = new BoardRenderer($('#board-area'), puzzle, state.fruit, { clueStyle: state.settings.get('clueStyle') });
  state.stopwatch.reset();
  const d = DIFFICULTIES.find((x) => x.level === puzzle.difficulty);
  $('#game-stars').textContent = d.stars;
  $('#game-size').textContent = `ステージ${state.stage}`; // 盤面サイズは★で分かるので、ステージ番号だけ
  hideResult();
  closeSettings();
  setMessage('');
  show('game');
  controls.setEnabled(true);
  fitBoard();
  refresh();
  // タイマーはステージが表示された瞬間から数える
  state.stopwatch.start();
  startTicker();
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
  $('#btn-reset').disabled = (g.route.length <= 1 && !state.memo.hasAny()) || cleared;
  $('#btn-hint').disabled = cleared;
  $('#btn-mode').disabled = cleared;
}

/** ヒントに渡す今の盤面 */
const boardState = () => ({ route: state.game.route, memo: state.memo.entries(), cleared: state.game.status === STATUS.CLEARED });

// ---- 操作モード：1 つのボタンで ルート → ○つけ → ×つけ → 消す → ルート ----
const MODE_VIEW = {
  'route': { icon: '🍓', label: 'ルート', tip: '' },
  'memo-on': { icon: '✏️', label: '○つけ', tip: 'タップしたマスに ○ を付けるよ（もう一度で消える）' },
  'memo-off': { icon: '✏️', label: '×つけ', tip: 'タップしたマスに × を付けるよ（もう一度で消える）' },
  'memo-erase': { icon: '🧽', label: '消す', tip: 'タップしたマスの ○・× を消すよ' },
};
function setMode(mode) {
  state.mode = mode;
  const v = MODE_VIEW[mode];
  const btn = $('#btn-mode');
  btn.dataset.mode = mode;
  btn.querySelector('.mode-icon').textContent = v.icon;
  btn.querySelector('.mode-label').textContent = v.label;
  btn.setAttribute('aria-label', `操作モード：${v.label}（押すと切り替え）`);
  btn.querySelectorAll('.mode-dots i').forEach((d, i) => d.classList.toggle('on', i === Object.keys(MODE_VIEW).indexOf(mode)));
  $('#screen-game').dataset.mode = mode;
  $('#screen-game').classList.toggle('memo-mode', mode !== 'route');
}
function cycleMode() {
  if (!state.game || state.game.status === STATUS.CLEARED) return;
  setMode(nextMode(state.mode));
  const tip = MODE_VIEW[state.mode].tip;
  setMessage(tip, 'hint', tip ? 1800 : 0);
}
$('#btn-mode').addEventListener('click', () => { sound.play('tap'); cycleMode(); });

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
function defaultMessage() { return ''; }

/** 入力 1 回ごとの結果を処理する */
function handleResult(res) {
  const g = state.game;
  switch (res.type) {
    case MOVE.MOVED:
      // ×のメモを付けたマスにも進める。そのときは×を消してからルートを通す（○は残し、ルート表示を優先）
      if (state.memo.get(res.row, res.col) === MEMO.OFF) state.memo.erase(res.row, res.col);
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
  $('#result-time').textContent = formatTime(state.stopwatch.elapsed());
  const badge = $('#result-badge');
  badge.textContent = rec.firstClear ? '🎉 はじめて クリア！' : `${rec.clearCount}回めの クリア`;
  badge.classList.toggle('first', rec.firstClear);
  $('#result-fruit').textContent = state.fruit.emoji;
  $('#result-size').textContent = `ステージ${state.stage}・${state.puzzle.rows}×${state.puzzle.cols}`;
  const last = state.stage >= state.library.count(state.level);
  $('#btn-next').textContent = state.fromRandom ? 'つぎの問題（ランダム）▶' : last ? 'ステージ選択へ ▶' : `ステージ${state.stage + 1}へ ▶`;
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
  closeSettings();
});
function disarmReset() {
  clearTimeout(resetArmed);
  resetArmed = null;
  const btn = $('#btn-reset');
  btn.classList.remove('armed');
  btn.querySelector('.label').textContent = 'はじめから';
}

// つぎの問題：ステージから始めたら次のステージ（最後のステージならステージ選択へ）、ランダムならもう一度ランダム
$('#btn-next').addEventListener('click', () => {
  sound.play('tap');
  if (state.fromRandom) return startRandom(state.level);
  if (state.stage < state.library.count(state.level)) return startStage(state.level, state.stage + 1);
  hideResult();
  openStage(state.level);
});
$('#btn-retry').addEventListener('click', () => { sound.play('tap'); startPuzzle(state.puzzle); });
$('#btn-to-select').addEventListener('click', () => { sound.play('tap'); hideResult(); openStage(state.level); });

// 戻るボタン（各画面の左上）
document.addEventListener('click', (e) => {
  const back = e.target.closest('[data-back]');
  if (!back) return;
  sound.play('tap');
  disarmReset();
  closeSettings();
  if (back.dataset.back === 'title') show('title');
  if (back.dataset.back === 'select') openSelect();
  if (back.dataset.back === 'stage') { hideResult(); clearTimeout(state.resultTimer); openStage(state.level); }
});

// ---- 設定（歯車）：効果音・マス数の表示・はじめから ----
const CLUE_NOTE = {
  target: '「3」… その行・列で通るフルーツの数。そろうと緑になるよ',
  fraction: '「1/3」… 左が今までに通った数、右が通るフルーツの数',
};
function renderSettings() {
  const cur = { sound: state.settings.get('sound') ? 'on' : 'off', clueStyle: state.settings.get('clueStyle') };
  document.querySelectorAll('#settings .seg').forEach((seg) => {
    seg.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.value === cur[seg.dataset.setting];
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  });
  $('#clue-note').textContent = CLUE_NOTE[cur.clueStyle];
}
function openSettings() {
  closeHint();
  disarmReset();
  renderSettings();
  $('#settings').hidden = false;
}
function closeSettings() {
  disarmReset();
  $('#settings').hidden = true;
}
$('#btn-settings').addEventListener('click', () => { sound.unlockAudio(); sound.play('tap'); openSettings(); });
$('#btn-settings-close').addEventListener('click', () => { sound.play('tap'); closeSettings(); });
$('#settings').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) { closeSettings(); return; } // 外側をタップで閉じる
  const b = e.target.closest('.seg button');
  if (!b) return;
  const key = b.closest('.seg').dataset.setting;
  if (key === 'sound') {
    state.settings.set('sound', b.dataset.value === 'on');
    sound.setSoundEnabled(state.settings.get('sound'));
    sound.unlockAudio();
  } else if (key === 'clueStyle') {
    state.settings.set('clueStyle', b.dataset.value);
    state.renderer?.setClueStyle(b.dataset.value);
  }
  sound.play('tap');
  renderSettings();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#settings').hidden) closeSettings(); });

// 入力
const controls = new BoardControls($('#board-area'), {
  getGame: () => state.game,
  getRenderer: () => state.renderer,
  onResult: (res) => { sound.unlockAudio(); handleResult(res); },
  onUndoKey: undo,
  getMode: () => state.mode,
  getMemo: () => state.memo,
  onMemo: () => { sound.unlockAudio(); sound.play('tap'); refresh(); },
  isBlocked: () => hintPanel.isOpen || !$('#settings').hidden, // ヒント・設定の表示中は盤面を操作しない
  onBlocked: () => closeHint(),            // 盤面をタップしたらヒントを閉じるだけ
  onToggleMode: () => cycleMode(),         // M キー
});

// 画面サイズの変化に追従
const ro = new ResizeObserver(() => { fitBoard(); howto && howto.fit(); });
ro.observe($('#board-area'));
ro.observe($('#screen-howto'));

// ---------------- 起動 ----------------
async function boot() {
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
