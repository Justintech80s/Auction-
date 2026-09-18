// Legacy side-panel entry retained only for source compatibility.
// The shipping UI is driven by shared-session.js and price-history.js from index.html.
export function formatMoney(value, currency = 'USD') {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: String(currency || 'USD').toUpperCase(), minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number); }
  catch { return '—'; }
}
export function formatPercent(value) { const number = Number(value); if (!Number.isFinite(number)) return '—'; return `${Math.round(Math.max(0, Math.min(1, number)) * 100)}%`; }
