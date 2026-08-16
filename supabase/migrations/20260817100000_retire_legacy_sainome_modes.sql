-- 旧60秒・180秒モードをSupabaseのゲームカタログと保存表から除去する。
-- サイノメ300秒モードは実験場のカタログから非表示にするが、実装・履歴は削除しない。
-- 匿名サインインの有効化はSupabase DashboardのAuth設定で行わず、
-- 製品要件により匿名認証を採用しないため、ランキング受付を停止する。

delete from private.sainome_v2_plays
where game_slug in ('sainome_60_seconds', 'sainome_180_seconds');

delete from private.sainome_v2_scores
where game_slug in ('sainome_60_seconds', 'sainome_180_seconds');

delete from public.game_scores
where game_slug in ('sainome_60_seconds', 'sainome_180_seconds');

delete from public.score_runs
where game_slug in ('sainome_60_seconds', 'sainome_180_seconds');

delete from public.games
where game_slug in ('sainome_60_seconds', 'sainome_180_seconds');

update public.games
set is_active = false
where game_slug = 'sainome_300_seconds';

update private.sainome_v2_config
set accepting_runs = false,
    ranking_enable_not_before = 'infinity'::timestamptz,
    cache_probe_note = 'ranking paused: anonymous authentication is not allowed by product requirement',
    updated_at = clock_timestamp()
where singleton = true;
