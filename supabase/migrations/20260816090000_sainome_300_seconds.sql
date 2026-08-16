-- 300秒モードをランキングv2の許可対象へ追加する前向き移行。
-- 受付ゲートは既存の停止状態を維持し、公開を有効化しない。
-- 旧60秒・180秒の保存済み番号と集計行は変換・削除しない。

alter table private.sainome_v2_plays
  drop constraint if exists sainome_v2_plays_game_slug_check;
alter table private.sainome_v2_plays
  add constraint sainome_v2_plays_game_slug_check
  check (game_slug in ('sainome_60_seconds', 'sainome_180_seconds', 'sainome_300_seconds'));

alter table private.sainome_v2_scores
  drop constraint if exists sainome_v2_scores_game_slug_check;
alter table private.sainome_v2_scores
  add constraint sainome_v2_scores_game_slug_check
  check (game_slug in ('sainome_60_seconds', 'sainome_180_seconds', 'sainome_300_seconds'));

insert into public.games (
  game_slug, title, game_url, description, share_text, score_order, score_unit,
  is_active, release_date, score_scale, score_decimals, score_label,
  first_score_label, best_score_label, display_order, top_ranking_type, submission_mode
) values (
  'sainome_300_seconds',
  'サイノメ 300秒',
  'https://chameleonjp-lab.github.io/sainome/',
  'サイコロを転がし、上面の数字以上をつなげて消す300秒パズル',
  'サイノメ 300秒でプレイしました',
  'desc', '点', false, current_date, 1, 0, '点', '初回記録', '自己ベスト',
  null, 'best', 'shared'
)
on conflict (game_slug) do nothing;

