import assert from 'node:assert/strict';
import test from 'node:test';
import {createAuctionService,identifyItem,normalizeItem} from './service.mjs';
import {createEbayBrowseProvider} from './ebay.mjs';
const item={title:'Sony WM-2 Walkman',brand:'Sony',model:'WM-2',category:'Walkman',condition:'used'};
const now=()=>new Date('2026-10-08T12:00:00Z');
const sale=(id,price,verification='verified_sale')=>({
  title:'Sony WM-2 Walkman portable player '+id,source:'approved-feed',sourceId:id,price,
  soldAt:'2026-10-01T00:00:00Z',verification,currency:'USD',condition:'used',url:'https://example.org/sales/'+id
});
const listing=(id,price,title='Sony WM-2 Walkman portable player')=>({
  title,source:'ebay',sourceId:id,price,currency:'USD',condition:'used',url:'https://www.ebay.com/itm/'+id
});
test('identity does not pretend to inspect images',()=>{
  assert.equal(identifyItem(item).status,'identified_from_user_details');
  assert.equal(identifyItem({title:item.title}).status,'needs_confirmation');
  assert.equal(identifyItem(item).imageAnalyzed,false);
  assert.throws(()=>normalizeItem({}),/title or model/);
});
test('missing providers are never replaced by hallucinated values',async()=>{
  const s=createAuctionService({now});
  assert.equal((await s.findComparables(item)).status,'provider_unavailable');
  const v=await s.estimate(item);
  assert.equal(v.fairMarketValue,null);
  assert.equal(v.confidence.score,0);
});
test('active asking prices cannot become verified resale values',async()=>{
  const s=createAuctionService({searchListings:async()=>[listing('1',200),listing('2',210),listing('3',220)],now});
  const v=await s.estimate(item);
  assert.equal(v.status,'asking_only_indicator');
  assert.equal(v.fairMarketValue,null);
  assert.ok(v.askingPriceIndicator.estimate>0);
  assert.ok(v.confidence.score<=40);
  assert.equal(v.pricing,null);
});
test('verified sales yield a sold-based price independent of asks',async()=>{
  const s=createAuctionService({searchListings:async()=>[listing('1',900)],
    searchSales:async()=>[sale('1',180),sale('2',210),sale('3',190)],now});
  const v=await s.estimate(item);
  assert.equal(v.status,'sold_based_estimate');
  assert.equal(v.evidence.verifiedSoldCount,3);
  assert.ok(v.fairMarketValue.estimate>=180&&v.fairMarketValue.estimate<=210);
  assert.ok(v.pricing.quickSale<v.fairMarketValue.estimate);
});
test('mismatch and parts-only offers are removed',async()=>{
  const s=createAuctionService({searchListings:async()=>[
    listing('1',200),listing('2',400,'Sony WM-2 Walkman case only'),
    {...listing('3',320),condition:'new'},
    {...listing('4',410),url:'http://evil.invalid/item'}
  ],now});
  const r=await s.findComparables(item);
  assert.equal(r.comparables.length,1);
  assert.equal(r.comparables[0].sourceId,'1');
});
test('unverified sold claims have no verified-sale authority',async()=>{
  const s=createAuctionService({searchSales:async()=>[
    sale('x',180,'unverified_sale_claim'),sale('y',250,'unverified_sale_claim')
  ],now});
  const v=await s.estimate(item);
  assert.equal(v.fairMarketValue,null);
  assert.equal(v.evidence.verifiedSoldCount,0);
});
test('scenario fees alter proceeds, not claimed marketplace demand',async()=>{
  const s=createAuctionService({searchSales:async()=>[sale('1',180),sale('2',200)],now});
  const r=await s.recommendMarketplace(item,[
    {marketplace:'eBay',feePercent:15,shippingCost:10},
    {marketplace:'Facebook Marketplace',feePercent:0,shippingCost:0}
  ]);
  assert.equal(r.status,'scenario_comparison');
  assert.equal(r.topByModeledNet.marketplace,'Facebook Marketplace');
  assert.match(r.note,/does not predict demand/);
});
test('Browse API asks remain asking signals and disabled without credentials',async()=>{
  assert.equal(createEbayBrowseProvider({}),null);
  const calls=[];
  const p=createEbayBrowseProvider({clientId:'test',clientSecret:'test',fetchImpl:async(url,init)=>{
    calls.push({url:String(url),init});
    if(String(url).includes('/oauth2/token'))
      return {ok:true,json:async()=>({access_token:'token',expires_in:3600})};
    return {ok:true,json:async()=>({itemSummaries:[
      {itemId:'123',title:'Sony WM-2 Walkman',price:{value:'210',currency:'USD'},
        itemWebUrl:'https://www.ebay.com/itm/123',condition:'Used'}
    ]})};
  }});
  const data=await p('Sony WM-2 Walkman');
  assert.equal(data.length,1);
  assert.equal(data[0].price,'210');
  assert.equal(calls[0].init.method,'POST');
  assert.equal(calls[1].init.headers['x-ebay-c-marketplace-id'],'EBAY_US');
});
