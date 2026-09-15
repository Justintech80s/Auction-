# Auction PostgreSQL Catalog

Auction uses PostgreSQL as a durable catalog and price-history store. The browser extension never connects to PostgreSQL directly. Store/provider data is collected by Auction's server-side pricing flow, validated by product matching and Guardian, then persisted only after an offer is classified as an exact match and allowed.

## Database layout

The migration at `database/migrations/001_auction_catalog.sql` creates a private `auction` schema with four tables:

- `auction.products` — normalized product identity, barcode, specifications, and safe HTTPS image URLs.
- `auction.stores` — retailer name and canonical HTTPS website origin.
- `auction.offers` — the most recent validated offer state per provider offer.
- `auction.price_history` — append-only observed price snapshots used for historical analysis.

Unknown shipping is stored as SQL `NULL`; it is never silently treated as zero. Raw HTML, cookies, credentials, authorization headers, checkout/payment/card/token data are not part of the persistence contract.

## Dedicated Supabase/PostgreSQL project

Create a dedicated Auction database instead of reusing databases belonging to other applications. For Supabase, create a separate Auction project in the intended organization and region, then apply `database/migrations/001_auction_catalog.sql` using the SQL execution tooling or an approved migration workflow.

After applying the migration:

1. Verify `auction.products`, `auction.stores`, `auction.offers`, and `auction.price_history` exist.
2. Run Supabase security advisors.
3. Run Supabase performance advisors.
4. Resolve actionable findings before enabling production persistence.

The migration explicitly revokes `anon` and `authenticated` access to the private Auction schema/tables/sequences. Do not expose these tables directly to the extension or a public Data API.

## Vercel server configuration

Configure the PostgreSQL connection string only as a server-side Vercel environment variable:

```env
AUCTION_DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
```

Never put the database URL, database password, Supabase secret/service-role key, or provider credentials in:

- extension source or `manifest.json`;
- browser storage;
- frontend JavaScript;
- `NEXT_PUBLIC_*` variables;
- committed `.env` files.

`AUCTION_DATABASE_URL` is optional while persistence is disabled. The existing live-pricing path must continue to operate if database persistence is unavailable.

## Safe write path

The intended write path is:

```text
retailer/provider API
  -> Auction server search
  -> product matcher
  -> Guardian
  -> exact + allow filter
  -> safe catalog mapper
  -> parameterized PostgreSQL adapter
  -> product/store/offer upsert
  -> price_history append
```

Database errors are operational concerns and must not be returned to the browser extension. Live scan results remain available even if a persistence attempt fails.

## Production verification

After the dedicated database is provisioned and `AUCTION_DATABASE_URL` is configured server-side:

1. Redeploy the Auction Vercel project.
2. Run `npm test` and `npm run build:extension`.
3. Run `npm run verify:production -- https://auction-jays-list.vercel.app`.
4. Perform one controlled product scan using a known exact product.
5. Verify the scan creates or updates exactly one product, one store, one offer, and appends one corresponding `price_history` row.
6. Confirm rejected or non-exact offers do not create price-history rows.

Do not fabricate store prices or database records to make the verification pass. A provider/database configuration failure should be reported as an environment issue and fixed at the deployment layer.
