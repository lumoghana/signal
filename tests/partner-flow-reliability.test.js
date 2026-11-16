import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState,createDemoState,applyAction} from '../dist/js/model.js';
import {normalizePartnerCode,validPartnerCode} from '../dist/js/partner-code.js';
import {getBoxPartnerInvitationPreview} from '../dist/js/box-partner-invitation.js';
import {initialPartnerView,partnerReady,handleInitialPartnerAction,renderInitialPartnerSetup} from '../dist/js/box-partner-setup.js';
import {openBoxProtection,openProtectedBoxWithdrawal} from '../dist/js/box-protection-ui.js';
import {openPartnerInbox} from '../dist/js/partner-inbox-ui.js';
import {createApprovedService} from '../dist/js/approved-service.js';

const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const tick=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
const future=()=>new Date(Date.now()+300000).toISOString();
const must=value=>{assert.equal(value.ok,true,value.message);return value;};
class Element {
 constructor(tag='',attrs=''){this.tag=tag;this.attrs=attrs;this.listeners=new Map();this.isConnected=true;this.disabled=/\sdisabled(?:\s|$)/.test(attrs);this.value=attrs.match(/value="([^"]*)"/)?.[1]||'';this.textContent='';this.checked=false;this.dataset={};for(const match of attrs.matchAll(/data-([\w-]+)="([^"]*)"/g))this.dataset[match[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=match[2];}
 addEventListener(name,callback){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(callback);}
 setAttribute(name,value){this[name]=value;}
 async emit(name){return Promise.all((this.listeners.get(name)||[]).map(callback=>callback({target:this,preventDefault(){}})));}
 async click(){if(!this.disabled)return this.emit('click');}
}
class Sheet extends Element {
 constructor(html){super();this.html=html;this.error=new Element();this.controls=[...html.matchAll(/<(button|input|form)\b([^>]*)>/g)].map(match=>new Element(match[1],match[2]));}
 querySelector(selector){if(['.bp-error','[data-partner-inbox-error]','[data-partner-phone-error]'].includes(selector))return this.error;return this.querySelectorAll(selector)[0]||null;}
 querySelectorAll(selector){if(selector==='button')return this.controls.filter(item=>item.tag==='button');if(selector==='[data-action^="partner-inbox:"]')return this.controls.filter(item=>item.dataset.action?.startsWith('partner-inbox:'));const m=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);if(!m)return [];return this.controls.filter(item=>m[2]===undefined?new RegExp(`(?:^|\\s)${m[1]}(?:\\s|$)`).test(item.attrs):item.attrs.includes(`${m[1]}="${m[2]}"`));}
 detach(){this.isConnected=false;for(const item of this.controls)item.isConnected=false;}
}
function sheets(ctx){ctx.html=[];ctx.toasts=[];ctx.saved=[];ctx.current=null;ctx.refreshes=0;ctx.sheet=(html,bind)=>{ctx.current?.detach();ctx.current=new Sheet(html);ctx.html.push(html);bind?.(ctx.current);};ctx.closeSheet=()=>ctx.current?.detach();ctx.toast=value=>ctx.toasts.push(value);ctx.refresh=()=>ctx.refreshes++;ctx.saveDraft=()=>ctx.saved.push(JSON.stringify(ctx.draft));ctx.auth=options=>{ctx.authPending=options;ctx.closeSheet();};return ctx;}
function initial(){
 const state=createEmptyState({name:'Ama',phone:'0200000000'}),box={name:'Study essentials',target:100000,partnerEnabled:true,partnerName:'Esi Owusu',partnerPhone:'0241234567',partnerSetupId:'test-setup'},input=new Element(),error=new Element();
 const ctx=sheets({state,draft:{box},route:{section:'boxes',page:'create',step:'partner'},connected:true,shared:{user:{id:'owner-a'},authVersion:1,recoveryScope:'owner-a:1'},calls:[],$:selector=>selector==='[name="box-partner-code"]'?input:error,$$:()=>[],go(next){this.route=next;},actAsync(type,payload){this.calls.push({type,payload});return applyAction(this.state,type,payload);}});
 const helpers={setError:(_,message)=>error.textContent=message,boxRoute:step=>ctx.go({section:'boxes',page:'create',step}),refresh:()=>ctx.refresh()};
 const action=name=>handleInitialPartnerAction(ctx,ctx.route,name,helpers);
 const scope=()=>({setupId:box.partnerSetupId,boxName:box.name,partner:{name:box.partnerName,phone:box.partnerPhone},...(box.partnerInvitationId?{invitationId:box.partnerInvitationId}:{})});
 function invite(accepted=false){const sent=must(applyAction(state,'sendBoxPartnerInvitation',scope()));box.partnerInvitationId=sent.invitationId;box.partnerCodePhase='code';if(accepted)must(applyAction(state,'respondBoxPartnerInitialInvitation',{invitationId:sent.invitationId,decision:'accepted'}));return state.boxPartnerInvitations.find(item=>item.id===sent.invitationId);}
 return {ctx,state,box,input,error,scope,action,invite};
}
function protectedFlow(){
 const state=createDemoState(),box=must(applyAction(state,'createBox',{name:'Laptop',target:100000})).box;
 must(applyAction(state,'requestBoxProtection',{boxId:box.id,partner:{name:'Esi',phone:'0241234567'},pin:'1234'}));
 must(applyAction(state,'respondBoxPartnerInvite',{boxId:box.id,invitationId:box.protection.invitationId,decision:'accepted'}));
 must(applyAction(state,'contributeBox',{id:box.id,amount:5000}));
 const requestId=must(applyAction(state,'requestBoxRelease',{boxId:box.id,kind:'withdrawal',amount:1000})).requestId;
 const code=must(applyAction(state,'issueBoxPartnerCode',{boxId:box.id,requestId})).code;
 const ctx=sheets({state,draft:{},route:{section:'boxes',page:'detail',id:box.id},connected:true,shared:{user:{id:'owner-a'},authVersion:1,recoveryScope:'owner-a:1'},calls:[],actAsync(type,payload){this.calls.push({type,payload});return applyAction(this.state,type,payload);}});
 const open=()=>openProtectedBoxWithdrawal(ctx,box);
 const input=()=>ctx.current.querySelector('[name="partnerCode"]');
 const submit=()=>ctx.current.querySelector('[data-bp-code-form]').emit('submit');
 return {ctx,state,box,request:box.protectionRequests.find(item=>item.id===requestId),code,open,input,submit};
}
function inbox(){
 const rows=[{id:'another',kind:'initial',status:'awaiting-partner',ownerName:'Other owner',boxName:'Other box',expiresAt:future()},{id:'wanted',kind:'initial',status:'awaiting-partner',ownerName:'Ama',boxName:'Study essentials',expiresAt:future()}];
 const ctx=sheets({state:{},draft:{},route:{section:'home',page:'home'},connected:true,calls:[],shared:{user:{id:'partner-a'},authVersion:1,recoveryScope:'partner-a:1',partnerRequests:rows,async readPartnerInbox(){return {ok:true};}}});
 ctx.shared.respondPartner=async(id,decision)=>{ctx.calls.push({id,decision});const next={...rows.find(item=>item.id===id),status:decision==='accepted'?'accepted':'declined',...(decision==='accepted'?{code:'123456'}:{})};ctx.shared.partnerRequests=[rows[0],next];return {ok:true,inbox:ctx.shared.partnerRequests};};
 const button=name=>ctx.current.querySelector(`[data-partner-inbox-${name}]`);
 return {ctx,rows,button};
}

