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
- `src/app-factory.js`
- `src/launcher.js`
- `src/lifx-controller.js`
- `src/lifx-client-registry.js`
- `src/known-device-service.js`
- `src/light-state-service.js`
- `src/lifx-command-runner.js`
- `src/controller-status-service.js`
- `src/lifx-command-utils.js`
- `src/domain-utils.js`
- `src/known-device-model.js`
- `src/status-model.js`
- `src/json-store.js`
- `src/network-interfaces.js`
- `src/controller-config-store.js`
- `src/known-devices-store.js`
- `src/scene-store.js`
- `src/config.js`
- `src/app-paths.js`

### Frontend

Important files:

- `public/index.html`
- `public/app.js`
- `public/api.js`
- `public/state/app-store.js`
- `public/lib/`
- `public/ui/`
- `public/styles.css`
- `public/styles/`

### Shared pure logic

Important files:

- `shared/domain.js`

### Config

- scene definitions: `config/scenes.json`
- tracked controller config: `config/options.json`
- gitignored device targeting state: `config/known-devices.json`

### Packaging helpers

- `platypus-textwindow-entry.js`
- `platypus-webview-entry.js`

These wrapper entry scripts exist because Platypus renames the selected script to
`Contents/Resources/script`, which breaks direct relative imports if you point Platypus
at the real runtime modules. The wrappers bridge from the Platypus entrypoint back to the
actual app files in bundled or symlinked `src/`.

## Important Runtime Model

Normal local startup is:

- `npm start`
- which runs `node src/launcher.js`
- which supervises `src/server.js`
- and `src/server.js` now boots the Express app through `src/app-factory.js`

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

Non-absolute environment override paths such as `SCENES_PATH`, `CONTROLLER_CONFIG_PATH`, and
`KNOWN_DEVICES_PATH` are resolved relative to the app root.

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

The current controller split is:

- `src/lifx-controller.js` is the orchestrator facade
- `src/lifx-client-registry.js` owns interface-bound clients and discovery events
- `src/light-state-service.js` owns the in-memory state cache and 3s polling loop
- `src/known-device-service.js` owns local persisted device properties
- `src/lifx-command-runner.js` owns scene and live-brightness command execution
- `src/controller-status-service.js` assembles serialized light/status payloads

## Targeting Model

Targeting is per-device only.

Persistent keys in `config/options.json`:

- `transitionDurationMs`
- `defaultSceneKelvin`

Persistent keys in `config/known-devices.json`:

- `devices`
  - `id`
  - `enabled`
  - `color` when capability metadata has been discovered

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
- missing scene Kelvin values fall back to `config/options.json` `defaultSceneKelvin`

## Scene Transition Behavior

Current intent:

- already-on bulbs: color and brightness transition together using the global duration
- off bulbs: set target color at 1%, turn on, then transition to target brightness

This behavior was tuned to avoid visually jarring “old color first” transitions.

Do not casually change this without testing perceptual behavior, not just protocol correctness.

## Brightness Override

There is a separate `Brightness Override` slider in controller status.

Intent:

- adjust brightness in real time after a scene is applied
- preserve current hue/saturation/kelvin
- operate separately from the scene-application path

Implementation touches:

- `public/index.html`
- `public/app.js`
- `public/state/app-store.js`
- `public/lib/live-command-queue.js`
- `public/ui/controller-status.js`
- `src/app-factory.js`
- `src/lifx-controller.js`

Current API route:

- `POST /api/brightness`

Important behavior:

- slider affects targeted online bulbs
- preserves bulb color state
- `0%` turns bulbs off
- moving back up from `0%` powers them on again while preserving color

### Brightness override tuning

At the time this file was written, the live brightness tuning settled on:

- frontend dispatch cadence: `100ms`
- backend live brightness command transition: `100ms`

This was chosen by visual testing.

Lower values were tried and felt worse.

### Polling during brightness drag

Important frontend decision:

- do not continuously refresh device swatches/status while the brightness slider is being dragged
- update slider locally during drag
- delay status refresh until shortly after the drag settles

Reason:

- continuous polling/re-rendering made drag feel jerkier, especially on touch devices

### Scene editor live preview

The scene editor uses the same fast live-control model as brightness override:

- frontend dispatch cadence: `100ms`
- backend preview transition: `100ms`
- preview commands should not overwrite `lastAction`
- saving a scene should persist the draft, not re-apply it again
- scene preview is sent through `POST /api/scene-preview`
- editor live preview and brightness override share a reusable frontend live-command queue in `public/lib/live-command-queue.js`

## Device State / Polling

Per-bulb live state is cached in memory:

- `LightStateService.cache` in `src/light-state-service.js`

Current cached fields:

- `power`
- `hue`
- `saturation`
- `brightness`
- `kelvin`
- `updatedAt`

Normal background polling interval:

- `3000ms`

But note:

- scene application blocks refreshes temporarily
- brightness override drag also suppresses refresh churn
- scene editor preview also suppresses refresh churn while editing

For scene application specifically:

- refreshes are held for `transitionDurationMs + 250ms`
- then a one-shot refresh runs

Important current behavior:

- the UI now updates immediately from optimistic cache writes after scene apply, scene preview, and brightness override commands
- later polling reconciles back to actual bulb-reported state
- this is intentional and should not be mistaken for a faster poll interval

