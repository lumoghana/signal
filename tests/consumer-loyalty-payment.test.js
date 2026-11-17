import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState} from '../dist/js/model.js';
import {createApprovedService} from '../dist/js/approved-service.js';
import {startLoyaltyPayment,resumeLoyaltyCollection,prepareConsumerLoyaltyPayment,openSharedMerchant,renderPayments,bindPayments,hasUnresolvedPayment} from '../dist/js/payments.js';
import {savePaymentRecovery,loadPaymentRecovery} from '../dist/js/payment-recovery.js';
import {routeKey,safeRoute,parentRoute,routeLabel} from '../dist/js/navigation.js';
import {bindQrScreen} from '../dist/js/qr-screen.js';

const SHOP='11111111-1111-4111-8111-111111111111',REQUEST='22222222-2222-4222-8222-222222222222';
const MEMBER='membership-one',REWARD='reward-one',OWNER='consumer-one';
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};};
const response=value=>({ok:true,status:200,json:async()=>value});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const shopQuote=request=>({ok:true,merchant:{name:'Campus Kitchen'},shop:{id:SHOP,name:'Night Market',code:'LUM100001',area:'Legon'},...(request?{request,loyalty:{membershipId:MEMBER,grossAmount:2500,discount:500,amount:2000,rewardId:REWARD}}:{})});
const request=()=>({id:REQUEST,shopId:SHOP,amount:2000,status:'open',expiresAt:new Date(Date.now()+600000).toISOString()});
const entity=()=>({id:REQUEST,requestId:REQUEST,collectionId:'collection-one',membershipId:MEMBER,shopId:SHOP,amount:2000,grossAmount:2500,discount:500,rewardId:REWARD,request:request()});
function harness(){
 const state=createEmptyState();state.onboardingDone=true;state.wallet=100000;state.buffer=0;
 const nodes=new Map(),handlers=new Map(),calls=[],messages=[],routes=[],authorizations=[],storage=memory();let route={section:'pay',page:'amount'};
 const payment={rail:'merchant',recipient:{id:SHOP,name:'Campus Kitchen',emoji:'C'},shopId:SHOP,shopName:'Night Market',shopCode:'LUM100001',shopArea:'Legon',amount:2500,amountText:'25.00',category:'Food',note:'Lunch',idempotencyKey:'payment-original-id',loyaltyIntent:{membershipId:MEMBER,rewardId:REWARD},loyaltyRewardName:'Five cedis off'};
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{isConnected:true,value:selector==='#payment-amount'?'25.00':'',textContent:'',hidden:true,disabled:false,addEventListener(event,fn){handlers.set(selector+':'+event,fn);},removeEventListener(){}});return nodes.get(selector);};
 const ctx={connected:true,state,draft:{payment},get route(){return route;},shared:{authVersion:1,user:{id:OWNER},signedIn:true,loyalty:async(operation,payload,options)=>{calls.push({operation,payload:structuredClone(payload),options});return {ok:true,entity:entity()};},quote:async values=>{calls.push({quote:values});return shopQuote(request());}},$(selector){return ['#payment-amount','#payment-error'].includes(selector)?node(selector):null;},$$(selector){return selector.startsWith('[data-action=')?[node(selector)]:[];},saveDraft(){},savePaymentRecovery:d=>savePaymentRecovery(OWNER,d,storage),setCapture(){},refresh(){},toast:m=>messages.push(m),closeSheet(){},go(next){routes.push(next);route=next;},finish(next){routes.push(next);route=next;},auth(options){authorizations.push(options);},actAsync:async(type,payload)=>{calls.push({type,payload:structuredClone(payload)});return {ok:true,transaction:{id:'receipt-one',type:'payment',status:'success',amount:payload.amount,shopId:SHOP}};},sheet(html,bind){ctx.sheetHtml=html;ctx.sheetControls=new Map();bind({querySelector(selector){if(!ctx.sheetControls.has(selector))ctx.sheetControls.set(selector,{});return ctx.sheetControls.get(selector);}});}};
 return {ctx,payment,calls,messages,routes,authorizations,storage,nodes,handlers,node,bind(){handlers.clear();return bindPayments(ctx,route);},async click(action){const fn=handlers.get(`[data-action="${action}"]:click`);assert.ok(fn,action+' bound');await fn();await tick();}};
}

