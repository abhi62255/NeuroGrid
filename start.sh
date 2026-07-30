#!/usr/bin/env bash
# NeuroGrid – start everything in one shot
# Usage: ./start.sh [--frontend-port 3001]
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$SCRIPT_DIR/backend"
FRONTEND="$SCRIPT_DIR/frontend"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --frontend-port) FRONTEND_PORT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "==> [1/5] Checking Python venv..."
if [[ ! -f "$BACKEND/venv/bin/python" ]]; then
  echo "     Creating venv..."
  python3 -m venv "$BACKEND/venv"
  "$BACKEND/venv/bin/pip" install -q \
    "fastapi==0.111.0" "uvicorn[standard]==0.30.1" \
    "SQLAlchemy>=2.0.36" "pymysql==1.1.1" "cryptography==42.0.7" \
    "pydantic>=2.7" "pydantic-settings>=2.2" "python-dotenv==1.0.1" \
    "httpx==0.27.0" "anthropic==0.34.0" "google-genai>=1.0.0" \
    "apscheduler==3.10.4" "python-multipart==0.0.9"
  echo "     Venv ready."
else
  echo "     Venv exists — skipping install."
fi

echo "==> [2/5] Checking backend .env..."
if [[ ! -f "$BACKEND/.env" ]]; then
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  echo "     Created .env from example. Edit GEMINI_API_KEY if needed."
fi

CURRENT_GEMINI_KEY="$(grep -E '^GEMINI_API_KEY=' "$BACKEND/.env" | head -n1 | cut -d'=' -f2- || true)"
if [[ -z "$CURRENT_GEMINI_KEY" || "$CURRENT_GEMINI_KEY" == "your-gemini-api-key-here" || "$CURRENT_GEMINI_KEY" == "<user's key>" ]]; then
  echo "     GEMINI_API_KEY is missing."
  if [[ -t 0 && -t 1 ]]; then
    read -r -p "     Enter GEMINI_API_KEY (press Enter to skip): " INPUT_GEMINI_KEY
    if [[ -n "$INPUT_GEMINI_KEY" ]]; then
      awk -v new_key="$INPUT_GEMINI_KEY" '
        BEGIN { replaced = 0 }
        /^GEMINI_API_KEY=/ { print "GEMINI_API_KEY=" new_key; replaced = 1; next }
        { print }
        END { if (!replaced) print "GEMINI_API_KEY=" new_key }
      ' "$BACKEND/.env" > "$BACKEND/.env.tmp"
      mv "$BACKEND/.env.tmp" "$BACKEND/.env"
      echo "     GEMINI_API_KEY saved to backend/.env."
    else
      echo "     No API key provided — AI recommendations may be disabled."
    fi
  else
    echo "     Non-interactive shell: set GEMINI_API_KEY in backend/.env to enable AI recommendations."
  fi
fi

echo "==> [3/5] Seeding demo data..."
cd "$BACKEND"
venv/bin/python seed_demo.py 2>&1 | grep -E "OK|already|Error" || true

echo "==> [4/5] Starting backend on :8000..."
if lsof -ti :8000 >/dev/null 2>&1; then
  echo "     Port 8000 already in use — skipping backend start."
else
  nohup "$BACKEND/venv/bin/uvicorn" app.main:app --reload \
    > /tmp/neurogrid-backend.log 2>&1 &
  echo "     Backend PID: $!"
  sleep 3
fi

echo "==> [5/5] Starting frontend on :${FRONTEND_PORT}..."
if [[ ! -d "$FRONTEND/node_modules" ]]; then
  echo "     Installing npm deps..."
  cd "$FRONTEND" && npm install --silent
fi

if [[ -f "$FRONTEND/.env" ]]; then
  true
else
  echo "REACT_APP_API_BASE_URL=http://localhost:8000/api" > "$FRONTEND/.env"
fi

if lsof -ti :"$FRONTEND_PORT" >/dev/null 2>&1; then
  echo "     Port $FRONTEND_PORT already in use — skipping frontend start."
else
  cd "$FRONTEND"
  PORT=$FRONTEND_PORT nohup npm start > /tmp/neurogrid-frontend.log 2>&1 &
  echo "     Frontend PID: $!"
fi

echo ""
echo "==> Starting telemetry simulators (demo-utility:100dev/50pinned, pacific-power:50dev/25pinned, midwest-energy:50dev/25pinned)..."
cd "$BACKEND"
for spec in "demo-utility:100:50" "pacific-power:50:25" "midwest-energy:50:25"; do
  TENANT="${spec%%:*}"
  REST="${spec#*:}"
  DEVICES="${REST%%:*}"
  PINNED="${REST##*:}"
  if pgrep -f "run_simulator.py --tenant $TENANT" >/dev/null 2>&1; then
    echo "     $TENANT simulator already running — skipping."
  else
    nohup venv/bin/python run_simulator.py \
      --tenant "$TENANT" --devices "$DEVICES" --pinned "$PINNED" --interval 45 --randomness 0.3 \
      > "/tmp/sim-${TENANT}.log" 2>&1 &
    echo "     $TENANT simulator PID: $! (devices=$DEVICES, pinned=$PINNED)"
  fi
done

echo ""
echo "================================================"
echo " NeuroGrid is running!"
echo "   App:      http://localhost:${FRONTEND_PORT}"
echo "   API docs: http://localhost:8000/docs"
echo "   Backend log:  /tmp/neurogrid-backend.log"
echo "   Frontend log: /tmp/neurogrid-frontend.log"
echo "   Sim logs:     /tmp/sim-<tenant>.log"
echo "================================================"
