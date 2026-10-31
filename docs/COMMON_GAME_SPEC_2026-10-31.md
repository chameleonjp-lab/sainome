# サイノメ 共通仕様対応記録（2026-10-31）

このPRは共通仕様のうち独立して実装・確認できた変更を含む。**全項目完了ではない**。特に既存共通DBの名前による本人識別と、旧送信APIの重複排除は未解決であり、マージだけでは解決しない。

## 対象・参照版

- 正式名: サイノメ。Supabase `mlpnjgezrnhdxsxolyzj` の実データ `games.game_slug=sainome_300_seconds`, `is_active=true` を確認。
- 実験場の現在のDOMでも登録カードとリンクを確認。固定予備一覧は対象判定に用いていない。
- 正式公開URL: https://chameleonjp-lab.github.io/sainome/ （2026-10-31 HTTP 200）。このPRの変更は未公開。
- カードの実リンク: https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=sainome_300_seconds
- 基点: `79b1e5733e725cd1148b10fa5699ba846e2bf57d`。この版の `js/language-options.js` を15言語の参照とした: ja/en/es/pt-BR/zh-Hans/fr/de/ko/ru/it/zh-Hant/id/tr/vi/th。言語IDと表示localeの対応は変更しない。
- 着手時にopen PRなし。READMEのDraft PR方針に従う。CodebergからのURL切替は本PRでは発生しない。現在の正式URLを共有にも直接使用。

## 対応表

| 共通仕様 | 状態 | 根拠・範囲 |
|---|---|---|
| 1 対象判定 | 既存状態を確認 | 現行DB、実験場DOM、公開URL200 |
| 2 ルール・記録維持 | 既存を維持 | 300秒、7×7、得点式、終了時の確定待機、リタイアの既存扱いを変更しない。DB書込み・移行なし |
| 3 正式URL・移行 | 既存で対応済み／今回修正 | canonical/OG画像は既存GitHub URL。共有も正式定数へ統一。別origin移行は対象外（今回URL変更なし） |
| 4 15言語 | 既存で対応済み＋今回追加 | 既存本文・遊び方・動的表示の辞書を維持、新規7文言を全14翻訳辞書へ追加。問題は数値/盤面で言語依存なし。自然さの母語話者確認は未実施 |
| 5 任意名 | 今回実装／一部未完了 | 空欄・全角空白で開始/結果/順位閲覧、ホームで変更・消去、開始名固定。ゲスト結果は送信待ちへ入れない。**同名別人・改名後の同一参加者・応答喪失後の重複送信は既存DB制約により未完了** |
| 6 詳細リンク・30名 | 今回実装／集計上の制約あり | 両画面の実リンク。既存 `get_best_score_ranking(p_limit=30)` の集計行・rank_noを表示、空/失敗/再試行を維持。DBは参加者の代わりにname-keyを集計しており厳密な30人保証は未完了 |
| 7 X共有 | 今回実装 | 黒/白のXでシェア、言語別紹介/今回結果、正式URL。投稿画面を開くのみ。ブロック時コピー、コピーも不可なら選択可能テキスト。投稿完了とは表示しない |
| 8 効果音 | 既存を確認・維持 | 下表の4イベント。音源購入なし。実際の試聴・長時間実機確認は未実施 |
| 9 初回音オン | 今回実装 | 未設定オン/音量50%、旧false保持、音量0保持。操作時unlock、非表示停止、音失敗でもゲーム継続。実機での音量評価は未確認 |
| 10 画面・文言 | 今回実装 | 不要な必須表示削除、公開説明、長い共有ラベルの折返し、長い名前、音量操作。Chromium幅変更は確認、iPhone Safari実機は未確認 |
| 11 自動公開 | 定義を修正・設定確認は下記 | PRではテスト/ビルドのみ。main検証成功後の成果物公開、旧SHA拒否。Pages設定と本番公開結果は別途扱う |
| 12 検証・レビュー | 実施／一部未確認 | 下記。実ランキングへの試験登録なし。別担当の差分レビュー済み |
| 13 成果物 | 本PRと本書 | 関連DB契約の課題を隠さない。マージ/本番反映は利用者が管理 |

## 記録と送信の制約

保存先 `public.game_scores`/`score_runs`、識別値 `sainome_300_seconds`、モード `300-seconds`、得点の整数精度・降順・自己ベスト方式を維持。`record_game_play` の名前あり開始記録、`submit_score` の確定結果送信を維持。開始通信はゲーム開始を待たせない。匿名の開始RPCは元実装にないため新設しない。

