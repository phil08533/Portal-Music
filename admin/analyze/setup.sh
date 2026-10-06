#!/usr/bin/env bash
# One-time setup for the audio analyzer: a private Python environment with the
# CPU-only AI libraries (~1 GB), then a check that downloads both models (~1 GB).
set -e
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
if ! "$PY" -m venv .venv 2>/dev/null; then
  echo "Python's venv module is missing. On Linux Mint / Ubuntu run:  sudo apt install python3-venv"
  exit 1
fi
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
.venv/bin/python -m pip install -r requirements.txt
echo
echo "Downloading the two AI models and checking data/tags.json…"
.venv/bin/python analyze.py --check
echo
echo "✓ Analyzer ready. Start it from Admin Studio → 🏷️ Tags, or run:  npm run analyze"
