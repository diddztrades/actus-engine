# ═══════════════════════════════════════════════════════════════════════════
# ACTUS OS - Create Backend for Deployment
# Run this in VS Code terminal (PowerShell)
# ═══════════════════════════════════════════════════════════════════════════

Write-Host "🚀 Creating ACTUS OS Backend..." -ForegroundColor Cyan
Write-Host ""

# Create backend directory
New-Item -ItemType Directory -Force -Path "backend" | Out-Null

# ── Create server.js ───────────────────────────────────────────────────────
Write-Host "📄 Creating server.js..." -ForegroundColor Yellow

$serverJS = @'
// ─────────────────────────────────────────────────────────────────────────────
// ACTUS OS - Production API Proxy Server
// Solves CORS issues and provides reliable data fetching
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Simple in-memory cache
const cache = new Map();
const CACHE_DURATION = 30000; // 30 seconds

// ── Helper: Fetch with cache ──────────────────────────────────────────────────

async function fetchWithCache(key, fetchFn) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  const data = await fetchFn();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
}

// ── CoinGecko API Proxy (No geo-restrictions) ─────────────────────────────────

const COINGECKO_MAP = {
  'BTCUSDT': 'bitcoin',
  'ETHUSDT': 'ethereum',
  'SOLUSDT': 'solana'
};

app.get('/api/crypto/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const coinId = COINGECKO_MAP[symbol];

    if (!coinId) {
      return res.status(404).json({ error: `Unknown symbol: ${symbol}` });
    }

    const data = await fetchWithCache(`coingecko_${coinId}`, async () => {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const json = await response.json();
      const coinData = json[coinId];

      if (!coinData) {
        throw new Error('Invalid CoinGecko response');
      }

      return {
        price: coinData.usd,
        change24h: coinData.usd_24h_change || 0,
        timestamp: Date.now()
      };
    });

    res.json(data);
  } catch (error) {
    console.error('CoinGecko error:', error.message);
    res.status(500).json({ error: 'Failed to fetch crypto price' });
  }
});

// ── Yahoo Finance API Proxy ───────────────────────────────────────────────────

app.get('/api/market/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    const data = await fetchWithCache(`yahoo_${symbol}`, async () => {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`
      );

      if (!response.ok) {
        throw new Error(`Yahoo Finance error: ${response.status}`);
      }

      const json = await response.json();
      const result = json.chart?.result?.[0];

      if (!result || !result.meta) {
        throw new Error('Invalid Yahoo Finance response');
      }

      const meta = result.meta;
      const currentPrice = meta.regularMarketPrice || meta.previousClose;
      const previousClose = meta.previousClose || meta.chartPreviousClose;
      const change24h = previousClose
        ? ((currentPrice - previousClose) / previousClose) * 100
        : 0;

      return {
        price: currentPrice,
        change24h,
        timestamp: Date.now()
      };
    });

    res.json(data);
  } catch (error) {
    console.error('Yahoo Finance error:', error.message);
    res.status(500).json({ error: 'Failed to fetch market price' });
  }
});

// ── Health Check ──────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    cache_size: cache.size,
    uptime: process.uptime()
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'ACTUS OS API Proxy',
    status: 'running',
    endpoints: {
      crypto: '/api/crypto/:symbol (via CoinGecko)',
      market: '/api/market/:symbol (via Yahoo Finance)',
      health: '/api/health'
    }
  });
});

// ── Start Server ──────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 ACTUS OS API Proxy running on port ${PORT}`);
  console.log(`📡 Crypto: CoinGecko (no geo-restrictions)`);
  console.log(`📊 Markets: Yahoo Finance`);
  console.log(`💚 Health: http://localhost:${PORT}/api/health`);
});
'@

Set-Content -Path "backend/server.js" -Value $serverJS

# ── Create package.json ────────────────────────────────────────────────────
Write-Host "📄 Creating package.json..." -ForegroundColor Yellow

$packageJSON = @'
{
  "name": "actus-os-proxy",
  "version": "1.0.0",
  "description": "Production API proxy for ACTUS OS",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js"
  },
  "dependencies": {
    "cors": "^2.8.6",
    "express": "^4.22.1"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
'@

Set-Content -Path "backend/package.json" -Value $packageJSON

# ── Create .gitignore ──────────────────────────────────────────────────────
Write-Host "📄 Creating .gitignore..." -ForegroundColor Yellow

$gitignore = @'
node_modules/
.env
.DS_Store
npm-debug.log*
'@

Set-Content -Path "backend/.gitignore" -Value $gitignore

# ── Git operations ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "✅ Backend files created!" -ForegroundColor Green
Write-Host ""
Write-Host "📦 Next steps:" -ForegroundColor Cyan
Write-Host "   1. git add backend/" -ForegroundColor White
Write-Host "   2. git commit -m 'Add backend proxy server'" -ForegroundColor White
Write-Host "   3. git push" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Then in Render:" -ForegroundColor Cyan
Write-Host "   - Go to your actus-os service" -ForegroundColor White
Write-Host "   - Click 'Manual Deploy' → 'Deploy latest commit'" -ForegroundColor White
Write-Host ""

# Ask if user wants to auto-commit
$commit = Read-Host "Do you want to automatically commit and push? (y/n)"

if ($commit -eq "y" -or $commit -eq "Y") {
    Write-Host ""
    Write-Host "🔧 Committing to git..." -ForegroundColor Yellow
    
    git add backend/
    git commit -m "Add backend proxy server for ACTUS OS"
    
    Write-Host "📤 Pushing to GitHub..." -ForegroundColor Yellow
    git push
    
    Write-Host ""
    Write-Host "✅ Done! Backend pushed to GitHub!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🎯 Now go to Render and click 'Manual Deploy'!" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "👍 Files created! Run git commands manually when ready." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Backend ready for deployment! 🎉" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan