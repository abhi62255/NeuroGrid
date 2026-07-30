# NeuroGrid – Copilot Instructions

## Project Layout

```
NeuroGrid/
├── backend/          # FastAPI + SQLAlchemy + APScheduler
│   ├── app/          # Application code
│   ├── requirements.txt
│   ├── seed_demo.py  # One-time demo data seeder
│   └── run_simulator.py  # EV telemetry simulator (per tenant)
├── frontend/         # React + MUI + Recharts
│   └── package.json
└── docker-compose.yml  # MySQL (optional; SQLite used by default locally)
```

## Running the Application

When the user asks to "run", "start", or "trigger the application", execute ALL of the following steps in order:

### 1. Environment Setup (first time only)

**Backend – Python venv + deps**
```bash
cd backend
python3 -m venv venv
# Install with relaxed pydantic/sqlalchemy versions for Python 3.13 compatibility
venv/bin/pip install "fastapi==0.111.0" "uvicorn[standard]==0.30.1" \
  "SQLAlchemy>=2.0.36" "pymysql==1.1.1" "cryptography==42.0.7" \
  "pydantic>=2.7" "pydantic-settings>=2.2" "python-dotenv==1.0.1" \
  "httpx==0.27.0" "anthropic==0.34.0" "google-genai>=1.0.0" \
  "apscheduler==3.10.4" "python-multipart==0.0.9"
```

**Backend – .env** (copy from `.env.example` and fill in GEMINI_API_KEY):
```
DATABASE_URL=sqlite:///./main.db
TELEMETRY_BACKEND=sqlite
TELEMETRY_SQLITE_PATH=./telemetry.db
GEMINI_API_KEY=<user's key>
AI_MODEL=gemini-2.5-flash
SIM_TENANT_UID=demo-utility
SIM_DEVICE_COUNT=10
SIM_INTERVAL_SECONDS=45
SIM_RANDOMNESS=0.3
RECOMMENDATION_INTERVAL_SECONDS=3600
```

**Frontend – npm deps**
```bash
cd frontend && npm install
```

**Frontend – .env**
```
REACT_APP_API_BASE_URL=http://localhost:8000/api
```

**Seed demo data** (run once; safe to re-run — skips existing records):
```bash
cd backend && venv/bin/python seed_demo.py
```

### 2. Start Backend (port 8000)

```bash
cd backend
nohup venv/bin/uvicorn app.main:app --reload > /tmp/neurogrid-backend.log 2>&1 &
```

Verify: `curl -s http://localhost:8000/docs | head -3`

### 3. Start Frontend (port 3000, or 3001 if 3000 is taken)

```bash
cd frontend
PORT=3000 nohup npm start > /tmp/neurogrid-frontend.log 2>&1 &
```

If port 3000 is occupied by another process, use `PORT=3001`.

Verify: `curl -s http://localhost:3000 | head -3`

### 4. Start Telemetry Simulators

Default tenants and device counts (adjust if user specifies different counts):

| Tenant UID        | Default Devices | Pinned (always-plugged-in) |
|-------------------|-----------------|----------------------------|
| `demo-utility`    | 100     | 50 (50%) |
| `pacific-power`   | 50      | 25 (50%) |
| `midwest-energy`  | 50      | 25 (50%) |

Pinned EVs never drive — they cycle between charging and idle, keeping them permanently available for DR events.

```bash
cd backend
nohup venv/bin/python run_simulator.py --tenant demo-utility  --devices 100 --pinned 50 --interval 45 --randomness 0.3 > /tmp/sim-demo-utility.log 2>&1 &
nohup venv/bin/python run_simulator.py --tenant pacific-power --devices 50  --pinned 25 --interval 45 --randomness 0.3 > /tmp/sim-pacific-power.log 2>&1 &
nohup venv/bin/python run_simulator.py --tenant midwest-energy --devices 50 --pinned 25 --interval 45 --randomness 0.3 > /tmp/sim-midwest-energy.log 2>&1 &
```

Simulators write directly to the SQLite telemetry store and produce no stdout output — verify by checking row counts:
```bash
python3 -c "import sqlite3; c=sqlite3.connect('backend/telemetry.db').cursor(); c.execute('SELECT tenant_id,COUNT(*) FROM telemetry GROUP BY tenant_id'); print(c.fetchall())"
```

### 5. Open in Browser

- **App**: http://localhost:3001 (or 3000)
- **API Docs**: http://localhost:8000/docs

## Port Conflict Resolution

Before starting, check for existing processes:
```bash
lsof -i :8000   # backend
lsof -i :3000   # frontend
```

Kill stale processes only if they are NOT part of this project's other active sessions.

## Known Compatibility Notes

- **Python 3.13**: `SQLAlchemy>=2.0.36` required (2.0.30 crashes). Use relaxed pip version constraints — do NOT use the pinned versions in `requirements.txt` directly.
- **pydantic-core**: builds fine once SQLAlchemy constraint is resolved via the install command above.
- **Node.js**: `react-scripts` produces eslint warnings (unused vars) — these are safe to ignore.
