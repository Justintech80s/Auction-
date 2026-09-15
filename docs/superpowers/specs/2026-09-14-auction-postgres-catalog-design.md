# Auction PostgreSQL Catalog Design

## Goal
Add a durable PostgreSQL persistence layer for Auction so validated product identities, retailer offers, and historical prices can be stored and queried independently of the browser extension.

## Scope
This subsystem stores data only after Auction's existing backend has normalized provider responses and Guardian logic has accepted the relevant offer. Retailer APIs and feeds remain the source of current market data; PostgreSQL is the durable catalog and history layer, not a substitute for live retailer access.

## Architecture

Live provider (initially eBay Browse API)
→ `/api/product-scan`
→ identity normalization + Guardian validation
→ Auction PostgreSQL persistence adapter
→ `auction.products`, `auction.stores`, `auction.offers`, `auction.price_history`
→ API response
→ extension sidebar

The browser extension must never write directly to PostgreSQL. Database credentials remain server-side in Vercel/Supabase environment variables.

## Schema

### `auction.products`
Stores one canonical product record.

Fields:
- `id uuid primary key`
- `name text not null`
- `brand text`
- `model text`
- `barcode text`
- `specifications jsonb not null default '{}'`
- `image_urls text[] not null default '{}'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints and indexes:
- unique partial index on non-null barcode
- normalized brand/model lookup index
- case-insensitive name search index using `lower(name)`

### `auction.stores`
Stores retailer identity.

Fields:
- `id uuid primary key`
- `name text not null`
- `website_url text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:
- website URL must use HTTPS
- unique normalized retailer website hostname/URL representation

### `auction.offers`
Stores the latest known state for a product/store/provider item combination.

Fields:
- `id uuid primary key`
- `product_id uuid not null references auction.products(id)`
- `store_id uuid not null references auction.stores(id)`
- `provider text not null`
- `provider_offer_id text`
- `item_price numeric(12,2) not null`
- `shipping_price numeric(12,2)`
- `currency char(3) not null default 'USD'`
- `condition text`
- `availability text`
- `purchase_url text not null`
- `image_url text`
- `guardian_decision text not null default 'allow'`
- `match_classification text not null default 'exact'`
- `checked_at timestamptz not null default now()`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:
- non-negative price/shipping
- HTTPS purchase URL and image URL when present
- allowed Guardian values limited to `allow`, `reject`
- allowed match classifications limited to `exact`, `candidate`, `mismatch`
- uniqueness for provider/provider-offer when provider offer ID is present

Indexes:
- product + checked_at descending
- product + guardian/match classification
- store + product

### `auction.price_history`
Append-only snapshots of validated offers.

Fields:
- `id bigint generated always as identity primary key`
- `offer_id uuid not null references auction.offers(id)`
- `product_id uuid not null references auction.products(id)`
- `store_id uuid not null references auction.stores(id)`
- `item_price numeric(12,2) not null`
- `shipping_price numeric(12,2)`
- `currency char(3) not null default 'USD'`
- `observed_at timestamptz not null default now()`

Indexes:
- product + observed_at descending
- offer + observed_at descending
- store + product + observed_at descending

## Security
- Keep the Auction tables in a dedicated `auction` schema rather than `public`.
- Revoke direct access from `anon` and `authenticated` by default.
- No browser-side database credentials.
- Service credentials live only in server-side environment variables.
- Persist only normalized catalog and offer data; never store raw HTML, cookies, credentials, checkout data, payment data, cards, tokens, or authorization headers.
- Only Guardian-approved exact offers may become the public-facing lowest-price candidate.

## Persistence behavior
1. Upsert canonical product by barcode when available, otherwise by normalized brand/model/name identity.
2. Upsert store by normalized HTTPS website URL.
3. Upsert current offer by provider + provider offer ID; if absent, use product/store/provider/purchase URL identity.
4. Append a price-history row only after a validated offer is accepted.
5. Keep unknown shipping as `NULL`; do not convert it to zero.
6. Store timestamps in UTC using PostgreSQL `timestamptz`.

## Testing
Repository tests should verify:
- required tables, constraints, and indexes are present in migration SQL;
- unsafe HTTP URLs and negative prices are rejected by schema constraints;
- the adapter maps accepted provider offers to parameterized SQL inputs;
- unknown shipping remains `NULL`;
- rejected/mismatched offers are not persisted to price history;
- no prohibited raw request fields are written.

## Deployment
The repository migration is created and tested first. A dedicated Auction Supabase project is then created under the user's chosen organization after Supabase cost confirmation. The migration is applied to that project, advisors are run, and Vercel receives server-side database connection settings. Existing unrelated Supabase projects are not reused.