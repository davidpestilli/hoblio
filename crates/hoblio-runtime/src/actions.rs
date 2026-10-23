use std::fs;
use std::path::Path;
use std::time::Duration;

use anyhow::{Context, Result};
use hoblio_model::ActionKind;

pub fn execute_action(action: &ActionKind) -> Result<String> {
    match action {
        ActionKind::Log(log) => {
            println!("{}", log.message);
            Ok(format!("log: {}", log.message))
        }
        ActionKind::NoOp => Ok("noop".into()),
        ActionKind::FileWrite { path, content } => file_write(path, content),
        ActionKind::HttpGet { url } => http_get(url),
        ActionKind::BrowserNavigate { url, wait_ms } => browser_navigate(url, *wait_ms),
    }
}

fn file_write(path: &str, content: &str) -> Result<String> {
    let path = Path::new(path);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .with_context(|| format!("create parent dirs for {}", path.display()))?;
        }
    }
    fs::write(path, content.as_bytes())
        .with_context(|| format!("write file {}", path.display()))?;
    Ok(format!("file_write: {} ({} bytes)", path.display(), content.len()))
}

fn http_get(url: &str) -> Result<String> {
    let response = reqwest::blocking::get(url).with_context(|| format!("GET {url}"))?;
    let status = response.status();
    let body = response
        .text()
        .with_context(|| format!("read body from GET {url}"))?;
    let preview: String = body.chars().take(120).collect();
    Ok(format!(
        "http_get: {url} -> {status} ({} bytes): {preview}{}",
        body.len(),
        if body.len() > 120 { "…" } else { "" }
    ))
}

fn browser_navigate(url: &str, wait_ms: Option<u64>) -> Result<String> {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .context("create tokio runtime for browser")?
        .block_on(async { browser_navigate_async(url, wait_ms).await })
}

async fn browser_navigate_async(url: &str, wait_ms: Option<u64>) -> Result<String> {
    use chromiumoxide::browser::{Browser, BrowserConfig};
    use futures::StreamExt;

    let mut cfg = BrowserConfig::builder();
    if let Ok(path) = std::env::var("HOBLIO_CHROME_PATH") {
        cfg = cfg.chrome_executable(path);
    }
    let (mut browser, mut handler) = Browser::launch(cfg.build().map_err(|e| {
        anyhow::anyhow!("launch Chromium (install Chrome/Chromium or set HOBLIO_CHROME_PATH): {e}")
    })?)
    .await
    .context("start Chromium for CDP")?;

    let handle = tokio::spawn(async move {
        while let Some(h) = handler.next().await {
            if h.is_err() {
                break;
            }
        }
    });

    let page = browser
        .new_page(url)
        .await
        .with_context(|| format!("navigate to {url}"))?;

    if let Some(ms) = wait_ms {
        tokio::time::sleep(Duration::from_millis(ms)).await;
    }

    let title = page.get_title().await.unwrap_or_default();
    browser.close().await.ok();
    handle.abort();

    Ok(format!(
        "browser_navigate: {url} (title={:?})",
        title.unwrap_or_default()
    ))
}
