use super::{model::ExtensionCli, skill_repository};
use cli_manager_agent_capabilities::{discovery_layout, AgentKind};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeSet, fs, path::Path};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SkillInventory {
    entries: Vec<InventoryEntry>,
    warnings: Vec<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InventoryEntry {
    cli: ExtensionCli,
    name: String,
    path: String,
    source_kind: String,
    status: String,
    link_target: Option<String>,
    import_path: Option<String>,
    managed: bool,
}

// Read-only discovery uses the same user roots as session diagnostics; no active session is needed.
pub(crate) async fn inspect() -> Result<SkillInventory, String> {
    let home = crate::provider::home::active()?;
    let records = skill_repository::list_installations().await?;
    let mut inventory = SkillInventory {
        entries: Vec::new(),
        warnings: Vec::new(),
    };
    for (cli, agent, root) in [
        (
            ExtensionCli::Claude,
            AgentKind::Claude,
            &home.targets.claude_config_dir,
        ),
        (
            ExtensionCli::Codex,
            AgentKind::Codex,
            &home.targets.codex_config_dir,
        ),
        (
            ExtensionCli::Grok,
            AgentKind::Grok,
            &home.targets.grok_config_dir,
        ),
    ] {
        let layout = discovery_layout(
            agent,
            Path::new(&home.home_path),
            Path::new(&home.home_path),
            Some(Path::new(root)),
        );
        for root in layout.skill_roots.into_iter().filter(|r| r.scope == "user") {
            let mut found = Vec::new();
            let scan = if home.identity.environment_kind == "wsl" {
                scan_wsl(
                    &root.path.to_string_lossy(),
                    &home.identity.environment_id,
                    cli,
                    root.source_kind,
                )
                .and_then(|(entries, limited)| {
                    found = entries;
                    if limited {
                        Err("extensions_inventory_limit".into())
                    } else {
                        Ok(())
                    }
                })
            } else {
                scan_local(
                    &root.path,
                    cli,
                    root.source_kind,
                    0,
                    &mut BTreeSet::new(),
                    &mut found,
                )
            };
            if let Err(code) = scan {
                inventory
                    .warnings
                    .push(format!("{}: {} ({code})", cli.key(), root.path.display()));
            }
            for entry in &mut found {
                entry.managed = records.iter().any(|r| {
                    r.cli == cli
                        && r.environment_kind == home.identity.environment_kind
                        && r.environment_id == home.identity.environment_id
                        && same_path(&r.target_path.to_string_lossy(), &entry.path)
                });
            }
            inventory.entries.extend(found);
        }
    }
    inventory.entries.sort_by(|a, b| {
        a.cli
            .cmp(&b.cli)
            .then(a.name.cmp(&b.name))
            .then(a.path.cmp(&b.path))
    });
    inventory
        .entries
        .dedup_by(|a, b| a.cli == b.cli && same_path(&a.path, &b.path));
    Ok(inventory)
}

fn same_path(a: &str, b: &str) -> bool {
    #[cfg(windows)]
    {
        a.replace('/', "\\")
            .eq_ignore_ascii_case(&b.replace('/', "\\"))
    }
    #[cfg(not(windows))]
    {
        a == b
    }
}

fn is_link(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}

const MAX_INVENTORY_DEPTH: usize = 8;
const MAX_INVENTORY_ENTRIES: usize = 500;
const MAX_INVENTORY_PATHS: usize = 10_000;

struct ScanBudget<'a> {
    examined: usize,
    depth_limited: bool,
    visited: &'a mut BTreeSet<std::path::PathBuf>,
}

// Preserve partial warnings without letting a depth cutoff suppress bounded sibling discovery.
fn scan_local(
    path: &Path,
    cli: ExtensionCli,
    kind: &str,
    depth: usize,
    visited: &mut BTreeSet<std::path::PathBuf>,
    output: &mut Vec<InventoryEntry>,
) -> Result<(), String> {
    let mut budget = ScanBudget {
        examined: 0,
        depth_limited: false,
        visited,
    };
    scan_local_bounded(path, cli, kind, depth, &mut budget, output)?;
    if budget.depth_limited {
        Err("extensions_inventory_limit".into())
    } else {
        Ok(())
    }
}

