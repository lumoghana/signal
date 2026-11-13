const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const drawings={pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>',shop:'<path d="M3 10h18M4 10v11h16V10M2 10l3-7h14l3 7M9 21v-7h6v7"/>',search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',qr:'<path d="M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h3v3h-3zm6 0v6h-6m3-9v3m-6 3h3"/>',wallet:'<path d="M3 7h18v14H3zM3 7V3h15v4m-3 5h6v5h-6z"/>',refresh:'<path d="M20 7a9 9 0 1 0 1 9M20 2v6h-6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',shield:'<path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6z"/>'};
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawings[name]||drawings.shop}</svg>`;
const button=(label,action,style='secondary',extra='')=>`<button type="button" class="btn ${style}" data-action="directory-${action}" ${extra}>${label}</button>`;
export const campusAreas={ 'Night Market':[5.6509,-.1878],Pentagon:[5.6535,-.1845],'Akuafo Hall':[5.649,-.1936],'Balme Library':[5.6515,-.1863] };
export function distanceMetres(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||[...a,...b].some(x=>!Number.isFinite(Number(x))))return Infinity;
 const rad=Math.PI/180,lat=(Number(b[0])-Number(a[0]))*rad,lng=(Number(b[1])-Number(a[1]))*rad;
 const h=Math.sin(lat/2)**2+Math.cos(Number(a[0])*rad)*Math.cos(Number(b[0])*rad)*Math.sin(lng/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(Math.max(0,h)),Math.sqrt(Math.max(0,1-h)));
}
export function filterDirectory(shops=[],{query='',category='all',openOnly=true,position=campusAreas['Night Market']}={}){
 const term=String(query).trim().toLowerCase();
 return shops.filter(shop=>shop.published!==false).filter(shop=>!openOnly||(shop.accepting&&shop.open!==false)).filter(shop=>category==='all'||shop.category===category).filter(shop=>!term||[shop.businessName,shop.name,shop.area,shop.category,shop.code,shop.accountNumber,shop.landmark].some(value=>String(value||'').toLowerCase().includes(term))).map(shop=>({...shop,distance:distanceMetres(position,[Number(shop.lat),Number(shop.lng)])})).sort((a,b)=>a.distance-b.distance||String(a.businessName).localeCompare(String(b.businessName))||String(a.name).localeCompare(String(b.name)));
}
export function lookupDirectory(shops,value,type='code'){
 const entered=String(value||'').trim().replace(/\s+/g,'').toUpperCase();
 return shops.filter(shop=>shop.published!==false).filter(shop=>String(type==='account'?shop.accountNumber:shop.code).replace(/\s+/g,'').toUpperCase()===entered);
}
export function createDirectory(config={}){
 let shops=[],loading=false,loaded=false,error='',notice='',query='',category='all',area='Night Market',position=null,openOnly=true,locating=false,lookup=null,lookupValue='',lookupMatches=[],lookupMethod='code',detail=null,locationGeneration=0,inflight=null,lookupGeneration=0;
 const redraw=()=>config.onRender?.();
 const money=config.formatMoney||((value=0)=>'GH₵'+(Number(value)/100).toFixed(2));
 const call=async()=>{if(typeof config.api!=='function')throw Error('The campus merchant directory is unavailable.');return config.api('/api/directory',{method:'GET'})};
 function refresh(){
  if(inflight)return inflight;
  loading=true;error='';redraw();
  inflight=(async()=>{try{
   const result=await call();shops=Array.isArray(result)?result:Array.isArray(result?.shops)?result.shops:[];loaded=true;
   if(category!=='all'&&!shops.some(shop=>shop.published!==false&&shop.category===category))category='all';
   if(detail)detail=shops.find(shop=>shop.id===detail.id&&shop.businessId===detail.businessId)||null;
   return true;
  }catch(e){error=e.message||'We could not load campus merchants.';return false}finally{loading=false;inflight=null;redraw()}})();
  return inflight;
 }
 const positionLabel=()=>position?'Near your location':'Near '+area;
 const currentPosition=()=>position||campusAreas[area]||campusAreas['Night Market'];
 const key=shop=>`${shop.businessId}:${shop.id}`;
 const find=value=>shops.find(shop=>key(shop)===value);
 function card(shop,index=0){
  const accepting=shop.published!==false&&shop.accepting&&shop.open!==false,dist=Number.isFinite(shop.distance)?shop.distance<1000?Math.round(shop.distance/10)*10+' m':(shop.distance/1000).toFixed(1)+' km':'Distance unavailable';
  return `<article class="directory-card"><button class="directory-card-main" data-action="directory-detail" data-id="${E(key(shop))}"><div class="directory-card-art tone-${index%4}"><span>${icon('shop')}</span><small>${E(shop.area||'Legon campus')}</small><span class="badge ${accepting?'success':'neutral'}">${accepting?'Accepting Lumo':'Currently closed'}</span></div><div class="directory-card-body"><div class="directory-card-top"><span>${E(shop.category||'Campus merchant')}</span><strong>${dist}</strong></div><h3>${E(shop.businessName||shop.name)}</h3><p>${E(shop.name)}${shop.landmark?' · '+E(shop.landmark):''}</p><div class="directory-card-foot"><span>${icon('clock')}${E(shop.hours||'Hours not set')}</span>${icon('arrow')}</div></div></button></article>`;
 }
 function detailPanel(shop){
  const accepting=shop.published!==false&&shop.accepting&&shop.open!==false,hasPin=Number.isFinite(Number(shop.lat))&&Number.isFinite(Number(shop.lng)),map=hasPin?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(Number(shop.lat)+','+Number(shop.lng)):'';
  return `<section class="panel directory-detail"><div class="panel-heading"><div><div class="eyebrow">MERCHANT DETAILS</div><h2 class="panel-title">${E(shop.businessName||shop.name)}</h2></div>${button('Back to merchants','back','ghost small')}</div><div class="directory-detail-main"><span class="directory-detail-icon">${icon('shop')}</span><div><h3>${E(shop.name)}</h3><p>${E(shop.area)}${shop.landmark?' · '+E(shop.landmark):''}</p><span class="badge ${accepting?'success':'neutral'}">${accepting?'Accepting Lumo':'Currently closed'}</span></div></div><div class="directory-detail-facts"><div><span>Shop code</span><strong>${E(shop.code)}</strong></div><div><span>Merchant account</span><strong>${E(shop.accountNumber)}</strong></div><div><span>Merchant’s stated hours</span><strong>${E(shop.hours||'Ask the merchant')}</strong></div><div><span>Payment fee</span><strong>GH₵0.00 · sandbox</strong></div></div><div class="directory-detail-actions">${button('Pay this shop '+icon('arrow'),'pay','primary',`data-id="${E(key(shop))}" ${accepting?'':'disabled'}`)}${map?`<a class="btn secondary" href="${map}" target="_blank" rel="noopener noreferrer">${icon('pin')} Open map</a>`:''}</div><p class="notice">The merchant controls its accepting status. Stated hours are information, not an automatic opening schedule. Check the business and shop before paying. Sandbox funds only.</p></section>`;
 }
 function lookupPanel(){
  if(!lookup)return '';
  const account=lookup==='account';
  return `<section class="panel directory-lookup"><div class="panel-heading"><div><h2 class="panel-title">${account?'Pay a merchant account':'Find a shop code'}</h2><p class="muted text-small">${account?'One merchant account can serve several shops. Choose the receiving location.':'Enter the code printed at the counter.'}</p></div>${button('Close','close-lookup','ghost small')}</div><form data-form="directory" class="directory-lookup-form"><input type="hidden" name="type" value="${lookup}"><label class="field"><span class="label">${account?'Merchant account number':'Shop code'}</span><input class="input" name="value" value="${E(lookupValue)}" required inputmode="${account?'numeric':'text'}" maxlength="40" autocomplete="off" placeholder="${account?'Enter account number':'e.g. LUM100001'}" autofocus></label><button type="submit" class="btn primary">Find ${account?'shops':'shop'} ${icon('arrow')}</button></form>${lookupMatches.length?`<div class="directory-matches"><p>${lookupMatches.length>1?'Choose the shop receiving this payment.':'Check the receiving shop.'}</p>${lookupMatches.map(shop=>`<button type="button" class="directory-match" data-action="directory-${shop.accepting&&shop.open!==false?'pay':'detail'}" data-id="${E(key(shop))}"><span>${icon('shop')}</span><span><strong>${E(shop.businessName)} · ${E(shop.name)}</strong><small>${E(shop.area)}${shop.landmark?' · '+E(shop.landmark):''}${!shop.accepting||shop.open===false?' · Currently not accepting payments':''}</small></span>${icon('arrow')}</button>`).join('')}</div>`:''}</section>`;
 }
 function render(){
  const filtered=filterDirectory(shops,{query,category,openOnly,position:currentPosition()}),categories=[...new Set(shops.map(shop=>shop.category).filter(Boolean))].sort(),student=config.getStudent?.(),wallet=student?.wallet||student;
  return `<div class="directory-workspace"><div class="directory-heading"><div><div class="eyebrow">LUMO CAMPUS PAY</div><h1 class="page-title">Good things, nearby<span class="directory-period">.</span></h1><p class="subtitle">Find a merchant. Check the counter. Pay with clarity.</p></div><span class="directory-campus">${icon('pin')}University of Ghana</span></div><div class="directory-sandbox-bar"><span>${icon('shield')}Sandbox student account${Number.isSafeInteger(wallet?.balance)?' · '+money(wallet.balance):''}</span>${button(student?'View sandbox wallet':'Open sandbox wallet','wallet','ghost small')}</div><div class="directory-actions">${config.onScan?button(icon('qr')+' Scan QR','scan','primary'):''}${button('Enter shop code','lookup-code','secondary')}${button('Pay account number','lookup-account','secondary')}${button(icon('refresh'),'refresh','ghost','aria-label="Refresh merchants"')}</div>${error?`<div class="directory-message error" role="alert">${E(error)} ${button('Try again','refresh','ghost small')}</div>`:''}${notice?`<div class="directory-message" role="status">${E(notice)}</div>`:''}${lookupPanel()}${detail?detailPanel(detail):`<div class="directory-location"><span class="directory-location-icon">${icon('pin')}</span><div><strong>${E(positionLabel())}</strong><small>${position?'Sorted by approximate distance. Your location stays on this device.':'Approximate campus area. Use your location for a closer match.'}</small></div><label class="sr-only" for="directory-area">Choose campus area</label><select class="select" name="directoryArea" id="directory-area">${Object.keys(campusAreas).map(name=>`<option value="${E(name)}" ${name===area?'selected':''}>${E(name)}</option>`).join('')}</select>${button(locating?'Finding location…':'Use my location','locate','ghost small',locating?'disabled':'')}</div><div class="directory-filters"><label class="directory-search">${icon('search')}<input class="input" id="directory-search" name="directorySearch" type="search" value="${E(query)}" placeholder="Search merchants, food, landmarks or codes" aria-label="Search campus merchants"></label><select class="select" name="directoryCategory" aria-label="Merchant category"><option value="all" ${category==='all'?'selected':''}>All categories</option>${categories.map(value=>`<option value="${E(value)}" ${category===value?'selected':''}>${E(value)}</option>`).join('')}</select><label class="directory-open"><input type="checkbox" name="directoryOpen" ${openOnly?'checked':''}>Accepting now</label></div><div class="directory-results-heading"><strong>${loading&&!loaded?'Loading campus merchants…':filtered.length+' '+(filtered.length===1?'shop':'shops')+' found'}</strong><small>${position?'Nearest first':'Nearest to '+E(area)}</small></div>${filtered.length?`<div class="directory-cards">${filtered.map(card).join('')}</div>`:`<div class="panel directory-empty">${icon('shop')}<h2>${loading?'Finding your next stop…':loaded&&shops.length?'No matching merchants nearby.':loaded?'Your campus network is growing.':'Load the campus directory.'}</h2><p>${loading?'Loading the shared merchant directory.':loaded&&shops.length?'Try another search or include shops that are currently closed.':loaded?'Active shops will appear here after merchants complete their setup.':'Choose Refresh merchants to see shops accepting Lumo.'}</p>${!loading?button('Refresh merchants','refresh','secondary'):''}</div>`}`}
  <div class="directory-footer-note">${icon('shield')}<span>Merchant details come from the shared sandbox directory. Location is optional and used only on this device. No real student account or bank is connected.</span></div></div>`;
 }
 async function handleClick(action,element){
  const a=String(action).replace(/^directory-/,'');
  if(a==='refresh'){await refresh();return}
  if(a==='wallet'){config.onStudent?.();return}
  if(a==='scan'){config.onScan?.();return}
  if(a==='login'){config.onLogin?.();return}
  if(a==='lookup-code'||a==='lookup-account'){lookupGeneration++;lookup=a==='lookup-code'?'code':'account';lookupMethod=lookup;lookupValue='';lookupMatches=[];notice='';redraw();return}
  if(a==='close-lookup'){lookupGeneration++;lookup=null;lookupValue='';lookupMatches=[];redraw();return}
  if(a==='detail'){detail=find(element?.dataset?.id)||null;notice='';redraw();return}
  if(a==='back'){detail=null;redraw();return}
  if(a==='pay'){const shop=find(element?.dataset?.id);if(!shop){notice='This shop is no longer in the directory. Refresh and try again.';redraw();return}if(shop.published===false||!shop.accepting||shop.open===false){notice='This shop is not accepting payments right now.';redraw();return}config.onPay?.(shop,{method:lookup?lookupMethod:'qr'});return}
  if(a==='locate'){
   if(!globalThis.navigator?.geolocation){notice='Location is unavailable. Choose a campus area instead.';redraw();return}
   const generation=++locationGeneration;locating=true;notice='';redraw();
   const failure=()=>{if(generation!==locationGeneration)return;locating=false;notice='We could not use your location. You can still choose a campus area.';redraw()};
   try{navigator.geolocation.getCurrentPosition(result=>{if(generation!==locationGeneration)return;const lat=Number(result.coords?.latitude),lng=Number(result.coords?.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){failure();return}position=[lat,lng];locating=false;notice='Merchants are sorted by approximate distance from you.';redraw()},failure,{enableHighAccuracy:false,timeout:12000,maximumAge:60000})}catch{failure()}
  }

 }
 function handleChange(element){
  const name=element?.name;if(name==='directorySearch'){query=element.value;redraw()}
  else if(name==='directoryCategory'){category=element.value;redraw()}
  else if(name==='directoryArea'){locationGeneration++;area=element.value;position=null;locating=false;notice='';redraw()}
  else if(name==='directoryOpen'){openOnly=Boolean(element.checked);redraw()}
  else if(name==='value')lookupValue=element.value;
 }
 async function handleSubmit(form){
  const p=Object.fromEntries(new FormData(form)),current=++lookupGeneration;
  lookupValue=String(p.value||'').trim();lookup=p.type==='account'?'account':'code';lookupMethod=lookup;lookupMatches=[];notice='';
  if(!loaded||inflight){const ok=await refresh();if(current!==lookupGeneration)return;if(!ok){notice='';redraw();return}}
  if(current!==lookupGeneration)return;
  lookupMatches=lookupDirectory(shops,lookupValue,lookup);notice=lookupMatches.length?'':'No merchant matches that '+(lookup==='account'?'account number':'shop code')+'. Check it with the counter.';redraw();
 }

 return {render,refresh,handleClick,handleChange,handleSubmit,getShops:()=>shops.map(shop=>({...shop})),findShop:(id,businessId)=>shops.find(shop=>shop.id===id&&(!businessId||shop.businessId===businessId))||null};
}
