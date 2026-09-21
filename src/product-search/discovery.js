function text(v,n=240){const s=String(v??'').trim().replace(/\s+/g,' ');return s?s.slice(0,n):null}
function values(o={}){return Object.entries(o).filter(([,v])=>text(v)).map(([k,v])=>({type:String(k).toLowerCase(),value:text(v,128)}))}
export function discoveryQueries(identity={}){
 const ids=values(identity.identifiers);const out=[];for(const x of ids)out.push(`"${x.value}"`);
 const brand=text(identity.brand,100),model=text(identity.model,100),title=text(identity.title,240);
 if(brand&&model&&title)out.push(`${brand} ${title} ${model} price buy online`);if(brand&&title)out.push(`${brand} ${title} price buy online`);if(brand&&model)out.push(`${brand} ${model}`);if(model&&title)out.push(`${model} ${title}`);if(title)out.push(`${title} price buy online`);
 return [...new Set(out.map(x=>x.trim()).filter(Boolean))].slice(0,8);
}
export async function discoverAcrossQueries(identity,{providers=[],searchAcrossStoresImpl}={}){
 if(typeof searchAcrossStoresImpl!=='function')throw new TypeError('searchAcrossStoresImpl required');
 const queries=discoveryQueries(identity);const offers=[],errors=[];const seen=new Set();
 for(const query of queries){const result=await searchAcrossStoresImpl({...identity,title:query},{providers,timeoutMs:5000});for(const o of result.offers||[]){const key=o.offerId||o.url;if(!key||seen.has(key))continue;seen.add(key);offers.push(o)}errors.push(...(result.providerErrors||[]))}
 return Object.freeze({queries:Object.freeze(queries),offers:Object.freeze(offers),providerErrors:Object.freeze(errors)});
}