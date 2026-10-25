//! 学習メモ: k-mer候補抽出と帯付き動的計画法を使って配列アラインメントを計算する。
//! 処理の位置づけ: commands層から呼ばれ、UIやファイルI/Oに依存しない計算結果を返す。

use crate::models::{AlignedSeqResult, AlignmentMode, Strand};
use crate::utils::clean_sequence;
use std::collections::HashMap;

fn hash_kmer(kmer: &[u8]) -> u64 {
    let mut h = 0u64;
    for &b in kmer {
        h = (h << 2)
            | match b {
                b'A' => 0,
                b'C' => 1,
                b'G' => 2,
                b'T' => 3,
                _ => 0,
            };
    }
    h
}

type KmerIndex = HashMap<u64, Vec<u32>>;

fn build_index(template: &[u8], k: usize) -> KmerIndex {
    let mut index = KmerIndex::default();
    let len = template.len();
    if len < k {
        return index;
    }

    for i in 0..len {
        let mut kmer_val = 0u64;
        for j in 0..k {
            let b = template[(i + j) % len];
            kmer_val = (kmer_val << 2)
                | match b {
                    b'A' => 0,
                    b'C' => 1,
                    b'G' => 2,
                    b'T' => 3,
                    _ => 0,
                };
        }
        index.entry(kmer_val).or_default().push(i as u32);
    }
    index
}

pub fn run_alignment(template: &str, query: &str, mode: AlignmentMode) -> Vec<AlignedSeqResult> {
    let t_clean = clean_sequence(template).to_uppercase();
    let q_clean = clean_sequence(query).to_uppercase();
    let t_bytes = t_clean.as_bytes();
    let q_bytes = q_clean.as_bytes();

    if t_bytes.is_empty() || q_bytes.is_empty() {
        return Vec::new();
    }

    // 1. Determine parameters based on mode
    let effective_mode = match mode {
        AlignmentMode::Automatic => {
            if t_bytes.len() > 3000 && q_bytes.len() > 3000 {
                AlignmentMode::Structural
            } else {
                AlignmentMode::ReadMapping
            }
        }
        m => m,
    };

    let (band_width, exclusion_threshold, max_candidates) = match effective_mode {
        AlignmentMode::ReadMapping => (100, 200, 3),
        AlignmentMode::Structural => (400, 50, 10),
        _ => (100, 200, 3),
    };

    let k = 11;
    let index = build_index(t_bytes, k);
    let mut all_results = Vec::new();

    // 2. Forward
    let fwd_candidates = find_candidates(q_bytes, &index, k, exclusion_threshold, max_candidates);
    for diag in fwd_candidates {
        if let Some(res) = run_banded_dp(t_bytes, q_bytes, diag, Strand::Forward, band_width) {
            all_results.push(res);
        }
    }

    // 3. Reverse
    let rev_q = crate::utils::get_reverse_complement(&q_clean).into_bytes();
    let rev_candidates = find_candidates(&rev_q, &index, k, exclusion_threshold, max_candidates);
    for diag in rev_candidates {
        if let Some(res) = run_banded_dp(t_bytes, &rev_q, diag, Strand::Reverse, band_width) {
            all_results.push(res);
        }
    }

    // 4. Deduplicate and Sort
    deduplicate_results(&mut all_results);
    all_results.sort_by_key(|r| -r.score);
    all_results.truncate(10);
    all_results
}

fn find_candidates(
    query: &[u8],
    index: &KmerIndex,
    k: usize,
    exclusion_threshold: i32,
    max_candidates: usize,
) -> Vec<i32> {
    let mut votes: HashMap<i32, u32> = HashMap::new();

    for (i, window) in query.windows(k).enumerate() {
        let h = hash_kmer(window);
        if let Some(positions) = index.get(&h) {
            for &p in positions {
                *votes.entry(p as i32 - i as i32).or_default() += 1;
            }
        }
    }

    let mut candidates: Vec<(i32, u32)> = votes.into_iter().filter(|&(_, c)| c >= 5).collect();
    candidates.sort_by_key(|&(_, c)| std::cmp::Reverse(c));

    let mut selected = Vec::new();
    for (diag, _) in candidates {
        if !selected
            .iter()
            .any(|&d: &i32| (d - diag).abs() < exclusion_threshold)
        {
            selected.push(diag);
            if selected.len() >= max_candidates {
                break;
            }
        }
    }
    selected
}

