# Syro Soundboard

A fast, local-first one-page soundboard prototype with a dark floating UI, animated purple accents and real Web Audio effects.

## Current features

- Drag/drop or upload audio files
- Microphone recording via MediaRecorder
- Web Audio playback with Restart, Stack, Toggle, Loop and One-shot modes
- Live Volume, Bass, Reverb, Echo and Stereo Pan processing
- Per-pad keyboard shortcuts while the page is focused
- Custom right-click menu
- Copy, cut, paste, duplicate, rename and delete pad actions
- Undo / Redo history
- Local autosave with IndexedDB audio storage
- Exportable `.syroboard` backup
- Master volume and Stop All controls
- Custom-styled buttons, selects, sliders and switches
- Hover light tracking, press feedback, floating panels and animated borders/backgrounds
- PWA shell / offline cache

## Run locally

Any local static server works. For example:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Important browser limitation

Page-level shortcuts work while the website has focus. True Windows-wide global shortcuts require a small desktop companion (for example Tauri) in a later phase.
