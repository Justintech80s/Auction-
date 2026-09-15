create table auction.page_price_observations (
  id bigint generated always as identity primary key,
  product_id uuid not null references auction.products(id) on delete cascade,
  store_id uuid not null references auction.stores(id) on delete cascade,
  source_url text not null check (source_url ~* '^https://'),
  item_price numeric(12,2) not null check (item_price > 0),
  currency char(3) not null default 'USD' check (currency = 'USD'),
  condition text,
  product_identifier text,
  observed_at timestamptz not null default now()
);

create index page_price_observations_product_observed_idx
  on auction.page_price_observations (product_id, observed_at desc);
create index page_price_observations_store_product_observed_idx
  on auction.page_price_observations (store_id, product_id, observed_at desc);
create index page_price_observations_identifier_observed_idx
  on auction.page_price_observations (product_identifier, observed_at desc)
  where product_identifier is not null;

alter table auction.page_price_observations enable row level security;
revoke all on auction.page_price_observations from anon;
revoke all on auction.page_price_observations from authenticated;
revoke all on sequence auction.page_price_observations_id_seq from anon;
revoke all on sequence auction.page_price_observations_id_seq from authenticated;
