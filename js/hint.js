// 段階別ヒント（DOM 非依存）
//
// 現在の盤面（ルート・推理メモ）を調べ、次に考えるとよいことを 3 段階で返す。
//   ヒント1 … 注目する場所（行・列）
//   ヒント2 … 考え方・理由
//   ヒント3 … 確定するマス
//
// 優先順位
//   1. ルートのまちがい   … 今のルートが正解ルートの途中になっていない（このままでは解けない）
//   2. メモのまちがい     … ○・×が正解と合わない
//   3〜6. 推理            … deduce.js の推理を、今の盤面から始めて求める
//        3 数字だけで分かる（line-*）／4 つながりから分かる（degree-fill, dead-end）
//        5 複数の条件（loop, early-goal, unreachable）／6 仮定（trial）
//      早い段階で分かるものから順に、同じ段階の中では 3→6 の順。
//
// 正解ルート（solution）は「ルート・メモがまちがっているか」の判定にだけ使う。
// 推理のヒントは、必ず deduce.js の規則と根拠データから作る。
// まちがったメモを前提にして推理することはない（正しいと確認できたメモだけを前提にする）。

import { deduce } from './deduce.js';
import { swapEnds } from './game.js';

export const CATEGORY = {
  'route-wrong': 1, 'memo-wrong': 2,
  'line-zero': 3, 'line-all': 3, 'line-full': 3, 'line-remain': 3,
  'degree-fill': 4, 'degree-full': 4, 'dead-end': 4,
  'loop': 5, 'early-goal': 5, 'unreachable': 5,
  'trial': 6,
};

export const NO_NEW_HINT = '今のところ、新しく教えられるヒントはないよ。道を少し進めてみよう！';
export const ALL_KNOWN = '通るマスは、もうぜんぶ分かっているよ。もう一つの青マスまで道をつなげてみよう！';

// ---------- ことば ----------
export const lineName = ({ kind, index }) => (kind === 'row' ? `上から${index + 1}番目の行` : `左から${index + 1}番目の列`);
const lineWord = ({ kind }) => (kind === 'row' ? '行' : '列');
const onOff = (v) => (v === 'on' ? '通る' : '通らない');
const rowLine = (r) => ({ kind: 'row', index: r });
const colLine = (c) => ({ kind: 'col', index: c });

/** 強調表示のデータ。lines＝行・列の帯、clues＝数字、cells＝注目するマス、marks＝確定するマス */
function hl({ lines = [], clues = [], cells = [], marks = [] } = {}) {
  return { lines, clues, cells, marks };
}
function merge(...hs) {
  const out = hl();
  for (const h of hs) for (const k of Object.keys(out)) out[k].push(...(h[k] || []));
  return out;
}

/**
 * 矛盾の理由（deduce.js の contradiction）を、子ども向けのことばと強調表示にする。
 * phrase は「…なる」「…しまう」で終わる言い切りの形。
 */
export function explainContradiction(puzzle, code) {
  const cell = (s) => { const i = Number(s); return { row: (i / puzzle.cols) | 0, col: i % puzzle.cols }; };
  let m;
  if (code && (m = /^(row|col)(\d+)-(over|short)$/.exec(code))) {
    const line = { kind: m[1], index: Number(m[2]) };
    return {
      phrase: m[3] === 'over' ? `${lineName(line)}の数字をこえてしまう` : `${lineName(line)}の数字がそろわなくなる`,
      highlight: hl({ lines: [line], clues: [line] }),
    };
  }
  if (code === 'goal-unreachable') return { phrase: 'もう一つの青マスまで道がつながらなくなる', highlight: hl({ cells: [{ row: puzzle.goal.row, col: puzzle.goal.col }] }) };
  if (code === 'closed-early') return { phrase: '数字がそろう前に、もう一つの青マスに着いてしまう', highlight: hl({ cells: [{ row: puzzle.goal.row, col: puzzle.goal.col }] }) };
  if (code === 'cycle') return { phrase: '道が輪っかになってしまう', highlight: hl() };
  if (code && (m = /^degree-short@(\d+)$/.exec(code))) return { phrase: '道がとちゅうで行き止まりになってしまう', highlight: hl({ cells: [cell(m[1])] }) };
  if (code && (m = /^degree-over@(\d+)$/.exec(code))) return { phrase: '道が枝分かれしてしまう', highlight: hl({ cells: [cell(m[1])] }) };
  if (code && (m = /^unreachable-on@(\d+)$/.exec(code))) return { phrase: '通らなければいけないマスに、道がつながらなくなる', highlight: hl({ cells: [cell(m[1])] }) };
  return { phrase: 'ほかの条件とつじつまが合わなくなる', highlight: hl() };
}

