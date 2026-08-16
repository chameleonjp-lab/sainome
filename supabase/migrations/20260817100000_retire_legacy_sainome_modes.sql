-- 旧60秒・180秒モードをSupabaseのゲームカタログと保存表から除去する。
-- サイノメ300秒モードは実験場のカタログから非表示にするが、実装・履歴は削除しない。
-- 匿名サインインの有効化はSupabase DashboardのAuth設定で行うため、この移行では変更しない。

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