test('reward preparation makes one canonical positive net request before review, then preserves normal authorisation and exact money payload',async()=>{
 const h=harness();h.bind();await h.click('pay-amount-next');
 assert.equal(h.payment.amount,2000);assert.equal(h.payment.requestId,REQUEST);assert.equal(h.ctx.route.page,'review');assert.equal(h.authorizations.length,0);assert.equal(h.ctx.state.wallet,100000);
 const prep=h.calls.find(x=>x.operation==='prepare');assert.deepEqual(prep.payload,{membershipId:MEMBER,shopId:SHOP,grossAmount:2500,rewardId:REWARD,description:'Lunch'});assert.match(prep.options.attemptId,/^loyalty-prepare-/);assert.deepEqual(h.calls.find(x=>x.quote).quote,{shopId:SHOP,requestId:REQUEST});
 const html=renderPayments(h.ctx,h.ctx.route);assert.match(html,/Purchase before reward/);assert.match(html,/GH₵25\.00/);assert.match(html,/−GH₵5\.00/);assert.match(html,/GH₵20\.00/);
 h.bind();await h.click('pay-review-next');assert.equal(h.authorizations.length,1);await h.authorizations[0].onSuccess();
 const sent=h.calls.find(x=>x.type==='payment').payload;assert.equal(sent.requestId,REQUEST);assert.equal(sent.amount,2000);for(const key of ['loyaltyIntent','loyaltyPreparation','loyaltyApplied','loyaltyRewardName'])assert.equal(sent[key],undefined,key+' is UI metadata');assert.equal(h.payment.completed,true);
});

test('merchant-prepared fixed QR explains its existing discount, and changed server reward details cannot reach PIN',async()=>{
 const h=harness();h.ctx.draft.payment=null;h.ctx.shared.quote=async()=>({...shopQuote(request()),loyalty:{grossAmount:2500,discount:500,amount:2000}});await openSharedMerchant(h.ctx,{shopId:SHOP,requestId:REQUEST});const d=h.ctx.draft.payment;assert.deepEqual(d.loyaltyApplied,{grossAmount:2500,discount:500});assert.match(renderPayments(h.ctx,h.ctx.route),/−GH₵5\.00/);assert.equal(d.requestId,REQUEST);
 h.ctx.shared.quote=async()=>({...shopQuote(request()),loyalty:{grossAmount:2600,discount:600,amount:2000}});h.bind();await h.click('pay-review-next');assert.equal(h.authorizations.length,0);assert.match(h.node('#payment-error').textContent,/reward details changed/);assert.equal(h.ctx.state.wallet,100000);
});

test('loyalty request description honours its 100-character contract without truncating the normal payment note',async()=>{
 const h=harness();h.payment.note='A'.repeat(140);await prepareConsumerLoyaltyPayment(h.ctx,h.payment);assert.equal(h.calls.find(x=>x.operation==='prepare').payload.description.length,100);assert.equal(h.payment.note.length,140);assert.equal(h.payment.amount,2000);
});