// ---------- 盤面の分析 ----------
function prefixLength(route, solution) {
  let k = 0;
  while (k < route.length && k < solution.length && route[k][0] === solution[k][0] && route[k][1] === solution[k][1]) k++;
  return k;
}

function routeWrongHint(puzzle, route, k) {
  const res = deduce(puzzle, { initialState: { route } });
  const why = res.status === 'contradiction' && res.contradiction && res.contradiction !== 'conflict'
    ? explainContradiction(puzzle, res.contradiction) : null;
  const [br, bc] = route[k - 1];
  const back = route.length - k;
  const l2 = why
    ? { text: `このまま進むと、${why.phrase}よ。`, highlight: why.highlight }
    : { text: 'どこかで、正しい道からそれてしまったみたい。道を少しもどってみよう。', highlight: hl() };
  return {
    kind: 'route-wrong', key: `route:${k}:${route.length}`, rule: 'route-wrong', category: 1,
    targets: [{ row: br, col: bc, value: 'back' }],
    levels: [
      { text: '今の道だと、数字を全部そろえるのが難しそう。少し前の分かれ道を見直してみよう！', highlight: hl() },
      l2,
      { text: `光っているマスまで${back}回もどって、ちがう方向に進んでみよう！`, highlight: merge(l2.highlight, hl({ marks: [{ row: br, col: bc, tone: 'back' }] })) },
    ],
  };
}

function memoWrongHint({ row, col, value }) {
  const line = rowLine(row);
  const shouldBe = value === 'on' ? 'off' : 'on';
  const mark = value === 'on' ? '○' : '×';
  return {
    kind: 'memo-wrong', key: `memo:${row},${col},${value}`, rule: 'memo-wrong', category: 2,
    targets: [{ row, col, value: shouldBe }],
    levels: [
      { text: '○や×のメモの中に、見直したほうがいいものがあるみたい。', highlight: hl() },
      {
        text: value === 'off'
          ? `${lineName(line)}の×を見直してみよう。通らないと青マスどうしをつなげないマスに×が付いているよ。`
          : `${lineName(line)}の○を見直してみよう。通らないマスに○が付いているよ。`,
        highlight: hl({ lines: [line] }),
      },
      { text: `光っているマスの${mark}はまちがいだよ。ここは${onOff(shouldBe)}マスなんだ。`, highlight: hl({ lines: [line], marks: [{ row, col, tone: shouldBe }] }) },
    ],
  };
}

function cellsOfLine(puzzle, line) {
  const out = [];
  const n = line.kind === 'row' ? puzzle.cols : puzzle.rows;
  for (let k = 0; k < n; k++) {
    const [r, c] = line.kind === 'row' ? [line.index, k] : [k, line.index];
    if (puzzle.grid[r][c] === 1) out.push({ row: r, col: c });
  }
  return out;
}

function describeCell(puzzle, [r, c], head) {
  if (r === puzzle.start.row && c === puzzle.start.col) return '青マス';
  if (r === puzzle.goal.row && c === puzzle.goal.col) return '青マス';
  if (head && head[0] === r && head[1] === c) return '道の先';
  return null;
}

