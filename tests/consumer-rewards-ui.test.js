import test from 'node:test';
import assert from 'node:assert/strict';
import {createConsumerRewards,renderConsumerRewards,bindConsumerRewards,openConsumerRewardClaim,resetConsumerRewards} from '../dist/js/consumer-rewards.js';

const SHOP='11111111-1111-4111-8111-111111111111',MEMBER='member-a',TOKEN='LC1-'+'AB'.repeat(24),OTHER_TOKEN='LC1-'+'CD'.repeat(24);
const now=Date.parse('2026-11-17T12:00:00Z');
const rules={version:2,earning:'visits',target:5,minimumSpend:2000,onePerDay:true,reward:{type:'discount',name:'Five cedis off',value:500,minimumSpend:2000,expiryDays:30}};
const member=()=>({id:MEMBER,merchantId:'merchant-a',merchantName:'Ama’s Kitchen',name:'Ama Example',code:'LC-'+'12'.repeat(10),active:true,ruleVersion:2,linkedAt:'2026-11-01T10:00:00Z',progress:3,target:5,earning:'visits',terms:'Collect five qualifying purchases to earn five cedis off.',rules:structuredClone(rules),programme:{id:'programme-a',name:'Kitchen Regulars',colour:'#d4f65a',status:'active'},rewards:[{id:'reward-a',type:'discount',name:'Five cedis off',value:500,minimumSpend:2000,state:'available',expiresAt:'2026-12-17T12:00:00Z'},{id:'item-a',type:'item',name:'A free drink',value:0,minimumSpend:0,state:'available',expiresAt:'2026-12-17T12:00:00Z'}],shops:[{id:SHOP,name:'Night Market',accepting:true,published:true}],history:[{id:'history-a',type:'earn',units:1,createdAt:'2026-11-16T12:00:00Z',shopId:SHOP,shopName:'Night Market'}],collections:[]});
const program=()=>({merchantId:'merchant-a',merchantName:'Ama’s Kitchen',programme:{id:'programme-a',name:'Kitchen Regulars',colour:'#d4f65a',status:'active'},rules:structuredClone(rules),terms:'Collect five qualifying purchases to earn five cedis off.',ruleVersion:2,consentVersion:'merchant-loyalty-2026-11-17',shops:member().shops,canJoin:true});
const projection=()=>({version:'1.1.0',memberships:[member()],membership:null,programme:null});
const reply=loyalty=>({ok:true,loyalty});
const control=(action,extra={})=>({dataset:{rewardsAction:action,...extra}});
const form=(kind,values={})=>({kind,values});
function memory(){const values=new Map();return {values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
function setup({api,storage=memory(),authenticated=true,data=projection(),extra={}}={}){
 let user='user-a',epoch=1,signedIn=authenticated;const calls=[],payments=[],resumes=[],navigation=[];
 const config={getUserId:()=>signedIn?user:'',getIdentity:()=>JSON.stringify([signedIn,user,epoch]),isAuthenticated:()=>signedIn,storage,now:()=>now,api:async(operation,payload,options)=>{calls.push({operation,payload:structuredClone(payload),options:structuredClone(options)});if(api)return api(operation,payload,options);if(operation==='detail')return reply({...structuredClone(data),membership:structuredClone(data.memberships.find(m=>m.id===payload.membershipId)||null)});if(operation==='programme')return reply({...structuredClone(data),memberships:[],programme:program()});return reply(structuredClone(data));},onUseReward:values=>payments.push(values),onPay:values=>payments.push(values),onResumeCollection:values=>resumes.push(values),onBrowse:()=>navigation.push('campus'),onSignIn:()=>navigation.push('signin'),...extra};
 const ui=createConsumerRewards(config);return {ui,calls,payments,resumes,navigation,config,storage,setUser(value){user=value;epoch++;},signOut(){signedIn=false;epoch++;},signIn(value='user-a'){signedIn=true;user=value;epoch++;}};
}
const loadMember=async f=>{await f.ui.refresh();await f.ui.handleClick(control('member',{membershipId:MEMBER}));};

test('signed-out and sample rewards views do not fabricate membership or call the service',async()=>{
 const f=setup({authenticated:false});assert.match(f.ui.render(),/Sign in to your personal Lumo account/);assert.doesNotMatch(f.ui.render(),/Kitchen Regulars|GH₵/);assert.equal(await f.ui.refresh(),false);assert.equal(f.calls.length,0);await f.ui.handleClick('signin');assert.deepEqual(f.navigation,['signin']);
});

test('only service-owned memberships are listed with merchant branding and real progress',async()=>{
 const f=setup();await f.ui.refresh();const html=f.ui.render();assert.match(html,/Ama’s Kitchen/);assert.match(html,/Kitchen Regulars/);assert.match(html,/3 of 5 stamps/);assert.match(html,/2 rewards ready/);assert.doesNotMatch(html,/cashback balance|available money|Reward cost/i);assert.match(html,/data-membership-id="member-a"/);
});

test('spend progress uses integer-pesewa money while visit progress stays stamps',async()=>{
 const d=projection();d.memberships[0]={...member(),earning:'spend',target:10000,progress:2534};const f=setup({data:d});await f.ui.refresh();assert.match(f.ui.render(),/GH₵25\.34 of GH₵100\.00/);assert.doesNotMatch(f.ui.render(),/2534 of 10000 stamps/);
});

test('membership detail shows raw lookup QR, pinned terms, expiry, shops and readable activity',async()=>{
 const f=setup();await loadMember(f);const html=f.ui.render();assert.match(html,/Your membership card/);assert.match(html,/<svg/);assert.match(html,/LC-12121212121212121212/);assert.match(html,/not a payment QR or an account-linking code/);assert.match(html,/Collect five qualifying purchases/);assert.match(html,/17 Dec 2026/);assert.match(html,/Purchase counted/);assert.doesNotMatch(html,/>earn</);assert.match(html,/Night Market/);
});

test('joining needs explicit consent and submits exactly the programme terms reviewed',async()=>{
 let sent;const f=setup({api:async(op,payload,options)=>{if(op==='programme')return reply({...projection(),programme:program(),memberships:[]});sent={op,payload,options};return {...reply({...projection(),membership:member()}),entity:{membershipId:MEMBER}};}});f.ui.open({shopId:SHOP});await f.ui.refresh();assert.match(f.ui.render(),/Join this programme/);await f.ui.handleSubmit(form('join',{}));assert.equal(sent,undefined);assert.match(f.ui.render(),/confirm that you agree to join/);await f.ui.handleSubmit(form('join',{membershipConsent:'on'}));assert.equal(sent.op,'join');assert.deepEqual(sent.payload,{shopId:SHOP,ruleVersion:2,consentVersion:'merchant-loyalty-2026-11-17',membershipConsent:true,marketingConsent:false});assert.match(sent.options.attemptId,/^[A-Za-z0-9_.:-]{10,100}$/);assert.match(f.ui.render(),/You’re in/);
});

test('marketing permission is separate and never preselected in join or claim',async()=>{
 const f=setup();f.ui.open({shopId:SHOP});await f.ui.refresh();const html=f.ui.render();assert.match(html,/Optional\. You can earn rewards without agreeing/);assert.doesNotMatch(html,/name="marketingConsent"[^>]*checked/);await f.ui.handleClick('claim');assert.doesNotMatch(f.ui.render(),/name="marketingConsent"[^>]*checked/);
});

test('paused programme cannot enroll and never sends an optimistic join',async()=>{
 const f=setup({api:async()=>reply({...projection(),programme:{...program(),canJoin:false},memberships:[]})});f.ui.open({shopId:SHOP});await f.ui.refresh();await f.ui.handleSubmit(form('join',{membershipConsent:'on'}));assert.equal(f.calls.filter(c=>c.operation==='join').length,0);assert.match(f.ui.render(),/not accepting new members/);
});

test('a changed-terms definitive rejection clears the attempt and never silently rejoins',async()=>{
 const f=setup({api:async op=>op==='programme'?reply({...projection(),programme:program(),memberships:[]}):{ok:false,code:'LOYALTY_RULE_CHANGED',message:'The terms changed. Read the new programme first.'}});f.ui.open({shopId:SHOP});await f.ui.refresh();await f.ui.handleSubmit(form('join',{membershipConsent:true}));assert.equal(f.ui.getView().pending,null);assert.equal(f.calls.filter(c=>c.operation==='join').length,1);assert.match(f.ui.render(),/terms changed/);
});

test('claim checks the private code and pinned terms before allowing explicit account linkage',async()=>{
 const sent=[];const f=setup({api:async(op,payload,options)=>{if(op==='programme'){sent.push({op,payload});return reply({...projection(),programme:{...program(),ruleVersion:1,terms:'Original member terms.'},memberships:[]});}if(op==='claim'){sent.push({op,payload,options});return {...reply({...projection(),membership:member()}),entity:{membershipId:MEMBER}};}return reply(projection());}});await f.ui.refresh();await f.ui.handleClick('claim');await f.ui.handleSubmit(form('claim',{membershipConsent:true}));assert.equal(sent.length,0);assert.match(f.ui.render(),/Check the private linking code/);await f.ui.handleSubmit(form('claim-code',{claimCode:TOKEN}));assert.match(f.ui.render(),/Original member terms/);assert.doesNotMatch(f.ui.render(),new RegExp(TOKEN));await f.ui.handleSubmit(form('claim',{membershipConsent:true,marketingConsent:true}));assert.equal(sent[1].op,'claim');assert.equal(sent[1].payload.claimCode,TOKEN);assert.equal(sent[1].payload.ruleVersion,1);assert.equal(sent[1].payload.marketingConsent,true);assert.equal(f.ui.getView().pending,null);assert.match(f.ui.render(),/existing membership is linked/);
});

test('unknown claim stores only an account-scoped reference, never the raw token, name or consent payload',async()=>{
 const f=setup({api:async op=>op==='programme'?reply({...projection(),programme:program(),memberships:[]}):op==='claim'?Promise.reject(new Error('Response interrupted')):reply(projection())});await f.ui.refresh();await f.ui.handleClick('claim');await f.ui.handleSubmit(form('claim-code',{claimCode:TOKEN}));await f.ui.handleSubmit(form('claim',{membershipConsent:true}));const saved=[...f.storage.values.values()].join('');assert.match(saved,/"operation":"claim"/);assert.doesNotMatch(saved,new RegExp(TOKEN));assert.doesNotMatch(saved,/claimCode|membershipConsent|marketingConsent|Ama Example/);assert.match(f.ui.render(),/original request/);assert.equal(f.ui.getView().pending.operation,'claim');
});

test('lost join recovers or retries the same envelope once, preserving the original consent and attempt',async()=>{
 const posts=[];let failed=true;const f=setup({api:async(op,payload,options)=>{if(op==='programme')return reply({...projection(),programme:program(),memberships:[]});if(op==='join'){posts.push({payload:structuredClone(payload),options:structuredClone(options)});if(failed)throw Error('Lost response');return reply({...projection(),membership:member()});}if(op==='recover')return reply({...projection(),mutationReceipt:{found:false}});return reply(projection());}});f.ui.open({shopId:SHOP});await f.ui.refresh();await f.ui.handleSubmit(form('join',{membershipConsent:true,marketingConsent:true}));failed=false;await f.ui.recover();assert.equal(posts.length,2);assert.deepEqual(posts[1],posts[0]);assert.equal(f.ui.getView().pending,null);
});

test('post-reload claim recovery reads its saved receipt without another claim or token',async()=>{
 const storage=memory();const first=setup({storage,api:async op=>op==='programme'?reply({...projection(),programme:program(),memberships:[]}):op==='claim'?Promise.reject(Error('Lost response')):reply(projection())});await first.ui.refresh();await first.ui.handleClick('claim');await first.ui.checkClaimCode(TOKEN);await first.ui.handleSubmit(form('claim',{membershipConsent:true}));const original=first.ui.getView().pending.attemptId;first.ui.reset();const second=setup({storage,api:async(op,payload)=>{if(op==='recover'){assert.deepEqual(payload,{attemptId:original});return reply({...projection(),membership:member(),mutationReceipt:{found:true,operation:'claim',entity:{membershipId:MEMBER}}});}return reply({...projection(),membership:member()});}});assert.equal(second.ui.getView().pending.attemptId,original);await second.ui.recover();assert.equal(second.calls.filter(c=>c.operation==='claim').length,0);assert.equal(second.ui.getView().pending,null);assert.match(second.ui.render(),/original membership change was confirmed/);
});

test('a missing restored claim receipt asks for the original private code and new explicit consent',async()=>{
 const storage=memory();storage.setItem('lumo-consumer-rewards-pending-v1:user-a',JSON.stringify({operation:'claim',attemptId:'claim-original-12345'}));const f=setup({storage,api:async()=>reply({...projection(),memberships:[],mutationReceipt:{found:false}})});await f.ui.recover();assert.equal(f.ui.getView().reentry,true);assert.match(f.ui.render(),/Check linking code/);assert.match(f.ui.render(),/same details/);assert.equal(f.calls.filter(c=>c.operation==='claim').length,0);
});

test('account changes fence old asynchronous membership responses and cannot reveal or claim another user marker',async()=>{
 let finish;const f=setup({api:()=>new Promise(resolve=>{finish=resolve;})});const pending=f.ui.refresh();f.setUser('user-b');assert.doesNotMatch(f.ui.render(),/Ama’s Kitchen/);finish(reply(projection()));await pending;assert.doesNotMatch(f.ui.render(),/Ama’s Kitchen|Kitchen Regulars/);assert.equal(f.ui.getView().loyalty,null);
 f.storage.setItem('lumo-consumer-rewards-pending-v1:user-a',JSON.stringify({operation:'claim',attemptId:'private-attempt-12345'}));assert.equal(f.ui.getView().pending,null);
});

test('leaving during a read never strands the next visit in a perpetual loading state',async()=>{
 let finish;const f=setup({api:()=>new Promise(resolve=>{finish=resolve;})});const pending=f.ui.refresh();f.ui.leave();assert.equal(f.ui.getView().status,'idle');finish(reply(projection()));await pending;assert.equal(f.ui.getView().loyalty,null);assert.equal(f.ui.getView().status,'idle');
});

test('expired, used and inactive rewards do not start payment; an available discount delegates exact membership and reward',async()=>{
 const d=projection();d.memberships[0].rewards.push({id:'expired-a',type:'discount',value:500,state:'available',expiresAt:'2026-11-01T12:00:00Z'});const f=setup({data:d});await loadMember(f);await f.ui.handleClick(control('use',{rewardId:'expired-a'}));assert.equal(f.payments.length,0);await f.ui.handleClick(control('use',{rewardId:'reward-a'}));assert.equal(f.payments.length,1);assert.equal(f.payments[0].membership.id,MEMBER);assert.equal(f.payments[0].reward.id,'reward-a');assert.equal(f.payments[0].shopId,SHOP);assert.equal(f.calls.filter(c=>c.operation==='prepare').length,0);
});

test('standalone item rewards only show the membership card and never authorize fulfilment or a zero-payment',async()=>{
 const f=setup();await loadMember(f);assert.match(f.ui.render(),/Show my card/);await f.ui.handleClick('show-code');assert.equal(f.payments.length,0);assert.equal(f.calls.filter(c=>['fulfilItem','prepare'].includes(c.operation)).length,0);assert.match(f.ui.render(),/shop team/);
});

test('held reward collections expose the original request and never substitute a new prepared collection',async()=>{
 const d=projection();d.memberships[0].collections=[{requestId:'request-original',shopId:SHOP,state:'held',grossAmount:2500,discount:500,amount:2000,expiresAt:'2026-11-17T12:15:00Z'}];const f=setup({data:d});await loadMember(f);assert.match(f.ui.render(),/GH₵20\.00 to collect/);assert.match(f.ui.render(),/Continue original payment/);await f.ui.handleClick(control('resume',{requestId:'request-original'}));assert.equal(f.resumes.length,1);assert.equal(f.resumes[0].collection.requestId,'request-original');assert.equal(f.calls.filter(c=>c.operation==='prepare').length,0);
});

test('unknown cancellation preserves only request identity and recovers the original cancellation after reload',async()=>{
 const d=projection();d.memberships[0].collections=[{requestId:'request-original',shopId:SHOP,state:'held',grossAmount:2500,discount:500,amount:2000}];const f=setup({data:d,api:async(op,payload)=>{if(op==='cancel')throw Error('Response interrupted');return reply({...structuredClone(d),membership:op==='detail'?structuredClone(d.memberships[0]):null});}});await loadMember(f);await f.ui.handleClick(control('cancel-open',{requestId:'request-original'}));assert.match(f.ui.render(),/Cancel this request/);await f.ui.handleSubmit(form('cancel'));assert.equal(f.ui.getView().pending.operation,'cancel');const marker=[...f.storage.values.values()].join('');assert.match(marker,/request-original/);assert.doesNotMatch(marker,/grossAmount|claimCode|Ama Example/);f.ui.reset();let cancel;const recovered=setup({storage:f.storage,api:async(op,payload,options)=>{if(op==='recover')return reply({...projection(),membership:member(),mutationReceipt:{found:false}});if(op==='cancel'){cancel={payload,options};return reply({...projection(),membership:member()});}return reply({...projection(),membership:member()});}});await recovered.ui.recover();assert.deepEqual(cancel.payload,{membershipId:MEMBER,requestId:'request-original'});assert.equal(recovered.ui.getView().pending,null);
});

test('failed fresh reads retain owned records and clearly report connection failure without fake replacements',async()=>{
 let fail=false;const f=setup({api:async()=>{if(fail)throw Error('Connection unavailable');return reply(projection());}});await f.ui.refresh();fail=true;await f.ui.refresh();assert.match(f.ui.render(),/Connection unavailable/);assert.match(f.ui.render(),/Kitchen Regulars/);assert.doesNotMatch(f.ui.render(),/Sample Coffee|demo member/);
});

test('copy failure gives a truthful card fallback rather than claiming a missing clipboard succeeded',async()=>{
 const f=setup({extra:{copyText:async()=>{throw Error('Clipboard denied');}}});await loadMember(f);await f.ui.handleClick('copy-code');assert.match(f.ui.render(),/Copy is unavailable/);assert.doesNotMatch(f.ui.render(),/Membership code copied/);
});

test('merchant strings and membership fields are escaped without changing money or reward authority',async()=>{
 const d=projection();d.memberships[0].merchantName='<img src=x onerror=alert(1)>';d.memberships[0].programme.name='Bad <script>alert(1)</script>';const f=setup({data:d});await loadMember(f);const html=f.ui.render();assert.doesNotMatch(html,/<script>|<img src=x/);assert.match(html,/&lt;script&gt;/);assert.equal(f.payments.length,0);
});

test('the scanner entry retains a private code only in RAM and places no token in route or state',async()=>{
 const storage=memory(),routes=[],calls=[],state={wallet:10000},shared={user:{id:'user-a'},authVersion:1,recoveryScope:'user-a-scope',signedIn:true,loyalty:async(op,payload)=>{calls.push({op,payload});return reply({...projection(),programme:program(),memberships:[]});}};const ctx={connected:true,shared,state,go:route=>routes.push(structuredClone(route))};const pending=openConsumerRewardClaim(ctx,TOKEN);assert.deepEqual(routes,[{section:'pay',page:'rewards'}]);await pending;const html=renderConsumerRewards(ctx,{section:'pay',page:'rewards'});assert.match(html,/Your existing terms/);assert.doesNotMatch(html,new RegExp(TOKEN));assert.deepEqual(state,{wallet:10000});assert.doesNotMatch(JSON.stringify(routes),new RegExp(TOKEN));assert.deepEqual(calls,[{op:'programme',payload:{claimCode:TOKEN}}]);resetConsumerRewards(ctx);
});


test('the recent activity view keeps the server newest-first order and limits the newest thirty records',async()=>{
 const d=projection();d.memberships[0].history=Array.from({length:45},(_,n)=>({id:'event-'+n,type:'earn',units:1,shopName:'Shop marker '+n,createdAt:new Date(now-n*86400000).toISOString()}));const f=setup({data:d});await loadMember(f);const html=f.ui.render();assert.match(html,/Shop marker 0 ·/);assert.match(html,/Shop marker 29 ·/);assert.doesNotMatch(html,/Shop marker 30 ·|Shop marker 44 ·/);assert.ok(html.indexOf('Shop marker 0 ·')<html.indexOf('Shop marker 29 ·'));
});

test('inactive membership cannot start a new loyalty payment even from a stale reward action',async()=>{
 const d=projection();d.memberships[0].active=false;const f=setup({data:d});await loadMember(f);await f.ui.handleClick(control('use',{rewardId:'reward-a'}));await f.ui.handleClick('pay');assert.equal(f.payments.length,0);assert.match(f.ui.render(),/pay the shop normally through Campus Pay/);
});


test('a shop without a programme has a clear discovery exit and no failed join loop',async()=>{
 const f=setup({api:async()=>({ok:false,code:'LOYALTY_NOT_CONFIGURED',message:'No programme'})});f.ui.open({shopId:SHOP});await f.ui.refresh();assert.match(f.ui.render(),/No loyalty programme here yet/);assert.match(f.ui.render(),/Your rewards/);assert.match(f.ui.render(),/Find another campus shop/);assert.doesNotMatch(f.ui.render(),/Join this programme|could not refresh/);assert.equal(f.ui.getView().status,'loaded');
});

test('returning to rewards and refocusing reads current records instead of keeping paid or refunded progress stale',async()=>{
 const priorWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),events=new Map(),root={isConnected:true,addEventListener(){},removeEventListener(){},querySelector(){return null;}};let paidProgress=3,reads=0;const shared={user:{id:'user-a'},authVersion:1,recoveryScope:'scope-a',signedIn:true,loyalty:async()=>{reads++;const d=projection();d.memberships[0].progress=paidProgress;return reply(d);}};const ctx={connected:true,shared,go(){},$:()=>root};Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name,fn)=>{if(events.get(name)===fn)events.delete(name);}}});const flush=()=>new Promise(resolve=>setImmediate(resolve));let dispose;try{renderConsumerRewards(ctx,{});dispose=bindConsumerRewards(ctx,{});await flush();assert.equal(reads,1);assert.match(renderConsumerRewards(ctx,{}),/3 of 5 stamps/);dispose();paidProgress=4;dispose=bindConsumerRewards(ctx,{});await flush();assert.equal(reads,2);assert.match(renderConsumerRewards(ctx,{}),/4 of 5 stamps/);paidProgress=2;events.get('focus')();await flush();assert.equal(reads,3);assert.match(renderConsumerRewards(ctx,{}),/2 of 5 stamps/);}finally{dispose?.();resetConsumerRewards(ctx);if(priorWindow)Object.defineProperty(globalThis,'window',priorWindow);else delete globalThis.window;}
});


