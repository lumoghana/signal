/* Local, memory-only browser QA. All state setup is explicit in this source;
   browser automation reads the DOM and clicks these controls. Never ship. */
'use strict';
const frame=document.getElementById('screen'),fixtures=document.getElementById('fixtures'),sizes=document.getElementById('sizes'),status=document.getElementById('status'),report=document.getElementById('report'),progress=document.getElementById('progress');
const cases=['chooser','lumo-entry','momo-entry','bank-entry','lumo-recipient','momo-recipient','bank-recipient','lumo-review','momo-review','bank-review','lumo-authorize','momo-authorize','bank-authorize','lumo-biometric','awaiting','partial','processing','paid','failed','member-review','long-proof-review'];
const allSizes=[[320,568,1],[375,667,1],[390,844,1],[390,480,1],[568,320,1],[320,568,2],[390,844,2]];
let running=false,ready=false,results=[],fonts=[];
for(const id of ['run','run-current'])document.getElementById(id).disabled=true;
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
const need=(condition,message)=>{if(!condition)throw Error(message);};
function restoreFonts(){for(const x of fonts)if(x.el.isConnected){if(x.value)x.el.style.setProperty('font-size',x.value,x.priority);else x.el.style.removeProperty('font-size');}fonts=[];}
function setField(id,value){const d=frame.contentDocument,w=frame.contentWindow,el=d.getElementById(id);need(el,'Missing mounted field '+id+' on '+w.L.route);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));}
async function flow(name){
 const w=frame.contentWindow,L=w.L,G=L.groupMoney;need(L.collectionPayoutRails,'Payout rail add-on not loaded');
 w.__payoutAuditErrors.length=0;L.qr?.stop?.();L.go('home');await tick();L.explore();L.ensureAccounts?.();
 Object.assign(L.state,{balance:1,txs:[],goals:[],essentials:[],requests:[],paymentDraft:null,groupMoney:undefined,savingHacks:undefined,planSaved:false});
 Object.assign(L.state.profile,{name:'Kwame Mensah',displayName:'Kwame Mensah',pin:'123456',phone:'0241230123'});L.route='home';L.params={};L.history=[];L.save();L.render();await tick();
 const long=name==='long-proof-review',people=[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena Asante'},{id:'kojo',name:'Kojo Mensah'},{id:'esi',name:'Esi Boateng'}];
 const made=G.createCollection({title:long?'Final year educational trip and graduation celebration':'Class trip',target:'1200',deadline:new w.Date(w.Date.now()+14*86400000).toISOString().slice(0,10),members:people,mandateApproval:'named',mandateApproverIds:['self','abena','kojo'],mandateRequiredApprovals:2,acceptMandate:true,idempotencyKey:L.id('qa-pot')});need(made.ok,made.error);const item=made.item;
 for(const person of people.slice(1)){const a=G.acceptMandate({itemId:item.id,personId:person.id,version:item.mandate.version,sample:true});need(a.ok,a.error);}
 const paid=G.recordSamplePayment({itemId:item.id,personId:'abena',amount:'600',reference:L.id('qa-fund')});need(paid.ok,paid.error);
 L.gm.startProposal(item.id);await tick();need(L.route==='collectionPayoutRail','Expected chooser, got '+L.route);if(name==='chooser')return {itemId:item.id};
 const method=name.startsWith('momo-')?'momo':name.startsWith('bank-')?'bank':'lumo';L.collectionPayoutRails.choose(method);await tick();need(L.route==='send','Expected native send, got '+L.route);
 if(name.endsWith('-entry'))return {itemId:item.id,method};
 if(method==='lumo'){L.pickPerson('abena');await tick();}
 else {setField('recipient-number',method==='bank'?'102345678901':'0241234567');if(method==='bank')setField('recipient-provider','GCB Bank');if(method==='momo')L.mobileNetwork.check(L.state.paymentDraft,'0241234567');need(L.checkRecipient()===true,'Native sample recipient check failed');await tick();}
 if(name.endsWith('-recipient'))return {itemId:item.id,method};
 setField('payment-amount','150');setField('payment-note',long?'Transport deposit for the final year educational trip to the University of Ghana and graduation celebration':'Minibus deposit');
 if(long){setField('gm-proposal-supportingReference','Invoice INV-2026-CLASS-TRIP-TRANSPORT-001 / final year educational trip and graduation celebration');L.state.paymentDraft.attachment={name:'Transport invoice for the final year educational trip and graduation celebration.png',type:'image/png',size:12,dataUrl:'data:image/png;base64,iVBORw0KGgoAAQID'};}
 L.reviewTransactionDetails();await tick();need(L.route==='paymentReview','Expected review, got '+L.route+' '+frame.contentDocument.getElementById('error')?.textContent);if(name.endsWith('-review')&&name!=='member-review')return {itemId:item.id,method};
 L.continuePayment();await tick();need(L.route==='authorize','Expected authorize, got '+L.route);if(name.endsWith('-authorize'))return {itemId:item.id,method};
 if(name==='lumo-biometric'){need(L.biometricPayment.open(),'Native biometric demo did not open');await tick();return {itemId:item.id,method};}
 setField('payment-pin','123456');L.authorizePayment();await tick();need(L.route==='groupMoneyProposalDetail','Expected awaiting request, got '+L.route+' '+frame.contentDocument.getElementById('error')?.textContent);
 const p=G.proposal(item.id,L.params.proposalId);need(p,'Authorisation did not create request');need(p.approvals.length===0,'Request authorisation incorrectly counted as approval');need(item.disbursements.length===0,'Money submitted before approvals');
 if(name==='awaiting')return {itemId:item.id,proposalId:p.id,method};
 const vote=personId=>{const r=G.approveProposal({itemId:item.id,proposalId:p.id,personId,version:p.mandateVersion,fingerprint:p.fingerprint,sample:personId!=='self'});need(r.ok,r.error);};
 vote('self');L.render();await tick();if(name==='partial')return {itemId:item.id,proposalId:p.id,method};
 if(name==='member-review'){L.gm.openMember(item.id,'abena',p.id);await tick();need(L.route==='groupMoneyMember','Expected member review');return {itemId:item.id,proposalId:p.id,method};}
 vote('abena');L.render();await tick();let s=G.proposalSummary(item.id,p.id);need(s.status==='processing','Final required vote did not dispatch, got '+s.status);
 if(name==='processing')return {itemId:item.id,proposalId:p.id,method};
 const outcome=name==='failed'?'Failed':'Completed',settled=G.settleSamplePayout({itemId:item.id,proposalId:p.id,reference:s.reference,attemptId:s.attemptId,outcome,sample:true});need(settled.ok,settled.error);L.render();await tick();
 return {itemId:item.id,proposalId:p.id,method};
}
function geometry(){
 const d=frame.contentDocument,w=frame.contentWindow,app=d.getElementById('app'),root=app.getBoundingClientRect(),findings=[];const styles=new WeakMap(),style=el=>{if(!styles.has(el))styles.set(el,w.getComputedStyle(el));return styles.get(el);};
 const closed=el=>{for(let p=el;p;p=p.parentElement)if(p.localName==='details'&&!p.open&&!p.querySelector(':scope > summary')?.contains(el))return true;return false;};
 const hidden=el=>{for(let p=el;p;p=p.parentElement){const s=style(p);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0||s.contentVisibility==='hidden')return true;}const s=style(el),r=el.getBoundingClientRect();return s.clipPath!=='none'||s.clip!=='auto'||r.width<=2&&r.height<=2&&['absolute','fixed'].includes(s.position);};
 const visible=el=>el.getClientRects().length&&!el.closest('svg,[hidden],[inert],[aria-hidden="true"],.sr-only,.desktop-note')&&!closed(el)&&!hidden(el);
 const scrollable=el=>/(auto|scroll)/.test(style(el).overflowY)&&el.scrollHeight>el.clientHeight+2;
 const parents=el=>{const a=[];for(let p=el.parentElement;p;p=p.parentElement)a.push(p);return a;};
 const desc=el=>({tag:el.localName,id:el.id,label:(el.getAttribute('aria-label')||el.textContent||'').trim().replace(/\s+/g,' ').slice(0,85)});
 for(const el of app.querySelectorAll('*')){if(!visible(el)||el.matches('video,canvas,img,svg,path,i'))continue;const r=el.getBoundingClientRect(),s=style(el);if(r.width<1||r.height<1)continue;
  if((r.left<root.left-1||r.right>root.right+1)&&!parents(el).some(p=>/(auto|scroll)/.test(style(p).overflowX)&&p.scrollWidth>p.clientWidth+2))findings.push({kind:'horizontal-overflow',...desc(el),left:r.left,right:r.right,appLeft:root.left,appRight:root.right});
  if(el.children.length===0&&!el.matches('input,select,textarea')&&el.clientWidth>0&&el.scrollWidth>el.clientWidth+2&&s.textOverflow!=='ellipsis'&&!/(auto|scroll)/.test(s.overflowX))findings.push({kind:'text-overflow',...desc(el),client:el.clientWidth,scroll:el.scrollWidth});
  if(!el.matches('button,input,select,textarea,a,[role="button"],summary'))continue;
  if(['fixed','sticky'].includes(s.position)&&(r.bottom>root.bottom+1||r.top<root.top-1))findings.push({kind:'fixed-control-outside',...desc(el)});
  for(const p of parents(el)){if(p===d.body||p===d.documentElement)break;const ps=style(p),pr=p.getBoundingClientRect();if(!/(hidden|clip)/.test(ps.overflowY)||r.bottom<=pr.bottom+1&&r.top>=pr.top-1)continue;const path=parents(el).slice(0,parents(el).indexOf(p));if(path.some(scrollable)||scrollable(p))continue;if(ps.position==='fixed'||p===app||p.id==='view'||p.classList.contains('task-sheet')||p.classList.contains('screen')){findings.push({kind:'unreachable-control',...desc(el),clippedBy:p.id||p.className});break;}}
 }
 return [...new Map(findings.map(f=>[JSON.stringify(f),f])).values()];
}
async function check(name,size){
 restoreFonts();const [width,height,scale]=size;frame.style.width=width+'px';frame.style.height=height+'px';let setup,error;
 try{setup=await flow(name);}catch(e){error=String(e.stack||e);}
 const d=frame.contentDocument,w=frame.contentWindow;await d.fonts.ready;
 if(scale!==1){const list=[...d.querySelectorAll('#app,#app *')].filter(el=>el.getClientRects().length&&!el.closest('[hidden],[inert],[aria-hidden="true"]')).map(el=>({el,size:Number.parseFloat(w.getComputedStyle(el).fontSize),value:el.style.getPropertyValue('font-size'),priority:el.style.getPropertyPriority('font-size')})).filter(x=>Number.isFinite(x.size));for(const x of list){fonts.push(x);x.el.style.setProperty('font-size',x.size*scale+'px','important');}}
 w.dispatchEvent(new w.Event('resize'));await tick();
 const L=w.L,item=setup?.itemId&&L.groupMoney.get(setup.itemId),s=item&&L.groupMoney.summary(item),errors=[...(w.__payoutAuditErrors||[]),...(error?[error]:[])];
 const result={name,size,route:L.route,setup,errors,findings:geometry(),facts:{personalBalance:L.state.balance,personalTransactions:L.state.txs.length,potBalanceCents:s?.balanceCents,reservedCents:s?.reservedCents,disbursements:item?.disbursements.length}};
 if(L.state.balance!==1||L.state.txs.length!==0)result.errors.push('Collection payout touched personal account');return result;
}
function summary(){const findings=results.flatMap(r=>r.findings.map(f=>({case:r.name,size:r.size,...f}))),errors=results.flatMap(r=>r.errors.map(error=>({case:r.name,size:r.size,error})));return {layouts:results.length,findings:findings.length,errors:errors.length,details:{findings,errors},results};}
function show(){const s=summary();report.textContent=JSON.stringify(s,null,2);status.textContent=s.layouts+' layouts · '+s.findings+' findings · '+s.errors+' errors';}
async function sweep(){if(running||!ready)return;running=true;results=[];document.getElementById('run').disabled=true;try{for(const name of cases){for(const size of allSizes){if(!running)break;progress.textContent=name+' · '+size.join(' × ');results.push(await check(name,size));show();}if(!running)break;}}finally{running=false;document.getElementById('run').disabled=false;show();}}
document.getElementById('run').onclick=sweep;document.getElementById('stop').onclick=()=>{running=false;};document.getElementById('run-current').onclick=async()=>{if(running||!ready)return;document.getElementById('run-current').disabled=true;try{results=[await check(fixtures.value,sizes.value.split(',').map(Number))];show();}finally{document.getElementById('run-current').disabled=false;}};
fixtures.innerHTML=cases.map(name=>'<option>'+name+'</option>').join('');
(async()=>{
 const html=await fetch('/').then(r=>r.text());
 const bootstrap='<script>(()=>{const memory=new Map();const store={getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear(),key:i=>[...memory.keys()][i]||null,get length(){return memory.size}};Object.defineProperty(window,"localStorage",{value:store});Object.defineProperty(window,"sessionStorage",{value:store});try{Object.defineProperty(document,"hidden",{get:()=>false});Object.defineProperty(document,"visibilityState",{get:()=>"visible"})}catch{}document.addEventListener("visibilitychange",e=>e.stopImmediatePropagation(),true);const entries=[];let position=-1;Object.defineProperty(window,"history",{value:{get state(){return entries[position]||null},get length(){return entries.length},replaceState(state){if(position<0)position=0;entries[position]=JSON.parse(JSON.stringify(state))},pushState(state){entries.splice(position+1);entries.push(JSON.parse(JSON.stringify(state)));position++},go(delta){const next=position+delta;if(next<0||next>=entries.length)return;position=next;window.dispatchEvent(new PopStateEvent("popstate",{state:JSON.parse(JSON.stringify(entries[position]))}))},back(){this.go(-1)},forward(){this.go(1)}}});try{Object.defineProperty(navigator,"mediaDevices",{value:{getUserMedia:()=>Promise.reject(new Error("Camera stubbed for isolated local QA"))}})}catch{}window.__payoutAuditErrors=[];window.addEventListener("error",e=>window.__payoutAuditErrors.push(e.message));const original=console.error;console.error=(...args)=>{window.__payoutAuditErrors.push(args.map(x=>String(x.stack||x)).join(" "));original.apply(console,args)};})();<\/script>';
 const source=html.replace(/<head([^>]*)>/i,'<head$1><base href="/">'+bootstrap);
 await new Promise(resolve=>{frame.onload=resolve;frame.srcdoc=source;});need(frame.contentWindow.L?.collectionPayoutRails,'App did not load');ready=true;for(const id of ['run','run-current'])document.getElementById(id).disabled=false;status.textContent=cases.length+' isolated payout scenarios ready';
})().catch(e=>{status.textContent='Audit setup failed';report.textContent=String(e.stack||e);});
