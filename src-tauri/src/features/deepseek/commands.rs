use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepSeekSourceInfo {
    entry_path: String,
    version: String,
}

/// Inspect only the selected official source tree and its existing build artifacts.
fn inspect_source(root: &Path) -> Result<DeepSeekSourceInfo, String> {
    if !root.is_absolute() {
        return Err("deepseek_source_invalid".into());
    }
    let root = root.canonicalize().map_err(|_| "deepseek_source_invalid")?;
    let package_path = root.join("package.json");
    let size = package_path
        .metadata()
        .map_err(|_| "deepseek_source_invalid")?
        .len();
    if size > 64 * 1024 {
        return Err("deepseek_source_invalid".into());
    }
    let manifest: serde_json::Value = serde_json::from_slice(
        &std::fs::read(package_path).map_err(|_| "deepseek_source_invalid")?,
    )
    .map_err(|_| "deepseek_source_invalid")?;
    if manifest.get("name").and_then(|value| value.as_str()) != Some("@deepseek-ai/dsh-root") {
        return Err("deepseek_source_invalid".into());
    }
    let entry = root.join("apps/cli/lib/bin.js");
    if !entry.is_file()
        || !root.join("node_modules").is_dir()
        || !root.join("apps/web/dist/index.html").is_file()
    {
        return Err("deepseek_source_unbuilt".into());
    }
    Ok(DeepSeekSourceInfo {
        entry_path: entry.to_string_lossy().into_owned(),
        version: manifest
            .get("version")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_owned(),
    })
}

/// Validate a user-selected source directory without installing, building, or running its code.
#[tauri::command]
pub async fn deepseek_web_validate_source(
    source_root: String,
) -> Result<DeepSeekSourceInfo, String> {
    let path = PathBuf::from(source_root);
    tauri::async_runtime::spawn_blocking(move || inspect_source(&path))
        .await
        .map_err(|_| "deepseek_source_invalid".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn source_preflight_requires_official_manifest_and_built_web_entry() {
        let root =
            std::env::temp_dir().join(format!("cli-manager-deepseek-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("package.json"), r#"{"name":"other"}"#).unwrap();
        assert_eq!(
            inspect_source(&root).unwrap_err(),
            "deepseek_source_invalid"
        );
        fs::write(
            root.join("package.json"),
            r#"{"name":"@deepseek-ai/dsh-root","version":"0.1.7-rc.2"}"#,
        )
        .unwrap();
        assert_eq!(
            inspect_source(&root).unwrap_err(),
            "deepseek_source_unbuilt"
        );
        fs::create_dir_all(root.join("apps/cli/lib")).unwrap();
        fs::create_dir_all(root.join("apps/web/dist")).unwrap();
        fs::create_dir_all(root.join("node_modules")).unwrap();
        fs::write(root.join("apps/cli/lib/bin.js"), "// fixture").unwrap();
        fs::write(root.join("apps/web/dist/index.html"), "<!doctype html>").unwrap();
        let info = inspect_source(&root).unwrap();
        assert_eq!(info.version, "0.1.7-rc.2");
        assert!(info.entry_path.ends_with("bin.js"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn relative_and_oversized_source_documents_are_rejected() {
        assert_eq!(
            inspect_source(Path::new("relative")).unwrap_err(),
            "deepseek_source_invalid"
        );
        let root =
            std::env::temp_dir().join(format!("cli-manager-deepseek-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("package.json"), vec![b' '; 65537]).unwrap();
        assert_eq!(
            inspect_source(&root).unwrap_err(),
            "deepseek_source_invalid"
        );
        fs::remove_dir_all(root).unwrap();
    }
}

#[cfg(test)]
#[path = "pty_tests.rs"]
mod pty_tests;
