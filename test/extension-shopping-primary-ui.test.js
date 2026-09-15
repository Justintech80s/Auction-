import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('shopping results are the primary Auction sidebar experience', async () => {
  const html = await readFile(new URL('../extension/sidepanel/index.html', import.meta.url), 'utf8');

  assert.match(html, /id=["']shared-scan-results["']/);
  assert.match(html, /id=["']shared-lowest-price-card["']/);
  assert.match(html, /id=["']shared-comparison-list["']/);
  assert.match(html, /id=["']shared-savings-card["']/);

  const resultsPosition = html.indexOf('id="shared-scan-results"');
  const resalePosition = html.indexOf('id="resale-analysis-tools"');
  assert.ok(resultsPosition >= 0, 'shared shopping results must exist');
  assert.ok(resalePosition > resultsPosition, 'resale analysis must appear below shopping results');

  assert.match(
    html,
    /<details[^>]*id=["']resale-analysis-tools["'][^>]*>[\s\S]*?<summary[^>]*>\s*Resale Analysis\s*<\/summary>[\s\S]*?<section class=["']cost-card["']/
  );
  assert.doesNotMatch(
    html.match(/<details[^>]*id=["']resale-analysis-tools["'][^>]*>/)?.[0] ?? '',
    /\sopen(?:\s|=|>)/
  );
});
