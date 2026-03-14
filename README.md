# ActuaryAI

**Real-world risk modeling. Powered by prediction markets.**

ActuaryAI transforms prediction market data into actionable hedge portfolios for real-world risks. Describe what you're worried about, and the engine builds diversified strategies using live Polymarket data.

## Setup

### Backend

```bash
pip install -e .
actuaryai update-markets
actuaryai update-vectors
python -m uvicorn actuaryai.api.main:app --port 8000
```

### Frontend

```bash
cd web
npm install
npm run dev
```

### Environment

Create `.env` in the project root:

```
ANTHROPIC_API_KEY=sk-...
CEREBRAS_API_KEY=csk-...
```

## How It Works

1. Describe a concern (e.g. "SEC cracking down on crypto")
2. Vector search finds relevant prediction markets from Polymarket
3. AI filters and ranks markets by hedge value
4. Markets are grouped into themed portfolios with budget allocation
5. Interactive strategy cards with risk scores and payout projections
