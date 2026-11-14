/** Merchant status notice: never treats a local notification as payment proof. */
const config={url:'https://iwutbrljiiodamtyoorg.supabase.co/functions/v1/lumo-approved',key:'sb_publishable_4dmChQek8k-opkVhO4N_KA_TCGVjWi6'};
export function merchantAvailabilityMessages(rows=[]){return ['merchant_payment','momo_collection'].flatMap(id=>{const service=rows.find(s=>s.serviceId===id);return service?.available===false?[{id,message:service.message||'This payment service is temporarily unavailable.'}]:[];});}
if(typeof document!=='undefined'){
 let pending=false;
 const refresh=async()=>{if(pending||document.visibilityState==='hidden'||globalThis.navigator?.onLine===false)return;pending=true;try{
  const response=await fetch(config.url,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.key},body:JSON.stringify({action:'serviceStatus'}),signal:AbortSignal.timeout(12000),credentials:'omit',cache:'no-store'});
  const data=await response.json();if(!response.ok||!data.ok||!Array.isArray(data.services))return;
  let banner=document.getElementById('merchant-service-availability');const notices=merchantAvailabilityMessages(data.services);
  if(!notices.length){banner?.remove();return;}
  if(!banner){banner=document.createElement('div');banner.id='merchant-service-availability';banner.setAttribute('role','status');banner.style.cssText='position:sticky;top:0;z-index:50;padding:12px 18px;background:#fff1ce;color:#35270b;font:600 13px/1.5 sans-serif;text-align:center';document.body.prepend(banner);}
  banner.textContent=notices.map(n=>(n.id==='merchant_payment'?'Lumo collections: ':'Guest mobile money: ')+n.message).join(' ');
 }catch{}finally{pending=false;}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
 const timer=setInterval(refresh,15000);timer.unref?.();globalThis.addEventListener?.('online',refresh);document.addEventListener('visibilitychange',refresh);
}
