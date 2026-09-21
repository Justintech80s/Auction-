function decodeDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error('invalid_image');
  return { mimeType: match[1], bytes: Uint8Array.from(Buffer.from(match[2], 'base64')) };
}

function clean(value, max = 240) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return text ? text.slice(0, max) : null;
}

function bestLensMatch(result) {
  const rows = [
    ...(Array.isArray(result?.product_results) ? result.product_results : []),
    ...(Array.isArray(result?.visual_matches) ? result.visual_matches : [])
  ];
  return rows.find(row => clean(row?.title)) || null;
}

export function createSerpApiLensProvider({ apiKey, fetchImpl = globalThis.fetch } = {}) {
  if (!String(apiKey || '').trim()) throw new Error('SERPAPI_API_KEY is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetch is required');

  return {
    name: 'serpapi-lens',
    async identifyProduct({ dataUrl }) {
      const { mimeType, bytes } = decodeDataUrl(dataUrl);
      if (bytes.byteLength > 500 * 1024) throw new Error('image_too_large_for_lens');

      const form = new FormData();
      form.append('api_key', apiKey);
      form.append('image', new Blob([bytes], { type: mimeType }), mimeType === 'image/png' ? 'product.png' : mimeType === 'image/webp' ? 'product.webp' : 'product.jpg');
      const uploaded = await fetchImpl('https://serpapi.com/image', { method: 'POST', body: form });
      if (!uploaded.ok) throw new Error('lens_upload_failed');
      const uploadJson = await uploaded.json();
      if (!uploadJson?.image_id) throw new Error('lens_upload_failed');

      const params = new URLSearchParams({
        engine: 'google_lens',
        image_id: uploadJson.image_id,
        type: 'products',
        country: 'us',
        hl: 'en',
        safe: 'active',
        api_key: apiKey,
        output: 'json'
      });
      const response = await fetchImpl(`https://serpapi.com/search.json?${params}`);
      if (!response.ok) throw new Error('lens_search_failed');
      const json = await response.json();
      const match = bestLensMatch(json);
      if (!match) return null;

      return {
        title: clean(match.title),
        brand: null,
        model: null,
        category: 'product',
        imageUrl: clean(match.image || match.thumbnail, 1000),
        confidence: match.exact_matches ? 0.95 : 0.82,
        specs: {}
      };
    }
  };
}
