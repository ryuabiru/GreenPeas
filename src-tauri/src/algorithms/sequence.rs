//! 学習メモ: GC含量、翻訳、検索、配列編集など、基本的な配列アルゴリズムを実装する。
//! 処理の位置づけ: commands層から呼ばれ、UIやファイルI/Oに依存しない計算結果を返す。

use crate::models::{Annotation, SequenceData, Strand, Topology};
use serde::{Deserialize, Serialize};

pub fn calculate_gc_content(sequence: &str) -> f64 {
    let bytes = sequence.as_bytes();
    if bytes.is_empty() {
        return 0.0;
    }
    let mut gc_count = 0;
    for &b in bytes {
        if matches!(b, b'G' | b'C' | b'g' | b'c') {
            gc_count += 1;
        }
    }
    (gc_count as f64 / bytes.len() as f64) * 100.0
}

pub fn translate_dna(sequence: &str, frame: i32) -> String {
    let dna_seq = sequence.as_bytes();
    let mut amino_acids = String::with_capacity(dna_seq.len() / 3);
    let start = (frame.abs() % 3) as usize;
    for i in (start..dna_seq.len()).step_by(3) {
        if i + 3 <= dna_seq.len() {
            let codon = &dna_seq[i..i + 3];
            let mut codon_buf = [0u8; 3];
            codon_buf.copy_from_slice(codon);
            codon_buf.make_ascii_uppercase();

            let aa = match &codon_buf {
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
            amino_acids.push(aa);
        }
    }
    amino_acids
}

pub struct CdsIter<'a> {
    seq: &'a [u8],
    start_pos: usize,
    count: usize,
    len: usize,
    reverse: bool,
}

impl<'a> CdsIter<'a> {
    pub fn new(seq: &'a [u8], start: usize, end: usize, reverse: bool) -> Self {
        let len = if start <= end {
            end - start
        } else {
            seq.len() - start + end
        };
        Self {
            seq,
            start_pos: start,
            count: 0,
            len,
            reverse,
        }
    }
}

impl<'a> Iterator for CdsIter<'a> {
    type Item = u8;
    fn next(&mut self) -> Option<Self::Item> {
        if self.count >= self.len || self.seq.is_empty() {
            return None;
        }

        let idx = if self.reverse {
            (self.start_pos + self.len - 1 - self.count) % self.seq.len()
        } else {
            (self.start_pos + self.count) % self.seq.len()
        };
        self.count += 1;

        let mut b = self.seq[idx];
        if self.reverse {
            b = match b.to_ascii_uppercase() {
                b'A' => b'T',
                b'T' => b'A',
                b'C' => b'G',
                b'G' => b'C',
                b'N' => b'N',
                b'R' => b'Y',
                b'Y' => b'R',
                b'M' => b'K',
                b'K' => b'M',
                b'S' => b'S',
                b'W' => b'W',
                b'H' => b'D',
                b'D' => b'H',
                b'B' => b'V',
                b'V' => b'B',
                _ => b,
            };
        }
        Some(b)
    }
}

