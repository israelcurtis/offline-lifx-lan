#!/bin/sh
set -eu

STATE_DIR=${APP_STATE_DIR:-/state}
SCENES_FILE="$STATE_DIR/scenes.json"
OPTIONS_FILE="$STATE_DIR/options.json"

mkdir -p "$(dirname "$SCENES_FILE")" "$(dirname "$OPTIONS_FILE")"

if [ ! -f "$SCENES_FILE" ]; then
  cp /app/defaults/scenes.json "$SCENES_FILE"
fi

if [ ! -f "$OPTIONS_FILE" ]; then
  cp /app/defaults/options.json "$OPTIONS_FILE"
fi

exec "$@"
