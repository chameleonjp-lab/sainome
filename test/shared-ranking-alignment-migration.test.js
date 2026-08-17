import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL(
  '../supabase/migrations/20260817133002_align_sainome_with_shared_ranking.sql',
  import.meta.url
), 'utf8');

function functionBody(name, nextMarker) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const end = nextMarker ? sql.indexOf(nextMarker, start) : sql.length;
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${name} must have an end marker`);
  return sql.slice(start, end);
}

const submitSql = functionBody(
  'submit_score',
  'create or replace function public.get_best_score_ranking('
);
const rankingSql = functionBody(
  'get_best_score_ranking',
  'create or replace function public.start_sainome_play('
);
const legacyStartSql = functionBody(
  'start_sainome_play',
  'create or replace function public.submit_sainome_score('
);
const legacySubmitSql = functionBody(
  'submit_sainome_score',
  'create or replace function public.get_sainome_ranking_v2('
);
const legacyRankingSql = functionBody(
  'get_sainome_ranking_v2',
  'revoke all on function public.start_sainome_play('
);

test('共通ランキングのサイノメ拒否を除去する', () => {
  assert.doesNotMatch(submitSql, /sainome requires the v2 ranking contract/);
  assert.doesNotMatch(rankingSql, /sainome requires the v2 ranking contract/);
  assert.match(submitSql, /from public\.games as g[\s\S]*?g\.is_active = true/);
  assert.match(rankingSql, /from public\.game_scores as gs/);
});

test('開始記録でplayを許可し共通イベントへ保存する', () => {
  assert.match(sql, /add constraint game_play_events_result_type_check[\s\S]*?'play'::text/);
  assert.match(sql, /add constraint game_play_events_result_type_check[\s\S]*?'home'::text/);
  assert.match(legacyStartSql, /public\.record_game_play\([\s\S]*?'play'/);
});

test('旧キャッシュ向けRPCも共通データだけを読み書きする', () => {
  assert.match(legacySubmitSql, /from public\.submit_score\(/);
  assert.match(legacyRankingSql, /from public\.get_best_score_ranking\(/);
  assert.doesNotMatch(legacySubmitSql, /insert into private\.sainome_v2_scores/);
  assert.doesNotMatch(legacyRankingSql, /from private\.sainome_v2_scores/);
});

test('互換RPCの公開権限はanonだけに限定する', () => {
  for (const signature of [
    'start_sainome_play\\(text, text, text, text\\)',
    'submit_sainome_score\\(text, text, integer, text, text\\)',
    'get_sainome_ranking_v2\\(text, integer\\)'
  ]) {
    assert.match(sql, new RegExp(
      `revoke all on function public\\.${signature}[\\s\\S]*?from public, anon, authenticated, service_role`
    ));
    assert.match(sql, new RegExp(
      `grant execute on function public\\.${signature} to anon`
    ));
  }
});

test('実験場の入口を共有ランキング版へ更新する', () => {
  assert.match(
    sql,
    /https:\/\/chameleonjp-lab\.github\.io\/sainome\/\?v=20260817-shared-ranking/
  );
});
