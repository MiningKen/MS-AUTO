use std::sync::Mutex;

use enigo::{
    Direction::{Click, Press, Release},
    Enigo, Key, Keyboard, Settings,
};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State, WindowEvent,
};

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

struct InputState(Mutex<Option<Enigo>>);

#[derive(Deserialize)]
struct Shortcut {
    key: String,
    modifiers: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InputTarget {
    #[serde(default)]
    mode: Option<String>,
    id: Option<String>,
    title: Option<String>,
    process_id: Option<u32>,
    platform: Option<String>,
}

impl InputTarget {
    fn window(self) -> Result<Option<TargetWindow>, String> {
        if self.mode.as_deref() != Some("window") {
            return Ok(None);
        }
        Ok(Some(TargetWindow {
            id: self.id.ok_or("指定目標缺少視窗 id")?,
            title: self.title.ok_or("指定目標缺少視窗名稱")?,
            process_id: self.process_id.ok_or("指定目標缺少程序 id")?,
            platform: self.platform.ok_or("指定目標缺少平台")?,
        }))
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetWindow {
    id: String,
    title: String,
    process_id: u32,
    platform: String,
}

#[tauri::command]
fn send_shortcut(
    shortcut: Shortcut,
    input_target: Option<InputTarget>,
    state: State<'_, InputState>,
) -> Result<(), String> {
    let target = match input_target {
        Some(target) => target.window()?,
        None => None,
    };
    if let Some(target) = target {
        return send_shortcut_to_target(&shortcut, &target);
    }
    let mut input = state.0.lock().map_err(|_| "鍵盤服務暫時無法使用")?;
    if input.is_none() {
        *input = Some(Enigo::new(&Settings::default()).map_err(|error| error.to_string())?);
    }

    let input = input.as_mut().expect("input is initialized");
    let modifier_keys: Result<Vec<_>, _> = shortcut.modifiers.iter().map(|key| modifier_key(key)).collect();
    let modifier_keys = modifier_keys?;
    let key = parse_key(&shortcut.key)?;
    let mut pressed = Vec::new();

    for modifier in modifier_keys {
        if let Err(error) = input.key(modifier, Press) {
            release_modifiers(input, &pressed);
            return Err(error.to_string());
        }
        pressed.push(modifier);
    }

    let result = input.key(key, Click).map_err(|error| error.to_string());
    release_modifiers(input, &pressed);
    result
}

#[tauri::command]
fn capture_target() -> Result<TargetWindow, String> {
    capture_foreground_target()
}

fn send_shortcut_to_target(shortcut: &Shortcut, target: &TargetWindow) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    return windows_target::send_shortcut(shortcut, target);

    #[cfg(target_os = "macos")]
    return macos_target::send_shortcut(shortcut, target);

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (shortcut, target);
        Err("此平台不支援指定目標視窗".into())
    }
}

fn capture_foreground_target() -> Result<TargetWindow, String> {
    #[cfg(target_os = "windows")]
    return windows_target::capture();

    #[cfg(target_os = "macos")]
    return macos_target::capture();

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    Err("此平台不支援指定目標視窗".into())
}

#[tauri::command]
fn accessibility_permission_status() -> bool {
    #[cfg(target_os = "macos")]
    unsafe {
        return AXIsProcessTrusted();
    }

    #[cfg(not(target_os = "macos"))]
    true
}

#[tauri::command]
fn open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_tray_status(app: AppHandle, running: bool) -> Result<(), String> {
    let status = if running { "KeyPulse：執行中" } else { "KeyPulse：已停止" };
    let tray = app
        .tray_by_id("key-pulse-tray")
        .ok_or("找不到系統匣圖示")?;
    tray.set_tooltip(Some(status)).map_err(|error| error.to_string())
}

fn release_modifiers(input: &mut Enigo, pressed: &[Key]) {
    for modifier in pressed.iter().rev() {
        let _ = input.key(*modifier, Release);
    }
}

fn modifier_key(key: &str) -> Result<Key, String> {
    match key {
        "Control" => Ok(Key::Control),
        "Alt" => Ok(Key::Alt),
        "Shift" => Ok(Key::Shift),
        "Meta" => Ok(Key::Meta),
        _ => Err(format!("不支援的修飾鍵：{key}")),
    }
}

fn parse_key(key: &str) -> Result<Key, String> {
    let named_key = match key {
        "Enter" => Some(Key::Return),
        "Tab" => Some(Key::Tab),
        "Escape" | "Esc" => Some(Key::Escape),
        "Space" => Some(Key::Space),
        "Backspace" => Some(Key::Backspace),
        "Delete" => Some(Key::Delete),
        "Home" => Some(Key::Home),
        "End" => Some(Key::End),
        "PageUp" => Some(Key::PageUp),
        "PageDown" => Some(Key::PageDown),
        "ArrowUp" => Some(Key::UpArrow),
        "ArrowDown" => Some(Key::DownArrow),
        "ArrowLeft" => Some(Key::LeftArrow),
        "ArrowRight" => Some(Key::RightArrow),
        "F1" => Some(Key::F1), "F2" => Some(Key::F2), "F3" => Some(Key::F3),
        "F4" => Some(Key::F4), "F5" => Some(Key::F5), "F6" => Some(Key::F6),
        "F7" => Some(Key::F7), "F8" => Some(Key::F8), "F9" => Some(Key::F9),
        "F10" => Some(Key::F10), "F11" => Some(Key::F11), "F12" => Some(Key::F12),
        _ => None,
    };

    if let Some(key) = named_key {
        return Ok(key);
    }

    let mut chars = key.chars();
    match (chars.next(), chars.next()) {
        (Some(character), None) => Ok(Key::Unicode(character)),
        _ => Err(format!("不支援的按鍵：{key}")),
    }
}

#[cfg(test)]
mod tests {
    use super::InputTarget;

