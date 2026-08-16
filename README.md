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
- 消去後に1個だけ床へ残り、乗ると上へ戻れるサイコロ
- 新しいプレイを300秒へ統一し、旧60秒・180秒の保存記録と未送信結果は削除せず保全する互換処理
- 300秒モードの初期6個（1・2・3を各2個）と、消去数と同数のランダム補充
- ホーム、3カウント、プレイ中表示、結果、再挑戦の画面遷移
- ホームと結果画面からカメレオンJPの実験場へ戻る導線
- 操作、消去、1の特殊消去、300秒の初期配置と補充を説明する5枚のチュートリアル
- 初期状態オフで、設定を保存できる4種類の効果音
- 300秒の自己ベスト記録（過去の60秒・180秒記録は削除せず保持）
- 端末の共有画面とコピーに対応した結果シェア
- 必須のランキング名をNFKCで整え、Unicode 15.1の固定契約で検査して端末へ保存
- 300秒の最高記録ランキング上位10名を結果画面へ表示（過去の60秒・180秒未送信記録は保全）
- ランキング受付前の結果をIndexedDBトランザクションで端末へ保全し、手動で同じ番号を再送
- ランキング名のゲーム内の保存・送信経路を同じ検査へ統一し、不正な旧ランキング行だけを非表示
- ランキング名を双方向隔離して表示し、新DB復旧後の`is_current_user`による本人判定に対応
- 本番Supabaseのランキング契約、Unicode 15.1名前検査、停止後の既発行番号を確定させない補強を受付停止状態で適用し、キャッシュ・Advisor・Turnstile/IP確認が終わるまで受付を停止
- 登録成功後の順位再読込を得点再送から分離し、失効・内容不一致は保全領域へ隔離、早すぎる送信・受付停止は未送信のまま残して後続記録を続行
- 破損データと旧`shared-v1`記録を自動変換せず保全し、非破壊エクスポートと確認付き削除を提供
- iPhone向けの盤面に沿った斜め4方向フリック
- プレイ中だけ盤面外へ表示し、タップでも動ける斜め4方向ボタン
- パソコン向け矢印キー、WASD操作
- 開始前のWebGL 2対応確認と、非対応時の理由表示
- 画面離脱やWebGL描画停止中のゲーム時間・操作の一時停止と復帰
- 開始前の3カウントも画面離脱中は停止し、復帰後に続行
- プレイ中の安全地点を版付きIndexedDBへ保存し、開けない場合はlocalStorageへ切り替えて、再読み込み後に盤面・得点・時間・生成状態・乱数を復元
- WebGL消失時の自動復元、資源再構築失敗時の3D表示再生成、保存地点を残したホーム退避
- 音声コンテキストの中断・終了を検知し、次の明示操作で一度だけ音声を復帰。音声設定は勝手に変更しない
- 端末が動きを減らす設定の場合、装飾用の点滅・拡縮・無限アニメーションと振動を止め、盤面変化の表示は残す
- 実機試験用URLでWebGL強制消失と描画資源の診断値を確認できる（通常URLでは非表示）
- 第11工程の実機受入結果を記録するテンプレート（docs/RELEASE_ACCEPTANCE_RECORD.md）
- GitHub ActionsでPR・main更新時にロック済み依存関係、全自動テスト、JavaScript構文を確認する

## 遊び方

1. ホーム画面でランキング名を入力します。前後や連続する空白、全角英数字などは保存時に整えられます。名前は次回も使えます。初めて遊ぶ場合は「遊び方を見る」で5枚の説明を確認できます。
2. 「ゲーム開始」または説明の最後にある「300秒で始める」を押します。開始時は1・2・3が2個ずつ、合計6個です。
3. 3D盤面の向きに沿って、右上・右下・左下・左上へ斜めにフリックします。盤面外の4つの矢印をタップしても移動できます。
4. 空きマスへ移動すると、足元のサイコロがその方向へ転がります。
5. 上面が2なら2個以上、3なら3個以上のように、同じ目を必要数つなげると沈んで消えます。
6. 沈んでいる間に同じ目を隣接させると、消去を連鎖できます。
7. 1の目を沈下中のサイコロへ隣接させると、盤面上の1がまとめて消えます。
8. 床へ降りたときは、隣の通常サイコロまたは半分沈んだサイコロへ移動すると上へ戻れます。

画面下の「効果音 オフ」を押すと、フリック、サイコロの転がり、消去、生成の音を有効にできます。選択は端末へ保存されます。iOSなどで音声が中断・終了した場合は、次の明示操作で一度だけ復帰を試みます。音声機能を開始できない環境でも、ゲームは無音のまま続けられます。

端末の「動きを減らす」設定が有効な場合は、装飾用の点滅、拡縮、無限アニメーション、振動を止めます。得点、残り時間、消去、盤面の変化はそのまま表示します。

## ゲームモードと得点

