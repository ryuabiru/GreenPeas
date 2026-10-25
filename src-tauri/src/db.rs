//! 学習メモ: 制限酵素SQLiteデータベースの初期化、CRUD、検索用酵素データの再構築を担当する。
//! 処理の位置づけ: Tauriコマンドまたはバックエンド内部から利用され、結果をフロントエンド側へ返す。

use crate::error::AppError;
use crate::utils::{CompiledEnzyme, EnzymeDefinition, EnzymeStore};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::sync::Arc;
use std::sync::Mutex;

use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export, export_to = "../../src/bindings/DbEnzyme.ts")]
pub struct DbEnzyme {
    pub id: i32,
    pub name: String,
    pub site: String,
    pub cut_top: i32,
    pub cut_bottom: i32,
    pub is_active: bool,
    pub is_custom: bool,
    pub methylation_sensitivity: Option<String>,
    pub optimal_temp: Option<i32>,
    pub inactivation_temp: Option<i32>,
    pub supplier: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export, export_to = "../../src/bindings/DbEnzymeSet.ts")]
pub struct DbEnzymeSet {
    pub id: i32,
    pub name: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/EnzymeSetWithMembers.ts")]
pub struct EnzymeSetWithMembers {
    pub id: i32,
    pub name: String,
    pub is_active: bool,
    pub member_names: Vec<String>,
}

pub struct DbState(pub Arc<SqlitePool>);

pub async fn init_db(app_dir: &std::path::Path) -> Result<SqlitePool, AppError> {
    let db_path = app_dir.join("greenpeas.db");

    // Create database file if it doesn't exist
    if !db_path.exists() {
        std::fs::File::create(&db_path)?;
    }

    let pool = SqlitePoolOptions::new()
        .connect_with(SqliteConnectOptions::new().filename(&db_path))
        .await
        .map_err(AppError::Db)?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS enzymes (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        site TEXT NOT NULL,
        cut_top INTEGER NOT NULL,
        cut_bottom INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        is_custom BOOLEAN DEFAULT 0,
        methylation_sensitivity TEXT,
        optimal_temp INTEGER,
        inactivation_temp INTEGER,
        supplier TEXT,
        notes TEXT
    );",
    )
    .execute(&pool)
    .await
    .map_err(AppError::Db)?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS enzyme_sets (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT 0
    );",
    )
    .execute(&pool)
    .await
    .map_err(AppError::Db)?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS enzyme_set_members (
        set_id INTEGER,
        enzyme_name TEXT,
        PRIMARY KEY(set_id, enzyme_name),
        FOREIGN KEY(set_id) REFERENCES enzyme_sets(id) ON DELETE CASCADE
    );",
    )
    .execute(&pool)
    .await
    .map_err(AppError::Db)?;

    // Seeding
    let count: i32 = sqlx::query_scalar("SELECT COUNT(*) FROM enzymes")
        .fetch_one(&pool)
        .await
        .map_err(AppError::Db)?;

    if count == 0 {
        let json_str = include_str!("../restriction_enzymes.json");
        let defs: Vec<EnzymeDefinition> =
            serde_json::from_str(json_str).map_err(|e| AppError::Generic(e.to_string()))?;

        for def in defs {
            let (cut_top, cut_bottom) = crate::utils::calculate_cuts(&def.site, def.cut);
            sqlx::query("INSERT INTO enzymes (name, site, cut_top, cut_bottom, is_active, is_custom) VALUES (?, ?, ?, ?, 1, 0)")
                .bind(def.name)
                .bind(def.site)
                .bind(cut_top)
                .bind(cut_bottom)
                .execute(&pool).await.map_err(AppError::Db)?;
        }

        // Create a default set
        let set_id: i32 = sqlx::query_scalar(
            "INSERT INTO enzyme_sets (name, is_active) VALUES ('Default Set', 1) RETURNING id",
        )
        .fetch_one(&pool)
        .await
        .map_err(AppError::Db)?;

        sqlx::query(
            "INSERT INTO enzyme_set_members (set_id, enzyme_name) SELECT ?, name FROM enzymes",
        )
        .bind(set_id)
        .execute(&pool)
        .await
        .map_err(AppError::Db)?;
    }

    Ok(pool)
}

