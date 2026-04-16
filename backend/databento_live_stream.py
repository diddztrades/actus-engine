import argparse
import json
import sys
from datetime import datetime, timezone

import databento as db


def normalize_price(value):
    if value is None:
        return None
    numeric = float(value)
    if abs(numeric) >= 1_000_000:
        return numeric / 1_000_000_000
    return numeric


def iso_from_ns(value):
    if value is None:
        return None
    numeric = int(value)
    return datetime.fromtimestamp(numeric / 1_000_000_000, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def write_event(payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--key", required=True)
    parser.add_argument("--asset", required=True)
    parser.add_argument("--symbol", required=True)
    args = parser.parse_args()

    live = db.Live(
        key=args.key,
        reconnect_policy="reconnect",
        heartbeat_interval_s=10,
    )

    def handle_record(record):
        record_type = record.__class__.__name__

        if record_type == "TradeMsg":
            write_event(
                {
                    "type": "trade",
                    "asset": args.asset,
                    "symbol": args.symbol,
                    "price": normalize_price(getattr(record, "price", None)),
                    "size": float(getattr(record, "size", 0) or 0),
                    "timestamp": iso_from_ns(getattr(record, "ts_event", None)),
                    "sourceType": "last-trade",
                }
            )
            return

        if record_type in ("MBP1Msg", "CMBP1Msg"):
            bid = normalize_price(getattr(record, "bid_px_00", None))
            ask = normalize_price(getattr(record, "ask_px_00", None))
            if bid is None or ask is None or bid <= 0 or ask <= 0 or ask < bid:
                return
            write_event(
                {
                    "type": "quote",
                    "asset": args.asset,
                    "symbol": args.symbol,
                    "price": (bid + ask) / 2,
                    "size": 0,
                    "timestamp": iso_from_ns(getattr(record, "ts_event", None)),
                    "sourceType": "quote-mid",
                }
            )
            return

        if record_type in ("ErrorMsg", "SystemMsg", "StatusMsg"):
            write_event(
                {
                    "type": "status",
                    "asset": args.asset,
                    "symbol": args.symbol,
                    "recordType": record_type,
                    "timestamp": iso_from_ns(getattr(record, "ts_event", None)) or datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z"),
                }
            )

    def handle_exception(exc):
        print(f"[databento-live-stream] {exc}", file=sys.stderr, flush=True)

    live.subscribe(
        dataset="GLBX.MDP3",
        schema="trades",
        symbols=args.symbol,
        stype_in="raw_symbol",
    )
    live.subscribe(
        dataset="GLBX.MDP3",
        schema="mbp-1",
        symbols=args.symbol,
        stype_in="raw_symbol",
    )
    live.add_callback(handle_record, handle_exception)
    live.start()
    live.block_for_close()


if __name__ == "__main__":
    main()
