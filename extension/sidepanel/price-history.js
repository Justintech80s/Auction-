const PRICE_HISTORY_RESULT = 'AUCTION_PRICE_HISTORY_RESULT';

function money(value, currency = 'USD') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  try { return new Intl.NumberFormat('en-US', { style:'currency', currency, minimumFractionDigits:2, maximumFractionDigits:2 }).format(number); }
  catch { return '—'; }
}

function safePoints(points) {
  if (!Array.isArray(points)) return [];
  return points.slice(-180).map(point => ({
    price: Number(point?.price),
    observedAt: String(point?.observed_at ?? point?.observedAt ?? ''),
    currency: String(point?.currency ?? 'USD').toUpperCase()
  })).filter(point => Number.isFinite(point.price) && point.price > 0 && point.currency === 'USD');
}

export function buildPriceHistoryViewModel(history = {}) {
  const points = safePoints(history.points);
  const currency = points.at(-1)?.currency ?? 'USD';
  const latest = points.at(-1)?.price;
  return Object.freeze({
    visible: Number(history.observations) > 0 || points.length > 0,
    currentPrice: money(latest, currency),
    low: money(history.low, currency),
    high: money(history.high, currency),
    average: money(history.average, currency),
    observations: String(Math.max(0, Number(history.observations) || points.length)),
    points: Object.freeze(points)
  });
}

function text(documentLike, id, value) { const node=documentLike?.getElementById?.(id); if (node) node.textContent=value; }

function renderChart(documentLike, points) {
  const svg=documentLike?.getElementById?.('history-chart');
  if (!svg?.replaceChildren || typeof documentLike?.createElementNS !== 'function') return;
  svg.replaceChildren();
  if (!points.length) return;
  const prices=points.map(point=>point.price); const low=Math.min(...prices); const high=Math.max(...prices); const span=Math.max(0.01,high-low);
  const coords=prices.map((price,index)=>`${points.length===1?50:(index/(points.length-1))*100},${90-((price-low)/span)*80}`).join(' ');
  const polyline=documentLike.createElementNS('http://www.w3.org/2000/svg','polyline');
  polyline.setAttribute('points',coords); polyline.setAttribute('fill','none'); polyline.setAttribute('stroke','currentColor'); polyline.setAttribute('stroke-width','2'); polyline.setAttribute('vector-effect','non-scaling-stroke');
  svg.appendChild(polyline);
}

export function renderPriceHistory(documentLike, history) {
  const view=buildPriceHistoryViewModel(history); const card=documentLike?.getElementById?.('price-history'); if (!card) return view;
  card.hidden=!view.visible; if (!view.visible) return view;
  text(documentLike,'history-current-price',view.currentPrice); text(documentLike,'history-low',view.low); text(documentLike,'history-high',view.high); text(documentLike,'history-average',view.average); text(documentLike,'history-observations',view.observations); renderChart(documentLike,view.points); return view;
}

export function attachPriceHistory({ documentLike=globalThis.document, runtime=globalThis.chrome?.runtime }={}) {
  if (!documentLike || !runtime?.onMessage?.addListener) return () => {};
  const listener=message=>{ if (message?.type===PRICE_HISTORY_RESULT) renderPriceHistory(documentLike,message.payload); };
  runtime.onMessage.addListener(listener);
  return ()=>runtime.onMessage?.removeListener?.(listener);
}

if (typeof document !== 'undefined' && globalThis.chrome?.runtime) {
  document.addEventListener('DOMContentLoaded',()=>attachPriceHistory(),{once:true});
}
