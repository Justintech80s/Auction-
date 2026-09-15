# Auction PostgreSQL Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tested PostgreSQL persistence layer for Auction products, stores, offers, and price history, with server-only access and safe integration points for the existing product-scan backend.

**Architecture:** A dedicated private `auction` PostgreSQL schema stores canonical products, stores, current offers, and append-only historical price snapshots. The existing `/api/product-scan` backend remains the boundary for provider normalization and Guardian validation, and only accepted normalized data can be persisted.

**Tech Stack:** PostgreSQL 17 / Supabase-compatible SQL, Node.js 20+, native `node:test`, existing Auction ES modules.

**Spec:** `docs/superpowers/specs/2026-09-14-auction-postgres-catalog-design.md`

## Global Constraints

- Keep Auction persistence in a dedicated `auction` schema.
- Do not expose Auction tables directly to the browser extension.
- Revoke direct access from `anon` and `authenticated` by default.
- Never persist raw HTML, cookies, credentials, authorization headers, checkout data, payment data, card data, or tokens.
- Unknown shipping remains SQL `NULL`, never zero.
- Only Guardian-approved exact offers may be persisted into price history.
- Use `timestamptz` for timestamps.
- Use HTTPS-only retailer and purchase URLs.
- No real credentials may be committed to GitHub.

---

### Task 1: PostgreSQL schema migration

**Files:**
- Create: `database/migrations/001_auction_catalog.sql`
- Create: `test/database-schema.test.js`

**Interfaces:**
- Produces four tables: `auction.products`, `auction.stores`, `auction.offers`, `auction.price_history`.
- Produces constraints and indexes consumed by later persistence code.

- [ ] **Step 1: Write the failing schema test**

Create `test/database-schema.test.js` that reads `database/migrations/001_auction_catalog.sql` and asserts the SQL contains:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../database/migrations/001_auction_catalog.sql', import.meta.url), 'utf8');

for (const table of ['products', 'stores', 'offers', 'price_history']) {
  test(`migration creates auction.${table}`, () => {
    assert.match(sql, new RegExp(`create\\s+table\\s+auction\\.${table}`, 'i'));
  });
}

