# CLAUDE.md

Offline local controller for LIFX smart bulbs. Communicates directly with bulbs over UDP using the LIFX LAN protocol — no cloud dependency. Node.js/Express backend, vanilla JS browser frontend, no build step.

## Commands

```sh
npm start        # production (launcher wrapper — required for restart button + single-instance lock)
npm run dev      # dev server with --watch (no launcher)
npm test         # node --test
```

Default port: 3000.

## Architecture

### Backend entry

| File | Role |
|---|---|
| `src/launcher.js` | Single-instance lock, spawns server.js, handles restart-on-exit-code-75 |
| `src/server.js` | Boot entry — loads config, instantiates controller, calls startServer |
| `src/app-factory.js` | Express app + all API routes + process signal handlers |
| `src/config.js` | Loads env vars + persisted options into a single config object |
| `src/lifx-controller.js` | Public façade — orchestrates all services |

### Backend services

| File | Role |
|---|---|
| `src/lifx-client-registry.js` | One LIFX UDP client per private IPv4 interface; discovery |
| `src/light-state-service.js` | In-memory state cache + 3s polling loop |
| `src/lifx-command-runner.js` | Scene apply / preview / brightness commands |
| `src/known-device-service.js` | Persisted per-device enable/disable + color capability |
| `src/controller-status-service.js` | Builds the JSON status payload sent to the UI |
| `src/lifx-command-utils.js` | Promisified LIFX callbacks with 5s timeout |
| `src/network-interfaces.js` | Enumerates active private IPv4 LAN interfaces |
| `src/json-store.js` | Atomic JSON file reads/writes (write to .tmp, then rename) |
| `src/app-state-paths.js` | Resolves state file paths; bootstraps missing files from defaults |
| `src/app-state-reset.js` | Deletes state files and reloads from shipped defaults |
| `src/single-instance-lock.js` | PID-based lock file in os.tmpdir() |
| `src/controller-config-store.js` | Load/save options.json |
| `src/known-devices-store.js` | Load/save known-devices.json |
| `src/scene-store.js` | Load/save scenes.json |
| `src/known-device-model.js` | Pure functions for device record normalization and lookup |
| `src/status-model.js` | Pure functions for address groups and light decoration |
| `src/domain-utils.js` | Scene normalization/validation, light filtering, misc helpers |

### State files

| Location | Purpose |
|---|---|
| `defaults/options.json` | Shipped default controller options (read-only source of truth) |
| `defaults/scenes.json` | Shipped default scenes |
| `state/options.json` | User-edited controller options (gitignored) |
| `state/scenes.json` | User-edited scenes (gitignored) |
| `state/known-devices.json` | Per-device enable state + color capability (gitignored) |

Missing state files are bootstrapped from `defaults/` on startup. `POST /api/reset` deletes state files and reloads from defaults.

## Key patterns

**All UDP commands go through `src/lifx-command-utils.js`** — `invokeCommand`, `requestLightState`, `requestLightHardwareVersion`. Each has a 5-second timeout; unresponsive bulbs reject rather than hang.

**`Promise.allSettled` everywhere** — partial failures are normal. Failed bulbs are collected into a `failures[]` array; the rest succeed. Never use `Promise.all` for multi-bulb operations.

**Optimistic state cache** — `LightStateService` updates the cache immediately on command, then the 3s polling loop reconciles back to actual bulb state. The `sceneApplyInFlight` flag suppresses polling during active commands. `holdRefreshes(ms)` suppresses polling during transition animations.

**Atomic file writes** — `json-store.js` writes to `.filename.tmp` then `fs.renameSync` to the target. Never use direct `writeFileSync` to state files.

**ES modules throughout** — `"type": "module"` in package.json. Use `import`/`export`, not `require`.

**No build step** — frontend is plain JS served as static files from `public/`. No bundler, no transpilation.

## Frontend structure

```
public/app.js              # Bootstrap and event handlers
public/api.js              # fetch wrappers for all API routes
public/state/app-store.js  # Single store with pub/sub (store.subscribe(renderApp))
public/ui/                 # Render modules (re-render on every state change)
public/lib/                # Helpers: color math, device grouping, live-command queues
public/styles.css          # Imports from public/styles/*.css
```

Live commands (brightness slider, scene preview) go through debounce queues in `public/lib/live-command-queue.js` to coalesce rapid input before dispatching.

## Process lifecycle

- `npm start` → `launcher.js` acquires lock → spawns `server.js` as child
- Exit code 75 from child → launcher restarts after 150ms
- SIGINT/SIGTERM → graceful shutdown with 5s force-exit fallback
- `uncaughtException` and `unhandledRejection` → log + shutdown(1)

## Testing

```sh
npm test
```

Tests use Node's built-in `node:test` runner. All tests are in `test/`. Current suite covers API routes, config stores, device model, scene utilities, and the single-instance lock. Run after any change to `src/`.
