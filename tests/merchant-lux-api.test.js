import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusiness} from '../dist/merchant/domain.js';
import {handleMerchantLux,safeMerchantLuxInput} from '../api/merchant-lux.mjs';
const owner='11111111-1111-4111-8111-111111111111';
const token='a.'+Buffer.from(JSON.stringify({sub:owner})).toString('base64url')+'.c';
const merchantToken='b'.repeat(64),now=new Date('2026-11-13T12:00:00Z');
const request={method:'POST',authorization:'Bearer '+token,origin:'https://lumo-merchant-mobile.oness15.chatgpt.site',body:{question:'How much did we collect today?',merchantToken,shopId:null,context:{questions:[]}}};
function snapshot(role='owner'){
 const state=createBusiness({name:'Synthetic Campus Foods',ownerName:'Synthetic Owner',phone:'0240000000',businessType:'Sole trader',destination:'Test',verification:{identity:true,face:true},shop:{name:'Night Market',area:'Night Market',category:'Food',lat:5.65,lng:-.18}},{now:now.toISOString()});state.shops[0].id='night';
 state.business.id='synthetic-business';const user={id:'user-1',businessId:state.business.id,role,shopIds:['night'],active:true};return{ok:true,sandbox:true,state,user,session:{id:'session-1',userId:user.id,businessId:state.business.id,role,shopIds:['night']}};
}
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
const interpretation={task:'collections',confidence:.99,period:'today',shop:null,compareShop:null,reference:null,start:null,end:null};
const provider=content=>response({choices:[{message:{content:JSON.stringify(content||interpretation)}}]});
const options=fetcher=>({fetcher:async(url,init)=>url.includes('/rpc/lumo_lux_reserve')?response({allowed:true}):fetcher(url,init),credential:'synthetic-oidc',now,limiter:new Map()});

