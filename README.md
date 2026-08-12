# サイノメ

サイコロを転がし、上面の数字と同じ数以上をつなげて消す、スマートフォン向けブラウザパズルゲームです。

## 現在の実装

- Three.jsで描画する7×7の3D盤面
- 上下左右への移動とサイコロの6面管理
- 上面の目と同じ数以上を縦横につなぐ消去
- 沈下中の同じ目へ追加する連鎖
- サイコロ上と空いた床の移動
- 沈下中のサイコロへ1を隣接させる特殊消去
- 床から近くの通常サイコロへ直接登る操作
- 開始30秒後から、安全な空きマスへ合計2個だけ現れるサイコロ
- 消去後に1個だけ床へ残り、乗ると上へ戻れるサイコロ
- 画面表示から分けた60秒・180秒モード、得点計算、終了確定
- 180秒モードの消去数に応じたサイコロ生成
- ホーム、3カウント、プレイ中表示、結果、再挑戦の画面遷移
- ホームと結果画面からカメレオンJPの実験場へ戻る導線
- 操作、消去、モードの違いを説明する3枚のチュートリアル
- 初期状態オフで、設定を保存できる4種類の効果音
- 60秒・180秒を分けて端末へ保存する自己ベスト記録
- 端末の共有画面とコピーに対応した結果シェア
- 必須のランキング名をNFKCで整え、Unicode 15.1の固定契約で検査して端末へ保存
- 60秒・180秒を分けた最高記録ランキング上位10名を結果画面へ表示
- ランキング受付前の結果をIndexedDBトランザクションで端末へ保全し、手動で同じ番号を再送
- ランキング名のゲーム内の保存・送信経路を同じ検査へ統一し、不正な旧ランキング行だけを非表示
- ランキング名を双方向隔離して表示し、新DB復旧後の`is_current_user`による本人判定に対応
- 本番Supabaseのランキング契約とUnicode 15.1名前検査を受付停止状態で適用し、キャッシュ・Advisor・Turnstile/IP確認が終わるまで受付を停止
- 登録成功後の順位再読込を得点再送から分離し、通信失敗の恒久拒否を隔離して後続記録を続行
- 破損データと旧`shared-v1`記録を自動変換せず保全し、非破壊エクスポートと確認付き削除を提供
- iPhone向けの盤面に沿った斜め4方向フリック
- パソコン向け矢印キー、WASD操作
- 開始前のWebGL 2対応確認と、非対応時の理由表示
- 画面離脱やWebGL描画停止中のゲーム時間・操作の一時停止と復帰
- 開始前の3カウントも画面離脱中は停止し、復帰後に続行
- プレイ中の安全地点を版付きIndexedDBへ保存し、再読み込み後に盤面・得点・時間・生成状態・乱数を復元
- WebGL消失時の自動復元、資源再構築失敗時の3D表示再生成、保存地点を残したホーム退避
- 音声コンテキストの中断・終了を検知し、次の明示操作で一度だけ音声を復帰。音声設定は勝手に変更しない

## 遊び方

1. ホーム画面でランキング名を入力し、60秒または180秒を選びます。前後や連続する空白、全角英数字などは保存時に整えられます。名前は次回も使えます。初めて遊ぶ場合は「遊び方を見る」で3枚の説明を確認できます。
2. 「ゲーム開始」または説明の最後にある選択モードの開始ボタンを押します。
3. 3D盤面の向きに沿って、右上・右下・左下・左上へ斜めにフリックして移動します。
4. 空きマスへ移動すると、足元のサイコロがその方向へ転がります。
5. 上面が2なら2個以上、3なら3個以上のように、同じ目を必要数つなげると沈んで消えます。
6. 沈んでいる間に同じ目を隣接させると、消去を連鎖できます。
7. 1の目を沈下中のサイコロへ隣接させると、盤面上の1がまとめて消えます。
8. 床へ降りたときは、隣の通常サイコロまたは半分沈んだサイコロへ移動すると上へ戻れます。

画面下の「効果音 オフ」を押すと、フリック、サイコロの転がり、消去、生成の音を有効にできます。選択は端末へ保存されます。iOSなどで音声が中断・終了した場合は、次の明示操作で一度だけ復帰を試みます。音声機能を開始できない環境でも、ゲームは無音のまま続けられます。

## ゲームモードと得点

- 通常消去：上面の目 × 新しく消去へ入った個数 × 100 × 連鎖数
- 1の特殊消去：消去へ入った個数 × 100 × 連鎖数
- 60秒モードでは、開始30秒後から、空きマスができたタイミングでサイコロが合計2個だけ現れます。
- 180秒モードでは、1回の消去で新しく消える数に応じてサイコロが現れます。

