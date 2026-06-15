# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

macOS Electron desktop pet (tabby cat) driven by global mouse position. The cat rotates its head to follow the cursor in tracking mode, and supports discrete action animations (run, eat, play, jump, sleep, walk). The window is transparent, borderless, always-on-top, and can be locked for mouse-passthrough.

## Commands

```bash
# Launch the desktop pet (Electron)
npm start

# Preview the sprite with debug panel in a browser (Vite)
npm run preview

# Generate transparent frames & sprites from the main green-screen video
npm run process:video         # or: node scripts/process-video.mjs "/path/to/video.mp4"

# Generate action frames & sprites (one per action)
npm run process:run           # node scripts/process-run-video.mjs run
npm run process:eat
npm run process:play
npm run process:jump
npm run process:sleep
npm run process:walk-right
npm run process:walk-left
npm run process:wash

# Validate all assets (frame counts, sprite sizes, alpha quality, angle continuity)
npm run validate
```

## Architecture

```
src/angle-config.js   → Shared constants & interpolation (imported by main, renderer, and scripts)
src/main.js           → Electron main process: BrowserWindow, tray, IPC, cursor polling, walking
src/preload.cjs       → contextBridge API (desktopPet.onCursorUpdate, .setAction, etc.)
src/renderer.js       → Sprite rendering loop, angle → frame interpolation, action state machine
src/styles.css        → Layout, glassmorphism action menu, preview grid
index.html            → Entry HTML, loads renderer.js; CSP restricts to self/data/file:

public/assets/
  sprites/            → 13×N sprite sheets (cat-directions.png, cat-run.png, ...)
  *-manifest.json     → Per-action processing metadata

scripts/
  process-video.mjs   → FFmpeg frame extraction + green-screen chroma key + sprite packing
  process-run-video.mjs → Same pipeline for action videos (run, eat, play, jump, sleep, walk)
  validate-assets.mjs → Checks frame counts, sprite dimensions, alpha stats, angle sequence
```

## Key constants (all in `src/angle-config.js`)

- `HEAD_CENTER = { x: 314, y: 202 }` — cat head anchor point in the source 960×960 frame
- `IDLE_RADIUS = 120` — distance threshold (in source pixels) below which the cat stays at idle frame
- `IDLE_FRAME = 117` — frame shown when cursor is close to the head
- `SOURCE_FRAME_COUNT = 169` — total frames in the head-turning sequence
- `PET_WINDOW = { width: 280, height: 280, marginRight: 28, marginBottom: 28 }` — Electron window size and default screen edge margins
- `ANGLE_ANCHORS` — maps screen angles (0–360°, 0 = cursor directly above cat) to frame numbers; `frameForAngle(angle)` interpolates between them

Sprite sheets are 13 columns × N rows (169 frames = 13×13; variable for walk actions). The sprite grid is addressed as percentage background-position.

## Chroma key pipeline

Both `process-video.mjs` and `process-run-video.mjs` use `ffmpeg-static` to extract frames, then `pngjs` to read pixel data and perform green-screen matting:

- Base green: `[56, 166, 35]` with color-distance + green-dominance heuristics
- Shadow detection channel for contact shadows
- Hard cleanup pass: any still-green pixel → fully transparent
- Green spill suppression on semi-transparent edges
- Small internal transparent holes patched from neighboring opaque pixels

Changing the green-screen thresholds or adding new actions requires re-running the relevant `process:*` command followed by `npm run validate`.

## Desktop behavior

- `main.js` polls `screen.getCursorScreenPoint()` at ~60fps, sends `{ cursor, windowBounds, locked }` to the renderer via IPC
- When locked (tray menu), `setIgnoreMouseEvents(true, { forward: true })` passes clicks through
- Walking moves the Electron window horizontally within the display work area, reversing direction at edges
- The renderer runs a `requestAnimationFrame` loop: in tracking mode it smooth-interpolates angle (0.22 factor) and frame (0.24 factor) toward the target; in action mode it advances by elapsed time × fps
- Action sprites replace the direction sprite entirely (single layer, no cross-fade)

## Tuning workflow

1. Adjust `ANGLE_ANCHORS` in `src/angle-config.js` if head tracking angles are off
2. Run `npm run validate` to verify continuity
3. Run `npm start` to test the pet
4. If green-screen matting needs adjustment, edit the thresholds in `scripts/process-video.mjs` / `scripts/process-run-video.mjs`, then re-run the corresponding `process:*` command
