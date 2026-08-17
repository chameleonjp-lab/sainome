import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootUrl = new URL('../', import.meta.url);
const sql = readFileSync(
  new URL('supabase/migrations/20260817170000_sainome_simple_name_ranking.sql', rootUrl),
  'utf8'
);

test('名前だけの開始・終了RPCを定義する', () => {
  assert.match(sql, /create or replace function public\.start_sainome_play\(/u);
  assert.match(sql, /create or replace function public\.submit_sainome_score\(/u);
  assert.match(sql, /grant execute on function public\.start_sainome_play/u);
  assert.match(sql, /grant execute on function public\.submit_sainome_score/u);
  assert.doesNotMatch(sql, /p_submission_id/u);
  assert.doesNotMatch(sql, /auth\.uid\(\)/u);
});

test('開始時に回数を増やし、未送信の開始行をランキングから除外する', () => {
  assert.match(sql, /play_count = private\.sainome_v2_scores\.play_count \+ 1/u);
  assert.match(sql, /has_submitted_score boolean not null default true/u);
  assert.match(sql, /and s\.has_submitted_score = true/u);
});
