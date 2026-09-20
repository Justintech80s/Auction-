function clean(v,n=300){const s=String(v??'').trim().replace(/\s+/g,' ');return s?s.slice(0,n):null}
function price(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null}
function https(v){try{const u=new URL(String(v||''));return u.protocol==='https:'?u.toString():null}catch{return null}}
export function createSerpApiShoppingProvider({apiKey,location='United States',fetchImpl=globalThis.fetch}={}){
 const key=clean(apiKey,512);if(!key)throw new TypeError('SerpApi credentials are required');if(typeof fetchImpl!=='function')throw new TypeError('fetch implementation is required');
 return Object.freeze({name:'google-shopping',async search(identity,{limit=30}={}){
  const q=clean([identity?.brand,identity?.model,identity?.title].filter(Boolean).join(' '),500);if(!q)return [];
  const url=new URL('https://serpapi.com/search.json');url.searchParams.set('engine','google_shopping');url.searchParams.set('q',q);url.searchParams.set('location',location);url.searchParams.set('hl','en');url.searchParams.set('gl','us');url.searchParams.set('api_key',key);
  const response=await fetchImpl(url,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('shopping_search_unavailable');const body=await response.json();
  return (body.shopping_results||[]).slice(0,Math.max(1,Math.min(40,limit))).map((x,i)=>({source:'google-shopping',sourceId:clean(x.product_id||String(i),240),store:clean(x.source,160)||'Online store',title:clean(x.title,512),itemPrice:price(x.extracted_price),shipping:null,currency:'USD',condition:clean(x.second_hand_condition,80)||'new',availability:null,url:https(x.product_link),imageUrl:https(x.thumbnail),raw:x})).filter(x=>x.title&&x.itemPrice&&x.url);
 }});
}