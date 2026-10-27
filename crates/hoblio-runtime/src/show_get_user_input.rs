//! Blocking native input dialog (Windows).

use anyhow::Result;
use hoblio_model::UserInputKind;

pub struct UserInputResult {
    pub user_input: String,
    pub button_pressed: String,
}

pub fn run_show_get_user_input(
    title: &str,
    message: &str,
    default_value: &str,
    input_kind: UserInputKind,
    topmost: bool,
) -> Result<UserInputResult> {
    #[cfg(windows)]
    {
        show_get_user_input_win::run(title, message, default_value, input_kind, topmost)
    }
    #[cfg(not(windows))]
    {
        let _ = (title, message, default_value, input_kind, topmost);
        anyhow::bail!("show_get_user_input is only supported on Windows")
    }
}

#[cfg(windows)]
mod show_get_user_input_win {
    use std::ffi::c_void;

    use anyhow::{Context, Result};
    use hoblio_model::UserInputKind;
    use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetDlgItem, GetMessageW,
        GetWindowLongPtrW, GetWindowTextLengthW, GetWindowTextW, PostQuitMessage, RegisterClassW,
        SetWindowLongPtrW, SetWindowTextW, ShowWindow, TranslateMessage, CS_HREDRAW, CS_VREDRAW,
        CREATESTRUCTW, GWLP_USERDATA, HMENU, MSG, SW_SHOW, WINDOW_EX_STYLE, WINDOW_STYLE,
        WM_CLOSE, WM_COMMAND, WM_CREATE, WM_DESTROY, WNDCLASSW, WS_CAPTION, WS_CHILD,
        WS_OVERLAPPED, WS_SYSMENU, WS_VISIBLE, WS_VSCROLL,
    };
    use windows::core::PCWSTR;

    use super::UserInputResult;

    const CLASS_NAME: PCWSTR = windows::core::w!("HoblioShowGetUserInput");
    const ID_EDIT: i32 = 1001;
    const ID_BTN_OK: i32 = 1002;
    const ID_BTN_CANCEL: i32 = 1003;
    const ID_STATIC_MSG: i32 = 1004;

    const BTN_OK: PCWSTR = windows::core::w!("OK");
    const BTN_CANCEL: PCWSTR = windows::core::w!("Cancelar");

    const ES_MULTILINE: u32 = 0x0004;
    const ES_AUTOVSCROLL: u32 = 0x0040;
    const ES_AUTOHSCROLL: u32 = 0x0080;
    const WS_BORDER: u32 = 0x00800000;
    const WS_EX_TOPMOST: u32 = 0x00000008;

    struct DialogState {
        title: Vec<u16>,
        message: Vec<u16>,
        default_value: Vec<u16>,
        multiline: bool,
        outcome: Option<UserInputResult>,
    }

    fn state_from(hwnd: HWND) -> Option<*mut DialogState> {
        unsafe {
            let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA);
            if ptr == 0 {
                None
            } else {
                Some(ptr as *mut DialogState)
            }
        }
    }

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn read_edit_text(hwnd_edit: HWND) -> String {
        unsafe {
            let len = GetWindowTextLengthW(hwnd_edit);
            if len <= 0 {
                return String::new();
            }
            let mut buf = vec![0u16; (len + 1) as usize];
            let read = GetWindowTextW(hwnd_edit, &mut buf);
            if read == 0 {
                return String::new();
            }
            String::from_utf16_lossy(&buf[..read as usize])
        }
    }

    fn close_with_button(hwnd: HWND, button: &str) {
        unsafe {
            let Some(state_ptr) = state_from(hwnd) else {
                let _ = DestroyWindow(hwnd);
                return;
            };
            let user_input = match GetDlgItem(hwnd, ID_EDIT) {
                Ok(edit) if !edit.0.is_null() => read_edit_text(edit),
                _ => String::new(),
            };
            (*state_ptr).outcome = Some(UserInputResult {
                user_input,
                button_pressed: button.to_string(),
            });
            let _ = DestroyWindow(hwnd);
        }
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
                let state_ptr = (*create).lpCreateParams as *mut DialogState;
                if state_ptr.is_null() {
                    return LRESULT(-1);
                }
                SetWindowLongPtrW(hwnd, GWLP_USERDATA, state_ptr as isize);

                let multiline = (*state_ptr).multiline;
                let message = PCWSTR::from_raw((*state_ptr).message.as_ptr());
                let _ = CreateWindowExW(
                    WINDOW_EX_STYLE::default(),
                    windows::core::w!("STATIC"),
                    message,
                    WS_CHILD | WS_VISIBLE,
                    16,
                    16,
                    380,
                    if multiline { 48 } else { 40 },
                    hwnd,
                    HMENU(ID_STATIC_MSG as _),
                    None,
                    None,
                );

                let mut edit_style = WS_CHILD.0 | WS_VISIBLE.0 | WS_BORDER | ES_AUTOHSCROLL;
                if multiline {
                    edit_style |= ES_MULTILINE | ES_AUTOVSCROLL | WS_VSCROLL.0;
                }
                let edit_top = if multiline { 72 } else { 64 };
                let edit_height = if multiline { 120 } else { 28 };
                let edit = CreateWindowExW(
                    WINDOW_EX_STYLE::default(),
                    windows::core::w!("EDIT"),
                    PCWSTR::from_raw((*state_ptr).default_value.as_ptr()),
                    WINDOW_STYLE(edit_style),
                    16,
                    edit_top,
                    380,
                    edit_height,
                    hwnd,
                    HMENU(ID_EDIT as _),
                    None,
                    None,
                );
                if edit.is_err() {
                    return LRESULT(-1);
                }
                let edit = edit.unwrap();
                if !(*state_ptr).default_value.is_empty() {
                    let _ = SetWindowTextW(edit, PCWSTR::from_raw((*state_ptr).default_value.as_ptr()));
                }

                let btn_y = edit_top + edit_height + 16;
                let _ = CreateWindowExW(
                    WINDOW_EX_STYLE::default(),
                    windows::core::w!("BUTTON"),
                    BTN_OK,
                    WS_CHILD | WS_VISIBLE,
                    88,
                    btn_y,
                    100,
                    28,
                    hwnd,
                    HMENU(ID_BTN_OK as _),
                    None,
                    None,
                );
                let _ = CreateWindowExW(
                    WINDOW_EX_STYLE::default(),
                    windows::core::w!("BUTTON"),
                    BTN_CANCEL,
                    WS_CHILD | WS_VISIBLE,
                    220,
                    btn_y,
                    100,
                    28,
                    hwnd,
                    HMENU(ID_BTN_CANCEL as _),
                    None,
                    None,
                );
                LRESULT(0)
            }
            WM_COMMAND => {
                let id = (wparam.0 & 0xFFFF) as i32;
                match id {
                    ID_BTN_OK => close_with_button(hwnd, "OK"),
                    ID_BTN_CANCEL => close_with_button(hwnd, "Cancel"),
                    _ => {}
                }
                LRESULT(0)
            }
            WM_CLOSE => {
                close_with_button(hwnd, "Cancel");
                LRESULT(0)
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    pub fn run(
        title: &str,
        message: &str,
        default_value: &str,
        input_kind: UserInputKind,
        topmost: bool,
    ) -> Result<UserInputResult> {
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

            let state = Box::new(DialogState {
                title: to_wide(title),
                message: to_wide(message),
                default_value: to_wide(default_value),
                multiline: input_kind == UserInputKind::MultiLine,
                outcome: None,
            });
            let state_ptr = Box::into_raw(state);

            let ex_style = if topmost {
                WINDOW_EX_STYLE(WS_EX_TOPMOST)
            } else {
                WINDOW_EX_STYLE::default()
            };
            let height = if (*state_ptr).multiline { 320 } else { 220 };

            let hwnd = CreateWindowExW(
                ex_style,
                CLASS_NAME,
                PCWSTR::from_raw((*state_ptr).title.as_ptr()),
                WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU,
                200,
                200,
                420,
                height,
                None,
                None,
                hinstance,
                Some(state_ptr as *const c_void),
            )
            .context("CreateWindowExW")?;

            let _ = ShowWindow(hwnd, SW_SHOW);

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).into() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
            let state = Box::from_raw(state_ptr);
            state
                .outcome
                .context("input dialog closed without a result")
        }
    }
}
