// Prevents additional console window on Windows in release
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewWindowBuilder, AppHandle,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Get the target monitor(s) for the overlay based on display mode:
/// - Duplicate mode (1 monitor detected): Use primary/current monitor
/// - Extend mode (multiple monitors): Use secondary (non-primary) monitors
fn get_target_monitors(app: &AppHandle) -> Vec<(i32, i32, u32, u32)> {
    let monitors: Vec<_> = app.available_monitors().unwrap_or_default();
    let primary = app.primary_monitor().ok().flatten();

    if monitors.len() <= 1 {
        // Duplicate mode or single monitor - use the primary/only monitor
        if let Some(monitor) = monitors.first().or(primary.as_ref()) {
            let pos = monitor.position();
            let size = monitor.size();
            return vec![(pos.x, pos.y, size.width, size.height)];
        }
        return vec![];
    }

    // Extend mode - use secondary monitors (non-primary)
    let primary_pos = primary.as_ref().map(|m| m.position());

    monitors
        .iter()
        .filter(|m| {
            // Filter out the primary monitor
            if let Some(primary_p) = primary_pos {
                let pos = m.position();
                !(pos.x == primary_p.x && pos.y == primary_p.y)
            } else {
                true
            }
        })
        .map(|m| {
            let pos = m.position();
            let size = m.size();
            (pos.x, pos.y, size.width, size.height)
        })
        .collect()
}

/// Toggle the overlay window visibility
fn toggle_overlay(app: &AppHandle) {
    let main_window = app.get_webview_window("overlay");

    // Check if overlay is currently visible
    let is_visible = main_window
        .as_ref()
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false);

    if is_visible {
        // Hide all overlay windows
        hide_all_overlays(app);
    } else {
        // Show overlays on target monitors
        show_overlays(app);
    }
}

/// Hide all overlay windows
fn hide_all_overlays(app: &AppHandle) {
    // Hide main overlay
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.hide();
        let _ = window.emit("overlay-hidden", ());
    }

    // Hide any secondary overlay windows
    for i in 1..10 {
        let label = format!("overlay-{}", i);
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.hide();
            // Close secondary windows when hiding
            let _ = window.close();
        }
    }
}

/// Show overlays on target monitors
fn show_overlays(app: &AppHandle) {
    let targets = get_target_monitors(app);

    if targets.is_empty() {
        return;
    }

    // First target uses the main overlay window
    if let Some((x, y, width, height)) = targets.first() {
        if let Some(window) = app.get_webview_window("overlay") {
            let _ = window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition::new(*x, *y),
            ));
            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                *width,
                *height,
            )));
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.emit("overlay-shown", ());
        }
    }

    // Additional targets get new windows (for future multi-secondary-monitor support)
    for (i, (x, y, width, height)) in targets.iter().skip(1).enumerate() {
        let label = format!("overlay-{}", i + 1);

        // Check if window already exists
        if app.get_webview_window(&label).is_some() {
            continue;
        }

        // Create a new overlay window for this monitor
        if let Ok(window) = WebviewWindowBuilder::new(
            app,
            &label,
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("Screen Annotator")
        .position(*x as f64, *y as f64)
        .inner_size(*width as f64, *height as f64)
        .resizable(false)
        .fullscreen(false)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .visible(true)
        .skip_taskbar(true)
        .content_protected(false)
        .drag_and_drop(false)
        .build()
        {
            let _ = window.set_focus();
            let _ = window.emit("overlay-shown", ());
        }
    }
}

/// Hide the overlay window (called from frontend on Escape)
#[tauri::command]
fn hide_overlay(app: AppHandle) {
    hide_all_overlays(&app);
}

/// Get whether overlay is currently visible
#[tauri::command]
fn is_overlay_visible(app: AppHandle) -> bool {
    app.get_webview_window("overlay")
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false)
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
            // Get the overlay window and hide it initially
            if let Some(window) = app.get_webview_window("overlay") {
                let _ = window.hide();
            }

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
                        toggle_overlay(app);
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
            let app_handle = app.handle().clone();

            app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    toggle_overlay(&app_handle);
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
