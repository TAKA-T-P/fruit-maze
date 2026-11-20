// 画面遷移とゲーム進行の管理（エンジン・描画・入力・保存をつなぐ）
import { PuzzleGame, STATUS, MOVE } from './game.js';
import { BoardRenderer } from './renderer.js';
import { BoardControls } from './controls.js';
import { loadPuzzleLibrary, loadTutorialData, DIFFICULTIES } from './puzzle-loader.js';
import { createStore } from './storage.js';
import { getFruit, DEFAULT_FRUIT_ID } from './fruits.js';
import { Stopwatch, formatTime } from './timer.js';
import { HowTo } from './howto.js';
import { FRUITS } from './fruits.js';
import { clearStats, allFruitStatuses, unlockedFruitIds, createCollectionStore, pickRandomFruit, RANDOM_FRUIT_ID } from './collection.js';
import { allTrophyStatuses, getTrophy } from './trophies.js';
import { pendingRewards, markRewardsSeen, migrateFirstRun } from './rewards.js';
import { renderZukan, lockedDetail } from './collection-ui.js';
import { renderTrophies } from './trophy-ui.js';
import { RewardOverlay } from './reward-ui.js';
import { MemoBoard, nextMode } from './memo.js';
import { HintSession } from './hint.js';
import { HintPanel } from './hint-ui.js';
import { createSettings } from './settings.js';
import * as sound from './sound.js';
import { TimeAttack, TA_STATE, formatRemaining } from './challenge.js';
import { createChallengeStore } from './challenge-storage.js';
import { COUNTDOWN_STEP_MS, CLEAR_FX_MS, TIMEUP_MS, LOW_TIME_SECONDS } from './challenge-config.js';
import { titleFor, nextTitle, MASTER_TITLE_ID } from './challenge-titles.js';
import { renderTaSelect, renderTaIntro, renderTaResult, renderTaRecords } from './challenge-ui.js';
import { TransferDialog } from './transfer-ui.js';

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  library: null,
  store: createStore(),
  fruit: getFruit(DEFAULT_FRUIT_ID), // 選んでいるフルーツ（起動時に collection から復元）
  collection: createCollectionStore(), // 選んだフルーツ・演出を見たか（fruitMaze.collection.v1）
  level: null,
  puzzle: null,
  game: null,
  renderer: null,
  stopwatch: new Stopwatch(),
  lastPuzzleId: {},   // 難易度ごとの直前の問題（同じ問題の連続出題を避ける）
  stage: null,        // 遊んでいるステージ番号（1〜）
  hintUsed: false,    // このプレイでヒントを使ったか（ヒントなしでクリアしたステージだけ ★）
  fromRandom: false,  // 「ランダム」で始めたか（結果画面の「つぎの問題」の動きが変わる）
  resultTimer: null,
  memo: null,         // 推理メモ（問題ごとに新しく作る。保存しない）
  mode: 'route',      // 'route' | 'memo-on' | 'memo-off' | 'memo-erase'（1 つのボタンで順に切り替え）
  hint: null,         // HintSession
  tutorialData: null, // data/tutorial.json
  settings: createSettings(), // 効果音・マス数の表示（クリア記録とは別に保存）
  // ---- タイムアタック（通常モードの記録・ステージの ★ には影響しない） ----
  playMode: 'normal', // 'normal' | 'ta'
  ta: null,           // TimeAttack（1 回の挑戦）
  taLevel: 1,         // 選んでいるタイムアタックの難易度
  taStore: createChallengeStore(), // fruitMaze.timeAttack.v1
  taClock: null,      // 残り時間の表示更新（判定は Date.now と締め切りで行う）
  taTimer: null,      // カウントダウン・演出のあとの処理
  taBusy: false,      // 正解演出・時間切れ演出の間は盤面を操作しない
};
sound.setSoundEnabled(state.settings.get('sound'));

// ---------------- 画面切り替え ----------------
const screens = ['title', 'howto', 'select', 'stage', 'game', 'zukan', 'trophy', 'ta-select', 'ta-result', 'ta-records'];
function show(name) {
  // 図鑑を出るとき：見た「NEW!」は次から出さない
  if (name !== 'zukan' && $('#screen-zukan').classList.contains('active') && state.library) state.collection.markZukanSeen(unlockedNow());
  for (const s of screens) $(`#screen-${s}`).classList.toggle('active', s === name);
  if (name === 'title' && state.library) refreshFruit();
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
  if (action === 'zukan') openZukan();
  if (action === 'trophy') openTrophy();
  if (action === 'timeattack') openTaSelect();
});