pub fn translate_iter<I: Iterator<Item = u8>>(iter: I) -> String {
    let mut amino_acids = String::new();
    let mut codon_buf = [0u8; 3];
    let mut codon_idx = 0;

    for b in iter {
        codon_buf[codon_idx] = b.to_ascii_uppercase();
        codon_idx += 1;
        if codon_idx == 3 {
            let aa = match &codon_buf {
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
            amino_acids.push(aa);
            codon_idx = 0;
        }
    }
    amino_acids
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct SearchResult {
    pub start: usize,
    pub end: usize,
    pub strand: i32,
}

pub fn search_sequence(sequence: &str, query: &str, circular: bool) -> Vec<SearchResult> {
    if query.is_empty() || sequence.is_empty() {
        return vec![];
    }

    // We assume sequence is already uppercase for maximum performance.
    // If not, we'd ideally enforce it at the boundary.
    let query_upper = query.to_uppercase();
    let query_len = query_upper.len();
    let seq_len = sequence.len();

    if query_len > seq_len {
        return vec![];
    }

    const MAX_SEARCH_RESULTS: usize = 10_000;
    let mut results = Vec::new();

    // Helper for searching in a specific version (forward or RC)
    let find_matches = |target: &str, is_rc: bool, limit: usize| -> Vec<SearchResult> {
        let mut matches = Vec::new();

        let search_space = if circular {
            std::borrow::Cow::Owned(format!(
                "{}{}",
                target,
                &target[..query_len.min(seq_len).saturating_sub(1)]
            ))
        } else {
            std::borrow::Cow::Borrowed(target)
        };

        let mut start_pos = 0;
        while matches.len() < limit {
            let Some(pos) = search_space[start_pos..].find(&query_upper) else {
                break;
            };
            let actual_pos = start_pos + pos;
            if actual_pos >= seq_len {
                break;
            }

            let match_start = actual_pos % seq_len;
            let match_end = (actual_pos + query_len) % seq_len;

            if is_rc {
                let rc_start = (seq_len - (actual_pos + query_len) % seq_len) % seq_len;
                let rc_end = (seq_len - actual_pos % seq_len) % seq_len;
                matches.push(SearchResult {
                    start: rc_start,
                    end: if rc_end == 0 { seq_len } else { rc_end },
                    strand: -1,
                });
            } else {
                matches.push(SearchResult {
                    start: match_start,
                    end: if match_end == 0 && actual_pos + query_len >= seq_len {
                        seq_len
                    } else {
                        match_end
                    },
                    strand: 1,
                });
            }
            start_pos = actual_pos + 1;
        }
        matches
    };

    // Forward search
    results.extend(find_matches(sequence, false, MAX_SEARCH_RESULTS));

    // Reverse complement search
    if results.len() < MAX_SEARCH_RESULTS {
        let rc_seq = crate::utils::get_reverse_complement(sequence);
        results.extend(find_matches(
            &rc_seq,
            true,
            MAX_SEARCH_RESULTS - results.len(),
        ));
    }

    results
}

pub fn search_protein(
    sequence: &str,
    query: &str,
    annotations: &[Annotation],
) -> Vec<SearchResult> {
    if query.is_empty() || sequence.is_empty() {
        return vec![];
    }

    let query_upper = query.to_uppercase();
    let mut results = Vec::new();

    let seq_bytes = sequence.as_bytes();
    for ann in annotations {
        if ann.feature_type.to_uppercase() != "CDS" {
            continue;
        }

        let is_reverse = ann.strand == Strand::Reverse;
        let iter = CdsIter::new(seq_bytes, ann.start, ann.end, is_reverse);
        let protein = translate_iter(iter);

        // Search in protein
        let mut start_pos = 0;
        while let Some(pos) = protein[start_pos..].find(&query_upper) {
            let actual_aa_pos = start_pos + pos;
            let dna_offset = actual_aa_pos * 3;
            let dna_len = query_upper.len() * 3;

            // Map back to original DNA coordinates
            // This is tricky if it wraps around or is RC
            let mut hit_results = Vec::new();

            if ann.strand == Strand::Forward {
                let hit_start = (ann.start + dna_offset) % sequence.len();
                let hit_end = (ann.start + dna_offset + dna_len) % sequence.len();
                hit_results.push(SearchResult {
                    start: hit_start,
                    end: if hit_end == 0 && ann.start + dna_offset + dna_len >= sequence.len() {
                        sequence.len()
                    } else {
                        hit_end
                    },
                    strand: 1,
                });
            } else {
                // Reverse strand: dna_offset is from the 5' end of the RC sequence
                // RC sequence 5' end is original ann.end (if linear)
                let total_cds_len = protein.len() * 3;
                let rc_hit_start = total_cds_len.saturating_sub(dna_offset + dna_len);
                // Map back to forward
                let hit_start = (ann.start + rc_hit_start) % sequence.len();
                let hit_end = (ann.start + rc_hit_start + dna_len) % sequence.len();
                hit_results.push(SearchResult {
                    start: hit_start,
                    end: if hit_end == 0 && ann.start + rc_hit_start + dna_len >= sequence.len() {
                        sequence.len()
                    } else {
                        hit_end
                    },
                    strand: -1,
                });
            }
            results.extend(hit_results);
            start_pos = actual_aa_pos + 1;
        }
    }

    results
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum EditOp {
    #[serde(rename = "insert")]
    Insert { pos: usize, sequence: String },
    #[serde(rename = "delete")]
    Delete { pos: usize, len: usize },
    #[serde(rename = "replace")]
    Replace {
        pos: usize,
        len: usize,
        sequence: String,
    },
}

pub fn apply_edit(
    mut data: SequenceData,
    op: EditOp,
) -> Result<SequenceData, crate::error::AppError> {
    crate::validation::validate_sequence_data(&data)?;
    let old_len = data.sequence.len();
    let (pos, old_fragment_len, new_seq) = match op {
        EditOp::Insert { pos, sequence } => (pos, 0, sequence),
        EditOp::Delete { pos, len } => (pos, len, String::new()),
        EditOp::Replace { pos, len, sequence } => (pos, len, sequence),
    };

    if pos > old_len || old_fragment_len > old_len.saturating_sub(pos) {
        return Err(crate::error::AppError::Algorithm(format!(
            "Edit range {}..{} is outside the {} bp sequence",
            pos,
            pos.saturating_add(old_fragment_len),
            old_len
        )));
    }
    crate::validation::validate_dna_sequence(&new_seq)
        .map_err(|error| crate::error::AppError::Algorithm(error.to_string()))?;

    // 1. Update sequence
    let mut sequence = data.sequence;
    let new_fragment_len = new_seq.len();
    let shift = new_fragment_len as i32 - old_fragment_len as i32;

    if pos <= old_len {
        let end_of_del = (pos + old_fragment_len).min(old_len);
        sequence.replace_range(pos..end_of_del, &new_seq);
    }
    data.sequence = sequence;
    // 2. Shift Annotations
    for ann in &mut data.annotations {
        let edit_start = pos;
        let edit_end = pos + old_fragment_len;

        // Simple linear shift logic for now, can be refined for circular wraps
        if ann.start >= edit_end {
            ann.start = (ann.start as i32 + shift) as usize;
        } else if ann.start > edit_start {
            ann.start = edit_start;
        }

        if ann.end >= edit_end {
            ann.end = (ann.end as i32 + shift) as usize;
        } else if ann.end > edit_start {
            ann.end = edit_start + new_fragment_len;
        }
    }
    data.annotations.retain(|ann| {
        ann.start < ann.end || (matches!(data.topology, Topology::Circular) && ann.start != ann.end)
    });

    // 3. Shift Primers
    for p in &mut data.primers {
        if p.start >= pos + old_fragment_len {
            p.start = (p.start as i32 + shift) as usize;
        } else if p.start > pos {
            p.start = pos;
        }

        if p.end >= pos + old_fragment_len {
            p.end = (p.end as i32 + shift) as usize;
        } else if p.end > pos {
            p.end = pos + new_fragment_len;
        }
    }
    data.primers.retain(|primer| {
        primer.start < primer.end
            || (matches!(data.topology, Topology::Circular) && primer.start != primer.end)
    });

    // 4. Re-analyze restriction sites
    // This requires calling restriction::analyze_sequence but we'll do that in the command layer or here
    // For now, let's keep the existing ones if they are outside the edit range

    crate::validation::validate_sequence_data(&data)?;
    Ok(data)
}

#[cfg(test)]
mod apply_edit_tests {
    use super::*;
    use crate::models::{Primer, Strand, Topology};

    fn mock_seq() -> SequenceData {
        SequenceData {
            id: "test".to_string(),
            description: None,
            sequence: "ATGCATGC".to_string(), // len 8
            annotations: vec![Annotation {
                id: "ann1".to_string(),
                name: "Gene1".to_string(),
                feature_type: "CDS".to_string(),
                start: 4,
                end: 8,
                strand: Strand::Forward,
                color: None,
                display_shape: None,
            }],
            primers: vec![],
            topology: Topology::Linear,
            trace: None,
            enzymes: None,
            enzyme_settings: None,
            alignment_results: None,
            debug_hex: None,
            file_path: None,
        }
    }

    #[test]
    fn test_insert_linear() {
        let data = mock_seq();
        let op = EditOp::Insert {
            pos: 2,
            sequence: "NNN".to_string(),
        };
        let updated = apply_edit(data, op).unwrap();

        assert_eq!(updated.sequence, "ATNNNGCATGC");
        // ann1 was at 4..8, now should be at 7..11
        assert_eq!(updated.annotations[0].start, 7);
        assert_eq!(updated.annotations[0].end, 11);
    }

    #[test]
    fn test_delete_linear() {
        let data = mock_seq();
        let op = EditOp::Delete { pos: 0, len: 2 }; // Delete "AT"
        let updated = apply_edit(data, op).unwrap();

        assert_eq!(updated.sequence, "GCATGC");
        // ann1 was 4..8, now should be 2..6
        assert_eq!(updated.annotations[0].start, 2);
        assert_eq!(updated.annotations[0].end, 6);
    }

    #[test]
    fn rejects_edits_outside_sequence_without_changing_the_document() {
        let data = mock_seq();
        let error = apply_edit(data, EditOp::Delete { pos: 7, len: 2 })
            .unwrap_err()
            .to_string();

        assert!(error.contains("outside the 8 bp sequence"));
    }

    #[test]
    fn repeated_edits_keep_feature_coordinates_valid() {
        let data = mock_seq();
        let inserted = apply_edit(
            data,
            EditOp::Insert {
                pos: 5,
                sequence: "AAA".to_string(),
            },
        )
        .unwrap();
        let replaced = apply_edit(
            inserted,
            EditOp::Replace {
                pos: 1,
                len: 4,
                sequence: "CC".to_string(),
            },
        )
        .unwrap();
        let deleted = apply_edit(replaced, EditOp::Delete { pos: 0, len: 1 }).unwrap();

        crate::validation::validate_sequence_data(&deleted).unwrap();
        assert_eq!(deleted.sequence, "CCAAATGC");
        assert_eq!(deleted.annotations[0].start, 0);
        assert_eq!(deleted.annotations[0].end, 8);
    }

    #[test]
    fn deleting_a_primers_entire_binding_site_keeps_the_document_editable() {
        let mut data = mock_seq();
        data.primers.push(Primer {
            id: "primer-1".to_string(),
            name: "Forward".to_string(),
            sequence: "CATG".to_string(),
            start: 3,
            end: 7,
            strand: Strand::Forward,
            tail_5: String::new(),
            tail_3: String::new(),
            color: None,
            mismatches: Vec::new(),
        });

        let edited = apply_edit(data, EditOp::Delete { pos: 3, len: 4 }).unwrap();
        assert_eq!(edited.sequence, "ATGC");
        assert!(edited.primers.is_empty());
        crate::validation::validate_sequence_data(&edited).unwrap();
    }
}

#[cfg(test)]
mod search_tests {
    use super::*;

    #[test]
    fn caps_common_queries_before_the_result_set_can_exhaust_ui_memory() {
        let results = search_sequence(&"A".repeat(50_000), "A", false);
        assert_eq!(results.len(), 10_000);
        assert_eq!(results[0].start, 0);
        assert_eq!(results[9_999].start, 9_999);
    }

    #[test]
    fn reverse_strand_search_wraps_across_a_circular_origin() {
        let results = search_sequence("AAAACCCC", "TTGG", true);
        assert!(results
            .iter()
            .any(|hit| hit.strand == -1 && hit.start == 6 && hit.end == 2));
    }
}