- 通常消去：上面の目 × 新しく消去へ入った個数 × 100 × 連鎖数
- 1の特殊消去：消去へ入った個数 × 100 × 連鎖数
- 300秒モードでは、開始時に1・2・3が2個ずつ配置され、消したサイコロ1個につき新しい1個が現れます。
- 新しいサイコロは、プレイヤーの現在地と隣接マスを避けた空きマスからランダムに選びます。空きマスが足りない場合は、残りの生成数を保留します。
- 制限時間に達すると新しい操作とサイコロの出現を止めます。
- 時間切れ前から始まっていた移動と消去が終わった後、結果を1回だけ確定します。
- 結果画面にはモード、得点、消した数、最大連鎖を表示します。
- 初回、自己ベスト更新、同点、自己ベストまでの差を結果画面へ表示します。
- 新しいプレイの自己ベストは300秒として端末へ保存します。保存できない場合もゲームは続けられます。過去の60秒・180秒記録は削除しません。
- 「結果をシェア」では、モード、得点、消した数、最大連鎖、自己ベスト判定、ゲームURLを共有します。端末の共有画面が使えない場合は同じ内容をコピーします。
- 結果確定時に300秒の記録を送信し、結果画面の下部へ最高記録ランキング上位10名を表示します。
- 送信に失敗した結果は端末に保全し、サーバー発行の同じプレイ番号で手動再送できます。本番Supabase側の受付と重複防止は、移行の有効化確認まで停止したままです。
- プレイ中の保存は移動処理の完了地点だけで行い、復元できない未知版の値は削除せず、明示操作まで保全します。
- WebGL復元に失敗した場合も、プレイ中は保存地点から再生成でき、ホームへ退避して次回開始時に新しい3D盤面を作れます。

モード設定は`js/game-modes.js`、時間・得点・結果の処理は`js/game-session.js`、画面の状態は`js/ui-flow.js`に分けています。いずれもHTMLやThree.jsに依存せず、自動テストで確認できます。

## 開発方針

- 元作品の画像・音楽・名称・キャラクターは使用しません。
- ゲームの仕組みを参考にした独自作品として開発します。
- iPhoneを中心に、タブレットとパソコンにも対応します。
- 実装変更はブランチとDraft PRで管理します。

## 第11工程の実機試験

公開候補版の実機試験では、通常のゲームURLへ`?sainome-test=release`を付けると、画面右下に試験用パネルが表示されます。ゲーム中に「WebGLを消失」を押すと、実機が対応している場合は標準のWebGL復旧処理を開始します。「WebGLを復元」を押した場合の同じ画面への復帰と、押さずに5秒待った場合の「3D表示を再生成」「ホームへ」の退避を確認できます。

パネルには、WebGLの消失状態、描画フレーム数、描画予約、サイコロ数、シーン内の物体数、GPU形状・テクスチャ数、アニメーション予約数を表示します。10回の再戦前後で値が増え続けないかを見るための補助情報です。これは安全性の仕組みではなく、通常URLでは表示されません。 実施結果は[第11工程の実機受入記録テンプレート](docs/RELEASE_ACCEPTANCE_RECORD.md)へ、候補版SHAを固定して残します。空欄・未実施は合格扱いにしません。

## ファイル構成

```text
.github/workflows/quality.yml
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
js/motion-preferences.js
js/release-diagnostics.js
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
test/initial-board.test.js
test/webgl-support.test.js
test/spawn-rules.test.js
test/sound-effects.test.js
test/sound-wiring.test.js
test/motion-preferences.test.js
test/motion-wiring.test.js
test/release-diagnostics.test.js
test/release-diagnostics-wiring.test.js
test/best-records.test.js
test/best-record-wiring.test.js
test/result-share.test.js
test/result-share-wiring.test.js
test/quality-workflow.test.js
test/player-profile.test.js
test/player-name-contract.test.js
test/supabase-auth.test.js
test/ranking-client.test.js
test/ranking-wiring.test.js
test/indexeddb-ranking-storage.test.js
test/pending-ranking-submissions.test.js
test/ranking-submission-flow.test.js
test/pending-ranking-wiring.test.js
test/sainome-ranking-submission-contract-migration.test.js
test/sainome-ranking-v2-migration.test.js
test/sainome-300-seconds-migration.test.js
test/tutorial-slides.test.js
test/ui-flow.test.js
contracts/player-name-v1.json
docs/RANKING_IDENTITY_CONTRACT.md
supabase/migrations/20260810120000_sainome_ranking_v2.sql
supabase/migrations/20260811090000_sainome_unicode_name_contract.sql
supabase/migrations/20260813032103_harden_sainome_ranking_submission_contract.sql
supabase/migrations/20260816090000_sainome_300_seconds.sql
archive/60-second/README.md
archive/60-second/dice.js
archive/60-second/game-modes.js
archive/60-second/game.js
archive/60-second/spawn-rules.js
archive/60-second/spawn-rules.test.legacy.js
```

描画にはCDNからThree.jsを読み込みます。効果音はブラウザの音声機能で生成するため、外部の音声ファイルは読み込みません。ランキング通信には公開用のSupabase接続情報だけを使い、秘密鍵は含めません。公開用のビルド作業はなく、静的ファイルをそのまま公開できます。`npm test`でサイコロの面、接続判定、新規300秒プレイ、旧60秒・180秒データの互換処理、消去数と同数のランダム生成、得点、終了確定、効果音、名前保存、ランキング通信、チュートリアル、画面遷移を確認できます。構文だけを再確認する場合は`npm run check:syntax`を使います。GitHub Actionsの`quality.yml`はPRとmain更新で同じ検査を実行します。