#[tauri::command]
pub async fn get_enzymes(state: tauri::State<'_, DbState>) -> Result<Vec<DbEnzyme>, AppError> {
    let enzymes = sqlx::query_as::<_, DbEnzyme>("SELECT * FROM enzymes ORDER BY name ASC")
        .fetch_all(&*state.0)
        .await
        .map_err(AppError::Db)?;
    Ok(enzymes)
}

#[tauri::command]
pub async fn get_enzyme_sets(
    state: tauri::State<'_, DbState>,
) -> Result<Vec<EnzymeSetWithMembers>, AppError> {
    let sets = sqlx::query_as::<_, DbEnzymeSet>("SELECT * FROM enzyme_sets ORDER BY name ASC")
        .fetch_all(&*state.0)
        .await
        .map_err(AppError::Db)?;

    let mut result = Vec::new();
    for set in sets {
        let members: Vec<String> =
            sqlx::query_scalar("SELECT enzyme_name FROM enzyme_set_members WHERE set_id = ?")
                .bind(set.id)
                .fetch_all(&*state.0)
                .await
                .map_err(AppError::Db)?;

        result.push(EnzymeSetWithMembers {
            id: set.id,
            name: set.name,
            is_active: set.is_active,
            member_names: members,
        });
    }
    Ok(result)
}

#[tauri::command]
pub async fn create_enzyme_set(
    name: String,
    enzyme_names: Vec<String>,
    state: tauri::State<'_, DbState>,
) -> Result<i32, AppError> {
    let mut tx = state.0.begin().await.map_err(AppError::Db)?;

    let set_id: i32 =
        sqlx::query_scalar("INSERT INTO enzyme_sets (name, is_active) VALUES (?, 0) RETURNING id")
            .bind(name)
            .fetch_one(&mut *tx)
            .await
            .map_err(AppError::Db)?;

    for ename in enzyme_names {
        sqlx::query("INSERT INTO enzyme_set_members (set_id, enzyme_name) VALUES (?, ?)")
            .bind(set_id)
            .bind(ename)
            .execute(&mut *tx)
            .await
            .map_err(AppError::Db)?;
    }

    tx.commit().await.map_err(AppError::Db)?;
    Ok(set_id)
}

#[tauri::command]
pub async fn delete_enzyme_set(id: i32, state: tauri::State<'_, DbState>) -> Result<(), AppError> {
    sqlx::query("DELETE FROM enzyme_sets WHERE id = ?")
        .bind(id)
        .execute(&*state.0)
        .await
        .map_err(AppError::Db)?;
    Ok(())
}

#[tauri::command]
pub async fn toggle_enzyme(
    id: i32,
    active: bool,
    state: tauri::State<'_, DbState>,
) -> Result<(), AppError> {
    sqlx::query("UPDATE enzymes SET is_active = ? WHERE id = ?")
        .bind(active)
        .bind(id)
        .execute(&*state.0)
        .await
        .map_err(AppError::Db)?;
    Ok(())
}

#[tauri::command]
pub async fn add_enzyme(
    name: String,
    site: String,
    cut_top: i32,
    cut_bottom: i32,
    methylation: Option<String>,
    opt_temp: Option<i32>,
    inc_temp: Option<i32>,
    supplier: Option<String>,
    notes: Option<String>,
    state: tauri::State<'_, DbState>,
) -> Result<(), AppError> {
    sqlx::query("INSERT INTO enzymes (name, site, cut_top, cut_bottom, methylation_sensitivity, optimal_temp, inactivation_temp, supplier, notes, is_active, is_custom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)")
        .bind(name)
        .bind(site)
        .bind(cut_top)
        .bind(cut_bottom)
        .bind(methylation)
        .bind(opt_temp)
        .bind(inc_temp)
        .bind(supplier)
        .bind(notes)
        .execute(&*state.0).await.map_err(AppError::Db)?;
    Ok(())
}

