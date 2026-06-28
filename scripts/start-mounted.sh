#!/usr/bin/env bash
set -euo pipefail

cd /app

mkdir -p /app/data

python3 -m venv /app/.venv
/app/.venv/bin/python -m pip install --no-cache-dir -r /app/backend/requirements.txt

cd /app/frontend
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci
fi
npm run build

cd /app/backend
exec /app/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
