alter table auction.products enable row level security;
alter table auction.stores enable row level security;
alter table auction.offers enable row level security;
alter table auction.price_history enable row level security;

revoke all on schema auction from anon;
revoke all on schema auction from authenticated;
revoke all on all tables in schema auction from anon;
revoke all on all tables in schema auction from authenticated;
revoke all on all sequences in schema auction from anon;
revoke all on all sequences in schema auction from authenticated;
