import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
test('sidebar is the Auction website-style photo search experience',()=>{const html=read('extension/sidepanel/index.html');for(const text of ['Click to upload','drag and drop a product photo','Find Cheapest Price','Product Identified','Lowest Price Found','Price Comparison','Savings Tips'])assert.match(html,new RegExp(text));});
test('sidebar accepts image files and sends photo data to Auction API',()=>{const src=read('extension/sidepanel/shared-session.js');assert.match(src,/readAsDataURL/);assert.match(src,/browser_extension_photo/);assert.match(src,/image:\{dataUrl:data/);assert.match(src,/api\/product-scan/);});
test('popup no longer exposes page scanning',()=>{const html=read('extension/popup/index.html'),src=read('extension/popup/app.js');assert.doesNotMatch(html,/Scan This Product/);assert.doesNotMatch(src,/collectActiveProductEvidence|scanProduct/);assert.match(html,/Open Auction Photo Search/);});
