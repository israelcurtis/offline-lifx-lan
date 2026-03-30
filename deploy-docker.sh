#!/bin/sh
set -eu

IMAGE_NAME=${IMAGE_NAME:-offline-lifx-lan}
CONTAINER_NAME=${CONTAINER_NAME:-offline-lifx-lan}
HOST_BIND=${HOST_BIND:-0.0.0.0}
PORT_BIND=${PORT_BIND:-3000}
APP_ROOT=$(pwd)
DATA_DIR=${DATA_DIR:-$APP_ROOT/data}

mkdir -p "$DATA_DIR"

docker build -t "$IMAGE_NAME" .

if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  docker rm -f "$CONTAINER_NAME"
fi

docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --network host \
  -e HOST="$HOST_BIND" \
  -e PORT="$PORT_BIND" \
  -e SCENES_PATH=/data/scenes.json \
  -e CONTROLLER_CONFIG_PATH=/data/options.json \
  -e KNOWN_DEVICES_PATH=/data/known-devices.json \
  -v "$DATA_DIR:/data" \
  "$IMAGE_NAME"
