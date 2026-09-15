function firstIdentifier(identifiers = {}) {
  for (const key of ['asin', 'sku', 'mpn', 'gtin', 'gtin13', 'gtin12', 'gtin14']) {
    const value = identifiers?.[key];
    if (typeof value === 'string' && value.trim()) return `${key}:${value.trim()}`.slice(0, 320);
  }
  return null;
}

function storeFromUrl(sourceUrl) {
  const url = new URL(sourceUrl);
  return {
    name: url.hostname.replace(/^www\./, ''),
    websiteUrl: `${url.protocol}//${url.host}/`
  };
}

async function productId(query, observation) {
  const identifier = firstIdentifier(observation.identifiers);
  if (identifier) {
    const found = await query(
      `select id from auction.products
       where specifications ->> 'pageIdentifier' = $1
       order by created_at asc limit 1`,
      [identifier]
    );
    if (found?.rows?.[0]?.id) return found.rows[0].id;
  }

  const found = await query(
    `select id from auction.products
     where lower(name) = lower($1)
       and coalesce(lower(brand), '') = coalesce(lower($2), '')
       and coalesce(lower(model), '') = coalesce(lower($3), '')
     order by created_at asc limit 1`,
    [observation.title, observation.brand ?? null, observation.model ?? null]
  );
  if (found?.rows?.[0]?.id) return found.rows[0].id;

  const specs = identifier ? { pageIdentifier: identifier } : {};
  const inserted = await query(
    `insert into auction.products (name, brand, model, specifications, updated_at)
     values ($1, $2, $3, $4::jsonb, now()) returning id`,
    [observation.title, observation.brand ?? null, observation.model ?? null, JSON.stringify(specs)]
  );
  return inserted.rows[0].id;
}

async function storeId(query, sourceUrl) {
  const store = storeFromUrl(sourceUrl);
  const result = await query(
    `insert into auction.stores (name, website_url, updated_at)
     values ($1, $2, now())
     on conflict (lower(website_url)) do update
       set name = excluded.name, updated_at = now()
     returning id`,
    [store.name, store.websiteUrl]
  );
  return result.rows[0].id;
}

export function createPagePriceObservationStore({ pool } = {}) {
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('pool_required');

  return Object.freeze({
    async persistPageObservation(observation) {
      if (!observation || typeof observation !== 'object') throw new TypeError('observation_required');
      if (typeof observation.title !== 'string' || !observation.title.trim()) throw new TypeError('title_required');
      if (!Number.isFinite(observation.price) || observation.price <= 0) throw new TypeError('price_required');
      if (observation.currency !== 'USD') throw new TypeError('usd_required');
      const source = new URL(observation.sourceUrl);
      if (source.protocol !== 'https:') throw new TypeError('https_required');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const pid = await productId((text, params) => client.query(text, params), observation);
        const sid = await storeId((text, params) => client.query(text, params), observation.sourceUrl);
        const identifier = firstIdentifier(observation.identifiers);
        await client.query(
          `insert into auction.page_price_observations
            (product_id, store_id, source_url, item_price, currency, condition, product_identifier, observed_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [pid, sid, observation.sourceUrl, observation.price, observation.currency,
           observation.condition ?? null, identifier, observation.capturedAt ?? new Date().toISOString()]
        );
        await client.query('COMMIT');
        return { productId: pid, storeId: sid };
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        throw error;
      } finally {
        client.release();
      }
    },

    async getPriceHistory({ productId, days = 90 } = {}) {
      const boundedDays = Math.max(1, Math.min(3650, Number(days) || 90));
      const result = await pool.query(
        `select p.item_price::float8 as price, p.currency, p.observed_at,
                s.name as store, p.source_url
         from auction.page_price_observations p
         join auction.stores s on s.id = p.store_id
         where p.product_id = $1
           and p.observed_at >= now() - ($2::text || ' days')::interval
         order by p.observed_at asc limit 1000`,
        [productId, String(boundedDays)]
      );
      return result.rows;
    }
  });
}