// ---------------- あそびかた ----------------
let howto = null;
function openHowto() {
  if (!state.tutorialData) return;
  if (!howto || howto.fruit !== state.fruit) {
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
    const trophy = getTrophy(d.level);
    const earned = total > 0 && cleared === total;
    if (earned) btn.classList.add('complete');
    // ★・盤面サイズ・クリア数を 1 行にならべる
    btn.innerHTML = `
      <span class="level-stars" aria-label="むずかしさ ${d.level}">${d.stars}</span>
      <span class="level-size">${d.size}×${d.size}</span>
      <span class="level-progress">${!total ? '準備中' : earned
        ? `<span class="lv-trophy" aria-label="${trophy.name}トロフィー">${trophy.icon}</span> <b>${cleared}</b> / ${total}`
        : `クリア <b>${cleared}</b> / ${total}`}</span>
      ${earned ? '<span class="level-complete">コンプリート！</span>' : ''}`;
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
  const trophy = getTrophy(level);
  $('#stage-progress').innerHTML = cleared === list.length && list.length
    ? `<span class="lv-trophy">${trophy.icon}</span> コンプリート！ <b>${cleared}</b> / ${list.length}`
    : `クリア <b>${cleared}</b> / ${list.length}`;
  const lastId = state.lastPuzzleId[level];
  $('#stage-grid').replaceChildren(...list.map((p, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stage-btn';
    btn.dataset.stage = String(i + 1);
    btn.setAttribute('role', 'listitem');
    const done = state.store.isCleared(p.id);
    const star = done && state.store.isHintFreeCleared(p.id); // ★ はヒントなしでクリアしたときだけ
    if (done) btn.classList.add('cleared');
    if (p.id === lastId) btn.classList.add('last');
    btn.setAttribute('aria-label', `ステージ${i + 1}${done ? (star ? '（ヒントなしでクリアずみ）' : '（クリアずみ）') : ''}`);
    btn.innerHTML = `<span class="stage-no">${i + 1}</span>${star ? '<span class="stage-star" aria-hidden="true">★</span>' : ''}`;
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
  const ta = isTa();
  if (state.collection.isRandom()) applyFruit(pickRandomFruit(unlockedNow(), state.fruit.id)); // 「ランダム」：始めるたびに切り替える
  clearTimeout(state.resultTimer);
  state.level = puzzle.difficulty;
  state.puzzle = puzzle;
  if (!ta) state.lastPuzzleId[puzzle.difficulty] = puzzle.id; // タイムアタックの出題は通常モードの「前回」に入れない
  state.stage = stageOf(puzzle);
  // タイムアタックでは数字をこえて進める（こえた数字は赤。もう一つの青マスで数字がぴったりのときだけクリア）
  state.game = new PuzzleGame(puzzle, { allowClueOverflow: ta });
  state.memo = new MemoBoard(puzzle);   // 問題が変わったらメモは新しく
  state.hint = ta ? null : new HintSession(puzzle); // タイムアタックではヒントなし
  state.hintUsed = false;               // ステージを始めるたび（もういちど・次のステージを含む）にリセット
  closeHint();
  setMode('route');
  state.renderer = new BoardRenderer($('#board-area'), puzzle, state.fruit, { clueStyle: state.settings.get('clueStyle') });
  state.stopwatch.reset();
  const d = DIFFICULTIES.find((x) => x.level === puzzle.difficulty);
  $('#game-stars').textContent = d.stars;
  $('#game-size').textContent = ta ? `${puzzle.rows}×${puzzle.cols}` : `ステージ${state.stage}`; // 通常は盤面サイズは★で分かるので、ステージ番号だけ
  $('#screen-game').classList.toggle('ta-mode', ta);
  $('#ta-hud').hidden = !ta;
  hideResult();
  closeSettings();
  setMessage('');
  show('game');
  controls.setEnabled(true);
  fitBoard();
  refresh();
  if (ta) {
    // タイムアタック：ストップウォッチは使わず、残り時間を表示する
    state.stopwatch.reset();
    stopTicker();
    updateTaHud();
    renderTaTimer();
    return;
  }
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
  $('#btn-reset').disabled = (g.route.length === 0 && !state.memo.hasAny()) || cleared;
  $('#btn-hint-five').disabled = cleared;
  document.querySelectorAll('#ctrl-five .five-btn').forEach((b) => { b.disabled = cleared; });
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
  $('#screen-game').dataset.mode = mode;
  $('#screen-game').classList.toggle('memo-mode', mode !== 'route');
  document.querySelectorAll('#ctrl-five .five-btn').forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}
function cycleMode() {
  if (!state.game || state.game.status === STATUS.CLEARED) return;
  setMode(nextMode(state.mode));
  const tip = MODE_VIEW[state.mode].tip;
  setMessage(tip, 'hint', tip ? 1800 : 0);
}

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
  if (isTa() || !state.hint) return; // タイムアタックではヒントは使えない
  if (!state.game || state.game.status === STATUS.CLEARED) return;
  state.hintUsed = true; // ヒントを開いたら「ヒントを使った」（はじめからやり直しても、このプレイでは使ったまま）
  hintPanel.show();
  $('#game-ctrl').hidden = true;
  renderHint(state.hint.open(boardState())); // 盤面が変わっていなければ前回の段階のまま
}
function closeHint() {
  hintPanel.hide();
  $('#game-ctrl').hidden = false;
  if (state.renderer) state.renderer.clearHint(); // 閉じたら強調表示を消す（段階は HintSession が覚えている）
}
$('#btn-hint-five').addEventListener('click', () => { sound.play('tap'); openHint(); });
$('#ctrl-five').addEventListener('click', (e) => {
  const b = e.target.closest('.five-btn');
  if (!b || b.disabled || !state.game || state.game.status === STATUS.CLEARED) return;
  sound.play('tap');
  setMode(b.dataset.mode);
  const tip = MODE_VIEW[state.mode].tip;
  setMessage(tip, 'hint', tip ? 1800 : 0);
});


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
      if (g.status === STATUS.CLEARED) return isTa() ? onTaSolved() : onCleared();
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
      } else if (res.reason === 'not-endpoint') {
        // まだ道がない：青マスから始める
        state.renderer.nudge(res.row, res.col);
        setMessage('青マスから 道を はじめよう', 'hint', 1600);
      } else if (res.reason === 'memo-x') {
        // ×を付けたマスには進めない（×を消すと通れる）
        sound.play('error');
        state.renderer.nudge(res.row, res.col);
        setMessage('×のマスは とおれないよ。×を消すと とおれるよ', 'error', 1600);
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
  const rec = state.store.recordClear(state.puzzle.id, new Date(), { usedHint: state.hintUsed });
  // 報酬（フルーツ解放・トロフィー獲得）はまとめて判定し、クリア演出のあとに 1 回の流れで見せる
  const rewards = pendingRewards(currentStats(), state.collection, totalOf);
  const next = () => (rewards.isEmpty ? showResult(rec) : showRewards(rewards, () => showResult(rec)));
  state.resultTimer = setTimeout(next, 1500);
  // 演出中にタップしたら すぐ次へ
  const skip = () => { clearTimeout(state.resultTimer); next(); };
  $('#board-area').addEventListener('pointerdown', skip, { once: true });
  state.skipHandler = skip;
}

function showResult(rec) {
  if (state.skipHandler) { $('#board-area').removeEventListener('pointerdown', state.skipHandler); state.skipHandler = null; }
  const d = DIFFICULTIES.find((x) => x.level === state.level);
  $('#result-stars').textContent = d.stars;
  $('#result-time').textContent = formatTime(state.stopwatch.elapsed());
  // バッジ：「🎉 初クリア」「★ ヒントなし」を横にならべる（2 回め以降は回数を出さない）
  $('#result-badge').hidden = !rec.firstClear;
  $('#result-star').hidden = state.hintUsed;
  $('.result-badges').hidden = !rec.firstClear && state.hintUsed;
  // ヒントを使ったとき：ステージ選択の ★ はヒントなしでクリアしたときだけ付く
  const hintNote = $('#result-hint');
  hintNote.textContent = state.hintUsed ? '💡 ヒントなしでクリアすると ★ がつくよ' : '';
  hintNote.hidden = !state.hintUsed;
  $('#result-fruit').textContent = state.collection.isRandom() ? '🎲' : state.fruit.emoji;
  const many = unlockedNow().length > 1; // 解放済みのフルーツが 1 種類だけなら ◀ ▶ を出さない
  $('#result-fruit-prev').hidden = !many;
  $('#result-fruit-next').hidden = !many;
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
function updateTimer() { if (!isTa()) $('#game-timer').textContent = formatTime(state.stopwatch.elapsed()); }

// ボタン
function undo() {
  if (!state.game || state.game.status === STATUS.CLEARED) return;
  if (state.game.undo()) handleResult({ type: MOVE.UNDONE });
}
let resetArmed = null;
$('#btn-reset').addEventListener('click', () => {
  const btn = $('#btn-reset');
  if (!state.game || (state.game.route.length === 0 && !state.memo.hasAny())) return;
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
// クリア画面の ◀ ▶：解放済みのフルーツを 前・次に切り替える（ずかんの順）
function stepResultFruit(dir) {
  const ids = unlockedNow();
  if (ids.length <= 1) return;
  // ずかんの順で一周。最後は「ランダム」
  const order = [...FRUITS.map((f) => f.id).filter((id) => ids.includes(id)), RANDOM_FRUIT_ID];
  const cur = state.collection.isRandom() ? RANDOM_FRUIT_ID : state.fruit.id;
  const next = order[(order.indexOf(cur) + dir + order.length) % order.length];
  if (!selectFruit(next)) return;
  sound.play('tap');
  const el = $('#result-fruit');
  el.textContent = state.collection.isRandom() ? '🎲' : state.fruit.emoji;
  el.classList.remove('swap');
  void el.offsetWidth;
  el.classList.add('swap');
  state.renderer?.setFruit(state.fruit);
}
$('#result-fruit-prev').addEventListener('click', () => stepResultFruit(-1));
$('#result-fruit-next').addEventListener('click', () => stepResultFruit(1));
$('#btn-to-select').addEventListener('click', () => { sound.play('tap'); hideResult(); openStage(state.level); });

// 戻るボタン（各画面の左上）
document.addEventListener('click', (e) => {
  const back = e.target.closest('[data-back]');
  if (!back) return;
  sound.play('tap');
  if (back.dataset.back === 'stage' && isTa()) { openTaQuit(); return; } // タイムアタック中は確認してから
  disarmReset();
  closeSettings();
  if (back.dataset.back === 'title') show('title');
  if (back.dataset.back === 'select') openSelect();
  if (back.dataset.back === 'ta-select') openTaSelect();
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
  // プレイ画面から開いたときだけ「はじめから」を出し、盤面を隠してタイマーを止める
  const inGame = $('#screen-game').classList.contains('active') && !!state.game;
  if (inGame && isTa() && (!state.ta || !state.ta.isActive || state.taBusy)) return; // 終了・演出中は開かない
  if (inGame) closeHint();
  disarmReset();
  renderSettings();
  $('#btn-reset').hidden = !inGame;
  // タイトル画面から開いたときは「KEC数学科ラボへ」を出す
  $('#link-portal').hidden = !$('#screen-title').classList.contains('active');
  // 記録の引継ぎ：タイムアタック中は出さない（時間が進むため）
  $('#transfer-section').hidden = isTa();
  $('#settings').hidden = false;
  if (inGame && isTa()) {
    // タイムアタック：盤面は隠すが、時間は止まらない
    $('#screen-game').classList.add('settings-open');
  } else if (inGame) {
    $('#screen-game').classList.add('settings-open');
    state.stopwatch.pause();
    stopTicker();
    updateTimer();
  }
}
function closeSettings() {
  disarmReset();
  const wasOpen = !$('#settings').hidden;
  $('#settings').hidden = true;
  $('#screen-game').classList.remove('settings-open');
  if (wasOpen && state.stopwatch.paused) {
    state.stopwatch.resume();
    if (state.stopwatch.running) startTicker();
  }
}
$('#btn-settings').addEventListener('click', () => { sound.unlockAudio(); sound.play('tap'); openSettings(); });
$('#btn-settings-title').addEventListener('click', () => { sound.unlockAudio(); sound.play('tap'); openSettings(); });
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
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (transfer.isOpen) transfer.close();
  else if (!$('#settings').hidden) closeSettings();
  else if (!$('#ta-quit').hidden) closeTaQuit();
  else if (!$('#ta-howto').hidden) closeTaHowto();
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
  // ヒント・設定・やめる確認・タイムアタックの演出中は盤面を操作しない
  isBlocked: () => hintPanel.isOpen || !$('#settings').hidden || !$('#ta-quit').hidden || !$('#transfer').hidden || state.taBusy,
  onBlocked: () => closeHint(),            // 盤面をタップしたらヒントを閉じるだけ
  onToggleMode: () => cycleMode(),         // M キー
});

// 画面サイズの変化に追従
const ro = new ResizeObserver(() => { fitBoard(); howto && howto.fit(); });
ro.observe($('#board-area'));
ro.observe($('#screen-howto'));

// ---------------- タイムアタック ----------------
// 進行と時間の判定は TimeAttack（challenge.js）。ここでは画面・演出・記録の保存をつなぐ。
const isTa = () => state.playMode === 'ta';

function openTaSelect() {
  renderTaSelect($('#ta-level-list'), state.taStore, state.taLevel);
  show('ta-select');
}
// カードをタップ：むずかしさを えらぶだけ（「スタート」で始める）
$('#ta-level-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.ta-level-btn');
  if (!btn) return;
  sound.unlockAudio();
  sound.play('tap');
  state.taLevel = Number(btn.dataset.level);
  document.querySelectorAll('#ta-level-list .ta-level-btn').forEach((b) => {
    const on = b === btn;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-checked', String(on));
  });
});
// せつめい：えらんでいるむずかしさのルールを表示
$('#btn-ta-howto').addEventListener('click', () => {
  sound.unlockAudio();
  sound.play('tap');
  renderTaIntro($('#ta-intro'), state.taLevel, state.taStore);
  $('#ta-howto').hidden = false;
  $('#btn-ta-howto-close').focus({ preventScroll: true });
});
const closeTaHowto = () => { $('#ta-howto').hidden = true; };
$('#btn-ta-howto-close').addEventListener('click', () => { sound.play('tap'); closeTaHowto(); });
$('#ta-howto').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeTaHowto(); });
$('#btn-ta-records').addEventListener('click', () => {
  sound.play('tap');
  renderTaRecords($('#ta-records'), state.taStore);
  show('ta-records');
});
$('#btn-ta-start').addEventListener('click', () => { sound.unlockAudio(); sound.play('tap'); startTimeAttack(state.taLevel); });
$('#btn-ta-retry').addEventListener('click', () => { sound.unlockAudio(); sound.play('tap'); startTimeAttack(state.taLevel); });
$('#btn-ta-to-select').addEventListener('click', () => { sound.play('tap'); openTaSelect(); });
$('#btn-ta-to-title').addEventListener('click', () => { sound.play('tap'); show('title'); });

