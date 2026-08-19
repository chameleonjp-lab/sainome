-- サイノメではゲーム開始時点を0点の仮リタイアとしてランキングへ登録する。
-- 結果送信時は同じ開始記録を確定し、プレイ回数を二重加算しない。

create or replace function public.record_game_play(
  p_display_name text,
  p_game_slug text,
  p_result_type text default 'play'::text,
  p_client_version text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_game_slug text;
  v_display_name text;
  v_normalized_name text;
  v_result_type text;
  v_game_exists boolean;
  v_now timestamptz := clock_timestamp();
  v_play_id text;
  v_best_score integer;
  v_play_count integer;
begin
  v_game_slug := lower(trim(coalesce(p_game_slug, '')));

  if v_game_slug = '' then
    return jsonb_build_object('accepted', false, 'reason', 'empty_game_slug');
  end if;

  select exists (
    select 1 from public.games where game_slug = v_game_slug
  ) into v_game_exists;

  if not v_game_exists then
    return jsonb_build_object(
      'accepted', false,
      'reason', 'game_not_found',
      'game_slug', v_game_slug
    );
  end if;

  v_display_name := left(
    coalesce(
      nullif(regexp_replace(trim(coalesce(p_display_name, '')), '\s+', ' ', 'g'), ''),
      '名無し'
    ),
    20
  );

  v_normalized_name := case
    when v_game_slug = 'sainome_300_seconds'
      then public.normalize_player_name(v_display_name)
    else lower(v_display_name)
  end;

  v_result_type := lower(trim(coalesce(p_result_type, 'play')));
  if v_result_type not in ('clear', 'retire', 'home', 'play') then
    v_result_type := 'play';
  end if;

  if v_game_slug = 'sainome_300_seconds' and v_result_type = 'play' then
    if char_length(v_normalized_name) = 0 or char_length(v_normalized_name) > 20 then
      return jsonb_build_object(
        'accepted', false,
        'reason', 'invalid_display_name',
        'game_slug', v_game_slug
      );
    end if;

    v_play_id := pg_catalog.gen_random_uuid()::text;

    insert into public.players (
      normalized_name,
      display_name,
      created_at,
      last_played_at
    ) values (
      v_normalized_name,
      v_display_name,
      v_now,
      v_now
    )
    on conflict (normalized_name) do update set
      display_name = excluded.display_name,
      last_played_at = excluded.last_played_at;

    insert into public.game_play_events (
      play_id,
      game_slug,
      display_name,
      normalized_name,
      result_type,
      reached_wave,
      score,
      ranking_score,
      client_version,
      created_at
    ) values (
      v_play_id,
      v_game_slug,
      v_display_name,
      v_normalized_name,
      'retire',
      1,
      0,
      null,
      coalesce(p_client_version, ''),
      v_now
    );

    insert into public.game_scores (
      normalized_name,
      game_slug,
      display_name,
      first_score,
      best_score,
      play_count,
      first_score_at,
      best_score_at,
      updated_at
    ) values (
      v_normalized_name,
      v_game_slug,
      v_display_name,
      0,
      0,
      1,
      v_now,
      v_now,
      v_now
    )
    on conflict (normalized_name, game_slug) do update set
      display_name = excluded.display_name,
      play_count = public.game_scores.play_count + 1,
      updated_at = excluded.updated_at
    returning best_score, play_count
      into v_best_score, v_play_count;

    return jsonb_build_object(
      'accepted', true,
      'game_slug', v_game_slug,
      'display_name', v_display_name,
      'normalized_name', v_normalized_name,
      'result_type', 'play',
      'provisional_result_type', 'retire',
      'provisional_score', 0,
      'play_id', v_play_id,
      'best_score', v_best_score,
      'play_count', v_play_count,
      'reached_wave', 1
    );
  end if;

  insert into public.game_play_events (
    game_slug,
    display_name,
    normalized_name,
    result_type,
    reached_wave,
    client_version
  ) values (
    v_game_slug,
    v_display_name,
    v_normalized_name,
    v_result_type,
    1,
    coalesce(p_client_version, '')
  );

  return jsonb_build_object(
    'accepted', true,
    'game_slug', v_game_slug,
    'display_name', v_display_name,
    'normalized_name', v_normalized_name,
    'result_type', v_result_type,
    'reached_wave', 1
  );
end;
$function$;

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
  v_provisional_event_id bigint;
  v_final_result_type text;
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
  if p_game_slug = 'sainome_300_seconds' and p_score < 0 then
    raise exception 'invalid score';
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

  if p_game_slug = 'sainome_300_seconds' then
    select gpe.id
    into v_provisional_event_id
    from public.game_play_events as gpe
    where gpe.game_slug = p_game_slug
      and gpe.normalized_name = v_normalized_name
      and gpe.ranking_score is null
      and gpe.result_type in ('play', 'retire')
      and gpe.created_at >= v_now - interval '24 hours'
    order by gpe.created_at desc, gpe.id desc
    limit 1
    for update;

    if v_provisional_event_id is not null then
      select not exists (
        select 1
        from public.score_runs as sr
        where sr.normalized_name = v_normalized_name
          and sr.game_slug = p_game_slug
      ) into v_is_first_play;

      v_final_result_type := case when p_score = 0 then 'retire' else 'clear' end;

      update public.game_play_events as gpe set
        display_name = v_display_name,
        result_type = v_final_result_type,
        score = p_score,
        ranking_score = p_score,
        client_version = coalesce(p_client_version, '')
      where gpe.id = v_provisional_event_id;

      insert into public.score_runs (
        normalized_name,
        game_slug,
        score,
        client_version,
        created_at,
        metadata
      ) values (
        v_normalized_name,
        p_game_slug,
        p_score,
        coalesce(p_client_version, ''),
        v_now,
        jsonb_build_object(
          'source', 'sainome_provisional_retire',
          'play_event_id', v_provisional_event_id,
          'result_type', v_final_result_type
        )
      );

      select gs.first_score, gs.best_score, gs.play_count
      into v_old_first_score, v_old_best, v_old_play_count
      from public.game_scores as gs
      where gs.normalized_name = v_normalized_name
        and gs.game_slug = p_game_slug
      for update;

      if v_old_best is null then
        v_is_new_best := p_score > 0;
        insert into public.game_scores (
          normalized_name,
          game_slug,
          display_name,
          first_score,
          best_score,
          play_count,
          first_score_at,
          best_score_at,
          updated_at
        ) values (
          v_normalized_name,
          p_game_slug,
          v_display_name,
          0,
          p_score,
          1,
          v_now,
          v_now,
          v_now
        );
      else
        if (v_score_order = 'desc' and p_score > v_old_best)
           or (v_score_order = 'asc' and p_score < v_old_best) then
          v_is_new_best := true;
          update public.game_scores as gs set
            display_name = v_display_name,
            best_score = p_score,
            best_score_at = v_now,
            updated_at = v_now
          where gs.normalized_name = v_normalized_name
            and gs.game_slug = p_game_slug;
        else
          update public.game_scores as gs set
            display_name = v_display_name,
            updated_at = v_now
          where gs.normalized_name = v_normalized_name
            and gs.game_slug = p_game_slug;
        end if;
      end if;

      return query
      select true, gs.normalized_name, gs.display_name, gs.first_score, gs.best_score,
             gs.play_count, v_is_first_play, v_is_new_best
      from public.game_scores as gs
      where gs.normalized_name = v_normalized_name
        and gs.game_slug = p_game_slug;
      return;
    end if;

    if exists (
      select 1
      from public.score_runs as sr
      where sr.normalized_name = v_normalized_name
        and sr.game_slug = p_game_slug
        and sr.score = p_score
        and coalesce(sr.client_version, '') = coalesce(p_client_version, '')
        and sr.created_at >= v_now - interval '2 minutes'
        and sr.metadata ->> 'source' = 'sainome_provisional_retire'
    ) then
      return query
      select true, gs.normalized_name, gs.display_name, gs.first_score, gs.best_score,
             gs.play_count, false, false
      from public.game_scores as gs
      where gs.normalized_name = v_normalized_name
        and gs.game_slug = p_game_slug;
      return;
    end if;
  end if;

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

-- 既存の開始記録について、次の開始までにスコア送信がなかったものを
-- 0点リタイアとして一度だけランキングへ反映する。
update public.game_play_events as gpe
set normalized_name = public.normalize_player_name(gpe.display_name)
where gpe.game_slug = 'sainome_300_seconds'
  and gpe.normalized_name is distinct from public.normalize_player_name(gpe.display_name);

create temporary table sainome_unmatched_starts on commit drop as
with starts as (
  select
    gpe.id,
    gpe.display_name,
    gpe.normalized_name,
    gpe.created_at,
    lead(gpe.created_at) over (
      partition by gpe.normalized_name
      order by gpe.created_at, gpe.id
    ) as next_start_at
  from public.game_play_events as gpe
  where gpe.game_slug = 'sainome_300_seconds'
    and gpe.result_type = 'play'
    and gpe.ranking_score is null
), classified as (
  select
    s.*,
    exists (
      select 1
      from public.score_runs as sr
      where sr.game_slug = 'sainome_300_seconds'
        and sr.normalized_name = s.normalized_name
        and sr.created_at >= s.created_at
        and (s.next_start_at is null or sr.created_at < s.next_start_at)
    ) as has_score_before_next_start
  from starts as s
)
select id, display_name, normalized_name, created_at
from classified
where not has_score_before_next_start;

insert into public.players (normalized_name, display_name, created_at, last_played_at)
select
  s.normalized_name,
  (array_agg(s.display_name order by s.created_at desc))[1],
  min(s.created_at),
  max(s.created_at)
from sainome_unmatched_starts as s
group by s.normalized_name
on conflict (normalized_name) do update set
  display_name = excluded.display_name,
  last_played_at = greatest(public.players.last_played_at, excluded.last_played_at);

update public.game_play_events as gpe
set result_type = 'retire',
    score = 0,
    ranking_score = 0
from sainome_unmatched_starts as s
where gpe.id = s.id;

insert into public.game_scores (
  normalized_name,
  game_slug,
  display_name,
  first_score,
  best_score,
  play_count,
  first_score_at,
  best_score_at,
  updated_at
)
select
  s.normalized_name,
  'sainome_300_seconds',
  (array_agg(s.display_name order by s.created_at desc))[1],
  0,
  0,
  count(*)::integer,
  min(s.created_at),
  min(s.created_at),
  max(s.created_at)
from sainome_unmatched_starts as s
group by s.normalized_name
on conflict (normalized_name, game_slug) do update set
  display_name = excluded.display_name,
  play_count = public.game_scores.play_count + excluded.play_count,
  updated_at = greatest(public.game_scores.updated_at, excluded.updated_at);