/** 推理ステップのまとまり（同じ段階・同じ規則・同じ行や同じマスから分かること）からヒントを作る */
function deductionHint(puzzle, g, head) {
  const marks = g.targets.map((t) => ({ row: t.row, col: t.col, tone: t.value }));
  const focus = g.targets.map((t) => ({ row: t.row, col: t.col }));
  const R = g.reason || {};
  const base = { kind: 'deduce', rule: g.rule, category: CATEGORY[g.rule] ?? 5, wave: g.wave, targets: g.targets, key: g.key, reason: R };

  if (g.rule.startsWith('line-')) {
    const L = R.line;
    const name = lineName(L);
    const lineHL = hl({ lines: [L] });
    const fruitsInLine = cellsOfLine(puzzle, L);
    // この推理の時点で「通る」と分かっているマス（青マス・ルート・○のメモ・それまでのヒントで分かったマス）
    const knownOn = fruitsInLine.filter(({ row, col }) => g.knownOn.has(`${row},${col}`));
    const ends = knownOn.map(({ row, col }) => describeCell(puzzle, [row, col], null)).filter((d) => d === '青マス');
    const endNote = ends.length ? '（青マスも1個に数えるよ）' : '';
    const l2 = {
      'line-zero': `${name}の数字は0だね。ということは……？`,
      'line-all': R.unknown === fruitsInLine.length
        ? `${name}にはフルーツが${R.clue}個あって、数字も${R.clue}だよ。ということは……？`
        : `${name}で、まだ分からないフルーツは${R.unknown}個。数字も${R.clue}だよ。ということは……？`,
      'line-full': `${name}の数字は${R.clue}。光っているマスで、もう${R.on}個通ることが分かっているね${endNote}。`,
      'line-remain': `${name}は、あと${R.clue - R.on}個通る必要があるね${endNote}。まだ分からないフルーツも${R.unknown}個だよ。`,
    }[g.rule];
    const l2focus = g.rule === 'line-full' || g.rule === 'line-remain' ? knownOn : focus;
    const l3 = {
      'line-zero': `この${lineWord(L)}は0個だから、どのフルーツも通らないよ！`,
      'line-all': `この${lineWord(L)}の光っているフルーツは、全部通るよ！`,
      'line-full': 'もう必要な数だけ通っているから、残りのフルーツは通らないよ！',
      'line-remain': 'あと必要な数と、残りのフルーツの数が同じだね。だから、光っているフルーツは全部通るよ！',
    }[g.rule];
    return {
      ...base,
      levels: [
        { text: `${name}に注目してみよう！`, highlight: lineHL },
        { text: l2, highlight: merge(lineHL, hl({ clues: [L], cells: l2focus })) },
        { text: l3, highlight: merge(lineHL, hl({ clues: [L], marks })) },
      ],
    };
  }

  if (g.rule === 'degree-fill') {
    const [fr, fc] = R.from;
    const desc = describeCell(puzzle, R.from, head);
    const lines = hl({ lines: [rowLine(fr), colLine(fc)] });
    const from = { row: fr, col: fc };
    const l1 = desc ? `${desc}のまわりに注目してみよう！` : '黄色い行と列が交わるマスのまわりに注目してみよう！';
    let l2;
    if (R.need === 1) l2 = `${desc}からつながる道は1本だけ。進める方向は1つしかないね。`;
    else if (R.connected === 1) l2 = `${desc || '光っているマス'}から次に進める方向は、1つしかないね。`;
    else l2 = '光っているマスは道が通るから、2つの方向につながるよ。でも、つながれる方向は2つしかないね。';
    return {
      ...base,
      levels: [
        { text: l1, highlight: lines },
        { text: l2, highlight: merge(lines, hl({ cells: [from] })) },
        { text: 'このマスから道をつなぐには、この方向しかないよ。だから、となりの光っているマスも通るよ！', highlight: merge(lines, hl({ cells: [from], marks })) },
      ],
    };
  }

  if (g.rule === 'dead-end') {
    const t = g.targets[0];
    const lines = hl({ lines: [rowLine(t.row)] });
    return {
      ...base,
      levels: [
        { text: `${lineName(rowLine(t.row))}に注目してみよう！`, highlight: lines },
        { text: '光っているマスのとなりで、道がつながれるところを数えてみよう。', highlight: merge(lines, hl({ cells: focus })) },
        { text: 'ここを通ると行き止まりになってしまうよ。だから、このマスは通らないよ！', highlight: merge(lines, hl({ marks })) },
      ],
    };
  }

  if (g.rule === 'unreachable') {
    const rows = [...new Set(g.targets.map((t) => t.row))].map(rowLine);
    const start = { row: puzzle.start.row, col: puzzle.start.col };
    return {
      ...base,
      levels: [
        { text: '青マスからの道のつながりを考えてみよう！', highlight: hl({ lines: rows }) },
        { text: '光っているマスまで、青マスから道をつなげられるかな？', highlight: hl({ lines: rows, cells: [...focus, start] }) },
        { text: 'ここには青マスから道がつながらないよ。だから、光っているマスは通らないよ！', highlight: hl({ lines: rows, cells: [start], marks }) },
      ],
    };
  }

  if (g.rule === 'trial') {
    const t = g.targets[0];
    const lines = hl({ lines: [rowLine(t.row)] });
    const why = explainContradiction(puzzle, R.contradiction);
    return {
      ...base,
      levels: [
        { text: `${lineName(rowLine(t.row))}に注目してみよう！`, highlight: lines },
        { text: `もし光っているマスを「${onOff(R.assumed)}」としたら、どうなるか考えてみよう。`, highlight: merge(lines, hl({ cells: focus })) },
        { text: `もしここを${onOff(R.assumed)}とすると、${why.phrase}。だから、このマスは${onOff(t.value)}よ！`, highlight: merge(lines, why.highlight, hl({ marks })) },
      ],
    };
  }

  // loop / early-goal など（線についての推理。マスが決まる場合の予備）
  const t = g.targets[0];
  const lines = hl({ lines: [rowLine(t.row)] });
  const say = {
    loop: 'この道をつなぐと輪っかになってしまうよ。',
    'early-goal': '今ここをつなぐと、数字がそろう前に、もう一つの青マスに着いてしまうよ。',
  }[g.rule] || '道のつながりから考えてみよう。';
  return {
    ...base,
    levels: [
      { text: `${lineName(rowLine(t.row))}に注目してみよう！`, highlight: lines },
      { text: say, highlight: merge(lines, hl({ cells: focus })) },
      { text: `だから、光っているマスは${onOff(t.value)}よ！`, highlight: merge(lines, hl({ marks })) },
    ],
  };
}

