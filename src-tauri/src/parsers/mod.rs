//! 学習メモ: 入力ファイルの拡張子を判定し、対応するFASTA、GenBank、SnapGene、AB1パーサーへ振り分ける。
//! 処理の位置づけ: commandsまたはparsers/mod.rsから呼ばれ、外部ファイルとSequenceDataを相互変換する。

pub mod ab1;
pub mod fasta;
pub mod gbk;
pub mod snapgene;

pub use ab1::{get_trace_data_from_ab1, parse_ab1_sequence};
pub use fasta::{export_fasta, list_fasta_sequences};
pub use gbk::{export_gbk, list_gbk_sequences};
pub use snapgene::parse_snapgene_dna;

use crate::error::AppError;
use crate::models::SequenceData;
use crate::utils::{clean_sequence, resolve_readable_file};

pub fn list_all_sequences_internal(path: String) -> Result<Vec<SequenceData>, AppError> {
    if path.is_empty() {
        return Err(AppError::Parser("Empty path provided".to_string()));
    }
    let resolved = resolve_readable_file(
        &path,
        &[
            "gp", "dna", "ab1", "gbk", "gb", "genbank", "fasta", "fa", "fna", "ffn", "faa", "frn",
        ],
    )?;
    let path = resolved.to_string_lossy().to_string();
    let low_path = path.to_lowercase();
    let mut results = if low_path.ends_with(".gp") {
        let content = std::fs::read_to_string(&path)?;
        let mut data: SequenceData = serde_json::from_str(&content)?;
        data.sequence = clean_sequence(&data.sequence);
        vec![data]
    } else if low_path.ends_with(".dna") {
        let file_data = std::fs::read(&path)?;
        parse_snapgene_dna(&path, file_data)?
    } else if low_path.ends_with(".ab1") {
        let file_data = std::fs::read(&path)?;
        parse_ab1_sequence(&path, file_data, false)?
    } else if low_path.ends_with(".gbk")
        || low_path.ends_with(".gb")
        || low_path.ends_with(".genbank")
    {
        list_gbk_sequences(path)?
    } else {
        list_fasta_sequences(path)?
    };

    for seq in results.iter_mut() {
        crate::validation::validate_sequence_data(seq)?;
        crate::algorithms::primer::reanalyze_all_primers(&seq.sequence, &mut seq.primers);
        crate::validation::validate_sequence_data(seq)?;
    }

    Ok(results)
}
