# AGENTS.md

This file contains project-specific guidance for future Codex threads working in this repo.

## Project Purpose

This repo is a local/offline smart-home controller for LIFX bulbs.

Goals:

- use the LIFX LAN protocol only
- no dependency on the LIFX cloud API
- run locally on a Mac
- serve a browser UI for scenes and manual control
- support multiple local subnets/interfaces from the same Mac

Primary stack:

- Node.js
- Express
- `lifx-lan-client`
- static frontend from `public/`

## High-level Architecture

### Backend

Important files:

- `src/server.js`
- `src/launcher.js`
- `src/lifx-controller.js`
- `src/network-interfaces.js`
- `src/controller-config-store.js`
- `src/config.js`
- `src/app-paths.js`

### Frontend

Important files:

- `public/index.html`
- `public/app.js`
- `public/styles.css`

### Config

- scene definitions: `config/scenes.json`
- tracked controller config: `config/options.json`
- gitignored device targeting state: `config/known-devices.json`

### Packaging helpers

- `platypus-entry.js`
- `platypus-webview-entry.js`

## Important Runtime Model

Normal local startup is:

- `npm start`
- which runs `node src/launcher.js`
- which supervises `src/server.js`

Do not remove the launcher casually.

Reasons:

- the UI `Restart Server` button depends on the launcher
- the launcher is also where single-instance locking happens

## Single-instance Guard

This repo intentionally prevents duplicate controller stacks from starting from the same app root.

Implementation:

- `src/single-instance-lock.js`
- called from `src/launcher.js`

Do not remove this without understanding why it was added.

Reason:

- duplicate stacks can both hold LIFX UDP sockets
- only one may own TCP `:3000`, but extra processes can still interfere with LAN discovery/control

Current lock naming uses the package identity, not the folder name.

## Path Resolution Rules

This repo intentionally resolves runtime files from the app root, not from `process.cwd()`.

Implementation:

- `src/app-paths.js`

This was necessary to support Platypus bundling and is also more robust for normal use.

Do not revert back to cwd-relative path logic unless you understand the packaging implications.

Affected areas:

- launcher child path resolution
- config file resolution
- scene path resolution
- controller config path resolution

## LIFX-specific Decisions

### Use the library, not a custom protocol stack

This app is intentionally built on top of `lifx-lan-client`.

Do not replace it with raw packet handling unless there is a strong reason.

### One LIFX client per active LAN interface

This is an important design decision.

Do not collapse back to one global LIFX client.

Reason:

- the app needs to reach bulbs across multiple local interfaces/subnets
- a single client/bind context was unreliable in that topology

The controller creates one `Client` per active private IPv4 interface.

## Targeting Model

Targeting is per-device only.

Persistent keys in `config/options.json`:

- `transitionDurationMs`

Persistent keys in `config/known-devices.json`:

- `enabledIds`
- `disabledIds`

Important:

- subnet buttons are only bulk actions over device IDs
- there is no subnet-level persisted inclusion/exclusion model
- there is no whitelist mode where selecting one bulb implies all others are disabled

Avoid reintroducing:

- `targets.json`
- subnet-level persisted targeting
- complicated override logic

## Scene Model

Scene definitions live in `config/scenes.json`.

Current schema:

- `id`
- `name`
- `description`
- `power`
- `hue`
- `saturation`
- `brightness`
- `kelvin`

Per-scene durations were intentionally removed.

Current timing model:

- one global transition duration
- controlled by the UI
- stored in `config/options.json` as `transitionDurationMs`

## Scene Transition Behavior

Current intent:

- already-on bulbs: color and brightness transition together using the global duration
- off bulbs: set target color at 1%, turn on, then transition to target brightness

This behavior was tuned to avoid visually jarring “old color first” transitions.

Do not casually change this without testing perceptual behavior, not just protocol correctness.

## Manual Brightness Control

There is a separate “Manual Brightness” slider in controller status.

Intent:

- adjust brightness in real time after a scene is applied
- preserve current hue/saturation/kelvin
- operate separately from the scene-application path

Implementation touches:

- `public/index.html`
- `public/app.js`
- `src/server.js`
- `src/lifx-controller.js`

Current API route:

- `POST /api/brightness`

Important behavior:

- slider affects targeted online bulbs
- preserves bulb color state
- `0%` turns bulbs off
- moving back up from `0%` powers them on again while preserving color

### Manual brightness tuning

