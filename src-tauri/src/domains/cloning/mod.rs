//! 学習メモ: クローニングdomainをコマンド、組立エンジン、モデルの3層に分けて登録する。
//! 処理の位置づけ: domains/mod.rsから公開され、Tauri登録側とクローニング実装を接続する。

pub mod commands;
pub mod engine;
pub mod models;
