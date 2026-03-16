# LIFX LAN Controller

Offline local controller for LIFX bulbs using the LIFX LAN protocol and a small browser UI. It runs entirely on your Mac and talks to bulbs directly over UDP through [`lifx-lan-client`](https://github.com/node-lifx/lifx-lan-client).

## Current capabilities

- Discovers bulbs across multiple active private IPv4 interfaces on the host.
- Works across separated home subnets when the Mac has reachability to them.
- Applies synchronized preset scenes from a browser UI.
- Uses one global transition duration for all scene changes, controlled by a slider in the UI.
- Shows live device state with per-bulb swatches, brightness, hue, and kelvin.
- Lets you enable or disable individual bulbs from being affected by Scene changes.
- Lets you enable or disable all devices in a subnet as a bulk action.
- Persists controller state in `config/config.json`.

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

`npm start` runs the launcher wrapper so the in-app `Restart Server` button can restart the process cleanly.

## Development

```sh
npm run dev
npm test
```

`npm run dev` runs the server directly with Node watch mode.

## Platypus Packaging

If you want to wrap the controller as a macOS app with Platypus, there are two entry scripts in the repo root. Use these in the Script Path field:

- `platypus-textwindow-entry.js`
  - Use this for Platypus `Text Window` interface mode launches the controller stack and routes stdout to the text window. To access the UI go to `http://127.0.0.1:3000` in an external browser
- `platypus-webview-entry.js`
  - Use this for Platypus `Web View` interface mode. It starts the local controller and then opens the existing browser UI inside the Platypus window.

Recommended bundled files:

- `src`
- `public`
- `config`
- `node_modules`
- `package.json`

Notes:

- The app uses ES modules, so `package.json` needs to be present in the bundle because it provides `"type": "module"`.
- The Platypus Web View wrapper expects the local controller UI to be served from `http://127.0.0.1:3000`.
- If your Platypus app uses symlinks back to this repo during development, changes to the linked files take effect without rebuilding the bundle.

## Configuration

There is no `.env.example` anymore. If you want environment overrides, create your own `.env` file or export variables in your shell before starting the app.

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
| `CONTROLLER_CONFIG_PATH` | `config/config.json` | Alternate controller state file |

If any of the fixed `LIFX_TARGET_*` filters are set, manual enable/disable controls in the UI are treated as unavailable, because targeting is then defined by environment configuration.

## Controller State

Persistent controller state lives in `config/config.json`.

Current keys:

- `enabledIds`
- `disabledIds`
- `transitionDurationMs`

`enabledIds` and `disabledIds` are explicit per-device states. Subnet buttons in the UI are just bulk actions that update those device IDs.

## Scenes

Scene definitions live in `config/scenes.json`.

Each scene supports:

- `id`
- `name`
- `description`
- `power` (`on` or `off`)
- `hue` (`0-360`)
- `saturation` (`0-1`)
- `brightness` (`0-1`)
- `kelvin` (`1500-9000`)

Scene files no longer carry per-scene transition durations. Transition timing is global and comes from the UI slider / `config/config.json`.

## Browser UI

The browser interface currently includes:

- preset scene cards
- controller status with enabled count, online count, and transition slider
- `Restart Server` and `Rescan LAN` actions
- subnet-grouped device lists
- per-device `Enabled` / `Disabled` toggles
- subnet-level bulk enable/disable buttons
- live device swatches and state readout

## API

All API routes are served from the same local app process as the browser UI.

### `GET /api/status`

Returns the full controller status payload used by the UI, including:

- discovered devices
- subnet groups
- enabled and disabled device IDs
- online and enabled counts
- global transition duration
- available scenes
- last scene action

### `POST /api/scenes/:sceneId`

Triggers a scene by ID.

Response shape:

- `ok`
- `scene`
- `lastAction`
- `status`

If the scene ID does not exist, the route returns `404` with `{ ok: false, error }`.

### `POST /api/discover`

Forces a fresh LAN discovery pass and returns the updated status payload.

### `POST /api/targets`

Sets explicit per-device enabled and disabled state.

Request body:

```json
{
  "enabledTargetIds": ["d073d5837b0b"],
  "disabledTargetIds": ["d073d582392d"]
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

## Notes

- The app is designed for local LAN control, not the LIFX cloud API.
- The official LIFX app can show stale state independently of this controller; this app does not depend on cloud state to operate.
- White-spectrum swatches in the UI are intentionally display-oriented approximations, not exact photometric renderings.