function startTimeAttack(level) {
  exitTa();
  const puzzles = state.library.list(level);
  if (!puzzles.length) return openTaSelect();
  state.taLevel = level;
  state.ta = new TimeAttack({ level, puzzles });
  state.playMode = 'ta';
  state.ta.startCountdown();
  // 3・2・1（この時間は制限時間に含めない）
  const ov = $('#ta-countdown');
  const num = $('#ta-count');
  let n = 3;
  ov.hidden = false;
  const step = () => {
    if (n === 0) {
      ov.hidden = true;
      loadTaPuzzle(state.ta.begin()); // ここから計測
      startTaClock();
      taFlash('スタート！', 'start', 600);
      return;
    }
    num.textContent = String(n);
    num.classList.remove('pop');
    void num.offsetWidth;
    num.classList.add('pop');
    sound.play('tap');
    n--;
    state.taTimer = setTimeout(step, COUNTDOWN_STEP_MS);
  };
  step();
}

function loadTaPuzzle(puzzle) {
  state.taBusy = false;
  startPuzzle(puzzle);
}

/** 残り時間の表示を 200ms ごとに更新（判定は締め切りの時刻で行うので、更新が遅れても時間は延びない） */
function startTaClock() {
  stopTaClock();
  state.taClock = setInterval(taTick, 200);
  taTick();
}
function stopTaClock() { clearInterval(state.taClock); state.taClock = null; }
function taTick() {
  const ta = state.ta;
  if (!ta || !isTa()) return stopTaClock();
  const events = ta.update(Date.now());
  if (events.includes('final')) onTaFinal();
  if (events.includes('timeup')) return onTaTimeUp();
  renderTaTimer();
}
// タブを切り替えて戻ってきたら、すぐに時刻を反映する
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.taClock) taTick(); });

