# NeuroGrid — AI-Powered Demand Response Platform

An EV-first, multi-tenant Demand Response (DR) platform.  
A **FastAPI** backend drives scheduling, AI recommendations (Gemini), and live telemetry.  
A **React + MUI** frontend lets operators monitor and manage DR events across every tenant.

---

## Architecture

```
frontend/   React 18 + MUI v5 + Recharts
backend/    FastAPI + SQLAlchemy + APScheduler + Google Gemini
            └── SQLite (default, zero-config local dev)
            └── MySQL (optional, for production)
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | **3.12** (3.13 has pydantic-core build issues) |
| Node.js | 18 + |
| npm | 9 + |

---

## Quick Start (macOS / Linux)

### 1 · Backend

```bash
cd backend

# Create a macOS-native virtual environment
python3.12 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — at minimum set GEMINI_API_KEY
# DATABASE_URL defaults to SQLite (sqlite:///./main.db) — no MySQL needed for local dev

# Seed the demo data (creates 3 tenants + devices)
python seed_demo.py

# Start the API server
uvicorn app.main:app --reload --port 8000
# If port 8000 is occupied, use --port 8001 and update frontend/.env accordingly
```

API docs available at `http://localhost:8000/docs`.

### 2 · Frontend

```bash
cd frontend
cp .env.example .env          # or create .env manually
# Set REACT_APP_API_BASE_URL=http://localhost:8000/api   (adjust port if needed)

npm install
npm start                     # Opens http://localhost:3000
```

### 3 · Telemetry Simulators (optional)

Run a simulated EV fleet for each tenant to generate live telemetry:

```bash
cd backend
source .venv/bin/activate

# List tenants
curl http://localhost:8000/api/tenants/

# Start a simulator per tenant (replace <uid> with actual tenant UIDs)
PYTHONUNBUFFERED=1 python run_simulator.py --tenant-uid demo-utility    --num-evs 10 --interval 60 &
PYTHONUNBUFFERED=1 python run_simulator.py --tenant-uid pacific-power    --num-evs 5  --interval 60 &
PYTHONUNBUFFERED=1 python run_simulator.py --tenant-uid midwest-energy   --num-evs 3  --interval 60 &
```

---

## Quick Start (Windows)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
python seed_demo.py
uvicorn app.main:app --reload --port 8000
```

> **Note:** The `venv/` folder is excluded from git. Create a fresh one locally — never commit it.

---

## Environment Variables

### `backend/.env`

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./main.db` | SQLAlchemy connection string |
| `GEMINI_API_KEY` | — | Google Gemini API key (required for AI recommendations) |
| `AI_MODEL` | `gemini-2.5-flash` | Gemini model name |
| `RECOMMENDATION_INTERVAL_SECONDS` | `300` | How often the AI engine runs (seconds) |
| `TELEMETRY_RETENTION_SECONDS` | `86400` | How far back "latest" telemetry queries look |

### `frontend/.env`

| Variable | Default | Description |
|----------|---------|-------------|
| `REACT_APP_API_BASE_URL` | `http://localhost:8000/api` | Backend API base URL |

---

## Project Structure

```
backend/
  app/
    models/         SQLAlchemy ORM models
    routers/        FastAPI route handlers
    services/       Business logic (AI engine, simulator, telemetry store)
    schemas/        Pydantic request/response schemas
    config.py       Settings loaded from .env
    database.py     SQLAlchemy engine + session factory
    main.py         FastAPI app + lifespan (scheduler start/stop)
  requirements.txt
  seed_demo.py      One-time demo data seeder
  run_simulator.py  Multi-tenant EV telemetry simulator

frontend/
  src/
    api/            Axios API client
    components/     Layout, StatCard, StatusChip, Navbar
    pages/          Dashboard, DeviceList, DeviceDetail, Recommendations, Events
    theme.js        Uplight brand palette + MUI overrides
```

---

## Key Features

- **Multi-tenant** — full tenant isolation across devices, telemetry, and DR events
- **AI recommendations** — Gemini analyses load forecasts + tariff schedules and suggests charge-shifting or curtailment events
- **Live telemetry** — EV state-of-charge, charging status, and power draw tracked per device
- **Tariff-aware scheduling** — Time-of-use and super-off-peak tariff periods are used to minimise cost
- **Demand Response events** — Accept AI recommendations to create, activate, and complete DR events

---

## Development Notes

- SQLite works out of the box — no database server required for local development
- The AI engine runs on a schedule (default every 5 minutes); you can also trigger manually from the Recommendations page
- `backend/venv`, `*.db` files, and `frontend/build` are **excluded from git** — see `.gitignore`
