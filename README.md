# Screen Annotator

A lightweight, cross-platform desktop app for drawing temporary visual annotations over any screen content. Perfect for screen sharing, presentations, and live demos.

![Platform Support](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-orange)

## Features

- **Global Shortcut**: `Ctrl+Shift+D` toggles overlay from anywhere
- **Three Drawing Tools**:
  - `R` - Rectangle mode (draw boxes to highlight areas)
  - `A` - Arrow mode (draw arrows to point at things)
  - `T` - Text mode (click to create floating text labels)
- **Escape** - Clears all annotations and hides overlay
- **Minimal footprint** - Runs silently in system tray
- **Cross-platform** - Works on Windows and macOS

## Prerequisites

### Windows

1. **Node.js** (v18+)
   ```powershell
   # Using winget
   winget install OpenJS.NodeJS.LTS
   ```

2. **Rust** (latest stable)
   ```powershell
   # Download and run rustup-init.exe from https://rustup.rs
   # Or use winget:
   winget install Rustlang.Rustup
   ```

3. **Visual Studio Build Tools**
   ```powershell
   winget install Microsoft.VisualStudio.2022.BuildTools
   ```
   After installing, open Visual Studio Installer and add:
   - "Desktop development with C++" workload

4. **WebView2** (usually pre-installed on Windows 10/11)
   - If not, download from [Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

### macOS

1. **Xcode Command Line Tools**
   ```bash
   xcode-select --install
   ```

2. **Node.js** (v18+)
   ```bash
   brew install node
   ```

3. **Rust** (latest stable)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

## Installation

1. **Clone or download this project**

2. **Install dependencies**
   ```bash
   cd screen-annotator
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm run dev
   ```

4. **Build for production**
   ```bash
   npm run build
   ```
   Installers will be in `src-tauri/target/release/bundle/`

## Usage

### Starting the App

After launching, the app runs silently in the system tray (notification area on Windows, menu bar on macOS).

### Controls

| Action | Key/Input |
|--------|-----------|
| Toggle overlay | `Ctrl+Shift+D` (global) |
| Rectangle mode | `R` |
| Arrow mode | `A` |
| Text mode | `T` |
| Clear & hide | `Escape` |
| Clear (stay visible) | `C` |
| Draw rectangle | Click + drag |
| Draw arrow | Click + drag |
| Create text | Click (in text mode) |
| Finish text | `Enter` or click elsewhere |
| Quit app | Right-click tray icon |

### System Tray

- **Left-click**: Toggle overlay
- **Right-click**: Quit application

## Architecture

```
screen-annotator/
├── src/                    # Frontend (HTML/CSS/JS)
│   ├── index.html          # Main document
│   ├── styles.css          # Styling (transparent overlay)
│   └── main.js             # Drawing engine & event handling
├── src-tauri/              # Tauri/Rust backend
│   ├── src/
│   │   ├── lib.rs          # Core app logic
│   │   └── main.rs         # Entry point
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
└── package.json            # Node dependencies
```

## Troubleshooting

### "Global shortcut not working"
- Another app might be using `Ctrl+Shift+D`
- On macOS, check System Preferences > Security & Privacy > Accessibility

### "Overlay not appearing"
- Check if the app is running in system tray
- Try left-clicking the tray icon to toggle manually

### "Drawings not visible"
- Ensure you're in the correct tool mode (check bottom-left indicator)
- Click and drag - single clicks only work in text mode

### Build errors on Windows
- Run VS Code as Administrator
- Ensure Visual Studio Build Tools are installed with C++ workload
- Run `rustup update` to get latest Rust

### Build errors on macOS
- Run `xcode-select --install` to ensure build tools are present
- Check that Rust is in PATH: `source ~/.cargo/env`

## Development

### Hot Reload

The frontend supports hot reload during development. Changes to HTML/CSS/JS in `src/` will reflect immediately.

### Modifying the Backend

Changes to Rust code in `src-tauri/src/` require recompilation. The dev server will automatically rebuild.

### Adding New Tools

1. Add drawing function in `main.js`
2. Add keyboard shortcut in the `keydown` handler
3. Update the `setTool()` function
4. Style the tool indicator in `styles.css`

## License

MIT License - feel free to use and modify.

---

Built with [Tauri](https://tauri.app) 🦀
