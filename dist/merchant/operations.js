import {reconcileRows} from './reconciliation.js';
import {isShopCloseDue} from './domain.js';
export {reconcileRows} from './reconciliation.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const symbols={
 check:'<path d="m5 12 4 4L19 6"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 shop:'<path d="M3 10h18M4 10v11h16V10M2 10l3-7h14l3 7M9 21v-7h6v7"/>',
 pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0"/><circle cx="12" cy="10" r="3"/>',
 phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
 qr:'<path d="M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0v3h3v3h3v-6h-3M3 12h3m6-9v3m0 6h3m-3 6v3"/>',
 people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 shield:'<path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6z"/><path d="m8 12 3 3 5-6"/>',
 alert:'<path d="m12 3 10 18H2zM12 9v5m0 3h.01"/>',
 file:'<path d="M14 2H4v20h16V8zM14 2v6h6M8 13h8m-8 4h8"/>',
 wallet:'<rect x="2" y="5" width="20" height="16" rx="3"/><path d="M5 5V2h14v3m-2 7h5v5h-5z"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 4h.01"/>'
};
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name]||symbols.shield}</svg>`;
const button=(label,action,style='secondary',data='')=>`<button type="button" class="btn ${style}" data-action="ops-${action}" ${data}>${label}</button>`;
const badge=(label,style='neutral')=>`<span class="badge ${style}">${escape(label)}</span>`;
const when=value=>value?new Date(value).toLocaleString('en-GB',{timeZone:'Africa/Accra',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Not recorded';
const cash=value=>`GH₵${(Number(value||0)/100).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const array=value=>Array.isArray(value)?value:[];
const assigned=(person,shopId)=>(person.shopIds||[person.shopId]).includes(shopId);

export function shopPhoneReadiness(shopId,devices=[],summaries=[],now=Date.now()){
 const summary=array(summaries).find(entry=>entry.shopId===shopId);
 if(summary){
  const fresh=(!summary.readyUntil||Date.parse(summary.readyUntil)>now)&&(!summary.checkedAt||now-Date.parse(summary.checkedAt)<90000);
  const ready=fresh&&(summary.phoneReady===true||summary.ready===true);
  return {paired:Number(summary.phoneCount??summary.pairedCount??0)>0,ready,reason:ready?'Ready':Number(summary.offlineCount||0)>0?'A receiving phone is offline.':'Pair, enable and test a connected receiving phone.'};
 }
 const paired=array(devices).filter(device=>device.shopId===shopId&&device.active!==false&&!device.revokedAt);
 const enabled=paired.filter(device=>device.enabled!==false);
 const online=enabled.filter(device=>device.soundReady!==false&&Number.isFinite(Date.parse(device.lastSeen))&&now-Date.parse(device.lastSeen)<90000&&Date.parse(device.lastSeen)<=now+30000);
 const tested=online.some(device=>Number.isFinite(Date.parse(device.lastTestAt||device.testedAt))&&(!device.pairedAt||Date.parse(device.lastTestAt||device.testedAt)>=Date.parse(device.pairedAt)));
 return {paired:paired.length>0,ready:tested,reason:!paired.length?'Pair a receiving phone.':!enabled.length?'The receiving phone is muted.':!online.length?'The receiving phone is offline.':'Play the voice test on the connected receiving phone.'};
}
export function activationReadiness(snapshot,shop,devices=[],options={}){
 if(!shop)return [];
 const team=shop.activation?.ownerOperated===true||array(snapshot.staff).some(person=>person.active!==false&&assigned(person,shop.id));
 const phone=shopPhoneReadiness(shop.id,devices,options.deviceReadiness||snapshot.shopReadiness||snapshot.deviceReadiness,options.now??Date.now());
 return [
  {key:'location',title:'Confirm the shop location',description:'Check the pin and a landmark students will recognise.',done:shop.activation?.locationConfirmed===true&&Number.isFinite(shop.lat)&&Number.isFinite(shop.lng),icon:'pin'},
  {key:'qr',title:'Put the shop QR on display',description:'Use this shop’s QR and code at the right counter.',done:shop.activation?.qrReady===true,icon:'qr'},
  {key:'people',title:'Give the team their own access',description:shop.activation?.ownerOperated?'The owner runs this counter.':'Assign a team member, or confirm that the owner runs this counter.',done:team,icon:'people'},
  {key:'phone',title:'Pair and test the receiving phone',description:phone.ready?'A connected receiving phone is enabled and has been tested.':phone.reason,done:phone.ready,icon:'phone'},
  {key:'publish',title:'Make the shop visible on Campus Pay',description:shop.published?'Students can find this shop in the campus directory.':'Publish when the location, QR, team and receiving phone are ready. A first payment is not required to publish.',done:shop.published===true,icon:'shop'},
  {key:'payment',title:'Receive the first confirmed payment',description:'This step completes itself when a confirmed receipt arrives.',done:array(snapshot.transactions).some(tx=>tx.shopId===shop.id&&tx.status==='paid'),icon:'wallet'}
 ];
}

function parseCSV(text){
 const rows=[];let row=[],cell='',quoted=false;
 const source=String(text||'').replace(/^\uFEFF/,'');
 for(let i=0;i<source.length;i++){
  const ch=source[i];
  if(ch==='"'){if(quoted&&source[i+1]==='"'){cell+='"';i++}else if(quoted||cell==='')quoted=!quoted;else throw new Error('Quote fields containing commas.');}
  else if(ch===','&&!quoted){row.push(cell);cell=''}
  else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&source[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell=''}
  else cell+=ch;
 }
 if(quoted)throw new Error('A quoted CSV field is not closed.');
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 return rows;
}
export function parseReconciliationRows(text){
 const rows=parseCSV(text);
 if(rows.length<2)throw new Error('Add a header and at least one statement row.');
 const header=rows[0].map(v=>v.trim().toLowerCase());
 const referenceAt=header.findIndex(v=>['reference','payment reference','transaction reference'].includes(v));
 const amountAt=header.findIndex(v=>['amount','amount ghs','amount_ghs'].includes(v));
 const statusAt=header.findIndex(v=>v==='status');
 if(referenceAt<0||amountAt<0)throw new Error('Use a reference,amount header. Amounts must be in Ghana cedis.');
 if(rows.length>1001)throw new Error('Import up to 1,000 statement rows at a time.');
 return rows.slice(1).map((row,index)=>{
  const reference=String(row[referenceAt]||'').trim(),value=String(row[amountAt]||'').trim();
  if(!reference||reference.length>100)throw new Error(`Row ${index+2}: enter a payment reference.`);
  if(!/^\d+(?:\.\d{1,2})?$/.test(value))throw new Error(`Row ${index+2}: enter a positive amount with at most two decimal places.`);
  const [whole,fraction='']=value.split('.'),amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(amount)||amount<=0||amount>9999999999)throw new Error(`Row ${index+2}: amount is outside the supported range.`);
  const status=statusAt>=0?String(row[statusAt]||'').trim().toLowerCase():'paid';
  if(status&&!['paid','confirmed','completed','processing','pending','failed'].includes(status))throw new Error(`Row ${index+2}: use paid, processing or failed status.`);
  return {reference,amount,status:!status||['confirmed','completed'].includes(status)?'paid':status==='pending'?'processing':status};
 });
}
export function filterReconciliationResults(result,{query='',exceptionsOnly=false}={}){
 const q=String(query).trim().toLowerCase();
 return array(result?.results).filter(row=>!exceptionsOnly||row.result!=='matched').filter(row=>!q||[row.reference,row.result,row.amount,row.expectedAmount,row.expectedStatus].some(value=>String(value??'').toLowerCase().includes(q)));
}
export function reconciliationExportRows(result,filters={}){
 return [['Reference','Statement amount GHS','Statement status','Lumo amount GHS','Lumo status','Result'],...filterReconciliationResults(result,filters).map(row=>[row.reference,(row.amount/100).toFixed(2),row.status||row.statementStatus||'paid',row.expectedAmount==null?'':(row.expectedAmount/100).toFixed(2),row.expectedStatus||'',row.result])];
}
export function operationExceptions(snapshot,devices=[],now=Date.now(),options={}){
 const shops=array(snapshot.shops),items=[];
 for(const shop of shops){
  const closed=array(snapshot.closings).filter(c=>c.shopId===shop.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if(isShopCloseDue(snapshot,shop,now))items.push({type:'closing',shopId:shop.id,title:`${shop.name} needs a closing check`,detail:`The ${shop.cutoff||snapshot.business?.cutoff||'00:00'} Ghana-time cutoff has passed. ${closed?'Last closed '+when(closed.createdAt)+'.':'No closing report has been saved.'}`,action:'shop'});
  const phone=shopPhoneReadiness(shop.id,devices,options.deviceReadiness||snapshot.shopReadiness||snapshot.deviceReadiness,now);
  if(!phone.ready)items.push({type:'device',shopId:shop.id,title:`${phone.paired?'Check the phone at':'Pair a phone at'} ${shop.name}`,detail:phone.reason,action:'sound'});
 }
 for(const tx of array(snapshot.transactions).filter(tx=>tx.status==='processing'&&now-Date.parse(tx.createdAt)>15*60000))items.push({type:'payment',shopId:tx.shopId,title:`Payment ${tx.reference} is still processing`,detail:`${cash(tx.amount)} · Started ${when(tx.createdAt)}. Confirm against the source before releasing goods.`,action:'payment',id:tx.id});
 const unallocated=array(snapshot.transactions).filter(tx=>tx.status==='paid'&&!tx.shopId);
 if(unallocated.length)items.push({type:'unallocated',title:`${unallocated.length} receipts need a shop`,detail:'These receipts are in the merchant account but cannot be announced at a counter until correctly assigned.',action:'activity'});
 const outstanding=array(snapshot.refunds).filter(r=>r.status==='requested').length;
 if(outstanding)items.push({type:'refund',title:`${outstanding} refunds need a decision`,detail:'Review the original receipt and approval request.',action:'approvals'});
 const stalled=array(snapshot.settlements).filter(s=>s.status==='processing'&&now-Date.parse(s.createdAt)>24*3600000).length;
 if(stalled)items.push({type:'settlement',title:`${stalled} settlements need investigation`,detail:'Processing for more than 24 hours. Reconcile the destination before retrying.',action:'settlements'});
 return items;
}

export function createOperations(config={}){
 let selectedShop='',tab='attention',error='',notice='',busy=false,csvDraft='',reconSource='Sample statement',period='',preview=null,ticketId='',supportFilter='open',locationDraft=null,shopEdits={},savedRunId='',resultPage=1,resultQuery='',exceptionsOnly=false,contextBusiness='',locationGeneration=0,locating=false,renderedPage='',ticketDrafts={},shiftDrafts={},statementGeneration=0,operationGeneration=0;
 const state=()=>config.getState?.()||{};
 const session=()=>config.getSession?.()||null;
 const role=()=>session()?.role||config.getRole?.()||'';
 const owner=()=>role()==='owner';
 function currentOperator(){
  const current=session(),snapshot=state();
  if(owner())return {id:`owner-${current?.userId||snapshot.business?.id||'business'}`,name:snapshot.business?.ownerName||'Business owner'};
  const staffId=current?.staffId||config.getStaffId?.();
  return array(snapshot.staff).find(person=>person.active!==false&&((current?.userId&&person.authUserId===current.userId)||(staffId&&person.id===staffId)))||null;
 }
 function contextKey(){const current=session();return config.getContextKey?.()||[state().business?.id||state().business?.accountNumber||'sample',current?.userId||role(),current?.id||current?.sessionId||'',role()].join(':')}
 function invalidateLocation(){locationGeneration++;locating=false}
 function invalidateStatement(){statementGeneration++}
 function invalidateOperation(){operationGeneration++;busy=false}
 function clearDrafts(){ticketDrafts={};shiftDrafts={}}
 function resetContext(){invalidateLocation();invalidateStatement();invalidateOperation();clearDrafts();renderedPage='';selectedShop='';tab='attention';error='';notice='';csvDraft='';reconSource='Sample statement';period='';preview=null;ticketId='';supportFilter='open';locationDraft=null;shopEdits={};savedRunId='';resultPage=1;resultQuery='';exceptionsOnly=false}
 function ensureContext(){const key=contextKey();if(contextBusiness&&contextBusiness!==key)resetContext();contextBusiness=key}
 const allowedShops=()=>array(state().shops).filter(shop=>owner()||(session()?.shopIds||[config.getShopId?.()]).includes(shop.id));
 const shop=()=>{const all=allowedShops();if(!all.some(s=>s.id===selectedShop))selectedShop=config.getShopId?.()||all[0]?.id||'';return all.find(s=>s.id===selectedShop)||all[0]};
 const devices=()=>array(config.getDevices?.()||state().devices);
 const deviceReadiness=()=>{
  const summaries=array(config.getDeviceReadiness?.()||state().shopReadiness||state().deviceReadiness);
  return config.getConnectionStatus?.()==='offline'?allowedShops().map(shop=>({shopId:shop.id,phoneReady:false,phoneCount:summaries.find(s=>s.shopId===shop.id)?.phoneCount||0,offlineCount:1})):summaries;
 };
 const readinessFor=s=>activationReadiness(state(),s,devices(),{deviceReadiness:deviceReadiness()});
 const selectCurrent=id=>{if(allowedShops().some(s=>s.id===id)){selectedShop=id;config.onSelectShop?.(id)}};
 const redraw=()=>config.onRender?.();
 const shopName=id=>array(state().shops).find(s=>s.id===id)?.name||'Unassigned receipt';
 const messages=()=>`${error?`<div class="ops-message error" role="alert">${icon('alert')}<span>${escape(error)}</span></div>`:''}${notice?`<div class="ops-message success" role="status">${icon('check')}<span>${escape(notice)}</span></div>`:''}`;
 const heading=(title,description,actions='',eyebrow='BUSINESS OPERATIONS')=>`<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1 class="page-title">${title}</h1><p class="subtitle">${description}</p></div><div class="page-actions">${actions}</div></div>`;
 const selectShop=()=>`<label class="ops-shop-select"><span class="sr-only">Shop</span><select class="select" name="operationsShop" aria-label="Operations shop">${allowedShops().map(s=>`<option value="${escape(s.id)}" ${s.id===shop()?.id?'selected':''}>${escape(s.name)}</option>`).join('')}</select></label>`;
 function requireAccess(shopId=null){
  if(!session()&&!config.getRole)throw new Error('Sign in to manage shop operations.');
  if(shopId&&!allowedShops().some(s=>s.id===shopId))throw new Error('This shop is outside your assigned access.');
 }
 function requireOwner(){requireAccess();if(!owner())throw new Error('Only the business owner can manage these operations.');}
 async function run(task,message){
  if(busy)return;const context=contextKey(),generation=operationGeneration;
  const current=()=>context===contextKey()&&generation===operationGeneration;
  busy=true;error='';notice='';redraw();
  try{await task(current);if(current()&&message)notice=message}
  catch(e){if(current())error=e?.message||'We could not complete this action. Please try again.'}
  finally{if(current()){busy=false;redraw()}}
 }
 function clearSavedShopFields(shopId,submitted,fields){
  const draft=shopEdits[shopId];if(!draft)return;
  for(const field of fields)if(draft[field]===submitted[field])delete draft[field];
  if(!Object.keys(draft).length)delete shopEdits[shopId];
 }
 async function act(type,payload){const result=await config.act?.(type,payload);if(result===null||result===false)throw new Error('The action was not saved. Check your access and try again.');return result}
 function activationPage(){
  const s=shop();if(!s)return heading('Add your first shop.','Set up a shop before checking counter readiness.');
  const steps=readinessFor(s),done=steps.filter(step=>step.done).length,minimumReady=steps.filter(step=>!['payment','publish'].includes(step.key)).every(step=>step.done),counterReady=minimumReady&&s.published===true,canManage=['owner','manager'].includes(role());
  return heading('Ready at every counter.','Finish these steps before your team starts serving with Lumo.',selectShop(),'SHOP ACTIVATION')
   +messages()
   +`<div class="ops-activation-layout"><section class="panel ops-checklist"><div class="panel-heading"><div><h2 class="panel-title">${escape(s.name)}</h2><p class="muted text-small">${done} of ${steps.length} checks complete</p></div>${badge(counterReady?'Counter ready':'Setup in progress',counterReady?'success':'warning')}</div><div class="ops-progress" aria-label="${done} of ${steps.length} checks complete"><span style="width:${done/steps.length*100}%"></span></div>${steps.map((step,index)=>`<article class="ops-check-step ${step.done?'done':''}"><span class="ops-step-icon">${icon(step.done?'check':step.icon)}</span><div><span class="ops-step-number">STEP ${index+1}</span><h3>${step.title}</h3><p>${step.description}</p><div class="ops-step-actions">${step.key==='location'?button('Review location','shop','secondary small')+(!step.done&&canManage?button('Location is correct','confirm-location','ghost small'):''):step.key==='qr'?button('Show shop QR','qr','secondary small')+(!step.done&&canManage?button('QR is displayed','confirm-qr','ghost small'):''):step.key==='people'?(owner()?button(step.done?'Review team':'Invite a user','invite','secondary small')+(!step.done?button('I run this counter','owner-operated','ghost small'):''):role()==='manager'?button('View shop team','team','secondary small'):''):step.key==='phone'?button('Set up receiving phone','sound','secondary small'):step.key==='publish'?(canManage?button(s.published?'Remove from campus search':'Publish shop on Campus Pay',s.published?'unpublish':'publish',s.published?'secondary small':'primary small',!s.published&&!minimumReady||busy?'disabled':''):'<span class="hint">Ask the owner or shop manager to publish this shop.</span>'):button('Open checkout','checkout','secondary small')}</div>${step.key==='publish'?'<p class="ops-publication-note">Publishing makes the shop name, hours, landmark and map pin visible to students. Its direct shop QR can receive a test payment before publication.</p>':''}</div>${step.done?'<span class="ops-done-label">Done</span>':''}</article>`).join('')}</section><aside class="ops-activation-aside"><div class="ops-ready-card"><span class="ops-ready-mark">${icon('shield')}</span><h2>One account.<br>The right counter.</h2><p>Shop setup does not create a separate bank balance. Every confirmed receipt belongs to the merchant account and the correct shop’s collection period.</p></div><div class="callout">${icon('alert')}<span>This is a test-money environment. Counter readiness does not mean a bank or identity provider has approved the business.</span></div></aside></div>`;
 }
 function shopPage(){
  const s=shop();if(!s)return heading('No assigned shop.','Ask the owner to assign a shop to your account.');
  const person=currentOperator();
  const shifts=array(state().shifts).filter(shift=>shift.shopId===s.id).sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)));
  const mine=shifts.find(shift=>shift.status==='open'&&shift.staffId===person?.id);
  const otherOpen=array(state().shifts).find(shift=>shift.status==='open'&&shift.staffId===person?.id&&shift.shopId!==s.id);
  const draft={...s,...shopEdits[s.id],...(locationDraft?.shopId===s.id?locationDraft:{})};
  const map=Number.isFinite(Number(draft.lat))&&Number.isFinite(Number(draft.lng))?`https://www.google.com/maps/search/?api=1&query=${Number(draft.lat)},${Number(draft.lng)}`:'';
  return heading('Run your shop, with clarity.','Availability, location, trading day and staff handover.',selectShop(),'SHOP OPERATIONS')
   +messages()
   +`<div class="ops-shop-status"><span class="shop-icon">${icon('shop')}</span><div><h2>${escape(s.name)}</h2><p>${escape(s.area)} · ${escape(s.code)}</p></div>${badge(s.accepting&&s.open!==false?'Accepting Lumo':'Payments paused',s.accepting&&s.open!==false?'success':'warning')}${role()!=='cashier'?button(s.accepting?'Pause payments':'Resume payments','toggle','secondary small'):''}</div>`
   +`<div class="ops-settings-grid"><section class="panel ops-settings-panel"><div class="panel-heading"><h2 class="panel-title">Shop details</h2>${icon('pin')}</div><form data-form="operations" data-operations-form="shop"><input type="hidden" name="shopId" value="${escape(s.id)}"><label class="field"><span class="label">Opening hours shown to students</span><input class="input" name="hours" required maxlength="100" value="${escape(draft.hours||'7 am – 10 pm')}" placeholder="e.g. Mon–Sat, 7 am – 10 pm" ${role()==='cashier'?'readonly':''}></label><label class="field"><span class="label">Landmark or directions</span><input class="input" name="landmark" required maxlength="180" value="${escape(draft.landmark||'')}" placeholder="e.g. Beside the Night Market entrance" ${role()==='cashier'?'readonly':''}></label><div class="ops-location-preview"><div class="ops-map-art">${icon('pin')}<span>${escape(s.area)}</span></div><div><strong>${locationDraft?.shopId===s.id?'New location captured':'Shop location'}</strong><p>${escape(s.landmark||'Add a landmark students can recognise.')}</p>${map?`<a class="text-btn" href="${escape(map)}" target="_blank" rel="noopener noreferrer">Check the pin in Maps ${icon('arrow')}</a>`:''}</div></div><input type="hidden" name="lat" value="${escape(draft.lat)}"><input type="hidden" name="lng" value="${escape(draft.lng)}">${role()!=='cashier'?`<div class="ops-form-actions">${button(locating?'Finding location…':'Use this phone’s location','capture-location','secondary',locating||busy?'disabled':'')}<button type="submit" class="btn primary" ${busy?'disabled':''}>Save shop details</button></div><p class="notice">Capture the location while standing at the shop, then check the pin. The saved pin belongs to your shared business record. Students can see it after publication; changes to a published shop appear in its public details.</p>`:''}</form></section><section class="panel ops-settings-panel"><div class="panel-heading"><h2 class="panel-title">Your trading day</h2>${icon('clock')}</div><form data-form="operations" data-operations-form="closing"><input type="hidden" name="shopId" value="${escape(s.id)}"><p class="muted text-small">Choose when this shop’s trading day ends. A 3 am cutoff keeps after-midnight Night Market receipts in the same business day.</p><label class="field"><span class="label">Daily cutoff · Ghana time</span><input class="input" type="time" name="cutoff" value="${escape(draft.cutoff||'00:00')}" required ${role()==='cashier'?'readonly':''}></label><label class="field"><span class="label">Closing method</span><select class="select" name="closeMode" ${role()==='cashier'?'disabled':''}><option value="manual" ${draft.closeMode!=='automatic'?'selected':''}>Staff closes the shop day</option><option value="automatic" ${draft.closeMode==='automatic'?'selected':''}>Automatically close at the cutoff</option></select></label><div class="ops-closing-explainer">${icon('shield')}<span>Closing saves a report and resets this shop’s collection figure. The merchant account balance stays unchanged. Earlier-day refunds appear as adjustments.</span></div>${role()!=='cashier'?`<div class="ops-form-actions">${button('Review & close day','close','secondary')}<button type="submit" class="btn primary" ${busy?'disabled':''}>Save closing rules</button></div>`:''}<p class="notice">Automatic closing is processed when the shared service checks this shop. It does not move merchant funds.</p></form></section></div>`
   +`<section class="panel ops-shift-panel"><div class="panel-heading"><div><h2 class="panel-title">Shift & handover</h2><p class="muted text-small">Payment requests retain their operator and shift. Static shop QR receipts stay at shop level, with no cashier assigned.</p></div>${mine?badge('Your shift is open','success'):otherOpen?badge('Your shift is open at '+shopName(otherOpen.shopId),'warning'):person?button('Start my shift','start-shift','primary small'):''}</div>${mine?`<form class="ops-handover" data-form="operations" data-operations-form="shift"><input type="hidden" name="id" value="${escape(mine.id)}"><label class="field"><span class="label">Handover note</span><textarea class="input" name="note" rows="2" maxlength="500" placeholder="Anything the next person should know?">${escape(shiftDrafts[mine.id]||'')}</textarea></label><button type="submit" class="btn secondary" ${busy?'disabled':''}>End my shift</button></form>`:''}<div class="ops-shift-list">${shifts.length?shifts.slice(0,8).map(shift=>`<article><span class="ops-mini-icon">${icon('people')}</span><div><strong>${escape(shift.staffName||shift.performedBy||array(state().staff).find(p=>p.id===shift.staffId)?.name||'Unrecorded operator')}</strong><small>${when(shift.startedAt)}${shift.endedAt?' → '+when(shift.endedAt):' · In progress'}</small>${shift.note?`<p>${escape(shift.note)}</p>`:''}</div>${badge(shift.status==='open'?'Open':'Ended',shift.status==='open'?'success':'neutral')}<strong>${cash(shift.net||0)}</strong></article>`).join(''):'<div class="ops-empty">No shifts recorded yet. Start your own shift to record your payment requests and handover.</div>'}</div></section>`;
 }
 function attentionView(){
  const exceptions=operationExceptions(state(),devices(),Date.now(),{deviceReadiness:deviceReadiness()});
  return `<div class="ops-exception-grid">${exceptions.length?exceptions.map(item=>`<article class="panel ops-exception"><span class="ops-exception-icon">${icon(item.type==='device'?'phone':item.type==='closing'?'clock':'alert')}</span><div><span class="ops-exception-type">${escape(item.type.replaceAll('-',' '))}</span><h3>${escape(item.title)}</h3><p>${escape(item.detail)}</p></div>${button('Review '+icon('arrow'),'exception','ghost small',`data-kind="${escape(item.action)}" data-shop="${escape(item.shopId||'')}" data-id="${escape(item.id||'')}"`)}</article>`).join(''):`<section class="panel ops-all-clear"><span class="ops-ready-mark">${icon('check')}</span><h2>Nothing waiting for attention.</h2><p>Your shop and payment exception checks are clear.</p></section>`}</div>`;
 }
 function savedResult(run){
  if(!run)return null;
  const results=array(run.results||run.rows).map(row=>({...row,expectedAmount:row.expectedAmount??row.ledgerAmount??null,expectedStatus:row.expectedStatus||row.ledgerStatus||null,status:row.status||row.statementStatus||'paid'}));
  return {results,matched:results.filter(row=>row.result==='matched').length,unmatched:results.filter(row=>row.result==='unmatched').length,duplicates:results.filter(row=>row.result==='duplicate').length,mismatches:results.filter(row=>!['matched','unmatched','duplicate'].includes(row.result)).length,unlisted:run.unlisted??null,source:run.source,period:run.period,createdAt:run.createdAt,saved:true};
 }
 function currentResult(){return savedRunId?savedResult(array(state().reconciliations).find(run=>run.id===savedRunId)):preview}
 function resultFilters(){return {query:resultQuery,exceptionsOnly}}
 function exportResults(){
  requireOwner();const result=currentResult();if(!result)return;
  const rows=reconciliationExportRows(result,resultFilters()),filename='lumo-statement-comparison.csv';
  if(config.onExport){config.onExport(rows,filename);return}
  const csv='\uFEFF'+rows.map(row=>row.map(value=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');
  link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  notice='Comparison export prepared for the current filters.';redraw();
 }
 function reconciliationView(){
  const runs=array(state().reconciliations),result=currentResult();
  return `<div class="callout">${icon('file')}<span>Compare an imported statement with recorded Lumo receipts. This checks your data; it does not connect to a bank, create receipts or change money.</span></div><div class="ops-recon-layout"><section class="panel ops-settings-panel"><div class="panel-heading"><h2 class="panel-title">Compare a statement</h2>${button('Use current receipts as a sample','sample-statement','ghost small')}</div><form data-form="operations" data-operations-form="reconciliation"><label class="field"><span class="label">Statement label</span><input class="input" name="source" maxlength="100" required value="${escape(reconSource)}"></label><label class="field"><span class="label">Statement period or description</span><input class="input" name="period" maxlength="100" value="${escape(period)}" placeholder="e.g. 11 November · Night Market"></label><label class="field"><span class="label">CSV file</span><input class="input" type="file" name="statementFile" accept=".csv,text/csv" aria-label="Choose statement CSV"></label><label class="field"><span class="label">Statement rows</span><textarea class="input ops-csv" name="statement" rows="7" required spellcheck="false" placeholder="reference,amount,status&#10;LM123456,25.00,paid">${escape(csvDraft)}</textarea><span class="hint">Header: reference,amount,status. Amounts are in cedis, with up to two decimal places. Up to 1,000 rows.</span></label><div class="ops-form-actions"><button class="btn secondary" type="submit" name="intent" value="preview" ${busy?'disabled':''}>Preview comparison</button><button class="btn primary" type="submit" name="intent" value="save" ${busy?'disabled':''}>Save comparison</button></div></form></section><aside><section class="panel ops-settings-panel"><div class="panel-heading"><h2 class="panel-title">What the check looks for</h2></div><div class="ops-explain-list"><div>${icon('check')}<span><strong>Matched</strong>Reference and amount agree, and both records are confirmed.</span></div><div>${icon('alert')}<span><strong>Mismatched</strong>The amount differs, or either record is not confirmed.</span></div><div>${icon('file')}<span><strong>Unmatched or duplicate</strong>A reference is missing from Lumo or repeated in the statement.</span></div></div><p class="notice">An unmatched line is an exception to investigate. Importing it never credits the merchant account.</p></section></aside></div>${result?reconciliationResult(result):''}<section class="panel section-gap"><div class="panel-heading"><h2 class="panel-title">Saved comparisons</h2><span class="badge neutral">${runs.length}</span></div>${runs.length?`<div class="ops-run-list">${runs.map(run=>`<button type="button" class="ops-saved-run ${run.id===savedRunId?'selected':''}" data-action="ops-open-reconciliation" data-id="${escape(run.id)}"><span class="ops-mini-icon">${icon('file')}</span><div><strong>${escape(run.source||'Statement comparison')}</strong><small>${escape(run.period||'No period supplied')} · ${when(run.createdAt)}</small></div><span>${run.matched??run.summary?.matched??0} matched</span>${badge((run.exceptions??array(run.rows||run.results).filter(row=>row.result!=='matched').length)+' exceptions',(run.exceptions??0)>0?'warning':'neutral')}${icon('arrow')}</button>`).join('')}</div>`:'<div class="ops-empty">Your saved statement comparisons will appear here.</div>'}</section>`;
 }
 function reconciliationResult(result){
  const filtered=filterReconciliationResults(result,resultFilters()),pages=Math.max(1,Math.ceil(filtered.length/25));
  resultPage=Math.max(1,Math.min(resultPage,pages));const first=(resultPage-1)*25,rows=filtered.slice(first,first+25);
  return `<section class="panel ops-recon-result section-gap"><div class="panel-heading"><div><h2 class="panel-title">${result.saved?'Saved comparison':'Comparison results'}</h2>${result.saved?`<p class="muted text-small">${escape(result.source||'Statement comparison')} · ${when(result.createdAt)}</p>`:''}</div><div class="ops-result-actions">${badge(result.mismatches||result.unmatched||result.duplicates?'Needs review':'References agree',result.mismatches||result.unmatched||result.duplicates?'warning':'success')}${button('Close results','close-results','ghost small')}</div></div><div class="ops-recon-stats">${[['Matched',result.matched],['Unmatched',result.unmatched],['Mismatches',result.mismatches],['Duplicates',result.duplicates]].map(([label,value])=>`<div><strong>${value||0}</strong><span>${label}</span></div>`).join('')}</div><div class="ops-result-filters"><label class="ops-result-search"><span class="sr-only">Search comparison rows</span><input id="ops-result-search" class="input" type="search" name="operationsResultSearch" aria-label="Search comparison rows" placeholder="Search reference or result" value="${escape(resultQuery)}"></label><label class="ops-exception-toggle"><input type="checkbox" name="operationsResultExceptions" ${exceptionsOnly?'checked':''}> Exceptions only</label>${button('Export these rows','export-results','secondary small',!filtered.length?'disabled':'')}</div><div class="table-wrap"><table class="data-table"><thead><tr><th>Reference</th><th>Statement amount</th><th>Lumo amount</th><th>Result</th></tr></thead><tbody>${rows.length?rows.map(row=>`<tr><td>${escape(row.reference)}</td><td>${cash(row.amount)}</td><td>${row.expectedAmount==null?'—':cash(row.expectedAmount)}</td><td>${badge(row.result.replaceAll('-',' '),row.result==='matched'?'success':'warning')}</td></tr>`).join(''):'<tr><td colspan="4"><div class="ops-empty">No rows match these filters.</div></td></tr>'}</tbody></table></div><div class="ops-results-pagination"><span>${filtered.length?first+1:0}–${Math.min(first+25,filtered.length)} of ${filtered.length} rows${exceptionsOnly?' with exceptions':''}</span><div>${button('Previous','result-page','secondary small',`data-page="${resultPage-1}" ${resultPage===1?'disabled':''}`)}<span>Page ${resultPage} of ${pages}</span>${button('Next','result-page','secondary small',`data-page="${resultPage+1}" ${resultPage===pages?'disabled':''}`)}</div></div><p class="notice">${result.unlisted==null?'This saved comparison does not include an unlisted-receipt count.':`${result.unlisted} recorded confirmed receipts were not in this import. A partial statement can leave receipts unlisted.`} ${result.saved?'Saved rows show the results recorded at the time of the comparison.':''}</p></section>`;
 }
 function supportView(){
  const all=array(state().tickets),tickets=all.filter(t=>supportFilter==='all'||(supportFilter==='open'?t.status!=='resolved':t.status===supportFilter));
  const ticket=all.find(t=>t.id===ticketId),draft=ticketDrafts[ticketId]||{};
  return `<div class="ops-support-layout"><section class="panel"><div class="panel-heading"><div><h2 class="panel-title">Case queue</h2><p class="muted text-small">Shared cases for this business. No external support message is sent.</p></div><select class="select" name="operationsSupportFilter" aria-label="Support case status"><option value="open" ${supportFilter==='open'?'selected':''}>Needs attention</option><option value="resolved" ${supportFilter==='resolved'?'selected':''}>Resolved</option><option value="all" ${supportFilter==='all'?'selected':''}>All cases</option></select></div>${tickets.length?`<div class="ops-case-list">${tickets.map(t=>`<button type="button" class="${t.id===ticketId?'selected':''}" data-action="ops-ticket" data-id="${escape(t.id)}"><span class="ops-mini-icon">${icon('help')}</span><div><strong>${escape(t.subject)}</strong><small>${escape(shopName(t.shopId))} · ${when(t.createdAt)}</small></div>${badge(t.status||'open',t.status==='resolved'?'success':'warning')}</button>`).join('')}</div>`:'<div class="ops-empty">No cases match this view.</div>'}</section><section class="panel ops-settings-panel">${ticket?`<div class="panel-heading"><h2 class="panel-title">${escape(ticket.subject)}</h2>${badge(ticket.status||'open',ticket.status==='resolved'?'success':'warning')}</div><p class="ops-ticket-message">${escape(ticket.message)}</p><div class="ops-ticket-meta"><span>Case ${escape(ticket.id)}</span><span>Reference ${escape(ticket.paymentReference||ticket.transactionId||'Not supplied')}</span></div>${array(ticket.responses).length?`<div class="ops-case-responses">${ticket.responses.map(r=>`<article><strong>${escape(r.by||'Business owner')}</strong><small>${when(r.createdAt)}</small><p>${escape(r.message||r.response||'')}</p></article>`).join('')}</div>`:ticket.response?`<div class="ops-case-responses"><p>${escape(ticket.response)}</p></div>`:''}<form data-form="operations" data-operations-form="ticket"><input type="hidden" name="id" value="${escape(ticket.id)}"><label class="field"><span class="label">Case status</span><select class="select" name="status"><option value="open" ${(draft.status||ticket.status)==='open'?'selected':''}>Open</option><option value="investigating" ${(draft.status||ticket.status)==='investigating'?'selected':''}>Investigating</option><option value="resolved" ${(draft.status||ticket.status)==='resolved'?'selected':''}>Resolved</option></select></label><label class="field"><span class="label">Update for the shop team</span><textarea class="input" name="response" rows="3" required maxlength="1500" placeholder="What was checked, and what happens next?">${escape(draft.response||'')}</textarea></label><button type="submit" class="btn primary" ${busy?'disabled':''}>Save case update</button></form>`:`<div class="ops-empty"><span class="ops-ready-mark">${icon('help')}</span><h3>Choose a case to review.</h3><p>Record the investigation and share an update with the shop team.</p></div>`}</section></div>`;
 }
 function onboardingView(){
  const b=state().business||{},complete=allowedShops().filter(s=>readinessFor(s).filter(step=>step.key!=='payment').every(step=>step.done)).length;
  return `<div class="ops-onboarding-grid"><section class="panel ops-settings-panel"><div class="panel-heading"><h2 class="panel-title">Business setup</h2>${badge('Test environment','warning')}</div><div class="ops-status-rows">${[['Business',b.name],['Owner',b.ownerName],['Account',b.accountNumber],['Verification',b.verificationStatus==='approved-demo'?'Simulated checks completed':b.verificationStatus||'Sample business'],['Counter readiness',`${complete} of ${allowedShops().length} shops complete`]].map(([label,value])=>`<div><span>${label}</span><strong>${escape(value||'Not recorded')}</strong></div>`).join('')}</div><div class="callout">${icon('shield')}<span>Phone, identity and bank checks here are simulations. Real merchant approval and virtual-account provisioning require connected services and an authorised Lumo operations team.</span></div></section><section class="panel ops-settings-panel"><div class="panel-heading"><h2 class="panel-title">What is connected?</h2></div><div class="ops-connection-list">${[['Merchant and shop records',config.isShared?.()?'Shared prototype service':'Browser-local sample'],['Bank / virtual account','Not connected'],['SMS / identity verification','Not connected'],['Statement comparison','Manual CSV import'],['Support case queue','Business owner and assigned shops']].map(([label,value])=>`<div><span>${label}</span><strong>${escape(value)}</strong></div>`).join('')}</div><p class="notice">Never use real passwords or treat demonstration balances as money held at a bank.</p></section></div>`;
 }
 function operationsPage(){
  if(!owner())return heading('Owner access required.','Sign in as the business owner to review exceptions, reconciliation and case queues.');
  return heading('Know what needs attention.','Keep every shop, receipt and open case in view.','','OWNER OPERATIONS')+messages()
   +`<div class="ops-tabs" role="tablist" aria-label="Owner operations">${[['attention','Needs attention'],['reconciliation','Reconciliation'],['support','Case queue'],['onboarding','Business setup']].map(([value,label])=>`<button role="tab" aria-selected="${tab===value}" data-action="ops-tab" data-tab="${value}" class="${tab===value?'selected':''}">${label}</button>`).join('')}</div>`
   +(tab==='reconciliation'?reconciliationView():tab==='support'?supportView():tab==='onboarding'?onboardingView():attentionView());
 }
 function render(page='activation'){
  ensureContext();if(renderedPage&&renderedPage!==page){invalidateLocation();invalidateStatement();invalidateOperation();clearDrafts()}renderedPage=page;
  if(!['owner','manager','cashier'].includes(role()))return heading('Sign in to continue.','Shop operations follow the access assigned to your account.');
  return `<div class="operations-workspace">${page==='operations'?operationsPage():page==='shop-operations'?shopPage():activationPage()}</div>`;
 }
 async function handleClick(action,element={}){
  ensureContext();
  const a=String(action).replace(/^ops-/,'');error='';notice='';
  if(a==='tab'){if(['attention','reconciliation','support','onboarding'].includes(element.dataset?.tab)){if(tab!==element.dataset.tab){invalidateStatement();invalidateOperation();clearDrafts()}tab=element.dataset.tab;}redraw();return}
  const s=shop();
  if(a==='ticket'){if(ticketId!==element.dataset?.id)ticketDrafts={};ticketId=element.dataset?.id||'';redraw();return}
  if(['open-reconciliation','result-page','close-results','export-results'].includes(a)){
   try{
    requireOwner();
    if(a==='open-reconciliation'){
     const run=array(state().reconciliations).find(run=>run.id===element.dataset?.id);
     if(!run)throw new Error('This saved comparison is unavailable.');
     invalidateStatement();savedRunId=run.id;preview=null;resultPage=1;resultQuery='';exceptionsOnly=false;tab='reconciliation';
    }
    if(a==='result-page')resultPage=Math.max(1,Number(element.dataset?.page)||1);
    if(a==='close-results'){savedRunId='';preview=null;resultPage=1;resultQuery='';exceptionsOnly=false}
    if(a==='export-results')exportResults();
   }catch(e){error=e.message}
   redraw();return;
  }
  if(a==='sample-statement'){
   invalidateStatement();
   const rows=array(state().transactions).filter(tx=>tx.status==='paid').slice(0,20);
   csvDraft='reference,amount,status\n'+rows.map(tx=>`${tx.reference},${(tx.amount/100).toFixed(2)},paid`).join('\n');
   reconSource='Sample from current receipts';preview=null;savedRunId='';resultPage=1;resultQuery='';exceptionsOnly=false;redraw();return;
  }
  if(a==='exception'){
   if(element.dataset?.shop)selectCurrent(element.dataset.shop);
   const kind=element.dataset?.kind;
   if(kind==='approvals'){try{requireOwner();if(config.onApprovals)config.onApprovals();else config.onNavigate?.('approvals')}catch(e){error=e.message;redraw()}}
   else if(kind==='sound')config.onSound?.(selectedShop);
   else if(kind==='payment')config.onOpenTransaction?.(element.dataset.id);
   else config.onNavigate?.(kind==='shop'?'shop-operations':kind||'activity',selectedShop);
   return;
  }
  if(!s)return;
  if(['shop','sound','invite','team','qr','checkout','close'].includes(a))selectCurrent(s.id);
  if(a==='shop'){config.onNavigate?.('shop-operations',s.id);return}
  if(a==='sound'){config.onSound?.(s.id);return}
  if(a==='invite'){config.onInvite?.(s.id);return}
  if(a==='team'){config.onNavigate?.('team',s.id);return}
  if(a==='qr'){config.onQR?.(s.id);return}
  if(a==='checkout'){config.onNavigate?.('checkout',s.id);return}
  if(a==='close'){config.onClose?.(s.id);return}
  if(a==='capture-location'){
   if(locating||busy)return;
   if(!navigator.geolocation){error='Location is unavailable. Keep the existing pin and ask the owner to check it.';redraw();return}
   const generation=++locationGeneration,context=contextKey(),shopId=s.id,page=renderedPage;
   const current=()=>generation===locationGeneration&&context===contextKey()&&shop()?.id===shopId&&renderedPage===page;
   locating=true;redraw();
   const failure=()=>{if(!current())return;locating=false;error='We could not get this phone’s location. Keep the existing pin, or try again while at the shop.';redraw()};
   try{navigator.geolocation.getCurrentPosition(position=>{
    if(!current())return;const lat=position.coords?.latitude,lng=position.coords?.longitude;
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){failure();return}
    locating=false;locationDraft={shopId,lat,lng};notice='Location captured. Check the pin, then save shop details.';redraw();
   },failure,{enableHighAccuracy:true,timeout:15000,maximumAge:30000})}catch{failure()}
   return;
  }
  if(a==='publish'||a==='unpublish')await run(async()=>{
   requireAccess(s.id);if(!['owner','manager'].includes(role()))throw new Error('Ask the owner or shop manager to publish this shop.');
   if(a==='publish'&&!readinessFor(s).filter(step=>!['publish','payment'].includes(step.key)).every(step=>step.done))throw new Error('Confirm the location, display the QR, assign the team and enable a tested receiving phone before publishing.');
   await act('UPDATE_SHOP',{id:s.id,published:a==='publish'});
  },a==='publish'?'Shop published. Students can find its public shop details on Campus Pay.':'Shop removed from campus search. Its direct shop QR remains available for testing.');
  if(a==='owner-operated')await run(async()=>{requireOwner();await act('UPDATE_ACTIVATION',{shopId:s.id,ownerOperated:true})},'Owner-operated counter recorded.');
  if(a==='confirm-location')await run(async()=>{requireAccess(s.id);await act('UPDATE_ACTIVATION',{shopId:s.id,locationConfirmed:true})},'Shop location confirmed.');
  if(a==='confirm-qr')await run(async()=>{requireAccess(s.id);await act('UPDATE_ACTIVATION',{shopId:s.id,qrReady:true})},'QR display confirmed.');
  if(a==='toggle')await run(async()=>{requireAccess(s.id);await act('UPDATE_SHOP',{id:s.id,accepting:!s.accepting,open:!s.accepting})},s.accepting?'Shop payments paused.':'Shop is accepting payments.');
  if(a==='start-shift')await run(async()=>{requireAccess(s.id);await act('START_SHIFT',{shopId:s.id})},'Your shift has started.');
 }
 async function handleSubmit(form,event){
  ensureContext();
  const p=Object.fromEntries(new FormData(form));
  if(form.dataset.operationsForm==='shop')invalidateLocation();
  if(form.dataset.operationsForm==='shop')await run(async current=>{
   requireAccess(p.shopId);
   const savedLocation=locationDraft;
   await act('UPDATE_SHOP',{id:p.shopId,hours:String(p.hours||'').trim(),landmark:String(p.landmark||'').trim(),lat:Number(p.lat),lng:Number(p.lng)});
   if(current()){if(locationDraft===savedLocation)locationDraft=null;clearSavedShopFields(p.shopId,p,['hours','landmark'])}
  },'Shop details saved.');
  if(form.dataset.operationsForm==='closing')await run(async current=>{
   requireAccess(p.shopId);
   await act('UPDATE_SHOP',{id:p.shopId,cutoff:p.cutoff,closeMode:p.closeMode});if(current())clearSavedShopFields(p.shopId,p,['cutoff','closeMode']);
  },'Trading-day rules saved.');
  if(form.dataset.operationsForm==='shift')await run(async current=>{
   requireAccess();await act('END_SHIFT',{id:p.id,note:String(p.note||'').trim()});if(current()&&shiftDrafts[p.id]===p.note)delete shiftDrafts[p.id];
  },'Your shift is closed. The shop collection period remains open.');
  if(form.dataset.operationsForm==='ticket')await run(async current=>{
   requireOwner();await act('UPDATE_TICKET',{id:p.id,status:p.status,response:String(p.response||'').trim()});if(current()){const draft=ticketDrafts[p.id];if(draft){for(const field of ['status','response'])if(draft[field]===p[field])delete draft[field];if(!Object.keys(draft).length)delete ticketDrafts[p.id]}}
  },'Case update shared with this business.');
  if(form.dataset.operationsForm==='reconciliation')await run(async()=>{
   requireOwner();invalidateStatement();csvDraft=String(p.statement||'');reconSource=String(p.source||'').trim();period=String(p.period||'').trim();
   const rows=parseReconciliationRows(csvDraft);preview=reconcileRows(state(),rows);savedRunId='';resultPage=1;resultQuery='';exceptionsOnly=false;
   const intent=event?.submitter?.value||form.querySelector('[name="intent"]:focus')?.value||'preview';
   if(intent==='save')await act('SAVE_RECONCILIATION',{rows,source:reconSource,period});
  },'Statement comparison completed. No money was moved.');
 }
 async function handleChange(element){
  ensureContext();
  if(!element?.name)return;
  if(element.name==='operationsShop'){invalidateLocation();invalidateStatement();invalidateOperation();shiftDrafts={};selectCurrent(element.value);locationDraft=null;error='';notice='';redraw();return}
  if(['response','status'].includes(element.name)&&ticketId){ticketDrafts[ticketId]={...ticketDrafts[ticketId],[element.name]:element.value};return}
  if(element.name==='note'){const person=currentOperator(),shift=array(state().shifts).find(value=>value.shopId===shop()?.id&&value.status==='open'&&value.staffId===person?.id);if(shift)shiftDrafts[shift.id]=element.value;return}
  if(element.name==='operationsResultSearch'){resultQuery=element.value;resultPage=1;redraw();return}
  if(element.name==='operationsResultExceptions'){exceptionsOnly=element.checked;resultPage=1;redraw();return}
  if(['hours','landmark','cutoff','closeMode'].includes(element.name)){const id=shop()?.id;if(id)shopEdits[id]={...shopEdits[id],[element.name]:element.value};return}
  if(element.name==='operationsSupportFilter'){supportFilter=element.value;redraw();return}
  if(element.name==='statement'){invalidateStatement();csvDraft=element.value;return}
  if(element.name==='source'){invalidateStatement();reconSource=element.value;return}
  if(element.name==='period'){invalidateStatement();period=element.value;return}
  if(element.name==='statementFile'){
   const generation=++statementGeneration,context=contextKey(),page=renderedPage,selectedTab=tab,file=element.files?.[0];
   if(!file)return;
   const current=()=>generation===statementGeneration&&context===contextKey()&&page===renderedPage&&selectedTab===tab;
   if(file.size>1024*1024){error='Choose a CSV smaller than 1 MB.';redraw();return}
   try{requireOwner();const source=await file.text();if(!current())return;parseReconciliationRows(source);csvDraft=source;reconSource=file.name.slice(0,100);preview=null;savedRunId='';resultPage=1;resultQuery='';exceptionsOnly=false;error='';notice='Statement loaded. Preview the comparison before saving.'}
   catch(e){if(!current())return;error=e.message}
   redraw();
  }
 }
 return {render,handleClick,handleSubmit,handleChange,setShop(id){ensureContext();if(selectedShop!==id){invalidateLocation();invalidateStatement();invalidateOperation();shiftDrafts={};locationDraft=null}selectedShop=id},setTab(value){ensureContext();if(['attention','reconciliation','support','onboarding'].includes(value)){if(tab!==value){invalidateStatement();invalidateOperation();clearDrafts()}tab=value}},leave(){invalidateLocation();invalidateStatement();invalidateOperation();clearDrafts();locationDraft=null;renderedPage=''},reset(){resetContext();contextBusiness=contextKey()}};
}
