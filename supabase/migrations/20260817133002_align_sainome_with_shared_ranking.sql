-- Make the shared Chameleon JP ranking tables the single source of truth for Sainome.
-- The legacy Sainome RPCs remain as bridges so cached clients cannot write to a
-- ranking table that the laboratory never reads.

alter table public.game_play_events
  drop constraint game_play_events_result_type_check;

alter table public.game_play_events
  add constraint game_play_events_result_type_check
  check (result_type = any (array[
    'game_over'::text,
    'clear'::text,
    'retire'::text,
    'home'::text,
    'play'::text
  ]));

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
set search_path to ''
as $function$
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
$function$;

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
set search_path to ''
as $function$
begin
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
$function$;

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
set search_path to ''
as $function$
declare
  v_normalized_name text;
  v_config private.sainome_v2_config%rowtype;
  v_config_found boolean;
  v_game_active boolean;
  v_game_found boolean;
  v_now timestamptz := clock_timestamp();
  v_event jsonb;
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

  v_event := public.record_game_play(
    p_display_name,
    p_game_slug,
    'play',
    p_client_version
  );
  if coalesce((v_event ->> 'accepted')::boolean, false) is not true then
    raise exception 'ranking start was not accepted';
  end if;

  return query select true, p_display_name, p_game_slug, 1;
end;
$function$;

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
set search_path to ''
as $function$
declare
  v_normalized_name text;
  v_config private.sainome_v2_config%rowtype;
  v_config_found boolean;
  v_game_active boolean;
  v_game_found boolean;
  v_now timestamptz := clock_timestamp();
  v_accepted boolean;
  v_display_name text;
  v_best_score integer;
  v_play_count integer;
  v_is_first_play boolean;
  v_is_new_best boolean;
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

  select s.accepted, s.result_display_name, s.result_best_score,
         s.result_play_count, s.is_first_play, s.is_new_best
  into v_accepted, v_display_name, v_best_score,
       v_play_count, v_is_first_play, v_is_new_best
  from public.submit_score(
    p_display_name,
    p_game_slug,
    p_score,
    p_client_version
  ) as s;

  if v_accepted is not true or v_display_name <> p_display_name then
    raise exception 'ranking submission was not accepted';
  end if;

  return query select true, p_game_slug, v_display_name, p_score,
    v_best_score, v_play_count, v_is_first_play, v_is_new_best;
end;
$function$;

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
set search_path to ''
as $function$
begin
  if p_game_slug <> 'sainome_300_seconds'
     or p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception 'ranking query is invalid';
  end if;

  return query
  select r.rank_no::integer, r.display_name, r.best_score, r.play_count,
         false, 'unverified'::text
  from public.get_best_score_ranking(p_game_slug, p_limit) as r
  order by r.rank_no, r.updated_at, r.display_name;
end;
$function$;

revoke all on function public.start_sainome_play(text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_sainome_score(text, text, integer, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_sainome_ranking_v2(text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.start_sainome_play(text, text, text, text) to anon;
grant execute on function public.submit_sainome_score(text, text, integer, text, text) to anon;
grant execute on function public.get_sainome_ranking_v2(text, integer) to anon;

comment on function public.start_sainome_play(text, text, text, text) is
  'Compatibility bridge: records a Sainome start in the shared game_play_events table.';
comment on function public.submit_sainome_score(text, text, integer, text, text) is
  'Compatibility bridge: submits Sainome scores through the shared submit_score contract.';
comment on function public.get_sainome_ranking_v2(text, integer) is
  'Compatibility bridge: reads Sainome ranking rows from the shared game_scores table.';

update public.games
set game_url = 'https://chameleonjp-lab.github.io/sainome/?v=20260817-shared-ranking'
where game_slug = 'sainome_300_seconds';
