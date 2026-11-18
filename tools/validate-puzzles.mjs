// 開発用：収録問題の一括検証
//   npm run validate-puzzles            検証のみ（問題があれば ID と理由を表示し、終了コード 1）
//   npm run report                      検証＋品質レポート（reports/）を出力
//
// 検証項目
//   1. JSON 形式           2. ID の重複          3. 難易度と盤面サイズの一致
//   4〜6. 数字・START/GOAL・正解ルートの整合性（validatePuzzle）
//   7. 唯一解（全解探索が最後まで完了し、解がちょうど 1 つ。上限到達は不合格）
//   8. 重複（回転・反転・START/GOAL 入れ替えを同一視）
//   9. 難易度評価を取得できる（推理ソルバーで最後まで解ける）

import { readFileSync } from 'node:fs';
import { PUZZLE_FILE } from './puzzle-io.mjs';
import { validatePuzzle } from '../js/puzzle-utils.js';
import { countSolutions } from './solver.mjs';
import { canonicalKey } from './symmetry.mjs';
import { ratePuzzle } from './rating.mjs';
import { LEVEL_CONF } from './puzzle-gen.mjs';
import { reportRow, writeReport, REPORT_DIR } from './report.mjs';

const wantReport = process.argv.includes('--report');
const t0 = Date.now();
const errors = [];
const warnings = [];
const fail = (id, msg) => errors.push(`${id}: ${msg}`);

let data;
try {
  data = JSON.parse(readFileSync(PUZZLE_FILE, 'utf8'));
} catch (e) {
  console.error(`✖ JSON を読めません: ${e.message}`);
  process.exit(1);
}

const all = [...(data.puzzles || [])];
const ids = new Map();
const keys = new Map();
const rows = [];
let maxNodes = 0;

for (const p of [data.tutorial, ...all]) {
  const id = p?.id ?? '(no id)';
  const isTutorial = p === data.tutorial;
  // 2. ID
  if (!isTutorial) {
    if (ids.has(id)) fail(id, 'ID が重複しています');
    ids.set(id, true);
  }
  // 4〜6
  const errs = validatePuzzle(p);
  if (errs.length) { errs.forEach((e) => errors.push(e)); continue; }
  // 3. サイズ
  const conf = LEVEL_CONF[p.difficulty];
  if (!isTutorial && (p.rows !== conf.size || p.cols !== conf.size)) fail(id, `★${p.difficulty} は ${conf.size}×${conf.size} のはずが ${p.rows}×${p.cols}`);
  // 7. 唯一解
  const res = countSolutions(p, { maxNodes: conf.maxNodes * 2 });
  maxNodes = Math.max(maxNodes, res.nodes);
  if (res.status !== 'unique') fail(id, `唯一解ではありません（${res.status === 'unknown' ? '探索が上限に達し検証できない' : res.status === 'multiple' ? '別解あり' : '解なし'}）`);
  else if (JSON.stringify(res.solutions[0]) !== JSON.stringify(p.solution)) fail(id, '唯一の解が solution と一致しません');
  // 8. 重複
  const key = canonicalKey(p);
  if (keys.has(key)) fail(id, `${keys.get(key)} と同じ問題です（回転・反転を含む）`);
  keys.set(key, id);
  // 9. 難易度評価
  const rating = ratePuzzle(p, { withSteps: wantReport });
  if (!rating.evaluable) fail(id, `難易度評価ができません: ${rating.reason}`);
  if (!isTutorial) {
    const row = reportRow(p, { solverStatus: res.status, rating });
    if (row.verdict === '要確認') warnings.push(`${id}: ${row.note}（スコア ${row.score}、段階 ${row.stages}、仮定 ${row.trialSteps}）`);
    rows.push(row);
  }
}

const counts = [1, 2, 3, 4, 5].map((l) => `★${l}: ${all.filter((p) => p.difficulty === l).length}`).join('  ');
console.log(`収録 ${all.length} 問（${counts}）`);
console.log(`検証時間 ${((Date.now() - t0) / 1000).toFixed(1)} 秒、全解探索の最大ノード数 ${maxNodes}`);
if (warnings.length) {
  console.log(`\n要確認 ${warnings.length} 問（収録は可。★の目標範囲から外れている）:`);
  warnings.forEach((w) => console.log('  - ' + w));
}
if (wantReport) {
  writeReport(rows, { validation: { errors, warnings } });
  console.log(`\n→ 品質レポート: ${REPORT_DIR}`);
}
if (errors.length) {
  console.log(`\n✖ ${errors.length} 件の問題があります:`);
  errors.forEach((e) => console.log('  - ' + e));
  process.exit(1);
}
console.log('\n✔ すべての問題が検証に合格しました（形式・ID・サイズ・数字・ルート・唯一解・重複・難易度評価）');
