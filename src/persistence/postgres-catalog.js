function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validRecords(records) {
  if (!isObject(records) || !isObject(records.product) || !isObject(records.store) || !isObject(records.offer) || !isObject(records.history)) return false;
  const { product, store, offer, history } = records;
  if (typeof product.name !== 'string' || !product.name.trim()) return false;
  if (typeof store.name !== 'string' || !store.name.trim()) return false;
  if (typeof store.websiteUrl !== 'string' || !store.websiteUrl.startsWith('https://')) return false;
  if (offer.guardianDecision !== 'allow' || offer.matchClassification !== 'exact') return false;
  if (!Number.isFinite(offer.itemPrice) || offer.itemPrice <= 0) return false;
  if (offer.shippingPrice != null && (!Number.isFinite(offer.shippingPrice) || offer.shippingPrice < 0)) return false;
  if (offer.currency !== 'USD') return false;
  if (typeof offer.purchaseUrl !== 'string' || !offer.purchaseUrl.startsWith('https://')) return false;
  if (history.itemPrice !== offer.itemPrice || history.shippingPrice !== offer.shippingPrice || history.currency !== offer.currency) return false;
  return true;
}

function firstId(result) {
  const id = result?.rows?.[0]?.id;
  if (typeof id !== 'string' || !id) throw new Error('catalog_persistence_failed');
  return id;
}

async function resolveProduct(query, product) {
  if (product.barcode) {
    const result = await query(
      `insert into auction.products
        (name, brand, model, barcode, specifications, image_urls, updated_at)
       values ($1, $2, $3, $4, $5::jsonb, $6::text[], now())
       on conflict (barcode) where barcode is not null
       do update set
         name = excluded.name,
         brand = excluded.brand,
         model = excluded.model,
         specifications = excluded.specifications,
         image_urls = excluded.image_urls,
         updated_at = now()
       returning id`,
      [
        product.name,
        product.brand ?? null,
        product.model ?? null,
        product.barcode,
        JSON.stringify(product.specifications ?? {}),
        Array.isArray(product.imageUrls) ? product.imageUrls : []
      ]
    );
    return firstId(result);
  }

  const existing = await query(
    `select id from auction.products
     where lower(name) = lower($1)
       and coalesce(lower(brand), '') = coalesce(lower($2), '')
       and coalesce(lower(model), '') = coalesce(lower($3), '')
     order by created_at asc
     limit 1`,
    [product.name, product.brand ?? null, product.model ?? null]
  );
  if (existing?.rows?.[0]?.id) return firstId(existing);

  const inserted = await query(
    `insert into auction.products
      (name, brand, model, barcode, specifications, image_urls, updated_at)
     values ($1, $2, $3, null, $4::jsonb, $5::text[], now())
     returning id`,
    [
      product.name,
      product.brand ?? null,
      product.model ?? null,
      JSON.stringify(product.specifications ?? {}),
      Array.isArray(product.imageUrls) ? product.imageUrls : []
    ]
  );
  return firstId(inserted);
}

async function resolveStore(query, store) {
  const result = await query(
    `insert into auction.stores (name, website_url, updated_at)
     values ($1, $2, now())
     on conflict (lower(website_url))
     do update set name = excluded.name, updated_at = now()
     returning id`,
    [store.name, store.websiteUrl]
  );
  return firstId(result);
}

async function resolveOffer(query, productId, storeId, offer) {
  const params = [
    productId,
    storeId,
    offer.provider,
    offer.providerOfferId ?? null,
    offer.itemPrice,
    offer.shippingPrice,
    offer.currency,
    offer.condition ?? null,
    offer.availability ?? null,
    offer.purchaseUrl,
    offer.imageUrl ?? null,
    offer.guardianDecision,
    offer.matchClassification
  ];

  if (offer.providerOfferId) {
    const result = await query(
      `insert into auction.offers
        (product_id, store_id, provider, provider_offer_id, item_price, shipping_price,
         currency, condition, availability, purchase_url, image_url,
         guardian_decision, match_classification, checked_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now())
       on conflict (provider, provider_offer_id) where provider_offer_id is not null
       do update set
         product_id = excluded.product_id,
         store_id = excluded.store_id,
         item_price = excluded.item_price,
         shipping_price = excluded.shipping_price,
         currency = excluded.currency,
         condition = excluded.condition,
         availability = excluded.availability,
         purchase_url = excluded.purchase_url,
         image_url = excluded.image_url,
         guardian_decision = excluded.guardian_decision,
         match_classification = excluded.match_classification,
         checked_at = now(),
         updated_at = now()
       returning id`,
      params
    );
    return firstId(result);
  }

  const result = await query(
    `insert into auction.offers
      (product_id, store_id, provider, provider_offer_id, item_price, shipping_price,
       currency, condition, availability, purchase_url, image_url,
       guardian_decision, match_classification, checked_at, updated_at)
     values ($1, $2, $3, null, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now())
     returning id`,
    params
  );
  return firstId(result);
}

export function createPostgresCatalog({ query } = {}) {
  if (typeof query !== 'function') throw new TypeError('query_required');

  return Object.freeze({
    async persistScanResult(records) {
      if (!validRecords(records)) throw new Error('invalid_catalog_records');

      const productId = await resolveProduct(query, records.product);
      const storeId = await resolveStore(query, records.store);
      const offerId = await resolveOffer(query, productId, storeId, records.offer);

      await query(
        `insert into auction.price_history
          (offer_id, product_id, store_id, item_price, shipping_price, currency, observed_at)
         values ($1, $2, $3, $4, $5, $6, now())`,
        [
          offerId,
          productId,
          storeId,
          records.history.itemPrice,
          records.history.shippingPrice,
          records.history.currency
        ]
      );

      return { productId, storeId, offerId };
    }
  });
}