test('a lost preparation response blocks every replacement and recovers the exact original request without a second prepare',async()=>{
 const h=harness();let lost=true;h.ctx.shared.loyalty=async(operation,payload,options)=>{h.calls.push({operation,payload:structuredClone(payload),options});if(operation==='prepare'&&lost)return {ok:false,unknown:true,message:'Response interrupted'};if(operation==='recover')return {ok:true,loyalty:{mutationReceipt:{found:true,operation:'prepare',entity:entity()}}};return {ok:true,entity:entity()};};
 await prepareConsumerLoyaltyPayment(h.ctx,h.payment);assert.equal(hasUnresolvedPayment(h.payment),true);assert.match(renderPayments(h.ctx,h.ctx.route),/reward may already be reserved/);
 const before=h.calls.length;await openSharedMerchant(h.ctx,{shopId:SHOP});assert.equal(h.calls.length,before);assert.equal(h.ctx.draft.payment,h.payment);
 lost=false;const original=h.payment.loyaltyPreparation.attemptId;h.bind();await h.click('pay-check-loyalty');assert.equal(h.payment.requestId,REQUEST);assert.equal(h.payment.amount,2000);assert.equal(h.calls.filter(x=>x.operation==='prepare').length,1);assert.deepEqual(h.calls.find(x=>x.operation==='recover').payload,{attemptId:original});assert.equal(hasUnresolvedPayment(h.payment),false);
});

test('unknown preparation survives fresh-session recovery for its account, never renders or replays for a different account',async()=>{
 const h=harness();h.ctx.shared.loyalty=async()=>({ok:false,unknown:true});await prepareConsumerLoyaltyPayment(h.ctx,h.payment);
 const restored=loadPaymentRecovery(OWNER,h.storage);assert.equal(restored.loyaltyPreparation.attemptId,h.payment.loyaltyPreparation.attemptId);assert.equal(loadPaymentRecovery('different-owner',h.storage),null);assert.doesNotMatch([...h.storage.values.values()].join(''),/pin|password|claimCode/);
 h.ctx.draft.payment=restored;h.ctx.shared.user={id:'another-owner'};assert.doesNotMatch(renderPayments(h.ctx,h.ctx.route),/Campus Kitchen|25\.00|reward-one/);const before=h.calls.length;await prepareConsumerLoyaltyPayment(h.ctx,restored);assert.equal(h.calls.length,before);
 h.ctx.shared.user={id:OWNER};h.ctx.shared.authVersion++;h.ctx.shared.loyalty=async(operation,payload)=>{h.calls.push({operation,payload});return {ok:true,loyalty:{mutationReceipt:{found:true,operation:'prepare',entity:entity()}}};};await prepareConsumerLoyaltyPayment(h.ctx,restored);assert.equal(h.calls.find(x=>x.operation==='recover').payload.attemptId,restored.loyaltyPreparation.attemptId);assert.equal(restored.amount,2000);
});

test('a preparation without durable original-reference saving sends no API request',async()=>{
 const h=harness();h.ctx.savePaymentRecovery=()=>false;const result=await prepareConsumerLoyaltyPayment(h.ctx,h.payment);assert.equal(result.ok,false);assert.equal(h.calls.length,0);assert.equal(h.payment.loyaltyPreparation,undefined);assert.match(h.messages.at(-1),/No new request was sent/);
});

test('mismatched server reward details stay unresolved and cannot enter authorisation or change the debit amount',async()=>{
 for(const change of [{amount:1999},{discount:700},{membershipId:'another-member'},{rewardId:'another-reward'},{grossAmount:5000}]){
  const h=harness();h.ctx.shared.loyalty=async()=>({ok:true,entity:{...entity(),...change}});await prepareConsumerLoyaltyPayment(h.ctx,h.payment);assert.equal(hasUnresolvedPayment(h.payment),true);assert.equal(h.payment.requestId,undefined);assert.equal(h.payment.amount,2500);assert.equal(h.authorizations.length,0);assert.equal(h.ctx.state.wallet,100000);
 }
});