create or replace function public.submit_score(
  p_display_name text,
  p_game_slug text,
  p_score integer,
  p_client_version text default ''::text
)
returns table(
  accepted boolean,
  result_normalized_name text,
  result_display_name text,
  result_first_score integer,
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
  v_display_name text;
  v_score_order text;
  v_old_first_score integer;
  v_old_best integer;
  v_old_play_count integer;
  v_is_first_play boolean := false;
  v_is_new_best boolean := false;
  v_now timestamptz := clock_timestamp();
  v_max_score integer;
begin
  if p_game_slug in ('sainome_60_seconds', 'sainome_180_seconds', 'sainome_300_seconds') then
    raise exception 'sainome requires the v2 ranking contract' using errcode = '42501';
  end if;

  v_display_name := btrim(coalesce(p_display_name, ''));
  v_normalized_name := public.normalize_player_name(p_display_name);

  if char_length(v_normalized_name) = 0 then
    raise exception 'name is empty';
  end if;
  if char_length(v_normalized_name) > 20 then
    raise exception 'name is too long';
  end if;
  if p_score is null then
    raise exception 'invalid score';
  end if;
  if p_score < -100000000 then
    raise exception 'score is too small';
  end if;

  v_max_score := case
    when p_game_slug = 'maron_hikou' then 400000000
    when p_game_slug = 'uchikaeru' then 121999999
    else 100000000
  end;
  if p_score > v_max_score then
    raise exception 'score is too large';
  end if;

  select g.score_order into v_score_order
  from public.games as g
  where g.game_slug = p_game_slug and g.is_active = true;
  if v_score_order is null then
    raise exception 'game not found';
  end if;

  insert into public.players (normalized_name, display_name, created_at, last_played_at)
  values (v_normalized_name, v_display_name, v_now, v_now)
  on conflict (normalized_name) do update set
    display_name = excluded.display_name,
    last_played_at = excluded.last_played_at;

  insert into public.score_runs (normalized_name, game_slug, score, client_version, created_at)
  values (v_normalized_name, p_game_slug, p_score, coalesce(p_client_version, ''), v_now);

  select gs.first_score, gs.best_score, gs.play_count
  into v_old_first_score, v_old_best, v_old_play_count
  from public.game_scores as gs
  where gs.normalized_name = v_normalized_name and gs.game_slug = p_game_slug
  for update;

  if v_old_best is null then
    v_is_first_play := true;
    v_is_new_best := true;
    insert into public.game_scores (
      normalized_name, game_slug, display_name, first_score, best_score, play_count,
      first_score_at, best_score_at, updated_at
    ) values (
      v_normalized_name, p_game_slug, v_display_name, p_score, p_score, 1,
      v_now, v_now, v_now
    );
  else
    if (v_score_order = 'desc' and p_score > v_old_best)
       or (v_score_order = 'asc' and p_score < v_old_best) then
      v_is_new_best := true;
      update public.game_scores as gs set
        display_name = v_display_name,
        best_score = p_score,
        play_count = v_old_play_count + 1,
        best_score_at = v_now,
        updated_at = v_now
      where gs.normalized_name = v_normalized_name and gs.game_slug = p_game_slug;
    else
      update public.game_scores as gs set
        display_name = v_display_name,
        play_count = v_old_play_count + 1,
        updated_at = v_now
      where gs.normalized_name = v_normalized_name and gs.game_slug = p_game_slug;
    end if;
  end if;

  return query
  select true, gs.normalized_name, gs.display_name, gs.first_score, gs.best_score,
         gs.play_count, v_is_first_play, v_is_new_best
  from public.game_scores as gs
  where gs.normalized_name = v_normalized_name and gs.game_slug = p_game_slug;
end;
$$;

create or replace function public.get_best_score_ranking(
  p_game_slug text,
  p_limit integer default 100
)
returns table(
  rank_no bigint,
  display_name text,
  first_score integer,
  best_score integer,
  play_count integer,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_game_slug in ('sainome_60_seconds', 'sainome_180_seconds', 'sainome_300_seconds') then
    raise exception 'sainome requires the v2 ranking contract' using errcode = '42501';
  end if;

  return query
  with game_config as (
    select coalesce(g.score_order, 'desc') as score_order
    from public.games as g
    where g.game_slug = p_game_slug
    limit 1
  ), ranked as (
    select rank() over (
      order by
        case when coalesce((select score_order from game_config), 'desc') = 'asc'
          then gs.best_score end asc nulls last,
        case when coalesce((select score_order from game_config), 'desc') <> 'asc'
          then gs.best_score end desc nulls last
    ) as rank_no,
    gs.display_name, gs.first_score, gs.best_score, gs.play_count, gs.updated_at
    from public.game_scores as gs
    where gs.game_slug = p_game_slug
      and coalesce(gs.ranking_status, 'normal') = 'normal'
  )
  select ranked.rank_no, ranked.display_name, ranked.first_score, ranked.best_score,
         ranked.play_count, ranked.updated_at
  from ranked
  order by ranked.rank_no asc, ranked.updated_at asc, ranked.display_name asc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
end;
$$;

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
     or p_game_slug not in ('sainome_60_seconds', 'sainome_180_seconds', 'sainome_300_seconds') then
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
    when p_game_slug = 'sainome_180_seconds' then interval '183 seconds'
    else interval '303 seconds'
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
     or p_game_slug not in ('sainome_60_seconds', 'sainome_180_seconds', 'sainome_300_seconds')
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
  if p_game_slug not in ('sainome_60_seconds', 'sainome_180_seconds', 'sainome_300_seconds')
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
    (auth.uid() is not null and p.owner_uid = auth.uid()) as is_current_user,
    'unverified'::text as verification_status
    from private.sainome_v2_scores as s
    join private.sainome_v2_player_keys as p on p.player_key = s.player_key
    where s.game_slug = p_game_slug
  )
  select ranked.rank_no, ranked.display_name, ranked.best_score, ranked.play_count,
    ranked.is_current_user, ranked.verification_status
  from ranked
  order by ranked.rank_no
  limit p_limit;
end;
$$;

revoke all on function public.issue_sainome_play_v2(text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_score_once(text, text, integer, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_sainome_ranking_v2(text, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.issue_sainome_play_v2(text, text, text, text)
  to authenticated;
grant execute on function public.submit_score_once(text, text, integer, text, text, text)
  to authenticated;
grant execute on function public.get_sainome_ranking_v2(text, integer)
  to anon, authenticated;

revoke all on function private.sainome_v2_known_special_name(text)
  from public, anon, authenticated, service_role;
revoke all on function private.sainome_v2_validate_name(text)
  from public, anon, authenticated, service_role;

comment on table private.sainome_v2_plays is
  'Private server-issued play ledger for sainome-play-v2; never expose through the Data API.';
comment on table private.sainome_v2_scores is
  'Private unverified aggregate for sainome-play-v2; only get_sainome_ranking_v2 may read it.';
comment on function public.get_sainome_ranking_v2(text, integer) is
  'Returns only unverified sainome-v2 ranking rows; server-side score replay is not implemented.';

revoke all on function public.issue_sainome_play_v2(text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_score_once(text, text, integer, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_sainome_ranking_v2(text, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.issue_sainome_play_v2(text, text, text, text)
  to authenticated;
grant execute on function public.submit_score_once(text, text, integer, text, text, text)
  to authenticated;
grant execute on function public.get_sainome_ranking_v2(text, integer)
  to anon, authenticated;

comment on function public.issue_sainome_play_v2(text, text, text, text) is
  'Issues sainome-v2 play IDs for the active 300-second mode while gates remain closed by default.';
comment on function public.submit_score_once(text, text, integer, text, text, text) is
  'Accepts sainome-v2 scores only for a valid issued play and locked active gates.';