function renderTaTimer() {
  const ta = state.ta;
  if (!ta) return;
  const box = $('.game-timer');
  const el = $('#game-timer');
  const final = ta.state === TA_STATE.FINAL || (ta.normalDeadline != null && ta.normalLeftMs(Date.now()) === 0);
  if (final) {
    el.textContent = '最終問題'; // ロスタイムの秒数は出さない
    box.classList.add('ta-final');
    box.classList.remove('ta-low');
  } else {
    const ms = ta.normalLeftMs(Date.now());
    el.textContent = formatRemaining(ms);
    box.classList.remove('ta-final');
    box.classList.toggle('ta-low', ms <= LOW_TIME_SECONDS * 1000);
  }
  box.setAttribute('aria-label', final ? '最終問題' : `のこり時間 ${el.textContent}`);
}

function updateTaHud() {
  const ta = state.ta;
  if (!ta) return;
  $('#ta-clears').textContent = String(ta.clears);
  const t = titleFor(ta.level, ta.clears);
  $('#ta-title').textContent = t ? `${t.icon} ${t.name}` : '';
  $('#ta-title').hidden = !t;
  const n = nextTitle(ta.level, ta.clears);
  $('#ta-next').textContent = n ? (n.title.id === MASTER_TITLE_ID ? `あと${n.remaining}問で ${n.title.icon}` : `次の称号まで あと${n.remaining}問`) : '';
  $('#ta-next').hidden = !n;
}

