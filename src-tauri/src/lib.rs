//! 学習メモ: Tauriアプリを構築し、プラグイン、共有状態、コマンド、ウィンドウ間イベントを登録するバックエンドの起動点。
//! 処理の位置づけ: アプリ起動時に実行され、フロントエンドから利用できるバックエンド機能を登録する。

pub mod algorithms;
pub mod commands;
pub mod db;
pub mod domains;
pub mod error;
pub mod models;
pub mod parsers;
pub mod utils;
pub mod validation;
pub mod workspace;

use crate::commands::PendingFiles;
use crate::db::{init_db, DbState};
use crate::domains::cloning::models::ClipboardStore;
use crate::workspace::WorkspaceStore;
use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::path::BaseDirectory;
use tauri::Emitter;
use tauri::Manager;
use tauri::{WebviewUrl, WebviewWindowBuilder};

#[derive(Clone)]
struct SidebarDragPayload {
    id: String,
    source_window_id: String,
    source_window_label: String,
    path: String,
    consumed: bool,
}

struct SidebarDragStore(Mutex<Option<SidebarDragPayload>>);

#[cfg(debug_assertions)]
fn log_sidebar_drag(message: &str) {
    #[cfg(debug_assertions)]
    eprintln!("[GreenPeas sidebar drag] {message}");
    #[cfg(not(debug_assertions))]
    let _ = message;
}

#[tauri::command]
fn begin_sidebar_drag(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, SidebarDragStore>,
    id: String,
    source_window_id: String,
    path: String,
) -> Result<(), String> {
    let path = path.trim().to_string();
    if path.is_empty() {
        #[cfg(debug_assertions)]
        log_sidebar_drag("begin ignored: empty path");
        return Ok(());
    }

    #[cfg(debug_assertions)]
    log_sidebar_drag(&format!(
        "begin id={id} source_window_id={source_window_id} source_window_label={} path={path}",
        window.label()
    ));

    let mut drag = state.0.lock().map_err(|err| err.to_string())?;
    *drag = Some(SidebarDragPayload {
        id,
        source_window_id,
        source_window_label: window.label().to_string(),
        path,
        consumed: false,
    });
    Ok(())
}

#[tauri::command]
fn take_sidebar_drag_path(
    state: tauri::State<'_, SidebarDragStore>,
    target_window_id: String,
) -> Result<Option<String>, String> {
    let mut drag = state.0.lock().map_err(|err| err.to_string())?;
    if let Some(payload) = drag.as_mut() {
        if payload.source_window_id == target_window_id {
            #[cfg(debug_assertions)]
            log_sidebar_drag(&format!(
                "take ignored: same window target_window_id={target_window_id} id={}",
                payload.id
            ));
            return Ok(None);
        }
        payload.consumed = true;
        #[cfg(debug_assertions)]
        log_sidebar_drag(&format!(
            "take consumed id={} source_window_id={} target_window_id={} path={}",
            payload.id, payload.source_window_id, target_window_id, payload.path
        ));
        Ok(Some(payload.path.clone()))
    } else {
        #[cfg(debug_assertions)]
        log_sidebar_drag(&format!(
            "take missed: no active drag target_window_id={target_window_id}"
        ));
        Ok(None)
    }
}

#[tauri::command]
fn finish_sidebar_drag(
    state: tauri::State<'_, SidebarDragStore>,
    id: String,
) -> Result<bool, String> {
    let mut drag = state.0.lock().map_err(|err| err.to_string())?;
    let Some(payload) = drag.as_ref() else {
        #[cfg(debug_assertions)]
        log_sidebar_drag(&format!("finish missed: no active drag id={id}"));
        return Ok(false);
    };
    if payload.id != id {
        #[cfg(debug_assertions)]
        log_sidebar_drag(&format!(
            "finish ignored: id mismatch requested={id} active={}",
            payload.id
        ));
        return Ok(false);
    }

    let consumed = payload.consumed;
    #[cfg(debug_assertions)]
    log_sidebar_drag(&format!(
        "finish id={id} consumed={consumed} path={}",
        payload.path
    ));
    *drag = None;
    Ok(consumed)
}

