import { estimateValue } from '../../src/valuation.js';
import { rankComparables } from '../../src/intelligence.js';

const partRe = /\b(for parts|parts only|not working|empty box|box only|replacement parts?|repair service|manual only|case only|cover only|accessory only)\b/i;
const clean = (v,n=256) => String(v??'').replace(/\s+/g,' ').trim().slice(0,n);
const money = n => Math.round(n*100)/100;
function https(v) { try {const u=new URL(String(v));return u.protocol==='https:'&&!u.username&&!u.password?u.toString():null;}catch{return null;} }
function condition(v) {const s=clean(v,40).toLowerCase();return /refurb|renewed/.test(s)?'refurbished':/used|pre-owned|secondhand/.test(s)?'used':/\bnew\b|sealed/.test(s)?'new':'unknown';}
export function normalizeItem(raw={}) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError('item must be an object');
  const item={title:clean(raw.title),brand:clean(raw.brand,100),model:clean(raw.model,120),category:clean(raw.category,100),year:clean(raw.year,10),condition:condition(raw.condition),imageUrl:https(raw.imageUrl)};
  if(!item.title&&!item.model)throw new TypeError('Provide item title or model');
  if(item.year&&!/^\d{4}$/.test(item.year))throw new TypeError('year must be four digits');
  return item;
}
export function identifyItem(raw) {
  const item=normalizeItem(raw);
  const enough=Boolean(item.brand&&item.model);
  return {status:enough?'identified_from_user_details':'needs_confirmation',item,confidence:null,imageAnalyzed:false,
    message:enough?'Brand and model were supplied, not independently verified.':'Confirm brand, exact model and condition; images are not inspected by this backend yet.'};
}
function record(raw,type,now) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const title=clean(raw.title,512),source=clean(raw.source,50),sourceId=clean(raw.sourceId,200),url=https(raw.url);
  const val=type==='sold'?(raw.soldPrice??raw.price):raw.price;
  if(typeof val!=='number'&&typeof val!=='string')return null;
  const price=Number(String(val).replace(/[$,\s]/g,''));
  if(!title||!source||!sourceId||!url||partRe.test(title)||!Number.isFinite(price)||price<=0||price>=10000000||String(raw.currency??'USD').toUpperCase()!=='USD')return null;
  const result={title,source,sourceId,url,price:money(price),currency:'USD',condition:condition(raw.condition),status:type==='sold'?'sold':'asking'};
  if(type==='sold') {
    const d=new Date(raw.soldAt);
    if(!raw.soldAt||!Number.isFinite(d.getTime())||d.getTime()>now.getTime())return null;
    result.soldAt=d.toISOString();
    result.verification=['verified_sale','seller_scoped_sale'].includes(raw.verification)?raw.verification:'unverified_sale_claim';
    const days=Math.floor((now.getTime()-d.getTime())/86400000);
    result.freshness={ageDays:days,isRecent:days<=90};
  }
  return result;
}
function normalizeMatches(item,raw,type,now){
  if(!Array.isArray(raw))throw new TypeError('Provider must return array');
  const seen=new Set();
  return rankComparables(item,raw.slice(0,50).map(r=>record(r,type,now)).filter(Boolean)).filter(c=>{
    if(c.similarity<0.65)return false;
    if(item.condition!=='unknown'&&c.condition!=='unknown'&&item.condition!==c.condition)return false;
    const key=c.source+':'+c.sourceId;
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
}
function channels(category){
  const s=category.toLowerCase();
  if(/music|guitar|synth|instrument|audio/.test(s))return ['Reverb','eBay'];
  if(/sneaker|shoe|streetwear/.test(s))return ['StockX','eBay','GOAT'];
  if(/antique|vintage|furniture|art/.test(s))return ['eBay','Etsy','Facebook Marketplace'];
  if(/watch/.test(s))return ['eBay','watch-specialist marketplaces'];
  return ['eBay','Facebook Marketplace'];
}
export function createAuctionService({searchListings=null,searchSales=null,now=()=>new Date()}={}){
  async function findComparables(input){
    const item=normalizeItem(input),query=[item.brand,item.model,item.category,item.year].filter(Boolean).join(' ')||item.title;
    const providers=[['active_listings',searchListings,'asking'],['sold_sales',searchSales,'sold']];
    const fetched=await Promise.all(providers.map(async ([key,fn,type])=>{
      if(!fn)return {status:'not_configured',rows:[]};
      try{return {status:'ok',rows:normalizeMatches(item,await fn(query,item),type,now())};}
      catch{return {status:'provider_unavailable',rows:[]};}
    }));
    const comparables=fetched.flatMap(r=>r.rows),operational=fetched.some(r=>r.status==='ok');
    return {status:!operational?'provider_unavailable':!comparables.length?'no_results':fetched.some(r=>r.status!=='ok')?'partial_results':'ok',
      item,query,comparables,
      evidence:{askingCount:comparables.filter(c=>c.status==='asking').length,
        soldCount:comparables.filter(c=>c.status==='sold').length,
        verifiedSoldCount:comparables.filter(c=>c.verification==='verified_sale').length},
      providers:Object.fromEntries(providers.map((p,i)=>[p[0],fetched[i].status])),
      note:'Asking prices are not completed sales. Sold evidence comes only from configured authorized providers.'};
  }
  async function estimate(input){
    const r=await findComparables(input);
    const verified=r.comparables.filter(c=>c.status==='sold'&&c.verification==='verified_sale'),asks=r.comparables.filter(c=>c.status==='asking');
    const enough=verified.length>=2,v=estimateValue(enough?verified:asks),ok=v.status==='ok';
    const saleBased=enough&&ok,indicative=!enough&&ok;
    const confidence=saleBased?Math.min(.95,v.confidence):indicative?Math.min(.4,v.confidence):0;
    return {status:!ok?'insufficient_evidence':saleBased?'sold_based_estimate':'asking_only_indicator',
      item:r.item,
      fairMarketValue:saleBased?{estimate:v.estimate,range:v.range}:null,
      askingPriceIndicator:indicative?{estimate:v.estimate,range:v.range}:null,
      pricing:saleBased?{quickSale:money(v.range.low*.9),suggestedListingPrice:money(v.range.high*1.07),note:'Heuristic starting prices, not guarantees.'}:null,
      confidence:{score:money(confidence*100),method:'uncalibrated heuristic, not a statistical probability'},
      evidence:r.evidence,providers:r.providers,comparables:r.comparables,
      note:saleBased?'Uses verified sold comparisons only; excludes fees and shipping.':'Insufficient verified sales to claim market value; active asking indicators are not sold prices.'};
  }
  async function recommendMarketplace(input,scenarios=[]){
    const r=await estimate(input),basis=r.fairMarketValue?.estimate;
    const modeled=basis&&Array.isArray(scenarios)?scenarios.slice(0,12).map(x=>{
      const marketplace=clean(x.marketplace,80),fee=Number(x.feePercent),shipping=Number(x.shippingCost);
      return marketplace&&Number.isFinite(fee)&&fee>=0&&fee<100&&Number.isFinite(shipping)&&shipping>=0
        ?{marketplace,assumedFeesPercent:fee,assumedShippingCost:money(shipping),estimatedNetProceeds:money(basis*(1-fee/100)-shipping)}:null;
    }).filter(Boolean).sort((a,b)=>b.estimatedNetProceeds-a.estimatedNetProceeds):[];
    return {status:modeled.length?'scenario_comparison':'insufficient_data_to_rank',
      topByModeledNet:modeled[0]??null,scenarios:modeled,channelsToExplore:channels(r.item.category),evidence:r.evidence,
      note:modeled.length?'Uses seller-provided fees and shipping with the same assumed selling price; does not predict demand or selling speed.':
        'Unranked suggestions only: marketplace-specific demand and seller fees are not verified.'};
  }
  return Object.freeze({identifyItem,findComparables,estimate,recommendMarketplace});
}
