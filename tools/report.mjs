// 開発用：品質レポート（CSV / JSON）の作成
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ratePuzzle } from './rating.mjs';
import { LEVEL_CONF, checkLevelFit } from './puzzle-gen.mjs';
import { ROOT } from './puzzle-io.mjs';

export const REPORT_DIR = resolve(ROOT, 'reports');

const FIT_LABEL = {
  'score-too-low': 'スコアが目標範囲より低い',
  'score-too-high': 'スコアが目標範囲より高い',
  'too-many-trials': '仮定による推理が多すぎる',
  'too-few-stages': '推理の段階数が少ない',
  'logic-unsolved': '推理ソルバーで解き切れない',
};

/**
 * 1 問ぶんの行を作る。
 * verdict: 採用（★の採用条件をすべて満たす）／要確認（収録済みだが条件の一部を外れる）／不採用（唯一解でない等）
 */
export function reportRow(p, { solverStatus, rating = ratePuzzle(p, { withSteps: true }) } = {}) {
  const fit = solverStatus !== 'unique' ? 'not-unique' : checkLevelFit(rating, LEVEL_CONF[p.difficulty]);
  const verdict = solverStatus !== 'unique' ? '不採用' : fit ? '要確認' : '採用';
  return {
    id: p.id,
    difficulty: p.difficulty,
    size: `${p.rows}x${p.cols}`,
    routeLength: rating.metrics.routeLength,
    branchPoints: rating.metrics.branchPoints,
    turns: rating.metrics.turns,
    blanks: rating.metrics.blanks,
    stages: rating.metrics.stages,
    trialSteps: rating.metrics.trialSteps,
    lineOnlyCells: rating.metrics.lineOnlyCells,
    score: rating.score,
    solutions: solverStatus === 'unique' ? 1 : solverStatus,
    verdict,
    note: fit === 'not-unique' ? '唯一解ではない' : fit ? FIT_LABEL[fit] || fit : '',
    startGoal: `${p.start.side}->${p.goal.side}`,
    parts: rating.parts,
    logic: rating.logic,
  };
}

const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function summarize(rows) {
  const levels = {};
  for (const lv of [1, 2, 3, 4, 5]) {
    const rs = rows.filter((r) => r.difficulty === lv);
    if (!rs.length) { levels[lv] = { count: 0 }; continue; }
    const stat = (k) => ({ avg: avg(rs.map((r) => r[k])), min: Math.min(...rs.map((r) => r[k])), max: Math.max(...rs.map((r) => r[k])) });
    const hist = {};
    for (const r of rs) { const b = `${Math.floor(r.score / 10) * 10}-${Math.floor(r.score / 10) * 10 + 9}`; hist[b] = (hist[b] || 0) + 1; }
    const sides = {};
    for (const r of rs) sides[r.startGoal] = (sides[r.startGoal] || 0) + 1;
    levels[lv] = {
      count: rs.length,
      verdicts: rs.reduce((o, r) => ((o[r.verdict] = (o[r.verdict] || 0) + 1), o), {}),
      score: stat('score'), stages: stat('stages'), routeLength: stat('routeLength'),
      branchPoints: stat('branchPoints'), turns: stat('turns'), blanks: stat('blanks'), trialSteps: stat('trialSteps'),
      scoreHistogram: Object.fromEntries(Object.entries(hist).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))),
      startGoalSides: sides,
      targetScore: LEVEL_CONF[lv].score,
    };
  }
  return { total: rows.length, levels };
}

const CSV_COLS = [
  ['id', '問題ID'], ['difficulty', '難易度'], ['size', '盤面サイズ'], ['routeLength', 'ルート長'], ['branchPoints', '分岐数'],
  ['turns', '方向転換数'], ['blanks', '空白マス数'], ['stages', '推理段階数'], ['trialSteps', '仮定の回数'], ['score', '難易度スコア'],
  ['solutions', '解答数'], ['verdict', '採用判定'], ['note', '備考'], ['startGoal', 'START→GOAL'],
];

/** reports/ に CSV（一覧）・JSON（集計＋指標）・推理過程（第3段階のヒント用）を書き出す */
export function writeReport(rows, extra = {}, dir = REPORT_DIR) {
  mkdirSync(dir, { recursive: true });
  const csv = [CSV_COLS.map(([, h]) => h).join(',')]
    .concat(rows.map((r) => CSV_COLS.map(([k]) => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(',')))
    .join('\r\n');
  writeFileSync(resolve(dir, 'puzzle-report.csv'), '﻿' + csv, 'utf8'); // BOM 付き（Excel で文字化けしない）
  const summary = summarize(rows);
  writeFileSync(resolve(dir, 'puzzle-report.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), ...extra, summary,
    puzzles: rows.map(({ logic, ...r }) => ({ ...r, logic: { status: logic.status, waves: logic.waves, trialWaves: logic.trialWaves, ruleCounts: logic.ruleCounts } })),
  }, null, 2), 'utf8');
  writeFileSync(resolve(dir, 'puzzle-analysis.json'), JSON.stringify(
    Object.fromEntries(rows.map((r) => [r.id, { status: r.logic.status, waves: r.logic.waves, steps: r.logic.steps }])),
  ), 'utf8');
  return summary;
}