let taFlashTimer = null;
/** 「CLEAR!」「時間切れ」などを短く出す（盤面の操作はじゃましない） */
function taFlash(text, kind, ms) {
  const el = $('#ta-flash');
  el.textContent = text;
  el.className = `ta-flash ${kind}`;
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(taFlashTimer);
  taFlashTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/** 通常の制限時間が終わった：いまの問題がそのまま「最終問題」になる（ルート・メモはそのまま） */
function onTaFinal() {
  renderTaTimer(); // 残り時間の枠が「最終問題」になる（ポップアップは出さない）
  sound.play('goalMiss');
}

/** いまの問題を正解した */
function onTaSolved() {
  const ta = state.ta;
  const r = ta.solved(Date.now()); // 正解した時刻で判定
  if (r.type === 'ignored') return;
  state.taBusy = true;
  controls.setEnabled(false);
  refresh();
  sound.play('clear');
  state.renderer.celebrate();
  if (r.type === 'next') {
    updateTaHud();
    taFlash('CLEAR!', 'clear', CLEAR_FX_MS);
    state.taTimer = setTimeout(() => {
      if (state.ta !== ta || !ta.isActive) return; // 演出中に時間切れ・中断になったとき
      loadTaPuzzle(r.puzzle);
      if (r.final) onTaFinal(); // ちょうど 0 秒で正解：次の問題が最終問題
    }, CLEAR_FX_MS);
  } else if (r.reason === 'final-cleared') {
    // 最終問題をロスタイム内にクリア：1 問加算して結果へ（時間切れは出さない）
    stopTaClock();
    updateTaHud();
    taFlash('CLEAR!', 'clear', CLEAR_FX_MS + 300);
    state.taTimer = setTimeout(showTaResults, CLEAR_FX_MS + 300);
  } else {
    onTaTimeUp(); // ロスタイムを過ぎてからの正解は数えない
  }
}

/** 時間切れ：操作を止めて「時間切れ」を約 1 秒見せてから結果へ */
function onTaTimeUp() {
  stopTaClock();
  clearTimeout(state.taTimer);
  state.taBusy = true;
  controls.setEnabled(false);
  closeSettings();
  $('#ta-quit').hidden = true;
  renderTaTimer();
  taFlash('時間切れ', 'timeup', TIMEUP_MS);
  sound.play('goalMiss');
  state.taTimer = setTimeout(showTaResults, TIMEUP_MS);
}

function showTaResults() {
  const ta = state.ta;
  if (!ta || ta.state !== TA_STATE.FINISHED || ta.endReason === 'aborted') return; // 結果の表示・記録は 1 回だけ
  const result = state.taStore.recordResult(ta.level, ta.clears, new Date());
  ta.markResults();
  renderTaResult($('#ta-result'), { level: ta.level, clears: ta.clears, result, reason: ta.endReason });
  exitTa();
  show('ta-result');
  sound.play(result.newRecord || result.titleUp ? 'reward' : 'tap');
  $('#btn-ta-retry').focus({ preventScroll: true });
}

/** タイムアタックの表示・時計を片付けて、通常モードに戻す */
function exitTa() {
  stopTaClock();
  clearTimeout(state.taTimer);
  clearTimeout(taFlashTimer);
  state.playMode = 'normal';
  state.taBusy = false;
  $('#screen-game').classList.remove('ta-mode');
  $('#ta-hud').hidden = true;
  $('.game-timer').classList.remove('ta-low', 'ta-final');
  $('.game-timer').setAttribute('aria-label', 'タイム');
  $('#ta-countdown').hidden = true;
  $('#ta-flash').hidden = true;
  $('#ta-quit').hidden = true;
  closeSettings();
  controls.setEnabled(true);
}

// ---- 途中でやめる（確認中も時間は進む） ----
function openTaQuit() {
  if (!state.ta || !state.ta.isActive || state.taBusy) return;
  closeSettings();
  $('#ta-quit').hidden = false;
  $('#btn-ta-continue').focus({ preventScroll: true });
}
function closeTaQuit() { $('#ta-quit').hidden = true; }
$('#btn-ta-continue').addEventListener('click', () => { sound.play('tap'); closeTaQuit(); });
$('#btn-ta-quit').addEventListener('click', () => {
  sound.play('tap');
  if (state.ta) state.ta.abort(); // 途中でやめた挑戦は記録しない・回数にも数えない
  exitTa();
  openTaSelect();
});
$('#ta-quit').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeTaQuit(); });

