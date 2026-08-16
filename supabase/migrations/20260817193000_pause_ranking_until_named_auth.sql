-- 匿名認証を採用しない製品要件に合わせ、正式な利用者認証を実装するまで受付を停止する。
-- 表示名だけでの受付再開は、なりすましと記録上書きを防げないため行わない。

update private.sainome_v2_config
set accepting_runs = false,
    ranking_enable_not_before = 'infinity'::timestamptz,
    cache_probe_note = 'ranking paused: anonymous authentication is not allowed by product requirement',
    updated_at = clock_timestamp()
where singleton = true;