test('partner code normalization accepts paste separators and rejects malformed or non-ASCII digits',()=>{
 for(const value of ['123456','123 456','123-456',' \t12-34 56\n','123\u00a0456'])assert.equal(normalizePartnerCode(value),'123456');
 for(const value of ['12345','1234567','12x456','１２３４５６','١٢٣٤٥٦','123.456','123\u200b456',' '.repeat(27)+'123456',null,123456]){assert.equal(normalizePartnerCode(value),'');assert.equal(validPartnerCode(value),false);}
});

test('local domain checks formatted initial and withdrawal codes without charging malformed formatting',()=>{
 const h=initial(),invitation=h.invite(true),code=getBoxPartnerInvitationPreview(h.state,invitation.id).code;
 assert.equal(applyAction(h.state,'verifyBoxPartnerInvitation',{...h.scope(),code:'12x456'}).ok,false);assert.equal(invitation.attempts,0);
 must(applyAction(h.state,'verifyBoxPartnerInvitation',{...h.scope(),code:code.slice(0,3)+' - '+code.slice(3)}));assert.equal(invitation.status,'verified');
 const p=protectedFlow();assert.equal(applyAction(p.state,'verifyBoxPartnerCode',{boxId:p.box.id,requestId:p.request.id,code:'123'}).ok,false);assert.equal(p.request.attempts,0);
 const result=must(applyAction(p.state,'verifyBoxPartnerCode',{boxId:p.box.id,requestId:p.request.id,code:p.code.slice(0,3)+'-'+p.code.slice(3)}));assert.equal(result.authorized,true);assert.equal(p.box.balance,5000);
});

