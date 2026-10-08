// Authorized eBay Browse API: active asking listings, never verified completed sales.
const TOKEN_URL='https://api.ebay.com/identity/v1/oauth2/token';
const SEARCH_URL='https://api.ebay.com/buy/browse/v1/item_summary/search';

export function createEbayBrowseProvider({clientId,clientSecret,fetchImpl=globalThis.fetch}={}){
  if(!clientId||!clientSecret)return null;
  let token=null,expiry=0;
  async function accessToken(){
    if(token&&Date.now()<expiry-60000)return token;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const auth=Buffer.from(clientId+':'+clientSecret).toString('base64');
      const r=await fetchImpl(TOKEN_URL,{method:'POST',signal:controller.signal,
        headers:{authorization:'Basic '+auth,'content-type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({grant_type:'client_credentials',scope:'https://api.ebay.com/oauth/api_scope'})});
      if(!r.ok)throw new Error('ebay_auth_unavailable');
      const data=await r.json();
      if(typeof data.access_token!=='string'||!data.access_token)throw new Error('ebay_auth_unavailable');
      token=data.access_token;expiry=Date.now()+Math.min(7200,Number(data.expires_in)||3600)*1000;
      return token;
    }finally{clearTimeout(timer);}
  }
  return async function searchEbayListings(query){
    const q=String(query||'').slice(0,160);
    if(!q)return [];
    const bearer=await accessToken(),url=new URL(SEARCH_URL);
    url.searchParams.set('q',q);url.searchParams.set('limit','30');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const r=await fetchImpl(url,{method:'GET',signal:controller.signal,
        headers:{authorization:'Bearer '+bearer,'x-ebay-c-marketplace-id':'EBAY_US'}});
      if(!r.ok)throw new Error('ebay_browse_unavailable');
      const data=await r.json();
      if(!Array.isArray(data.itemSummaries))return [];
      return data.itemSummaries.map(row=>({source:'ebay',sourceId:row.itemId,
        title:row.title,price:row.price?.value,currency:row.price?.currency,
        condition:row.condition,url:row.itemWebUrl}));
    }finally{clearTimeout(timer);}
  };
}

// Configure only an authorized sold-data supplier; no permission to eBay sold data is assumed.
export function createAuthorizedSalesProvider({endpoint,token,fetchImpl=globalThis.fetch}={}){
  if(!endpoint||!token)return null;
  const url=new URL(endpoint);
  if(url.protocol!=='https:'||url.username||url.password)throw new TypeError('Sales URL must be HTTPS');
  return async function searchAuthorizedSales(query,item){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const r=await fetchImpl(url,{method:'POST',signal:controller.signal,
        headers:{authorization:'Bearer '+token,'content-type':'application/json'},
        body:JSON.stringify({query,item})});
      if(!r.ok)throw new Error('sold_provider_unavailable');
      const data=await r.json();
      if(!Array.isArray(data.sales))throw new Error('invalid_sold_provider_response');
      return data.sales.slice(0,50);
    }finally{clearTimeout(timer);}
  };
}
