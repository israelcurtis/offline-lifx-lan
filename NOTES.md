# Engineering Notes

This file captures the key architectural decisions and tradeoffs made while building this repo, so a future thread can recover intent without needing the full conversation history.

## Project Goal

This app is an entirely local/offline LIFX LAN controller for macOS:

- no LIFX cloud API
- direct LIFX LAN UDP communication via `lifx-lan-client`
- simple browser UI served locally
- intended to work across multiple local subnets/interfaces on the same Mac

Primary runtime stack:

- backend: Node.js + Express
- LIFX transport: `lifx-lan-client`
- frontend: static HTML/CSS/JS from `public/`

## Core Architecture

### LIFX Control

The app is built on top of `lifx-lan-client`, not a custom raw-protocol implementation.

- `src/lifx-controller.js` wraps the library
- discovery, `getState`, `color`, `on`, and `off` all go through `lifx-lan-client`

### Multi-interface discovery

Important decision: one LIFX client per active private IPv4 LAN interface/subnet.

Reason:

- a single client/bind context was unreliable across multiple subnets on a dual-homed Mac
- some bulbs only resolved labels and responded correctly when discovered from the correct local interface

Implementation:

- `src/network-interfaces.js` enumerates active interfaces
- `src/lifx-controller.js` creates one `Client` per interface
- subnet grouping in the UI is based on discovered bulb IP groupings such as `10.0.0.x`, `192.168.5.x`, etc.

### Browser app

The browser UI is intentionally simple and serves as the main control surface:

- scene triggers
- device lists grouped by subnet
- per-device enable/disable
- subnet bulk enable/disable
- transition duration slider
- manual brightness slider
- restart/rescan controls

## Process Model

### Normal local run

Normal startup is:

`npm start` -> `node src/launcher.js` -> `node src/server.js`

Why the launcher exists:

- enables in-app `/api/restart`
- supervises the child server process

### Single-instance guard

`src/launcher.js` uses `src/single-instance-lock.js` to prevent duplicate controller stacks from being started from the same repo/app root.

Reason:

- duplicate stacks caused confusing behavior
- only one process owned TCP `:3000`, but extra stale processes could still hold active UDP sockets and interfere with LIFX discovery/control

Current behavior:

- a second `npm start` exits immediately with an “another instance is already running” message
- the lock is per app root, not global to all Node apps

## Path Resolution

### App-root-based path resolution

Important cleanup: runtime file resolution no longer depends on `process.cwd()`.

This is handled through:

- `src/app-paths.js`

Reason:

- cwd-relative paths were fragile
- Platypus bundling exposed this immediately
- app-root-relative resolution is more deterministic in both normal and bundled environments

Affected files:

- `src/launcher.js`
- `src/config.js`
- `src/controller-config-store.js`

Environment override paths like `SCENES_PATH`, `CONTROLLER_CONFIG_PATH`, and `KNOWN_DEVICES_PATH` are now resolved relative to the app root if they are not absolute.

## Configuration Model

### Persistent controller config

Persistent controller state lives in:

- `config/options.json`

Current keys:

- `transitionDurationMs`
- `defaultSceneKelvin`

Per-machine known-device targeting state lives in:

- `config/known-devices.json`

Current keys:

- `enabledIds`
- `disabledIds`

Important simplification:

- there is no subnet-level persisted targeting model anymore
- subnet buttons are only bulk actions that update per-device state
- there is no “manual whitelist mode” where selecting one bulb implicitly excludes all others

Effective targeting model:

- all discovered bulbs default to enabled unless explicitly disabled
- per-device `Enabled` / `Disabled` state is the single source of truth
- subnet toggles are just macros over device IDs

## Scene Behavior

### Global transition timing

Per-scene durations were removed.

Current model:

- one global transition duration
- stored in `config/options.json` as `transitionDurationMs`
- controlled from the UI slider
- missing scene Kelvin values fall back to `config/options.json` `defaultSceneKelvin`

### Scene transitions

Scene buttons trigger synchronized updates across currently targeted online bulbs.

Important behavior decisions:

- bulbs already on:
  - scene color and brightness transition together in one command using the global duration
- bulbs off:
  - set target color at 1% brightness
  - turn on
  - transition to final target brightness/color

Reason:

- avoids “old color first, then brightness” visual jank
- preserves smoother cold-start behavior

`All Off` uses the same global transition timing.

## Manual Brightness Control

### Intent

The manual brightness slider is a separate control path from scene application.

It exists for:

- real-time post-scene brightness adjustment
- preserving the current hue/saturation/kelvin already set on the bulbs

It should only change brightness, not color.

### Current behavior

Implemented in:

- backend: `src/lifx-controller.js`
- API: `POST /api/brightness`
- UI: `public/index.html` + `public/app.js`

Current design:

- only affects targeted online bulbs
- preserves each bulb’s current hue, saturation, and kelvin
- can bring bulbs back up from `0%` after turning them off
- does not continuously re-render device swatches while dragging

Current timing:

- frontend dispatch cadence: `100ms`
- per-command live brightness transition: `100ms`

This value was tuned by eye for smoother visual feel. Earlier attempts at `20ms`, `40ms`, `50ms`, and `75ms` were tried; `100ms` was judged best visually at the time of writing.

### Live brightness drag behavior

Important frontend decision:

- device swatch/status polling is suppressed while dragging the brightness slider
- the slider updates locally while dragging
- status refresh is deferred until after drag settles

Reason:

- continuous status polling/swatches during drag caused visible UI churn and made the slider feel jerkier, especially on iPad

### Manual brightness and off bulbs

Important edge case:

- dragging to `0%` turns targeted bulbs off
- dragging back up powers them on again while preserving their current color state

This was broken briefly during anti-flicker work and was explicitly restored.

## Device State and Polling

### Live state cache

Current per-bulb state is in-memory only:

- stored in `this.lightStateCache` in `src/lifx-controller.js`

Each entry holds:

- `power`
- `hue`
- `saturation`
- `brightness`
- `kelvin`
- `updatedAt`

### Polling

Normal background poll interval:

- `2000ms`

Important nuance:

- there is also a targeted refresh after scene transitions
- refreshes are deliberately blocked during certain transitions so swatches do not flash intermediate states

For scene application:

- polling is paused for `transitionDurationMs + 250ms`
- then a one-shot refresh runs

For manual brightness drag:

- polling is deferred while dragging
- then refreshed after the drag settles

## UI Decisions

### Devices section

The “Discovery Snapshot” concept was renamed to just `Devices`.

Current device UI decisions:

- grouped by subnet/IP group
- device cards show:
  - swatch
  - label
  - brightness/hue/kelvin
  - IP
  - device ID
  - `Online` / `Offline` badge
  - `Enabled` / `Disabled` clickable badge

### Swatch rendering

Swatches are intentionally display-oriented, not photometrically exact.

Important swatch decisions:

- off bulbs are shown as an outlined circle with a diagonal slash, not grey
- saturated colors use HSB -> RGB approximation
- white-spectrum bulbs use a curated kelvin-to-RGB interpolation that visually matches warm/cool white better than a naive conversion
- nonzero brightness is visually compressed so low-brightness bulbs are still distinguishable in the UI

### Disabled visuals

Disabled/non-targeted devices and subnet groups are visually greyed out.

Reason:

- standard “disabled” affordance is easier to scan than red warning styling

### Scene buttons

Scene cards:

- use thicker consistent borders so active state does not shift layout
- active scene uses a blue applied state
- inactive trigger button uses an icon, not text

Important icon decision:

- switched from CSS mask rendering to a plain SVG `<img>`
- reason: Platypus Web View rendered CSS mask icons poorly

### Slider styling

Both sliders now have:

- custom larger thumb styling
- darker thumb outline
- visible filled track amount

Reason:

- default slider thumbs were too small and too hard to see, especially on iPad

## API Surface

Current API routes live in `src/server.js`:

- `GET /api/status`
- `POST /api/scenes/:sceneId`
- `POST /api/discover`
- `POST /api/targets`
- `POST /api/address-groups`
- `POST /api/transition-duration`
- `POST /api/brightness`
- `POST /api/restart`

README also contains a basic API section now.

## Platypus Packaging

### General status

Platypus was used as a practical macOS wrapper experiment, not as the ideal long-term architecture.

There are two Platypus entry files at the repo root:

- `platypus-entry.js`
- `platypus-webview-entry.js`

### Why wrapper entry files exist

Platypus renames the selected script to `Contents/Resources/script`.

That breaks direct relative imports if you point Platypus at `src/launcher.js`.

So the wrapper scripts exist to bridge from the Platypus entrypoint to the real app code in bundled/symlinked `src/`.

### Web View mode

`platypus-webview-entry.js` is intended for Platypus Web View mode.

Current behavior:

- starts the controller via the launcher
- outputs a small HTML boot page
- hands off to `http://127.0.0.1:3000`

Important lifecycle fix:

- the Web View wrapper originally detached the launcher and left orphaned processes running after quit
- this was fixed so the wrapper now owns the child lifecycle and kills the launcher/server when the app exits

### Bundled files

Recommended Platypus bundle contents:

- `src`
- `public`
- `config`
- `node_modules`
- `package.json`

During development, symlinking these back to the repo is acceptable and avoids rebuilds for every change.

## Known Tradeoffs / Future Direction

### Platypus is acceptable but not ideal

Platypus works as a wrapper, but it is probably not the ideal long-term solution.

Reasons:

- extra process layers
- UI shell quirks
- lifecycle complexity
- not a natural path toward iOS

### Better future architecture

Most likely long-term direction:

- Node controller remains a local service
- macOS packaging eventually moves toward a more native service model such as `launchd`
- optional native menubar helper can sit on top

If iOS becomes a real target, likely paths are:

- iOS app as a remote UI for a Mac-hosted controller
- or eventual native Swift LAN implementation if direct device control must happen on iOS itself

## Naming / Repo State

There was a temporary in-repo rename to `offline-lifx-lan` for package identity testing.

At the time of this note:

- the package name in `package.json` is `offline-lifx-lan`

Be careful if renaming the actual repo directory:

- current Codex thread/workspace path may depend on the old path
- Platypus symlinks may also depend on the old path

## Practical Restart Notes

When backend code changes:

- use the UI `Restart Server` button if the app is already running via the launcher

When frontend-only code changes:

- a normal refresh is usually enough

When using a Platypus symlink-based bundle:

- changes in the linked repo files take effect without rebuilding
- but lifecycle/entrypoint changes may still require quitting and relaunching the bundled app