test('server programme terms are not repeated by a separate daily-limit paragraph',async()=>{
 const d=projection();d.memberships[0].terms='Collect five purchases. Maximum one qualifying visit per day.';const f=setup({data:d});await loadMember(f);const html=f.ui.render();assert.equal((html.match(/one qualifying visit per day/g)||[]).length,1);assert.doesNotMatch(html,/At most one qualifying visit per day/);
});

test('incomplete programme terms cannot produce an enabled enrollment or a join mutation',async()=>{
 const f=setup({api:async()=>reply({...projection(),programme:{...program(),terms:''},memberships:[]})});f.ui.open({shopId:SHOP});await f.ui.refresh();assert.match(f.ui.render(),/Programme terms are unavailable/);assert.doesNotMatch(f.ui.render(),/Join this programme/);await f.ui.handleSubmit(form('join',{membershipConsent:true}));assert.equal(f.calls.filter(c=>c.operation==='join').length,0);
});

test('a paid-or-processing cancellation rejection does not trap a definitively rejected cancellation as unknown',async()=>{
 const d=projection();d.memberships[0].collections=[{requestId:'request-original',shopId:SHOP,state:'held',grossAmount:2500,discount:500,amount:2000}];const f=setup({data:d,api:async op=>op==='cancel'?{ok:false,code:'REQUEST_PROCESSING',message:'The original payment is confirmed or still being checked.'}:reply({...structuredClone(d),membership:op==='detail'?structuredClone(d.memberships[0]):null})});await loadMember(f);await f.ui.handleClick(control('cancel-open',{requestId:'request-original'}));await f.ui.handleSubmit(form('cancel'));assert.equal(f.ui.getView().pending,null);assert.match(f.ui.render(),/confirmed or still being checked/);
});