At the time this file was written, the live brightness tuning settled on:

- frontend dispatch cadence: `100ms`
- backend live brightness command transition: `100ms`

This was chosen by visual testing.

Lower values were tried and felt worse.

### Polling during manual brightness drag

Important frontend decision:

- do not continuously refresh device swatches/status while the brightness slider is being dragged
- update slider locally during drag
- delay status refresh until shortly after the drag settles

Reason:

- continuous polling/re-rendering made drag feel jerkier, especially on touch devices

## Device State / Polling

Per-bulb live state is cached in memory:

- `this.lightStateCache` in `src/lifx-controller.js`

Current cached fields:

- `power`
- `hue`
- `saturation`
- `brightness`
- `kelvin`
- `updatedAt`

Normal background polling interval:

- `2000ms`

But note:

- scene application blocks refreshes temporarily
- manual brightness drag also suppresses refresh churn

## UI Semantics

### Devices section

The UI uses `Devices`, not “Discovery Snapshot”.

Devices are grouped by subnet/IP group.

### Device cards

Current card design:

- swatch
- label
- brightness/hue/kelvin line
- IP
- device ID
- `Online` / `Offline` badge
- clickable `Enabled` / `Disabled` badge

### Disabled visuals

Disabled devices/subnet groups are intentionally greyed out.

Reason:

- neutral disabled styling was preferred over alarm-like red styling

### Swatches

Swatches are display-oriented approximations, not exact photometric renderings.

Important details:

- off bulbs use a slashed outlined circle, not grey fill
- white-spectrum bulbs use a curated kelvin mapping to look closer to real warm/cool white
- brightness is visually compressed so low-brightness bulbs remain legible in the UI

### Scene trigger icons

The scene trigger icon is intentionally rendered as a normal SVG `<img>`, not a CSS mask.

Reason:

- Platypus Web View rendered CSS mask icons poorly

Do not switch back to CSS masks unless you re-test packaged Web View rendering.

### Sliders

Slider thumbs were deliberately styled to be:

- larger
- easier to see
- easier to grab on iPad

The filled track amount is intentionally visible.

## API Surface

Current routes in `src/server.js`:

- `GET /api/status`
- `POST /api/scenes/:sceneId`
- `POST /api/discover`
- `POST /api/targets`
- `POST /api/address-groups`
- `POST /api/transition-duration`
- `POST /api/brightness`
- `POST /api/restart`

If API changes are made, update the README API section too.

## Platypus Context

Platypus is currently used as a practical packaging wrapper.

Two entry scripts exist:

- `platypus-entry.js`
- `platypus-webview-entry.js`

### Important Web View behavior

`platypus-webview-entry.js`:

- starts the controller stack
- renders a simple boot/loading HTML page
- then hands off to `http://127.0.0.1:3000`

Important lifecycle rule:

- quitting the Platypus app must also stop the launcher/server
- earlier detached-child behavior caused orphaned Node processes
- do not reintroduce detached background behavior casually

### Bundle contents

Expected bundled files for Platypus:

- `src`
- `public`
- `config`
- `node_modules`
- `package.json`

`package.json` is required because the app uses ESM via `"type": "module"`.

### Symlink-based development

At times the Platypus app may use symlinks pointing back to this repo for live iteration.

That means:

- repo file changes can affect the running bundled app directly
- be careful when changing entry scripts or server lifecycle behavior

## Naming Caveat

There has been discussion of renaming the repo/folder to `offline-lifx-lan`.

At the time this file was written:

- the package name in `package.json` is `offline-lifx-lan`

Be careful when renaming the actual folder:

- the current Codex thread/workspace path can break
- Platypus symlinks may also need to be updated

## README / NOTES

Before making major architectural changes, read:

- `README.md`
- `NOTES.md`

`NOTES.md` is the fuller historical rationale document.

This `AGENTS.md` should stay focused on instructions and operational context for future agent work.

## Practical Guidance For Future Threads

- Prefer preserving the current multi-interface LAN design.
- Prefer preserving the current per-device targeting model.
- Do not reintroduce expected bulb-count logic.
- Treat scene transitions and manual brightness as separate behaviors.
- Re-test Platypus behavior after changes to icons, lifecycle, or path resolution.
- If backend code changes while the app is running, use the in-app `Restart Server` button to reload it.
- If frontend-only code changes, a normal refresh is usually enough.
- Run `npm test` after meaningful changes.