test('one hundred rapid setup taps send a single invitation and keep its original retry key',async()=>{
 const h=initial(),pending=deferred();h.ctx.actAsync=(type,payload)=>{h.ctx.calls.push({type,payload});return pending.promise;};
 const first=h.action('box-partner');for(let i=0;i<100;i++)await h.action('box-partner');assert.equal(h.ctx.calls.length,1);
 const payload=h.ctx.calls[0].payload;assert.ok(payload.idempotencyKey);pending.resolve({ok:false,unknown:true,message:'Reply lost'});await first;
 h.ctx.actAsync=(type,payload)=>{h.ctx.calls.push({type,payload});return {ok:false,unknown:true,message:'Still checking'};};await h.action('box-partner');assert.deepEqual(h.ctx.calls[1],h.ctx.calls[0]);
});

test('an uncertain send recovers the matching authoritative invitation without sending another',async()=>{
 const h=initial();h.ctx.actAsync=(type,payload)=>{h.ctx.calls.push({type,payload});must(applyAction(h.state,type,payload));return {ok:false,unknown:true,message:'Reply lost'};};
 await h.action('box-partner');assert.equal(h.box.partnerCodePhase,'code');assert.ok(h.box.partnerInvitationId);await h.action('box-partner');assert.equal(h.ctx.calls.length,1);
});

test('Continue reuses awaiting, accepted and verified invitations without rotating their codes',async()=>{
 for(const status of ['awaiting-partner','accepted','verified']){const h=initial(),inv=h.invite(status!=='awaiting-partner');if(status==='verified')must(applyAction(h.state,'verifyBoxPartnerInvitation',{...h.scope(),code:inv.code}));const before=JSON.stringify(h.state);h.box.partnerCodePhase='';await h.action('box-partner');assert.equal(h.ctx.calls.length,0);assert.equal(h.box.partnerCodePhase,'code');assert.equal(JSON.stringify(h.state),before);}
});

test('a stale or missing invitation reference recovers the newest exact scope across devices',()=>{
 for(const missing of [false,true]){const h=initial(),old=h.invite(true);old.resendAt=new Date(Date.now()-1000).toISOString();old.sentAt=new Date(Date.now()-60000).toISOString();const latest=must(applyAction(h.state,'sendBoxPartnerInvitation',h.scope()));h.box.partnerInvitationId=missing?'gone':old.id;h.state.boxPartnerInvitations.reverse();const view=initialPartnerView(h.ctx);assert.equal(view.id,latest.invitationId);assert.equal(h.box.partnerInvitationId,latest.invitationId);assert.equal(h.ctx.calls.length,0);}
});

test('scope changes cannot borrow another invitation and consumed proof remains terminal',()=>{
 for(const field of ['name','partnerName','partnerPhone','partnerSetupId']){const h=initial();h.invite(true);h.box[field]=field==='partnerPhone'?'0271112222':'Other scope';const view=initialPartnerView(h.ctx);assert.equal(view?.scopeMatches,false);assert.equal(partnerReady(h.ctx),false);}
 const h=initial(),old=h.invite(true);old.status='consumed';h.state.boxPartnerInvitations.push({...structuredClone(old),id:'newer',status:'accepted',sentAt:future()});assert.equal(initialPartnerView(h.ctx).id,old.id);assert.equal(initialPartnerView(h.ctx).status,'consumed');
});

