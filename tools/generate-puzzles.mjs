// 開発用：問題を追加生成して data/puzzles.json に書き出す
//
//   npm run generate                         ★1〜★5 を各 50 問になるまで追加生成
//   node tools/generate-puzzles.mjs --levels 4,5 --count 50 --seed 12345
//   node tools/generate-puzzles.mjs --levels 4 --count 20 --dry-run --report
//
// オプション
//   --levels 1,2,3,4,5  対象の難易度（既定：すべて）
//   --count N           各難易度の「目標収録数」（既存の問題を含む総数）。既定 50。
//                       すでに N 問以上あれば何もしない。何度実行しても N 問を超えない。
//   --seed N            乱数シード（既定 20261118）。同じデータ＋同じシードなら同じ問題が追加される
//   --append            追加生成（既定の動作。互換のため受け付ける）
//   --dry-run           ファイルを書き換えず、結果だけ表示する
//   --report            reports/ に品質レポート（CSV・JSON）を出力する
//   --max-minutes N     難易度ごとの生成時間の上限（既定 20 分）
//
// 既存の問題は削除・変更しない（ID も内容もそのまま）。新しい問題は既存の最大番号の続きの ID になる。

import { readPuzzleFile, writePuzzleFile, PUZZLE_FILE } from './puzzle-io.mjs';
import { generateLevel, LEVEL_CONF } from './puzzle-gen.mjs';
import { reportRow, writeReport, REPORT_DIR } from './report.mjs';
import { countSolutions } from './solver.mjs';

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (['append', 'dry-run', 'report'].includes(key)) o[key] = true;
    else o[key] = argv[++i];
  }
  return o;
}

const args = parseArgs(process.argv.slice(2));
const LEVELS = (args.levels || '1,2,3,4,5').split(',').map(Number).filter((l) => LEVEL_CONF[l]);
const COUNT = Number(args.count || 50);
const SEED = Number(args.seed || 20261118);
const MAX_MS = Number(args['max-minutes'] || 20) * 60_000;
const DRY = !!args['dry-run'];

const data = readPuzzleFile();
const before = new Map(data.puzzles.map((p) => [p.id, JSON.stringify(p)]));
const all = [...data.puzzles];
const results = {};
const t0 = Date.now();

for (const level of LEVELS) {
  const have = all.filter((p) => p.difficulty === level).length;
  console.log(`★${level}（${LEVEL_CONF[level].size}×${LEVEL_CONF[level].size}）: 収録 ${have} 問 → 目標 ${COUNT} 問`);
  if (have >= COUNT) { results[level] = { added: 0, millis: 0 }; continue; }
  const r = generateLevel({ level, target: COUNT, existing: all, seed: SEED, maxMillis: MAX_MS, log: (m) => console.log(m) });
  for (const { puzzle } of r.added) all.push(puzzle);
  results[level] = { added: r.added.length, total: r.total, attempts: r.attempts, millis: r.millis, rejects: r.rejects };
  console.log(`  → ${r.added.length} 問追加（候補 ${r.attempts} 個、${(r.millis / 1000).toFixed(1)} 秒）`);
  console.log(`    不採用の内訳: ${JSON.stringify(r.rejects)}`);
}

// 既存問題が変わっていないことを確認してから書き出す
for (const [id, json] of before) {
  const now = all.find((p) => p.id === id);
  if (!now || JSON.stringify(now) !== json) throw new Error(`既存問題 ${id} が変更されています。書き出しを中止しました`);
}

const out = { ...data, generatedBy: `tools/generate-puzzles.mjs (seed ${SEED})`, puzzles: all };
if (DRY) console.log('--dry-run のため、ファイルは書き換えていません');
else { writePuzzleFile(out); console.log(`→ ${PUZZLE_FILE}（合計 ${all.length} 問）`); }

if (args.report) {
  const rows = all.map((p) => reportRow(p, { solverStatus: countSolutions(p, { maxNodes: LEVEL_CONF[p.difficulty].maxNodes * 2 }).status }));
  writeReport(rows, { generation: { seed: SEED, totalMillis: Date.now() - t0, levels: results, dryRun: DRY } });
  console.log(`→ 品質レポート: ${REPORT_DIR}`);
}
console.log(`合計時間 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