#[tauri::command]
fn drop_sidebar_drag_at_screen_position(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, SidebarDragStore>,
    id: String,
    path: String,
    screen_x: f64,
    screen_y: f64,
    sidebar_width: f64,
) -> Result<bool, String> {
    let fallback_path = path.trim().to_string();
    let (source_window_label, drag_path, has_matching_state) = {
        let drag = state.0.lock().map_err(|err| err.to_string())?;
        if let Some(payload) = drag.as_ref().filter(|payload| payload.id == id) {
            (
                payload.source_window_label.clone(),
                payload.path.clone(),
                true,
            )
        } else {
            #[cfg(debug_assertions)]
            log_sidebar_drag(&format!(
                "screen drop using dragend fallback id={id} source_window_label={} path={fallback_path}",
                window.label()
            ));
            (window.label().to_string(), fallback_path, false)
        }
    };

    if drag_path.is_empty() {
        #[cfg(debug_assertions)]
        log_sidebar_drag(&format!("screen drop ignored: empty path id={id}"));
        return Ok(false);
    }

    for (label, target) in app.webview_windows() {
        if label == source_window_label {
            continue;
        }

        let scale_factor = target.scale_factor().unwrap_or(1.0);
        let Ok(inner_position) = target.inner_position() else {
            continue;
        };
        let Ok(inner_size) = target.inner_size() else {
            continue;
        };

        let left = inner_position.x as f64 / scale_factor;
        let top = inner_position.y as f64 / scale_factor;
        let width = inner_size.width as f64 / scale_factor;
        let height = inner_size.height as f64 / scale_factor;
        let in_window_y = screen_y >= top && screen_y <= top + height;
        let in_sidebar_x = screen_x >= left && screen_x <= left + sidebar_width.min(width);

        #[cfg(debug_assertions)]
        log_sidebar_drag(&format!(
            "screen drop hit-test label={label} screen=({screen_x:.1},{screen_y:.1}) bounds=({left:.1},{top:.1},{width:.1},{height:.1}) sidebar_width={sidebar_width:.1} in_sidebar_x={in_sidebar_x} in_window_y={in_window_y}"
        ));

        if in_sidebar_x && in_window_y {
            target
                .emit("sidebar-drag-import-path", vec![drag_path.clone()])
                .map_err(|err| err.to_string())?;
            if has_matching_state {
                let mut drag = state.0.lock().map_err(|err| err.to_string())?;
                if drag.as_ref().is_some_and(|payload| payload.id == id) {
                    *drag = None;
                }
            }
            #[cfg(debug_assertions)]
            log_sidebar_drag(&format!(
                "screen drop imported id={id} target_label={label} path={drag_path}"
            ));
            return Ok(true);
        }
    }

    #[cfg(debug_assertions)]
    log_sidebar_drag(&format!(
        "screen drop found no sidebar target id={id} screen=({screen_x:.1},{screen_y:.1})"
    ));
    Ok(false)
}