/** deduce の steps を、ヒント 1 つ分ずつのまとまりにする */
function groupSteps(steps) {
  const groups = new Map();
  steps.forEach((s, order) => {
    if (s.rule === 'connect') return; // 説明できる根拠がない（線の結果として決まった）ものは使わない
    const R = s.reason || {};
    let id;
    if (s.rule.startsWith('line-')) id = `${R.line.kind}${R.line.index}`;
    else if (s.rule === 'degree-fill') id = `from${R.from[0]},${R.from[1]}`;
    else if (s.rule === 'unreachable') id = 'all';
    else id = `cell${s.row},${s.col}`;
    const gk = `${s.wave}|${s.rule}|${id}`;
    if (!groups.has(gk)) groups.set(gk, { wave: s.wave, rule: s.rule, reason: s.reason, order, targets: [] });
    groups.get(gk).targets.push({ row: s.row, col: s.col, value: s.value });
  });
  const list = [...groups.values()];
  for (const g of list) g.key = `${g.rule}|${g.targets.map((t) => `${t.row},${t.col}=${t.value}`).join(';')}`;
  return list.sort((a, b) => a.wave - b.wave || (CATEGORY[a.rule] ?? 5) - (CATEGORY[b.rule] ?? 5) || a.order - b.order);
}

/**
 * 現在の盤面を分析し、ヒントの候補を優先順に返す（盤面は変更しない）。
 * @param {object} puzzle
 * @param {{route: number[][], memo?: Array<{row:number, col:number, value:'on'|'off'}>, cleared?: boolean}} board
 * @returns {{ status: 'cleared'|'route-wrong'|'memo-wrong'|'ok', candidates: object[], allKnown: boolean }}
 */
export function analyzeBoard(puzzle, board) {
  // どちらの青マスから始めてもよいので、道を始めた青マスを start とした向きで考える（まだ道がなければ start から）
  const { route, memo = [], cleared = false } = orient(puzzle, board);
  if (route.fromGoal) puzzle = swapEnds(puzzle);
  if (cleared) return { status: 'cleared', candidates: [], allKnown: true };
  const sol = puzzle.solution;
  const k = prefixLength(route, sol);

  // 1. ルートのまちがい（正解ルートの途中になっていなければ、この先どう進んでも解けない）
  if (k < route.length) return { status: 'route-wrong', candidates: [routeWrongHint(puzzle, route, k)], allKnown: false };

  // 2. メモのまちがい（今のルートから推理して早く分かるマスから順に）
  const onSol = new Set(sol.map(([r, c]) => `${r},${c}`));
  const wrong = memo.filter((e) => (e.value === 'on') !== onSol.has(`${e.row},${e.col}`));
  if (wrong.length) {
    const res = deduce(puzzle, { initialState: { route } });
    const waveOf = new Map(res.steps.map((s) => [`${s.row},${s.col}`, s.wave]));
    const w = (e) => waveOf.get(`${e.row},${e.col}`) ?? Infinity;
    wrong.sort((a, b) => w(a) - w(b) || a.row - b.row || a.col - b.col);
    return { status: 'memo-wrong', candidates: wrong.map(memoWrongHint), allKnown: false };
  }

  // 3〜6. 推理（ルートと、正しいと確認できたメモを前提にする）
  const res = deduce(puzzle, {
    initialState: {
      route,
      on: memo.filter((e) => e.value === 'on').map((e) => [e.row, e.col]),
      off: memo.filter((e) => e.value === 'off').map((e) => [e.row, e.col]),
    },
  });
  if (res.status === 'contradiction') return { status: 'ok', candidates: [], allKnown: false }; // 起こらないはず（念のため）
  const head = route[route.length - 1];
  const initOn = [
    `${puzzle.start.row},${puzzle.start.col}`, `${puzzle.goal.row},${puzzle.goal.col}`,
    ...route.map(([r, c]) => `${r},${c}`),
    ...memo.filter((e) => e.value === 'on').map((e) => `${e.row},${e.col}`),
  ];
  const candidates = groupSteps(res.steps).map((g) => {
    // その推理の時点で「通る」と分かっているマス（説明・強調に使う）
    g.knownOn = new Set([...initOn, ...res.steps.filter((s) => s.wave < g.wave && s.value === 'on').map((s) => `${s.row},${s.col}`)]);
    return deductionHint(puzzle, g, head);
  });
  return { status: 'ok', candidates, allKnown: res.status === 'solved' && res.steps.length === 0 };
}

