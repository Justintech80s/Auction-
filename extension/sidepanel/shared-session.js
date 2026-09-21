const API='https://auction-jays-list.vercel.app/api/product-scan';
const el=id=>document.getElementById(id);const setText=(id,v)=>{const x=el(id);if(x)x.textContent=String(v??'—')};const setHidden=(id,v)=>{const x=el(id);if(x)x.hidden=!!v};
function money(v,c='USD'){const n=Number(v);if(!Number.isFinite(n))return'—';try{return new Intl.NumberFormat('en-US',{style:'currency',currency:c||'USD'}).format(n)}catch{return'—'}}
function safeUrl(v){try{const u=new URL(String(v||''));return u.protocol==='https:'?u.toString():null}catch{return null}}
function feature(text){const s=document.createElement('span');s.textContent=String(text);return s}
function renderProduct(p){if(!p)return;setText('shared-product-heading',p.title||'Product identified');setText('shared-product-meta',[p.brand||'Unknown',p.model].filter(Boolean).join(' · '));const list=el('shared-product-features');list?.replaceChildren();for(const x of p.features||[])list?.append(feature(x));const img=el('shared-product-image'),url=safeUrl(p.imageUrl);if(img&&url){img.src=url;img.hidden=false}}
function offerCard(o){const a=document.createElement('article');a.className='offer-card';const h=document.createElement('div');h.className='offer-heading-row';const store=document.createElement('strong');store.textContent=o.store||'Store';const price=document.createElement('strong');price.textContent=money(o.price,o.currency);h.append(store,price);const title=document.createElement('p');title.className='offer-title';title.textContent=o.title||'Same product';a.append(h,title);const url=safeUrl(o.url);if(url){const link=document.createElement('a');link.className='buy-link';link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Visit Store';a.append(link)}return a}
function renderResult(r){setHidden('shared-scan-results',false);renderProduct(r.identifiedProduct);const offers=(r.priceComparison||[]).filter(o=>o?.guardianDecision!=='reject'&&safeUrl(o.url));const list=el('shared-comparison-list');list?.replaceChildren();for(const o of offers)list?.append(offerCard(o));if(!offers.length){const p=document.createElement('p');p.textContent='No verified prices found.';list?.append(p)}setText('shared-comparison-count',`${offers.length} offer${offers.length===1?'':'s'}`);const low=r.lowestPrice,url=safeUrl(low?.url);setHidden('shared-lowest-price-card',!low);if(low){setText('shared-lowest-price',money(low.amount,low.currency));setText('shared-lowest-store',low.store||'Store');setText('shared-lowest-details',[low.condition,low.estimatedTotal? `Delivered ${money(low.estimatedTotal,low.currency)}`:null].filter(Boolean).join(' · '));const link=el('shared-lowest-link');if(link&&url){link.href=url;link.hidden=false}}setText('shared-save-amount',r.savings?`Save ${money(r.savings.amount,r.savings.currency)}`:'');const tips=el('shared-savings-tips');tips?.replaceChildren();for(const t of r.savingsTips||[]){const li=document.createElement('li');li.textContent=t;tips?.append(li)}setHidden('shared-savings-card',!(r.savingsTips||[]).length)}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=reject;r.readAsDataURL(file)})}
function canvasBlob(canvas,type,quality){return new Promise(resolve=>canvas.toBlob(resolve,type,quality))}
async function prepareImage(file){
  const bitmap=await createImageBitmap(file);let scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));let quality=.86;
  for(let attempt=0;attempt<7;attempt++){
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d',{alpha:false}).drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await canvasBlob(canvas,'image/jpeg',quality);
    if(blob&&blob.size<=480*1024){bitmap.close?.();return{dataUrl:await fileToDataUrl(blob),mimeType:'image/jpeg'}}
    quality=Math.max(.5,quality-.08);scale*=.82;
  }
  bitmap.close?.();throw new Error('image_prepare_failed')
}
let selected=null;
async function choose(file){
  if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type)){setText('upload-status','Choose a JPG, PNG, or WebP product photo.');return}
  if(file.size>8*1024*1024){setText('upload-status','Photo must be 8 MB or smaller.');return}
  try{
    setText('upload-status','Preparing product photo…');const prepared=await prepareImage(file);selected={file,...prepared};
    el('photo-preview').src=prepared.dataUrl;setText('photo-filename',file.name);setHidden('photo-preview-wrap',false);el('find-price').disabled=false;setText('upload-status','Photo ready. Click Find Cheapest Price.')
  }catch{selected=null;el('find-price').disabled=true;setText('upload-status','Auction could not prepare this photo. Try another JPG, PNG, or WebP image.')}
}
async function search(){
  if(!selected)return;const btn=el('find-price');btn.disabled=true;setText('upload-status','Identifying the product from the photo and searching stores…');
  try{
    const payload={action:'product_scan',source:'browser_extension_photo',evidence:{pageTitle:null,title:null,imageUrl:null,confidence:0},image:{dataUrl:selected.dataUrl,mimeType:selected.mimeType,name:selected.file.name}};
    const res=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});if(!res.ok)throw new Error('request failed');
    const result=await res.json();renderResult(result);
    const messages={complete:'Product identified and live prices found.',partial_results:'Product identified. Some stores could not be checked.',no_results:'Product identified, but no safe exact-price matches were found.',needs_confirmation:'The photo could not be identified. Try a clearer photo of the front of the product.',provider_unavailable:'The product search provider is unavailable right now.'};
    setText('upload-status',messages[result.status]||'Search complete.')
  }catch{setText('upload-status','Auction could not complete this photo search. Please try again.')}finally{btn.disabled=false}
}
function start(){
  const input=el('photo-input'),zone=el('photo-dropzone');
  zone.addEventListener('click',()=>input.click());input.addEventListener('change',()=>void choose(input.files?.[0]));
  const stop=e=>{e.preventDefault();e.stopPropagation()};
  for(const type of ['dragenter','dragover']){document.addEventListener(type,stop);zone.addEventListener(type,e=>{stop(e);zone.classList.add('dragover')})}
  for(const type of ['dragleave','drop'])zone.addEventListener(type,e=>{stop(e);zone.classList.remove('dragover')});
  document.addEventListener('drop',e=>{stop(e);const file=e.dataTransfer?.files?.[0];if(file)void choose(file)});
  zone.addEventListener('drop',e=>{const file=e.dataTransfer?.files?.[0];if(file)void choose(file)});
  el('find-price').addEventListener('click',()=>void search())
}
if(typeof document!=='undefined')document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
