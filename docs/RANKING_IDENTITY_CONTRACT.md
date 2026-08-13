# ランキング名・利用者識別契約

- 作成日：2026年8月9日
- 名前契約：`player-name-v1`
- ランキング受付契約：`sainome-play-v2`
- 初期対応クライアント版：`sainome-web-2`

## 1. 適用状態

この文書は、敵対的検証対応計画の第2工程で確定した規範である。

- `player-name-v1`のブラウザ・DB検査と共通テストベクトルは実装済みである。
- Anonymous Auth、サーバー発行プレイ番号、v2 RPC、非公開表、RLS、権限変更は第3工程で実装済みである。
- 既存の`shared-v1`保存形式は変更せず、`sainome-play-v2`へ変換しない。
- 表示名は公開用の文字列であり、本人を識別するIDではない。同じ表示名を複数の利用者が使える。

`supabase/migrations/20260810120000_sainome_ranking_v2.sql`、`supabase/migrations/20260811090000_sainome_unicode_name_contract.sql`、`supabase/migrations/20260813032103_harden_sainome_ranking_submission_contract.sql`は受付停止状態で本番へ適用済みである。最後の移行は本番履歴`20260813033722`として、停止後の未確定番号を確定処理でも拒否する。`accepting_runs`は`false`、`ranking_enable_not_before`は`infinity`、対象ゲームの`public.games.is_active`は`false`のままである。クライアントの拒否分類変更はこの移行と同じDraftへ追加済みだが、公開サイトへの反映はPRのマージと配備を待つ。キャッシュ測定、Turnstile/IP制限、Advisor警告のallowlist整理、受付有効化は未完了である。

## 2. `player-name-v1`

### 入力の正規化 `canonicalize(raw)`

利用者が名前欄を確定した時だけ、次の順で整える。

1. 文字列入力を最大80 Unicodeコードポイントまで読み取る。
2. Unicode 15.1.0の禁止コードポイントがあれば拒否する。
3. NFKCで正規化する。
4. Unicode 15.1.0の空白を前後から除き、内部の連続空白をU+0020一つへまとめる。
5. 正規化後の1〜20 Unicodeコードポイントだけを受け付ける。
6. 後述の禁止範囲、不可視、結合、Join_Control、variation selectorの文脈を検査する。

成功時は正規化済み表示名を返す。`contracts/player-name-v1.json`の`accepted: true`は、この入力境界へ`inputCodePoints`を渡した時に成功し、結果が`normalizedCodePoints`と一致することを意味する。

### 永続化境界 `acceptCanonical(value)`

localStorage、未送信キュー、再送、RPC送信、将来のDB受付では、渡された値が`canonicalize(value)`の結果と完全一致する時だけ受け付ける。境界で黙って直したり、既存値を書き換えたりしない。

共通ベクトルの正常例を永続化境界で検査する時は、`normalizedCodePoints`を受け付ける。`inputCodePoints`と`normalizedCodePoints`が異なる例では、生の`inputCodePoints`を永続化境界が拒否することも確認する。この二つを同じ「accepted」の期待値として扱わない。

### 拒否と文脈付き許可

Unicode 15.1.0で固定したデータを使い、次を拒否する。

- 制御文字、双方向制御、改行・段落区切り、孤立サロゲート
- 私用文字、未割り当て文字、非文字コードポイント
- 原則としてDefault_Ignorableである文字
- U+2800 BRAILLE PATTERN BLANK、U+13441/U+13442 Egyptian Hieroglyph Blank、U+1D159 MUSICAL SYMBOL NULL NOTEHEADなど、見た目が空になる既知の文字
- 空白、結合記号、variation selectorだけで構成された名前
- 基底文字のない結合記号、同じ結合クラスタ内の同一結合記号の反復、5個以上連続する結合記号

NFKCによる合成で結合記号の反復や個数制限を迂回できないよう、結合文脈だけはNFKC結果をNFDに展開した検査用ビューで判定する。保存する値はNFKC結果のままとする。

