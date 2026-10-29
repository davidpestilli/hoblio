//! Blocking native message window (Windows). The flow waits until the user closes
//! the dialog or the optional timeout elapses.

use anyhow::Result;

pub fn run_show_message(title: &str, text: &str, timeout_seconds: Option<f64>) -> Result<()> {
    #[cfg(windows)]
    {
        show_message_win::run(title, text, timeout_seconds)
    }
    #[cfg(not(windows))]
    {
        let _ = (title, text, timeout_seconds);
        anyhow::bail!("show_message is only supported on Windows")
    }
}

#[cfg(windows)]
mod show_message_win {
    use std::ffi::c_void;
    use std::mem::size_of;
    use std::thread;
    use std::time::Duration;

    use anyhow::{Context, Result};
    use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW,
        PostMessageW, PostQuitMessage, RegisterClassW, SetForegroundWindow, ShowWindow,
        TranslateMessage, CS_HREDRAW, CS_VREDRAW, CREATESTRUCTW, HMENU, MSG, SW_SHOW,
        WINDOW_EX_STYLE, WM_CLOSE, WM_COMMAND, WM_CREATE, WM_DESTROY, WNDCLASSW, WS_CHILD,
        WS_OVERLAPPED, WS_VISIBLE, WS_CAPTION, WS_SYSMENU,
    };
    use windows::core::PCWSTR;

    const CLASS_NAME: PCWSTR = windows::core::w!("HoblioShowMessage");
    const ID_BTN_CLOSE: i32 = 1001;
    const ID_STATIC_TEXT: i32 = 1002;
    const BTN_CLOSE: PCWSTR = windows::core::w!("Fechar");
    const WS_EX_TOPMOST: u32 = 0x00000008;

    struct DialogParams {
        title: Vec<u16>,
        text: Vec<u16>,
        timeout_secs: Option<f64>,
    }

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn run(title: &str, text: &str, timeout_seconds: Option<f64>) -> Result<()> {
        let params = DialogParams {
            title: to_wide(title),
            text: to_wide(text),
            timeout_secs: timeout_seconds.filter(|&s| s > 0.0),
        };
        run_dialog(params)
    }

    unsafe extern "system" fn wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_CREATE => {
                let create = lparam.0 as *const CREATESTRUCTW;
                if create.is_null() {
                    return LRESULT(-1);
                }
                let params = (*create).lpCreateParams as *const DialogParams;
                if params.is_null() {
                    return LRESULT(-1);
                }
                let text = PCWSTR::from_raw((*params).text.as_ptr());
                let _ = CreateWindowExW(
                    WINDOW_EX_STYLE::default(),
                    windows::core::w!("STATIC"),
                    text,
                    WS_CHILD | WS_VISIBLE,
                    16,
                    16,
                    360,
                    120,
                    hwnd,
                    HMENU(ID_STATIC_TEXT as _),
                    None,
                    None,
                );
                let _ = CreateWindowExW(
                    WINDOW_EX_STYLE::default(),
                    windows::core::w!("BUTTON"),
                    BTN_CLOSE,
                    WS_CHILD | WS_VISIBLE,
                    140,
                    150,
                    120,
                    28,
                    hwnd,
                    HMENU(ID_BTN_CLOSE as _),
                    None,
                    None,
                );
                LRESULT(0)
            }
            WM_COMMAND => {
                let id = (wparam.0 & 0xFFFF) as i32;
                if id == ID_BTN_CLOSE {
                    let _ = DestroyWindow(hwnd);
                }
                LRESULT(0)
            }
            WM_CLOSE => {
                let _ = DestroyWindow(hwnd);
                LRESULT(0)
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    fn run_dialog(params: DialogParams) -> Result<()> {
        unsafe {
            let instance = GetModuleHandleW(None).context("GetModuleHandleW")?;

            let hinstance = HINSTANCE::from(instance);
            let wc = WNDCLASSW {
                lpfnWndProc: Some(wnd_proc),
                hInstance: hinstance,
                lpszClassName: CLASS_NAME,
                style: CS_HREDRAW | CS_VREDRAW,
                ..Default::default()
            };
            RegisterClassW(&wc);

            let params_ptr = Box::into_raw(Box::new(params));
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE(WS_EX_TOPMOST),
                CLASS_NAME,
                PCWSTR::from_raw((*params_ptr).title.as_ptr()),
                WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU,
                200,
                200,
                400,
                220,
                None,
                None,
                hinstance,
                Some(params_ptr as *const c_void),
            )
            .context("CreateWindowExW")?;

            let timeout = (*params_ptr).timeout_secs;
            let _ = Box::from_raw(params_ptr);

            let _ = ShowWindow(hwnd, SW_SHOW);
            let _ = SetForegroundWindow(hwnd);

            if let Some(secs) = timeout {
                let hwnd_raw = hwnd.0 as isize;
                thread::spawn(move || {
                    thread::sleep(Duration::from_secs_f64(secs));
                    let h = HWND(hwnd_raw as *mut c_void);
                    let _ = PostMessageW(h, WM_CLOSE, WPARAM(0), LPARAM(0));
                });
            }

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).into() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
        Ok(())
    }

    #[allow(dead_code)]
    fn _assert_createstruct_size() {
        let _ = size_of::<CREATESTRUCTW>();
    }
}
