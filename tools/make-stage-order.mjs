// 開発用：通常モードのステージの並び順（data/stage-order.json）を作る
//
//   node tools/make-stage-order.mjs          … 作成（data/puzzles.json は変更しない）
//   node tools/make-stage-order.mjs --check  … 今の評価と一致しているか確認だけ（不一致なら終了コード 1）
//
// 同じ ★ の中で、難易度評価（tools/rating.mjs の score）が低い順に並べる。
// → ステージ1〜10 は やさしい問題、ステージ41〜50 は むずかしい問題になる。
// 同点のときは 推理の段階数 → ルートの長さ → 問題 ID の順。
// 問題を追加・評価の重みを変更したあとは、このコマンドで作り直す。
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, readPuzzleFile } from './puzzle-io.mjs';
import { ratePuzzle } from './rating.mjs';

export const STAGE_ORDER_FILE = resolve(ROOT, 'data/stage-order.json');

const byId = (a, b) => a.localeCompare(b, 'en', { numeric: true });

/** 問題データから、難易度ごとのステージ順を計算する */
export function computeStageOrder(puzzles) {
  const rated = puzzles.map((p) => {
    const r = ratePuzzle(p);
    return { id: p.id, level: p.difficulty, score: r.score, stages: r.metrics.stages, route: r.metrics.routeLength };
  });
  const levels = {};
  const scores = {};
  for (const level of [...new Set(rated.map((x) => x.level))].sort((a, b) => a - b)) {
    const list = rated.filter((x) => x.level === level)
      .sort((a, b) => a.score - b.score || a.stages - b.stages || a.route - b.route || byId(a.id, b.id));
    levels[level] = list.map((x) => x.id);
    for (const x of list) scores[x.id] = x.score;
  }
  return { levels, scores };
}

export function formatStageOrder({ levels, scores }) {
  const lines = ['{', '  "version": 1,', '  "generatedBy": "tools/make-stage-order.mjs",',
    '  "basis": "同じ★の中で難易度評価（tools/rating.mjs の score）の低い順。同点は推理の段階数・ルート長・ID の順",', '  "levels": {'];
  const keys = Object.keys(levels);
  keys.forEach((k, i) => {
    lines.push(`    "${k}": [`);
    lines.push(levels[k].map((id) => `      ${JSON.stringify(id)}`).join(',\n'));
    lines.push(`    ]${i < keys.length - 1 ? ',' : ''}`);
  });
  lines.push('  },');
  lines.push(`  "scores": ${JSON.stringify(scores)}`);
  lines.push('}', '');
  const out = lines.join('\n');
  JSON.parse(out);
  return out;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
if (isMain) {
  const order = computeStageOrder(readPuzzleFile().puzzles);
  const text = formatStageOrder(order);
  if (process.argv.includes('--check')) {
    let current = '';
    try { current = readFileSync(STAGE_ORDER_FILE, 'utf8'); } catch { /* なし */ }
    if (current.replace(/\r\n/g, '\n') !== text) {
      console.error('✖ data/stage-order.json が今の評価と一致しません。node tools/make-stage-order.mjs で作り直してください');
      process.exit(1);
    }
    console.log('✔ data/stage-order.json は今の評価と一致しています');
  } else {
    writeFileSync(STAGE_ORDER_FILE, text, 'utf8');
    for (const [level, ids] of Object.entries(order.levels)) {
      const s = ids.map((id) => order.scores[id]);
      console.log(`★${level}: ${ids.length} 問  ステージ1 のスコア ${s[0]} 〜 ステージ${ids.length} のスコア ${s[s.length - 1]}`);
    }
    console.log('→ data/stage-order.json を書き出しました');
  }
}
