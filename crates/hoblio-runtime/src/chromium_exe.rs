//! Resolve Chrome/Edge/Chromium like desktop RPA tools (standard install paths + override).

use std::path::{Path, PathBuf};

use anyhow::{Result, bail};

const CHROME_REL: &str = r"Google\Chrome\Application\chrome.exe";
const EDGE_REL: &str = r"Microsoft\Edge\Application\msedge.exe";

/// `HOBLIO_CHROME_PATH` overrides; otherwise probe common Windows install locations
/// (same idea as Power Automate Desktop “Iniciar novo Chrome”).
pub fn resolve_chromium_executable() -> Result<PathBuf> {
    if let Ok(raw) = std::env::var("HOBLIO_CHROME_PATH") {
        let path = PathBuf::from(&raw);
        if path.is_file() {
            return Ok(path);
        }
        bail!(
            "HOBLIO_CHROME_PATH is set but not a file: {}",
            path.display()
        );
    }

    for candidate in chromium_candidates() {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    bail!(
        "Chromium browser not found. Install Google Chrome or Microsoft Edge, \
         or set HOBLIO_CHROME_PATH to chrome.exe / msedge.exe"
    );
}

fn chromium_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    push_if_set(&mut out, std::env::var("ProgramFiles").ok(), CHROME_REL);
    push_if_set(&mut out, std::env::var("ProgramFiles").ok(), EDGE_REL);
    push_if_set(
        &mut out,
        std::env::var("ProgramFiles(x86)").ok(),
        CHROME_REL,
    );
    push_if_set(
        &mut out,
        std::env::var("ProgramFiles(x86)").ok(),
        EDGE_REL,
    );
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let base = PathBuf::from(local);
        for rel in [CHROME_REL, EDGE_REL] {
            let path = base.join(rel);
            if !out.contains(&path) {
                out.push(path);
            }
        }
    }
    out
}

fn push_if_set(out: &mut Vec<PathBuf>, root: Option<String>, rel: &str) {
    if let Some(root) = root {
        let path = Path::new(&root).join(rel);
        if !out.contains(&path) {
            out.push(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "requires Chrome or Edge installed"]
    fn resolves_chrome_or_edge_on_dev_machine() {
        let path = resolve_chromium_executable().expect("Chrome or Edge on PATH locations");
        assert!(path.is_file(), "{}", path.display());
    }
}
