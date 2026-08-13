import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL(
  '../supabase/migrations/20260813032103_harden_sainome_ranking_submission_contract.sql',
  import.meta.url
), 'utf8');

function functionBody(name, nextMarker) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const end = nextMarker ? sql.indexOf(nextMarker, start) : sql.length;
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${name} must have an end marker`);
  return sql.slice(start, end);
}

const issueSql = functionBody('issue_sainome_play_v2', 'create or replace function public.submit_score_once(');
const submitSql = functionBody('submit_score_once', 'revoke all on function public.issue_sainome_play_v2(');

test('前向き移行は公開署名を変えず発行と確定を置き換える', () => {
  assert.match(issueSql, /p_display_name text,\s*p_game_slug text,\s*p_client_version text,\s*p_contract_version text/);
  assert.match(submitSql, /p_display_name text,\s*p_game_slug text,\s*p_score integer,\s*p_client_version text,\s*p_submission_id text,\s*p_contract_version text/);
  assert.equal((sql.match(/security definer\s*\nset search_path = ''/g) ?? []).length, 2);
  assert.doesNotMatch(sql, /accepting_runs\s*=\s*true|is_active\s*=\s*true/i);
});

test('発行と未確定送信は設定行からゲーム行の順に共有ロックする', () => {
  for (const body of [issueSql, submitSql]) {
    const configLock = body.indexOf('from private.sainome_v2_config');
    const gameLock = body.indexOf('from public.games as g');
    const playerLock = body.indexOf('from private.sainome_v2_player_keys', gameLock);
    const refreshedClock = body.indexOf('v_now := clock_timestamp()', playerLock);

    assert.ok(configLock >= 0);
    assert.ok(gameLock > configLock);
    assert.ok(playerLock > gameLock);
    assert.ok(refreshedClock > playerLock);
    assert.match(body.slice(configLock, gameLock), /for share/);
    assert.match(body.slice(gameLock, playerLock), /for share/);
    assert.match(body, /not v_config_found or not v_config\.accepting_runs/);
    assert.match(body, /not v_game_found or v_game_active is not true/);
  }
});

test('戻り値名と発行回数集計の列名を曖昧にしない', () => {
  assert.match(issueSql, /from private\.sainome_v2_plays as plays\s+where plays\.owner_uid = v_uid\s+and plays\.status = 'issued'\s+and plays\.expires_at > v_now/);
  assert.match(issueSql, /from private\.sainome_v2_plays as plays\s+where plays\.owner_uid = v_uid\s+and plays\.issued_at > v_now - interval '60 minutes'/);
});

test('受付済みの完全一致再送だけは停止判定より先に返す', () => {
  const duplicateCheck = submitSql.indexOf("if v_play.status = 'accepted' then");
  const configLock = submitSql.indexOf('from private.sainome_v2_config');

  assert.ok(duplicateCheck >= 0);
  assert.ok(configLock > duplicateCheck);
  assert.match(submitSql.slice(duplicateCheck, configLock), /v_play\.submitted_score <> p_score/);
  assert.match(submitSql.slice(duplicateCheck, configLock), /v_play\.is_new_best, true/);
});

test('失効・早すぎる送信・受付停止を別の機械判定値で返す', () => {
  const expiry = submitSql.indexOf("raise sqlstate 'PT410' using message = 'submission has expired'");
  const stopped = submitSql.indexOf("raise sqlstate 'PT503' using message = 'sainome ranking is not accepting submissions'");
  const tooEarly = submitSql.indexOf("raise sqlstate 'PT425' using message = 'submission is too early'");

  assert.ok(expiry >= 0);
  assert.ok(stopped > expiry);
  assert.ok(tooEarly > stopped);
  assert.match(submitSql, /raise sqlstate 'PT410' using message = 'submission is unavailable'/);
  assert.match(submitSql, /raise sqlstate 'PT409' using message = 'submission does not match its issued contract'/);
  assert.match(submitSql, /raise sqlstate 'PT410' using message = 'player identity is unavailable'/);
});

test('置換後も実行権限を認証済み利用者だけへ明示する', () => {
  assert.match(sql, /revoke all on function public\.issue_sainome_play_v2\([\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(sql, /revoke all on function public\.submit_score_once\([\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(sql, /grant execute on function public\.issue_sainome_play_v2\([\s\S]*?to authenticated/);
  assert.match(sql, /grant execute on function public\.submit_score_once\([\s\S]*?to authenticated/);
});
