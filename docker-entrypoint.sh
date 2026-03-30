#!/bin/sh
set -eu

DATA_DIR=/data
SCENES_FILE=${SCENES_PATH:-$DATA_DIR/scenes.json}
OPTIONS_FILE=${CONTROLLER_CONFIG_PATH:-$DATA_DIR/options.json}

mkdir -p "$(dirname "$SCENES_FILE")" "$(dirname "$OPTIONS_FILE")"

if [ ! -f "$SCENES_FILE" ]; then
  cp /app/default-config/scenes.json "$SCENES_FILE"
fi

if [ ! -f "$OPTIONS_FILE" ]; then
  cp /app/default-config/options.json "$OPTIONS_FILE"
fi

exec "$@"
