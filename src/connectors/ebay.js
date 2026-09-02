const EBAY_BROWSE_SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';

export async function searchEbay(query, options = {}) {
  const accessToken = options.accessToken || process.env.EBAY_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('EBAY_ACCESS_TOKEN is required to search eBay');
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required');
  }

  const url = new URL(EBAY_BROWSE_SEARCH_URL);
  url.searchParams.set('q', String(query || '').trim());
  url.searchParams.set('limit', String(options.limit || 20));

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-EBAY-C-MARKETPLACE-ID': options.marketplaceId || 'EBAY_US'
    }
  });

  if (!response.ok) {
    const details = typeof response.text === 'function' ? await response.text() : '';
    throw new Error(`eBay Browse API request failed (${response.status})${details ? `: ${details}` : ''}`);
  }

  const payload = await response.json();
  return (payload.itemSummaries || []).flatMap((item) => {
    if (!item?.itemId || !item?.price?.value || !item?.price?.currency) return [];
    return [{
      source: 'ebay',
      sourceId: item.itemId,
      title: item.title || '',
      url: item.itemWebUrl || '',
      price: item.price.value,
      currency: item.price.currency,
      condition: item.condition || null,
      status: 'active',
      evidenceType: 'asking'
    }];
  });
}
