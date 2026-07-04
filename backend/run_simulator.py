"""
Standalone entrypoint for the EV telemetry simulator.

Usage:
    python run_simulator.py
    python run_simulator.py --devices 500 --interval 30 --tenant demo-utility --randomness 0.4

Configurable via CLI flags or the SIM_* environment variables in .env.
"""

import argparse

from app.config import settings
from app.services.simulator import run_forever


def main():
    parser = argparse.ArgumentParser(description="EV telemetry simulator")
    parser.add_argument("--tenant", default=settings.SIM_TENANT_UID, help="Tenant UID to simulate devices for")
    parser.add_argument("--devices", type=int, default=settings.SIM_DEVICE_COUNT, help="Number of EVs to simulate")
    parser.add_argument(
        "--interval", type=int, default=settings.SIM_INTERVAL_SECONDS, help="Seconds between telemetry ticks"
    )
    parser.add_argument(
        "--randomness", type=float, default=settings.SIM_RANDOMNESS, help="0.0 (deterministic) - 1.0 (very noisy)"
    )
    args = parser.parse_args()

    run_forever(
        tenant_uid=args.tenant,
        device_count=args.devices,
        interval_seconds=args.interval,
        randomness=args.randomness,
    )


if __name__ == "__main__":
    main()
