# start the API (creates tables automatically on startup)

# Intial setup

python seed_demo.py

# Running telemetry stream
python run_simulator.py --tenant demo-utility --devices 300 --interval 45 --randomness 0.3



# Making API Live
cd backend 
venv\Scripts\Activate.ps1  # activate virtual environment
uvicorn app.main:app --reload