// ---------------- フルーツコレクション・トロフィー ----------------
const totalOf = (level) => state.library.count(level);
/** クリア記録から数えた、ちがうステージのクリア数（累計・難易度別） */
const currentStats = () => clearStats(state.store.clearedIds(), (id) => state.library.get(id)?.difficulty);
const unlockedNow = () => unlockedFruitIds(currentStats());

/** 選んでいるフルーツを復元して、タイトル画面などに反映する */
function refreshFruit() {
  const unlocked = unlockedNow();
  if (state.collection.isRandom()) {
    // ランダム：いま表示しているフルーツはそのまま（まだゲットしていなければ選び直す）
    if (!unlocked.includes(state.fruit.id)) state.fruit = pickRandomFruit(unlocked);
  } else {
    state.fruit = state.collection.selectedFruit(unlocked);
  }
  applyFruit(state.fruit);
  const rnd = state.collection.isRandom();
  $('#title-fruit .cf-emoji').textContent = rnd ? '🎲' : state.fruit.emoji;
  $('#title-fruit .cf-name').textContent = rnd ? 'ランダム' : state.fruit.name;
  // 図鑑にまだ見ていない新しいフルーツがあれば「NEW」
  const seen = state.collection.zukanSeen();
  $('#zukan-badge').hidden = !unlockedNow().some((id) => id !== 'strawberry' && !seen.has(id));
}

