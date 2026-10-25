# GreenPeas

[English README](README.md)

GreenPeasは、Tauri、Rust、React、TypeScriptで構築された、デスクトップ向けDNA配列エディター兼クローニングワークスペースです。

GreenPeasはMITライセンスのソフトウェアです。このリポジトリにアプリのソースコードとドキュメントを置いています。

保守されているアーキテクチャガイド、開発ルール、実装済みマイルストーン、バックログについては、[日本語版開発ガイド](DEVELOPMENT_ja.md)を参照してください。

## 🧬 名前とロゴについて

GreenPeasという名前は、遺伝の基本的な法則を明らかにしたグレゴール・メンデルのエンドウに由来します。ロゴにはDNAの二重らせんと、メンデルが研究した丸い（滑らかな）種子・しわのある種子のモチーフを組み合わせています。

## 少ないメモリで使えるように

GreenPeasは、配列をすばやく確認するときや日常的なクローニング作業で、メモリ使用量を抑えながら軽快に動くことを目指して設計しています。メモリに余裕のないノートパソコンでの利用も想定しています。再現可能なRustコアのベンチマーク結果は[BENCHMARKS.md](BENCHMARKS.md)に掲載しています。

## 現在のリリース計画

- 最初に公開するもの: [GreenPeas](https://github.com/ryuabiru/GreenPeas)のソースコード
- インストール可能なベータ版: 後日コンパイル・検証して配布
- 次回リリースタグ: ベータ版の配布物を検証した後に決定
- 開発版アプリバージョン: `0.1.0`
- プロジェクトライセンス: MIT License
- 初回ベータの配布物: Apple Silicon Mac（`arm64`）。Windows版とIntel Mac版は実機確認後に配布

## GreenPeasでできること

- GenBankやSnapGene形式を含むDNA配列ファイルの読込と編集
- 線状ビューとマップビューによる配列表示
- アノテーション、プライマー、制限酵素、アラインメントの操作
- 断片操作やSmart Ligation検証などのクローニング操作
- GitHubのバグ報告の下書きを作成するアプリ内ヘルパー

## ベータ版について

今後配布するベータ版は、テストとフィードバック収集を目的としています。重要な実験データの唯一の保存先として使用しないでください。

次のベータ版はmacOS向けのアドホック署名を付け、Developer ID署名と公証は行わずに配布します。`release:macos`スクリプトはビルド環境のCPUアーキテクチャ向けにのみビルドします。Intel（`x64`）版とApple Silicon（`arm64`）版は別々の成果物で、Universalアプリではありません。今後のベータ版は[GreenPeas公式Releasesページ](https://github.com/ryuabiru/GreenPeas/releases)からのみダウンロードしてください。

公証されていないため、macOSがアプリの起動を止める場合があります。公式リポジトリからダウンロードした後、一度GreenPeasを開いてください。macOSに止められた場合は、**システム設定 → プライバシーとセキュリティ**を開き、「セキュリティ」までスクロールしてGreenPeasの**このまま開く**を選び、続けて**開く**を確認します。公式リポジトリから入手し、信頼できる成果物に対してのみ警告を解除してください。詳しくは[Appleの案内](https://support.apple.com/102445)を参照してください。

今後のリリースに向けた主な課題:

- 実際のファイルを用いた互換性テストの拡充
- 対応プラットフォームにおけるリリースビルド検証の拡充
- Windows版とIntel Mac版のリリースビルド、および開発環境のない端末での起動確認

## 開発

依存関係はこのプロジェクト内にのみインストールしてください。プロジェクト用ツールをグローバルにインストールしないでください。

```sh
npm install
npm run build
```

開発中にTauriアプリを起動する:

```sh
npm run tauri dev
```

配布可能なアプリをビルドする:

```sh
npm run release:macos
npm run release:windows # Windows上で実行
```

各成果物は対象OS上でビルドします。スクリプトはパッケージ化前にその環境向けの`THIRD_PARTY_LICENSES.txt`を再生成します。Windows版はWindows実機での確認が必要です。

TauriパッケージでRustチェックを実行する:

```sh
cd src-tauri
cargo check
```

## 問題の報告

不具合報告と機能要望には[GitHub Issues](https://github.com/ryuabiru/GreenPeas/issues)を使用してください。以下の情報を含めてください。

- GreenPeasのバージョンとプラットフォーム
- 関係する場合は、使用していたファイル形式
- 再現手順
- 期待した動作
- 実際の動作

アプリ内のバグ報告ダイアログでは、プライバシーに配慮した診断情報を生成し、内容が入力済みのGitHub Issue作成画面を開けます。報告が自動送信されることはありません。Issueは公開されるため、DNA配列、ローカルファイルパス、個人情報、その他の機密情報を含めないでください。

セキュリティ上の脆弱性は公開Issueに投稿せず、[SECURITY.md](SECURITY.md)の非公開報告手順を利用してください。

## ライセンス

GreenPeasは[MIT License](LICENSE)に基づいて配布されます。ライセンス条件に従い、利用、複製、改変、再配布が可能です。

サードパーティ製コンポーネントには、それぞれのライセンスが適用されます。通知、ライセンス条項、ソースの入手先は[THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt)に記載されています。リリース時のライセンス適合性レビューについては、[LICENSE_AUDIT.md](LICENSE_AUDIT.md)を参照してください。