test('returned-purchase negative progress is disclosed instead of pretending the next reward starts at zero',async()=>{
 const d=projection();d.memberships[0].progress=-1;const f=setup({data:d});await f.ui.refresh();assert.match(f.ui.render(),/-1 of 5 stamps/);assert.match(f.ui.render(),/A return adjusted your programme progress/);assert.match(f.ui.render(),/aria-valuenow="0"/);assert.equal(f.payments.length,0);
});


test('closed accounts retain readable progress and cards while all membership and payment mutations are disabled',async()=>{
 const d=projection();d.memberships[0].collections=[{requestId:'request-original',shopId:SHOP,state:'held',grossAmount:2500,discount:500,amount:2000}];const f=setup({data:d,extra:{isReadOnly:()=>true}});await loadMember(f);const html=f.ui.render();assert.match(html,/Your account is closed/);assert.match(html,/3 of 5 stamps/);assert.match(html,/Your membership card/);assert.doesNotMatch(html,/>Use reward</);assert.match(html,/data-rewards-action="pay" disabled/);await f.ui.handleClick(control('use',{rewardId:'reward-a'}));await f.ui.handleClick(control('resume',{requestId:'request-original'}));await f.ui.handleClick('claim');await f.ui.checkClaimCode(TOKEN);await f.ui.handleSubmit(form('join',{membershipConsent:true}));assert.equal(f.payments.length,0);assert.equal(f.resumes.length,0);assert.equal(f.calls.filter(c=>['join','claim','prepare','cancel','programme'].includes(c.operation)).length,0);
});