test('migration protects unsafe data and direct client access', () => {
  assert.match(sql, /https:\\/\\//i);
  assert.match(sql, /revoke\s+all\s+on\s+all\s+tables\s+in\s+schema\s+auction\s+from\s+anon/i);
  assert.match(sql, /revoke\s+all\s+on\s+all\s+tables\s+in\s+schema\s+auction\s+from\s+authenticated/i);
  assert.match(sql, /item_price\s+>=\s+0/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- test/database-schema.test.js
```

Expected: FAIL because `database/migrations/001_auction_catalog.sql` does not exist.

- [ ] **Step 3: Implement the migration**

Create `database/migrations/001_auction_catalog.sql` with:

```sql
create schema if not exists auction;

create extension if not exists pgcrypto;

create table auction.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  brand text,
  model text,
  barcode text,
  specifications jsonb not null default '{}'::jsonb,
  image_urls text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index products_barcode_unique
  on auction.products (barcode)
  where barcode is not null;
create index products_brand_model_idx
  on auction.products (lower(brand), lower(model));
create index products_name_lower_idx
  on auction.products (lower(name));

create table auction.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  website_url text not null check (website_url ~* '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index stores_website_url_unique
  on auction.stores (lower(website_url));

create table auction.offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references auction.products(id) on delete cascade,
  store_id uuid not null references auction.stores(id) on delete cascade,
  provider text not null check (length(trim(provider)) > 0),
  provider_offer_id text,
  item_price numeric(12,2) not null check (item_price >= 0),
  shipping_price numeric(12,2) check (shipping_price is null or shipping_price >= 0),
  currency char(3) not null default 'USD',
  condition text,
  availability text,
  purchase_url text not null check (purchase_url ~* '^https://'),
  image_url text check (image_url is null or image_url ~* '^https://'),
  guardian_decision text not null default 'allow' check (guardian_decision in ('allow', 'reject')),
  match_classification text not null default 'exact' check (match_classification in ('exact', 'candidate', 'mismatch')),
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index offers_provider_offer_unique
  on auction.offers (provider, provider_offer_id)
  where provider_offer_id is not null;
create index offers_product_checked_idx
  on auction.offers (product_id, checked_at desc);
create index offers_product_guardian_match_idx
  on auction.offers (product_id, guardian_decision, match_classification);
create index offers_store_product_idx
  on auction.offers (store_id, product_id);

create table auction.price_history (
  id bigint generated always as identity primary key,
  offer_id uuid not null references auction.offers(id) on delete cascade,
  product_id uuid not null references auction.products(id) on delete cascade,
  store_id uuid not null references auction.stores(id) on delete cascade,
  item_price numeric(12,2) not null check (item_price >= 0),
  shipping_price numeric(12,2) check (shipping_price is null or shipping_price >= 0),
  currency char(3) not null default 'USD',
  observed_at timestamptz not null default now()
);

create index price_history_product_observed_idx
  on auction.price_history (product_id, observed_at desc);
create index price_history_offer_observed_idx
  on auction.price_history (offer_id, observed_at desc);
create index price_history_store_product_observed_idx
  on auction.price_history (store_id, product_id, observed_at desc);

revoke all on schema auction from anon, authenticated;
revoke all on all tables in schema auction from anon, authenticated;
revoke all on all sequences in schema auction from anon, authenticated;
```

- [ ] **Step 4: Run the schema test**

Run:

```bash
npm test -- test/database-schema.test.js
```

Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run:

```bash
npm test
```

Expected: all existing Auction tests plus the new schema test pass.

- [ ] **Step 6: Commit**

```bash
git add database/migrations/001_auction_catalog.sql test/database-schema.test.js
git commit -m "feat: add Auction PostgreSQL catalog schema"
```

---

### Task 2: Safe persistence mapper

**Files:**
- Create: `src/persistence/catalog-records.js`
- Create: `test/catalog-records.test.js`

**Interfaces:**
- Produces `toCatalogRecords({ evidence, identifiedProduct, offer })`.
- Returns `{ product, store, offer, history }` for accepted exact offers.
- Returns `null` for rejected or non-exact offers.

- [ ] **Step 1: Write failing mapper tests**

Create tests covering:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { toCatalogRecords } from '../src/persistence/catalog-records.js';

const base = {
  evidence: { title: 'Apple AirPods Pro 2nd Generation', brand: 'Apple', model: 'AirPods Pro 2nd Generation' },
  identifiedProduct: { name: 'Apple AirPods Pro 2nd Generation', brand: 'Apple', model: 'AirPods Pro 2nd Generation' },
  offer: {
    source: 'ebay',
    sourceId: 'v1|123|0',
    store: 'eBay',
    url: 'https://www.ebay.com/itm/123',
    itemPrice: 220,
    shipping: null,
    currency: 'USD',
    condition: 'NEW',
    availability: 'in_stock',
    guardianDecision: 'allow',
    matchClassification: 'exact'
  }
};

test('maps accepted exact offer and preserves unknown shipping', () => {
  const records = toCatalogRecords(base);
  assert.equal(records.offer.shippingPrice, null);
  assert.equal(records.history.shippingPrice, null);
  assert.equal(records.offer.purchaseUrl, 'https://www.ebay.com/itm/123');
});

test('does not persist Guardian-rejected offer', () => {
  assert.equal(toCatalogRecords({ ...base, offer: { ...base.offer, guardianDecision: 'reject' } }), null);
});

test('does not persist candidate/mismatch offers to history', () => {
  assert.equal(toCatalogRecords({ ...base, offer: { ...base.offer, matchClassification: 'candidate' } }), null);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- test/catalog-records.test.js
```

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement `toCatalogRecords`**

Implementation requirements:
- require `guardianDecision === 'allow'`;
- require `matchClassification === 'exact'`;
- require HTTPS purchase URL;
- require positive finite item price;
- normalize unknown shipping to `null`;
- copy only safe fields explicitly;
- do not spread raw `evidence` or raw provider objects into returned records.

Return shape:

```js
{
  product: { name, brand, model, barcode, specifications, imageUrls },
  store: { name, websiteUrl },
  offer: {
    provider,
    providerOfferId,
    itemPrice,
    shippingPrice,
    currency,
    condition,
    availability,
    purchaseUrl,
    imageUrl,
    guardianDecision: 'allow',
    matchClassification: 'exact'
  },
  history: { itemPrice, shippingPrice, currency }
}
```

- [ ] **Step 4: Run mapper tests**

Run:

```bash
npm test -- test/catalog-records.test.js
```

Expected: PASS.

- [ ] **Step 5: Run full suite and commit**

```bash
npm test
git add src/persistence/catalog-records.js test/catalog-records.test.js
git commit -m "feat: add safe Auction catalog persistence mapper"
```

---

### Task 3: PostgreSQL persistence adapter

**Files:**
- Create: `src/persistence/postgres-catalog.js`
- Create: `test/postgres-catalog.test.js`

**Interfaces:**
- Produces `createPostgresCatalog({ query })`.
- `query(text, params)` is injected; no database package is required for unit tests.
- Produces async method `persistScanResult(records)` returning `{ productId, storeId, offerId }`.

- [ ] **Step 1: Write failing adapter tests**

Use a fake `query` function that records SQL and parameters. Verify:
- product insert/upsert executes first;
- store insert/upsert executes second;
- offer insert/upsert executes third;
- price-history insert executes only for accepted mapped records;
- SQL uses `$1`, `$2`, ... parameters instead of string interpolation;
- `null` shipping is passed as `null`.

- [ ] **Step 2: Run tests and confirm failure**

```bash
npm test -- test/postgres-catalog.test.js
```

Expected: FAIL because module is missing.

- [ ] **Step 3: Implement adapter**

Implement parameterized statements for:
1. product upsert using barcode when present, with brand/model/name fallback lookup;
2. store upsert using normalized `website_url`;
3. offer upsert using provider/provider-offer ID when present;
4. price-history insert using resolved IDs.

Do not accept raw browser evidence as an adapter input; only accept the safe mapper output from Task 2.

- [ ] **Step 4: Run adapter and full tests**

```bash
npm test -- test/postgres-catalog.test.js
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/persistence/postgres-catalog.js test/postgres-catalog.test.js
git commit -m "feat: add Auction PostgreSQL persistence adapter"
```

---

### Task 4: Integrate persistence into the product-scan backend

**Files:**
- Modify: `api/product-scan.js`
- Modify: `test/api-product-scan.test.js`

**Interfaces:**
- Extend `handleProductScan(payload, options)` with optional `catalog` dependency.
- Existing behavior remains unchanged when `catalog` is absent.
- Persist only normalized Guardian-approved exact offers after ranking.

- [ ] **Step 1: Add failing integration test**

Add a fake catalog with `persistScanResult()` and assert:
- it is called for exact/allowed returned offers;
- it is not called for rejected/non-exact offers;
- persistence failure does not leak database details to client response;
- live scan results remain available even when persistence is unavailable.

- [ ] **Step 2: Run focused API tests and confirm failure**

```bash
npm test -- test/api-product-scan.test.js
```

Expected: FAIL because catalog integration does not yet exist.

- [ ] **Step 3: Implement optional persistence hook**

After offer ranking and before returning the response:
- map each accepted exact offer using `toCatalogRecords`;
- call `catalog.persistScanResult(records)` when records are non-null;
- catch persistence errors internally;
- do not add raw database error strings to `providerErrors` or client output.

- [ ] **Step 4: Run focused and full tests**

```bash
npm test -- test/api-product-scan.test.js
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/product-scan.js test/api-product-scan.test.js
git commit -m "feat: persist validated Auction scan results"
```

---

### Task 5: Deployment configuration contract

**Files:**
- Modify: `.env.example`
- Create: `docs/database.md`
- Modify: `test/production-readiness.test.js`

**Interfaces:**
- Adds server-side database environment contract without committing credentials.
- Keeps existing eBay credentials unchanged.

- [ ] **Step 1: Add failing production-readiness assertion**

Extend the readiness test/helper so database configuration is optional for the existing live-pricing path but validated when provided. Reject non-PostgreSQL database URLs and URLs containing malformed credentials.

- [ ] **Step 2: Update `.env.example`**

Add:

```env
# Server-side PostgreSQL connection string for Auction catalog persistence.
# Never expose this value to the browser extension or NEXT_PUBLIC_* variables.
AUCTION_DATABASE_URL=
```

- [ ] **Step 3: Add deployment documentation**

`docs/database.md` must describe:
- creating a dedicated Auction Supabase/PostgreSQL project;
- applying `database/migrations/001_auction_catalog.sql`;
- running Supabase security/performance advisors;
- storing `AUCTION_DATABASE_URL` only in Vercel server environment variables;
- never placing service-role or database credentials in extension/frontend code;
- verifying data with a controlled server-side test scan.

- [ ] **Step 4: Run full verification**

```bash
npm test
npm run build:extension
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .env.example docs/database.md test/production-readiness.test.js
git commit -m "docs: define Auction database deployment contract"
```

---

### Task 6: Review, CI, and live-database handoff

**Files:**
- No additional implementation files unless verification finds a defect.

**Interfaces:**
- Produces a reviewable branch ready for pull request and subsequent Supabase deployment.

- [ ] **Step 1: Run final repository verification**

```bash
npm test
npm run build:extension
npm run verify:production -- https://auction-jays-list.vercel.app
```

The production verifier may still report provider/database environment configuration as unavailable until corresponding server secrets exist; that is an environment result, not a reason to fabricate secrets.

- [ ] **Step 2: Review diff for forbidden data paths**

Confirm no code persists or logs:
- raw HTML;
- cookies;
- credentials;
- authorization headers;
- checkout/payment/card/token fields.

- [ ] **Step 3: Open PR and run CI/CodeQL**

Open a PR from `feature/auction-postgres-catalog` into `main`, wait for tests and CodeQL, then merge only after green checks.

- [ ] **Step 4: Create dedicated Auction Supabase project**

Before creating a paid/possibly billable Supabase project, call Supabase organization/cost tools and obtain the user's required cost confirmation. Do not reuse Surgeon AI, Approach, StarDOM, Just Maker, or another unrelated project.

- [ ] **Step 5: Apply schema and run advisors**

Execute `database/migrations/001_auction_catalog.sql` against the dedicated Auction project, verify four tables exist, then run both security and performance advisors and resolve actionable findings.

- [ ] **Step 6: Configure Vercel server environment**

Add `AUCTION_DATABASE_URL` to the Auction Vercel project server environment without exposing it to client-side code, redeploy, and verify a controlled scan persists one product, store, offer, and price-history row.