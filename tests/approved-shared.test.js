import test from 'node:test';
import assert from 'node:assert/strict';
import {createApprovedService} from '../dist/js/approved-service.js';
import {runActionFlow} from '../dist/js/approved-flow.js';
import {encodeSharedQr,parseSharedQr} from '../dist/js/approved-qr.js';
import {parseQrPayload} from '../dist/js/qr-decoder.js';
import {openPartnerInbox} from '../dist/js/partner-inbox-ui.js';

const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};};
const response=value=>({ok:true,status:200,json:async()=>value});
const signed={ok:true,session:{access_token:'test-access-token',refresh_token:'test-refresh-token',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'11111111-1111-4111-8111-111111111111'}},state:{wallet:0},account:{handle:'ama.test'}};
function harness(handler){const storage=memory(),modeStorage=memory(),calls=[],snapshots=[];const service=createApprovedService({storage,modeStorage,onSnapshot:state=>snapshots.push(state),fetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,options,body});return handler(body,calls.length);}});return {service,storage,calls,snapshots};}

test('shared credentials travel only in the authorization request and fresh sessions hydrate the original state',async()=>{
  const h=harness(body=>response(body.action==='login'?signed:{ok:true,state:{wallet:1200},result:{ok:true,id:'posted'}}));
  await h.service.login('ama.test','a-transient-test-password');
  await h.service.action('payment',{rail:'lumo',amount:1200,recipient:{handle:'esi.test'},pin:'9876',status:'failed',actorId:'forged',idempotencyKey:'approved-payment-1'},{pin:'9876'});
  const body=h.calls[1].body;
  assert.equal(body.pin,'9876');assert.equal(body.payload.pin,undefined);assert.equal(body.payload.status,undefined);assert.equal(body.payload.actorId,undefined);
  assert.equal(h.calls[1].options.headers.Authorization,'Bearer test-access-token');
  assert.equal([...h.storage.values.values()].some(value=>/a-transient-test-password|9876/.test(value)),false);
  assert.deepEqual(h.snapshots,[{wallet:0},{wallet:1200}]);
});

test('unknown outcomes retain the same attempt across retries and across a restored browser session',async()=>{
  let fail=true;const h=harness(body=>{if(body.action==='login')return response(signed);if(fail){fail=false;throw Error('connection lost');}return response({ok:true,state:{wallet:100},result:{ok:true,id:'posted-once'}});});
  await h.service.login('ama.test','test-password');
  const payload={amount:100,source:'Shared test money',idempotencyKey:'fund-exact-attempt'};
  const first=await h.service.action('fund',payload,{pin:'1234'});assert.equal(first.unknown,true);assert.equal(h.snapshots.length,1);
  const next=createApprovedService({storage:h.storage,modeStorage:memory(),fetch:async(url,options)=>{h.calls.push({body:JSON.parse(options.body)});return response({ok:true,state:{wallet:100},result:{ok:true,id:'posted-once'}});}});
  assert.equal(next.signedIn,true);await next.action('fund',payload,{pin:'1234'});
  assert.equal(h.calls[1].body.attemptId,h.calls[2].body.attemptId);
});

test('repeated confirmation callbacks use one stable server attempt even after a successful response',async()=>{
  const h=harness(body=>response(body.action==='login'?signed:{ok:true,state:{wallet:100},result:{ok:true,id:'same-receipt'}}));
  await h.service.login('ama.test','test-password');const payload={amount:100,idempotencyKey:'same-confirmation'};
  await h.service.action('fund',payload,{pin:'1234'});await h.service.action('fund',payload,{pin:'1234'});
  assert.equal(h.calls[1].body.attemptId,h.calls[2].body.attemptId);
});

test('an authoritative failure preserves its error and does not fabricate a success snapshot',async()=>{
  const h=harness(body=>response(body.action==='login'?signed:{ok:false,code:'INSUFFICIENT_FUNDS',message:'Not enough available money.',result:{ok:false,message:'Not enough available money.'}}));
  await h.service.login('ama.test','test-password');const result=await h.service.action('payment',{amount:500,idempotencyKey:'failed-payment'},{pin:'1234'});
  assert.equal(result.ok,false);assert.equal(result.code,'INSUFFICIENT_FUNDS');assert.equal(h.snapshots.length,1);
});

