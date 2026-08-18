# Neon Siege: Survivor

**Amberline Cataclysm** を舞台にした、スマートフォンとデスクトップブラウザ向けの見下ろし型3Dサバイバルアクションです。Babylon.js、React、TypeScript、Viteで構成し、自動攻撃、壁外からの敵侵入、経験値成長、ランダムな強化選択、ボス行動、アイテム回収を一体化しています。

## 主要機能

| 区分 | 実装内容 |
| --- | --- |
| 操作 | WASD・矢印キーおよびモバイル用バーチャルスティック。カメラ基準で移動方向を補正。 |
| 戦闘 | レールパルス、散弾アレイ、周回センチネルに加え、25種の日本語命名モジュールを実装。全モジュールは3段階強化。 |
| 成長 | 経験値ジェム、ランダム3択、1ゲーム3回のリロール、レベル別の武器枠上限。 |
| 敵 | Scout、Striker、Bulwark。敵は封鎖壁の外側から侵入し、Bulwarkは衝撃波・突進・砲撃・過駆動三連砲撃を使用。 |
| ルール | 接触ダメージ、停止時の落下針、回復アイテム、全経験値を回収するマグネット、回収不能ドロップの位置補正。 |
| 表示 | PC・タブレット・スマホ縦横に応じたカメラ/HUD適応、3D封鎖壁、被弾警告、敵侵入・命中デバッグ表示。 |
| 安定性 | 撃破処理の再入防止、残留敵の回収、侵入状態の分離、凍結時間の状態横断減衰を実装。 |

## 現在のドロップ確率

通常の敵撃破時、回復アイテムは**6%**、マグネットは**約2.17%**で抽選されます。いずれも前段階の設定から3分の1に調整済みです。

## 開発環境

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
```

主要なゲームロジックは `client/src/game/GameWorld.ts`、Babylon.jsの場面とカメラは `client/src/game/scene.ts`、HUDとURLベースの確認モードは `client/src/components/GameCanvas.tsx` にあります。

## 確認用URL

| URLパラメータ | 用途 |
| --- | --- |
| `?demo` | 自動戦闘デモ。 |
| `?boss` | Bulwarkの通常行動確認。 |
| `?striker` | Strikerの予告・突進確認。 |
| `?idle` | 5秒静止後の落下針確認。 |
| `?explosion` | 通常敵撃破で爆発ダメージが発生しないことの確認。 |
| `?bossExplosion` | 近距離で撃破したBulwarkの10ダメージ確認。 |
| `?bossExplosionFar` | 遠距離で撃破したBulwarkが無被弾となる確認。 |
| `?debug` | 壁内外数、発射、衝突、命中、撃破、侵入、最終被弾原因を表示。 |

## 同梱資料

`combat_debug_report.md` は投射物命中不具合の調査・修正記録、`module_dps_report.md` は全モジュールの火力調整記録です。ゲーム開発の判断経緯は `PLAN.md`、`STRUCTURE.md`、`MEMORY.md`、`ASSETS.md`、`ideas.md` にまとめています。`todo.md` には完了済み実装と検証履歴を記録しています。