#[tauri::command]
pub async fn update_enzyme(
    id: i32,
    name: String,
    site: String,
    cut_top: i32,
    cut_bottom: i32,
    methylation: Option<String>,
    opt_temp: Option<i32>,
    inc_temp: Option<i32>,
    supplier: Option<String>,
    notes: Option<String>,
    state: tauri::State<'_, DbState>,
) -> Result<(), AppError> {
    sqlx::query("UPDATE enzymes SET name = ?, site = ?, cut_top = ?, cut_bottom = ?, methylation_sensitivity = ?, optimal_temp = ?, inactivation_temp = ?, supplier = ?, notes = ? WHERE id = ?")
        .bind(name)
        .bind(site)
        .bind(cut_top)
        .bind(cut_bottom)
        .bind(methylation)
        .bind(opt_temp)
        .bind(inc_temp)
        .bind(supplier)
        .bind(notes)
        .bind(id)
        .execute(&*state.0).await.map_err(AppError::Db)?;
    Ok(())
}

#[tauri::command]
pub async fn delete_enzyme(id: i32, state: tauri::State<'_, DbState>) -> Result<(), AppError> {
    sqlx::query("DELETE FROM enzymes WHERE id = ? AND is_custom = 1")
        .bind(id)
        .execute(&*state.0)
        .await
        .map_err(AppError::Db)?;
    Ok(())
}

pub async fn load_active_enzymes(pool: &SqlitePool) -> Result<Vec<CompiledEnzyme>, AppError> {
    // Currently loads all active enzymes. In the future, this should load based on the active set.
    let db_enzymes = sqlx::query_as::<_, DbEnzyme>("SELECT * FROM enzymes WHERE is_active = 1")
        .fetch_all(pool)
        .await
        .map_err(AppError::Db)?;

    let compiled = db_enzymes
        .into_iter()
        .map(|de| CompiledEnzyme {
            name: de.name,
            site: de.site,
            cut_top: de.cut_top,
            cut_bottom: de.cut_bottom,
            methylation_sensitivity: de.methylation_sensitivity,
        })
        .collect();

    Ok(compiled)
}

#[tauri::command]
pub async fn refresh_enzymes(
    db_state: tauri::State<'_, DbState>,
    enzyme_state: tauri::State<'_, Mutex<EnzymeStore>>,
) -> Result<(), AppError> {
    let compiled = load_active_enzymes(&*db_state.0).await?;
    let mut store = enzyme_state.lock().unwrap();
    *store = EnzymeStore::new(compiled);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_db_bindings() {
        DbEnzyme::export_all().expect("failed to export db types");
        DbEnzymeSet::export_all().expect("failed to export db types");
        EnzymeSetWithMembers::export_all().expect("failed to export db types");
    }

    #[tokio::test]
    async fn init_db_preserves_custom_enzymes() {
        let test_dir = std::env::temp_dir().join(format!(
            "greenpeas db 試験 {}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&test_dir).expect("failed to create test directory");

        let pool = init_db(&test_dir)
            .await
            .expect("failed to initialize test database");
        sqlx::query(
            "INSERT INTO enzymes (
                name, site, cut_top, cut_bottom, is_active, is_custom
            ) VALUES ('CustomPersistedEnzyme', 'ATGC', 1, 3, 1, 1)",
        )
        .execute(&pool)
        .await
        .expect("failed to insert custom enzyme");
        pool.close().await;

        let reopened = init_db(&test_dir)
            .await
            .expect("failed to reopen test database");
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM enzymes WHERE name = 'CustomPersistedEnzyme'")
                .fetch_one(&reopened)
                .await
                .expect("failed to query custom enzyme");
        reopened.close().await;

        assert_eq!(count, 1);
        std::fs::remove_dir_all(test_dir).expect("failed to remove test directory");
    }
}
