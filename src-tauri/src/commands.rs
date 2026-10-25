//! 学習メモ: フロントエンドからinvokeされる配列操作コマンドを公開し、パーサーや解析ロジックへ処理を振り分ける。
//! 処理の位置づけ: Tauriコマンドまたはバックエンド内部から利用され、結果をフロントエンド側へ返す。

use crate::algorithms::{
    apply_edit, calculate_gc_content as algo_gc, find_restriction_sites as algo_find_sites,
    run_alignment, translate_dna as algo_translate, EditOp, SearchResult,
};
use crate::error::AppError;
use crate::models::{
    AlignedSeqResult, AlignmentMode, Annotation, ChromTrace, RestrictionSite, SequenceData,
    SequenceViewData, Strand, Topology,
};
use crate::parsers::{
    export_fasta as parsers_export_fasta, get_trace_data_from_ab1, list_all_sequences_internal,
};
use crate::utils::{
    get_reverse_complement as utils_revcomp, resolve_readable_file, resolve_writable_file,
    EnzymeStore,
};
use std::sync::Mutex;

pub struct PendingFiles(pub Mutex<Vec<String>>);

#[tauri::command]
pub fn get_pending_files(state: tauri::State<'_, PendingFiles>) -> Vec<String> {
    let mut files = state.0.lock().unwrap();
    std::mem::take(&mut *files)
}

#[tauri::command]
pub fn open_sequence_session(
    path: String,
    workspace: tauri::State<'_, crate::workspace::WorkspaceStore>,
) -> Result<Vec<String>, AppError> {
    let path = resolve_readable_file(
        &path,
        &[
            "gp", "dna", "ab1", "gbk", "gb", "genbank", "fasta", "fa", "fna", "ffn", "faa", "frn",
        ],
    )?
    .to_string_lossy()
    .to_string();
    let sequences = list_all_sequences_internal(path)?;
    let mut ids = Vec::new();
    for seq in sequences {
        ids.push(workspace.register_unique(seq));
    }
    Ok(ids)
}

#[tauri::command]
pub fn get_sequence_metadata(
    id: String,
    workspace: tauri::State<'_, crate::workspace::WorkspaceStore>,
) -> Result<SequenceData, AppError> {
    workspace
        .get(&id)
        .ok_or_else(|| AppError::Generic(format!("Sequence {} not found", id)))
}

#[tauri::command]
pub fn translate_dna(sequence: String, frame: i32) -> String {
    algo_translate(&sequence, frame)
}

#[tauri::command]
pub fn get_reverse_complement(sequence: String) -> String {
    utils_revcomp(&sequence)
}

#[tauri::command]
pub fn find_restriction_sites(
    sequence: String,
    topology: String,
    max_cuts: Option<usize>,
    enzyme_state: tauri::State<'_, Mutex<EnzymeStore>>,
) -> Vec<RestrictionSite> {
    let t = if topology.to_lowercase() == "circular" {
        Topology::Circular
    } else {
        Topology::Linear
    };
    let store = enzyme_state.lock().unwrap();
    algo_find_sites(&sequence, &t, max_cuts, &*store)
}

#[tauri::command]
pub fn list_all_sequences(path: String) -> Result<Vec<SequenceData>, AppError> {
    let path = resolve_readable_file(
        &path,
        &[
            "gp", "dna", "ab1", "gbk", "gb", "genbank", "fasta", "fa", "fna", "ffn", "faa", "frn",
        ],
    )?
    .to_string_lossy()
    .to_string();
    list_all_sequences_internal(path)
}

#[tauri::command]
pub fn list_fasta_sequences(path: String) -> Result<Vec<SequenceData>, AppError> {
    let path = resolve_readable_file(&path, &["fasta", "fa", "fna", "ffn", "faa", "frn"])?
        .to_string_lossy()
        .to_string();
    crate::parsers::list_fasta_sequences(path)
}

#[tauri::command]
pub fn read_import_text_file(path: String) -> Result<String, AppError> {
    let resolved = resolve_readable_file(&path, &["txt"])?;
    Ok(std::fs::read_to_string(resolved)?)
}

