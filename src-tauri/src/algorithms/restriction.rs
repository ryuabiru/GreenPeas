//! 学習メモ: コンパイル済み酵素検索器を使い、線状・環状配列上の制限酵素サイトを検出する。
//! 処理の位置づけ: commands層から呼ばれ、UIやファイルI/Oに依存しない計算結果を返す。

use crate::models::{RestrictionSite, Topology};
use crate::utils::EnzymeStore;

pub fn find_restriction_sites(
    sequence: &str,
    topology: &Topology,
    max_cuts: Option<usize>,
    store: &EnzymeStore,
) -> Vec<RestrictionSite> {
    let len = sequence.len();
    if len == 0 {
        return Vec::new();
    }

    let is_circular = matches!(topology, Topology::Circular);
    let engine = &store.engine;
    let enzymes = &store.enzymes;

    // Find max pattern len for wrapping
    let max_pattern_len = enzymes.iter().map(|e| e.site.len()).max().unwrap_or(0);

    // Minimize allocation: only allocate if circular AND max pattern > 1
    use std::borrow::Cow;
    let search_seq = if is_circular && max_pattern_len > 1 {
        let wrap_len = max_pattern_len.saturating_sub(1).min(len);
        let mut owned = String::with_capacity(len + wrap_len);
        owned.push_str(sequence);
        owned.push_str(&sequence[..wrap_len]);
        Cow::Owned(owned)
    } else {
        Cow::Borrowed(sequence)
    };

    let mut cut_counts = vec![0usize; enzymes.len()];
    let mut too_many = vec![false; enzymes.len()];
    // (enzyme_idx, pos, match_start, match_end)
    let mut temp_sites = Vec::new();

    for mat in engine.ac.find_overlapping_iter(search_seq.as_ref()) {
        let enzyme_idx = engine.pattern_id_to_enzyme_idx[mat.pattern().as_usize()];

        if too_many[enzyme_idx] {
            continue;
        }

        let pos = mat.start();
        if pos < len {
            cut_counts[enzyme_idx] += 1;
            temp_sites.push((enzyme_idx, pos, mat.start(), mat.end()));

            if let Some(max) = max_cuts {
                if cut_counts[enzyme_idx] > max {
                    too_many[enzyme_idx] = true;
                }
            }
        }
    }

    let mut sites = Vec::with_capacity(temp_sites.len());
    for (enzyme_idx, pos, start, end) in temp_sites {
        if max_cuts.is_some() && too_many[enzyme_idx] {
            continue;
        }
        let enzyme = &enzymes[enzyme_idx];
        sites.push(RestrictionSite {
            name: enzyme.name.clone(),
            position: pos,
            site: search_seq[start..end].to_string(),
            cut_after_top: enzyme.cut_top,
            cut_after_bottom: enzyme.cut_bottom,
            top_cut_offset: enzyme.cut_top,
            bottom_cut_offset: enzyme.cut_bottom,
            methylation_sensitivity: enzyme.methylation_sensitivity.clone(),
        });
    }

    sites.sort_by_key(|s| s.position);
    sites
}
