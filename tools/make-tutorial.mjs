// 開発用：あそびかた（チュートリアル）専用の問題を選んで data/tutorial.json に書き出す
//   node tools/make-tutorial.mjs
// 本編の data/puzzles.json は変更しない。選ぶ条件はページの練習内容に合わせる。
// どの問題も「唯一解（全解探索）」「推理ソルバーで解ける」「本編と重複しない」を確認する。

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeCandidate, levelRng } from './puzzle-gen.mjs';
import { countSolutions } from './solver.mjs';
import { deduce } from '../js/deduce.js';
import { analyzeBoard } from '../js/hint.js';
import { PuzzleGame, MOVE } from '../js/game.js';
import { canonicalKey } from './symmetry.mjs';
import { readPuzzleFile, formatPuzzle, ROOT } from './puzzle-io.mjs';

export const TUTORIAL_FILE = resolve(ROOT, 'data/tutorial.json');

const firstWave = (p) => deduce(p).steps.filter((s) => s.wave === 1);
const lineGroup = (steps, rule) => {
  const g = {};
  for (const s of steps.filter((x) => x.rule === rule)) {
    const k = `${s.reason.line.kind}${s.reason.line.index}`;
    (g[k] ||= []).push(s);
  }
  return Object.values(g).sort((a, b) => b.length - a.length)[0] || [];
};

/** ページごとの条件 */
export const PAGE_RULES = {
  // 1〜3ページ：数字の意味・ルートをつなぐ・通れない道。START のとなりに「数字をこえるので進めない」マスと、空白マスがある
  route: (p, r) => {
    if (r.trialWaves > 0 || r.waves > 5) return false;
    const g = new PuzzleGame(p);
    const blocked = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => g.check(p.start.row + dr, p.start.col + dc).type === MOVE.BLOCKED);
    return blocked && p.grid.flat().includes(0) && p.rowClues.some((x) => x >= 3);
  },
  // 4ページ：数字から推理。フルーツの数と数字が同じ（3 個以上）の行・列がある
  deduce: (p, r) => r.trialWaves === 0 && lineGroup(firstWave(p), 'line-all').length >= 3,
  // 5ページ：推理メモ。数字が 0 の行・列にフルーツが 2 個以上ある（×を付ける練習）
  memo: (p, r) => r.trialWaves === 0 && lineGroup(firstWave(p), 'line-zero').length >= 2,
  // 6ページ：ヒント。最初のヒントが「数字だけで分かる」もので、3 段階を体験できる
  hint: (p, r) => r.trialWaves === 0 && r.waves >= 4 && (() => {
    const c = analyzeBoard(p, { route: [p.solution[0]], memo: [] }).candidates[0];
    return c && c.rule.startsWith('line-');
  })(),
  // 7ページ：ミニチャレンジ。少しだけ考える 4×4
  challenge: (p, r) => r.trialWaves === 0 && r.waves >= 4 && p.solution.length >= 9,
};

export function makeTutorial(seed = 777) {
  const main = readPuzzleFile();
  const keys = new Set(main.puzzles.map(canonicalKey));
  const rand = levelRng(seed, 1);
  const pages = {};
  for (let i = 0; i < 20000 && Object.keys(pages).length < Object.keys(PAGE_RULES).length; i++) {
    const { puzzle, reject } = makeCandidate(rand, 1);
    if (reject) continue;
    const key = canonicalKey(puzzle);
    if (keys.has(key)) continue;
    if (countSolutions(puzzle).status !== 'unique') continue;
    const r = deduce(puzzle);
    if (r.status !== 'solved') continue;
    for (const [name, ok] of Object.entries(PAGE_RULES)) {
      if (pages[name] || !ok(puzzle, r)) continue;
      pages[name] = { ...puzzle, id: `tutorial-${name}` };
      keys.add(key);
      break;
    }
  }
  return { version: 1, note: 'あそびかた専用の問題（本編の問題・クリア記録とは別）。tools/make-tutorial.mjs で作成', pages };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('make-tutorial.mjs')) {
  const data = makeTutorial();
  const missing = Object.keys(PAGE_RULES).filter((k) => !data.pages[k]);
  if (missing.length) throw new Error(`条件に合う問題が見つかりません: ${missing.join(', ')}`);
  const order = Object.keys(PAGE_RULES);
  const body = [
    '{',
    `  "version": ${data.version},`,
    `  "note": ${JSON.stringify(data.note)},`,
    '  "pages": {',
    order.map((k) => `    ${JSON.stringify(k)}:\n${formatPuzzle(data.pages[k], 4)}`).join(',\n'),
    '  }',
    '}',
    '',
  ].join('\n');
  JSON.parse(body);
  writeFileSync(TUTORIAL_FILE, body, 'utf8');
  for (const [k, p] of Object.entries(data.pages)) console.log(k.padEnd(10), p.id, `start ${p.start.side} → goal ${p.goal.side}`, 'rows', p.rowClues.join(','), 'cols', p.colClues.join(','));
  console.log(`→ ${TUTORIAL_FILE}`);
}