| 180秒モードの消去数 | 生成数 |
|---:|---:|
| 3個 | 1個 |
| 4個 | 2個 |
| 5個 | 3個 |
| 6個以上 | 4個 |

- 生成時はプレイヤーの現在地と隣接マスを避けます。
- 制限時間に達すると新しい操作とサイコロの出現を止めます。
- 時間切れ前から始まっていた移動と消去が終わった後、結果を1回だけ確定します。
- 結果画面にはモード、得点、消した数、最大連鎖を表示します。
- 初回、自己ベスト更新、同点、自己ベストまでの差を結果画面へ表示します。
- 自己ベストは60秒と180秒を分けて端末へ保存します。保存できない場合もゲームは続けられます。
- 「結果をシェア」では、モード、得点、消した数、最大連鎖、自己ベスト判定、ゲームURLを共有します。端末の共有画面が使えない場合は同じ内容をコピーします。
- 結果確定時に選択したモードへ記録を送信し、結果画面の下部へ最高記録ランキング上位10名を表示します。60秒と180秒の順位は混ざりません。
- 送信に失敗した結果は端末に保全し、サーバー発行の同じプレイ番号で手動再送できます。本番Supabase側の受付と重複防止は、移行の有効化確認まで停止したままです。
- プレイ中の保存は移動処理の完了地点だけで行い、復元できない未知版の値は削除せず、明示操作まで保全します。
- WebGL復元に失敗した場合も、プレイ中は保存地点から再生成でき、ホームへ退避して次回開始時に新しい3D盤面を作れます。

モード設定は`js/game-modes.js`、時間・得点・結果の処理は`js/game-session.js`、画面の状態は`js/ui-flow.js`に分けています。いずれもHTMLやThree.jsに依存せず、自動テストで確認できます。

## 開発方針

- 元作品の画像・音楽・名称・キャラクターは使用しません。
- ゲームの仕組みを参考にした独自作品として開発します。
- iPhoneを中心に、タブレットとパソコンにも対応します。
- 実装変更はブランチとDraft PRで管理します。

## ファイル構成

```text
index.html
css/style.css
js/dice.js
js/board-rules.js
js/game-modes.js
js/game-session.js
js/game-random.js
js/game-state-storage.js
js/simulation-pause.js
js/input-direction.js
js/spawn-rules.js
js/sound-effects.js
js/best-records.js
js/result-share.js
js/player-profile.js
js/player-name-unicode-15-1.js
js/supabase-auth.js
js/ranking-client.js
js/pending-ranking-submissions.js
js/ranking-submission-flow.js
js/supabase-config.js
js/webgl-support.js
js/tutorial-slides.js
js/ui-flow.js
js/main.js
js/webgl-game.js
test/board-rules.test.js
test/game-modes.test.js
test/game-session.test.js
test/game-random.test.js
test/game-state-storage.test.js
test/simulation-pause.test.js
test/input-direction.test.js
test/webgl-lifecycle.test.js
test/webgl-support.test.js
test/spawn-rules.test.js
test/sound-effects.test.js
test/sound-wiring.test.js
test/best-records.test.js
test/best-record-wiring.test.js
test/result-share.test.js
test/result-share-wiring.test.js
test/player-profile.test.js
test/player-name-contract.test.js
test/supabase-auth.test.js
test/ranking-client.test.js
test/ranking-wiring.test.js
test/indexeddb-ranking-storage.test.js
test/pending-ranking-submissions.test.js
test/ranking-submission-flow.test.js
test/pending-ranking-wiring.test.js
test/sainome-ranking-v2-migration.test.js
test/tutorial-slides.test.js
test/ui-flow.test.js
contracts/player-name-v1.json
docs/RANKING_IDENTITY_CONTRACT.md
supabase/migrations/20260810120000_sainome_ranking_v2.sql
supabase/migrations/20260811090000_sainome_unicode_name_contract.sql
```

描画にはCDNからThree.jsを読み込みます。効果音はブラウザの音声機能で生成するため、外部の音声ファイルは読み込みません。ランキング通信には公開用のSupabase接続情報だけを使い、秘密鍵は含めません。公開用のビルド作業はなく、静的ファイルをそのまま公開できます。`npm test`でサイコロの面、接続判定、60秒・180秒モード、生成数、得点、終了確定、効果音、名前保存、ランキング通信、チュートリアル、画面遷移を確認できます。
