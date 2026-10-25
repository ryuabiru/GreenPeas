//! 学習メモ: クローニング機能をTauriコマンドとして公開し、内部クリップボードと組立エンジンを接続する。
//! 処理の位置づけ: Tauriコマンドまたはバックエンド内部から利用され、結果をフロントエンド側へ返す。

use super::engine::{assemble_fragments, calculate_overhang_at};
use super::models::{ClipboardStore, Fragment, LigationResult};
use crate::models::{RestrictionSite, Topology};

#[tauri::command]
pub fn copy_to_internal_clipboard(
    id: String,
    fragment: Fragment,
    state: tauri::State<ClipboardStore>,
) -> String {
    state.insert(id.clone(), fragment);
    id
}

#[tauri::command]
pub fn get_internal_fragment(id: String, state: tauri::State<ClipboardStore>) -> Option<Fragment> {
    state.get(&id)
}

#[tauri::command]
pub fn assemble_fragments_cmd(fragments: Vec<Fragment>, topology: Topology) -> LigationResult {
    match assemble_fragments(fragments, topology) {
        Ok(data) => LigationResult {
            success: true,
            error_message: None,
            data: Some(data),
        },
        Err(e) => LigationResult {
            success: false,
            error_message: Some(e),
            data: None,
        },
    }
}

#[tauri::command]
pub fn get_fragment_from_selection(
    sequence_id: String,
    start: usize,
    end: usize,
    restriction_sites: Vec<RestrictionSite>,
    workspace: tauri::State<'_, crate::workspace::WorkspaceStore>,
) -> Result<Fragment, crate::error::AppError> {
    let seq = workspace.get(&sequence_id).ok_or_else(|| {
        crate::error::AppError::Generic(format!("Sequence {} not found", sequence_id))
    })?;
    let sequence = seq.sequence;
    let annotations = seq.annotations;
    let primers = seq.primers;

    let left_overhang = calculate_overhang_at(&sequence, start, &restriction_sites);
    let right_overhang = calculate_overhang_at(&sequence, end, &restriction_sites);

    let s = start.min(sequence.len());
    let e = end.min(sequence.len());

    Ok(Fragment {
        sequence: sequence[s..e].to_string(),
        left_overhang,
        right_overhang,
        annotations: annotations
            .into_iter()
            .filter(|a| a.start >= s && a.end <= e)
            .map(|mut a| {
                a.start -= s;
                a.end -= s;
                a
            })
            .collect(),
        primers: primers
            .into_iter()
            .filter(|p| p.start >= s && p.end <= e)
            .map(|mut p| {
                p.start -= s;
                p.end -= s;
                p
            })
            .collect(),
    })
}
