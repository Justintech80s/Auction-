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

revoke all on schema auction from anon;
revoke all on schema auction from authenticated;
revoke all on all tables in schema auction from anon;
revoke all on all tables in schema auction from authenticated;
revoke all on all sequences in schema auction from anon;
revoke all on all sequences in schema auction from authenticated;
