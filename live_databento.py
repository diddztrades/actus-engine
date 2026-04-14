import databento as db
import os
import time

client = db.Live(os.environ["DATABENTO_API_KEY"])

client.subscribe(
    dataset="GLBX.MDP3",
    schema="trades",
    symbols=["NQ.c.0"],
    stype_in="continuous",
)

deadline = time.monotonic() + (5 * 60)

for msg in client:
    print(msg)
    if time.monotonic() >= deadline:
        break