    #[test]
    fn treats_a_legacy_target_without_mode_as_the_focused_target() {
        let target: InputTarget = serde_json::from_str("{}").expect("legacy target should parse");
        assert!(target.window().expect("legacy target is valid").is_none());
    }

    #[test]
    fn requires_complete_details_for_a_window_target() {
        let target: InputTarget = serde_json::from_str(r#"{"mode":"window"}"#).expect("window target should parse");
        assert_eq!(target.window().unwrap_err(), "指定目標缺少視窗 id");
    }
}

#[cfg(target_os = "windows")]
mod windows_target {
    use std::ffi::c_void;

    use super::{Shortcut, TargetWindow};

    type Hwnd = *mut c_void;

    #[repr(C)]
    struct Rect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }

    #[repr(C)]
    struct GuiThreadInfo {
        size: u32,
        flags: u32,
        active_window: Hwnd,
        focus_window: Hwnd,
        capture_window: Hwnd,
        menu_owner: Hwnd,
        move_size_window: Hwnd,
        caret_window: Hwnd,
        caret_rect: Rect,
    }
    const WM_KEYDOWN: u32 = 0x0100;
    const WM_KEYUP: u32 = 0x0101;
    const WM_CHAR: u32 = 0x0102;
    const VK_CONTROL: u16 = 0x11;
    const VK_MENU: u16 = 0x12;
    const VK_SHIFT: u16 = 0x10;
    const VK_LWIN: u16 = 0x5B;

    #[link(name = "user32")]
    extern "system" {
        fn GetForegroundWindow() -> Hwnd;
        fn GetWindowTextLengthW(window: Hwnd) -> i32;
        fn GetWindowTextW(window: Hwnd, text: *mut u16, max_count: i32) -> i32;
        fn GetWindowThreadProcessId(window: Hwnd, process_id: *mut u32) -> u32;
        fn GetGUIThreadInfo(thread_id: u32, thread_info: *mut GuiThreadInfo) -> i32;
        fn IsWindow(window: Hwnd) -> i32;
        fn PostMessageW(window: Hwnd, message: u32, wparam: usize, lparam: isize) -> i32;
    }