test('a closed account can check a pending receipt without resubmitting a previously unknown mutation',async()=>{
 const storage=memory();storage.setItem('lumo-consumer-rewards-pending-v1:user-a',JSON.stringify({operation:'cancel',attemptId:'cancel-original-12345',membershipId:MEMBER,requestId:'request-original'}));const f=setup({storage,extra:{isReadOnly:()=>true},api:async()=>reply({...projection(),membership:member(),mutationReceipt:{found:false}})});await f.ui.recover();assert.deepEqual(f.calls.map(c=>c.operation),['recover']);assert.equal(f.ui.getView().pending.operation,'cancel');assert.match(f.ui.render(),/no retry was sent/);
});

test('actual consumer loyalty projections drive join, earned reward, held request, payment and refund views',async()=>{
 const {consumerLoyaltyFixture}=await import('../backend/tests/fixtures/consumer-loyalty-fixture.mjs');const backend=await consumerLoyaltyFixture(),student=backend.actor('ui_student');let prepared;
 const f=setup({extra:{getUserId:()=>student.identity.userId,getIdentity:()=>student.identity.userId,api:(op,payload,options={})=>backend.call(student,op,payload,options.attemptId),onUseReward:async({membership,reward,shopId})=>{prepared=await backend.call(student,'prepare',{membershipId:membership.id,shopId,grossAmount:2500,rewardId:reward.id},'ui-discount-original-12345');return prepared.ok;}}});
 f.ui.open({shopId:backend.owner.shopId});await f.ui.refresh();assert.match(f.ui.render(),/Join this programme/);await f.ui.handleSubmit(form('join',{membershipConsent:true}));assert.match(f.ui.render(),/Your membership card/);const membershipId=f.ui.getView().loyalty.membership.id;
 backend.pay(student);await f.ui.refresh({membershipId});assert.match(f.ui.render(),/1 of 2 stamps/);const funding=backend.pay(student);await f.ui.refresh({membershipId});const earned=f.ui.getView().loyalty.membership.rewards.find(r=>r.state==='available');assert.ok(earned);await f.ui.handleClick(control('use',{rewardId:earned.id}));assert.equal(prepared.entity.amount,2000);await f.ui.refresh({membershipId});assert.match(f.ui.render(),/Reserved for a payment/);assert.match(f.ui.render(),/Continue original payment/);backend.pay(student,{requestId:prepared.entity.requestId,amount:prepared.entity.amount});await f.ui.refresh({membershipId});assert.equal(f.ui.getView().loyalty.membership.rewards.find(r=>r.id===earned.id).state,'redeemed');assert.doesNotMatch(f.ui.render(),/Continue original payment/);backend.refund(funding);await f.ui.refresh({membershipId});assert.match(f.ui.render(),/-1 of 2 stamps/);assert.match(f.ui.render(),/A return adjusted your programme progress/);assert.equal(f.ui.getView().loyalty.membership.rewards.find(r=>r.id===earned.id).state,'redeemed');
});

test('recovery keeps its original marker when the receipt belongs to another operation or request',async()=>{
 for(const mismatch of ['operation','request']){const storage=memory();const marker={operation:'cancel',attemptId:'cancel-original-987654',membershipId:MEMBER,requestId:'request-original'};storage.setItem('lumo-consumer-rewards-pending-v1:user-a',JSON.stringify(marker));const f=setup({storage,api:async()=>reply({...projection(),membership:member(),mutationReceipt:{found:true,operation:mismatch==='operation'?'join':'cancel',entity:{membershipId:MEMBER,requestId:mismatch==='request'?'request-other':'request-original'}}})});assert.equal(await f.ui.recover(),false);assert.equal(f.ui.getView().pending.attemptId,marker.attemptId);assert.match(f.ui.render(),/does not match your original request/);assert.deepEqual(f.calls.map(c=>c.operation),['recover']);}
});