test('the same approved continuation stays synchronous in a sample and waits for shared confirmation',async()=>{
  let localDone=false;const local=runActionFlow(function*(){const result=yield {ok:true};localDone=result.ok;return 'local';});assert.equal(local,'local');assert.equal(localDone,true);
  let resolve,sharedDone=false;const remote=new Promise(done=>{resolve=done;});const shared=runActionFlow(function*(){const result=yield remote;sharedDone=result.ok;return 'shared';});assert.equal(sharedDone,false);resolve({ok:true});assert.equal(await shared,'shared');assert.equal(sharedDone,true);
});

test('shared QR identity preserves approved handles and fixed merchant amounts come only from the server quote',()=>{
  const raw=encodeSharedQr({kind:'person',handle:'2.ama-test'});assert.deepEqual(parseSharedQr(raw),{kind:'person',handle:'2.ama-test'});
  const parsed=parseQrPayload('https://lumo.test/?pay=11111111-1111-4111-8111-111111111111&request=22222222-2222-4222-8222-222222222222&amount=999999&workspace=registered',{origin:'https://lumo.test'});
  assert.equal(parsed.ok,true);assert.equal(parsed.payment.shopId,'11111111-1111-4111-8111-111111111111');assert.equal(parsed.payment.amount,undefined);
  assert.equal(parseQrPayload('https://lumo.test/?pay=invalid&amount=1',{origin:'https://lumo.test'}).ok,false);
});

test('a partner sees only their scoped request and no code appears before confirmed acceptance',async()=>{
  const invitation={id:'partner-initial-1',kind:'initial',ownerName:'Esi Test',boxName:'Semester goal',status:'awaiting-partner',revision:1};
  let confirm,answers=0;const h=harness(body=>{if(body.action==='login')return response(signed);if(body.action==='partnerInbox')return response({ok:true,inbox:[invitation]});if(body.action==='partnerRespond'){answers++;return new Promise(resolve=>{confirm=()=>resolve(response({ok:true,inbox:[{...invitation,status:'accepted',revision:2,code:'672901'}]}));});}throw Error('Unexpected request');});
  await h.service.login('ama.test','test-password');
  const element=()=>({disabled:false,checked:false,isConnected:true,textContent:'',dataset:{},addEventListener(type,callback){this[type]=callback;}});
  let current;const ctx={shared:h.service,toast(){},sheet(html,bind){if(current)current.isConnected=false;const controls={consent:element(),error:element(),accept:element(),decline:element(),back:element(),row:element()};controls.row.dataset.action='partner-inbox:'+invitation.id;const sheet={html,isConnected:true,controls,querySelector(selector){if(selector.includes('consent'))return controls.consent;if(selector.includes('error'))return controls.error;if(selector.includes('accept'))return controls.accept;if(selector.includes('decline'))return controls.decline;if(selector.includes('back'))return controls.back;return null;},querySelectorAll(selector){return selector==='button'?Object.values(controls):selector.includes('data-action')?[controls.row]:[];}};current=sheet;bind(sheet);}};
  await openPartnerInbox(ctx);current.controls.row.onclick();
  assert.match(current.html,/Semester goal/);assert.doesNotMatch(current.html,/672901|wallet|transactions|Everyday balance/);
  current.controls.accept.click();assert.equal(answers,0);assert.match(current.controls.error.textContent,/confirm/);
  current.controls.consent.checked=true;current.controls.accept.click();assert.equal(answers,1);assert.equal(current.controls.accept.disabled,true);assert.doesNotMatch(current.html,/672901/);
  confirm();await new Promise(resolve=>setImmediate(resolve));assert.match(current.html,/672901/);assert.match(current.html,/cannot release money/);
});