#[tauri::command]
pub fn export_gp(path: String, sequence_data: SequenceData) -> Result<(), AppError> {
    crate::validation::validate_sequence_data(&sequence_data)?;
    let path = resolve_writable_file(&path, &["gp"])?;
    let content = serde_json::to_string_pretty(&sequence_data)?;
    crate::utils::atomic_write(&path, |file| {
        use std::io::Write;
        file.write_all(content.as_bytes())?;
        Ok(())
    })
}

#[tauri::command]
pub fn export_fasta(
    path: String,
    id: String,
    description: Option<String>,
    sequence: String,
) -> Result<(), AppError> {
    let path = resolve_writable_file(&path, &["fasta", "fa", "fna", "ffn", "faa", "frn"])?
        .to_string_lossy()
        .to_string();
    parsers_export_fasta(path, id, description, sequence)
}

#[tauri::command]
pub fn export_gbk(
    path: String,
    sequence: String,
    annotations: Vec<Annotation>,
    primers: Vec<crate::models::Primer>,
    topology: String,
    id: Option<String>,
    description: Option<String>,
) -> Result<(), AppError> {
    let t = if topology.to_lowercase() == "circular" {
        Topology::Circular
    } else {
        Topology::Linear
    };
    let path = resolve_writable_file(&path, &["gbk", "gb", "genbank"])?
        .to_string_lossy()
        .to_string();
    crate::parsers::gbk::export_gbk_with_metadata(
        path,
        sequence,
        annotations,
        primers,
        t,
        id,
        description,
    )
}

#[tauri::command]
pub fn calculate_gc_content(sequence: String) -> f64 {
    algo_gc(&sequence)
}

#[tauri::command]
pub fn search_sequence(sequence: String, query: String, topology: String) -> Vec<SearchResult> {
    let is_circular = topology.to_lowercase() == "circular";
    crate::algorithms::search_sequence(&sequence, &query, is_circular)
}

#[tauri::command]
pub fn search_protein(
    sequence: String,
    query: String,
    annotations: Vec<Annotation>,
) -> Vec<SearchResult> {
    crate::algorithms::search_protein(&sequence, &query, &annotations)
}

#[tauri::command]
pub fn align_sequences(
    template: String,
    query: String,
    mode: Option<AlignmentMode>,
) -> Result<Vec<AlignedSeqResult>, AppError> {
    Ok(run_alignment(
        &template,
        &query,
        mode.unwrap_or(AlignmentMode::Automatic),
    ))
}