言語や登録済み絵文字列を不必要に壊さないため、例外は次へ限定する。

- U+200C ZERO WIDTH NON-JOINERは、Unicode Security MechanismsのContextJ A1またはA2に一致し、CommonとInheritedを除く文字が単一scriptに属する場合だけ許可する。
- U+200D ZERO WIDTH JOINERは、ContextJ Bに一致して単一script条件を満たす場合、またはUnicode 15.1.0の固定済みRGI emoji ZWJ sequenceに完全に含まれる場合だけ許可する。
- variation selectorは、Unicode 15.1.0の固定済みRGI emoji sequenceに完全に含まれる場合だけ許可する。任意の文字直後にある`A`+VS16などは拒否する。
- 結合記号は、同じ結合クラスタに先行する基底文字がある場合だけ許可する。

`player-name-v1`では安全側へ固定するため、tag文字を含むRGI subdivision flag、VS15、Mongolian FVS、Ideographic Variation Selectorを受け付けない。将来必要になった場合は登録済み列を別契約版で固定して追加する。

ContextJのscript・joining type、RGI emoji sequence、禁止範囲は静的データとしてコードへ含める。JavaScript実行環境のUnicode property escapeへ依存しない。規範となる実装データは`js/player-name-unicode-15-1.js`、正常・異常例は`contracts/player-name-v1.json`とする。生成元のUnicode版、パッケージ版、参照プロパティは実装ファイル先頭へ記録する。

### DBとの一致

PostgreSQL側もUnicode 15.1.0の同じ範囲と共通ベクトルを使う。PostgreSQLの正規表現へJavaScriptの`\p{...}`を移植しない。

第3工程では、NULと孤立サロゲートのようにPostgreSQLの`text`へ入らないブラウザ専用例を除き、次をDB関数で検査する。

- 正常例の`normalizedCodePoints`を受け付ける。
- 正常例でも生入力と正規形が異なる場合、生の`inputCodePoints`はDB境界で拒否する。
- 異常例の`inputCodePoints`と`normalizedCodePoints`をどちらも拒否する。
- `normalize(value, NFKC)`、空白の正規化結果と値が完全一致する。
- `char_length`が1〜20で、禁止範囲、不可視だけの値、不正な結合文脈がない。

Unicode版を上げる時は、範囲データ、契約JSON、ブラウザ検査、DB検査を同じ変更で更新し、名前契約版も更新する。

`20260811090000_sainome_unicode_name_contract.sql`は、ブラウザで固定したUnicode 15.1の禁止範囲、Script、Emoji列挙、共通正常・異常例をDBへ反映済みである。ブラウザとDBの固定件数および判定順が一致することも、本番受付停止中に確認済みである。

## 3. `sainome-play-v2`

### 開始前の発行RPC

第3工程では、ランキング対象プレイの3カウント前に次の完全一致シグネチャを呼ぶ。

`issue_sainome_play_v2(p_display_name text, p_game_slug text, p_client_version text, p_contract_version text)`

許可値は、正規形の表示名、`sainome_60_seconds`または`sainome_180_seconds`、`sainome-web-2`、`sainome-play-v2`である。RPCはAuthorizationヘッダーのJWTから`auth.uid()`を取得し、所有者UIDを引数、端末保存、要求本文から受け取らない。

成功は必ず一行で、次の列を返す。0行、複数行、列不足、型不一致、要求と一致しない値はクライアント側でも失敗にする。受付不能は成功0行ではなくDBエラーにする。

| 列 | 型 | 条件 |
|---|---|---|
| `issued` | boolean | 常に`true` |
| `result_submission_id` | uuid | DBが新規発行した番号 |
| `result_display_name` | text | 要求した正規名と完全一致 |
| `result_game_slug` | text | 要求slugと完全一致 |
| `result_client_version` | text | `sainome-web-2`と完全一致 |
| `result_contract_version` | text | `sainome-play-v2`と完全一致 |
| `issued_at` | timestamptz | DB時刻 |
| `earliest_submit_at` | timestamptz | 60秒モードは`issued_at + 63 seconds`、180秒モードは`issued_at + 183 seconds` |
| `expires_at` | timestamptz | `issued_at + 24 hours` |

