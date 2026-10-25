//! 学習メモ: パス検証、配列正規化、逆相補鎖、制限酵素検索準備などバックエンド共通処理を提供する。
//! 処理の位置づけ: Tauriコマンドまたはバックエンド内部から利用され、結果をフロントエンド側へ返す。

use aho_corasick::AhoCorasick;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EnzymeDefinition {
    pub name: String,
    pub site: String,
    pub cut: i32,
    pub overhang_type: Option<String>,
    pub methylation_sensitivity: Option<bool>,
}

pub struct CompiledEnzyme {
    pub name: String,
    pub site: String,
    pub cut_top: i32,
    pub cut_bottom: i32,
    pub methylation_sensitivity: Option<String>,
}

pub struct EnzymeSearchEngine {
    pub ac: AhoCorasick,
    pub pattern_id_to_enzyme_idx: Vec<usize>,
}

pub struct EnzymeStore {
    pub enzymes: Vec<CompiledEnzyme>,
    pub engine: EnzymeSearchEngine,
}

impl EnzymeStore {
    pub fn new(enzymes: Vec<CompiledEnzyme>) -> Self {
        let engine = compile_search_engine(&enzymes);
        Self { enzymes, engine }
    }
}

pub fn clean_sequence(sequence: &str) -> String {
    sequence
        .bytes()
        .filter_map(|b| {
            let upper = b.to_ascii_uppercase();
            if b"ATCGNRYWSKMBDHV".contains(&upper) {
                Some(upper as char)
            } else {
                None
            }
        })
        .collect()
}

pub fn get_reverse_complement(sequence: &str) -> String {
    sequence
        .chars()
        .rev()
        .map(|c| match c.to_ascii_uppercase() {
            'A' => 'T',
            'T' => 'A',
            'C' => 'G',
            'G' => 'C',
            'N' => 'N',
            'R' => 'Y',
            'Y' => 'R',
            'M' => 'K',
            'K' => 'M',
            'S' => 'S',
            'W' => 'W',
            'H' => 'D',
            'D' => 'H',
            'B' => 'V',
            'V' => 'B',
            _ => c,
        })
        .collect()
}

/// Writes a complete replacement beside the destination and only publishes it
/// after the writer and filesystem flush have succeeded.
pub fn atomic_write<F>(path: &Path, writer: F) -> Result<(), crate::error::AppError>
where
    F: FnOnce(&mut std::fs::File) -> Result<(), crate::error::AppError>,
{
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| crate::error::AppError::Generic("Invalid output file name".to_string()))?;
    let existing_permissions = std::fs::metadata(path).ok().map(|meta| meta.permissions());

    let mut temporary_path = None;
    let mut temporary_file = None;
    for _ in 0..100 {
        let counter = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(
            ".{file_name}.greenpeas-{}-{counter}.tmp",
            std::process::id()
        ));
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => {
                temporary_path = Some(candidate);
                temporary_file = Some(file);
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }

    let temporary_path = temporary_path.ok_or_else(|| {
        crate::error::AppError::Generic("Could not allocate a temporary save file".to_string())
    })?;
    let mut cleanup = TemporaryFileCleanup(Some(temporary_path.clone()));
    let mut file = temporary_file.expect("temporary path and file are created together");

    writer(&mut file)?;
    file.flush()?;
    file.sync_all()?;
    drop(file);

    if let Some(permissions) = existing_permissions {
        std::fs::set_permissions(&temporary_path, permissions)?;
    }

    replace_file(&temporary_path, path)?;
    cleanup.0 = None;

    #[cfg(unix)]
    if let Ok(directory) = std::fs::File::open(parent) {
        let _ = directory.sync_all();
    }

    Ok(())
}

#[cfg(not(windows))]
fn replace_file(temporary_path: &Path, destination: &Path) -> std::io::Result<()> {
    std::fs::rename(temporary_path, destination)
}

