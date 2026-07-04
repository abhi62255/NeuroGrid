# Grid Flex — AI-Powered Demand Response Event Recommendation System

An EV-first, device-agnostic platform that continuously ingests EV telemetry,
uses an LLM to decide whether a Demand Response (DR) event should be
recommended, and lets an operator approve/reject the recommendation from a
React + Material UI console.

```
dr-system/
├── backend/            FastAPI service, MySQL models, telemetry store, AI engine, simulator
└── frontend/            React + MUI console
```

## Architecture

| Component | Tech | Notes |
|---|---|---|
| Relational data | MySQL (SQLAlchemy models) | Tenants, Users, Devices, Tariffs, Recommendations, Events |
| Telemetry store | Pluggable — SQLite by default, real HBase via HappyBase | Same `TelemetryStore` interface either way; swap with `TELEMETRY_BACKEND=hbase` |
| Telemetry simulator | Python script | Simulates hundreds/thousands of EVs cycling charging/driving/idle/unplugged/completed |
| AI recommendation engine | Anthropic Claude via structured JSON prompt | Runs on a background scheduler + on-demand API trigger |
| REST API | FastAPI | Tenants, Users, Devices, Telemetry, Tariffs, Recommendations, Events, Dashboard |
| Frontend | React + MUI + Recharts + MUI X DataGrid | Dashboard, Device List, Device Detail, Recommendations, Events |

The telemetry store and the device schema (`device_type` + JSON `attributes`
column) are both designed so thermostats, batteries, HVAC, and water heaters
can be added later as adapters without breaking the schema or the AI
workflow — see "Future expansion" below.

## Prerequisites

- Python 3.10+
- Node.js 18+
- MySQL 8 (or use the included `docker-compose.yml`)

## Backend setup

```bash
cd backend
python -m venv venv && source venv/bin/activate      # optional but recommended
pip install -r requirements.txt

cp .env.example .env
# edit .env: set MYSQL_* credentials and ANTHROPIC_API_KEY

# start MySQL if you don't already have one:
cd .. && docker compose up -d mysql && cd backend

# create demo tenant, operator user, and a sample TOU tariff
python seed_demo.py

# start the API (creates tables automatically on startup)
venv\Scripts\Activate.ps1

uvicorn app.main:app --reload
```

The API is now live at `http://localhost:8000` (docs at `/docs`). A
background scheduler runs the AI recommendation engine every
`RECOMMENDATION_INTERVAL_SECONDS` (default 300s) for every active tenant.

### Start the telemetry simulator (separate process)

```bash
cd backend
python run_simulator.py --tenant demo-utility --devices 300 --interval 45 --randomness 0.3
```

This continuously generates realistic telemetry for the seeded tenant and
writes it to the telemetry store, and updates each `Device`'s cached
state in MySQL.

### Trigger a recommendation manually

```bash
curl -X POST http://localhost:8000/api/recommendations/generate/1
```

(tenant id `1` is the demo tenant created by `seed_demo.py`)

## Frontend setup

```bash
cd frontend
npm install
cp .env.example .env     # points REACT_APP_API_BASE_URL at the backend
npm start
```

Opens at `http://localhost:3000`: Dashboard, Devices, Recommendations, Events.

## Telemetry store: SQLite vs HBase

By default (`TELEMETRY_BACKEND=sqlite`) telemetry is stored in an embedded
SQLite file so the whole project runs with zero external services beyond
MySQL. This mirrors a wide-column time-series table (`device_id`,
`timestamp`, JSON payload) and is a drop-in stand-in for a real time-series
store.

To use a real HBase cluster instead:

1. `pip install happybase`
2. Run an HBase Thrift gateway (`hbase thrift start`)
3. Set `TELEMETRY_BACKEND=hbase`, `HBASE_HOST`, `HBASE_PORT` in `.env`

Both implementations satisfy the same `TelemetryStore` interface
(`app/services/telemetry_store.py`), so no other code changes are needed.

## AI recommendation engine

`app/services/ai_engine.py`:

1. Reads each enrolled device's latest telemetry.
2. Aggregates fleet-level signals (flexible load, charging power, average
   SOC, participation %) — this aggregation step is device-agnostic and
   works from any adapter that emits the same summary shape.
3. Resolves the tenant's current Time-of-Use tariff period and rate via
   `app/services/tariff_service.py`.
4. Sends a compact JSON payload to LLM with a system prompt that
   instructs it to prioritize On-Peak periods and return a structured JSON
   recommendation.
5. Persists the recommendation + per-device participation links to MySQL.

## Future expansion

- **New device types**: add a value to `DeviceType`, populate the `attributes`
  JSON column with type-specific fields, and (if the telemetry shape
  differs meaningfully) add a small adapter that maps that device's
  telemetry into the same `build_fleet_summary` shape the AI engine expects.
- **New decision factors** (weather, grid signals, market prices, carbon
  intensity, etc.): extend the `payload` dict built in
  `generate_recommendation()` — the LLM prompt and downstream persistence
  logic don't need to change.
- **Real HBase / production time-series store**: implement against the
  existing `TelemetryStore` interface.