test('resend cooldown prevents another call, and consumed setup opens existing boxes',async()=>{
 const h=initial(),inv=h.invite(true);await h.action('partner-initial-resend');assert.equal(h.ctx.calls.length,0);assert.match(h.error.textContent,/Wait a moment/);inv.status='consumed';await h.action('box-partner');assert.equal(h.ctx.calls.length,0);await h.action('partner-initial-boxes');assert.equal(h.ctx.route.page,'home');assert.equal(h.ctx.route.section,'boxes');
});

test('malformed setup input is rejected locally and valid pasted codes keep one retry reference',async()=>{
 const h=initial(),inv=h.invite(true);h.input.value='1234567';await h.action('partner-initial-verify');assert.equal(h.ctx.calls.length,0);assert.equal(inv.attempts,0);
 const code=inv.code;h.input.value=code.slice(0,3)+' - '+code.slice(3);h.ctx.actAsync=(type,payload)=>{h.ctx.calls.push({type,payload});return {ok:false,unknown:true,message:'Reply lost'};};await h.action('partner-initial-verify');await h.action('partner-initial-verify');assert.equal(h.ctx.calls[0].payload.code,code);assert.equal(h.ctx.calls[0].payload.idempotencyKey,h.ctx.calls[1].payload.idempotencyKey);assert.equal(Object.hasOwn(h.box,'partnerCode'),false);assert.equal(JSON.stringify(h.ctx.draft).includes(code),false);
 h.input.value=code==='111111'?'222222':'111111';await h.action('partner-initial-verify');assert.notEqual(h.ctx.calls[2].payload.idempotencyKey,h.ctx.calls[1].payload.idempotencyKey);
});

test('actual approved-service journals retain only opaque retry references for both code flows',async()=>{
 for(const type of ['initial','withdrawal']){
  const values=new Map([['lumo-approved-session-v1',JSON.stringify({access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'owner-a'}})]]),sent=[];
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const service=createApprovedService({storage,modeStorage:{getItem:()=>null},lockManager:{request:async(_name,_options,work)=>work()},fetch:async(_url,options)=>{sent.push(JSON.parse(options.body));return new Response(JSON.stringify({ok:false,code:'UNAVAILABLE',message:'Unknown result'}),{status:503,headers:{'Content-Type':'application/json'}});}});
  const h=type==='initial'?initial():protectedFlow();h.ctx.shared=service;h.ctx.actAsync=(action,payload)=>service.action(action,payload);
  let code;
  if(type==='initial'){code=h.invite(true).code;h.input.value=code;await h.action('partner-initial-verify');await h.action('partner-initial-verify');}
  else{h.open();code=h.code;h.input().value=code;await h.submit();await h.submit();}
  assert.equal(sent.length,2);assert.equal(sent[0].attemptId,sent[1].attemptId);assert.equal(sent[0].payload.code,code);
  const journal=values.get('lumo-approved-pending-v1');assert.ok(journal);assert.equal(journal.includes(code),false);assert.equal(journal.includes('"code"'),false);assert.equal(JSON.stringify(h.ctx.draft).includes(code),false);
 }
});

test('rapid valid-code taps produce one verification and no financial mutation',async()=>{
 const h=initial(),inv=h.invite(true),pending=deferred(),wallet=h.state.wallet;h.input.value=inv.code;h.ctx.actAsync=(type,payload)=>{h.ctx.calls.push({type,payload});return pending.promise;};const first=h.action('partner-initial-verify');for(let i=0;i<100;i++)await h.action('partner-initial-verify');assert.equal(h.ctx.calls.length,1);pending.resolve(applyAction(h.state,h.ctx.calls[0].type,h.ctx.calls[0].payload));await first;assert.equal(partnerReady(h.ctx),true);assert.equal(h.input.value,'');assert.equal(h.state.wallet,wallet);assert.equal(h.state.boxes.length,0);
});

