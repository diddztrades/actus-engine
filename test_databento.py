import databento as db
import os

client = db.Historical(os.environ["DATABENTO_API_KEY"])

data = client.timeseries.get_range(
    dataset="GLBX.MDP3",
    symbols=["NQ.c.0"],
    schema="ohlcv-1m",
    stype_in="continuous",
    start="2026-04-09T13:00:00",
    end="2026-04-09T15:00:00",
)

df = data.to_df()
print(df.head())
