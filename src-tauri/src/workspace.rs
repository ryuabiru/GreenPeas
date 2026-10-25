//! 学習メモ: 開いている配列をバックエンド内に保持し、複数コマンドから共有できるワークスペースを提供する。
//! 処理の位置づけ: Tauriコマンドまたはバックエンド内部から利用され、結果をフロントエンド側へ返す。

use crate::error::AppError;
use crate::models::SequenceData;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

pub struct WorkspaceStore {
    sequences: Arc<Mutex<HashMap<String, SequenceData>>>,
}

impl WorkspaceStore {
    pub fn new() -> Self {
        Self {
            sequences: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn register_unique(&self, mut data: SequenceData) -> String {
        let mut map = self.sequences.lock().unwrap();
        let base_id = if data.id.is_empty() || data.id == "Unknown" {
            Uuid::new_v4().to_string()
        } else {
            data.id.clone()
        };
        let mut id = base_id.clone();
        let mut suffix = 2;
        while map.contains_key(&id) {
            id = format!("{base_id} ({suffix})");
            suffix += 1;
        }
        data.id = id.clone();
        map.insert(id.clone(), data);
        id
    }

    pub fn upsert(&self, mut data: SequenceData) -> String {
        let id = if data.id.is_empty() || data.id == "Unknown" {
            Uuid::new_v4().to_string()
        } else {
            data.id.clone()
        };
        data.id = id.clone();
        self.sequences.lock().unwrap().insert(id.clone(), data);
        id
    }

    pub fn get(&self, id: &str) -> Option<SequenceData> {
        let map = self.sequences.lock().unwrap();
        map.get(id).cloned()
    }

    pub fn with_sequence<T>(&self, id: &str, f: impl FnOnce(&SequenceData) -> T) -> Option<T> {
        let map = self.sequences.lock().unwrap();
        map.get(id).map(f)
    }

    pub fn update<F>(&self, id: &str, f: F) -> Result<SequenceData, AppError>
    where
        F: FnOnce(&mut SequenceData),
    {
        let mut map = self.sequences.lock().unwrap();
        if let Some(data) = map.get_mut(id) {
            f(data);
            Ok(data.clone())
        } else {
            Err(AppError::Anyhow(anyhow::anyhow!(
                "Sequence not found in workspace: {}",
                id
            )))
        }
    }

    pub fn remove(&self, id: &str) {
        let mut map = self.sequences.lock().unwrap();
        map.remove(id);
    }

    pub fn list_ids(&self) -> Vec<String> {
        let map = self.sequences.lock().unwrap();
        map.keys().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Topology;

    fn sequence(id: &str, bases: &str) -> SequenceData {
        SequenceData {
            id: id.to_string(),
            description: None,
            sequence: bases.to_string(),
            annotations: Vec::new(),
            primers: Vec::new(),
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
    fn duplicate_import_names_get_independent_handles_but_upserts_keep_the_handle() {
        let workspace = WorkspaceStore::new();
        let first = workspace.register_unique(sequence("sample", "AAAA"));
        let second = workspace.register_unique(sequence("sample", "CCCC"));
        assert_eq!(first, "sample");
        assert_eq!(second, "sample (2)");
        assert_eq!(workspace.get(&second).unwrap().id, second);

        workspace.upsert(sequence(&first, "GGGG"));
        assert_eq!(workspace.get(&first).unwrap().sequence, "GGGG");
        assert_eq!(workspace.get(&second).unwrap().sequence, "CCCC");
    }

    #[test]
    fn unknown_import_receives_an_usable_sequence_id() {
        let workspace = WorkspaceStore::new();
        let handle = workspace.register_unique(sequence("Unknown", "ACGT"));
        assert_eq!(workspace.get(&handle).unwrap().id, handle);
    }
}
