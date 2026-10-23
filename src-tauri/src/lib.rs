use std::sync::Mutex;

use enigo::{
    Direction::{Click, Press, Release},
    Enigo, Key, Keyboard, Settings,
};
use serde::Deserialize;
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

#[tauri::command]
fn send_shortcut(shortcut: Shortcut, state: State<'_, InputState>) -> Result<(), String> {
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
            accessibility_permission_status,
            open_accessibility_settings,
            set_tray_status
        ])
        .run(tauri::generate_context!())
        .expect("無法啟動 KeyPulse");
}
