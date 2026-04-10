#!/bin/sh
set -eu

IMAGE_NAME=${IMAGE_NAME:-offline-lifx-lan}
CONTAINER_NAME=${CONTAINER_NAME:-offline-lifx-lan}
HOST_BIND=${HOST_BIND:-0.0.0.0}
PORT_BIND=${PORT_BIND:-3001}
APP_ROOT=$(pwd)
STATE_DIR=${STATE_DIR:-$APP_ROOT/state}
MEMORY_RESERVATION=${MEMORY_RESERVATION:-80m}
MEMORY_LIMIT=${MEMORY_LIMIT:-128m}
PIDS_LIMIT=${PIDS_LIMIT:-64}
NODE_MAX_OLD_SPACE_SIZE=${NODE_MAX_OLD_SPACE_SIZE:-80}
MEMORY_WARNING_RSS_MB=${MEMORY_WARNING_RSS_MB:-96}
BACKUP_CONTAINER_NAME="${CONTAINER_NAME}-backup"

mkdir -p "$STATE_DIR"

build_succeeded=0
if docker build --network host -t "$IMAGE_NAME" .; then
  build_succeeded=1
else
  echo "docker build failed." >&2

  if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    echo "Falling back to existing container: $CONTAINER_NAME" >&2
    docker start "$CONTAINER_NAME" >/dev/null 2>&1 || true
    exit 0
  fi

  if docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    echo "Falling back to existing local image: $IMAGE_NAME" >&2
  else
    echo "No reusable local container or image was found." >&2
    exit 1
  fi
fi

cleanup_backup_container() {
  if docker container inspect "$BACKUP_CONTAINER_NAME" >/dev/null 2>&1; then
    docker rm -f "$BACKUP_CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
}

restore_backup_container() {
  if docker container inspect "$BACKUP_CONTAINER_NAME" >/dev/null 2>&1; then
    docker rename "$BACKUP_CONTAINER_NAME" "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker start "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
}

cleanup_backup_container

if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  docker rename "$CONTAINER_NAME" "$BACKUP_CONTAINER_NAME"
fi

if docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --network host \
  --memory-reservation "$MEMORY_RESERVATION" \
  --memory "$MEMORY_LIMIT" \
  --pids-limit "$PIDS_LIMIT" \
  -e HOST="$HOST_BIND" \
  -e PORT="$PORT_BIND" \
  -e APP_STATE_DIR=/state \
  -e NODE_MAX_OLD_SPACE_SIZE="$NODE_MAX_OLD_SPACE_SIZE" \
  -e MEMORY_WARNING_RSS_MB="$MEMORY_WARNING_RSS_MB" \
  -v "$STATE_DIR:/state" \
  "$IMAGE_NAME"; then
  cleanup_backup_container
else
  echo "docker run failed." >&2

  if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi

  restore_backup_container
  exit 1
fi

if [ "$build_succeeded" -eq 1 ]; then
  docker image prune -f >/dev/null 2>&1 || true
fi
