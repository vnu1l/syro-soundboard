# Syro Soundboard Desktop

The desktop application uses Tauri 2 + Rust + WebView2. The existing Syro visual system remains the rendering layer, while Windows-only capabilities move to native code so the application stays lightweight and responsive.

## Native responsibilities

- WASAPI system-output loopback capture without a browser screen-sharing picker
- WASAPI per-process loopback capture by PID with an in-app process picker
- Native input/output device discovery plus application audio routing controls
- Selected microphone routing for Record and Live Timeline tracks
- Global shortcuts that work while Syro is in the background
- System tray / close-to-tray behavior
- Single application instance
- Start with Windows, including background startup
- Native application data directory for captures and persistent user data
- Windows Sound / microphone settings shortcuts when OS-level configuration is needed

## Desktop Timeline

The desktop Timeline keeps the same Syro UI and adds native sources alongside board and microphone audio:

- Board output
- Microphone
- Windows system output
- A selected Windows process/application

Timeline clips use decoded waveform peaks, wheel zoom anchored under the pointer, middle-mouse panning, drag/drop between pads and clips, and multi-selection.

## Build

```powershell
npm install
npm run desktop:build
```

The Windows NSIS installer is generated under:

`src-tauri/target/release/bundle/nsis/`

GitHub Actions builds the application on `windows-latest` and uploads the generated setup as the `Syro-Soundboard-Windows-Setup` artifact after a successful compile.

## Update model

The package identifier stays `com.syro.soundboard`. Future NSIS setup builds upgrade the installed application while Syro user data remains outside the installation directory, so reinstalling a newer setup keeps the latest application code and existing user data.

Tagged `app-v*` builds can also be published as GitHub Releases by the workflow. The final in-app update layer uses Tauri's signed updater and requires a one-time private signing key stored as a GitHub Actions secret; the private key must never be committed to this repository.