test('auth, origin, session and body shape are checked before any inference',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error();};
 for(const r of [{...request,authorization:''},{...request,method:'GET'},{...request,origin:'https://evil.test'},{...request,body:{...request.body,state:{wallet:99999}}},{...request,body:{...request.body,merchantToken:''}},{...request,body:{...request.body,question:'x'.repeat(401)}}])assert.ok((await handleMerchantLux(r,options(fetcher))).status>=400);
 assert.equal(calls,0);
});
test('a consumer token without a valid merchant session cannot reach the model',async()=>{
 let inference=0;const r=await handleMerchantLux(request,options(async url=>{if(url.includes('ai-gateway'))inference++;return response({ok:true,sandbox:true,session:null,user:null,state:null});}));assert.equal(r.status,401);assert.equal(inference,0);
});
test('cashiers and unassigned shop IDs are rejected before inference cost',async()=>{
 for(const [role,shopId]of [['cashier',null],['manager','outside']]){
  let inference=0;const r=await handleMerchantLux({...request,body:{...request.body,shopId}},options(async url=>{if(url.includes('ai-gateway'))inference++;return response(snapshot(role));}));assert.equal(r.status,403);assert.equal(inference,0);
 }
});
test('the model gets only questions and intent slots, never merchant balances, receipts or tokens',async()=>{
 const seen=[];let reads=0;const current=snapshot();current.state.openingBalance=123456;
 const r=await handleMerchantLux(request,options(async(url,init)=>{seen.push({url,body:JSON.parse(init.body)});if(url.includes('ai-gateway'))return provider();reads++;return response(current);}));assert.equal(r.status,200);assert.equal(r.body.mode,'ai');assert.equal(reads,2);
 const prompt=JSON.stringify(seen.find(x=>x.url.includes('ai-gateway')).body.messages);assert.doesNotMatch(prompt,/123456|11111111-1111|session-1|Synthetic Owner|openingBalance|merchantToken/);assert.ok(!prompt.includes(merchantToken));assert.ok(!prompt.includes(token));assert.equal(r.body.owner,owner);assert.equal(r.body.state.business.id,current.state.business.id);assert.equal(seen.some(x=>x.body.type==='SETTLE'||x.body.type==='REFUND'),false);
});
test('figures come from the final authorised snapshot after interpretation',async()=>{
 let reads=0;const initial=snapshot(),fresh=snapshot();fresh.state.openingBalance=25000;const r=await handleMerchantLux({...request,body:{...request.body,question:'Where is our money?'}},options(async url=>url.includes('ai-gateway')?provider({...interpretation,task:'funds',period:null}):response(++reads===1?initial:fresh)));assert.equal(r.status,200);assert.match(JSON.stringify(r.body.answer.stats),/GH₵250.00/);assert.match(r.body.answer.paragraphs.join(' '),/Transfers out are not connected/);
});
test('role changes, business changes and revocation while interpreting suppress the answer',async()=>{
 for(const mutate of [s=>({...s,user:{...s.user,role:'manager'},session:{...s.session,role:'manager'}}),s=>({...s,session:null}),s=>({...s,user:{...s.user,businessId:'other'}})]){
  let reads=0;const r=await handleMerchantLux(request,options(async url=>url.includes('ai-gateway')?provider():response(++reads===1?snapshot():mutate(snapshot()))));assert.equal(r.status,401);assert.equal(r.body.answer,undefined);
 }
});
test('a model cannot invent a reference or executable refund command',async()=>{
 for(const plan of [{...interpretation,task:'refundNow'},{...interpretation,task:'receipt',reference:'secret-reference'}]){
  const r=await handleMerchantLux(request,options(async url=>url.includes('ai-gateway')?provider(plan):response(snapshot())));assert.equal(r.body.mode,'recorded');assert.equal(r.body.reason,'AI_PLAN_REJECTED');assert.equal(r.body.answer.plan.task,'collections');
 }
});
test('provider verification failure uses an honest recorded-money answer',async()=>{
 const r=await handleMerchantLux(request,options(async url=>url.includes('ai-gateway')?response({error:{code:'customer_verification_required'}},403):response(snapshot())));assert.equal(r.body.mode,'recorded');assert.equal(r.body.providerCode,'customer_verification_required');assert.equal(r.body.reason,'AI_VERIFICATION_REQUIRED');assert.equal(r.body.answer.stats.length,3);
});
test('private input and earlier private messages never reach inference',async()=>{
 let calls=0;const r=await handleMerchantLux({...request,body:{...request.body,question:'my PIN is 1234'}},options(async url=>{if(url.includes('ai-gateway'))calls++;return response(snapshot());}));assert.equal(calls,0);assert.equal(r.body.reason,'PRIVATE_INPUT');assert.doesNotMatch(JSON.stringify(r.body),/1234/);
 const input=safeMerchantLuxInput({...request.body,context:{questions:['my password: secret1234','How much today?']}});assert.deepEqual(input.context.questions,['How much today?']);
});
test('shared inference quota failure prevents a provider request',async()=>{
 let inference=0;const r=await handleMerchantLux(request,{credential:'synthetic-oidc',now,limiter:new Map(),fetcher:async url=>{if(url.includes('ai-gateway')){inference++;return provider();}return url.includes('/rpc/')?response({allowed:false,reason:'AI_DAILY_CAP'}):response(snapshot());}});assert.equal(r.body.mode,'recorded');assert.equal(r.body.reason,'AI_DAILY_CAP');assert.equal(inference,0);
});

test('business plan questions use the final shared planning calculation rather than the interpretation response',async()=>{
 const first=snapshot(),fresh=snapshot();first.state.openingBalance=200000;fresh.state.openingBalance=100000;
 for(const s of [first,fresh])s.state.businessPlan={version:1,revision:1,stockReserve:{amount:30000},expenses:[{id:'rent',title:'Next rent',amount:10000,status:'planned',category:'expense',shopId:'night'}],managerShopIds:[]};
 let reads=0;
 const r=await handleMerchantLux({...request,body:{...request.body,question:'How much remains after my business plan?'}},options(async url=>url.includes('ai-gateway')?provider({...interpretation,task:'plan',period:null}):response(++reads===1?first:fresh)));
 assert.equal(r.status,200);assert.equal(r.body.answer.plan.task,'plan');
 assert.equal(r.body.answer.stats.find(row=>row.label==='After plan · estimate').value,'GH₵600.00');
 assert.match(r.body.answer.paragraphs.join(' '),/planning estimate/);assert.equal(r.body.answer.actions[0].page,'business-plan');
});

test('planning permission withdrawn during interpretation suppresses earlier manager planning figures',async()=>{
 const first=snapshot('manager'),fresh=snapshot('manager');
 first.state.businessPlan={version:1,revision:1,scope:'shops',allowedShopIds:['night'],managerShopIds:[],stockReserve:{amount:0},expenses:[{id:'stock',title:'Order',amount:25000,shopId:'night',category:'stock',status:'planned'}]};first.state.businessPlanAccess={canView:true,scope:'shops',allowedShopIds:['night']};
 fresh.state.businessPlanAccess={canView:false,scope:'shops',allowedShopIds:[]};let reads=0;
 const r=await handleMerchantLux({...request,body:{...request.body,question:'What expenses are coming up?'}},options(async url=>url.includes('ai-gateway')?provider({...interpretation,task:'expenses',period:null}):response(++reads===1?first:fresh)));
 assert.equal(r.status,200);assert.equal(r.body.answer.kind,'clarify');assert.equal(r.body.answer.stats.length,0);assert.doesNotMatch(JSON.stringify(r.body.answer),/GH₵250/);
});

