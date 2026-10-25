//! 学習メモ: AB1シーケンスファイルから塩基配列とクロマトグラムトレースを抽出する。
//! 処理の位置づけ: commandsまたはparsers/mod.rsから呼ばれ、外部ファイルとSequenceDataを相互変換する。

use crate::error::AppError;
use crate::models::{ChromTrace, SequenceData, Topology};
use crate::utils::clean_sequence;
use std::collections::HashMap;

pub fn parse_ab1_sequence(
    path: &str,
    data: Vec<u8>,
    load_trace: bool,
) -> Result<Vec<SequenceData>, AppError> {
    if data.len() < 100 || &data[0..4] != b"ABIF" {
        return Err(AppError::Parser("Not a valid AB1/ABIF file".to_string()));
    }

    let dir_offset = u32::from_be_bytes(data[26..30].try_into().unwrap_or([0, 0, 0, 0])) as usize;
    let num_elements = u32::from_be_bytes(data[18..22].try_into().unwrap_or([0, 0, 0, 0])) as usize;

    let mut sequence = String::new();
    let mut trace_map: HashMap<u32, Vec<u16>> = HashMap::new();
    let mut peak_locations: Vec<u32> = Vec::new();
    let mut fwo = String::from("GATC");
    let mut pos = dir_offset;

    for _ in 0..num_elements {
        if pos + 28 > data.len() {
            break;
        }
        let tag_name = &data[pos..pos + 4];
        let tag_num = u32::from_be_bytes(data[pos + 4..pos + 8].try_into().unwrap_or([0, 0, 0, 0]));
        let count = u32::from_be_bytes(data[pos + 12..pos + 16].try_into().unwrap_or([0, 0, 0, 0]))
            as usize;
        let data_size =
            u32::from_be_bytes(data[pos + 16..pos + 20].try_into().unwrap_or([0, 0, 0, 0]))
                as usize;
        let data_offset =
            u32::from_be_bytes(data[pos + 20..pos + 24].try_into().unwrap_or([0, 0, 0, 0]))
                as usize;

        let start = if data_size <= 4 {
            pos + 20
        } else {
            data_offset
        };

        if tag_name == b"PBAS" && tag_num == 1 {
            if start + count <= data.len() {
                let raw_seq = String::from_utf8_lossy(&data[start..start + count]);
                sequence = clean_sequence(&raw_seq);
            }
        } else if tag_name == b"PLOC" && tag_num == 1 {
            if count > 0 && start + data_size <= data.len() {
                let element_size = data_size / count;
                let mut peaks = Vec::new();
                for i in (0..data_size).step_by(element_size) {
                    if element_size == 2 {
                        peaks.push(u16::from_be_bytes([data[start+i], data[start+i+1]]) as u32);
                    } else if element_size == 4 {
                        peaks.push(u32::from_be_bytes(
                            data[start + i..start + i + 4]
                                .try_into()
                                .unwrap_or([0, 0, 0, 0]),
                        ));
                    }
                }
                peak_locations = peaks;
            }
        } else if tag_name == b"FWO_" {
            if start + 4 <= data.len() {
                fwo = String::from_utf8_lossy(&data[start..start + 4]).to_string();
            }
        } else if tag_name == b"DATA" && (9..=12).contains(&tag_num) {
            let mut points = Vec::new();
            for i in (0..data_size).step_by(2) {
                if start + i + 2 <= data.len() {
                    let b1 = data[start + i];
                    let b2 = data[start + i + 1];
                    points.push(u16::from_be_bytes([b1, b2]));
                }
            }
            trace_map.insert(tag_num, points);
        }
        pos += 28;
    }

    if sequence.is_empty() {
        return Err(AppError::Parser(
            "Could not find sequence in AB1 file".to_string(),
        ));
    }

    let mut trace = None;
    if load_trace
        && trace_map.contains_key(&9)
        && trace_map.contains_key(&10)
        && trace_map.contains_key(&11)
        && trace_map.contains_key(&12)
    {
        let mut g = Vec::new();
        let mut a = Vec::new();
        let mut t = Vec::new();
        let mut c = Vec::new();

        for (i, base) in fwo.chars().enumerate() {
            let data_num = 9 + i as u32;
            let vals = trace_map.get(&data_num).cloned().unwrap_or_default();
            match base {
                'G' => g = vals,
                'A' => a = vals,
                'T' => t = vals,
                'C' => c = vals,
                _ => {}
            }
        }
        trace = Some(ChromTrace {
            g,
            a,
            t,
            c,
            peak_locations,
        });
    }

    let file_name = std::path::Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("AB1 Sequence");

    Ok(vec![SequenceData {
        id: file_name.to_string(),
        description: Some("Imported from .ab1".to_string()),
        sequence,
        annotations: Vec::new(),
        primers: Vec::new(),
        topology: Topology::Linear,
        trace,
        enzymes: None,
        enzyme_settings: None,
        alignment_results: None,
        debug_hex: None,
        file_path: Some(path.to_string()),
    }])
}

pub fn get_trace_data_from_ab1(path: String) -> Result<Option<ChromTrace>, AppError> {
    let file_data = std::fs::read(&path)?;
    let seqs = parse_ab1_sequence(&path, file_data, true)?;
    if let Some(mut first) = seqs.into_iter().next() {
        return Ok(first.trace.take());
    }
    Ok(None)
}
