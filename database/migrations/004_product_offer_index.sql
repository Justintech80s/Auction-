-- Product Offer Index: canonical identifiers, aliases, and fast offer lookup.
alter table auction.products add column if not exists gtin text;
alter table auction.products add column if not exists mpn text;
alter table auction.products add column if not exists aliases text[] not null default '{}'::text[];
alter table auction.products add column if not exists category text;
create unique index if not exists products_gtin_unique on auction.products (gtin) where gtin is not null;
create index if not exists products_mpn_idx on auction.products (lower(mpn)) where mpn is not null;
create index if not exists products_aliases_gin_idx on auction.products using gin (aliases);
create index if not exists offers_live_lookup_idx on auction.offers (product_id, availability, item_price, checked_at desc) where guardian_decision='allow' and match_classification='exact';
create index if not exists offers_store_live_lookup_idx on auction.offers (store_id, product_id, item_price, checked_at desc) where guardian_decision='allow' and match_classification='exact';

create table if not exists auction.product_identifiers (
 id bigint generated always as identity primary key,
 product_id uuid not null references auction.products(id) on delete cascade,
 identifier_type text not null check(identifier_type in ('gtin','upc','ean','mpn','sku','asin','other')),
 identifier_value text not null check(length(trim(identifier_value))>0),
 source text not null default 'discovery',
 confidence numeric(4,3) not null default 1 check(confidence>=0 and confidence<=1),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(identifier_type,identifier_value)
);
create index if not exists product_identifiers_product_idx on auction.product_identifiers(product_id);

create table if not exists auction.discovery_runs (
 id uuid primary key default gen_random_uuid(),
 product_id uuid references auction.products(id) on delete set null,
 query text not null,
 providers text[] not null default '{}'::text[],
 offers_seen integer not null default 0 check(offers_seen>=0),
 offers_accepted integer not null default 0 check(offers_accepted>=0),
 started_at timestamptz not null default now(),
 completed_at timestamptz
);
create index if not exists discovery_runs_product_started_idx on auction.discovery_runs(product_id,started_at desc);

revoke all on auction.product_identifiers from anon, authenticated;
revoke all on auction.discovery_runs from anon, authenticated;
