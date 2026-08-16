-- 受入確認済みの300秒モードだけを本番受付へ切り替える。
-- 旧60秒・180秒の保存済み記録とゲーム行は変更しない。
-- config -> games の順でロックし、受付ゲートとゲーム公開を同一トランザクションで更新する。

do $$
declare
  v_config_singleton boolean;
  v_game_slug text;
begin
  select singleton
    into v_config_singleton
  from private.sainome_v2_config
  where singleton = true
  for update;

  if not found then
    raise exception 'sainome v2 config row is missing';
  end if;

  select game_slug
    into v_game_slug
  from public.games
  where game_slug = 'sainome_300_seconds'
  for update;

  if not found then
    raise exception 'sainome 300-second game row is missing';
  end if;

  update private.sainome_v2_config
  set accepting_runs = true,
      ranking_enable_not_before = clock_timestamp(),
      cache_probe_note = 'release 783926c4b70dee6043374ef9ec8265970ea47cb6 verified on GitHub Pages; Supabase client config matched; 300-second acceptance enabled',
      updated_at = clock_timestamp()
  where singleton = true;

  update public.games
  set is_active = true
  where game_slug = 'sainome_300_seconds';
end
$$;
