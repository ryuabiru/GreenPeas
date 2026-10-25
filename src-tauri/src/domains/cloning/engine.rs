//! 学習メモ: 断片末端の適合性を検証し、複数断片をライゲーションした配列を組み立てる。
//! 処理の位置づけ: Tauriコマンドまたはバックエンド内部から利用され、結果をフロントエンド側へ返す。

use super::models::{Fragment, Overhang};
use crate::models::{RestrictionSite, SequenceData, Topology};

pub fn calculate_overhang_at(
    sequence: &str,
    position: usize,
    sites: &[RestrictionSite],
) -> Option<Overhang> {
    for site in sites {
        let top_cut = (site.position as i64 + site.cut_after_top as i64).max(0) as usize;
        let bottom_cut = (site.position as i64 + site.cut_after_bottom as i64).max(0) as usize;

        if top_cut == position || bottom_cut == position {
            if top_cut == bottom_cut {
                return None;
            } // Blunt

            let start = top_cut.min(bottom_cut);
            let end = top_cut.max(bottom_cut);
            let seq = sequence.get(start..end).unwrap_or("").to_string();

            return Some(Overhang {
                sequence: seq,
                is_5_prime: top_cut < bottom_cut,
                enzyme_name: Some(site.name.clone()),
            });
        }
    }
    None
}

pub fn validate_ligation(
    f1_right: &Option<Overhang>,
    f2_left: &Option<Overhang>,
) -> Result<(), String> {
    match (f1_right, f2_left) {
        (None, None) => Ok(()), // Blunt
        (Some(o1), Some(o2)) => {
            if o1.is_5_prime != o2.is_5_prime {
                return Err("Overhang type mismatch (5' vs 3')".to_string());
            }
            if o1.sequence != o2.sequence {
                return Err(format!(
                    "Overhang sequence mismatch: {} vs {}",
                    o1.sequence, o2.sequence
                ));
            }
            Ok(())
        }
        _ => Err("Ends are incompatible (Sticky vs Blunt)".to_string()),
    }
}

pub fn assemble_fragments(
    fragments: Vec<Fragment>,
    topology: Topology,
) -> Result<SequenceData, String> {
    if fragments.is_empty() {
        return Err("No fragments to assemble".to_string());
    }

    for i in 0..fragments.len() - 1 {
        validate_ligation(
            &fragments[i].right_overhang,
            &fragments[i + 1].left_overhang,
        )
        .map_err(|e| format!("Junction {}-{}: {}", i, i + 1, e))?;
    }

    if topology == Topology::Circular {
        validate_ligation(
            &fragments.last().unwrap().right_overhang,
            &fragments[0].left_overhang,
        )
        .map_err(|e| format!("Circularization junction: {}", e))?;
    }

    let mut final_sequence = String::new();
    let mut final_annotations = Vec::new();
    let mut final_primers = Vec::new();
    let mut current_offset = 0;

    for frag in fragments {
        final_sequence.push_str(&frag.sequence);
        for mut ann in frag.annotations {
            ann.start += current_offset;
            ann.end += current_offset;
            final_annotations.push(ann);
        }
        for mut primer in frag.primers {
            primer.start += current_offset;
            primer.end += current_offset;
            final_primers.push(primer);
        }
        current_offset = final_sequence.len();
    }

    if topology == Topology::Circular && final_sequence.len() < 50 {
        return Err(
            "Physical constraint: Sequence is too short to circularize (minimum 50bp required)"
                .to_string(),
        );
    }

    Ok(SequenceData {
        id: "assembled_product".to_string(),
        description: Some("Assembled via GreenPeas Engine".to_string()),
        sequence: final_sequence,
        annotations: final_annotations,
        primers: final_primers,
        topology,
        trace: None,
        enzymes: None,
        enzyme_settings: None,
        alignment_results: None,
        debug_hex: None,
        file_path: None,
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn export_bindings_overhang() {
        // Just to trigger ts-rs export
    }
}