3秒は3カウント分である。クライアントは`issued_at < earliest_submit_at < expires_at`も検査し、成功応答を受け取った後にだけ3カウントを始める。認証、発行、通信に失敗してもゲーム自体は遊べるが、そのプレイは明示的にランキング対象外とし、終了後に番号を遡及発行しない。

発行RPCは、`private.sainome_v2_config`、対象の`public.games`、UID対応行の順にロックする。設定行とゲーム行は共有ロックし、`accepting_runs=true`、DB現在時刻が`ranking_enable_not_before`以後、対象ゲームの`is_active=true`を全て要求する。受付停止、有効化時刻前、ゲーム無効は`PT503`で拒否する。全てのロック待ち後にDB時刻を取り直し、その時刻から発行時刻、最短受付時刻、失効時刻を計算する。

### 発行上限と原子性

初期上限を次へ固定する。

- 未消費上限：同じUIDで`status = 'issued' AND expires_at > DB現在時刻`の行は最大10件。期限切れと受付済みは数えない。
- 発行頻度：同じUIDの`issued_at > DB現在時刻 - interval '60 minutes'`にある全発行は最大60件。時計時刻の区切りではなくrolling 60分とする。

UID対応行を一意作成してロックし、上限判定と発行行INSERTを同一トランザクションで直列化する。初回の同時要求でも対応行は一件だけで、10件目と11件目、60件目と61件目の並行要求が上限を越えないことを自動検査する。

発行台帳の`submission_id`はDB生成UUIDの主キーとし、`status`はCHECK制約で`issued`または`accepted`だけを許可する。状態遷移は`issued`から`accepted`への一方向だけとする。

上限到達時は未使用番号を自動取消・削除しない。理由を表示してランキング対象外のゲームとして続行できるようにする。

### Anonymous Auth

- 既存セッションがあれば再利用し、セッションがない時だけ`signInAnonymously`を呼ぶ。プレイごとに匿名利用者を作らない。
- 本番でランキング受付を有効にする条件としてTurnstileを必須にし、匿名サインインへ取得済みトークンを渡す。匿名利用者作成のIP上限を初期30件/時/IPに設定し、本番の実値を移行検証記録へ残す。
- 発行時はJWTの`is_anonymous = true`と`auth.uid() IS NOT NULL`を要求する。匿名利用者はDB上では`authenticated`ロールであり、発行・確定RPCを`authenticated`だけへ許可する。
- 発行後に同じUIDのまま恒久アカウントへ昇格した場合、確定はUID一致を主条件として許可する。
- access token期限切れ時は既存セッションの更新を試す。更新できない時、保存済み番号の再送のために別の匿名UIDを黙って作らない。
- access tokenとrefresh tokenを未送信結果へコピーしない。
- サインアウト、サイトデータ消去、別端末への移動で元のUIDを復元できない場合、そのUIDに結合した番号は送らず端末へ保全する。
- 匿名UIDは「人間一人」の証明ではない。サイトデータ消去、別端末、ネットワーク変更による複数UID作成の余地は残る。

### 一度だけの確定

`submit_score_once(p_display_name text, p_game_slug text, p_score integer, p_client_version text, p_submission_id text, p_contract_version text)`では、発行RPCが返したUUIDを`p_submission_id`へ同じ文字列表現で渡す。確定RPCは対象発行行をロックし、JWTのUID、slug、正規名、契約版、クライアント版、時間窓を完全照合する。

判定順序は次へ固定する。