    pub fn capture() -> Result<TargetWindow, String> {
        unsafe {
            let window = GetForegroundWindow();
            if window.is_null() {
                return Err("找不到目前前景視窗".into());
            }
            let length = GetWindowTextLengthW(window).max(0) as usize;
            let mut title = vec![0u16; length + 1];
            let copied = GetWindowTextW(window, title.as_mut_ptr(), title.len() as i32).max(0) as usize;
            let mut process_id = 0;
            GetWindowThreadProcessId(window, &mut process_id);
            if process_id == 0 {
                return Err("無法取得目標視窗的程序".into());
            }
            Ok(TargetWindow {
                id: (window as usize).to_string(),
                title: String::from_utf16_lossy(&title[..copied]).if_empty("未命名視窗"),
                process_id,
                platform: "windows".into(),
            })
        }
    }

    pub fn send_shortcut(shortcut: &Shortcut, target: &TargetWindow) -> Result<(), String> {
        if target.platform != "windows" {
            return Err("此目標不是 Windows 視窗".into());
        }
        let address = target.id.parse::<usize>().map_err(|_| "目標視窗資訊無效")?;
        let window = address as Hwnd;
        unsafe {
            if IsWindow(window) == 0 {
                return Err("指定的目標視窗已關閉，請重新選取".into());
            }
        }

        let target_window = focused_child_window(window);
        let modifiers: Result<Vec<_>, _> = shortcut.modifiers.iter().map(|modifier| match modifier.as_str() {
            "Control" => Ok(VK_CONTROL),
            "Alt" => Ok(VK_MENU),
            "Shift" => Ok(VK_SHIFT),
            "Meta" => Ok(VK_LWIN),
            _ => Err(format!("不支援的修飾鍵：{modifier}")),
        }).collect();
        let modifiers = modifiers?;

        for modifier in &modifiers {
            post_key(target_window, WM_KEYDOWN, *modifier)?;
        }
        let result = post_named_or_character(target_window, &shortcut.key);
        for modifier in modifiers.iter().rev() {
            let _ = post_key(target_window, WM_KEYUP, *modifier);
        }
        result
    }

    fn focused_child_window(window: Hwnd) -> Hwnd {
        unsafe {
            let thread_id = GetWindowThreadProcessId(window, std::ptr::null_mut());
            let mut thread_info = GuiThreadInfo {
                size: std::mem::size_of::<GuiThreadInfo>() as u32,
                flags: 0,
                active_window: std::ptr::null_mut(),
                focus_window: std::ptr::null_mut(),
                capture_window: std::ptr::null_mut(),
                menu_owner: std::ptr::null_mut(),
                move_size_window: std::ptr::null_mut(),
                caret_window: std::ptr::null_mut(),
                caret_rect: Rect { left: 0, top: 0, right: 0, bottom: 0 },
            };
            if thread_id != 0 && GetGUIThreadInfo(thread_id, &mut thread_info) != 0 && !thread_info.focus_window.is_null() {
                thread_info.focus_window
            } else {
                window
            }
        }
    }

    fn post_named_or_character(window: Hwnd, key: &str) -> Result<(), String> {
        if let Some(code) = virtual_key(key) {
            post_key(window, WM_KEYDOWN, code)?;
            return post_key(window, WM_KEYUP, code);
        }
        if key.chars().count() == 1 {
            let character = key.encode_utf16().next().expect("one character has UTF-16 data");
            unsafe {
                if PostMessageW(window, WM_CHAR, character as usize, 1) == 0 {
                    return Err("目標視窗拒絕按鍵".into());
                }
            }
            return Ok(());
        }
        Err(format!("不支援的按鍵：{key}"))
    }

    fn post_key(window: Hwnd, message: u32, key: u16) -> Result<(), String> {
        unsafe {
            let lparam = if message == WM_KEYUP { 0xC000_0001u32 as isize } else { 1 };
            if PostMessageW(window, message, key as usize, lparam) == 0 {
                return Err("目標視窗拒絕按鍵".into());
            }
        }
        Ok(())
    }