test('an interrupted cancellation retains its exact request and reference until the same cancellation is confirmed',async()=>{
 const h=harness();let cancelCalls=0;h.ctx.shared.loyalty=async(operation,payload,options)=>{h.calls.push({operation,payload,options});if(operation==='recover')return {ok:true,loyalty:{mutationReceipt:{found:true,operation:'prepare',entity:entity()}}};if(operation==='cancel')return ++cancelCalls===1?{ok:false,unknown:true,message:'Cancel response interrupted'}:{ok:true,entity:{...entity(),request:{...request(),status:'cancelled'}}};return {ok:false,unknown:true};};
 await prepareConsumerLoyaltyPayment(h.ctx,h.payment);await prepareConsumerLoyaltyPayment(h.ctx,h.payment,{cancel:true});assert.equal(hasUnresolvedPayment(h.payment),true);assert.match(renderPayments(h.ctx,h.ctx.route),/cancellation result/);
 const first=h.calls.find(x=>x.operation==='cancel');await prepareConsumerLoyaltyPayment(h.ctx,h.payment);const next=h.calls.filter(x=>x.operation==='cancel')[1];assert.deepEqual(next,first);assert.equal(h.ctx.draft.payment,null);assert.equal(h.ctx.route.page,'rewards');assert.equal(h.ctx.state.wallet,100000);assert.equal(h.calls.some(x=>x.type==='payment'),false);
});

test('a mismatched or non-terminal cancellation response keeps the original reserved-request recovery marker',async()=>{
 for(const bad of [{},{...entity(),request:{...request(),status:'open'}},{...entity(),id:SHOP,requestId:SHOP,request:{...request(),id:SHOP,status:'cancelled'}},{...entity(),membershipId:'another-member',request:{...request(),status:'cancelled'}}]){
  const h=harness();h.ctx.shared.loyalty=async(operation)=>operation==='recover'?{ok:true,loyalty:{mutationReceipt:{found:true,operation:'prepare',entity:entity()}}}:operation==='cancel'?{ok:true,entity:bad}:{ok:false,unknown:true};await prepareConsumerLoyaltyPayment(h.ctx,h.payment);const original=h.payment.loyaltyPreparation.attemptId;await prepareConsumerLoyaltyPayment(h.ctx,h.payment,{cancel:true});assert.equal(h.ctx.draft.payment,h.payment);assert.equal(hasUnresolvedPayment(h.payment),true);assert.equal(h.payment.loyaltyPreparation.attemptId,original);assert.equal(h.ctx.state.wallet,100000);
 }
});

test('same-reference preparation completion after account replacement cannot install or navigate private details',async()=>{
 const h=harness();let finish;h.ctx.shared.loyalty=()=>new Promise(resolve=>{finish=resolve});const operation=prepareConsumerLoyaltyPayment(h.ctx,h.payment);await tick();h.ctx.shared.user={id:'other-owner'};h.ctx.shared.authVersion++;const replacement={rail:'lumo',amount:3000};h.ctx.draft.payment=replacement;finish({ok:true,entity:entity()});await operation;assert.equal(h.ctx.draft.payment,replacement);assert.equal(h.routes.length,0);assert.ok(loadPaymentRecovery(OWNER,h.storage));
});

test('an existing fixed cashier QR cannot be converted to another discounted request',async()=>{
 const h=harness();h.ctx.draft.payment=null;const result=await openSharedMerchant(h.ctx,{shopId:SHOP,requestId:REQUEST},{loyaltyIntent:{membershipId:MEMBER,rewardId:REWARD}});assert.equal(result.ok,false);assert.equal(h.ctx.draft.payment,null);assert.equal(h.calls.filter(x=>x.operation==='prepare').length,0);assert.match(h.messages.at(-1),/already has an exact amount/);
});

test('choosing a reward preserves the same fresh shop amount and note, while a current fixed request cannot be replaced',async()=>{
 const h=harness();h.ctx.shared.quote=async values=>{h.calls.push({quote:values});return shopQuote();};h.ctx.go({section:'pay',page:'rewards',shopId:SHOP});
 const selected=await startLoyaltyPayment(h.ctx,{membership:{id:MEMBER},reward:{id:REWARD,type:'discount',state:'available',name:'Five off'},shopId:SHOP});assert.equal(selected.ok,true);assert.equal(h.ctx.draft.payment,h.payment);assert.equal(h.payment.amount,2500);assert.equal(h.payment.note,'Lunch');assert.equal(h.ctx.route.page,'amount');assert.equal(h.calls.some(x=>x.operation==='prepare'),false);
 h.payment.requestId=REQUEST;h.ctx.go({section:'pay',page:'rewards',shopId:SHOP});const before=h.calls.length;const blocked=await startLoyaltyPayment(h.ctx,{membership:{id:MEMBER},reward:{id:REWARD,type:'discount',state:'available'},shopId:SHOP});assert.equal(blocked.ok,false);assert.equal(h.calls.length,before);assert.equal(h.payment.requestId,REQUEST);assert.match(h.messages.at(-1),/already has an exact request/);
});

