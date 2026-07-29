"""
Standalone entrypoint for the EV telemetry simulator.

Usage:
    # Direct DB write (no WebSocket push):
    python run_simulator.py --tenant demo-utility --devices 10 --interval 30

    # Via API (WebSocket live feed updates in real time):
    python run_simulator.py --tenant demo-utility --devices 10 --interval 30 \
                            --api-url http://localhost:8001

    # All options:
    python run_simulator.py --help
"""

import argparse
import os

from app.config import settings
from app.services.simulator import run_forever


def main():
    parser = argparse.ArgumentParser(description="NeuroGrid EV telemetry simulator")
    parser.add_argument(
        "--tenant", default=settings.SIM_TENANT_UID,
        help="Tenant UID to simulate devices for",
    )
    parser.add_argument(
        "--devices", type=int, default=settings.SIM_DEVICE_COUNT,
        help="Number of EVs to simulate",
    )
    parser.add_argument(
        "--interval", type=int, default=settings.SIM_INTERVAL_SECONDS,
        help="Seconds between telemetry ticks",
    )
    parser.add_argument(
        "--randomness", type=float, default=settings.SIM_RANDOMNESS,
        help="0.0 = deterministic patterns, 1.0 = very noisy",
    )
    parser.add_argument(
        "--pinned", type=int, default=0,
        help=(
            "Number of devices to pin as always-plugged-in (DR-eligible). "
            "Pinned EVs never drive — they cycle between charging and idle, "
            "making them permanently available for Demand Response events. "
            "Must be ≤ --devices."
        ),
    )
    parser.add_argument(
        "--api-url",
        default=os.environ.get("SIM_API_URL"),
        help=(
            "If set, POST telemetry to this API base URL (e.g. http://localhost:8001) "
            "so WebSocket clients receive live updates. "
            "If omitted, writes directly to the telemetry store."
        ),
    )
    args = parser.parse_args()

    run_forever(
        tenant_uid=args.tenant,
        device_count=args.devices,
        interval_seconds=args.interval,
        randomness=args.randomness,
        api_url=args.api_url,
        pinned_count=min(args.pinned, args.devices),
    )


if __name__ == "__main__":
    main()
