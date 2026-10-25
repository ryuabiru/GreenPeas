//! 学習メモ: プライマーの結合位置、ミスマッチ、Tmを解析し、配列変更後に再解析する。
//! 処理の位置づけ: commands層から呼ばれ、UIやファイルI/Oに依存しない計算結果を返す。

use crate::models::{Primer, Strand};
use crate::utils::get_reverse_complement;

pub fn analyze_primer(
    template: &str,
    primer_sequence: &str,
    start: usize,
    end: usize,
    strand: Strand,
) -> Primer {
    let mut mismatches = Vec::new();
    let template_len = template.len();

    // Extract the "annealing" part from the primer sequence.
    // In many cases, users might provide a sequence that is longer than end-start.
    // We assume the binding part is what matches (or mostly matches) template[start..end].

    let binding_len = if end >= start {
        end - start
    } else {
        (template_len - start) + end
    };

    // For simplicity, let's assume the primer sequence provided IS the full sequence.
    // We need to find where the binding starts within the primer sequence.
    // Usually, the 3' end of the primer MUST bind.

    let full_primer_seq = primer_sequence.to_uppercase();
    let primer_len = full_primer_seq.len();

    // Binding part is at the 3' end of the primer.
    let binding_part = if primer_len >= binding_len {
        &full_primer_seq[primer_len - binding_len..]
    } else {
        &full_primer_seq
    };

    let tail_5 = if primer_len > binding_len {
        full_primer_seq[..primer_len - binding_len].to_string()
    } else {
        String::new()
    };

    let template_part = if end >= start {
        template[start..end].to_uppercase()
    } else {
        // Circular wrap
        format!("{}{}", &template[start..], &template[..end]).to_uppercase()
    };

    let target_seq = if strand == Strand::Reverse {
        get_reverse_complement(&template_part)
    } else {
        template_part
    };

    // Compare binding_part with target_seq
    // Important: binding_part is the 3' end of the primer sequence.
    // target_seq is the template segment.
    for (i, (p, t)) in binding_part.chars().zip(target_seq.chars()).enumerate() {
        let p_up = p.to_ascii_uppercase();
        let t_up = t.to_ascii_uppercase();
        if p_up != t_up && p_up != 'N' && t_up != 'N' {
            mismatches.push(i + tail_5.len());
        }
    }

    Primer {
        id: "".to_string(),
        name: "New Primer".to_string(),
        sequence: full_primer_seq,
        start,
        end,
        strand,
        tail_5,
        tail_3: "".to_string(),
        color: None,
        mismatches,
    }
}

pub fn reanalyze_all_primers(template: &str, primers: &mut Vec<Primer>) {
    for primer in primers.iter_mut() {
        let analyzed = analyze_primer(
            template,
            &primer.sequence,
            primer.start,
            primer.end,
            primer.strand,
        );
        primer.mismatches = analyzed.mismatches;
        primer.tail_5 = analyzed.tail_5;
        primer.tail_3 = analyzed.tail_3;
    }
}

pub fn calculate_tm(sequence: &str) -> f64 {
    let seq = sequence.to_uppercase();
    let len = seq.len();
    if len == 0 {
        return 0.0;
    }

    let gc = seq.chars().filter(|&c| c == 'G' || c == 'C').count();
    let at = seq.chars().filter(|&c| c == 'A' || c == 'T').count();

    if len < 14 {
        (2 * at + 4 * gc) as f64
    } else {
        64.9 + 41.0 * (gc as f64 - 16.4) / (at + gc) as f64
    }
}