    fn virtual_key(key: &str) -> Option<u16> {
        let named = match key {
            "Enter" => Some(0x0D), "Tab" => Some(0x09), "Escape" | "Esc" => Some(0x1B),
            "Space" => Some(0x20), "Backspace" => Some(0x08), "Delete" => Some(0x2E),
            "Home" => Some(0x24), "End" => Some(0x23), "PageUp" => Some(0x21), "PageDown" => Some(0x22),
            "ArrowUp" => Some(0x26), "ArrowDown" => Some(0x28), "ArrowLeft" => Some(0x25), "ArrowRight" => Some(0x27),
            "F1" => Some(0x70), "F2" => Some(0x71), "F3" => Some(0x72), "F4" => Some(0x73),
            "F5" => Some(0x74), "F6" => Some(0x75), "F7" => Some(0x76), "F8" => Some(0x77),
            "F9" => Some(0x78), "F10" => Some(0x79), "F11" => Some(0x7A), "F12" => Some(0x7B),
            _ => None,
        };
        if named.is_some() {
            return named;
        }
        let mut characters = key.chars();
        match (characters.next(), characters.next()) {
            (Some(character), None) if character.is_ascii_alphanumeric() => Some(character.to_ascii_uppercase() as u16),
            _ => None,
        }
    }

    trait IfEmpty {
        fn if_empty(self, fallback: &str) -> String;
    }

    impl IfEmpty for String {
        fn if_empty(self, fallback: &str) -> String {
            if self.trim().is_empty() { fallback.into() } else { self }
        }
    }
}

#[cfg(target_os = "macos")]
mod macos_target {
    use std::{ffi::{c_char, c_void, CStr}, mem};

    use super::{Shortcut, TargetWindow};

