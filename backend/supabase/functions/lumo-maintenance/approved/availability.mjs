/** Server-owned service availability. Clients can read status, never set it. */
export const infrastructureFailure=error=>['SERVICE_UNAVAILABLE','COMMIT_FAILED','GUEST_SERVICE_ERROR','MERCHANT_COMMIT_FAILED','STORAGE_UNAVAILABLE'].includes(error?.code);
const network=value=>({'mtn momo':'mtn','mtn':'mtn','telecel cash':'telecel','telecel':'telecel','at money':'at','at':'at','airteltigo':'at'}[String(value||'').toLowerCase()]||'');
export function servicesForAction(body){
 if(body?.action==='guestCheckout')return body.operation==='initiate'?['merchant_payment','momo_collection',...(network(body.network)?['momo_collection_'+network(body.network)]:[])]:[];
 if(body?.action!=='action')return [];
 if(body.type==='fund')return ['test_funding'];
 if(body.type==='payment'){
  if(body.payload?.rail==='momo')return ['momo_send',...(network(body.payload?.recipient?.network)?['momo_send_'+network(body.payload.recipient.network)]:[])];
  if(body.payload?.rail==='bank')return ['bank_send'];
  return body.payload?.rail==='merchant'||body.payload?.shopId?['merchant_payment']:['lumo_transfer'];
 }
 // IOU settlement can merely match an existing receipt. The atomic journal
 // guard handles any actual new payment without blocking that bookkeeping.
 return [];
}
export function createAvailability({serviceRpc}){
 let lastStatus=null;
 async function status({probe=false,probeServices=[]}={}){const value=await serviceRpc('lumo_service_status',{p_payload:{probe,probeServices}});if(!value?.ok||!Array.isArray(value.services))throw Object.assign(new Error('Payment availability could not be checked. Try again shortly.'),{code:'SERVICE_UNAVAILABLE',status:503,noMutation:true});lastStatus=value;return value;}
 return {
  status,
  async gate(body){const ids=servicesForAction(body);if(!ids.length)return;const value=await status();for(const id of ids){const s=value.services.find(row=>row.serviceId===id);if(!s||s.available!==true)throw Object.assign(new Error(s?.message||'This payment option is temporarily unavailable. Please use another method or try again later.'),{code:'SERVICE_PAUSED',status:409,noMutation:true,serviceId:id});}},
  async observe(ids,error){const outcome=error?infrastructureFailure(error)?'infrastructure_failure':null:'success';if(!outcome)return;await Promise.all(ids.map(serviceId=>serviceRpc('lumo_service_observe',{p_payload:{serviceId,outcome}}).catch(()=>null)));},
  get cached(){return lastStatus;}
 };
}
