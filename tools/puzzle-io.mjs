// 開発用：data/puzzles.json の読み書き（盤面の各行を 1 行にまとめた読みやすい形式で書く）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PUZZLE_FILE = resolve(ROOT, 'data/puzzles.json');

export function readPuzzleFile(file = PUZZLE_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function fmt(p, indent) {
  const I = ' '.repeat(indent);
  const L = [];
  L.push(`${I}{`);
  L.push(`${I}  "id": ${JSON.stringify(p.id)},`);
  L.push(`${I}  "difficulty": ${p.difficulty},`);
  L.push(`${I}  "rows": ${p.rows},`);
  L.push(`${I}  "cols": ${p.cols},`);
  L.push(`${I}  "grid": [`);
  L.push(p.grid.map((row) => `${I}    ${JSON.stringify(row)}`).join(',\n'));
  L.push(`${I}  ],`);
  L.push(`${I}  "rowClues": ${JSON.stringify(p.rowClues)},`);
  L.push(`${I}  "colClues": ${JSON.stringify(p.colClues)},`);
  L.push(`${I}  "start": ${JSON.stringify(p.start)},`);
  L.push(`${I}  "goal": ${JSON.stringify(p.goal)},`);
  L.push(`${I}  "solution": ${JSON.stringify(p.solution)}`);
  L.push(`${I}}`);
  return L.join('\n');
}

/** 1 問を読みやすい JSON にする（indent はインデント幅） */
export const formatPuzzle = (p, indent = 4) => fmt(p, indent);

/** 問題の並び：難易度順、同じ難易度の中は ID 順（既存問題の順番は変わらない） */
export function sortPuzzles(puzzles) {
  return [...puzzles].sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id, 'en', { numeric: true }));
}

export function formatPuzzleFile(data) {
  const out = [
    '{',
    `  "version": ${data.version ?? 1},`,
    `  "generatedBy": ${JSON.stringify(data.generatedBy ?? 'tools/generate-puzzles.mjs')},`,
    '  "tutorial":',
    fmt(data.tutorial, 2) + ',',
    '  "puzzles": [',
    sortPuzzles(data.puzzles).map((p) => fmt(p, 4)).join(',\n'),
    '  ]',
    '}',
    '',
  ].join('\n');
  JSON.parse(out); // 書式チェック
  return out;
}

export function writePuzzleFile(data, file = PUZZLE_FILE) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, formatPuzzleFile(data), 'utf8');
}