#[tauri::command]
fn open_paths_in_new_window(
    app: tauri::AppHandle,
    pending_files: tauri::State<'_, PendingFiles>,
    paths: Vec<String>,
) -> Result<(), String> {
    let paths: Vec<String> = paths
        .into_iter()
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty())
        .collect();

    if paths.is_empty() {
        return Ok(());
    }

    let label = format!("sequence-{}", uuid::Uuid::new_v4());
    {
        let mut pending = pending_files.0.lock().map_err(|err| err.to_string())?;
        pending.extend(paths);
    }

    WebviewWindowBuilder::new(&app, label, WebviewUrl::default())
        .title("GreenPeas")
        .inner_size(1200.0, 800.0)
        .min_inner_size(1500.0, 700.0)
        .focused(true)
        .build()
        .map_err(|err| err.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Phase 2: DB Initialization
            let app_handle = app.handle();
            let app_dir = app_handle
                .path()
                .resolve("", BaseDirectory::AppData)
                .expect("Failed to resolve app data dir");
            if !app_dir.exists() {
                std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
            }
            let pool = tauri::async_runtime::block_on(init_db(&app_dir))
                .expect("Failed to initialize database");
            app.manage(DbState(Arc::new(pool.clone())));

            // Initialize EnzymeStore from DB
            let compiled = tauri::async_runtime::block_on(crate::db::load_active_enzymes(&pool))
                .expect("Failed to load active enzymes");
            app.manage(Mutex::new(crate::utils::EnzymeStore::new(compiled)));

            let menu = Menu::with_items(
                app,
                &[
                    &Submenu::with_items(
                        app,
                        "File",
                        true,
                        &[
                            &MenuItem::with_id(
                                app,
                                "new",
                                "New Sequence",
                                true,
                                Some("CmdOrCtrl+N"),
                            )?,
                            &MenuItem::with_id(
                                app,
                                "open",
                                "Open Sequence...",
                                true,
                                Some("CmdOrCtrl+O"),
                            )?,
                            &MenuItem::with_id(
                                app,
                                "open_new_window",
                                "Open Sequence in New Window...",
                                true,
                                Some("CmdOrCtrl+Shift+O"),
                            )?,
                            &MenuItem::with_id(app, "save", "Save", true, Some("CmdOrCtrl+S"))?,
                            &PredefinedMenuItem::separator(app)?,
                            &MenuItem::with_id(
                                app,
                                "export_fasta",
                                "Export as FASTA...",
                                true,
                                None::<&str>,
                            )?,
                            &MenuItem::with_id(
                                app,
                                "export_gbk",
                                "Export as GenBank (.gbk)...",
                                true,
                                None::<&str>,
                            )?,
                            &PredefinedMenuItem::separator(app)?,
                            &PredefinedMenuItem::close_window(app, None)?,
                        ],
                    )?,
                    &Submenu::with_items(
                        app,
                        "Edit",
                        true,
                        &[
                            &MenuItem::with_id(app, "undo", "Undo", true, Some("CmdOrCtrl+Z"))?,
                            &MenuItem::with_id(
                                app,
                                "redo",
                                "Redo",
                                true,
                                Some("CmdOrCtrl+Shift+Z"),
                            )?,
                            &PredefinedMenuItem::separator(app)?,
                            &MenuItem::with_id(app, "cut", "Cut", true, Some("CmdOrCtrl+X"))?,
                            &MenuItem::with_id(app, "copy", "Copy", true, Some("CmdOrCtrl+C"))?,
                            &MenuItem::with_id(
                                app,
                                "copy_aa",
                                "Copy as Amino Acids",
                                true,
                                Some("CmdOrCtrl+Shift+C"),
                            )?,
                            &MenuItem::with_id(app, "paste", "Paste", true, Some("CmdOrCtrl+V"))?,
                            &MenuItem::with_id(
                                app,
                                "paste_rc",
                                "Paste as Reverse Complement",
                                true,
                                Some("CmdOrCtrl+Shift+V"),
                            )?,
                            &MenuItem::with_id(
                                app,
                                "delete",
                                "Delete Selection",
                                true,
                                Some("CmdOrCtrl+Backspace"),
                            )?,
                            &MenuItem::with_id(
                                app,
                                "select_all",
                                "Select All",
                                true,
                                Some("CmdOrCtrl+A"),
                            )?,
                            &PredefinedMenuItem::separator(app)?,
                            &MenuItem::with_id(
                                app,
                                "rc",
                                "Reverse Complement Whole",
                                true,
                                Some("CmdOrCtrl+R"),
                            )?,
                            &MenuItem::with_id(
                                app,
                                "search",
                                "Find...",
                                true,
                                Some("CmdOrCtrl+F"),
                            )?,
                        ],
                    )?,
                    &Submenu::with_items(
                        app,
                        "View",
                        true,
                        &[
                            &MenuItem::with_id(
                                app,
                                "view_sequence",
                                "Sequence View",
                                true,
                                Some("CmdOrCtrl+1"),
                            )?,
                            &MenuItem::with_id(
                                app,
                                "view_map",
                                "Circular Map",
                                true,
                                Some("CmdOrCtrl+2"),
                            )?,
                            &MenuItem::with_id(
                                app,
                                "view_alignment",
                                "Alignment mode",
                                true,
                                Some("CmdOrCtrl+3"),
                            )?,
                            &PredefinedMenuItem::separator(app)?,
                            &MenuItem::with_id(
                                app,
                                "toggle_dark_mode",
                                "Toggle Dark Mode",
                                true,
                                Some("CmdOrCtrl+T"),
                            )?,
                        ],
                    )?,
                    &Submenu::with_items(
                        app,
                        "Primers",
                        true,
                        &[&MenuItem::with_id(
                            app,
                            "register_primer",
                            "Register Primer...",
                            true,
                            Some("CmdOrCtrl+Shift+P"),
                        )?],
                    )?,
                    &Submenu::with_items(
                        app,
                        "Enzymes",
                        true,
                        &[
                            &MenuItem::with_id(
                                app,
                                "manage_enzymes",
                                "Manage Enzymes...",
                                true,
                                Some("CmdOrCtrl+E"),
                            )?,
                            &MenuItem::with_id(
                                app,
                                "register_enzyme",
                                "Register New Enzyme...",
                                true,
                                Some("CmdOrCtrl+Shift+E"),
                            )?,
                            &PredefinedMenuItem::separator(app)?,
                            &MenuItem::with_id(
                                app,
                                "import_enzymes",
                                "Import SnapGene List...",
                                true,
                                None::<&str>,
                            )?,
                        ],
                    )?,
                    &Submenu::with_items(
                        app,
                        "Window",
                        true,
                        &[
                            &PredefinedMenuItem::minimize(app, None)?,
                            &PredefinedMenuItem::maximize(app, None)?,
                        ],
                    )?,
                    &Submenu::with_items(
                        app,
                        "Help",
                        true,
                        &[&MenuItem::with_id(
                            app,
                            "about",
                            "About GreenPeas",
                            true,
                            None::<&str>,
                        )?],
                    )?,
                ],
            )?;
            app.set_menu(menu)?;

            // Check for file path in arguments (Startup)
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                let path = args[1].clone();
                if !path.starts_with('-') {
                    let state = app.state::<PendingFiles>();
                    state.0.lock().unwrap().push(path);
                }
            }

            app.on_menu_event(|window, event| match event.id.0.as_str() {
                "undo" => {
                    let _ = window.emit("menu-undo", ());
                }
                "redo" => {
                    let _ = window.emit("menu-redo", ());
                }
                "new" => {
                    let _ = window.emit("menu-new", ());
                }
                "open" => {
                    let _ = window.emit("menu-open", ());
                }
                "open_new_window" => {
                    let _ = window.emit("menu-open-new-window", ());
                }
                "save" => {
                    let _ = window.emit("menu-save", ());
                }
                "export_fasta" => {
                    let _ = window.emit("menu-export-fasta", ());
                }
                "export_gbk" => {
                    let _ = window.emit("menu-export-gbk", ());
                }
                "cut" => {
                    let _ = window.emit("menu-cut", ());
                }
                "copy" => {
                    let _ = window.emit("menu-copy", ());
                }
                "copy_aa" => {
                    let _ = window.emit("menu-copy-aa", ());
                }
                "paste" => {
                    let _ = window.emit("menu-paste", ());
                }
                "paste_rc" => {
                    let _ = window.emit("menu-paste-rc", ());
                }
                "delete" => {
                    let _ = window.emit("menu-delete", ());
                }
                "select_all" => {
                    let _ = window.emit("menu-select-all", ());
                }
                "rc" => {
                    let _ = window.emit("menu-rc", ());
                }
                "view_sequence" => {
                    let _ = window.emit("menu-view", "sequence");
                }
                "view_map" => {
                    let _ = window.emit("menu-view", "map");
                }
                "view_alignment" => {
                    let _ = window.emit("menu-view", "alignment");
                }
                "toggle_dark_mode" => {
                    let _ = window.emit("menu-toggle-dark-mode", ());
                }
                "manage_enzymes" => {
                    let _ = window.emit("menu-manage-enzymes", ());
                }
                "register_enzyme" => {
                    let _ = window.emit("menu-register-enzyme", ());
                }
                "import_enzymes" => {
                    let _ = window.emit("menu-import-enzymes", ());
                }
                "search" => {
                    let _ = window.emit("menu-search", ());
                }
                "register_primer" => {
                    let _ = window.emit("menu-register-primer", ());
                }
                "about" => {
                    let _ = window.emit("menu-about", ());
                }
                _ => {}
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_all_sequences,
            commands::translate_dna,
            commands::find_restriction_sites,
            commands::get_reverse_complement,
            commands::export_fasta,
            commands::export_gbk,
            commands::export_gp,
            commands::list_fasta_sequences,
            commands::read_import_text_file,
            commands::calculate_gc_content,
            commands::align_sequences,
            commands::get_trace_data,
            commands::search_sequence,
            commands::search_protein,
            commands::get_pending_files,
            commands::translate_annotations,
            commands::get_sequence_view_data,
            commands::analyze_primer,
            commands::reanalyze_primers,
            db::get_enzymes,
            db::get_enzyme_sets,
            db::create_enzyme_set,
            db::delete_enzyme_set,
            db::toggle_enzyme,
            db::add_enzyme,
            db::update_enzyme,
            db::delete_enzyme,
            db::refresh_enzymes,
            commands::apply_sequence_edit,
            commands::get_sequence_fragment,
            commands::get_sequence_fragment_binary,
            commands::open_sequence_session,
            commands::get_sequence_metadata,
            commands::upsert_sequence,
            domains::cloning::commands::copy_to_internal_clipboard,
            domains::cloning::commands::get_internal_fragment,
            domains::cloning::commands::assemble_fragments_cmd,
            domains::cloning::commands::get_fragment_from_selection,
            open_paths_in_new_window,
            begin_sidebar_drag,
            take_sidebar_drag_path,
            finish_sidebar_drag,
            drop_sidebar_drag_at_screen_position
        ])
        .manage(ClipboardStore::new())
        .manage(WorkspaceStore::new())
        .manage(SidebarDragStore(Mutex::new(None)))
        .manage(PendingFiles(Mutex::new(Vec::new())))
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { ref urls } = event {
                let state = app_handle.state::<PendingFiles>();
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        let path_str = path.to_string_lossy().into_owned();
                        state.0.lock().unwrap().push(path_str.clone());
                        let _ = app_handle.emit("file-opened", path_str);
                    }
                }
            }
            let _ = (app_handle, event);
        });
}
