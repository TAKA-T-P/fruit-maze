// 効果音（Web Audio API で合成。音声ファイル不要）
// 将来 assets/sounds/ の音声ファイルに差し替える場合も、このモジュールの play() だけ変えればよい。

let ctx = null;
let enabled = true;

function audio() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, { start = 0, dur = 0.08, type = 'sine', gain = 0.12, slideTo = null } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  step: () => tone(660 + Math.random() * 40, { dur: 0.06, type: 'triangle', gain: 0.08 }),
  undo: () => tone(440, { dur: 0.06, type: 'triangle', gain: 0.06, slideTo: 330 }),
  error: () => { tone(200, { dur: 0.09, type: 'square', gain: 0.05 }); tone(160, { start: 0.08, dur: 0.1, type: 'square', gain: 0.05 }); },
  goalMiss: () => { tone(520, { dur: 0.1, type: 'triangle' }); tone(440, { start: 0.12, dur: 0.14, type: 'triangle' }); },
  clear: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { start: i * 0.09, dur: 0.18, type: 'triangle', gain: 0.12 })),
  // フルーツ解放・トロフィー獲得：キラキラ上がっていく音
  reward: () => [784, 988, 1175, 1568, 1319, 1568].forEach((f, i) => tone(f, { start: i * 0.07, dur: i === 5 ? 0.35 : 0.14, type: 'sine', gain: 0.1 })),
  tap: () => tone(880, { dur: 0.04, type: 'sine', gain: 0.05 }),
};

export function play(name) {
  if (!enabled) return;
  try { SOUNDS[name] && SOUNDS[name](); } catch { /* 音が出なくてもゲームは続ける */ }
}
export function setSoundEnabled(v) { enabled = !!v; }
export function isSoundEnabled() { return enabled; }
/** iOS などはユーザー操作中に AudioContext を起こす必要がある */
export function unlockAudio() { if (enabled) audio(); }
