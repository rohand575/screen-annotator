// Prevents additional console window on Windows in release
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::sync::Mutex;
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewWindowBuilder, AppHandle,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

// ============================================================================
// APP STATE MACHINE
// ============================================================================
// Hidden  --Ctrl+Alt+A-->  Active  --ESC-->  Paused  --Ctrl+Alt+A-->  Active
//                      Active  --hotkey-->  Hidden
// Paused  --hotkey-->  Active (resume drawing with existing annotations)
// Active  --hotkey-->  Hidden (clear everything)

#[derive(Debug, Clone, PartialEq)]
enum AppState {
    Hidden,
    Active,
    Paused,
}

struct AppStateManager {
    state: AppState,
}

impl AppStateManager {
    fn new() -> Self {
        Self {
            state: AppState::Hidden,
        }
    }
}

/// Monitor info with physical position, size, and scale factor
struct MonitorInfo {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
}

/// Get ALL monitors for overlay display (covers every screen)
fn get_all_monitors(app: &AppHandle) -> Vec<MonitorInfo> {
    let monitors: Vec<_> = app.available_monitors().unwrap_or_default();

    if monitors.is_empty() {
        // Fallback to primary monitor
        if let Some(monitor) = app.primary_monitor().ok().flatten() {
            let pos = monitor.position();
            let size = monitor.size();
            return vec![MonitorInfo {
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                scale_factor: monitor.scale_factor(),
            }];
        }
        return vec![];
    }

    // Return ALL monitors with their scale factors
    monitors
        .iter()
        .map(|m| {
            let pos = m.position();
            let size = m.size();
            MonitorInfo {
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                scale_factor: m.scale_factor(),
            }
        })
        .collect()
}

/// Handle hotkey press with state machine logic
/// Hotkey: Hidden -> Active (start) | Active -> Hidden (close) | Paused -> Hidden (close)
fn handle_hotkey(app: &AppHandle) {
    let state_manager = app.state::<Mutex<AppStateManager>>();
    let mut manager = state_manager.lock().unwrap();

    match manager.state {
        AppState::Hidden => {
            // Hidden -> Active: Show overlay and start drawing
            manager.state = AppState::Active;
            drop(manager);
            show_overlays(app, false);
        }
        AppState::Active | AppState::Paused => {
            // Active/Paused -> Hidden: Clear everything and hide
            manager.state = AppState::Hidden;
            drop(manager);
            hide_all_overlays(app, true);
        }
    }
}

/// Handle ESC press from frontend
/// ESC: Active -> Paused (pause) | Paused -> Active (resume)
fn toggle_pause(app: &AppHandle) {
    let state_manager = app.state::<Mutex<AppStateManager>>();
    let mut manager = state_manager.lock().unwrap();

    match manager.state {
        AppState::Active => {
            // Active -> Paused: Keep annotations visible but disable interaction
            manager.state = AppState::Paused;
            drop(manager);
            set_overlays_passthrough(app, true);
            emit_to_all_overlays(app, "overlay-paused");
        }
        AppState::Paused => {
            // Paused -> Active: Resume drawing
            manager.state = AppState::Active;
            drop(manager);
            resume_overlays(app);
        }
        AppState::Hidden => {
            // Do nothing if hidden
        }
    }
}

/// Emit an event to all overlay windows
fn emit_to_all_overlays(app: &AppHandle, event: &str) {
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.emit(event, ());
    }
    for i in 1..10 {
        let label = format!("overlay-{}", i);
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.emit(event, ());
        }
    }
}

/// Set all overlay windows to ignore cursor events (passthrough) or not
fn set_overlays_passthrough(app: &AppHandle, ignore: bool) {
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.set_ignore_cursor_events(ignore);
    }
    for i in 1..10 {
        let label = format!("overlay-{}", i);
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.set_ignore_cursor_events(ignore);
        }
    }
}

/// Resume overlays from paused state (re-enable interaction)
fn resume_overlays(app: &AppHandle) {
    // Re-enable cursor events
    set_overlays_passthrough(app, false);

    // Focus the main overlay
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.set_focus();
    }

    // Emit resumed event to frontend
    emit_to_all_overlays(app, "overlay-resumed");
}

/// Hide all overlay windows
fn hide_all_overlays(app: &AppHandle, clear: bool) {
    // First, emit clear event and execute JS to clear canvas immediately
    if clear {
        // Execute JS directly to clear canvas before hiding
        if let Some(window) = app.get_webview_window("overlay") {
            let _ = window.eval("if(typeof forceCompleteReset === 'function') forceCompleteReset();");
        }
        for i in 1..10 {
            let label = format!("overlay-{}", i);
            if let Some(window) = app.get_webview_window(&label) {
                let _ = window.eval("if(typeof forceCompleteReset === 'function') forceCompleteReset();");
            }
        }
        // Also emit the event
        emit_to_all_overlays(app, "overlay-hidden");
    }

    // Small delay to ensure JS executes before hiding
    std::thread::sleep(std::time::Duration::from_millis(10));

    // Hide main overlay
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.set_ignore_cursor_events(false);
        let _ = window.hide();
    }

    // Hide any secondary overlay windows
    for i in 1..10 {
        let label = format!("overlay-{}", i);
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.set_ignore_cursor_events(false);
            let _ = window.hide();
            let _ = window.close();
        }
    }
}

