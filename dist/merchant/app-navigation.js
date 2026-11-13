// Browser history contains route identifiers only. Financial drafts and proof
// material remain with their existing controllers, never in history.state.
const KEY='lumoMerchantNavigation';
const VERSION=1;
const simple=value=>typeof value==='string'&&value.length<=180&&/^[a-zA-Z0-9_.:-]+$/.test(value)?value:'';
const route=value=>({page:simple(value?.page)||'checkout',shopId:simple(value?.shopId)});
const identity=value=>typeof value==='string'?value:JSON.stringify(value??'');
const sameRoute=(a,b)=>a.page===b.page&&a.shopId===b.shopId;
const idModals=new Set(['request-detail','shop-qr','transaction','closing-detail','settlement-detail','ticket-detail','open-close','edit-shop']);
const plainModals=new Set(['collection-requests','notifications','account-menu','mobile-menu','approvals','privacy','sound-settings','role-switch','demo-console','confirm-reset','charge-shop','account-details','add-shop','add-staff','open-settle','edit-destination']);
function modalRoute(value){
 const kind=simple(value?.kind);
 if(idModals.has(kind)){const id=simple(value?.id);return id?{kind,id}:null;}
 return plainModals.has(kind)?{kind}:null;
}
const publicRoute=value=>({...route(value),modal:value?.modal?{...value.modal}:null});

export function createAppNavigation(options={}){
 const browserHistory=options.history??globalThis.history;
 const events=options.eventTarget??globalThis.window;
 const context=()=>identity(options.getContext?.()??'default');
 const restore=options.onRestore||(()=>{});
 const enabled=typeof browserHistory?.pushState==='function'&&typeof browserHistory?.replaceState==='function'&&typeof events?.addEventListener==='function';
 let current=null,destroyed=false,pendingBack=null;
 function read(raw,expected=context()){
  const value=raw?.[KEY];
  if(value?.version!==VERSION||value.context!==expected||!Number.isSafeInteger(value.index)||value.index<0)return null;
  const next=route(value);
  if(next.page!==value.page||next.shopId!==(value.shopId||''))return null;
  return {...next,version:VERSION,context:expected,index:value.index,layer:value.layer==='modal'?'modal':'page',modal:modalRoute(value.modal)};
 }
 function write(value,push=false){
  current=value;
  if(destroyed||!enabled)return false;
  try{browserHistory[push?'pushState':'replaceState']({[KEY]:value},'');return true;}catch{return false;}
 }
 function fresh(value){return {...route(value),version:VERSION,context:context(),index:0,layer:'page',modal:null};}
 function ensure(value){
  if(!current||current.context!==context()){
   pendingBack=null;
   const saved=enabled?read(browserHistory.state):null;
   current=saved||fresh(value);
   if(!saved)write(current);
  }
  return current;
 }
 function supersede(){if(pendingBack)pendingBack.superseded=true;}
 function syncPage(value,{replace=false}={}){
  const previous=ensure(value),nextRoute=route(value);
  supersede();
  if(previous.layer==='page'&&sameRoute(previous,nextRoute)&&!replace)return publicRoute(previous);
  const push=!replace&&previous.layer!=='modal';
  write({...previous,...nextRoute,index:previous.index+(push?1:0),layer:'page',modal:null},push);
  return publicRoute(current);
 }
 function openModal(value){
  const previous=ensure({page:'checkout'}),modal=modalRoute(value);
  supersede();
  const push=previous.layer!=='modal';
  write({...previous,index:previous.index+(push?1:0),layer:'modal',modal},push);
  return publicRoute(current);
 }
 function dismissModal(){
  const previous=ensure({page:'checkout'});
  supersede();
  if(previous.layer==='modal')write({...previous,layer:'page',modal:null});
  return publicRoute(current);
 }
 function backOrDismiss(fallback=()=>{}){
  const previous=ensure({page:'checkout'});
  if(pendingBack)return true;
  if(enabled&&!destroyed&&previous.layer==='modal'&&previous.index>0&&typeof browserHistory.back==='function'){
   pendingBack={from:previous.index,context:previous.context,superseded:false};
   try{browserHistory.back();return true;}catch{pendingBack=null;}
  }
  dismissModal();fallback();return false;
 }
 function reset(value={page:'checkout'}){
  const waiting=pendingBack;
  write(fresh(value));
  // If a browser Back was already queued, keep a fence until its popstate.
  if(waiting)pendingBack={...waiting,superseded:true};
  return publicRoute(current);
 }
 function onPop(event){
  if(destroyed)return;
  const previous=current||fresh({page:'checkout'}),expected=context(),incoming=read(event.state,expected),waiting=pendingBack;
  pendingBack=null;
  if(previous.context!==expected||!incoming){
   const safe={...previous,context:expected,index:incoming?.index??0,layer:'page',modal:null};
   write(safe);return;
  }
  if(waiting?.superseded){
   // A close requested Back, then another action navigated before popstate.
   // Keep that newer action instead of letting the queued Back overwrite it.
   const push=previous.layer!=='page'||incoming.layer!=='page'||!sameRoute(previous,incoming);
   write({...previous,index:incoming.index+(push?1:0),context:expected},push);return;
  }
  current=incoming;
  try{
   if(restore(publicRoute(incoming))===false)write({...previous,index:incoming.index,context:expected});
  }catch{write({...previous,index:incoming.index,context:expected});}
 }
 if(enabled)events.addEventListener('popstate',onPop);
 function destroy(){destroyed=true;pendingBack=null;if(enabled)events.removeEventListener?.('popstate',onPop);}
 return {syncPage,openModal,dismissModal,backOrDismiss,reset,destroy};
}