## UI Semantics

### Devices section

The UI uses `Devices`, not “Discovery Snapshot”.

Devices are grouped by subnet/IP group.

### Device cards

Current card design:

- swatch
- label
- brightness + hue or brightness + kelvin line depending on current state
- IP
- device ID
- green/red connectivity badge using icon-only `wifi` / warning glyphs
- RGB / White capability indicator from discovery-time hardware metadata
- clickable icon-only enable/disable target toggle

### Disabled visuals

Disabled individual devices are intentionally greyed out.

Reason:

- neutral disabled styling was preferred over alarm-like red styling

Subnet group panels are not dimmed.

### Swatches

Swatches are display-oriented approximations, not exact photometric renderings.

Important details:

- off bulbs use a slashed outlined circle, not grey fill
- white-spectrum bulbs use a curated kelvin mapping to look closer to real warm/cool white
- modern browsers use an OKLCH-based preview path with separate lightness curves for saturated color vs white-temperature scenes
- fallback remains RGB for older environments / Web Views

### Scene trigger icons

The scene trigger icon is intentionally rendered as a normal SVG `<img>`, not a CSS mask.

Reason:

- Platypus Web View rendered CSS mask icons poorly

Do not switch back to CSS masks unless you re-test packaged Web View rendering.

### Scene cards / editor

Current important UI behavior:

- scene cards are reused in place during polling; do not casually revert to full card re-creation or the icons will flicker again
- only one scene can be edited at a time
- the editor is a standalone full-width panel below the scene grid, not inline inside a card
- on mobile widths, opening the editor scrolls to it; on larger widths it does not
- while editing, the active source scene card stays normal and all other scene cards are dimmed and disabled
- scene-card border indicates the last applied scene
- scene-button feedback (`Applied` / `Updated`) is temporary and reverts to the send icon after 4 seconds
- saving a scene should not trigger a second apply; live preview already moved the bulbs

### Controller status panel

Current layout:

- `Restart Server` stays in controller status
- `Rescan LAN` sits beside the `Devices` section heading
- controller metrics are:
  - `Brightness Override`
  - `Transition Duration`
  - `Enabled / Available`

### Sliders

Slider thumbs were deliberately styled to be:

- larger
- easier to see
- easier to grab on iPad

The filled track amount is intentionally visible.

### Older Safari / iOS compatibility

The browser UI has a small compatibility layer to keep the app operational on older Safari builds,
including iOS 12 Safari on older iPads.

Current intent:

- operational support only for old Safari
- preserve scene triggering and target enable/disable controls
- do not chase full visual parity with current Safari/Chrome

Current compatibility touchpoints:

- `public/lib/dom-utils.js`
- `public/app.js`
- `public/ui/scene-editor.js`
- `shared/domain.js`

Important:

- the compatibility code is intentionally commented so it can be removed later
- prefer keeping these shims isolated instead of spreading old-browser conditionals everywhere
- avoid adding more old-iOS-specific UI workarounds unless a control is operationally important

Known acceptable degradation on old iOS Safari:

- slider drag feel may be rougher than on modern devices
- scene editor visuals such as the hue wheel may render imperfectly or not at all
- editing is not currently treated as a critical old-device workflow

## API Surface

Current routes are registered in `src/app-factory.js` and booted by `src/server.js`:

- `GET /api/status`
- `POST /api/scenes/:sceneId`
- `PUT /api/scenes/:sceneId`
- `POST /api/scene-preview`
- `POST /api/discover`
- `POST /api/targets`
- `POST /api/address-groups`
- `POST /api/transition-duration`
- `POST /api/brightness`
- `POST /api/restart`

If API changes are made, update the README API section too.

## Platypus Context

Platypus is currently used as a practical packaging wrapper to create a standalone mac desktop app.

Two entry scripts exist:

- `platypus-textwindow-entry.js`
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

At the time this file was written:

- the package name in `package.json` is `offline-lifx-lan`

Be careful when renaming the actual folder:

- the current Codex thread/workspace path can break
- Platypus symlinks may also need to be updated

## README / NOTES

Before making major architectural changes, consult `README.md` and get confirmation if proposed work would conflict with the documented intent

This `AGENTS.md` should stay focused on instructions and operational context for future agent work.

## Practical Guidance For Future Threads

- Prefer preserving the current multi-interface LAN design.
- Prefer preserving the current per-device targeting model.
- Do not reintroduce expected bulb-count logic.
- Treat scene transitions and brightness override as separate behaviors.
- Treat device targeting toggles as local persisted UI state, not as a bulb-state/network operation.
- Preserve the optimistic-cache + later-reconciliation model unless you are intentionally redesigning status behavior.
- Keep `public/app.js` as a thin bootstrap that wires DOM, state, API actions, and UI modules together.
- If touching `public/ui/scene-grid.js` or `public/ui/device-grid.js`, protect the current keyed DOM-reuse approach for scene cards and device cards.
- Re-test Platypus behavior after changes to icons, lifecycle, or path resolution.
- If backend code changes while the app is running, use the in-app `Restart Server` button to reload it.
- If frontend-only code changes, a normal refresh is usually enough.
- Run `npm test` after meaningful changes.