/** 実際に表示するフルーツを変える（タイトルの飾り・ルートボタン・色） */
function applyFruit(fruit) {
  state.fruit = fruit;
  document.querySelectorAll('.deco-fruit, .logo-fruit, .play-fruit').forEach((el) => { el.textContent = fruit.emoji; });
  setMode(state.mode);
  document.documentElement.style.setProperty('--sel-fruit-color', fruit.color);
}

function selectFruit(id, { silent = false } = {}) {
  if (!state.collection.select(id, unlockedNow())) return false;
  refreshFruit();
  if (!silent) showToast(id === RANDOM_FRUIT_ID ? '🎲 ランダムに したよ！ ステージごとに フルーツが かわるよ' : `${state.fruit.emoji} ${state.fruit.name}を セットしたよ！`);
  return true;
}

let toastTimer = null;
function showToast(text, ms = 2200) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ---- 報酬の演出 ----
const rewardOverlay = new RewardOverlay($('#reward'));
function showRewards(rewards, done) {
  markRewardsSeen(state.collection, rewards); // 見せた時点で「見た」ことにする（とばしても報酬は失われない）
  rewardOverlay.show(rewards, {
    onUseFruit: (id) => selectFruit(id),
    onDone: () => { refreshFruit(); done && done(); },
  });
}

