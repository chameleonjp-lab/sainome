-- プレイ番号を使わず、名前だけで開始・結果送信するランキング契約。
-- 開始時にプレイ回数を増やし、終了時にスコアだけを登録する。
-- 受付ゲートと300秒モードの有効状態は既存設定を引き継ぐ。

alter table private.sainome_v2_scores
  add column if not exists has_submitted_score boolean not null default true;

update private.sainome_v2_scores
set has_submitted_score = true
where has_submitted_score is distinct from true;

create or replace function public.start_sainome_play(
  p_display_name text,
  p_game_slug text,
  p_client_version text,
  p_contract_version text
)
returns table(
  started boolean,
  result_display_name text,
  result_game_slug text,
  result_play_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_name text;
  v_player_key uuid;
  v_config private.sainome_v2_config%rowtype;
  v_config_found boolean;
  v_game_active boolean;
  v_game_found boolean;
  v_now timestamptz := clock_timestamp();
  v_play_count integer;
begin
  v_normalized_name := public.normalize_player_name(p_display_name);

  if p_game_slug is null
     or p_game_slug <> 'sainome_300_seconds'
     or p_client_version is null
     or p_client_version <> 'sainome-web-2'
     or p_contract_version is null
     or p_contract_version <> 'sainome-name-v1'
     or p_display_name is null
     or p_display_name <> v_normalized_name
     or p_display_name <> private.sainome_v2_validate_name(p_display_name) then
    raise exception 'ranking start is invalid';
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

  if not v_config_found or not v_config.accepting_runs
     or v_now < v_config.ranking_enable_not_before then
    raise sqlstate 'PT503' using message = 'sainome ranking is not accepting plays';
  end if;
  if not v_game_found or v_game_active is not true then
    raise sqlstate 'PT503' using message = 'sainome game is not active';
  end if;

  insert into private.sainome_v2_player_keys (
    owner_uid, normalized_name, display_name
  ) values (
    null, v_normalized_name, p_display_name
  )
  on conflict (normalized_name) do update set
    display_name = excluded.display_name,
    updated_at = v_now
  returning player_key into v_player_key;

  select player_key
  into v_player_key
  from private.sainome_v2_player_keys
  where normalized_name = v_normalized_name
  for update;

  insert into private.sainome_v2_scores (
    player_key, game_slug, display_name, first_score, best_score, play_count,
    first_score_at, best_score_at, updated_at, has_submitted_score
  ) values (
    v_player_key, p_game_slug, p_display_name, 0, 0, 1,
    v_now, v_now, v_now, false
  )
  on conflict (player_key, game_slug) do update set
    display_name = excluded.display_name,
    play_count = private.sainome_v2_scores.play_count + 1,
    updated_at = v_now
  returning play_count into v_play_count;

  return query select true, p_display_name, p_game_slug, v_play_count;
end;
$$;

create or replace function public.submit_sainome_score(
  p_display_name text,
  p_game_slug text,
  p_score integer,
  p_client_version text,
  p_contract_version text
)
returns table(
  accepted boolean,
  result_game_slug text,
  result_display_name text,
  result_submitted_score integer,
  result_best_score integer,
  result_play_count integer,
  is_first_play boolean,
  is_new_best boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_name text;
  v_player_key uuid;
  v_config private.sainome_v2_config%rowtype;
  v_config_found boolean;
  v_game_active boolean;
  v_game_found boolean;
  v_now timestamptz := clock_timestamp();
  v_old private.sainome_v2_scores%rowtype;
  v_first boolean := false;
  v_new_best boolean := false;
begin
  v_normalized_name := public.normalize_player_name(p_display_name);

  if p_game_slug is null
     or p_game_slug <> 'sainome_300_seconds'
     or p_client_version is null
     or p_client_version <> 'sainome-web-2'
     or p_contract_version is null
     or p_contract_version <> 'sainome-name-v1'
     or p_score is null
     or p_score < 0
     or p_score > 100000000
     or p_display_name is null
     or p_display_name <> v_normalized_name
     or p_display_name <> private.sainome_v2_validate_name(p_display_name) then
    raise exception 'ranking submission is invalid';
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

  if not v_config_found or not v_config.accepting_runs
     or v_now < v_config.ranking_enable_not_before then
    raise sqlstate 'PT503' using message = 'sainome ranking is not accepting submissions';
  end if;
  if not v_game_found or v_game_active is not true then
    raise sqlstate 'PT503' using message = 'sainome game is not active';
  end if;

  select player_key
  into v_player_key
  from private.sainome_v2_player_keys
  where normalized_name = v_normalized_name
  for update;

  if v_player_key is null then
    insert into private.sainome_v2_player_keys (
      owner_uid, normalized_name, display_name
    ) values (
      null, v_normalized_name, p_display_name
    )
    returning player_key into v_player_key;
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
      first_score_at, best_score_at, updated_at, has_submitted_score
    ) values (
      v_player_key, p_game_slug, p_display_name, p_score, p_score, 1,
      v_now, v_now, v_now, true
    );
    v_old.best_score := p_score;
    v_old.play_count := 1;
  elsif v_old.has_submitted_score is not true then
    v_first := true;
    v_new_best := true;
    update private.sainome_v2_scores set
      display_name = p_display_name,
      first_score = p_score,
      best_score = p_score,
      best_score_at = v_now,
      updated_at = v_now,
      has_submitted_score = true
    where player_key = v_player_key and game_slug = p_game_slug;
    v_old.best_score := p_score;
  else
    v_new_best := p_score > v_old.best_score;
    update private.sainome_v2_scores set
      display_name = p_display_name,
      best_score = case when v_new_best then p_score else best_score end,
      best_score_at = case when v_new_best then v_now else best_score_at end,
      updated_at = v_now
    where player_key = v_player_key and game_slug = p_game_slug;
    v_old.best_score := case when v_new_best then p_score else v_old.best_score end;
  end if;

  select s.play_count, s.best_score
  into v_old.play_count, v_old.best_score
  from private.sainome_v2_scores as s
  where s.player_key = v_player_key and s.game_slug = p_game_slug;

  return query select true, p_game_slug, p_display_name, p_score,
    v_old.best_score, v_old.play_count, v_first, v_new_best;
end;
$$;

create or replace function public.get_sainome_ranking_v2(
  p_game_slug text,
  p_limit integer
)
returns table(
  rank_no integer,
  display_name text,
  best_score integer,
  play_count integer,
  is_current_user boolean,
  verification_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_game_slug <> 'sainome_300_seconds'
     or p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception 'ranking query is invalid';
  end if;

  return query
  with ranked as (
    select row_number() over (
      order by s.best_score desc, s.best_score_at asc, s.player_key asc
    )::integer as rank_no,
    s.display_name,
    s.best_score,
    s.play_count,
    false::boolean as is_current_user,
    'unverified'::text as verification_status
    from private.sainome_v2_scores as s
    where s.game_slug = p_game_slug
      and s.has_submitted_score = true
  )
  select ranked.rank_no, ranked.display_name, ranked.best_score,
    ranked.play_count, ranked.is_current_user, ranked.verification_status
  from ranked
  order by ranked.rank_no
  limit p_limit;
end;
$$;

revoke all on function public.start_sainome_play(text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_sainome_score(text, text, integer, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.start_sainome_play(text, text, text, text)
  to anon;
grant execute on function public.submit_sainome_score(text, text, integer, text, text)
  to anon;

revoke all on function public.issue_sainome_play_v2(text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_score_once(text, text, integer, text, text, text)
  from public, anon, authenticated, service_role;

revoke all on function public.get_sainome_ranking_v2(text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_sainome_ranking_v2(text, integer)
  to anon;

comment on function public.start_sainome_play(text, text, text, text) is
  'Starts a name-only sainome play and increments play_count; no play number or Supabase Auth is used.';
comment on function public.submit_sainome_score(text, text, integer, text, text) is
  'Submits a name-only sainome result; no play number or Supabase Auth is used.';
