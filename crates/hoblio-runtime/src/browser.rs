//! Shared Chromium CDP session for a single flow run (opened by `browser_navigate`).

use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use chromiumoxide::browser::{Browser, BrowserConfig};

use crate::chromium_exe::resolve_chromium_executable;
use crate::variables::RunVariables;
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
                tokio::time::sleep(Duration::from_millis(250)).await;
                session._handler.abort();
            }
        });
    }

    pub fn navigate(
        &self,
        url: &str,
        wait_ms: Option<u64>,
        show_on_screen: Option<bool>,
        start_maximized: Option<bool>,
    ) -> Result<String> {
        let url = url.to_string();
        let show_on_screen = show_on_screen.unwrap_or(true);
        let start_maximized = start_maximized.unwrap_or(true);
        self.rt.block_on(async {
            let mut guard = self.inner.lock().await;
            if guard.is_none() {
                *guard = Some(launch_session(&url, show_on_screen, start_maximized).await?);
            } else {
                let session = guard.as_mut().expect("session");
                session
                    .page
                    .goto(&url)
                    .await
                    .with_context(|| format!("navigate to {url}"))?
                    .wait_for_navigation()
                    .await
                    .with_context(|| format!("wait for navigation to {url}"))?;
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

    pub fn click(
        &self,
        selector: &str,
        timeout_ms: Option<u64>,
        wait_for_navigation: bool,
        wait_selector_after: Option<&str>,
        wait_after_timeout_ms: Option<u64>,
    ) -> Result<String> {
        let selector = selector.to_string();
        let timeout = timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS);
        let after_selector = wait_selector_after.map(|s| s.to_string());
        let after_timeout = wait_after_timeout_ms.unwrap_or(timeout);
        self.rt.block_on(async {
            let page = self.require_page().await?;
            let element = wait_for_selector(&page, &selector, timeout).await?;
            element.click().await.context("click element")?;
            if wait_for_navigation {
                wait_for_navigation_timeout(&page, timeout).await?;
            }
            let waited_selector = after_selector.is_some();
            if let Some(sel) = after_selector {
                wait_for_selector(&page, &sel, after_timeout).await?;
            }
            let notes = match (wait_for_navigation, waited_selector) {
                (true, true) => " (navigation + selector)",
                (true, false) => " (waited for navigation)",
                (false, true) => " (waited for selector)",
                (false, false) => "",
            };
            Ok(format!("browser_click: {selector}{notes}"))
        })
    }

    pub fn wait_navigation(&self, timeout_ms: Option<u64>) -> Result<String> {
        let timeout = timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS);
        self.rt.block_on(async {
            let page = self.require_page().await?;
            wait_for_navigation_timeout(&page, timeout).await?;
            Ok(format!("browser_wait_navigation: ok ({timeout}ms max)"))
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
        vars: &mut RunVariables,
    ) -> Result<String> {
        let selector = selector.to_string();
        let timeout = timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS);
        let text = self.rt.block_on(async {
            let page = self.require_page().await?;
            let element = wait_for_selector(&page, &selector, timeout).await?;
            element
                .inner_text()
                .await
                .context("read inner text")
        })?
        .unwrap_or_default();

        let var_note = if let Some(name) = variable.filter(|v| !v.is_empty()) {
            vars.insert(name.to_string(), text.clone());
            format!(" (variable `{name}` set)")
        } else {
            String::new()
        };

        let preview: String = text.chars().take(80).collect();
        Ok(format!(
            "browser_get_text: {selector} -> {preview}{var_note}{}",
            if text.len() > 80 { "…" } else { "" }
        ))
    }

    async fn require_page(&self) -> Result<Page> {
        let guard = self.inner.lock().await;
        match guard.as_ref() {
            Some(session) => Ok(session.page.clone()),
            None => bail!("no browser session: run browser_navigate before other browser actions"),
        }
    }
}

fn browser_config_builder(show_on_screen: bool, start_maximized: bool) -> Result<BrowserConfig> {
    let exe = resolve_chromium_executable()?;
    let mut builder = BrowserConfig::builder()
        .arg("--remote-allow-origins=*")
        .arg("--disable-background-networking")
        .chrome_executable(exe);
    builder = if show_on_screen {
        // Default chromiumoxide viewport is 800×600 CDP emulation — leaves gray bands
        // when the window is larger (e.g. --start-maximized). Use the real window size.
        builder.with_head().viewport(None)
    } else {
        builder.new_headless_mode()
    };
    if show_on_screen && start_maximized {
        builder = builder.arg("--start-maximized");
    }
    builder
        .build()
        .map_err(|e| anyhow::anyhow!("invalid browser config: {e}"))
}

async fn open_page_at(browser: &Browser, url: &str) -> Result<Page> {
    let page = browser
        .new_page("about:blank")
        .await
        .context("create browser page")?;
    page.goto(url)
        .await
        .with_context(|| format!("open browser page at {url}"))?
        .wait_for_navigation()
        .await
        .with_context(|| format!("wait for initial load of {url}"))?;
    Ok(page)
}

async fn launch_session(
    initial_url: &str,
    show_on_screen: bool,
    start_maximized: bool,
) -> Result<SessionInner> {
    let config = browser_config_builder(show_on_screen, start_maximized)?;
    let (browser, mut handler) = Browser::launch(config)
        .await
        .context("start Chromium for CDP (install Chrome/Edge or set HOBLIO_CHROME_PATH)")?;

    let handle = tokio::spawn(async move {
        while let Some(h) = handler.next().await {
            if h.is_err() {
                break;
            }
        }
    });

    let page = open_page_at(&browser, initial_url).await?;

    Ok(SessionInner {
        browser,
        _handler: handle,
        page,
    })
}

async fn wait_for_navigation_timeout(page: &Page, timeout_ms: u64) -> Result<()> {
    tokio::time::timeout(
        Duration::from_millis(timeout_ms.max(1)),
        page.wait_for_navigation(),
    )
    .await
    .map_err(|_| anyhow::anyhow!("timeout ({timeout_ms}ms) waiting for navigation"))?
    .context("wait for navigation")?;
    Ok(())
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
        let err = ctx.click("body", None, false, None, None).unwrap_err();
        assert!(
            err.to_string().contains("browser_navigate"),
            "{err}"
        );
    }

    #[test]
    #[ignore = "requires Chrome/Chromium and network to example.com"]
    fn browser_example_com_navigate_and_get_text() {
        let ctx = BrowserContext::new().expect("runtime");
        ctx.navigate("https://example.com", Some(300), None, None)
            .expect("navigate");
        ctx.wait_for("body p", Some(15_000)).expect("wait body paragraph");
        let mut vars = crate::variables::RunVariables::new();
        let summary = ctx
            .get_text("body p", None, None, &mut vars)
            .expect("get text");
        assert!(
            summary.contains("documentation examples"),
            "{summary}"
        );
    }
}
