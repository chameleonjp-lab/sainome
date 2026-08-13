-- サイノメ v2 ランキングの停止契約を確定処理まで閉じる。
--
-- 既存の公開署名と戻り値は変えない。未確定プレイは、設定行とゲーム行を
-- 同じ順序で共有ロックしてから時刻と受付状態を再確認する。
-- 受付済みの完全一致再送だけは停止後も返し、端末の保全キューを掃除できる。

create or replace function public.issue_sainome_play_v2(
  p_display_name text,
  p_game_slug text,
  p_client_version text,
  p_contract_version text
)
returns table(
  issued boolean,
  result_submission_id uuid,
  result_display_name text,
  result_game_slug text,
  result_client_version text,
  result_contract_version text,
  issued_at timestamptz,
  earliest_submit_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz;
  v_player_key uuid;
  v_config private.sainome_v2_config%rowtype;
  v_config_found boolean;
  v_game_active boolean;
  v_game_found boolean;
  v_open_count integer;
  v_hour_count integer;
  v_earliest timestamptz;
  v_expires timestamptz;
  v_submission_id uuid;
begin
  if v_uid is null then
    raise exception 'authenticated session is required' using errcode = '42501';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'anonymous session is required' using errcode = '42501';
  end if;
  if p_game_slug is null
     or p_game_slug not in ('sainome_60_seconds', 'sainome_180_seconds') then
    raise exception 'invalid sainome game';
  end if;
  if p_client_version is null or p_client_version <> 'sainome-web-2'
     or p_contract_version is null or p_contract_version <> 'sainome-play-v2' then
    raise exception 'ranking contract version is invalid';
  end if;
  if p_display_name <> private.sainome_v2_validate_name(p_display_name) then
    raise exception 'ranking name is invalid';
  end if;

  select * into v_config
  from private.sainome_v2_config
  where singleton = true
  for share;
  v_config_found := found;

  select g.is_active into v_game_active
  from public.games as g
  where g.game_slug = p_game_slug
  for share;
  v_game_found := found;

  if not v_config_found or not v_config.accepting_runs then
    raise sqlstate 'PT503' using message = 'sainome ranking is not accepting plays';
  end if;
  if not v_game_found or v_game_active is not true then
    raise sqlstate 'PT503' using message = 'sainome game is not active';
  end if;

  insert into private.sainome_v2_player_keys (owner_uid, display_name)
  values (v_uid, p_display_name)
  on conflict (owner_uid) do update set
    display_name = excluded.display_name,
    updated_at = clock_timestamp()
  returning player_key into v_player_key;

  select player_key into v_player_key
  from private.sainome_v2_player_keys
  where owner_uid = v_uid
  for update;

  -- 利用者行のロック待ちを、古い発行時刻や有効化時刻へ含めない。
  v_now := clock_timestamp();
  if v_now < v_config.ranking_enable_not_before then
    raise sqlstate 'PT503' using message = 'sainome ranking is not accepting plays';
  end if;

  select count(*) into v_open_count
  from private.sainome_v2_plays as plays
  where plays.owner_uid = v_uid
    and plays.status = 'issued'
    and plays.expires_at > v_now;
  if v_open_count >= 10 then
    raise exception 'too many unconsumed plays' using errcode = '42901';
  end if;

  select count(*) into v_hour_count
  from private.sainome_v2_plays as plays
  where plays.owner_uid = v_uid
    and plays.issued_at > v_now - interval '60 minutes';
  if v_hour_count >= 60 then
    raise exception 'play issue rate exceeded' using errcode = '42901';
  end if;

  v_submission_id := gen_random_uuid();
  v_earliest := v_now + case
    when p_game_slug = 'sainome_60_seconds' then interval '63 seconds'
    else interval '183 seconds'
  end;
  v_expires := v_now + interval '24 hours';

  insert into private.sainome_v2_plays (
    submission_id, owner_uid, player_key, display_name, game_slug, client_version,
    contract_version, issued_at, earliest_submit_at, expires_at
  ) values (
    v_submission_id, v_uid, v_player_key, p_display_name, p_game_slug, p_client_version,
    p_contract_version, v_now, v_earliest, v_expires
  );

  return query select true, v_submission_id, p_display_name, p_game_slug,
    p_client_version, p_contract_version, v_now, v_earliest, v_expires;
end;
$$;

create or replace function public.submit_score_once(
  p_display_name text,
  p_game_slug text,
  p_score integer,
  p_client_version text,
  p_submission_id text,
  p_contract_version text
)
returns table(
  accepted boolean,
  result_submission_id uuid,
  result_contract_version text,
  result_client_version text,
  result_game_slug text,
  result_display_name text,
  result_submitted_score integer,
  result_best_score integer,
  result_play_count integer,
  is_first_play boolean,
  is_new_best boolean,
  was_duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_submission_id uuid;
  v_now timestamptz;
  v_play private.sainome_v2_plays%rowtype;
  v_config private.sainome_v2_config%rowtype;
  v_config_found boolean;
  v_game_active boolean;
  v_game_found boolean;
  v_old private.sainome_v2_scores%rowtype;
  v_player_key uuid;
  v_first boolean;
  v_new_best boolean;
begin
  if v_uid is null then
    raise exception 'authenticated session is required' using errcode = '42501';
  end if;
  if p_game_slug is null
     or p_game_slug not in ('sainome_60_seconds', 'sainome_180_seconds')
     or p_client_version is null
     or p_client_version <> 'sainome-web-2'
     or p_contract_version is null
     or p_contract_version <> 'sainome-play-v2'
     or p_score is null
     or p_score < 0
     or p_score > 100000000 then
    raise exception 'ranking submission is invalid';
  end if;
  if p_display_name <> private.sainome_v2_validate_name(p_display_name) then
    raise exception 'ranking name is invalid';
  end if;
  if p_submission_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'submission id is invalid';
  end if;
  v_submission_id := p_submission_id::uuid;

  select * into v_play
  from private.sainome_v2_plays
  where submission_id = v_submission_id and owner_uid = v_uid
  for update;
  if not found then
    -- 存在しない番号と別利用者の番号を同じ応答にして、存在確認を防ぐ。
    raise sqlstate 'PT410' using message = 'submission is unavailable';
  end if;

  if v_play.display_name <> p_display_name
     or v_play.game_slug <> p_game_slug
     or v_play.client_version <> p_client_version
     or v_play.contract_version <> p_contract_version then
    raise sqlstate 'PT409' using message = 'submission does not match its issued contract';
  end if;

  -- 受付済みの完全一致再送は、停止後も以前の結果を返す。
  if v_play.status = 'accepted' then
    if v_play.submitted_score <> p_score then
      raise sqlstate 'PT409' using message = 'accepted submission payload does not match';
    end if;
    return query select true, v_play.submission_id, v_play.contract_version,
      v_play.client_version, v_play.game_slug, v_play.display_name,
      v_play.submitted_score, v_play.result_best_score, v_play.result_play_count,
      v_play.is_first_play, v_play.is_new_best, true;
    return;
  end if;

  -- 未確定分は、設定行→ゲーム行の順に共有ロックする。
  select * into v_config
  from private.sainome_v2_config
  where singleton = true
  for share;
  v_config_found := found;

  select g.is_active into v_game_active
  from public.games as g
  where g.game_slug = p_game_slug
  for share;
  v_game_found := found;

  select player_key into v_player_key
  from private.sainome_v2_player_keys
  where owner_uid = v_uid
  for update;
  if v_player_key is null or v_player_key <> v_play.player_key then
    raise sqlstate 'PT410' using message = 'player identity is unavailable';
  end if;

  -- 設定・ゲーム・利用者行すべてのロック待ち後に時刻を取り直す。
  v_now := clock_timestamp();
  if v_now >= v_play.expires_at then
    raise sqlstate 'PT410' using message = 'submission has expired';
  end if;
  if not v_config_found or not v_config.accepting_runs
     or v_now < v_config.ranking_enable_not_before then
    raise sqlstate 'PT503' using message = 'sainome ranking is not accepting submissions';
  end if;
  if not v_game_found or v_game_active is not true then
    raise sqlstate 'PT503' using message = 'sainome game is not active';
  end if;
  if v_now < v_play.earliest_submit_at then
    raise sqlstate 'PT425' using message = 'submission is too early';
  end if;

  select * into v_old
  from private.sainome_v2_scores
  where player_key = v_player_key and game_slug = p_game_slug
  for update;

  if not found then
    v_first := true;
    v_new_best := true;
    insert into private.sainome_v2_scores (
      player_key, game_slug, display_name, first_score, best_score, play_count,
      first_score_at, best_score_at, updated_at
    ) values (
      v_player_key, p_game_slug, p_display_name, p_score, p_score, 1,
      v_now, v_now, v_now
    );
    v_old.best_score := p_score;
    v_old.play_count := 1;
  else
    v_first := false;
    v_new_best := p_score > v_old.best_score;
    update private.sainome_v2_scores set
      display_name = p_display_name,
      best_score = case when v_new_best then p_score else best_score end,
      play_count = v_old.play_count + 1,
      best_score_at = case when v_new_best then v_now else best_score_at end,
      updated_at = v_now
    where player_key = v_player_key and game_slug = p_game_slug;
    v_old.best_score := case when v_new_best then p_score else v_old.best_score end;
    v_old.play_count := v_old.play_count + 1;
  end if;

  update private.sainome_v2_plays set
    status = 'accepted',
    accepted_at = v_now,
    submitted_score = p_score,
    result_best_score = v_old.best_score,
    result_play_count = v_old.play_count,
    is_first_play = v_first,
    is_new_best = v_new_best
  where submission_id = v_submission_id;

  return query select true, v_submission_id, p_contract_version, p_client_version,
    p_game_slug, p_display_name, p_score, v_old.best_score, v_old.play_count,
    v_first, v_new_best, false;
end;
$$;

revoke all on function public.issue_sainome_play_v2(text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_score_once(text, text, integer, text, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.issue_sainome_play_v2(text, text, text, text)
  to authenticated;
grant execute on function public.submit_score_once(text, text, integer, text, text, text)
  to authenticated;

comment on function public.issue_sainome_play_v2(text, text, text, text) is
  'Issues sainome-v2 play IDs only while config and game gates remain open under row locks.';
comment on function public.submit_score_once(text, text, integer, text, text, text) is
  'Accepts an unconsumed sainome-v2 score only while locked config and game gates remain open; exact accepted retries remain readable.';
