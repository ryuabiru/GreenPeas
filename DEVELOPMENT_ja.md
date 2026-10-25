# GreenPeas 開発ガイド

[English Development Guide](DEVELOPMENT.md)

GreenPeasは、React/TypeScriptフロントエンドとRustバックエンドで構成されたTauriデスクトップアプリケーションです。この文書は、アーキテクチャ、開発手順、現在のバックログを管理するためのガイドです。

## アーキテクチャ

GreenPeasでは、ドメイン処理と表示処理の責務を分離しています。

- Rustは、ファイル解析、配列アルゴリズム、ワークスペースデータ、クローニングロジック、永続化を担当します。
- TypeScriptは、アプリケーション状態、画面レイアウト、操作状態、描画を担当します。
- `src-tauri/src/commands.rs`のTauriコマンドと`src/api/`のラッパーが、RustとTypeScriptの境界になります。
- 共有Rustモデルは、`ts-rs`によって`src/bindings/`へ出力されます。生成されたbindingファイルを手動で編集してはいけません。

### フロントエンド

- `src/App.tsx`: ストア、Hook、レイアウト、ダイアログを接続します。
- `src/store/useSequenceStore.ts`: 開いている配列、編集、履歴、保存、アラインメント状態を管理します。
- `src/store/useUiStore.ts`: 選択範囲、表示モード、検索、ダイアログ、UI設定を管理します。
- `src/store/useEnzymeStore.ts`: 制限酵素と酵素セットを管理します。
- `src/hooks/useTauriIntegration.ts`: Tauriイベント、メニュー、キーボードショートカット、ファイルオープン、クリップボード連携を担当します。
- `src/components/`: ワークスペース、配列、マップ、アラインメント、ダイアログのUIを配置します。
- `src/utils/sequenceLayout.ts`: 線状配列を行へ配置するレイアウトを計算します。
- `src/workers/rendering.worker.ts`: メインスレッド外で配列を描画します。

### Rustバックエンド

- `src-tauri/src/lib.rs`: Tauriの初期化、共有状態、プラグイン、コマンド、メニュー、マルチウィンドウイベントを登録します。
- `src-tauri/src/commands.rs`: フロントエンドから呼び出す配列コマンドを公開します。
- `src-tauri/src/workspace.rs`: バックエンド側の配列ワークスペースを管理します。
- `src-tauri/src/models.rs`: 共有するドメインモデルと表示モデルを定義します。
- `src-tauri/src/algorithms/`: 配列、アラインメント、プライマー、制限酵素のアルゴリズムを実装します。
- `src-tauri/src/parsers/`: FASTA、GenBank、SnapGene、AB1のパーサーを実装します。
- `src-tauri/src/domains/cloning/`: 断片操作とライゲーション処理を実装します。
- `src-tauri/src/db.rs`: 制限酵素のSQLiteデータベースを管理します。

## 設計ルール

- 配列ドメインの計算とファイル解析はRustに配置します。
- ピクセル座標、行の折り返し、当たり判定などの表示レイアウトはTypeScriptに配置します。
- 複雑で状態を持つロジックをReactコンポーネントへ直接置かず、共有ストアやHookを優先します。
- `src/bindings/`を再生成する前に、Rust側のモデル定義を変更します。
- 依存関係とツールはプロジェクト内に閉じ込め、グローバルにインストールしません。
- ソース、バイナリ、ライセンス通知を`README.md`と`LICENSE_AUDIT.md`の公開方針に整合させます。

## 開発コマンド

```sh
npm install
npm run tauri dev
npm test
npm run build
cd src-tauri && cargo test && cargo check
```

マージ前には、変更範囲に応じたチェックを実行してください。リリース前には`THIRD_PARTY_LICENSES.txt`を再生成し、内容を確認してください。

## 実装済みマイルストーン

- 配列ドメイン処理とフロントエンド表示レイアウトを分離
- 配列、UI、酵素の状態を管理するZustandストアを追加
- Workerによる配列描画と仮想化された線状ビューを追加
- 配列アラインメントと座標変換を追加
- クローニング断片操作とSmart Ligation検証を追加
- SnapGeneからのプライマー直接インポートを追加
- マルチウィンドウでの配列オープンとウィンドウ間サイドバー転送を追加
- 公開ベータリリースとサードパーティライセンス適合性ツールを追加

## バックログ

### 編集と操作

- 新しい配列を作成した直後の動作を明確化し、改善する
- ペーストで追加した配列領域のハイライトを復活させる
- 配列を削除した後、削除境界へカーソルを配置する
- 小さい画面で右クリックメニューをスクロール可能にする
- アノテーション範囲の対話的編集と、その場での名称編集に対応する

### エクスポートと互換性

- GPまたはFASTAではなく、GenBankを既定のエクスポート形式にするべきか検討する
- 多言語または特殊なGenBank LOCUS日付に対する堅牢性を改善する
- 実際の`.gb`、`.gbk`、`.dna`、`.gp`ファイルを用いた互換性テストを拡充する

### マップと生物学的表示

- ラベルが小さくなる場合のマップ可読性を改善する
- 線状配列が常に環状マップとして表示されないよう、マップの動作を見直す
- 部分コドンやキメラタンパク質ワークフローに対するCDS表示を改善する
- 高度なSnapGene互換性と6フレーム翻訳表示を追加する

### パフォーマンスとリリース

- 大規模配列のメモリ使用量を監視し、上限付きキャッシュを検討する
- Apple Siliconネイティブのリリース対応を拡充する