test('a fresh owned terminal request permits the next purchase, while missing, open or foreign proofs cannot release the fixed-request guard',async()=>{
 for(const mode of ['released','paid','missing','open','foreign','malformed']){
  const h=harness();h.payment.requestId=REQUEST;h.payment.loyaltyApplied={membershipId:MEMBER,grossAmount:2500,discount:500,rewardId:REWARD};h.ctx.shared.quote=async()=>shopQuote();h.ctx.go({section:'pay',page:'rewards'});const c={requestId:REQUEST,shopId:SHOP,membershipId:MEMBER,state:mode==='paid'?'paid':'released',request:{id:REQUEST,status:mode==='paid'?'paid':mode==='open'?'open':'cancelled'}};const membership={id:mode==='foreign'?'other-member':MEMBER,collections:mode==='malformed'?{}:mode==='missing'?[]:[c]};const result=await startLoyaltyPayment(h.ctx,{membership,reward:{id:'new-reward',type:'discount',state:'available'},shopId:SHOP});
  if(['released','paid'].includes(mode)){assert.equal(result.ok,true,mode);assert.notEqual(h.ctx.draft.payment,h.payment);assert.equal(h.ctx.draft.payment.requestId,undefined);assert.equal(h.ctx.draft.payment.amount,0);assert.equal(h.ctx.draft.payment.loyaltyIntent.rewardId,'new-reward');}else{assert.equal(result.ok,false,mode);assert.equal(h.ctx.draft.payment,h.payment);assert.equal(h.payment.requestId,REQUEST);}
 }
});

test('choosing normal pay removes only an unsent reward choice, and closed accounts cannot start or resume reward payments',async()=>{
 const h=harness();h.ctx.shared.quote=async()=>shopQuote();h.ctx.go({section:'pay',page:'rewards'});await startLoyaltyPayment(h.ctx,{membership:{id:MEMBER},shopId:SHOP});assert.equal(h.payment.loyaltyIntent,undefined);assert.equal(h.payment.loyaltyRewardName,undefined);assert.equal(h.payment.amount,2500);
 for(const where of ['state','shared']){const blocked=harness();if(where==='state')blocked.ctx.state.account.status='closed';else blocked.ctx.shared.account={status:'closed'};const before=blocked.ctx.draft.payment;await startLoyaltyPayment(blocked.ctx,{membership:{id:MEMBER},reward:{id:REWARD,type:'discount',state:'available'},shopId:SHOP});await resumeLoyaltyCollection(blocked.ctx,{membership:{id:MEMBER},collection:{...entity(),state:'held'}});await prepareConsumerLoyaltyPayment(blocked.ctx,before);assert.equal(blocked.calls.length,0);assert.equal(blocked.ctx.draft.payment,before);assert.equal(blocked.routes.length,0);assert.match(blocked.messages.at(-1),/closed/);}
});

test('continuing an owned held collection uses its exact request, quote and amount without another hold',async()=>{
 const h=harness();h.ctx.draft.payment=null;await resumeLoyaltyCollection(h.ctx,{membership:{id:MEMBER},collection:{...entity(),state:'held'}});assert.equal(h.ctx.draft.payment.requestId,REQUEST);assert.equal(h.ctx.draft.payment.amount,2000);assert.deepEqual(h.ctx.draft.payment.loyaltyApplied,{membershipId:MEMBER,rewardId:REWARD,grossAmount:2500,discount:500});assert.equal(h.calls.filter(x=>x.operation).length,0);assert.equal(h.authorizations.length,0);
});

