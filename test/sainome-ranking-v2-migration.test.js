import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL(
  '../supabase/migrations/20260810120000_sainome_ranking_v2.sql',
  import.meta.url
), 'utf8');

test('v2移行は受付停止状態で専用ゲームとprivate台帳を用意する', () => {
  for (const table of [
    'sainome_v2_config',
    'sainome_v2_player_keys',
    'sainome_v2_plays',
    'sainome_v2_scores'
  ]) {
    assert.match(sql, new RegExp(`create table if not exists private\\.${table}`));
    assert.match(sql, new RegExp(`alter table private\\.${table} enable row level security`));
  }
  assert.match(sql, /accepting_runs,\s*\n\s*ranking_enable_not_before/);
  assert.match(sql, /'not measured; activation remains disabled'/);
  assert.match(sql, /'sainome_60_seconds'[\s\S]*?'desc', '点', false/);
  assert.match(sql, /'sainome_180_seconds'[\s\S]*?'desc', '点', false/);
});

test('v2 RPCの署名・時間窓・未検証応答を固定する', () => {
  assert.match(sql, /create or replace function public\.issue_sainome_play_v2\(\s*p_display_name text,\s*p_game_slug text,\s*p_client_version text,\s*p_contract_version text/s);
  assert.match(sql, /create or replace function public\.submit_score_once\(\s*p_display_name text,\s*p_game_slug text,\s*p_score integer,\s*p_client_version text,\s*p_submission_id text,\s*p_contract_version text/s);
  assert.match(sql, /create or replace function public\.get_sainome_ranking_v2\(\s*p_game_slug text,\s*p_limit integer/s);
  assert.match(sql, /interval '63 seconds'/);
  assert.match(sql, /interval '183 seconds'/);
  assert.match(sql, /interval '24 hours'/);
  assert.match(sql, /'unverified'::text as verification_status/);
  assert.match(sql, /v_now < v_play\.earliest_submit_at or v_now >= v_play\.expires_at/);
  assert.match(sql, /v_play\.status = 'accepted'/);
  assert.match(sql, /was_duplicate boolean/);
});

test('旧RPC・直接表書込み・公開権限からサイノメv2を迂回できない', () => {
  const oldGuardCount = (sql.match(/sainome requires the v2 ranking contract/g) ?? []).length;
  assert.equal(oldGuardCount, 2);
  assert.match(sql, /revoke insert, update, delete, truncate, trigger, references[\s\S]*?from public, anon, authenticated/);
  assert.match(sql, /revoke usage on schema private from public, anon, authenticated, service_role/);
  assert.match(sql, /revoke all on function public\.issue_sainome_play_v2\(/);
  assert.match(sql, /revoke all on function public\.submit_score_once\(/);
  assert.match(sql, /revoke all on function public\.get_sainome_ranking_v2\(/);
  assert.match(sql, /grant execute on function public\.issue_sainome_play_v2\([\s\S]*?\)\s*to authenticated/);
  assert.match(sql, /grant execute on function public\.submit_score_once\([\s\S]*?\)\s*to authenticated/);
  assert.match(sql, /grant execute on function public\.get_sainome_ranking_v2\([\s\S]*?\)\s*to anon, authenticated/);
  assert.doesNotMatch(sql, /supabase_secret|sb_secret_/i);
});

test('公開RPCはsearch_pathを固定し、UIDとサーバー発行番号へ結合する', () => {
  assert.equal((sql.match(/security definer\s*\nset search_path = ''/g) ?? []).length, 5);
  assert.match(sql, /v_uid uuid := auth\.uid\(\)/);
  assert.match(sql, /auth\.jwt\(\) ->> 'is_anonymous'/);
  assert.match(sql, /submission_id uuid primary key default gen_random_uuid\(\)/);
  assert.match(sql, /owner_uid uuid not null unique/);
  assert.match(sql, /p_submission_id !~ '\^\[0-9a-f\]/);
});

test('移行自身は本番有効化や既存shared-v1の変換を実行しない', () => {
  assert.doesNotMatch(sql, /accepting_runs\s*\)\s*values\s*\([^)]*true/i);
  assert.doesNotMatch(sql, /on conflict \(.*\) do update[\s\S]*?accepting_runs\s*=\s*true/i);
  assert.doesNotMatch(sql, /insert into private\.sainome_v2_plays[\s\S]*?shared-v1/i);
  assert.match(sql, /shared-v1/);
});
