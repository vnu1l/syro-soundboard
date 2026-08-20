# Syro Soundboard Desktop

The desktop application uses Tauri 2 + Rust. The existing Syro UI remains the rendering layer, while Windows-only capabilities move to native code.

## Native responsibilities

- WASAPI system-output loopback capture (no screen-sharing picker)
- WASAPI per-process loopback capture by PID
- CPAL input/output device discovery
- Global shortcuts that work when Syro is in the background
- System tray / close-to-tray behavior
- Single application instance
- Start with Windows
- Native application data directory for captures and future board storage

## Build

```powershell
npm install
npm run desktop:build
```

The Windows installer is generated under:

`src-tauri/target/release/bundle/nsis/`

## Update model

The package identifier stays `com.syro.soundboard`. Future NSIS setup builds upgrade the installed application while Syro user data remains outside the installation directory. A tagged `app-v*` build is also published as a GitHub Release by the workflow.

The next update layer is Tauri's signed in-app updater. It requires a one-time private signing key stored as a GitHub Actions secret; the private key must never be committed to this repository.