test('loyalty transport requires a signed-in owner and exact stable mutation reference; it cannot hydrate session, wallet or capabilities',async()=>{
 const storage=memory(),calls=[],snapshots=[],session={access_token:'owner-token',refresh_token:'owner-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:OWNER}},locks={request:async(name,options,fn)=>fn()};
 const service=createApprovedService({storage,modeStorage:memory(),lockManager:locks,onSnapshot:x=>snapshots.push(x),fetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push({body,headers:options.headers});return response(body.action==='login'?{ok:true,session,state:{wallet:5000},account:{userId:OWNER,handle:'owner.student'}}:{ok:true,loyalty:{memberships:[]},session:{...session,user:{id:'attacker'}},state:{wallet:900000},account:{userId:'attacker'},capabilities:{forged:true}});}});
 await service.login('owner.student','transient-password');const before=calls.length;await service.loyalty('prepare',{membershipId:MEMBER});assert.equal(calls.length,before);await service.loyalty('join',{pin:'1234'},{attemptId:'join-original-reference'});assert.equal(calls.length,before);
 const result=await service.loyalty('list',{});assert.equal(result.ok,true);assert.deepEqual(calls.at(-1).body,{action:'loyalty',operation:'list',payload:{}});assert.equal(calls.at(-1).headers.Authorization,'Bearer owner-token');assert.deepEqual(snapshots,[{wallet:5000}]);assert.equal(service.user.id,OWNER);assert.equal(service.account.userId,OWNER);assert.deepEqual(service.capabilities,{});
 await service.loyalty('prepare',{membershipId:MEMBER,shopId:SHOP,grossAmount:2500,rewardId:REWARD},{attemptId:'prepare-original-reference'});assert.equal(calls.at(-1).body.attemptId,'prepare-original-reference');assert.equal(calls.at(-1).body.payload.grossAmount,2500);
 service.setSample(true);const sampleBefore=calls.length;const blocked=await service.loyalty('list',{});assert.equal(blocked.ok,false);assert.equal(calls.length,sampleBefore);service.dispose();
});

test('reward routes retain membership identity, normal back navigation and no payment mutation',()=>{
 const s=createEmptyState();s.onboardingDone=true;const a={section:'pay',page:'rewards',membershipId:'one'},b={...a,membershipId:'two'};assert.notEqual(routeKey(a),routeKey(b));assert.equal(safeRoute(a,s,{}).page,'rewards');assert.equal(routeLabel(a),'Your rewards');assert.deepEqual(parentRoute(a,s,{}),{section:'pay',page:'home',hubTab:'campus'});
});

test('plain one-time claim QR stops capture and hands only RAM input to rewards, never payment or navigation metadata',async()=>{
 class Element extends EventTarget{constructor(){super();this.isConnected=true;this.hidden=false;this.classList={toggle(){},remove(){}};}}
 const nodes=new Map(),root=new Element(),doc=new Element();root.querySelector=selector=>{if(!nodes.has(selector))nodes.set(selector,new Element());return nodes.get(selector);};root.querySelectorAll=()=>[];let callbacks,stops=0;const claims=[],payments=[],routes=[];
 const ctx={connected:true,$:()=>root,openRewardClaim:raw=>claims.push(raw),openQrMerchant:x=>payments.push(x),openQrPayment:x=>payments.push(x),go:r=>routes.push(r)};const cleanup=bindQrScreen(ctx,{mode:'scan'},{document:doc,createScanner:opts=>{callbacks=opts;return {start:async()=>true,stop(){stops++},dispose(){}};}});await tick();const raw='LC1-'+'A'.repeat(48);assert.equal(callbacks.onCode(raw),true);assert.equal(stops,1);assert.deepEqual(claims,[raw]);assert.equal(payments.length,0);assert.equal(routes.length,0);cleanup();callbacks.onCode(raw);assert.equal(claims.length,1);
});
