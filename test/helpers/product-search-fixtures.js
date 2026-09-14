export function dellIdentity(overrides = {}) {
  return {
    title: 'Dell Latitude 7420',
    brand: 'Dell',
    model: 'Latitude 7420',
    category: 'Laptop',
    condition: 'used',
    identifiers: { mpn: 'LAT7420' },
    specs: { ram: '16GB', storage: '512GB SSD', screenSize: '14 inch' },
    sourceUrl: 'https://www.ebay.com/itm/123',
    imageUrl: 'https://images.example/dell-7420.jpg',
    confidence: 0.94,
    capturedAt: '2026-09-14T12:00:00.000Z',
    ...overrides
  };
}

export function dellEvidence(overrides = {}) {
  return {
    sourceUrl: 'https://www.google.com/search?q=dell+latitude+7420&tbm=isch',
    pageTitle: 'Dell Latitude 7420 - Google Images',
    title: 'Dell Latitude 7420',
    brand: 'Dell',
    model: 'Latitude 7420',
    category: 'Laptop',
    condition: null,
    identifiers: {},
    specs: { ram: '16GB', storage: '512GB SSD' },
    imageUrl: 'https://images.example/dell-7420.jpg',
    evidenceKinds: ['page_metadata', 'primary_image'],
    confidence: 0.62,
    capturedAt: '2026-09-14T12:00:00.000Z',
    ...overrides
  };
}

export function dellOffer(overrides = {}) {
  return {
    source: 'fixture-store',
    sourceId: 'offer-1',
    store: 'Fixture Store',
    title: 'Dell Latitude 7420 16GB 512GB SSD',
    url: 'https://shop.example/products/dell-7420',
    imageUrl: 'https://shop.example/images/dell-7420.jpg',
    brand: 'Dell',
    model: 'Latitude 7420',
    category: 'Laptop',
    identifiers: { mpn: 'LAT7420' },
    specs: { ram: '16GB', storage: '512GB SSD', screenSize: '14 inch' },
    condition: 'used',
    itemPrice: 220,
    shipping: 15,
    currency: 'USD',
    availability: 'in_stock',
    trustTier: 'trusted',
    sourceConfidence: 0.95,
    ...overrides
  };
}
