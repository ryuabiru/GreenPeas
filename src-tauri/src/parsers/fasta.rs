//! 学習メモ: FASTA形式の読込と書出しを実装する。
//! 処理の位置づけ: commandsまたはparsers/mod.rsから呼ばれ、外部ファイルとSequenceDataを相互変換する。

use crate::error::AppError;
use crate::models::{SequenceData, Topology};
use crate::utils::clean_sequence;
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;

pub fn export_fasta(
    path: String,
    id: String,
    description: Option<String>,
    sequence: String,
) -> Result<(), AppError> {
    crate::validation::validate_dna_sequence(&sequence)?;
    let header = if let Some(desc) = description {
        format!(">{} {}\n", id, desc)
    } else {
        format!(">{}\n", id)
    };
    crate::utils::atomic_write(Path::new(&path), |file| {
        file.write_all(header.as_bytes())?;

        // Write sequence in 80-char chunks for better compatibility
        for chunk in sequence.as_bytes().chunks(80) {
            file.write_all(chunk)?;
            file.write_all(b"\n")?;
        }
        Ok(())
    })
}

pub fn list_fasta_sequences(path: String) -> Result<Vec<SequenceData>, AppError> {
    let file = File::open(&path)?;
    let mut reader = BufReader::new(file);
    let mut sequences = Vec::new();

    let mut current_id = String::new();
    let mut current_desc = None;
    let mut current_seq = String::new();

    let file_id = std::path::Path::new(&path)
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string());

    let mut line_buf = String::new();
    while reader.read_line(&mut line_buf)? > 0 {
        let trimmed = line_buf.trim();
        if trimmed.is_empty() {
            line_buf.clear();
            continue;
        }

        if trimmed.starts_with('>') {
            // Push previous record
            if !current_id.is_empty() {
                sequences.push(create_sequence_data(
                    &current_id,
                    current_desc.clone(),
                    &current_seq,
                    &path,
                ));
            }
            // Start new record
            let mut parts = trimmed[1..].splitn(2, |c: char| c.is_whitespace());
            current_id = parts.next().unwrap_or("unknown").to_string();
            current_desc = parts.next().map(|s| s.trim().to_string());
            current_seq = String::new();
        } else {
            if current_id.is_empty() {
                return Err(AppError::Parser(
                    "FASTA sequence data appeared before the first header".to_string(),
                ));
            }
            current_seq.push_str(trimmed);
        }
        line_buf.clear();
    }

    if !current_id.is_empty() {
        // Handle file-based naming for the first sequence if requested earlier
        let final_id = if sequences.is_empty() {
            file_id.unwrap_or(current_id)
        } else {
            current_id
        };
        sequences.push(create_sequence_data(
            &final_id,
            current_desc,
            &current_seq,
            &path,
        ));
    }

    if sequences.is_empty() {
        return Err(AppError::Parser(
            "No FASTA records were found in the file".to_string(),
        ));
    }
    if let Some(empty) = sequences.iter().find(|record| record.sequence.is_empty()) {
        return Err(AppError::Parser(format!(
            "FASTA record '{}' has no sequence",
            empty.id
        )));
    }

    Ok(sequences)
}

fn create_sequence_data(id: &str, desc: Option<String>, seq: &str, path: &str) -> SequenceData {
    SequenceData {
        id: id.to_string(),
        description: desc,
        sequence: clean_sequence(seq),
        annotations: Vec::new(),
        primers: Vec::new(),
        topology: Topology::Linear,
        trace: None,
        enzymes: None,
        enzyme_settings: None,
        alignment_results: None,
        debug_hex: None,
        file_path: Some(path.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;
    use std::io::Write;

    #[test]
    fn test_list_fasta_sequences() {
        let path = temp_dir().join("test_fasta_buf_reuse.fasta");
        let mut file = File::create(&path).unwrap();
        writeln!(file, ">seq1 Test Sequence\nATCG\nATCG").unwrap();
        writeln!(file, ">seq2\nGGCC\nTT").unwrap();

        let path_str = path.to_str().unwrap().to_string();
        let seqs = list_fasta_sequences(path_str.clone()).unwrap();

        assert_eq!(seqs.len(), 2);

        assert_eq!(seqs[0].id, "seq1");
        assert_eq!(seqs[0].description.as_deref(), Some("Test Sequence"));
        assert_eq!(seqs[0].sequence, "ATCGATCG");

        assert_eq!(seqs[1].id, "seq2");
        assert_eq!(seqs[1].description, None);
        assert_eq!(seqs[1].sequence, "GGCCTT");

        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn rejects_sequence_before_header_and_empty_files() {
        for (suffix, content) in [("missing-header", "ACGT\n"), ("empty", "\n")] {
            let path = temp_dir().join(format!("greenpeas-{suffix}-{}.fasta", std::process::id()));
            std::fs::write(&path, content).unwrap();
            let result = list_fasta_sequences(path.to_string_lossy().into_owned());
            let _ = std::fs::remove_file(path);
            assert!(result.is_err(), "{suffix} FASTA should be rejected");
        }
    }
}