// ---- フルーツずかん ----
let zukanStatuses = [];
function openZukan() {
  renderZukanScreen();
  $('#zukan-detail').innerHTML = 'フルーツを タップすると、ばんめんの フルーツが かわるよ';
  $('#zukan-detail').classList.remove('locked-info');
  show('zukan');
}
function renderZukanScreen() {
  zukanStatuses = allFruitStatuses(currentStats()); // 開くたびにクリア記録から判定
  const seen = state.collection.zukanSeen();
  renderZukan({ count: $('#zukan-count'), gauge: $('#zukan-gauge'), grid: $('#zukan-grid') }, {
    statuses: zukanStatuses,
    selectedId: state.fruit.id,
    random: state.collection.isRandom(),
    newIds: new Set(zukanStatuses.filter((s) => s.unlocked && s.fruit.id !== 'strawberry' && !seen.has(s.fruit.id)).map((s) => s.fruit.id)),
  });
}
$('#zukan-grid').addEventListener('click', (e) => {
  const card = e.target.closest('.zukan-card');
  if (!card) return;
  if (card.dataset.id === RANDOM_FRUIT_ID) {
    sound.play('tap');
    $('#zukan-detail').classList.remove('locked-info');
    if (!state.collection.isRandom()) selectFruit(RANDOM_FRUIT_ID);
    else showToast('🎲 ランダムを つかっているよ');
    $('#zukan-detail').innerHTML = '<span class="zd-emoji" aria-hidden="true">🎲</span><b>ランダム</b>：ゲットした フルーツから、ステージを はじめるたびに えらぶよ';
    renderZukanScreen();
    return;
  }
  const st = zukanStatuses.find((s) => s.fruit.id === card.dataset.id);
  if (!st) return;
  if (!st.unlocked) {
    // 未獲得：音は鳴らさず、獲得条件だけを表示する
    $('#zukan-detail').innerHTML = lockedDetail(st);
    $('#zukan-detail').classList.add('locked-info');
    return;
  }
  $('#zukan-detail').classList.remove('locked-info');
  sound.play('tap');
  if (st.fruit.id !== state.fruit.id || state.collection.isRandom()) selectFruit(st.fruit.id);
  else showToast(`${st.fruit.emoji} ${st.fruit.name}を つかっているよ`);
  $('#zukan-detail').innerHTML = `<span class="zd-emoji" aria-hidden="true">${st.fruit.emoji}</span><b>${st.fruit.name}</b>で あそぼう！`;
  renderZukanScreen();
});

// ---- トロフィー ----
function openTrophy() {
  renderTrophies({ count: $('#trophy-count'), gauge: $('#trophy-gauge'), list: $('#trophy-list'), complete: $('#trophy-complete') },
    allTrophyStatuses(currentStats(), totalOf));
  show('trophy');
}

/** 起動時：選んだフルーツの復元、はじめての起動の処理、まだ見ていない報酬の演出 */
function initCollection() {
  const stats = currentStats();
  if (state.collection.isNew) {
    // 第4段階へのアップデート直後など：達成済みのものは演出せず、まとめて解放済みにして 1 回だけ知らせる
    const n = migrateFirstRun(stats, state.collection, totalOf);
    refreshFruit();
    if (n.newFruits > 0) setTimeout(() => showToast(`🎉 あたらしく ${n.newFruits}しゅるいの フルーツが つかえるようになったよ！`, 3600), 400);
    return;
  }
  refreshFruit();
  const rewards = pendingRewards(stats, state.collection, totalOf);
  if (!rewards.isEmpty) setTimeout(() => showRewards(rewards), 400); // 前回、演出の前にとじた場合など
}

// ---------------- 記録の引継ぎ ----------------
const TRANSFER_DONE = 'fruitMaze.transferDone'; // 再読み込みのあとで「記録を引きついだよ！」を出すための目印（sessionStorage）
const transfer = new TransferDialog($('#transfer'), {
  getBackend: () => { try { return window.localStorage; } catch { return null; } },
  onRestored: () => {
    // すべての記録を読みこみ直すため、ページを再読み込みする
    try { sessionStorage.setItem(TRANSFER_DONE, '1'); } catch { /* 出せなくてもよい */ }
    location.reload();
  },
  toast: (t) => showToast(t),
  sound: (n) => sound.play(n),
});
$('#btn-transfer-export').addEventListener('click', () => { sound.play('tap'); closeSettings(); transfer.openExport(); });
$('#btn-transfer-import').addEventListener('click', () => { sound.play('tap'); closeSettings(); transfer.openImport(); });
function showTransferDone() {
  try {
    if (sessionStorage.getItem(TRANSFER_DONE)) {
      sessionStorage.removeItem(TRANSFER_DONE);
      setTimeout(() => showToast('記録を引きついだよ！', 3000), 300);
    }
  } catch { /* なし */ }
}

// ---------------- 起動 ----------------
async function boot() {
  try {
    state.library = await loadPuzzleLibrary('data/puzzles.json');
    // あそびかた専用の問題（読めなければ、従来の例題 1 問だけで説明する）
    state.tutorialData = await loadTutorialData('data/tutorial.json').catch((err) => {
      console.warn(err);
      return { pages: { route: state.library.tutorial } };
    });
    initCollection();
    showTransferDone();
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
window.fruitMaze = { state, get howto() { return howto; }, currentStats, unlockedNow, taTick };
