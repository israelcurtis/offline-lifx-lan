#!/bin/sh
set -eu

IMAGE_NAME=${IMAGE_NAME:-offline-lifx-lan}
CONTAINER_NAME=${CONTAINER_NAME:-offline-lifx-lan}
HOST_BIND=${HOST_BIND:-0.0.0.0}
PORT_BIND=${PORT_BIND:-3001}
APP_ROOT=$(pwd)
STATE_DIR=${STATE_DIR:-$APP_ROOT/state}

mkdir -p "$STATE_DIR"

docker build --network host -t "$IMAGE_NAME" .

if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  docker rm -f "$CONTAINER_NAME"
fi

docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --network host \
  -e HOST="$HOST_BIND" \
  -e PORT="$PORT_BIND" \
  -e APP_STATE_DIR=/state \
  -v "$STATE_DIR:/state" \
  "$IMAGE_NAME"