/// Show overlays on all monitors
fn show_overlays(app: &AppHandle, is_resume: bool) {
    let targets = get_all_monitors(app);

    if targets.is_empty() {
        return;
    }

    // First target uses the main overlay window
    if let Some(monitor) = targets.first() {
        if let Some(window) = app.get_webview_window("overlay") {
            let _ = window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition::new(monitor.x, monitor.y),
            ));
            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                monitor.width,
                monitor.height,
            )));
            let _ = window.set_ignore_cursor_events(false);
            let _ = window.show();
            let _ = window.set_focus();
            if !is_resume {
                let _ = window.emit("overlay-shown", ());
            }
        }
    }

    // Additional targets get new windows for multi-monitor support
    for (i, monitor) in targets.iter().skip(1).enumerate() {
        let label = format!("overlay-{}", i + 1);

        // Check if window already exists
        if let Some(window) = app.get_webview_window(&label) {
            // Update position and size in case monitor config changed
            let _ = window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition::new(monitor.x, monitor.y),
            ));
            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                monitor.width,
                monitor.height,
            )));
            let _ = window.set_ignore_cursor_events(false);
            let _ = window.show();
            if !is_resume {
                let _ = window.emit("overlay-shown", ());
            }
            continue;
        }

        // Convert physical to logical coordinates for window builder
        let scale = monitor.scale_factor;
        let logical_x = monitor.x as f64 / scale;
        let logical_y = monitor.y as f64 / scale;
        let logical_width = monitor.width as f64 / scale;
        let logical_height = monitor.height as f64 / scale;

        // Create a new overlay window for this monitor
        if let Ok(window) = WebviewWindowBuilder::new(
            app,
            &label,
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("Screen Annotator")
        .position(logical_x, logical_y)
        .inner_size(logical_width, logical_height)
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
            // After creation, set exact physical position/size to ensure accuracy
            let _ = window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition::new(monitor.x, monitor.y),
            ));
            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                monitor.width,
                monitor.height,
            )));
            let _ = window.set_focus();
            let _ = window.emit("overlay-shown", ());
        }
    }
}

/// Toggle pause state (called from frontend on Escape)
/// Active -> Paused, Paused -> Active
#[tauri::command]
fn toggle_pause_cmd(app: AppHandle) {
    toggle_pause(&app);
}

/// Hide the overlay window and clear everything
#[tauri::command]
fn hide_overlay(app: AppHandle) {
    let state_manager = app.state::<Mutex<AppStateManager>>();
    let mut manager = state_manager.lock().unwrap();
    manager.state = AppState::Hidden;
    drop(manager);
    hide_all_overlays(&app, true);
}

/// Get whether overlay is currently visible
#[tauri::command]
fn is_overlay_visible(app: AppHandle) -> bool {
    app.get_webview_window("overlay")
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false)
}

/// Broadcast tool selection to all overlay windows so every screen stays in sync
#[tauri::command]
fn broadcast_tool(app: AppHandle, tool: String) {
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.emit("tool-changed", tool.clone());
    }
    for i in 1..10 {
        let label = format!("overlay-{}", i);
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.emit("tool-changed", tool.clone());
        }
    }
}

/// Get current app state as string
#[tauri::command]
fn get_app_state(app: AppHandle) -> String {
    let state_manager = app.state::<Mutex<AppStateManager>>();
    let manager = state_manager.lock().unwrap();
    match manager.state {
        AppState::Hidden => "hidden".to_string(),
        AppState::Active => "active".to_string(),
        AppState::Paused => "paused".to_string(),
    }
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
        .manage(Mutex::new(AppStateManager::new()))
        .invoke_handler(tauri::generate_handler![
            hide_overlay,
            is_overlay_visible,
            toggle_pause_cmd,
            get_app_state,
            broadcast_tool
        ])
        .setup(|app| {
            // Get the overlay window and hide it initially
            if let Some(window) = app.get_webview_window("overlay") {
                let _ = window.hide();
            }

            // Build system tray
            let _tray = TrayIconBuilder::new()
                .tooltip("Screen Annotator\nCtrl+Alt+A to toggle\nRight-click to quit")
                .icon(app.default_window_icon().unwrap().clone())
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        handle_hotkey(app);
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

            // Register global shortcut: Ctrl+Alt+A
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyA);
            let app_handle = app.handle().clone();

            app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    handle_hotkey(&app_handle);
                }
            })?;

            // Try to register the shortcut, but don't fail if it's already registered
            if let Err(e) = app.global_shortcut().register(shortcut) {
                eprintln!("Warning: Could not register global shortcut Ctrl+Alt+A: {}. You can still use the tray icon.", e);
            }

            // Always enable autostart on Windows boot
            // This ensures the app always runs in background after system startup
            let autostart_manager = app.autolaunch();
            // Force enable autostart (re-enable even if already enabled to ensure registry is correct)
            match autostart_manager.enable() {
                Ok(_) => println!("Autostart enabled - app will run on Windows boot"),
                Err(e) => eprintln!("Warning: Could not enable autostart: {}", e),
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
