import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { z } from 'zod';
import { createAuctionService } from './service.mjs';
import { createEbayBrowseProvider, createAuthorizedSalesProvider } from './ebay.mjs';

const output=v=>({content:[{type:'text',text:JSON.stringify(v)}],structuredContent:v});
const string=z.string().max(256).optional();
const itemSchema=z.object({
  title:string,brand:string,model:string,category:string,
  year:z.string().max(4).optional(),
  condition:z.enum(['new','used','refurbished','unknown']).optional(),
  imageUrl:z.string().url().max(2048).optional()
});

export function buildMcpServer(service){
  const server=new McpServer({name:'auction-intelligence',version:'0.1.0'},{capabilities:{tools:{}}});
  server.registerTool('identify_item',{
    description:'Normalize user-confirmed product details. No raw photo inspection yet.',
    inputSchema:itemSchema,annotations:{readOnlyHint:true}
  },async input=>output(service.identifyItem(input)));
  server.registerTool('find_comparables',{
    description:'Fetch real provider supplied active asking and optionally authorized sold comparisons. Never invent prices.',
    inputSchema:itemSchema,annotations:{readOnlyHint:true}
  },async input=>output(await service.findComparables(input)));
  server.registerTool('estimate_value',{
    description:'Evidence-backed valuation from verified sold comparisons; if unavailable show only indicative asking prices.',
    inputSchema:itemSchema,annotations:{readOnlyHint:true}
  },async input=>output(await service.estimate(input)));
  server.registerTool('recommend_marketplace',{
    description:'Compare estimated seller proceeds using user-supplied fee/shipping scenarios; otherwise unranked options.',
    inputSchema:itemSchema.extend({scenarios:z.array(z.object({
      marketplace:z.string().min(1).max(80),feePercent:z.number().min(0).lt(100),shippingCost:z.number().min(0)
    })).max(12).optional()}),annotations:{readOnlyHint:true}
  },async ({scenarios,...item})=>output(await service.recommendMarketplace(item,scenarios)));
  return server;
}
function allowedHost(req){
  const names=new Set(['localhost','127.0.0.1','[::1]',...String(process.env.MCP_ALLOWED_HOSTS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)]);
  const raw=String(req.headers.host||'').toLowerCase();
  const host=raw.startsWith('[')?raw.split(']')[0]+']':raw.split(':')[0];
  return names.has(host);
}
function allowedOrigin(req){
  if(!req.headers.origin)return true;
  return String(process.env.MCP_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).includes(String(req.headers.origin));
}
function authorized(req){
  const key=process.env.MCP_API_KEY;
  if(!key)return true;
  const a=Buffer.from(String(req.headers.authorization||'')),b=Buffer.from('Bearer '+key);
  return a.length===b.length&&timingSafeEqual(a,b);
}
function reply(res,code,body){
  res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify(body));
}
export function startServer({service,port=Number(process.env.PORT||8787),host=process.env.HOST||'127.0.0.1'}={}){
  if(!['localhost','127.0.0.1','::1'].includes(host)&&!process.env.MCP_API_KEY)
    throw new Error('Set MCP_API_KEY before exposing this service beyond loopback');
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid PORT');
  const app=service||createAuctionService({
    searchListings:createEbayBrowseProvider({clientId:process.env.EBAY_CLIENT_ID,clientSecret:process.env.EBAY_CLIENT_SECRET}),
    searchSales:createAuthorizedSalesProvider({endpoint:process.env.AUCTION_SOLD_API_URL,token:process.env.AUCTION_SOLD_API_TOKEN})
  });
  // A NEW MCP instance is constructed per request, per the 2026-07-28 stateless SDK guidance.
  const mcp=toNodeHandler(createMcpHandler(()=>buildMcpServer(app)));
  const http=createServer(async(req,res)=>{
    if(!allowedHost(req)||!allowedOrigin(req))return reply(res,403,{error:'host_or_origin_not_allowed'});
    if(req.url==='/health'&&req.method==='GET')return reply(res,200,{status:'ok',service:'auction-intelligence-mcp'});
    if(req.url!=='/mcp')return reply(res,404,{error:'not_found'});
    if(!authorized(req))return reply(res,401,{error:'unauthorized'});
    if(!['POST','GET','DELETE'].includes(req.method))return reply(res,405,{error:'method_not_allowed'});
    try{await mcp(req,res);}
    catch(e){console.error('MCP request failed:',e?.message||'unknown');if(!res.headersSent)reply(res,500,{error:'internal_error'});else res.end();}
  });
  http.listen(port,host);
  return http;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  startServer();
  console.log('Auction Intelligence MCP starting');
}