// Entry/path limits stop the root; depth only truncates a branch. Never recurse into links.
fn scan_local_bounded(
    path: &Path,
    cli: ExtensionCli,
    kind: &str,
    depth: usize,
    budget: &mut ScanBudget<'_>,
    output: &mut Vec<InventoryEntry>,
) -> Result<(), String> {
    if output.len() >= MAX_INVENTORY_ENTRIES || budget.examined >= MAX_INVENTORY_PATHS {
        return Err("extensions_inventory_limit".into());
    }
    budget.examined += 1;
    let metadata = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && depth == 0 => return Ok(()),
        Err(_) => return Err("extensions_inventory_unreadable".into()),
    };
    let link = is_link(&metadata);
    if !metadata.is_dir() && !link {
        return Ok(());
    }
    if depth > MAX_INVENTORY_DEPTH {
        budget.depth_limited = true;
        return Ok(());
    }
    let resolved = fs::canonicalize(path).ok();
    let manifest = path.join("SKILL.md").is_file();
    if manifest || link {
        output.push(InventoryEntry {
            cli,
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            path: path.to_string_lossy().into_owned(),
            source_kind: if path.components().any(|p| p.as_os_str() == ".system") {
                "builtin".into()
            } else {
                kind.into()
            },
            status: if manifest {
                "present"
            } else if resolved.is_none() {
                "missing"
            } else {
                "unscanned"
            }
            .into(),
            link_target: if link {
                resolved.as_ref().map(|p| p.to_string_lossy().into_owned())
            } else {
                None
            },
            import_path: if manifest {
                resolved.as_ref().map(|p| p.to_string_lossy().into_owned())
            } else {
                None
            },
            managed: false,
        });
        return Ok(());
    }
    if let Some(resolved) = resolved {
        if !budget.visited.insert(resolved) {
            return Ok(());
        }
    }
    for entry in fs::read_dir(path).map_err(|_| "extensions_inventory_unreadable")? {
        let entry = entry.map_err(|_| "extensions_inventory_unreadable")?;
        scan_local_bounded(&entry.path(), cli, kind, depth + 1, budget, output)?;
    }
    Ok(())
}

#[derive(Deserialize)]
struct WslInventory {
    entries: Vec<InventoryEntry>,
    limited: bool,
}

// All WSL traversal runs inside the selected distro, with bounded output and no installation scripts.
fn scan_wsl(
    path: &str,
    distro: &str,
    cli: ExtensionCli,
    kind: &str,
) -> Result<(Vec<InventoryEntry>, bool), String> {
    let linux = crate::wsl::parse_wsl_unc_path(path)
        .map(|(_, p)| p)
        .unwrap_or_else(|| path.replace('\\', "/"));
    let executable = crate::wsl::find_wsl_exe().ok_or("extensions_wsl_unavailable")?;
    let mut command = crate::shell_resolver::silent_command(executable.to_string_lossy().as_ref());
    command.args([
        "-d",
        distro,
        "--exec",
        "python3",
        "-c",
        WSL_SCAN,
        &linux,
        cli.key(),
        kind,
    ]);
    let output = crate::shell_resolver::output_with_timeout_bounded(
        command,
        std::time::Duration::from_secs(15),
        1024 * 1024,
    )
    .map_err(|_| "extensions_inventory_unreadable")?;
    if !output.status.success() {
        return Err("extensions_inventory_unreadable".into());
    }
    let mut inventory: WslInventory =
        serde_json::from_slice(&output.stdout).map_err(|_| "extensions_inventory_invalid")?;
    for entry in &mut inventory.entries {
        entry.path = crate::wsl::linux_to_unc_wsl_path(&entry.path, distro);
        entry.import_path = entry
            .import_path
            .as_ref()
            .map(|p| crate::wsl::linux_to_unc_wsl_path(p, distro));
    }
    Ok((inventory.entries, inventory.limited))
}

const WSL_SCAN: &str = r#"
import os, sys, json
root, cli, kind = sys.argv[1:]
result = []
MAX_INVENTORY_DEPTH = 8
MAX_INVENTORY_ENTRIES = 500
MAX_INVENTORY_PATHS = 10000
examined = 0
limited = False
stopped = False

def visit(path, depth):
    global examined, limited, stopped
    if len(result) >= MAX_INVENTORY_ENTRIES or examined >= MAX_INVENTORY_PATHS:
        limited = stopped = True
        return
    examined += 1
    if not os.path.lexists(path):
        if depth == 0: return
        raise FileNotFoundError(path)
    linked = os.path.islink(path)
    if not os.path.isdir(path) and not linked: return
    if depth > MAX_INVENTORY_DEPTH:
        limited = True
        return
    manifest = os.path.isfile(os.path.join(path, 'SKILL.md'))
    if manifest or linked:
        result.append(dict(cli=cli, name=os.path.basename(path), path=path,
            sourceKind='builtin' if '.system' in path.split('/') else kind,
            status='present' if manifest else ('missing' if not os.path.exists(path) else 'unscanned'),
            linkTarget=os.path.realpath(path) if linked else None,
            importPath=os.path.realpath(path) if manifest else None, managed=False))
        return
    for name in sorted(os.listdir(path)):
        visit(os.path.join(path, name), depth + 1)
        if stopped: break
visit(root, 0)
print(json.dumps(dict(entries=result, limited=limited)))
"#;

#[cfg(test)]
#[path = "inventory_tests.rs"]
mod tests;