1. JWTのUIDに所有される発行行をロックする。番号なしと別UIDは、番号の存在や所有者を区別して公開せず`PT410`で拒否する。
2. slug、正規名、契約版、クライアント版が発行内容と異なる場合は`PT409`で拒否する。
3. 受付済みなら、停止後・期限後でも完全一致再送だけ保存済み結果を`was_duplicate=true`で返す。受付済み得点と異なる再送は`PT409`で拒否する。
4. 未確定なら、設定行、ゲーム行、UID対応行の順にロックする。UID対応がない、または発行時の内部利用者と一致しない場合は`PT410`で拒否し、全ての待機後にDB時刻を取り直す。
5. 失効時刻以後は`PT410`、受付停止・有効化時刻前・ゲーム無効は`PT503`、最短受付時刻より前は`PT425`で拒否する。時間窓は`earliest_submit_at <= DB現在時刻 < expires_at`の半開区間とする。
6. 全検査を通った場合だけ、得点集計と台帳の受付済み化を一つのトランザクションで行う。

| 状況 | PostgRESTコード | ブラウザ側の扱い |
|---|---|---|
| 期限切れ、番号なし、別UID、内部利用者対応不一致 | `PT410` | 再送不能として隔離し、元データは保全 |
| 発行内容または受付済み得点との不一致 | `PT409` | 恒久拒否として隔離し、元データは保全 |
| 最短受付時刻より早い | `PT425` | 未送信のまま再送可能 |
| 受付停止、有効化時刻前、ゲーム無効 | `PT503` | 未送信のまま再送可能 |

番号発行後に受付を停止した場合、未確定番号は`PT503`となり、新しい得点を登録しない。受付再開時に期限内なら同じ番号を再送でき、停止中に期限を過ぎた番号は`PT410`となる。すでに受付済みの完全一致再送だけは停止中も以前の結果を返し、端末の未送信表示を安全に片付けられる。

成功は必ず一行で、次の列を返す。0行、複数行、列不足、型不一致、要求と一致しない値はクライアントでも失敗にする。

| 列 | DB型 | 条件 |
|---|---|---|
| `accepted` | boolean | 常に`true` |
| `result_submission_id` | uuid | 発行番号と一致 |
| `result_contract_version` | text | `sainome-play-v2`と一致 |
| `result_client_version` | text | 発行時の`sainome-web-2`と一致 |
| `result_game_slug` | text | 発行時のslugと一致 |
| `result_display_name` | text | 発行時の正規名と一致 |
| `result_submitted_score` | integer | 今回の要求得点と一致し、0〜100,000,000 |
| `result_best_score` | integer | 集計後の自己ベストで0〜100,000,000 |
| `result_play_count` | integer | 集計後のプレイ回数で1以上 |
| `is_first_play` | boolean | 初回集計か |
| `is_new_best` | boolean | 自己ベストを更新したか |
| `was_duplicate` | boolean | 初回受付は`false`、完全一致再送は`true` |

同時送信でもプレイ回数を一度だけ増やす。初回受付時に要求全体と、`was_duplicate`を除く集計結果を保存する。完全一致再送では保存値を返し、初回から変わるのは`was_duplicate=false`から`true`だけとする。受付済み要求と応答は少なくとも端末の再送可能期間を覆う必要があるため、第3工程では自動削除しない。保持・匿名利用者清掃を導入する場合は別工程で、集計と冪等再送を壊さない保持期間を先に契約する。

第1工程の`shared-v1`はクライアント生成番号で、所有者、モード、発行時刻に結合されていない。`sainome-play-v2`へ変換、番号再発行、公開順位への自動登録を行わず、元の契約版のまま未検証記録として保全する。

## 4. 利用者対応とランキング読取

### 非公開の利用者対応

既存の表示名をキーにした集計では、同じ名前の別UIDが一人へ統合される。private schemaに次の制約を持つ対応を置く。

- `owner_uid`は主キーまたはUNIQUEで、一UIDにつき一行。
- `player_key`はDB生成UUIDでUNIQUE。
- 同じUIDから初回発行が並行しても一つの対応だけを作る。
- `auth.users`削除に連動してランキングや受付済み台帳を消さない。`ON DELETE CASCADE`を使わず、最小実装では外部キーを置かない。