test('late setup replies cannot reopen changed accounts, routes, states or draft scopes',async()=>{
 for(const change of ['owner','auth','stored-owner','route','state','draft','scope']){const h=initial(),pending=deferred();h.ctx.actAsync=()=>pending.promise;const work=h.action('box-partner');if(change==='owner')h.ctx.shared.user={id:'owner-b'};if(change==='auth')h.ctx.shared.authVersion++;if(change==='stored-owner')h.ctx.shared.recoveryScope=null;if(change==='route')h.ctx.route={section:'home',page:'home'};if(change==='state')h.ctx.state=structuredClone(h.state);if(change==='draft')h.ctx.draft.box={...h.box};if(change==='scope')h.box.partnerName='Changed person';pending.resolve({ok:true,invitationId:'late'});await work;assert.equal(h.ctx.refreshes,0,change);assert.equal(h.ctx.toasts.length,0,change);assert.notEqual(h.ctx.draft.box.partnerInvitationId,'late',change);}
});

test('connected code copy is accurate and full recovery limitation remains before enrollment',()=>{
 const h=initial();const helpers={setupHead:()=>'',setupProgress:()=>'',err:()=>''};let html=renderInitialPartnerSetup(h.ctx,h.ctx.route,helpers);assert.ok(html.indexOf('data-partner-support-limit')<html.indexOf('p:box-partner-toggle'));assert.match(html,/invitation to their Lumo account/);assert.doesNotMatch(html,/Try the partner’s phone|Prototype simulation/);
 const inv=h.invite();html=renderInitialPartnerSetup(h.ctx,h.ctx.route,helpers);assert.match(html,/Waiting for their acceptance/);assert.match(html,/maxlength="32"/);assert.match(html,/p:partner-initial-verify"[^>]*disabled/);inv.status='accepted';html=renderInitialPartnerSetup(h.ctx,h.ctx.route,helpers);assert.match(html,/Enter their code/);inv.expiresAt=new Date(Date.now()-1).toISOString();html=renderInitialPartnerSetup(h.ctx,h.ctx.route,helpers);assert.match(html,/Get a fresh code/);
});

test('protected-code fields never enter draft persistence and old stored fields are removed',async()=>{
 const h=protectedFlow();h.ctx.draft.boxProtection={[h.box.id]:{amountText:'10.00',code:'654321'}};h.open();assert.equal(Object.hasOwn(h.ctx.draft.boxProtection[h.box.id],'code'),false);assert.doesNotMatch(h.ctx.current.html,/654321/);assert.match(h.ctx.current.html,/maxlength="32"/);h.input().value=h.code;await h.input().emit('input');h.ctx.saveDraft();assert.ok(h.ctx.saved.every(value=>!value.includes(h.code)&&!value.includes('654321')));assert.equal(h.ctx.calls.length,0);
});

test('protected malformed codes do not call the server or consume an attempt',async()=>{
 const h=protectedFlow();h.open();for(const bad of ['123','12x456','１２３４５６','1234567']){h.input().value=bad;await h.submit();}assert.equal(h.ctx.calls.length,0);assert.equal(h.request.attempts,0);assert.match(h.ctx.current.error.textContent,/six digits/);assert.equal(h.box.balance,5000);
});

test('protected verification guards rapid taps and retains the exact attempt on unknown retry',async()=>{
 const h=protectedFlow(),pending=deferred();h.open();h.input().value=h.code.slice(0,3)+' - '+h.code.slice(3);h.ctx.actAsync=(type,payload)=>{h.ctx.calls.push({type,payload});return pending.promise;};const first=h.submit();for(let i=0;i<50;i++)await h.submit();assert.equal(h.ctx.calls.length,1);assert.equal(h.ctx.calls[0].payload.code,h.code);pending.resolve({ok:false,unknown:true,message:'Reply lost'});await first;h.ctx.actAsync=(type,payload)=>{h.ctx.calls.push({type,payload});return applyAction(h.state,type,payload);};await h.submit();assert.equal(h.ctx.calls[1].payload.idempotencyKey,h.ctx.calls[0].payload.idempotencyKey);assert.equal(h.request.status,'approved');assert.match(h.ctx.current.html,/Confirm transfer with PIN/);assert.equal(h.ctx.authPending,undefined);assert.equal(h.box.balance,5000);
});

test('late protected replies cannot replace a new sheet or account context',async()=>{
 for(const change of ['sheet','owner','auth','route','state']){const h=protectedFlow(),pending=deferred();h.open();h.input().value=h.code;h.ctx.actAsync=()=>pending.promise;const work=h.submit();if(change==='sheet')openBoxProtection(h.ctx,h.box);if(change==='owner')h.ctx.shared.user={id:'owner-b'};if(change==='auth')h.ctx.shared.authVersion++;if(change==='route')h.ctx.route={section:'home',page:'home'};if(change==='state')h.ctx.state=structuredClone(h.state);const writes=h.ctx.html.length;pending.resolve({ok:true,authorized:true});await work;assert.equal(h.ctx.html.length,writes,change);assert.equal(h.ctx.toasts.length,0,change);assert.equal(h.box.balance,5000,change);}
});

test('specific inbox links open only their matching request and missing links stay explicit',async()=>{
 const h=inbox();await openPartnerInbox(h.ctx,'wanted');assert.match(h.ctx.current.html,/Study essentials/);assert.doesNotMatch(h.ctx.current.html,/Other box/);await openPartnerInbox(h.ctx,'missing');assert.match(h.ctx.current.html,/no longer available/);assert.doesNotMatch(h.ctx.current.html,/data-partner-inbox-accept|Other box/);
});

test('partner response burst is single-flight and copies only the matching returned code on a tap',async()=>{
 const h=inbox(),pending=deferred(),copied=[];const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>copied.push(value)}}});
 try{await openPartnerInbox(h.ctx,'wanted');h.ctx.current.querySelector('[data-partner-inbox-consent]').checked=true;h.ctx.shared.respondPartner=(id,decision)=>{h.ctx.calls.push({id,decision});return pending.promise;};const button=h.button('accept');await button.click();for(let i=0;i<100;i++)await button.click();assert.equal(h.ctx.calls.length,1);assert.deepEqual(h.ctx.calls[0],{id:'wanted',decision:'accepted'});const wanted={...h.rows[1],status:'accepted',code:'123456'},other={...h.rows[0],status:'accepted',code:'654321'};pending.resolve({ok:true,inbox:[other,wanted]});await tick();assert.match(h.ctx.current.html,/123456/);assert.doesNotMatch(h.ctx.current.html,/654321/);assert.deepEqual(copied,[]);await h.button('copy').click();await tick();assert.deepEqual(copied,['123456']);assert.equal(h.ctx.draft.code,undefined);}
 finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
});