fn run_banded_dp(
    t_bytes: &[u8],
    q_bytes: &[u8],
    diag: i32,
    strand: Strand,
    band_width: i32,
) -> Option<AlignedSeqResult> {
    let n = q_bytes.len();
    let m = t_bytes.len();

    let full_band = (2 * band_width + 1) as usize;
    let mut score_mat = vec![0i32; 2 * full_band];
    let mut trace_mat = vec![0u8; ((n + 1) * full_band + 3) / 4];

    let mut max_score = 0;
    let mut max_pos = (0, 0);

    for i in 1..=n {
        let t_start_base = i as i32 + diag;
        let curr_row = (i % 2) * full_band;
        let prev_row = ((i - 1) % 2) * full_band;

        for cell in &mut score_mat[curr_row..curr_row + full_band] {
            *cell = 0;
        }

        for offset in -band_width..=band_width {
            let j = t_start_base + offset;
            if j < 1 || j > m as i32 {
                continue;
            }

            let band_idx = (offset + band_width) as usize;

            let s_diag = score_mat[prev_row + band_idx]
                + if q_bytes[i - 1] == t_bytes[j as usize - 1] {
                    1
                } else {
                    -2
                };
            let s_up = if band_idx + 1 < full_band {
                score_mat[prev_row + band_idx + 1] - 1
            } else {
                -1000000
            };
            let s_left = if band_idx > 0 {
                score_mat[curr_row + band_idx - 1] - 1
            } else {
                -1000000
            };

            let (best_s, trace) = if s_diag >= s_up && s_diag >= s_left {
                (s_diag, 1)
            } else if s_up >= s_left {
                (s_up, 2)
            } else {
                (s_left, 3)
            };

            let final_s = 0.max(best_s);
            score_mat[curr_row + band_idx] = final_s;

            if final_s > 0 {
                let abs_idx = i * full_band + band_idx;
                trace_mat[abs_idx / 4] |= trace << ((abs_idx % 4) * 2);
            }

            if final_s > max_score {
                max_score = final_s;
                max_pos = (i, j as usize);
            }
        }
    }

    // Heuristic: require at least a decent score relative to query length for structural,
    // but stay more lenient for short reads.
    if max_score < (n as i32 / 4) {
        return None;
    }

    let mut aligned_q = Vec::new();
    let mut aligned_t = Vec::new();
    let mut cur_i = max_pos.0;
    let mut cur_j = max_pos.1;
    let end_y = max_pos.1;
    let end_x = max_pos.0;

    while cur_i > 0 && cur_j > 0 {
        let t_start_base = cur_i as i32 + diag;
        let offset = cur_j as i32 - t_start_base;
        if offset.abs() > band_width {
            break;
        }

        let band_idx = (offset + band_width) as usize;
        let abs_idx = cur_i * full_band + band_idx;
        let trace = (trace_mat[abs_idx / 4] >> ((abs_idx % 4) * 2)) & 0b11;

        if trace == 1 {
            aligned_q.push(q_bytes[cur_i - 1]);
            aligned_t.push(t_bytes[cur_j - 1]);
            cur_i -= 1;
            cur_j -= 1;
        } else if trace == 2 {
            aligned_q.push(q_bytes[cur_i - 1]);
            aligned_t.push(b'-');
            cur_i -= 1;
        } else if trace == 3 {
            aligned_q.push(b'-');
            aligned_t.push(t_bytes[cur_j - 1]);
            cur_j -= 1;
        } else {
            break;
        }
    }

    aligned_q.reverse();
    aligned_t.reverse();

    Some(AlignedSeqResult {
        id: if strand == Strand::Forward {
            "Forward".to_string()
        } else {
            "Reverse".to_string()
        },
        data: None,
        x_start: cur_i,
        x_end: end_x,
        y_start: cur_j,
        y_end: end_y,
        aligned_query: String::from_utf8_lossy(&aligned_q).into_owned(),
        aligned_template: String::from_utf8_lossy(&aligned_t).into_owned(),
        strand,
        score: max_score,
    })
}

fn deduplicate_results(results: &mut Vec<AlignedSeqResult>) {
    if results.is_empty() {
        return;
    }

    results.sort_by_key(|r| -r.score);
    let mut unique: Vec<AlignedSeqResult> = Vec::new();

    for res in results.drain(..) {
        let is_duplicate = unique.iter().any(|u| {
            if u.strand != res.strand {
                return false;
            }
            // If ranges overlap significantly, consider them duplicate
            let overlap_x = u.x_start.max(res.x_start) < u.x_end.min(res.x_end);
            let overlap_y = u.y_start.max(res.y_start) < u.y_end.min(res.y_end);
            if overlap_x && overlap_y {
                let u_len = u.x_end - u.x_start;
                let res_len = res.x_end - res.x_start;
                let common_len = u
                    .x_end
                    .min(res.x_end)
                    .saturating_sub(u.x_start.max(res.x_start));
                // If more than 80% of the shorter one is covered by the longer one
                common_len as f64 > (u_len.min(res_len) as f64 * 0.8)
            } else {
                false
            }
        });

        if !is_duplicate {
            unique.push(res);
        }
    }
    *results = unique;
}
