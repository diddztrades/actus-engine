# ACTUS Engine

ACTUS Engine is a real-time market decision system designed to translate market data, options positioning, and price behavior into clear trading decisions.

⚡ Work in progress — evolving rapidly

---

## What ACTUS Does

ACTUS is built to interpret markets through:

- Futures market data (Databento)
- Options positioning (gamma)
- Price behavior and structure

It outputs:

- Regime → PIN / EXPANSION  
- Bias → LONG / SHORT / NEUTRAL  
- Condition → MEAN_REVERSION / BREAKOUT / TRAP  
- Confidence → decision strength  
- Alignment → positioning vs price agreement  

---

## System Overview

### Chart Engine
- Real-time candles (1m / 5m / 15m / 1h)
- Stable rendering
- Contiguous minute reconstruction

### Positioning Layer

- REAL_GAMMA → NQ (CME), BTC (Deribit)
- POSITIONING_PROXY → XAU, OIL, others
- Clean separation — no fake gamma

### Decision Engine

Outputs structured decisions:

{
  "regime": "EXPANSION",
  "bias": "LONG",
  "confidence": 0.73,
  "condition": "BREAKOUT",
  "alignment": "STRONG"
}

---

## Current Status

🚧 Active development

Focus areas:
- Expanding CME options coverage (XAU / OIL)
- Gamma reliability
- Decision confidence scoring
- Performance and UX improvements

---

## Tech Stack

- React + TypeScript
- Vite
- Node backend
- Databento (futures + CME options)
- Deribit (crypto options)

---

## Security

- No API keys stored in repo  
- Uses .env for credentials  
- Safe for public viewing  

---

## Philosophy

ACTUS is not:
- an indicator
- a charting tool

It is:
→ a decision engine

---

## Author

Built by diddztrades