use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};

pub fn resolve_project_path(path: &str, project_root: Option<&Path>) -> PathBuf {
    let path = Path::new(path);
    if path.is_relative() {
        project_root
            .map(|root| root.join(path))
            .unwrap_or_else(|| path.to_path_buf())
    } else {
        path.to_path_buf()
    }
}

pub fn ensure_parent(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .with_context(|| format!("create parent dirs for {}", path.display()))?;
        }
    }
    Ok(())
}

pub fn file_write(path: &str, content: &str, project_root: Option<&Path>) -> Result<String> {
    let path = resolve_project_path(path, project_root);
    ensure_parent(path.as_path())?;
    fs::write(path.as_path(), content.as_bytes())
        .with_context(|| format!("write file {}", path.display()))?;
    Ok(format!(
        "file_write: {} ({} bytes)",
        path.display(),
        content.len()
    ))
}

pub fn file_append(path: &str, content: &str, project_root: Option<&Path>) -> Result<String> {
    let path = resolve_project_path(path, project_root);
    ensure_parent(path.as_path())?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path.as_path())
        .with_context(|| format!("open for append {}", path.display()))?;
    file.write_all(content.as_bytes())
        .with_context(|| format!("append to {}", path.display()))?;
    Ok(format!(
        "file_append: {} (+{} bytes)",
        path.display(),
        content.len()
    ))
}

pub fn file_read(path: &str, project_root: Option<&Path>) -> Result<String> {
    let path = resolve_project_path(path, project_root);
    let bytes = fs::read(path.as_path()).with_context(|| format!("read file {}", path.display()))?;
    String::from_utf8(bytes).with_context(|| format!("file {} is not valid UTF-8", path.display()))
}

pub fn file_read_into_variable(
    path_template: &str,
    variable: &str,
    vars: &mut crate::variables::RunVariables,
    project_root: Option<&Path>,
) -> Result<String> {
    let name = variable.trim();
    if name.is_empty() {
        bail!("file_read: variable name is empty");
    }
    let path = crate::variables::interpolate(path_template, vars)?;
    let content = file_read(&path, project_root)?;
    let len = content.len();
    vars.insert(name.to_string(), content);
    Ok(format!("file_read: `{name}` ({len} bytes)"))
}