test('expired inbox codes are hidden and cannot be copied or accepted',async()=>{
 for(const status of ['accepted','code-issued','awaiting-partner']){const h=inbox();h.rows[1]={...h.rows[1],status,code:'123456',expiresAt:new Date(Date.now()-1000).toISOString()};await openPartnerInbox(h.ctx,'wanted');assert.match(h.ctx.current.html,/expired/);assert.doesNotMatch(h.ctx.current.html,/123456|data-partner-inbox-copy|data-partner-inbox-accept/);assert.equal(h.ctx.calls.length,0);}
});

test('late inbox loads cannot reopen after a route, account or auth generation change',async()=>{
 for(const change of ['route','owner','auth','stored-owner']){const h=inbox(),pending=deferred();h.ctx.shared.readPartnerInbox=()=>pending.promise;const work=openPartnerInbox(h.ctx,'wanted');if(change==='route')h.ctx.route={section:'pay',page:'home'};if(change==='owner')h.ctx.shared.user={id:'other'};if(change==='auth')h.ctx.shared.authVersion++;if(change==='stored-owner')h.ctx.shared.recoveryScope=null;const writes=h.ctx.html.length;pending.resolve({ok:true});await work;assert.equal(h.ctx.html.length,writes,change);assert.doesNotMatch(h.ctx.current.html,/Study essentials/);}
});

test('late partner acceptance cannot expose a code after account switch or sheet replacement',async()=>{
 for(const change of ['owner','auth','sheet']){const h=inbox(),pending=deferred();await openPartnerInbox(h.ctx,'wanted');h.ctx.current.querySelector('[data-partner-inbox-consent]').checked=true;h.ctx.shared.respondPartner=()=>pending.promise;await h.button('accept').click();if(change==='owner')h.ctx.shared.user={id:'other'};if(change==='auth')h.ctx.shared.authVersion++;if(change==='sheet')h.ctx.sheet('<h2>New sheet</h2>');const writes=h.ctx.html.length;pending.resolve({ok:true,inbox:[{...h.rows[1],status:'accepted',code:'123456'}]});await tick();assert.equal(h.ctx.html.length,writes,change);assert.doesNotMatch(h.ctx.current.html,/123456/);}
});

