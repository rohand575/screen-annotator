// Prevents additional console window on Windows in release
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewWindow,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Toggle the overlay window visibility and set it to fullscreen
fn toggle_overlay(window: &WebviewWindow) {
    if window.is_visible().unwrap_or(false) {
        // Hide the overlay
        let _ = window.hide();
        let _ = window.emit("overlay-hidden", ());
    } else {
        // Get the monitor the window is on and resize to fill it
        if let Some(monitor) = window.current_monitor().ok().flatten() {
            let size = monitor.size();
            let position = monitor.position();
            let _ = window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition::new(position.x, position.y),
            ));
            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                size.width,
                size.height,
            )));
        }
        // Show and focus the overlay
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("overlay-shown", ());
    }
}

/// Hide the overlay window (called from frontend on Escape)
#[tauri::command]
fn hide_overlay(window: WebviewWindow) {
    let _ = window.hide();
}

/// Get whether overlay is currently visible
#[tauri::command]
fn is_overlay_visible(window: WebviewWindow) -> bool {
    window.is_visible().unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .invoke_handler(tauri::generate_handler![hide_overlay, is_overlay_visible])
        .setup(|app| {
            // Get the overlay window
            let window = app.get_webview_window("overlay").expect("overlay window not found");
            
            // Make window click-through when not in drawing mode is handled by frontend
            // Set initial state
            let _ = window.hide();

            // Build system tray
            let _tray = TrayIconBuilder::new()
                .tooltip("Screen Annotator\nCtrl+Shift+A to toggle\nRight-click to quit")
                .icon(app.default_window_icon().unwrap().clone())
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("overlay") {
                            toggle_overlay(&window);
                        }
                    }
                    if let TrayIconEvent::Click {
                        button: MouseButton::Right,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        // Right-click to quit
                        std::process::exit(0);
                    }
                })
                .build(app)?;

            // Register global shortcut: Ctrl+Shift+A
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyA);
            let window_clone = window.clone();

            app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    toggle_overlay(&window_clone);
                }
            })?;

            // Try to register the shortcut, but don't fail if it's already registered
            if let Err(e) = app.global_shortcut().register(shortcut) {
                eprintln!("Warning: Could not register global shortcut Ctrl+Shift+A: {}. You can still use the tray icon.", e);
            }

            // Enable autostart on Windows boot
            let autostart_manager = app.autolaunch();
            if !autostart_manager.is_enabled().unwrap_or(false) {
                if let Err(e) = autostart_manager.enable() {
                    eprintln!("Warning: Could not enable autostart: {}", e);
                } else {
                    println!("Autostart enabled - app will run on Windows boot");
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
