//! 学習メモ: 配列、アラインメント、プライマー、制限酵素の解析モジュールを登録し、主要関数を再公開する。
//! 処理の位置づけ: commands層に解析機能の共通入口を提供し、個別アルゴリズムへ処理を振り分ける。

pub mod alignment;
pub mod primer;
pub mod restriction;
pub mod sequence;

pub use alignment::run_alignment;
pub use restriction::find_restriction_sites;
pub use sequence::{
    apply_edit, calculate_gc_content, search_protein, search_sequence, translate_dna,
    translate_iter, CdsIter, EditOp, SearchResult,
};