/** ヒント用に道の向きをそろえる。道がまだなければ、start 側の青マスだけを通った状態として考える */
function orient(puzzle, board) {
  const route = [...(board.route || [])];
  const { start, goal } = puzzle;
  if (!route.length) route.push([start.row, start.col]);
  route.fromGoal = route[0][0] === goal.row && route[0][1] === goal.col;
  return { ...board, route };
}

function noneHint(text) {
  return { kind: 'none', key: `none:${text}`, rule: 'none', category: 99, targets: [], levels: [{ text, highlight: hl() }] };
}

const signature = ({ route, memo = [], cleared = false }) =>
  `${cleared ? 'C' : ''}${route.map((x) => x.join(',')).join(' ')}|${memo.map((e) => `${e.row},${e.col}${e.value[1]}`).join(' ')}`;

/**
 * 1 問ぶんのヒントの進み具合を管理する。
 *   open(board)  … ヒントを開く。盤面が変わっていなければ前回の段階のまま。変わっていれば再評価する
 *   more()       … 次の段階（ヒント2・3）へ
 *   next(board)  … ヒント3まで見たあと、別のヒントへ
 * 表示するだけで、ルートやメモは変更しない。
 */
export class HintSession {
  constructor(puzzle) {
    this.puzzle = puzzle;
    this.reset();
  }
  reset() {
    this.current = null;
    this.level = 0;
    this.sig = null;
    this.seen = new Set();
  }

  open(board) {
    const sig = signature(board);
    if (this.current && sig === this.sig) return this.view();
    const a = analyzeBoard(this.puzzle, board);
    this.sig = sig;
    const same = this.current && a.candidates.find((c) => c.key === this.current.key);
    if (same) {
      this.current = same; // 同じ推理がまだ有効なら、表示済みの段階を保つ
    } else {
      this.current = this._pick(a);
      this.level = 1;
    }
    return this.view();
  }

  more() {
    if (this.current && this.level < this.current.levels.length) this.level++;
    return this.view();
  }

  next(board) {
    if (this.current) this.seen.add(this.current.key);
    const a = analyzeBoard(this.puzzle, board);
    this.sig = signature(board);
    this.current = this._pick(a);
    this.level = 1;
    return this.view();
  }

  _pick(a) {
    if (a.status === 'cleared') return noneHint('クリアおめでとう！');
    const fresh = a.candidates.find((c) => !this.seen.has(c.key));
    if (fresh) return fresh;
    // まちがいの指摘は、直るまで出し続ける（推理のヒントに進まない）
    if (a.status !== 'ok' && a.candidates.length) return a.candidates[0];
    return noneHint(a.allKnown ? ALL_KNOWN : NO_NEW_HINT);
  }

  view() {
    if (!this.current) return null;
    const lv = this.current.levels[this.level - 1];
    return {
      kind: this.current.kind,
      key: this.current.key,
      rule: this.current.rule,
      level: this.level,
      total: this.current.levels.length,
      text: lv.text,
      highlight: lv.highlight,
      targets: this.current.targets,
      canMore: this.level < this.current.levels.length,
      // ルートのまちがいは 1 つだけなので「次のヒント」はない（直すまで同じ指摘になる）
      canNext: this.level >= this.current.levels.length && this.current.kind !== 'none' && this.current.kind !== 'route-wrong',
    };
  }
}
