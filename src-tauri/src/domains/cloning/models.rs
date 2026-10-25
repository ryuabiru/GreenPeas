//! 学習メモ: クローニング機能で使う断片、末端、ライゲーション結果のデータ構造を定義する。
//! 処理の位置づけ: Tauriコマンドまたはバックエンド内部から利用され、結果をフロントエンド側へ返す。

use crate::models::{Annotation, Primer, SequenceData};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use ts_rs::TS;

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export, export_to = "../../src/bindings/Overhang.ts")]
pub struct Overhang {
    pub sequence: String,
    pub is_5_prime: bool,
    pub enzyme_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export, export_to = "../../src/bindings/Fragment.ts")]
pub struct Fragment {
    pub sequence: String,
    pub left_overhang: Option<Overhang>,
    pub right_overhang: Option<Overhang>,
    pub annotations: Vec<Annotation>,
    pub primers: Vec<Primer>,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export, export_to = "../../src/bindings/LigationResult.ts")]
pub struct LigationResult {
    pub success: bool,
    pub error_message: Option<String>,
    pub data: Option<SequenceData>,
}

pub struct ClipboardStore {
    pub store: Mutex<HashMap<String, Fragment>>,
    pub order: Mutex<Vec<String>>,
}

impl ClipboardStore {
    pub fn new() -> Self {
        Self {
            store: Mutex::new(HashMap::new()),
            order: Mutex::new(Vec::new()),
        }
    }

    pub fn insert(&self, id: String, fragment: Fragment) {
        let mut store = self.store.lock().unwrap();
        let mut order = self.order.lock().unwrap();

        if order.len() >= 20 {
            if let Some(old_id) = order.first() {
                store.remove(old_id);
            }
            order.remove(0);
        }

        store.insert(id.clone(), fragment);
        order.push(id);
    }

    pub fn get(&self, id: &str) -> Option<Fragment> {
        let store = self.store.lock().unwrap();
        store.get(id).cloned()
    }
}