test('link and guest provider records remain off the model prompt while final receipt totals stay authoritative',async()=>{
 const initial=snapshot(),fresh=snapshot(),secretLink='d'.repeat(64);
 for(const s of [initial,fresh])s.state.paymentLinks=[{id:'link-order',publicToken:secretLink,requestId:'request-order',shopId:'night',kind:'request',description:'Order 42',amount:2500,status:'open',confirmedCount:0,confirmedAmount:0,pendingCount:1,pendingAmount:2500,guestConfirmedAmount:0,lumoConfirmedAmount:0}];
 fresh.state.paymentLinks[0]={...fresh.state.paymentLinks[0],status:'paid',confirmedCount:1,confirmedAmount:2500,pendingCount:0,pendingAmount:0,guestConfirmedAmount:2500};
 fresh.state.guestCollections=[{id:'guest-order',shopId:'night',linkId:'link-order',providerReference:'provider-private-reference',phoneMasked:'055•••0199',status:'confirmed',amount:2500,providerMode:'sandbox',settlementStatus:'sandbox-posted',createdAt:now.toISOString()}];
 const seen=[];let reads=0;
 const r=await handleMerchantLux({...request,body:{...request.body,question:'Has payment link link-order been paid?'}},options(async(url,init)=>{if(url.includes('ai-gateway')){seen.push(JSON.stringify(JSON.parse(init.body).messages));return provider({...interpretation,task:'links',period:null,reference:'link-order'});}return response(++reads===1?initial:fresh);}));
 assert.equal(r.status,200);assert.equal(r.body.answer.plan.task,'links');assert.equal(r.body.answer.stats.find(row=>row.label==='Linked request · confirmed').value,'GH₵25.00');assert.match(r.body.answer.title,/1 confirmed payment/);
 assert.doesNotMatch(seen.join(' '),/provider-private-reference|055|2500|Order 42/);assert.equal(seen.join(' ').includes(secretLink),false);assert.match(r.body.answer.paragraphs.join(' '),/not live provider settlement/);
});

test('recorded tools still answer new stock and shared-link questions when inference is unavailable',async()=>{
 const current=snapshot();current.state.businessPlan={stockReserve:{amount:30000},expenses:[],managerShopIds:[]};
 for(const [question,task]of [['How much should I keep for stock?','stock'],['How much did we receive through shared links?','links']]){
  const r=await handleMerchantLux({...request,body:{...request.body,question}},options(async url=>url.includes('ai-gateway')?response({error:{code:'customer_verification_required'}},403):response(current)));
  assert.equal(r.status,200);assert.equal(r.body.mode,'recorded');assert.equal(r.body.answer.plan.task,task);
 }
});

test('wallet-paid request proof confirms the exact link without inventing shared-link source revenue',async()=>{
 const current=snapshot();current.state.paymentLinks=[{id:'wallet-link',shopId:'night',requestId:'wallet-request',kind:'request',amount:2500,status:'paid',confirmedCount:0,confirmedAmount:0,guestConfirmedAmount:0,lumoConfirmedAmount:0,pendingCount:0,pendingAmount:0,
  requestPayment:{id:'wallet-journal',reference:'LM-WALLET-POSTED',shopId:'night',requestId:'wallet-request',amount:2500,currency:'GHS',status:'posted',createdAt:now.toISOString(),rail:'lumo'}}];
 const r=await handleMerchantLux({...request,body:{...request.body,question:'Has payment link wallet-link been paid?'}},options(async url=>url.includes('ai-gateway')?provider({...interpretation,task:'links',period:null,reference:'wallet-link'}):response(current)));
 assert.equal(r.status,200);assert.match(r.body.answer.title,/1 confirmed payment/);assert.equal(r.body.answer.stats.find(row=>row.label==='Linked request · confirmed').value,'GH₵25.00');assert.match(r.body.answer.paragraphs.join(' '),/LM-WALLET-POSTED/);assert.match(r.body.answer.paragraphs.join(' '),/does not prove.*shared link/);
});
