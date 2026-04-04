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
- If the target device is extremely constrained, the next optimization would be a smaller runtime image or a multi-stage build, but the current single-stage setup is the lowest-friction starting point.
- The helper script accepts optional overrides such as `IMAGE_NAME`, `CONTAINER_NAME`, `STATE_DIR`, and `PORT_BIND`.