#[cfg(windows)]
fn replace_file(temporary_path: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "Kernel32")]
    extern "system" {
        fn ReplaceFileW(
            replaced: *const u16,
            replacement: *const u16,
            backup: *const u16,
            flags: u32,
            exclude: *mut std::ffi::c_void,
            reserved: *mut std::ffi::c_void,
        ) -> i32;
    }

    if !destination.exists() {
        return std::fs::rename(temporary_path, destination);
    }

    let backup = destination.with_file_name(format!(
        ".{}.greenpeas-backup-{}-{}.tmp",
        destination.file_name().unwrap().to_string_lossy(),
        std::process::id(),
        TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let wide =
        |path: &Path| -> Vec<u16> { path.as_os_str().encode_wide().chain(Some(0)).collect() };
    let destination_wide = wide(destination);
    let temporary_wide = wide(temporary_path);
    let backup_wide = wide(&backup);
    // ReplaceFileW publishes the new file in one operation and keeps a recovery copy.
    let replaced = unsafe {
        ReplaceFileW(
            destination_wide.as_ptr(),
            temporary_wide.as_ptr(),
            backup_wide.as_ptr(),
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if replaced != 0 {
        let _ = std::fs::remove_file(backup);
        return Ok(());
    }

    let error = std::io::Error::last_os_error();
    if !destination.exists() && backup.exists() {
        std::fs::rename(&backup, destination)?;
    }
    Err(error)
}

struct TemporaryFileCleanup(Option<PathBuf>);

impl Drop for TemporaryFileCleanup {
    fn drop(&mut self) {
        if let Some(path) = self.0.take() {
            let _ = std::fs::remove_file(path);
        }
    }
}

pub fn normalize_user_path(path: &str) -> PathBuf {
    let trimmed = path.trim();
    let without_scheme = trimmed.strip_prefix("file://").unwrap_or(trimmed);
    #[cfg(target_os = "windows")]
    let normalized = without_scheme.strip_prefix('/').unwrap_or(without_scheme);
    #[cfg(not(target_os = "windows"))]
    let normalized = without_scheme;
    PathBuf::from(normalized)
}

fn is_allowed_root(path: &Path) -> bool {
    let cwd = std::env::current_dir().ok();
    #[cfg(windows)]
    let home = std::env::var_os("USERPROFILE").map(PathBuf::from);
    #[cfg(not(windows))]
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let mut roots: Vec<PathBuf> = Vec::new();

    if let Some(c) = cwd {
        roots.push(std::fs::canonicalize(&c).unwrap_or(c));
    }
    if let Some(h) = home {
        roots.push(std::fs::canonicalize(&h).unwrap_or(h));
    }
    if let Ok(temp) = std::fs::canonicalize(std::env::temp_dir()) {
        roots.push(temp);
    }
    #[cfg(target_os = "macos")]
    {
        roots.push(PathBuf::from("/private/tmp"));
        roots.push(PathBuf::from("/private/var/folders"));
        roots.push(PathBuf::from("/Volumes"));
    }

    roots.iter().any(|root| path.starts_with(root))
}

fn validate_path_extension(
    path: &Path,
    allowed_exts: &[&str],
) -> Result<(), crate::error::AppError> {
    if allowed_exts.is_empty() {
        return Ok(());
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .ok_or_else(|| crate::error::AppError::Generic("Missing file extension".to_string()))?;
    let ok = allowed_exts.iter().any(|a| ext == a.to_ascii_lowercase());
    if ok {
        Ok(())
    } else {
        Err(crate::error::AppError::Generic(format!(
            "Unsupported file extension: .{}",
            ext
        )))
    }
}

pub fn resolve_readable_file(
    path: &str,
    allowed_exts: &[&str],
) -> Result<PathBuf, crate::error::AppError> {
    let normalized = normalize_user_path(path);
    validate_path_extension(&normalized, allowed_exts)?;

    let meta = std::fs::symlink_metadata(&normalized)?;
    if meta.file_type().is_symlink() {
        return Err(crate::error::AppError::Generic(
            "Symlink paths are not allowed".to_string(),
        ));
    }
    if !meta.is_file() {
        return Err(crate::error::AppError::Generic(
            "Path is not a regular file".to_string(),
        ));
    }

    let canonical = std::fs::canonicalize(&normalized)?;
    if !is_allowed_root(&canonical) {
        return Err(crate::error::AppError::Generic(
            "Path is outside allowed directories".to_string(),
        ));
    }
    Ok(canonical)
}

pub fn resolve_writable_file(
    path: &str,
    allowed_exts: &[&str],
) -> Result<PathBuf, crate::error::AppError> {
    let normalized = normalize_user_path(path);
    validate_path_extension(&normalized, allowed_exts)?;

    if normalized.exists() {
        let meta = std::fs::symlink_metadata(&normalized)?;
        if meta.file_type().is_symlink() {
            return Err(crate::error::AppError::Generic(
                "Symlink paths are not allowed".to_string(),
            ));
        }
    }

    let parent = normalized.parent().unwrap_or_else(|| Path::new("."));
    let parent_canonical = std::fs::canonicalize(parent)?;
    if !is_allowed_root(&parent_canonical) {
        return Err(crate::error::AppError::Generic(
            "Write path is outside allowed directories".to_string(),
        ));
    }
    Ok(normalized)
}

pub fn fix_localized_date(content: String) -> String {
    let months = [
        ("-1月-", "-JAN-"),
        ("-2月-", "-FEB-"),
        ("-3月-", "-MAR-"),
        ("-4月-", "-APR-"),
        ("-5月-", "-MAY-"),
        ("-6月-", "-JUN-"),
        ("-7月-", "-JUL-"),
        ("-8月-", "-AUG-"),
        ("-9月-", "-SEP-"),
        ("-10月-", "-OCT-"),
        ("-11月-", "-NOV-"),
        ("-12月-", "-DEC-"),
    ];

    content
        .lines()
        .map(|line| {
            if line.starts_with("LOCUS") {
                let mut fixed = line.to_string();
                for (jp, en) in &months {
                    fixed = fixed.replace(jp, en);
                }
                fixed
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn compile_enzyme(
    name: String,
    site: String,
    cut_top: i32,
    cut_bottom: i32,
    methylation_sensitivity: Option<String>,
) -> CompiledEnzyme {
    let site_upper = site.to_uppercase();

    CompiledEnzyme {
        name,
        site: site_upper,
        cut_top,
        cut_bottom,
        methylation_sensitivity,
    }
}

pub fn calculate_cuts(site: &str, cut: i32) -> (i32, i32) {
    let site_upper = site.to_uppercase();
    let mut actual_len = 0;
    let mut in_bracket = false;
    let mut in_brace = false;
    for c in site_upper.chars() {
        if c == '[' {
            in_bracket = true;
        } else if c == ']' {
            in_bracket = false;
            actual_len += 1;
        } else if c == '{' {
            in_brace = true;
        } else if c == '}' {
            in_brace = false;
        } else if !in_bracket && !in_brace {
            actual_len += 1;
        }
    }
    (cut, actual_len - cut)
}

pub fn compile_search_engine(enzymes: &[CompiledEnzyme]) -> EnzymeSearchEngine {
    let mut all_patterns = Vec::new();
    let mut mapping = Vec::new();

    for (idx, enzyme) in enzymes.iter().enumerate() {
        let expanded = expand_degenerate_site(&enzyme.site);
        for p in expanded {
            all_patterns.push(p);
            mapping.push(idx);
        }
    }

    let ac = AhoCorasick::builder()
        .ascii_case_insensitive(true)
        .build(&all_patterns)
        .unwrap();
    EnzymeSearchEngine {
        ac,
        pattern_id_to_enzyme_idx: mapping,
    }
}

fn expand_degenerate_site(site: &str) -> Vec<String> {
    let mut results = vec!["".to_string()];

    // Normalize regex-style patterns to single letters if possible for expansion
    // e.g. [AC] -> M, [AG] -> R, etc.
    // For simplicity, we handle both raw letters and simple [ATCG] sets
    let normalized = site
        .replace("[AG]", "R")
        .replace("[CT]", "Y")
        .replace("[AC]", "M")
        .replace("[GT]", "K")
        .replace("[GC]", "S")
        .replace("[AT]", "W")
        .replace("[ACT]", "H")
        .replace("[CGT]", "B")
        .replace("[ACG]", "V")
        .replace("[AGT]", "D")
        .replace("[ATCG]", "N");

    // Handle {n} notation by repeating the previous character/group
    let mut expanded_site = String::new();
    let mut i = 0;
    let chars: Vec<char> = normalized.chars().collect();
    while i < chars.len() {
        if i + 2 < chars.len() && chars[i + 1] == '{' {
            let end_bracket = chars[i..].iter().position(|&c| c == '}');
            if let Some(eb) = end_bracket {
                let count_str: String = chars[i + 2..i + eb].iter().collect();
                if let Ok(count) = count_str.parse::<usize>() {
                    let base = chars[i];
                    for _ in 0..count {
                        expanded_site.push(base);
                    }
                    i += eb + 1;
                    continue;
                }
            }
        }
        expanded_site.push(chars[i]);
        i += 1;
    }

    for c in expanded_site.chars() {
        let choices = match c {
            'A' => "A",
            'T' => "T",
            'C' => "C",
            'G' => "G",
            'R' => "AG",
            'Y' => "CT",
            'M' => "AC",
            'K' => "GT",
            'S' => "GC",
            'W' => "AT",
            'H' => "ACT",
            'B' => "CGT",
            'V' => "ACG",
            'D' => "AGT",
            'N' => "ATCG",
            _ => "",
        };

        if choices.is_empty() {
            continue;
        }

        let mut next_results = Vec::new();
        for res in results {
            for choice in choices.chars() {
                next_results.push(format!("{}{}", res, choice));
            }
        }
        results = next_results;
        if results.len() > 8192 {
            break;
        } // Safety limit
    }
    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_sequence() {
        assert_eq!(clean_sequence("atcg 123 \n"), "ATCG");
        assert_eq!(clean_sequence("G A T C"), "GATC");
        assert_eq!(clean_sequence("RYWSKM"), "RYWSKM");
    }

    #[test]
    fn test_reverse_complement() {
        assert_eq!(get_reverse_complement("GAATTC"), "GAATTC"); // EcoRI is palindromic
        assert_eq!(get_reverse_complement("GATCC"), "GGATC");
        assert_eq!(get_reverse_complement("RY"), "RY"); // R->Y, Y->R
    }

    #[test]
    fn test_expand_degenerate_site() {
        let expanded = expand_degenerate_site("RG");
        assert!(expanded.contains(&"AG".to_string()));
        assert!(expanded.contains(&"GG".to_string()));
        assert_eq!(expanded.len(), 2);

        let repeat = expand_degenerate_site("A{3}");
        assert_eq!(repeat, vec!["AAA".to_string()]);

        let mix = expand_degenerate_site("A{2}R");
        assert_eq!(mix.len(), 2);
        assert!(mix.contains(&"AAA".to_string()));
        assert!(mix.contains(&"AAG".to_string()));
    }

    #[test]
    fn test_normalize_user_path_file_scheme() {
        let p = normalize_user_path("file:///tmp/test.gp");
        assert!(p.to_string_lossy().contains("/tmp/test.gp"));
    }

    #[test]
    fn atomic_write_replaces_a_complete_file() {
        let path = std::env::temp_dir().join(format!(
            "greenpeas-atomic-success-{}.txt",
            std::process::id()
        ));
        std::fs::write(&path, "original").unwrap();

        atomic_write(&path, |file| {
            file.write_all(b"replacement")?;
            Ok(())
        })
        .unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "replacement");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn atomic_write_preserves_original_when_writer_fails() {
        let path = std::env::temp_dir().join(format!(
            "greenpeas-atomic-failure-{}.txt",
            std::process::id()
        ));
        std::fs::write(&path, "original").unwrap();

        let result = atomic_write(&path, |file| {
            file.write_all(b"partial")?;
            Err(crate::error::AppError::Generic(
                "simulated write failure".to_string(),
            ))
        });

        assert!(result.is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "original");
        let _ = std::fs::remove_file(path);
    }
}
