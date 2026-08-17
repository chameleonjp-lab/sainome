-- 実験場とランキングの登録名をモード秒数なしの「サイノメ」に統一する。
-- 既存のスコア、プレイ回数、有効状態は変更しない。

update public.games
set title = 'サイノメ'
where game_slug = 'sainome_300_seconds'
  and title = 'サイノメ 300秒';
