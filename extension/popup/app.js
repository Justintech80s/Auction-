function assertDependency(value, method, label) { if (!value || typeof value[method] !== 'function') throw new TypeError(`${label}.${method} is required`); return value; }
export function createPopupApp({ documentLike, tabs, sidePanel } = {}) {
  if (!documentLike?.getElementById) throw new TypeError('documentLike is required');
  const tabsApi=assertDependency(tabs,'query','tabs'), sidePanelApi=assertDependency(sidePanel,'open','sidePanel');
  const sidebarButton=documentLike.getElementById('open-sidebar'), status=documentLike.getElementById('popup-status');
  if(!sidebarButton||!status) throw new TypeError('popup controls are required');
  const setStatus=message=>{status.textContent=String(message||'');};
  async function activeTab(){const matches=await tabsApi.query({active:true,currentWindow:true});const tab=Array.isArray(matches)?matches[0]:null;return Number.isInteger(tab?.id)&&tab.id>0?tab:null;}
  async function openSidebar(){try{const tab=await activeTab();if(!tab){setStatus('Auction could not find the active tab.');return false;}await sidePanelApi.open({tabId:tab.id});setStatus('Auction photo search opened. Drag or upload a product photo in the sidebar.');return true;}catch{setStatus('Auction could not open the sidebar.');return false;}}
  sidebarButton.addEventListener('click',openSidebar);
  return Object.freeze({openSidebar,destroy(){sidebarButton.removeEventListener?.('click',openSidebar);}});
}
if(typeof document!=='undefined'&&globalThis.chrome){const start=()=>createPopupApp({documentLike:document,tabs:globalThis.chrome.tabs,sidePanel:globalThis.chrome.sidePanel});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
