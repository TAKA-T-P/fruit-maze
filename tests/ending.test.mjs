import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trophyEnding, taEnding, ENDING_CREDIT } from '../js/ending.js';
import { masterClearsOf } from '../js/challenge-titles.js';

test('トロフィーのエンディング：5 つのトロフィーと、ヒントなしクリア数を順に見せる', () => {
  const e = trophyEnding({ totalOf: () => 50, hintFreeOf: (lv) => 50 - lv });
  assert.equal(e.id, 'trophy');
  assert.match(e.opening.sub, /全250ステージ/);
  assert.equal(e.items.length, 5);
  assert.deepEqual(e.items.map((it) => it.title), ['ブロンズトロフィー', 'シルバートロフィー', 'ゴールドトロフィー', 'プラチナトロフィー', 'マスタートロフィー']);
  e.items.forEach((it, i) => {
    assert.ok(it.lines.some((l) => l.includes('50ステージ')));
    assert.ok(it.lines.some((l) => l.includes(`ヒントなしクリア <b>${49 - i}</b>問`)));
  });
  assert.equal(e.credits.credit, ENDING_CREDIT);
  assert.equal(ENDING_CREDIT, '製作　T.TAKEMOTO / KEC Glows');
});

test('タイムアタックのエンディング：5 つの難易度の最高称号と最高記録を見せる', () => {
  const best = { 1: 12, 2: 9, 3: 5, 4: 4, 5: 3 };
  const e = taEnding(best);
  assert.equal(e.id, 'ta');
  assert.equal(e.items.length, 5);
  assert.deepEqual(e.items.map((it) => it.title), ['フルーツスピード王', 'フルーツひらめき王', 'フルーツ知恵の王', 'フルーツ太陽王', 'フルーツめいろの神']);
  e.items.forEach((it, i) => {
    assert.equal(it.icon, '👑');
    assert.ok(it.lines[0].includes(`<b>${best[i + 1]}</b>問`));
    assert.ok(best[i + 1] >= masterClearsOf(i + 1));
  });
  assert.match(e.items[0].kicker, /2分チャレンジ/);
});