    const SHIFT: u64 = 1 << 17;
    const CONTROL: u64 = 1 << 18;
    const OPTION: u64 = 1 << 19;
    const COMMAND: u64 = 1 << 20;

    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const c_char) -> *mut c_void;
        fn sel_registerName(name: *const c_char) -> *mut c_void;
        fn objc_msgSend();
    }

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn CGEventCreateKeyboardEvent(source: *const c_void, keycode: u16, key_down: bool) -> *mut c_void;
        fn CGEventSetFlags(event: *mut c_void, flags: u64);
        fn CGEventPostToPid(process_id: i32, event: *mut c_void);
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(object: *const c_void);
    }

    pub fn capture() -> Result<TargetWindow, String> {
        unsafe {
            let workspace_class = objc_getClass(c"NSWorkspace".as_ptr());
            if workspace_class.is_null() {
                return Err("無法取得 macOS 工作區服務".into());
            }
            let workspace = message_object(workspace_class, selector(c"sharedWorkspace"));
            let application = message_object(workspace, selector(c"frontmostApplication"));
            if application.is_null() {
                return Err("找不到目前前景應用程式".into());
            }
            let process_id = message_integer(application, selector(c"processIdentifier"));
            if process_id <= 0 {
                return Err("無法取得目標應用程式程序".into());
            }
            let name = message_object(application, selector(c"localizedName"));
            let title = if name.is_null() {
                "未命名應用程式".into()
            } else {
                let pointer = message_object(name, selector(c"UTF8String")) as *const c_char;
                if pointer.is_null() { "未命名應用程式".into() } else { CStr::from_ptr(pointer).to_string_lossy().into_owned() }
            };
            let title = if title.trim().is_empty() { "未命名應用程式".into() } else { title };
            Ok(TargetWindow {
                id: process_id.to_string(),
                title,
                process_id: process_id as u32,
                platform: "macos".into(),
            })
        }
    }

    pub fn send_shortcut(shortcut: &Shortcut, target: &TargetWindow) -> Result<(), String> {
        if target.platform != "macos" {
            return Err("此目標不是 macOS 應用程式".into());
        }
        let keycode = keycode(&shortcut.key)?;
        let flags = shortcut.modifiers.iter().try_fold(0, |flags, modifier| match modifier.as_str() {
            "Control" => Ok(flags | CONTROL),
            "Alt" => Ok(flags | OPTION),
            "Shift" => Ok(flags | SHIFT),
            "Meta" => Ok(flags | COMMAND),
            _ => Err(format!("不支援的修飾鍵：{modifier}")),
        })?;
        unsafe {
            for key_down in [true, false] {
                let event = CGEventCreateKeyboardEvent(std::ptr::null(), keycode, key_down);
                if event.is_null() {
                    return Err("無法建立鍵盤事件".into());
                }
                CGEventSetFlags(event, flags);
                CGEventPostToPid(target.process_id as i32, event);
                CFRelease(event);
            }
        }
        Ok(())
    }

    unsafe fn selector(name: &CStr) -> *mut c_void {
        sel_registerName(name.as_ptr())
    }

    unsafe fn message_object(receiver: *mut c_void, selector: *mut c_void) -> *mut c_void {
        let send: extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void = mem::transmute(objc_msgSend as *const ());
        send(receiver, selector)
    }

    unsafe fn message_integer(receiver: *mut c_void, selector: *mut c_void) -> isize {
        let send: extern "C" fn(*mut c_void, *mut c_void) -> isize = mem::transmute(objc_msgSend as *const ());
        send(receiver, selector)
    }

    fn keycode(key: &str) -> Result<u16, String> {
        let named = match key {
            "Enter" => Some(36), "Tab" => Some(48), "Escape" | "Esc" => Some(53), "Space" => Some(49),
            "Backspace" => Some(51), "Delete" => Some(117), "Home" => Some(115), "End" => Some(119),
            "PageUp" => Some(116), "PageDown" => Some(121), "ArrowUp" => Some(126), "ArrowDown" => Some(125),
            "ArrowLeft" => Some(123), "ArrowRight" => Some(124), "F1" => Some(122), "F2" => Some(120),
            "F3" => Some(99), "F4" => Some(118), "F5" => Some(96), "F6" => Some(97), "F7" => Some(98),
            "F8" => Some(100), "F9" => Some(101), "F10" => Some(109), "F11" => Some(103), "F12" => Some(111),
            _ => None,
        };
        if let Some(code) = named { return Ok(code); }
        let code = match key.to_ascii_lowercase().as_str() {
            "a" => 0, "s" => 1, "d" => 2, "f" => 3, "h" => 4, "g" => 5, "z" => 6, "x" => 7, "c" => 8, "v" => 9,
            "b" => 11, "q" => 12, "w" => 13, "e" => 14, "r" => 15, "y" => 16, "t" => 17, "1" => 18, "2" => 19,
            "3" => 20, "4" => 21, "6" => 22, "5" => 23, "=" => 24, "9" => 25, "7" => 26, "-" => 27, "8" => 28,
            "0" => 29, "]" => 30, "o" => 31, "u" => 32, "[" => 33, "i" => 34, "p" => 35, "l" => 37, "j" => 38,
            "'" => 39, "k" => 40, ";" => 41, "\\" => 42, "," => 43, "/" => 44, "n" => 45, "m" => 46, "." => 47,
            "`" => 50, _ => return Err(format!("macOS 不支援指定目標時使用此按鍵：{key}")),
        };
        Ok(code)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(InputState(Mutex::new(None)))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "開啟 KeyPulse", true, None::<&str>)?;
            let stop = MenuItem::with_id(app, "stop", "停止全部任務", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "結束", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &stop, &quit])?;
            let _tray = TrayIconBuilder::with_id("key-pulse-tray")
                .menu(&menu)
                .tooltip("KeyPulse：已停止")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "stop" => {
                        let _ = app.emit("stop-tasks", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            send_shortcut,
            capture_target,
            accessibility_permission_status,
            open_accessibility_settings,
            set_tray_status
        ])
        .run(tauri::generate_context!())
        .expect("無法啟動 KeyPulse");
}