サイノメv2の集計は既存の公開`players`、`game_scores`、`score_runs`へ混ぜず、private schemaの専用集計表へ置く。集計表は`(player_key, game_slug)`を主キーまたはUNIQUEにし、一利用者・一モードを必ず一行へ原子的にupsertする。同じプレイの並行確定でも集計行を複製しない。

集計の内部キーには`player_key`を使い、表示名は別列に保持する。受付成功のたびに、そのUIDの全モードで表示する名前を最新の受付済み正規名へ更新する。private集計表をData APIの直接SELECTへ公開せず、UIDと内部キーをランキング応答へ出さない。

### ランキング読取RPC

完全一致シグネチャを次へ固定する。

`get_sainome_ranking_v2(p_game_slug text, p_limit integer)`

slugは2モードだけ、limitは1〜10だけを許可し、順位順の0〜10行を返す。並びは`best_score DESC`、その得点へ最初に到達したDB時刻、最後に内部`player_key`の順で決定的にする。各行は次の列だけを持つ。

| 列 | 型 | 条件 |
|---|---|---|
| `rank_no` | integer | 1から始まる順位 |
| `display_name` | text | `player-name-v1`の正規形 |
| `best_score` | integer | 0〜100,000,000 |
| `play_count` | integer | 1以上 |
| `is_current_user` | boolean | 本人行だけ`true` |
| `verification_status` | text | 常に`unverified` |

実行権限は`PUBLIC`から取り消し、`anon`と`authenticated`へ付与する。未認証の`anon`要求は全行を`is_current_user=false`とする。`authenticated`要求だけ、DBがJWTのUIDと内部キーを比較する。応答中の`true`は常に最大一行で、本人が上位10名外なら0行、本人を上位10名へ入れた自動検査では正確に一行とする。

既存の`get_best_score_ranking`を含む全ての旧ランキング読取RPCでは、2つのサイノメslugを明示的に拒否する。サイノメv2の行はprivate専用集計にだけ置き、`get_sainome_ranking_v2`以外から返さない。これにより`verification_status='unverified'`と本人判定を省く旧応答への迂回を閉じる。

通常の右から左へ書く名前が順位や得点へ影響しないよう、ブラウザでは名前を`bdi dir="auto"`で隔離する。

## 5. DB権限と公開順序

第3工程の前進移行は次を満たす。

- private schemaのUSAGEを`PUBLIC`、`anon`、`authenticated`、`service_role`へ与えない。
- 非公開台帳、UID対応表、サイノメv2集計表はprivate schemaに置き、全てRLSを有効にし、公開ポリシーと前記ロールへの表権限を作らない。
- 公開RPCは`SECURITY DEFINER SET search_path=''`とし、全オブジェクトを完全修飾する。
- RPC作成直後に完全一致シグネチャの実行権限を`PUBLIC`、`anon`、`authenticated`、`service_role`から取り消し、発行・確定だけ`authenticated`へ、読取だけ`anon`と`authenticated`へ付与する。
- `auth.uid()`がnullなら発行・確定を拒否する。所有者判断に要求値、user metadata、非推奨の`auth.role()`を使わない。
- 2つのサイノメslugを有効化する前に、基底の既存`submit_score`でサイノメslugを拒否し、それを呼ぶmetadata経路も閉じる。
- 2つのサイノメslugを既存の全ランキング読取RPCでも拒否し、v2専用読取RPC以外の公開経路からprivate集計を返さない。
- `public.games`、`public.players`、`public.game_scores`、`public.score_runs`について、`anon`と`authenticated`から`TRUNCATE`、`TRIGGER`、`REFERENCES`を全て取り消す。4表×2ロール×3権限の24組全てで`has_table_privilege(...)=false`を自動検査する。
- 公開ロールによる得点表への直接書込みを拒否する。
- 受付停止・再開を行う管理トランザクションも、`private.sainome_v2_config`から`public.games`の順に更新する。発行・確定RPCと逆順でロックしない。
- クライアント、DB、名前契約の版が一致するまで受付を有効にしない。第3工程の配備時に実際のHTML/JSの`Cache-Control`、CDN、Service Workerの有無を測定し、最長キャッシュ寿命へ1時間の安全余裕を加えた`ranking_enable_not_before`をDBへ記録する。その時刻を過ぎ、新版クライアントの取得を確認した後だけ2 slugを有効にする。
- Database Advisorの意図した警告だけを警告名、対象、許容理由付きで固定allowlistへ記録し、差分に想定外がないことを機械検査する。

