//! 学習メモ: バックエンドで共有する配列、注釈、プライマー、表示データ等のモデルを定義し、主要型をTypeScriptへ生成する。
//! 処理の位置づけ: Tauriコマンドまたはバックエンド内部から利用され、結果をフロントエンド側へ返す。

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash, TS)]
#[ts(export, export_to = "../../src/bindings/Strand.ts")]
pub enum Strand {
    Forward = 1,
    Reverse = -1,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash, TS)]
#[ts(export, export_to = "../../src/bindings/DisplayShape.ts")]
pub enum DisplayShape {
    Rect,
    Arrow,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Hash, TS)]
#[ts(export, export_to = "../../src/bindings/Annotation.ts")]
pub struct Annotation {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    #[ts(rename = "type")]
    pub feature_type: String,
    pub start: usize,
    pub end: usize,
    pub strand: Strand,
    pub color: Option<String>,
    #[serde(rename = "display_shape")]
    #[ts(rename = "display_shape")]
    pub display_shape: Option<DisplayShape>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/Topology.ts")]
pub enum Topology {
    Linear,
    Circular,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Hash, TS)]
#[ts(export, export_to = "../../src/bindings/Primer.ts")]
pub struct Primer {
    pub id: String,
    pub name: String,
    pub sequence: String,
    pub start: usize,
    pub end: usize,
    pub strand: Strand,
    #[serde(rename = "tail5")]
    #[ts(rename = "tail5")]
    pub tail_5: String,
    #[serde(rename = "tail3")]
    #[ts(rename = "tail3")]
    pub tail_3: String,
    pub color: Option<String>,
    pub mismatches: Vec<usize>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[ts(export, export_to = "../../src/bindings/ChromTrace.ts")]
pub struct ChromTrace {
    pub g: Vec<u16>,
    pub a: Vec<u16>,
    pub t: Vec<u16>,
    pub c: Vec<u16>,
    pub peak_locations: Vec<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[ts(export, export_to = "../../src/bindings/SequenceData.ts")]
pub struct SequenceData {
    pub id: String,
    pub description: Option<String>,
    pub sequence: String,
    pub annotations: Vec<Annotation>,
    pub primers: Vec<Primer>,
    pub topology: Topology,
    pub trace: Option<ChromTrace>,
    pub enzymes: Option<Vec<String>>,
    #[serde(rename = "enzymeSettings")]
    #[ts(rename = "enzymeSettings")]
    pub enzyme_settings: Option<Vec<u8>>,
    #[serde(rename = "alignmentResults")]
    #[ts(rename = "alignmentResults")]
    pub alignment_results: Option<Vec<AlignedSeqResult>>,
    pub debug_hex: Option<String>,
    pub file_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash, TS)]
#[ts(export, export_to = "../../src/bindings/AlignmentMode.ts")]
pub enum AlignmentMode {
    Automatic,
    ReadMapping, // Optimized for short reads (AB1)
    Structural,  // Optimized for long sequences (Plasmid comparison)
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[ts(export, export_to = "../../src/bindings/AlignedSeqResult.ts")]
pub struct AlignedSeqResult {
    pub id: String,
    pub data: Option<Box<SequenceData>>,
    pub x_start: usize,
    pub x_end: usize,
    pub y_start: usize,
    pub y_end: usize,
    pub aligned_query: String,
    pub aligned_template: String,
    pub strand: Strand,
    pub score: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[ts(export, export_to = "../../src/bindings/RestrictionSite.ts")]
pub struct RestrictionSite {
    pub name: String,
    pub position: usize,
    pub site: String,
    pub cut_after_top: i32,
    pub cut_after_bottom: i32,
    #[serde(rename = "topCutOffset")]
    #[ts(rename = "topCutOffset")]
    pub top_cut_offset: i32,
    #[serde(rename = "bottomCutOffset")]
    #[ts(rename = "bottomCutOffset")]
    pub bottom_cut_offset: i32,
    pub methylation_sensitivity: Option<String>,
}

pub struct Coordinate {
    pub pos: usize,
    pub seq_len: usize,
    pub topology: Topology,
}

impl Coordinate {
    pub fn new(pos: usize, seq_len: usize, topology: Topology) -> Self {
        let pos = if seq_len > 0 { pos % seq_len } else { 0 };
        Self {
            pos,
            seq_len,
            topology,
        }
    }

    pub fn shift(&self, delta: i32) -> usize {
        if self.seq_len == 0 {
            return 0;
        }
        match self.topology {
            Topology::Circular => {
                let len = self.seq_len as i32;
                let new_pos = (self.pos as i32 + delta) % len;
                if new_pos < 0 {
                    (new_pos + len) as usize
                } else {
                    new_pos as usize
                }
            }
            Topology::Linear => {
                let new_pos = self.pos as i32 + delta;
                new_pos.clamp(0, self.seq_len as i32) as usize
            }
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[ts(export, export_to = "../../src/bindings/AppSettings.ts")]
pub struct AppSettings {
    #[serde(rename = "fontFamily")]
    #[ts(rename = "fontFamily")]
    pub font_family: String,
    #[serde(rename = "fontSize")]
    #[ts(rename = "fontSize")]
    pub font_size: f64,
    #[serde(rename = "aminoAcidTheme")]
    #[ts(rename = "aminoAcidTheme")]
    pub amino_acid_theme: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[ts(export, export_to = "../../src/bindings/SequenceViewData.ts")]
pub struct SequenceViewData {
    pub bases: String,
    pub annotations: Vec<Annotation>,
    pub enzymes: Vec<RestrictionSite>,
    pub primers: Vec<Primer>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_bindings() {
        SequenceViewData::export_all().expect("failed to export types");
        SequenceData::export_all().expect("failed to export types");
        RestrictionSite::export_all().expect("failed to export types");
        AppSettings::export_all().expect("failed to export types");
        Primer::export_all().expect("failed to export types");
    }
}
