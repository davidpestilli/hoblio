//! Shared Chromium CDP session for a single flow run (opened by `browser_navigate`).

use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::page::Page;
use futures::StreamExt;
use tokio::runtime::Runtime;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

const DEFAULT_TIMEOUT_MS: u64 = 10_000;

struct SessionInner {
    browser: Browser,
    _handler: JoinHandle<()>,
    page: Page,
}

pub struct BrowserContext {
    rt: Runtime,
    inner: Arc<Mutex<Option<SessionInner>>>,
}

impl BrowserContext {
    pub fn new() -> Result<Self> {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .context("create tokio runtime for browser")?;
        Ok(Self {
            rt,
            inner: Arc::new(Mutex::new(None)),
        })
    }

    pub fn shutdown(&mut self) {
        let inner = self.inner.clone();
        self.rt.block_on(async move {
            if let Some(mut session) = inner.lock().await.take() {
                session.browser.close().await.ok();
                session._handler.abort();
            }
        });
    }

    pub fn navigate(&self, url: &str, wait_ms: Option<u64>) -> Result<String> {
        let url = url.to_string();
        self.rt.block_on(async {
            let mut guard = self.inner.lock().await;
            if guard.is_none() {
                *guard = Some(launch_session(&url).await?);
            } else {
                let session = guard.as_mut().expect("session");
                session
                    .page
                    .goto(&url)
                    .await
                    .with_context(|| format!("navigate to {url}"))?;
            }
            let session = guard.as_ref().expect("session");
            if let Some(ms) = wait_ms {
                tokio::time::sleep(Duration::from_millis(ms)).await;
            }
            let title = session.page.get_title().await.unwrap_or_default();
            Ok(format!(
                "browser_navigate: {url} (title={:?})",
                title.unwrap_or_default()
            ))
        })
    }

    pub fn click(&self, selector: &str, timeout_ms: Option<u64>) -> Result<String> {
        let selector = selector.to_string();
        let timeout = timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS);
        self.rt.block_on(async {
            let page = self.require_page().await?;
            let element = wait_for_selector(&page, &selector, timeout).await?;
            element.click().await.context("click element")?;
            Ok(format!("browser_click: {selector}"))
        })
    }

    pub fn fill(&self, selector: &str, text: &str, timeout_ms: Option<u64>) -> Result<String> {
        let selector = selector.to_string();
        let text = text.to_string();
        let timeout = timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS);
        self.rt.block_on(async {
            let page = self.require_page().await?;
            let element = wait_for_selector(&page, &selector, timeout).await?;
            element.click().await.context("focus for fill")?;
            clear_element_value(&element).await?;
            element.type_str(&text).await.context("type into element")?;
            Ok(format!(
                "browser_fill: {selector} ({} chars)",
                text.len()
            ))
        })
    }

    pub fn wait_for(&self, selector: &str, timeout_ms: Option<u64>) -> Result<String> {
        let selector = selector.to_string();
        let timeout = timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS);
        self.rt.block_on(async {
            let page = self.require_page().await?;
            wait_for_selector(&page, &selector, timeout).await?;
            Ok(format!("browser_wait_for: {selector}"))
        })
    }

    pub fn get_text(
        &self,
        selector: &str,
        timeout_ms: Option<u64>,
        variable: Option<&str>,
    ) -> Result<String> {
        let selector = selector.to_string();
        let timeout = timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS);
        let var_note = variable
            .filter(|v| !v.is_empty())
            .map(|v| format!(" (variable `{v}` pending UI)"))
            .unwrap_or_default();
        self.rt.block_on(async {
            let page = self.require_page().await?;
            let element = wait_for_selector(&page, &selector, timeout).await?;
            let text = element
                .inner_text()
                .await
                .context("read inner text")?
                .unwrap_or_default();
            let preview: String = text.chars().take(80).collect();
            Ok(format!(
                "browser_get_text: {selector} -> {preview}{var_note}{}",
                if text.len() > 80 { "…" } else { "" }
            ))
        })
    }

    async fn require_page(&self) -> Result<Page> {
        let guard = self.inner.lock().await;
        match guard.as_ref() {
            Some(session) => Ok(session.page.clone()),
            None => bail!("no browser session: run browser_navigate before other browser actions"),
        }
    }
}

async fn launch_session(initial_url: &str) -> Result<SessionInner> {
    let mut cfg = BrowserConfig::builder();
    if let Ok(path) = std::env::var("HOBLIO_CHROME_PATH") {
        cfg = cfg.chrome_executable(path);
    }
    let (browser, mut handler) = Browser::launch(cfg.build().map_err(|e| {
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
        .new_page(initial_url)
        .await
        .with_context(|| format!("open browser page at {initial_url}"))?;

    Ok(SessionInner {
        browser,
        _handler: handle,
        page,
    })
}

async fn wait_for_selector(
    page: &Page,
    selector: &str,
    timeout_ms: u64,
) -> Result<chromiumoxide::element::Element> {
    let deadline = Instant::now() + Duration::from_millis(timeout_ms.max(1));
    loop {
        match page.find_element(selector).await {
            Ok(el) => return Ok(el),
            Err(_) if Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            Err(e) => {
                bail!(
                    "timeout ({timeout_ms}ms) waiting for selector `{selector}`: {e}"
                );
            }
        }
    }
}

async fn clear_element_value(element: &chromiumoxide::element::Element) -> Result<()> {
    element
        .call_js_fn(
            "function () { \
                if (this.value !== undefined) { this.value = ''; } \
                else if (this.isContentEditable) { this.textContent = ''; } \
            }",
            false,
        )
        .await
        .context("clear element value")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::BrowserContext;

    #[test]
    fn browser_dom_actions_require_navigate_first() {
        let ctx = BrowserContext::new().expect("runtime");
        let err = ctx.click("body", None).unwrap_err();
        assert!(
            err.to_string().contains("browser_navigate"),
            "{err}"
        );
    }

    #[test]
    #[ignore = "requires Chrome/Chromium and network to example.com"]
    fn browser_example_com_navigate_and_get_text() {
        let ctx = BrowserContext::new().expect("runtime");
        ctx.navigate("https://example.com", Some(300)).expect("navigate");
        ctx.wait_for("h1", Some(15_000)).expect("wait h1");
        let summary = ctx.get_text("h1", None, None).expect("get text");
        assert!(summary.contains("Example Domain"), "{summary}");
    }
}
