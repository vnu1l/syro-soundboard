mod audio;

use audio::{AudioDeviceInfo, CaptureManager, CaptureResult, CaptureStart, ProcessInfo};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCapabilities {
    desktop: bool,
    platform: &'static str,
    system_loopback: bool,
    process_loopback: bool,
    global_shortcuts: bool,
    tray: bool,
    autostart: bool,
    app_data_dir: String,
    version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HotkeyBinding { shortcut: String, pad_id: String }

#[tauri::command]
fn native_capabilities(app: AppHandle) -> Result<NativeCapabilities, String> {
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(NativeCapabilities {
        desktop: true,
        platform: std::env::consts::OS,
        system_loopback: cfg!(windows),
        process_loopback: cfg!(windows),
        global_shortcuts: true,
        tray: true,
        autostart: true,
        app_data_dir: data.display().to_string(),
        version: app.package_info().version.to_string(),
    })
}

#[tauri::command]
fn native_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> { audio::list_audio_devices() }

#[tauri::command]
fn native_processes() -> Vec<ProcessInfo> { audio::list_processes() }

#[tauri::command]
fn native_capture_start(app: AppHandle, manager: State<CaptureManager>, mode: String, process_id: Option<u32>) -> Result<CaptureStart, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("captures");
    manager.start(dir, mode, process_id)
}

#[tauri::command]
fn native_capture_stop(manager: State<CaptureManager>, id: String) -> Result<CaptureResult, String> { manager.stop(&id) }

#[tauri::command]
fn native_read_file(app: AppHandle, path: String) -> Result<Vec<u8>, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let requested = PathBuf::from(path);
    let canon_root = std::fs::canonicalize(&root).map_err(|e| e.to_string())?;
    let canon = std::fs::canonicalize(&requested).map_err(|e| e.to_string())?;
    if !canon.starts_with(canon_root) { return Err("Path is outside Syro application data".into()); }
    std::fs::read(canon).map_err(|e| e.to_string())
}

#[tauri::command]
fn native_sync_hotkeys(app: AppHandle, bindings: Vec<HotkeyBinding>) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    shortcuts.unregister_all().map_err(|e| e.to_string())?;
    for binding in bindings {
        let pad_id = binding.pad_id.clone();
        shortcuts.on_shortcut(binding.shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed { let _ = app.emit("syro://shortcut", pad_id.clone()); }
        }).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn native_get_autostart(app: AppHandle) -> Result<bool, String> { app.autolaunch().is_enabled().map_err(|e| e.to_string()) }

#[tauri::command]
fn native_set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled { manager.enable() } else { manager.disable() }.map_err(|e| e.to_string())
}

#[tauri::command]
fn native_open_windows_settings(page: String) -> Result<(), String> {
    #[cfg(windows)] {
        let target = match page.as_str() {
            "microphone" => "ms-settings:privacy-microphone",
            "sound" => "ms-settings:sound",
            "notifications" => "ms-settings:notifications",
            _ => "ms-settings:appsfeatures",
        };
        std::process::Command::new("cmd").args(["/C", "start", "", target]).spawn().map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))] { let _ = page; Err("This shortcut is currently Windows-only".into()) }
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show(); let _ = window.unminimize(); let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CaptureManager::default())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--background"])))
        .setup(|app| {
            use tauri::{menu::{Menu, MenuItem}, tray::TrayIconBuilder};
            let open = MenuItem::with_id(app, "open", "Open Syro", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let icon = app.default_window_icon().cloned().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "Missing app icon"))?;
            TrayIconBuilder::new().icon(icon).tooltip("Syro Soundboard").menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                }).build(app)?;
            if std::env::args().any(|arg| arg == "--background") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close(); let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            native_capabilities, native_audio_devices, native_processes,
            native_capture_start, native_capture_stop, native_read_file,
            native_sync_hotkeys, native_get_autostart, native_set_autostart,
            native_open_windows_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running Syro Soundboard");
}
