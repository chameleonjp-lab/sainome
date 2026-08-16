import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL(
  '../supabase/migrations/20260816090000_sainome_300_seconds.sql',
  import.meta.url
), 'utf8');

test('300秒ゲームを停止状態のランキングv2へ追加する', () => {
  assert.match(sql, /'sainome_300_seconds'/);
  assert.match(sql, /'サイノメ 300秒'/);
  assert.match(sql, /is_active, release_date/);
  assert.doesNotMatch(sql, /accepting_runs\s*=\s*true|is_active\s*=\s*true/i);
  assert.match(sql, /sainome_v2_plays_game_slug_check/);
  assert.match(sql, /sainome_v2_scores_game_slug_check/);
});

test('300秒の発行時間窓と各RPCの許可slugを固定する', () => {
  assert.match(sql, /when p_game_slug = 'sainome_180_seconds' then interval '183 seconds'\s*when p_game_slug = 'sainome_300_seconds' then interval '303 seconds'/);
  assert.match(sql, /create or replace function public\.issue_sainome_play_v2/);
  assert.match(sql, /create or replace function public\.submit_score_once/);
  assert.match(sql, /create or replace function public\.get_sainome_ranking_v2/);
  assert.match(sql, /'sainome_60_seconds', 'sainome_180_seconds', 'sainome_300_seconds'/);
});
