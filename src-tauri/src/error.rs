//! 学習メモ: バックエンドの失敗をAppErrorへ統一し、Tauri経由でフロントエンドへ返せる形にする。
//! 処理の位置づけ: Tauriコマンドまたはバックエンド内部から利用され、結果をフロントエンド側へ返す。

use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Parser error: {0}")]
    Parser(String),
    #[error("Algorithm error: {0}")]
    Algorithm(String),
    #[error("Database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("Anyhow error: {0}")]
    Anyhow(#[from] anyhow::Error),
    #[error("Error: {0}")]
    Generic(String),
}

// Implement Serialize so we can return this through Tauri invoke
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_str())
    }
}