test('a failed partner response remains retryable without another request or decision',async()=>{
 const h=inbox();await openPartnerInbox(h.ctx,'wanted');h.ctx.current.querySelector('[data-partner-inbox-consent]').checked=true;h.ctx.shared.respondPartner=async(id,decision)=>{h.ctx.calls.push({id,decision});return {ok:false,message:'Could not confirm. Try again.'};};await h.button('accept').click();await tick();assert.equal(h.button('accept').disabled,false);await h.button('accept').click();await tick();assert.deepEqual(h.ctx.calls,[{id:'wanted',decision:'accepted'},{id:'wanted',decision:'accepted'}]);assert.match(h.ctx.current.error.textContent,/Could not confirm/);
});

test('actual shared-control filtering retains connected partner checks and code-purpose copy while hiding simulations',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../dist/js/app.js',import.meta.url),'utf8'),start=source.indexOf('function suppressSharedControls('),end=source.indexOf('\n}',start)+2;
 assert.ok(start>=0&&end>start);
 const suppress=new Function('shared',source.slice(start,end)+';return suppressSharedControls;')({connected:true});
 const p=protectedFlow();p.open();
 const h=initial();h.invite(true);
 const codePage=renderInitialPartnerSetup(h.ctx,h.ctx.route,{setupHead:()=>'',setupProgress:()=>'',err:()=>''});
 const markup=p.ctx.current.html+codePage+'<button data-bp="partner-view">Try the partner simulation</button><p class="box-partner-demo">Prototype simulation. No message is sent.</p>';
 const elements=[...markup.matchAll(/<(button|p)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map(([,tag,attrs,content])=>({tag,attrs,textContent:content.replace(/<[^>]*>/g,''),removed:false,remove(){this.removed=true;},closest(){return null;},querySelector(){return null;}}));
 const matches=(el,selector)=>{
  selector=selector.trim();const excluded=[...selector.matchAll(/:not\(([^)]+)\)/g)].map(match=>match[1]);if(excluded.some(value=>matches(el,value)))return false;selector=selector.replace(/:not\([^)]+\)/g,'');
  if(/\s/.test(selector.replace(/\[[^\]]*\]/g,'')))return false;
  const tag=selector.match(/^[a-z]+/)?.[0];if(tag&&el.tag!==tag)return false;
  const classes=el.attrs.match(/class="([^"]*)"/)?.[1]?.split(/\s+/)||[];if([...selector.matchAll(/\.([\w-]+)/g)].some(match=>!classes.includes(match[1])))return false;
  for(const [,name,value]of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)){if(value===undefined){if(!new RegExp(`(?:^|\\s)${name}(?:\\s|=|$)`).test(el.attrs))return false;}else if(!el.attrs.includes(`${name}="${value}"`))return false;}
  return true;
 };
 const root={querySelectorAll:selectors=>elements.filter(el=>!el.removed&&selectors.split(',').some(selector=>matches(el,selector)))};
 const connected=elements.find(el=>el.tag==='button'&&el.textContent==='Check partner response'),simulation=elements.find(el=>el.textContent==='Try the partner simulation'),purpose=elements.find(el=>el.attrs.includes('data-connected-partner-delivery')&&el.textContent.includes('fresh code and your own PIN'));
 assert.ok(connected);assert.ok(purpose);const originalPurpose=purpose.textContent;
 suppress(root);assert.equal(connected.removed,false);assert.equal(simulation.removed,true);assert.equal(purpose.textContent,originalPurpose);assert.match(purpose.textContent,/fresh code and your own PIN/);
 const legacy=elements.find(el=>el.attrs.includes('box-partner-demo')&&!el.attrs.includes('data-connected-partner-delivery'));assert.match(legacy.textContent,/signed-in Lumo account/);
 let reads=0;p.ctx.shared.snapshot=async()=>{reads++;return {ok:true};};await p.ctx.current.querySelector('[data-bp="partner-view"]').click();assert.equal(reads,1);assert.equal(p.ctx.calls.length,0);assert.doesNotMatch(p.ctx.current.html,/Participant simulation/);
});
