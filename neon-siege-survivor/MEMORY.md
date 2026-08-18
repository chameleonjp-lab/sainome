# Memory

## 実装メモ

- Reactは表示枠、Babylon.jsはキャンバス、ゲームロジックは `client/src/game/` のプレーンTypeScriptに分離する。
- 大きな画像はプロジェクト内に保存せず、`/home/ubuntu/webdev-static-assets/` に置いた上でWeb用ストレージURLを参照する。
- `?demo` により決定的な自動操作を有効化し、スクリーンショット時に戦闘が見える状態を作る。

