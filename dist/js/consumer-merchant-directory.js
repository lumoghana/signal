import {esc,icon} from './ui.js';

export const CAMPUS_AREAS=Object.freeze({'Night Market':[5.6509,-.1878],Pentagon:[5.6535,-.1845],'Akuafo Hall':[5.649,-.1936],'Balme Library':[5.6515,-.1863]});
export const normalizeMerchantQuery=(value,limit=80)=>String(value||'').slice(0,limit).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ɔ/g,'o').replace(/ɛ/g,'e').replace(/[^a-z0-9]+/g,' ').trim();
export function merchantDistance(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==2||b.length!==2||[...a,...b].some(value=>!Number.isFinite(value)))return Infinity;
 const rad=Math.PI/180,lat=(b[0]-a[0])*rad,lng=(b[1]-a[1])*rad,h=Math.sin(lat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(lng/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(Math.max(0,h)),Math.sqrt(Math.max(0,1-h)));
}
export function connectedMerchantMatches(shop,query){
 const haystack=normalizeMerchantQuery([shop.businessName,shop.name,shop.category,shop.area,shop.landmark,shop.code].filter(Boolean).join(' '),1000);
 return normalizeMerchantQuery(query).split(' ').filter(Boolean).every(word=>haystack.includes(word));
}
export function connectedMerchants(shops,{query='',position=CAMPUS_AREAS['Night Market'],openOnly=false,category='all',favorites=null}={}){
 return (Array.isArray(shops)?shops:[]).filter(shop=>shop?.published===true&&typeof shop.id==='string').filter(shop=>!openOnly||shop.accepting===true&&shop.open!==false).filter(shop=>category==='all'||shop.category===category).filter(shop=>!favorites||favorites.has(shop.id)).filter(shop=>connectedMerchantMatches(shop,query)).map(shop=>({...shop,distance:merchantDistance(position,[typeof shop.lat==='number'?shop.lat:NaN,typeof shop.lng==='number'?shop.lng:NaN])})).sort((a,b)=>a.distance-b.distance||String(a.businessName||a.name).localeCompare(String(b.businessName||b.name))||String(a.name).localeCompare(String(b.name)));
}
const controllers=new WeakMap();
function controller(ctx){
 const key=ctx.shared||ctx,identity=ctx.shared?.authVersion??0;
 let current=controllers.get(key);
 if(current?.identity!==identity){current={identity,shops:[],status:'idle',error:'',notice:'',query:'',category:'all',area:'Night Market',position:null,openOnly:false,favoritesOnly:false,detail:null,locating:false,locationGeneration:0,pending:null,listeners:new Set(),busy:false};controllers.set(key,current);}
 return current;
}
const accepting=shop=>shop?.accepting===true&&shop.open!==false;
const favorites=ctx=>new Set((ctx.state.merchantFavorites||[]).map(item=>item.shopId));
const distanceLabel=distance=>Number.isFinite(distance)?distance<1000?`${Math.round(distance/10)*10} m away`:`${(distance/1000).toFixed(1)} km away`:'';
const button=(label,action,extra='',style='ghost')=>`<button type="button" class="button ${style}" data-md-action="${action}" ${extra}>${label}</button>`;
function card(ctx,shop){
 const saved=favorites(ctx).has(shop.id),availability=accepting(shop)?'Accepting payments':'Payments paused';
 return `<article class="connected-merchant-card"><button type="button" class="payments-hub-row" data-md-action="detail" data-shop-id="${esc(shop.id)}"><span class="payments-hub-icon">${icon('pin',22)}</span><span class="payments-hub-row-copy"><strong>${esc(shop.businessName||shop.name)}</strong><small>${esc(shop.name)}${shop.area?' · '+esc(shop.area):''}</small><small>${esc(shop.category||'Campus merchant')}${distanceLabel(shop.distance)?' · '+distanceLabel(shop.distance):''}</small><small class="merchant-acceptance ${accepting(shop)?'is-accepting':''}">${esc(availability)}</small></span>${icon('chevron',17)}</button><button type="button" class="merchant-save" data-md-action="favorite" data-shop-id="${esc(shop.id)}" aria-label="${saved?'Remove':'Save'} ${esc(shop.businessName||shop.name)} ${saved?'from':'to'} favourite shops" aria-pressed="${saved}" ${controller(ctx).busy?'disabled':''}>${icon('heart',19)}</button></article>`;
}
function detail(ctx,shop){
 const v=controller(ctx),saved=favorites(ctx).has(shop.id);
 return `<section class="connected-merchant-detail">${button('Back to shops','back')}<div class="merchant-detail-mark">${icon('pin',30)}</div><p class="eyebrow">${esc(shop.category||'Campus merchant')}</p><h2>${esc(shop.businessName||shop.name)}</h2><p class="muted">${esc(shop.name)} · ${esc(shop.area||'Campus')}</p><dl class="merchant-detail-facts"><div><dt>Find us</dt><dd>${esc(shop.landmark||shop.area||'Ask the shop for directions')}</dd></div><div><dt>Stated hours</dt><dd>${esc(shop.hours||'Ask the shop for opening hours')}</dd></div><div><dt>Shop code</dt><dd>${esc(shop.code||'Not available')}</dd></div><div><dt>Payments</dt><dd>${accepting(shop)?'Accepting Lumo':'Currently paused'}</dd></div></dl><p class="muted small">Hours are supplied by the merchant. Payment availability is checked again before you pay.</p>${button(v.busy?'Checking shop…':'Pay this shop','pay',`data-shop-id="${esc(shop.id)}" ${v.busy||!accepting(shop)?'disabled':''}`,'primary')}${button(saved?'Remove from favourite shops':'Save this shop','favorite',`data-shop-id="${esc(shop.id)}" ${v.busy?'disabled':''}`,'secondary')}</section>`;
}
function contents(ctx){
 const v=controller(ctx),saved=favorites(ctx),position=v.position||CAMPUS_AREAS[v.area],shops=connectedMerchants(v.shops,{query:v.query,position,openOnly:v.openOnly,category:v.category,favorites:v.favoritesOnly?saved:null}),categories=[...new Set(v.shops.filter(shop=>shop.published===true).map(shop=>shop.category).filter(Boolean))].sort();
 const selected=v.shops.find(shop=>shop.id===v.detail&&shop.published===true);
 const error=v.error?`<div class="notice merchant-directory-error" role="alert"><span>${esc(v.error)}</span>${button('Try again','refresh')}</div>`:'';
 const notice=v.notice?`<p class="muted small" role="status">${esc(v.notice)}</p>`:'';
 if(selected)return `<div data-merchant-feedback>${error}${notice}</div>${detail(ctx,selected)}`;
 const unavailable=v.favoritesOnly?[...saved].filter(id=>!v.shops.some(shop=>shop.id===id&&shop.published===true)):[];
 return `<div data-merchant-feedback>${error}${notice}</div><div class="connected-directory-location"><label><span class="muted small">${v.position?'Near your location':'Choose campus area'}</span><select class="input" name="merchantArea" aria-label="Choose campus area">${Object.keys(CAMPUS_AREAS).map(area=>`<option value="${esc(area)}" ${area===v.area?'selected':''}>${esc(area)}</option>`).join('')}</select></label>${button(v.locating?'Finding location…':'Use my location','locate',v.locating?'disabled':'')}</div><label class="campus-merchant-search" for="campus-merchant-search">${icon('search',19)}<input id="campus-merchant-search" name="connectedMerchantSearch" type="search" placeholder="Find a merchant, food, landmark or code" aria-label="Search campus merchants" maxlength="80" autocomplete="off" value="${esc(v.query)}"></label><div class="connected-directory-filters"><label class="sr-only" for="connected-merchant-category">Merchant category</label><select class="input" id="connected-merchant-category" name="merchantCategory"><option value="all">All categories</option>${categories.map(category=>`<option ${v.category===category?'selected':''} value="${esc(category)}">${esc(category)}</option>`).join('')}</select><button type="button" class="merchant-filter ${v.openOnly?'selected':''}" data-md-action="accepting" aria-pressed="${v.openOnly}">Accepting now</button><button type="button" class="merchant-filter ${v.favoritesOnly?'selected':''}" data-md-action="favorites" aria-pressed="${v.favoritesOnly}">${icon('heart',15)} Saved</button></div><div class="payments-hub-section-title"><h2>${v.favoritesOnly?'Your saved shops':'Your campus shops'}</h2>${button(v.status==='loading'?'Refreshing…':'Refresh','refresh',v.status==='loading'?'disabled':'')}</div><div data-merchant-results-region><p class="muted small merchant-directory-count" role="status">${v.status==='idle'||v.status==='loading'&&!v.shops.length?'Loading registered shops…':`${shops.length} ${shops.length===1?'shop':'shops'} · shared test directory${v.position?' · nearest first':` · near ${esc(v.area)}`}`}</p><div class="connected-merchant-results">${shops.map(shop=>card(ctx,shop)).join('')}${unavailable.map(id=>`<article class="merchant-unavailable"><div><strong>Saved shop unavailable</strong><p class="muted small">It may be unpublished. Refresh later or contact the merchant.</p></div>${button('Remove','remove',`data-shop-id="${esc(id)}" ${v.busy?'disabled':''}`)}</article>`).join('')}</div>${!shops.length&&!unavailable.length?`<div class="campus-search-empty"><strong>${v.status==='loading'?'Finding your campus shops…':v.error?'Shops could not be loaded.':v.favoritesOnly?'Your favourite shops belong here.':v.shops.length?'No matching shops.':'Your campus network is growing.'}</strong><p>${v.favoritesOnly?'Save a shop to make returning easier.':v.shops.length?'Try another name, category or campus area.':v.error?'Reconnect and refresh. No sample merchants are substituted.':'Published Lumo shops will appear here.'}</p></div>`:''}</div><p class="muted small merchant-directory-note">Location is optional and stays on this device. These are registered, published shops using connected test money.</p>`;
}
export function renderConnectedCampus(ctx){return `<div class="connected-campus-directory" data-connected-directory>${contents(ctx)}</div>`;}
export function bindConnectedCampus(ctx,root){
 const container=root?.querySelector?.('[data-connected-directory]');if(!container)return()=>{};
 const v=controller(ctx);let alive=true;const identity=v.identity,current=()=>alive&&container.isConnected!==false&&controller(ctx)===v&&ctx.shared?.authVersion===identity;
 const notify=()=>{for(const fn of [...v.listeners])fn();};
 const redraw=()=>{
  if(!current())return;
  // Keep updates inside the directory. A loading result is not page navigation.
  const focused=globalThis.document?.activeElement,field=focused&&container.contains?.(focused)?{id:focused.id,name:focused.name,start:focused.selectionStart,end:focused.selectionEnd}:null;
  const html=contents(ctx);
  if(container.querySelector?.('[data-merchant-results-region]')&&!v.detail&&globalThis.document?.createElement){
   const template=document.createElement('template');template.innerHTML=html;
   // Keep the mounted search input and keyboard. Only the results and changed
   // display regions are patched when loading/location/preferences settle.
   for(const selector of ['[data-merchant-feedback]','.connected-directory-location','.connected-directory-filters','.payments-hub-section-title','[data-merchant-results-region]']){
    const before=container.querySelector(selector),after=template.content.querySelector(selector);
    if(before&&after&&before.innerHTML!==after.innerHTML)before.innerHTML=after.innerHTML;
   }
  }else if(container.innerHTML!==html)container.innerHTML=html;
  if(field&&container.querySelectorAll){const restored=[...container.querySelectorAll('input,select,textarea')].find(node=>field.id?node.id===field.id:node.name===field.name);if(restored){restored.focus?.({preventScroll:true});if(Number.isInteger(field.start)&&restored.setSelectionRange)try{restored.setSelectionRange(field.start,field.end);}catch{}}}
 };v.listeners.add(redraw);
 async function refresh(){
  if(v.pending)return v.pending;
  v.status='loading';v.error='';notify();
  v.pending=(async()=>{try{const result=await ctx.shared.merchantDirectory();if(controller(ctx)!==v)return;if(!result?.ok)throw Error(result?.message||result?.error||'The merchant directory is unavailable.');v.shops=(Array.isArray(result.shops)?result.shops:[]).filter(shop=>shop?.published===true);v.status='loaded';if(v.category!=='all'&&!v.shops.some(shop=>shop.category===v.category))v.category='all';if(v.detail&&!v.shops.some(shop=>shop.id===v.detail)){v.detail=null;v.notice='This shop is no longer published. Choose another shop.';}}catch(error){if(controller(ctx)===v){v.status='error';v.error=error.message||'Reconnect and refresh the merchant directory.';}}finally{v.pending=null;if(controller(ctx)===v)notify();}})();return v.pending;
 }
 async function save(id,remove=false){
  if(v.busy)return;v.busy=true;v.notice='';notify();
  try{const result=await (ctx.actAsync||ctx.act).call(ctx,remove||favorites(ctx).has(id)?'removeMerchantFavorite':'saveMerchantFavorite',{shopId:id});if(controller(ctx)!==v)return;v.notice=result?.message||(result?.ok?'Your saved shops are up to date.':'This shop could not be saved.');}catch(error){if(controller(ctx)===v)v.notice=error.message;}finally{if(controller(ctx)===v){v.busy=false;notify();}}
 }
 const click=async event=>{
  const element=event.target.closest?.('[data-md-action]');if(!element||!current()||element.disabled)return;const action=element.dataset.mdAction,id=element.dataset.shopId;
  if(action==='refresh')return refresh();
  if(action==='detail'){v.detail=id;v.notice='';notify();return;}
  if(action==='back'){v.detail=null;notify();return;}
  if(action==='accepting'){v.openOnly=!v.openOnly;notify();return;}
  if(action==='favorites'){v.favoritesOnly=!v.favoritesOnly;notify();return;}
  if(action==='favorite'||action==='remove')return save(id,action==='remove');
  if(action==='pay'){const shop=v.shops.find(shop=>shop.id===id&&shop.published===true);if(!accepting(shop)){v.notice='This shop is not accepting payments. Refresh before trying again.';notify();return;}return ctx.openQrMerchant?.(id,{isCurrent:()=>current()});}
  if(action==='locate'){
   if(!globalThis.navigator?.geolocation){v.notice='Location is unavailable. Choose a campus area instead.';notify();return;}
   const generation=++v.locationGeneration;v.locating=true;v.notice='';notify();
   const failure=()=>{if(controller(ctx)!==v||generation!==v.locationGeneration)return;v.locating=false;v.position=null;v.notice='Location was not available. Choose your campus area to keep browsing.';notify();};
   try{navigator.geolocation.getCurrentPosition(result=>{if(controller(ctx)!==v||generation!==v.locationGeneration)return;const lat=result.coords?.latitude,lng=result.coords?.longitude;if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return failure();v.locating=false;v.position=[lat,lng];v.notice='Shops are sorted by approximate distance. Your location stays on this device.';notify();},failure,{enableHighAccuracy:false,timeout:12000,maximumAge:60000});}catch{failure();}
  }
 };
 const input=event=>{if(!current())return;const element=event.target;if(element.name==='connectedMerchantSearch'){v.query=element.value.slice(0,80);const region=container.querySelector?.('[data-merchant-results-region]');if(region){const template=document.createElement('template');template.innerHTML=contents(ctx);region.innerHTML=template.content.querySelector('[data-merchant-results-region]').innerHTML;}else notify();}};
 const change=event=>{if(!current())return;const element=event.target;if(element.name==='merchantArea'&&Object.hasOwn(CAMPUS_AREAS,element.value)){v.locationGeneration++;v.locating=false;v.area=element.value;v.position=null;v.notice='';notify();}if(element.name==='merchantCategory'){v.category=element.value;notify();}};
 container.addEventListener('click',click);container.addEventListener('input',input);container.addEventListener('change',change);
 if(v.status==='idle')queueMicrotask(()=>{if(current())void refresh();});
 return()=>{alive=false;v.listeners.delete(redraw);container.removeEventListener('click',click);container.removeEventListener('input',input);container.removeEventListener('change',change);};
}
