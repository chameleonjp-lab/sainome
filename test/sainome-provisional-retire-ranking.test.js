import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootUrl = new URL('../', import.meta.url);
const sql = readFileSync(
  new URL(
    'supabase/migrations/20260819040000_sainome_provisional_retire_ranking.sql',
    rootUrl
  ),
  'utf8'
);

test('サイノメの開始記録を0点の仮リタイアとしてランキングへ登録する', () => {
  assert.match(
    sql,
    /if v_game_slug = 'sainome_300_seconds' and v_result_type = 'play' then/u
  );
  assert.match(sql, /v_play_id := pg_catalog\.gen_random_uuid\(\)::text/u);
  assert.match(
    sql,
    /insert into public\.game_play_events[\s\S]*?'retire',[\s\S]*?1,[\s\S]*?0,[\s\S]*?null,/u
  );
  assert.match(
    sql,
    /insert into public\.game_scores[\s\S]*?v_display_name,[\s\S]*?0,[\s\S]*?0,[\s\S]*?1,/u
  );
  assert.match(
    sql,
    /play_count = public\.game_scores\.play_count \+ 1/u
  );
  assert.match(sql, /'provisional_result_type', 'retire'/u);
  assert.match(sql, /'provisional_score', 0/u);
});

test('結果送信は仮リタイアを確定し、同じプレイを二重加算しない', () => {
  assert.match(
    sql,
    /gpe\.ranking_score is null[\s\S]*?gpe\.result_type in \('play', 'retire'\)/u
  );
  assert.match(
    sql,
    /v_final_result_type := case when p_score = 0 then 'retire' else 'clear' end/u
  );
  assert.match(
    sql,
    /update public\.game_play_events as gpe set[\s\S]*?ranking_score = p_score/u
  );
  assert.match(sql, /'source', 'sainome_provisional_retire'/u);

  const provisionalBlock = sql.match(
    /if v_provisional_event_id is not null then([\s\S]*?)if exists \(/u
  )?.[1];
  assert.ok(provisionalBlock, '仮リタイア確定処理が見つかりません');
  assert.doesNotMatch(
    provisionalBlock,
    /play_count\s*=\s*v_old_play_count\s*\+\s*1/u
  );

  assert.match(
    sql,
    /insert into public\.score_runs[\s\S]*?sainome_provisional_retire/u
  );
  assert.match(
    sql,
    /sr\.created_at >= v_now - interval '2 minutes'/u
  );
});

test('他ゲームの共通ランキング処理を維持する', () => {
  assert.match(
    sql,
    /insert into public\.game_play_events \([\s\S]*?v_result_type,[\s\S]*?1,[\s\S]*?coalesce\(p_client_version, ''\)/u
  );
  assert.match(
    sql,
    /insert into public\.score_runs \(normalized_name, game_slug, score, client_version, created_at\)/u
  );
  assert.match(
    sql,
    /play_count = v_old_play_count \+ 1/u
  );
});

test('過去の未完了開始記録も0点リタイアへ移行する', () => {
  assert.match(sql, /create temporary table sainome_unmatched_starts on commit drop/u);
  assert.match(sql, /lead\(gpe\.created_at\) over/u);
  assert.match(sql, /where not has_score_before_next_start/u);
  assert.match(
    sql,
    /update public\.game_play_events as gpe[\s\S]*?result_type = 'retire',[\s\S]*?ranking_score = 0/u
  );
  assert.match(
    sql,
    /count\(\*\)::integer[\s\S]*?on conflict \(normalized_name, game_slug\) do update/u
  );
});

test('公開RPCの既存署名と固定検索先を維持する', () => {
  assert.match(
    sql,
    /create or replace function public\.record_game_play\([\s\S]*?set search_path to ''/u
  );
  assert.match(
    sql,
    /create or replace function public\.submit_score\([\s\S]*?set search_path to ''/u
  );
  assert.doesNotMatch(sql, /create or replace function public\.record_game_play_v/u);
  assert.doesNotMatch(sql, /create or replace function public\.submit_score_v/u);
});