#[tauri::command]
pub fn get_trace_data(path: String) -> Result<Option<ChromTrace>, AppError> {
    let path = resolve_readable_file(&path, &["ab1"])?
        .to_string_lossy()
        .to_string();
    if path.to_lowercase().ends_with(".ab1") {
        get_trace_data_from_ab1(path)
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn translate_annotations(
    sequence: String,
    annotations: Vec<Annotation>,
) -> Vec<(String, String)> {
    let seq_bytes = sequence.as_bytes();
    annotations
        .into_iter()
        .filter(|ann| ann.feature_type.to_uppercase() == "CDS")
        .map(|ann| {
            let id = ann.id.clone();
            let is_reverse = ann.strand == Strand::Reverse;
            let iter = crate::algorithms::CdsIter::new(seq_bytes, ann.start, ann.end, is_reverse);
            let mut aa = crate::algorithms::translate_iter(iter);

            // If the CDS translation doesn't end with a stop codon (*), extend it until we hit one or reach sequence limit
            if !aa.is_empty() && !aa.ends_with('*') && seq_bytes.len() > 0 {
                let max_extend = seq_bytes.len();
                let mut extend_iter = if !is_reverse {
                    // Forward: translate starting from ann.end
                    crate::algorithms::CdsIter::new(
                        seq_bytes,
                        ann.end,
                        (ann.end + max_extend) % seq_bytes.len(),
                        false,
                    )
                } else {
                    // Reverse: translate starting from ann.start (going backwards)
                    let start_pos = if ann.start >= max_extend {
                        ann.start - max_extend
                    } else {
                        seq_bytes.len() - (max_extend - ann.start) % seq_bytes.len()
                    };
                    crate::algorithms::CdsIter::new(seq_bytes, start_pos, ann.start, true)
                };

                let mut codon_buf = [0u8; 3];
                let mut codon_idx = 0;
                while let Some(b) = extend_iter.next() {
                    codon_buf[codon_idx] = b.to_ascii_uppercase();
                    codon_idx += 1;
                    if codon_idx == 3 {
                        let ext_aa = match &codon_buf {
                            b"TTT" | b"TTC" => 'F',
                            b"TTA" | b"TTG" | b"CTT" | b"CTC" | b"CTA" | b"CTG" => 'L',
                            b"ATT" | b"ATC" | b"ATA" => 'I',
                            b"ATG" => 'M',
                            b"GTT" | b"GTC" | b"GTA" | b"GTG" => 'V',
                            b"TCT" | b"TCC" | b"TCA" | b"TCG" | b"AGT" | b"AGC" => 'S',
                            b"CCT" | b"CCC" | b"CCA" | b"CCG" => 'P',
                            b"ACT" | b"ACC" | b"ACA" | b"ACG" => 'T',
                            b"GCT" | b"GCC" | b"GCA" | b"GCG" => 'A',
                            b"TAT" | b"TAC" => 'Y',
                            b"TAA" | b"TAG" | b"TGA" => '*',
                            b"CAT" | b"CAC" => 'H',
                            b"CAA" | b"CAG" => 'Q',
                            b"AAT" | b"AAC" => 'N',
                            b"AAA" | b"AAG" => 'K',
                            b"GAT" | b"GAC" => 'D',
                            b"GAA" | b"GAG" => 'E',
                            b"TGT" | b"TGC" => 'C',
                            b"TGG" => 'W',
                            b"CGT" | b"CGC" | b"CGA" | b"CGG" | b"AGA" | b"AGG" => 'R',
                            b"GGT" | b"GGC" | b"GGA" | b"GGG" => 'G',
                            _ => 'X',
                        };
                        aa.push(ext_aa);
                        codon_idx = 0;
                        if ext_aa == '*' {
                            break;
                        }
                    }
                }
            }
            (id, aa)
        })
        .collect()
}

const MAX_CHUNK_SIZE: usize = 50_000;

#[tauri::command]
pub fn get_sequence_view_data(
    id: String,
    start: usize,
    end: usize,
    workspace: tauri::State<'_, crate::workspace::WorkspaceStore>,
    enzyme_state: tauri::State<'_, Mutex<EnzymeStore>>,
) -> Result<SequenceViewData, AppError> {
    let mut actual_end = end;
    if actual_end > start.saturating_add(MAX_CHUNK_SIZE) {
        actual_end = start.saturating_add(MAX_CHUNK_SIZE);
    }

    // Copy only the visible slice while holding the workspace lock. Cloning a
    // complete multi-megabase document on every scroll causes large UI stalls.
    let (s, e, bases, annotations, primers, sub_seq, search_s) = workspace
        .with_sequence(&id, |seq| {
            let sequence_len = seq.sequence.len();
            let s = start.min(sequence_len);
            let e = actual_end.min(sequence_len);
            let bases = if s < e {
                seq.sequence[s..e].to_string()
            } else {
                String::new()
            };
            let annotations = seq
                .annotations
                .iter()
                .filter(|ann| {
                    if ann.start <= ann.end {
                        ann.start < e && ann.end > s
                    } else {
                        ann.start < e || ann.end > s
                    }
                })
                .cloned()
                .collect();
            let primers = seq
                .primers
                .iter()
                .filter(|p| {
                    let ps = p.start.min(p.end);
                    let pe = p.start.max(p.end);
                    ps < e && pe > s
                })
                .cloned()
                .collect();
            let search_s = s.saturating_sub(20);
            let search_e = e.saturating_add(20).min(sequence_len);
            let sub_seq = if search_s < search_e {
                seq.sequence[search_s..search_e].to_string()
            } else {
                String::new()
            };
            (s, e, bases, annotations, primers, sub_seq, search_s)
        })
        .ok_or_else(|| AppError::Generic(format!("Sequence {} not found", id)))?;

    // Find restriction sites in the range
    let store = enzyme_state.lock().unwrap();
    let enzymes =
        crate::algorithms::find_restriction_sites(&sub_seq, &Topology::Linear, None, &*store)
            .into_iter()
            .map(|mut site| {
                site.position += search_s;
                site
            })
            .filter(|site| site.position >= s && site.position < e)
            .collect();

    Ok(SequenceViewData {
        bases,
        annotations,
        enzymes,
        primers,
    })
}

#[tauri::command]
pub fn get_sequence_fragment(
    sequence_id: String,
    start: usize,
    end: usize,
    workspace: tauri::State<'_, crate::workspace::WorkspaceStore>,
) -> Result<String, AppError> {
    let seq = workspace
        .get(&sequence_id)
        .ok_or_else(|| AppError::Generic(format!("Sequence {} not found", sequence_id)))?;
    let sequence = seq.sequence;
    let s = start.min(sequence.len());
    let e = end.min(sequence.len());
    if s >= e {
        return Ok("".to_string());
    }
    Ok(sequence[s..e].to_string())
}

#[tauri::command]
pub fn analyze_primer(
    template: String,
    primer_sequence: String,
    start: usize,
    end: usize,
    strand: String,
) -> crate::models::Primer {
    let s = if strand.to_lowercase() == "reverse" {
        Strand::Reverse
    } else {
        Strand::Forward
    };
    crate::algorithms::primer::analyze_primer(&template, &primer_sequence, start, end, s)
}

#[tauri::command]
pub fn reanalyze_primers(
    template: String,
    mut primers: Vec<crate::models::Primer>,
) -> Vec<crate::models::Primer> {
    crate::algorithms::primer::reanalyze_all_primers(&template, &mut primers);
    primers
}
#[tauri::command]
pub fn apply_sequence_edit(
    window: tauri::Window,
    sequence_id: String,
    op: EditOp,
    workspace: tauri::State<'_, crate::workspace::WorkspaceStore>,
    _enzyme_state: tauri::State<'_, Mutex<EnzymeStore>>,
) -> Result<SequenceData, AppError> {
    let current = workspace
        .get(&sequence_id)
        .ok_or_else(|| AppError::Generic(format!("Sequence {} not found", sequence_id)))?;
    let mut edited = apply_edit(current, op)?;

    // Re-analyze primers for mismatches
    crate::algorithms::primer::reanalyze_all_primers(&edited.sequence, &mut edited.primers);

    // Invalidate alignments as the sequence has changed
    edited.alignment_results = None;
    crate::validation::validate_sequence_data(&edited)?;

    let result = workspace.update(&sequence_id, |updated| {
        *updated = edited;
    });

    if result.is_ok() {
        use tauri::Emitter;
        let _ = window.emit("sequence-mutated", ());
    }
    result
}

#[tauri::command]
pub fn upsert_sequence(
    window: tauri::Window,
    sequence: SequenceData,
    workspace: tauri::State<'_, crate::workspace::WorkspaceStore>,
) -> Result<String, AppError> {
    crate::validation::validate_sequence_data(&sequence)?;
    let id = workspace.upsert(sequence);
    use tauri::Emitter;
    let _ = window.emit("sequence-mutated", ());
    Ok(id)
}

#[tauri::command]
pub fn get_sequence_fragment_binary(
    sequence_id: String,
    start: usize,
    end: usize,
    workspace: tauri::State<'_, crate::workspace::WorkspaceStore>,
) -> Result<Vec<u8>, AppError> {
    let seq = workspace
        .get(&sequence_id)
        .ok_or_else(|| AppError::Generic(format!("Sequence {} not found", sequence_id)))?;
    let sequence = seq.sequence;
    let s = start.min(sequence.len());
    let e = end.min(sequence.len());
    if s >= e {
        return Ok(Vec::new());
    }

    let frag = &sequence[s..e];
    let mut res = Vec::with_capacity(4 + frag.len());
    res.extend_from_slice(b"GPN1"); // Magic Number + Protocol Version
    res.extend_from_slice(frag.as_bytes());
    Ok(res)
}