## 6. 残るリスク

この契約で確認できるのは、「DBが認識したUIDが、対象モード用に発行された番号を、許可時間内に一度だけ使った」ことまでである。公開ブラウザコードは変更できるため、正規番号の取得後に待機して偽の得点を直接送る攻撃は防げない。ゲーム内の共通検査を通らない生のHTTP要求も、最終的には第3工程のDB検査で拒否する。

同一originのXSSや第三者スクリプトにaccess tokenまたはrefresh tokenを奪われた場合、攻撃者はそのUIDの所有者として操作できる。Turnstile、IP制限、UID単位制限は乱用量を抑えるが、人間一人を証明しない。Anonymous Auth利用者は自動清掃されないため、利用者行の保持・削除方針も別途必要である。

第3工程の順位は必ず「未検証」と表示する。検証済み順位にするには、署名付き進行記録または入力履歴を受け取り、サーバー側で盤面と得点を再計算する別契約が必要である。

## 7. 第3工程の必須自動検査

- 名前契約JSONの`canonicalize(raw)`と`acceptCanonical(value)`を区別したDB試験
- 未認証、期限切れJWT、別UID、別slug、別名、別版、0未満・100,000,000超の得点の拒否
- 発行RPCの一行・全列・型・完全一致、`+63/+183秒`、24時間期限
- 早すぎる送信、未使用期限切れ、rolling 60分上限、未消費上限の拒否
- 10/11件目と60/61件目の並行発行が上限を越えないこと
- 受付済み完全一致再送は期限後も同じ集計結果で`was_duplicate`だけtrue、異内容再送は拒否、同時送信は一回だけ集計
- 発行後に`accepting_runs=false`または`games.is_active=false`へ変えた未確定番号は`PT503`となり、台帳と集計を変更しないこと。受付済み完全一致再送だけは停止後も同じ結果を返すこと
- `PT410`、`PT409`、`PT425`、`PT503`の判定、設定行→ゲーム行→UID対応行のロック順、全ロック後の時刻再取得
- 同じ表示名を使う2 UIDが別プレイヤーとして集計され、本人表示は常に最大一行になること
- 本人が上位10名にいるケースで本人表示が一行、上位外または`anon`では0行になること
- 同一UID・同一モードの並行upsert後もprivate集計が一行だけであること
- `shared-v1`、旧送信RPC、metadata経路、旧読取RPC、表直書き・直接読取の拒否
- 4表×2ロール×3権限の`TRUNCATE`、`TRIGGER`、`REFERENCES`が24組全てfalseであること
- private schemaのUSAGE、台帳・UID対応・v2集計の表権限、公開ポリシーがないこと
- 実測した最長キャッシュ寿命、1時間の安全余裕、`ranking_enable_not_before`、新版取得確認を移行記録へ残すこと
- 応答にUIDと内部キーが含まれず、順位が`unverified`であること
- Turnstileと匿名作成IP上限の本番設定値を記録し、Advisor結果が固定allowlistと一致すること

## 8. 参照仕様

- [Unicode Technical Standard #39 Version 15.1.0](https://www.unicode.org/reports/tr39/tr39-28.html)
- [Unicode Emoji Version 15.1 data](https://www.unicode.org/Public/emoji/15.1/)
- [Supabase Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)
- [PostgreSQL String Functions](https://www.postgresql.org/docs/current/functions-string.html)
- [PostgreSQL Pattern Matching](https://www.postgresql.org/docs/current/functions-matching.html)