既存基盤は `players.normalized_name` と `(normalized_name,game_slug)` をキーとする。同名だけで記録が混ざる構造をフロントのUUIDで見かけだけ変更しない。過去の混在記録の本人を名前だけで推定できない。今後の対応案は、既存記録を削除せず、表示名と独立した参加者ID・所有を証明する仕組み・検証できる旧資格情報からの明示引継ぎを共通基盤で追加すること。別ランキングへの分割/統合や既存スコアの自動帰属変更はしない。

`submit_score` はサーバーのidempotencyキーを受け取らない。今回の既存single-flight/送信済み状態は画面再表示などの二重呼出しを抑えるが、成功応答を失った後の再試行を厳密に一回にできない。汎用 `start_game_play_v1`/`finish_game_play_v1`/`submit_score_idempotent_v1` への移行案があるが、開始回数・リタイア・旧未送信記録の意味と整合させる追加実装が必要。旧記録は勝手に再作成/削除しない。

端末の名前 `sainome.player-profile.v1`、自己ベスト `sainome.best-records.v1`、言語 `sainome.language.v1`、音オン/オフ `sainome:sound-enabled:v1` とIndexedDBの既存保存を保持。音量だけ `sainome:sound-volume:v1` を追加。ゲストの進行中保存も空名をそのまま復元する。localStorage代替経路には既存の汎用キー `active-play` があり、同originの他ゲームとの衝突調査は未完了。今回このキーを消去・一括移行しない。

## 効果音一覧

| イベント | 役割・条件 | 重複抑制と後片付け | 実装 |
|---|---|---|---|
| 移動 | 受理された移動の感触 | ゲーム側の移動受理制御、終了時ノード切断 | main onMove / sound-effects playFlick |
| サイコロ転がり | 転がり開始の質感 | 移動アニメーション制御、予約ノードを追跡して非表示時停止 | onRollStart / playRoll |
| 消去 | 消去開始の確認 | 45ms以内の重複消去音を抑制、終了時切断 | onClearStart / playClear |
| 生成 | 生成数のフィードバック | まとめたcountを1回通知、音量上限、終了時切断 | onSpawn / playSpawn |

Web Audio生成。音量50%は旧master gain0.42へ0.5を掛けた控えめな初期値であり、試聴で最適と確認した値ではない。保存false/0と非表示状態を再生判定で優先し、非表示時に過去の音を止める。

## 検証

- `npm ci`、`npm test`、`npm run check:syntax`、`npm run check:release-syntax`、`npm run build:pages`、`npm run verify:pages`。
- 構文確認はシェルglobの先頭だけでなく、各JSと全翻訳ファイルを再帰的に検査するよう修正。
- `npx playwright install --with-deps chromium` 後 `npm run test:browser`。Three.jsは公開版と同じ0.185.1をローカル供給し、Supabase全RPCをモック。15言語、全角空白ゲスト開始/結果、後から名を入れても旧ゲスト記録を送らない、30行、開始名固定、言語再描画で再送しない、393×852/852×393/393×600、保存off/volume0を確認。
- 通信失敗/再送は既存unit testsも実行。サーバー上の二重登録がないことを本番書込みで検証したわけではない。
- 未実施: iPhone17 Pro Safari実機、母語話者レビュー、実音試聴、長時間端末試験、本PRの本番公開。

## マージ・公開・復旧

着手時のSettings > Pagesは `build_type=legacy`, source `main /` だった。Actions定義だけではブランチ直接公開が残るため、公開元をGitHub Actions (`build_type=workflow`) へ変更する必要がある。実際の変更結果はPR本文へ記録する。保護/承認設定は解除しない。

PRのQuality checksが成功してから利用者がmainへマージ。Deploy GitHub Pagesが同コミットをテストし、`_site`を生成/検証し、main HEADと一致する時だけ公開する。PRからは公開しない。手動dispatchは今回実行しない。公開物には開発依存、SQL、docsを含めない。版付きURLでキャッシュ更新し、保存データは消さない。

マージ後: Actionsの成功SHAと公開 `release.json` のcommitを照合し、正式URLで空名開始、結果30行、X投稿画面（投稿せず戻る）、名前変更後の次回適用、音オフ/0の再読込を確認。iPhoneでは縦横、ソフトキーボード、日本語変換確定、画面ロックからの復帰を確認する。

復旧: このPRをrevertするPRを作成して通常CI/公開経路で戻す。DB・既存名前/自己ベスト保存は削除しない。公開元設定だけ戻すならPagesを以前のmain /へ戻せるが検証前公開が復活するため、原則Actionsを維持してコードをrevertする。ゲスト進行保存は旧版で読めない可能性があるため、戻す前にプレイを終えるか保存を書き出して保全する。
