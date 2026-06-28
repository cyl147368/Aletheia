#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-aletheia-runtime}"
CONTAINER_NAME="${CONTAINER_NAME:-aletheia}"
PORT="${PORT:-8000}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"

cd "$APP_DIR"

docker build -f Dockerfile.runtime -t "$IMAGE_NAME" .
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

ENV_ARGS=()
if [ -f "$ENV_FILE" ]; then
  ENV_ARGS=(--env-file "$ENV_FILE")
fi

docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "$PORT:8000" \
  "${ENV_ARGS[@]}" \
  -v "$APP_DIR:/app" \
  "$IMAGE_NAME"

echo "Started $CONTAINER_NAME from $APP_DIR on port $PORT."
echo "After future updates run: cd $APP_DIR && git pull && docker restart $CONTAINER_NAME"
