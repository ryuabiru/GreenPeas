//! 学習メモ: デスクトップ実行ファイルの最小エントリーポイント。実際の初期化をライブラリ側run関数へ委譲する。
//! 処理の位置づけ: アプリ起動時に実行され、フロントエンドから利用できるバックエンド機能を登録する。

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    greenpeas_lib::run()
}
