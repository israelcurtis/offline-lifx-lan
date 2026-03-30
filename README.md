# LIFX LAN Controller

Offline local controller for LIFX bulbs using the LIFX LAN protocol and a browser UI. It runs on your device via npm, talks directly to bulbs over UDP through [`lifx-lan-client`](https://github.com/node-lifx/lifx-lan-client), and does not depend on the LIFX cloud API.

## Current capabilities

- Discovers bulbs across multiple active private IPv4 interfaces on the host.
- Works across separate local subnets when the Mac has reachability to them.
- Applies preset scenes with one global transition duration.
- Lets you edit existing scenes in the browser UI.
- Supports live scene preview while editing, without saving first.
- Supports `Color`, `White`, and `Off` scene modes in the editor.
- Lets you adjust a global `Brightness Override` slider after a scene is applied.
- Groups devices by subnet and supports per-device and bulk subnet targeting.
- Discovers and caches per-device RGB vs white-only capability metadata during LAN scans.
- Persists tracked global options separately from gitignored local device state.

## Run

1. Install dependencies:

```sh
npm install
```

2. Start the app:

```sh
npm start
```

3. Open [http://localhost:3000](http://localhost:3000).

`npm start` runs the launcher wrapper, which is required for the in-app `Restart Server` button and the single-instance guard.

The server binds to `0.0.0.0` by default, so it remains reachable from your LAN and is compatible with containerized deployment. When running locally on your Mac, `http://localhost:3000` still works normally.

## Development

```sh
npm run dev
npm test
```

`npm run dev` runs the server directly with Node watch mode.

## Platypus Packaging

If you want to wrap the controller as a macOS app with Platypus, there are two entry scripts in the repo root:

- `platypus-textwindow-entry.js`
  - Use this for Platypus `Text Window` mode. It starts the controller stack and routes stdout to the text window. Open `http://127.0.0.1:3000` in an external browser.
- `platypus-webview-entry.js`
  - Use this for Platypus `Web View` mode. It starts the local controller and then hands off to the browser UI inside the Platypus window.

Recommended bundled files:

- `src`
- `public`
- `config`
- `node_modules`
- `package.json`

Notes:

- The app uses ES modules, so `package.json` must be present in the bundle because it provides `"type": "module"`.
- The Platypus Web View wrapper expects the local controller UI to be served from `http://127.0.0.1:3000`.
- If your Platypus app uses symlinks back to this repo during development, linked file changes can affect the running app directly.

## Configuration

Supported environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port for the local UI |
| `HOST` | `0.0.0.0` | Bind address for the local UI |
| `DISCOVERY_WAIT_MS` | `4000` | Delay after manual LAN rescan before returning |
| `LIFX_TARGET_LABELS` | empty | Optional fixed bulb-label filter |
| `LIFX_TARGET_IDS` | empty | Optional fixed bulb-id filter |
| `LIFX_TARGET_ADDRESSES` | empty | Optional fixed IP-address filter |
| `SCENES_PATH` | `config/scenes.json` | Alternate scene definition file |
| `CONTROLLER_CONFIG_PATH` | `config/options.json` | Alternate tracked options file |
| `KNOWN_DEVICES_PATH` | `config/known-devices.json` | Alternate local device-state file |

If any of the fixed `LIFX_TARGET_*` filters are set, manual enable/disable controls in the UI are treated as unavailable because targeting is then defined by environment configuration.

For Docker or another remote host, keep `HOST=0.0.0.0` so the service is reachable outside the container. You can still browse it locally at `http://localhost:3000` when the container port is published to your Mac.

## Persistent state

Tracked controller options live in `config/options.json`.

Current keys:

- `transitionDurationMs`
- `defaultSceneKelvin`

Per-machine device targeting state lives in `config/known-devices.json`, which is intentionally gitignored.

Current shape:

- `devices`
  - `id`
  - `enabled`
  - `color` when hardware capability has been discovered

If `config/known-devices.json` does not exist yet, the app starts with empty local targeting state and creates the file after discovery/status sync adds known bulbs.

## Scenes

Scene definitions live in `config/scenes.json`.

Each scene supports:

- `id`
- `name`
- `description`
- `power`
- `hue`
- `saturation`
- `brightness`
- `kelvin`

Notes:

- Scene IDs are derived from scene names when editing through the UI.
- Per-scene transition durations are not supported. Transition timing is global.
- Missing scene Kelvin values are normalized from `config/options.json` `defaultSceneKelvin`.
- `Off` scenes still carry a Kelvin value so switching back to `White` mode starts from the global default.

## Browser UI

The browser interface currently includes:

- preset scene cards with color-preview trigger buttons
- a standalone scene editor below the scene grid
- live scene preview while dragging editor controls
- `Brightness Override` and transition duration sliders in controller status
- `Restart Server` in controller status
- `Rescan LAN` beside the `Devices` section header
- subnet-grouped device lists
- per-device icon-only enable/disable target toggle
- per-device RGB / White capability indicator based on discovery-time hardware metadata
- subnet-level `Enable All` / `Disable All` buttons
- live device swatches and state readout

Current frontend behavior is split by role:

- state and optimistic UI behavior live in `public/state/app-store.js`
- status/device/scene rendering lives in `public/ui/`
- shared browser logic lives in `public/lib/`
- `public/app.js` should stay a thin composition/bootstrap file

Current editor behavior:

- only one scene can be edited at a time
- the editor supports `Color`, `White`, and `Off` light modes
- non-edited scene cards are dimmed and disabled while editing
- on mobile widths, opening a scene editor scrolls to the editor section

## Browser compatibility

The frontend is primarily tuned for current desktop and mobile browsers, but it now includes a
small compatibility layer so the app remains operational on older Safari builds such as iOS 12
Safari on older iPads.

This support is intentionally limited in scope:

- scene triggering should work
- per-device and subnet target enable/disable controls should work
- status loading and basic slider operation should work

This support is not intended to provide full UI parity on those older browsers:

- slider interaction may feel rougher
- some editor visuals, especially the hue wheel, may degrade or fail to render
- old-browser accommodations are kept isolated and minimal on purpose

## Polling and state behavior

The app uses a mixed optimistic + reconciled status model:

- background polling runs every `3000ms`
- scene applies, live editor preview, and brightness override update the in-memory state cache immediately
- the UI therefore updates right away to the commanded target state
- later polling reconciles the UI back to actual bulb-reported state if a bulb missed a command

This is intentional. It keeps the UI responsive while still allowing correction after dropped UDP commands or stale assumptions.

Implementation note:

- the live cache and polling loop are owned by `src/light-state-service.js`

## API

All API routes are served from the same local app process as the browser UI.

### `GET /api/status`

Returns the full controller status payload used by the UI, including:

- discovered devices
- subnet groups
- canonical `knownDevices` local device records
- online and enabled counts
- global transition duration
- global default scene Kelvin
- available scenes
- last scene action
- per-light capability metadata and current cached state

### `POST /api/scenes/:sceneId`

Triggers a scene by ID.

Response shape:

- `ok`
- `scene`
- `lastAction`
- `status`

If the scene ID does not exist, the route returns `404` with `{ ok: false, error }`.

### `PUT /api/scenes/:sceneId`

Updates an existing scene and persists the edited scene list back to the configured `scenes.json` file.

Request body:

```json
{
  "name": "Gentle Evening",
  "description": "Soft warm white",
  "power": "on",
  "hue": 35,
  "saturation": 0.22,
  "brightness": 0.6,
  "kelvin": 3200
}
```

Notes:

- the saved scene ID is derived from `name`
- saving persists the scene definition only
- live scene preview is handled separately through `/api/scene-preview`

### `POST /api/scene-preview`

Sends a fast live preview command for the scene editor without saving `scenes.json` or changing the controller's persisted last-applied scene metadata.

Request body:

```json
{
  "power": "on",
  "hue": 35,
  "saturation": 0.22,
  "brightness": 0.6,
  "kelvin": 5500
}
```

### `POST /api/discover`

Forces a fresh LAN discovery pass and returns the updated status payload.

### `POST /api/targets`

Replaces the locally persisted per-device targeting records used by the web UI.

Request body:

```json
{
  "devices": [
    { "id": "d073d5837b0b", "enabled": true },
    { "id": "d073d582392d", "enabled": false }
  ]
}
```

Returns the updated status payload.

### `POST /api/address-groups`

Bulk-enables or bulk-disables all devices in a subnet group.

Request body:

```json
{
  "addressGroup": "10.0.0.x",
  "enabled": true
}
```

Returns the updated status payload.

### `POST /api/transition-duration`

Updates the global transition duration used by scene changes.

Request body:

```json
{
  "transitionDurationMs": 1000
}
```

Returns the updated status payload.

### `POST /api/brightness`

Sends a live brightness-only command to currently targeted online bulbs while preserving their current hue, saturation, and Kelvin.

Request body:

```json
{
  "brightnessPercent": 65
}
```

Returns:

- `ok`
- `result`
- `status`

### `POST /api/restart`

Requests a clean in-app restart through the launcher.

Response shape:

```json
{
  "ok": true,
  "message": "Server restart requested."
}
```

This route only restarts correctly when the app was started through `npm start` / `node src/launcher.js`.

## Architecture

Current backend entry and composition:

- `src/server.js`
- `src/app-factory.js`
- `src/config.js`
- `src/lifx-controller.js`

Current backend support modules:

- `src/lifx-client-registry.js`
- `src/known-device-service.js`
- `src/light-state-service.js`
- `src/lifx-command-runner.js`
- `src/controller-status-service.js`
- `src/domain-utils.js`
- `src/lifx-command-utils.js`
- `src/known-device-model.js`
- `src/status-model.js`
- `src/json-store.js`
- `src/controller-config-store.js`
- `src/known-devices-store.js`
- `src/scene-store.js`
- `src/network-interfaces.js`
- `src/app-paths.js`

Shared pure domain helpers:

- `shared/domain.js`

Current frontend structure:

- `public/app.js` is the browser bootstrap
- `public/api.js` contains internal UI fetch calls
- `public/state/app-store.js` owns current status and transient UI state
- `public/ui/` contains the render modules
- `public/lib/` contains browser-side helpers such as color preview math and live-command queues
- `public/styles.css` imports feature-area CSS from `public/styles/`

Current controller split:

- `src/lifx-controller.js` remains the public controller façade
- `src/lifx-client-registry.js` owns interface-bound LIFX clients and discovery
- `src/light-state-service.js` owns the optimistic state cache and background polling
- `src/known-device-service.js` owns local persisted device records
- `src/lifx-command-runner.js` owns scene apply / preview / brightness command paths
- `src/controller-status-service.js` builds serialized UI payloads

## Notes

- The app is designed for local LAN control, not the LIFX cloud API.
- The official LIFX app can show stale state independently of this controller; this app does not depend on cloud state to operate.
- UI swatches and scene button colors are display-oriented approximations, not exact photometric renderings.
- Modern browsers use an OKLCH-based preview pipeline where supported, with RGB fallback for older environments and Web Views.
