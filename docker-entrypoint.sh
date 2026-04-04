#!/bin/sh
set -eu

STATE_DIR=${APP_STATE_DIR:-/state}
SCENES_FILE="$STATE_DIR/scenes.json"
OPTIONS_FILE="$STATE_DIR/options.json"
NODE_MAX_OLD_SPACE_SIZE=${NODE_MAX_OLD_SPACE_SIZE:-80}

mkdir -p "$(dirname "$SCENES_FILE")" "$(dirname "$OPTIONS_FILE")"

if [ ! -f "$SCENES_FILE" ]; then
  cp /app/defaults/scenes.json "$SCENES_FILE"
fi

if [ ! -f "$OPTIONS_FILE" ]; then
  cp /app/defaults/options.json "$OPTIONS_FILE"
fi

case " ${NODE_OPTIONS:-} " in
  *" --max-old-space-size="*)
    ;;
  *)
    if [ -n "${NODE_OPTIONS:-}" ]; then
      export NODE_OPTIONS="${NODE_OPTIONS} --max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}"
    else
      export NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}"
    fi
    ;;
esac

exec "$@"
