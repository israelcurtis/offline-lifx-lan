# Linux Docker Deployment

This deployment path is for a Linux device on your LAN.

For macOS packaging, keep using the existing Platypus wrapper instead of Docker.

## Why this layout

- The image is built from source and runs `npm ci` inside the container, so host `node_modules` are not reused across architectures.
- `network_mode: host` is used because the app relies on LAN discovery/control over UDP and may use multiple interfaces.
- Runtime state is kept in a host-mounted `state/` directory, not in the repo `defaults/` directory.

## Files used

- [Dockerfile](/Users/israel/Github/offline-lifx-lan/Dockerfile)
- [docker-compose.yml](/Users/israel/Github/offline-lifx-lan/docker-compose.yml)
- [docker-entrypoint.sh](/Users/israel/Github/offline-lifx-lan/docker-entrypoint.sh)
- [defaults/options.json](/Users/israel/Github/offline-lifx-lan/defaults/options.json)
- [defaults/scenes.json](/Users/israel/Github/offline-lifx-lan/defaults/scenes.json)
- `state/` as the normal non-container writable state location
- `state/` on the Linux device for live state

## Deploy with Docker Compose

From the repo root on the Linux device:

```sh
docker compose up -d --build
```

This will:

- build the image locally for that device's CPU architecture
- start the controller with host networking
- persist `state/` on disk next to the compose file
- reserve `80 MB` and cap the container at `128 MB`
- cap Node old-space heap growth at `80 MB`

After startup, open:

```text
http://<linux-device-ip>:3001
```

## Deploy with Plain Docker

If the device does not have Compose, use the helper script from the repo root:

```sh
./deploy-docker.sh
```

This script:

- builds the image locally
- recreates the `offline-lifx-lan` container
- keeps runtime state in `./state`
- starts the container with host networking and restart policy enabled
- reserves `80 MB`, caps the container at `128 MB`, and limits it to `64` processes by default
- passes `NODE_MAX_OLD_SPACE_SIZE=80` and `MEMORY_WARNING_RSS_MB=96` into the container by default
- if the rebuild fails but an existing local container or image is already present, falls back to reusing it so the app can still start offline after a reboot

## Offline reboot behavior

If the container was already created successfully before the reboot, Docker should bring it back automatically because the container is started with `--restart unless-stopped`.

If it does not come back on its own, start the existing container without rebuilding:

```sh
docker start offline-lifx-lan
```

If you deployed with Compose instead of the helper script, use:

```sh
docker compose start
```

If you accidentally run `./deploy-docker.sh` while offline, it now falls back to the existing local container or image instead of failing immediately on the `FROM node:20-slim` build step.

## Persistent state

The compose file mounts:

```text
./state:/state
```

The app uses `APP_STATE_DIR=/state` in the container, and the entrypoint seeds `/state` from image defaults on first run if `scenes.json` or `options.json` is missing.

That means:

- tracked defaults from `defaults/options.json` and `defaults/scenes.json` are present on first boot
- runtime state like `known-devices.json` is created and updated in `state/` on the host
- recreating the container does not wipe your controller state
- `git pull` does not overwrite the live Linux state because `state/` is ignored and not treated as shipped defaults

## Manual image build

If you do not want to use Compose or the helper script:

```sh
docker build --network host -t offline-lifx-lan .
docker run --rm --network host \
  -e HOST=0.0.0.0 \
  -e PORT=3001 \
  -e APP_STATE_DIR=/state \
  -v "$(pwd)/state:/state" \
  offline-lifx-lan
```

Use Compose or the helper script unless you have a reason not to manage the Docker commands yourself.

## Updating

When you change code on the Linux device:

```sh
./deploy-docker.sh
```

When you intentionally want to change the shipped defaults for future bootstrap/reset behavior:

- edit files in `defaults/`
- redeploy with `./deploy-docker.sh`

When you want to inspect or modify the live runtime state on that Linux device:

- edit files in `state/`
- restart or redeploy the container

## Notes

- `HOST` should stay `0.0.0.0` in the container.
- `network_mode: host` is intended for Linux. Do not treat that as the Mac workflow.
- The container now starts the launcher directly with `node src/launcher.js` instead of running through `npm start`, which avoids keeping an extra `npm` process around.
- The Docker healthcheck pings `http://127.0.0.1:3001/api/status` every `5` minutes to keep a basic liveness signal without generating minute-by-minute event noise.
- `NODE_MAX_OLD_SPACE_SIZE` can be raised or lowered in Compose if the device needs a different heap ceiling.
- `MEMORY_WARNING_RSS_MB` should stay below the Docker `mem_limit` so the UI warns before the kernel is under pressure.
- When a Docker memory limit is active, the `Server Memory` panel shows `server / available / limit` for the container instead of raw host free/total values.
- The helper script accepts optional overrides such as `IMAGE_NAME`, `CONTAINER_NAME`, `STATE_DIR`, `PORT_BIND`, `MEMORY_RESERVATION`, `MEMORY_LIMIT`, `PIDS_LIMIT`, `NODE_MAX_OLD_SPACE_SIZE`, and `MEMORY_WARNING_RSS_MB`.
