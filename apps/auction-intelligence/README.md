# Auction Intelligence — ChatGPT MCP backend (0.1.0)

This is a **separate server-side ChatGPT integration** inside the existing `Auction-` repository. It reuses Auction's existing comparable ranking and deterministic valuation engine, without changing the browser extension.

## Four MCP tools

1. `identify_item` accepts user-confirmed name, brand, model, category, year and condition; **it does not read actual image pixels yet**.
2. `find_comparables` returns real authorized-marketplace asking listings and optional separately licensed sold records, with provider status and source links.
3. `estimate_value` estimates from **two or more verified sold sales**; where those do not exist it provides only a labeled **asking-price indicator** and never pretends listing prices are realized sales. Confidence is a **heuristic**, not a statistically calibrated probability.
4. `recommend_marketplace` compares proceeds only using **seller-supplied fee and shipping scenarios** and a verified sale-based valuation. Otherwise it offers **unranked** channels to research.

## Run locally (Node 20+)

```bash
cd apps/auction-intelligence
npm install
npm test
npm start
```

Local health: `http://127.0.0.1:8787/health`  
Local Streamable HTTP MCP endpoint: `http://127.0.0.1:8787/mcp`

The MCP SDK is `@modelcontextprotocol/server` v2.3.1 with `@modelcontextprotocol/node`, using a fresh stateless server instance per HTTP request. ChatGPT needs a **remote HTTPS endpoint**; this local address cannot be registered directly.

## Environment (only on server, never commit secrets)

```text
HOST=127.0.0.1
PORT=8787
# EBAY_CLIENT_ID=<approved eBay app>
# EBAY_CLIENT_SECRET=<secret>
# AUCTION_SOLD_API_URL=https://your-authorized-sold-data-provider.example/api
# AUCTION_SOLD_API_TOKEN=<secret>
# MCP_API_KEY=<secret>               # required for non-loopback binding
# MCP_ALLOWED_HOSTS=your-domain.example
# MCP_ALLOWED_ORIGINS=https://trusted-client-origin.example
```

eBay Browse is for active **asking** listings. eBay's Marketplace Insights sold-history API has restricted access: no permission or production access is assumed. A separate authorized sold-data provider must return JSON `{"sales":[...]}` with `title`, `source`, `sourceId`, `soldPrice` or `price`, `currency`, `condition`, `soldAt`, `url`, and verified transaction `verification`. Only set `verified_sale` when supported by actual provider transaction records.

## Connect to ChatGPT

Deploy this package behind HTTPS, configure allowed host/origin and an actual per-user authentication mechanism, and use the supported ChatGPT Apps SDK / custom app developer flow to register the `/mcp` endpoint. For a developer proof of concept, the optional shared `MCP_API_KEY` guards access; **it is not production OAuth or a user billing system**. ChatGPT access to developer-mode app creation varies by plan/workspace.

Users can provide image-based item details through ChatGPT's vision input **when available**, but photo identification is not yet implemented inside this backend. Model, edition and condition must be confirmed before relying on results.

## Not yet implemented

Actual image recognition, end-user OAuth and subscriptions, user-specific persistent valuation history, statistical confidence calibration, production-rate limiting, marketplace-specific demand/sell-through intelligence, listing creation/publishing, and real paid-plan quotas. The app cannot claim marketplace sales without authorized sold-data access.

## Verification

Run `npm test` in the app directory. Root `npm test` uses the existing Auction regression suite and also discovers the new Node test file. The read-only service functions are unit-tested without live provider secrets. End-to-end ChatGPT registration and actual live marketplace searches require a deployed authenticated endpoint and permissions.

**Engineering rule:** Evidence and provider access precede monetization and any claims of confidence.