#!/usr/bin/env sh
# Neja Cheque on Linux/macOS: creates a virtual environment on first run, then starts the server.
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt
fi
PORT="${PORT:-8080}"
echo "Neja Cheque: http://localhost:$PORT"
exec .venv/bin/python -m uvicorn nejacheque.app:app --host 0.0.0.0 --port "$PORT"
