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
const journals=new WeakMap();
function locksFor(storage){if(!journals.has(storage)){const waiting=new Map();journals.set(storage,{request(name,options,work){const previous=waiting.get(name)||Promise.resolve(),next=previous.catch(()=>{}).then(work);waiting.set(name,next);return next;}});}return journals.get(storage);}
const makeService=options=>createApprovedService({lockManager:locksFor(options.storage),...options});
function harness(handler){const storage=memory(),modeStorage=memory(),calls=[],snapshots=[];const service=makeService({storage,modeStorage,onSnapshot:state=>snapshots.push(state),fetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,options,body});return handler(body,calls.length);}});return {service,storage,calls,snapshots};}

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
  const next=makeService({storage:h.storage,modeStorage:memory(),fetch:async(url,options)=>{h.calls.push({body:JSON.parse(options.body)});return response({ok:true,state:{wallet:100},result:{ok:true,id:'posted-once'}});}});
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

const signedFor=(id,handle,extra={})=>({...signed,session:{...signed.session,user:{id},access_token:`token-${handle}`,...extra},state:{owner:handle,wallet:0},account:{handle}});
const otherSigned=signedFor('22222222-2222-4222-8222-222222222222','kojo.test');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const actions=h=>h.calls.filter(call=>call.body.action==='action');

test('a money request is never posted when its journal write or readback cannot be verified',async()=>{
  for(const mode of ['throw','drop','wrong-readback']){
    const storage=memory(),originalGet=storage.getItem,originalSet=storage.setItem;
    storage.setItem=(key,value)=>{if(key==='lumo-approved-pending-v1'){if(mode==='throw')throw Error('storage quota');if(mode==='drop')return;}originalSet(key,value);};
    storage.getItem=key=>key==='lumo-approved-pending-v1'&&mode==='wrong-readback'&&storage.values.has(key)?'{}':originalGet(key);
    const calls=[];const service=makeService({storage,modeStorage:memory(),fetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);return response(body.action==='login'?signed:{ok:true,result:{ok:true}});}});
    await service.login('ama.test','test-password');const result=await service.action('payment',{amount:100,recipient:{id:'recipient-one'}},{pin:'1234'});
    assert.equal(result.ok,false,mode);assert.equal(result.code,'JOURNAL_UNAVAILABLE',mode);assert.equal(calls.filter(body=>body.action==='action').length,0,mode);
  }
});

test('queued payments capture nested reviewed details immediately and never journal nested credentials',async()=>{
  let release;const blocked=new Promise(resolve=>{release=resolve;});const h=harness(body=>{if(body.action==='login')return response(signed);if(body.type==='settings')return blocked;return response({ok:true,result:{ok:true}});});
  await h.service.login('ama.test','test-password');const first=h.service.action('settings',{hideBalance:true});await tick();
  const payload={amount:100,recipient:{id:'reviewed-recipient',name:'Reviewed person',pin:'nested-pin-secret'},metadata:{password:'nested-password-secret',details:[{refresh_token:'nested-refresh-secret',label:'Keep this note'}]}};
  const queued=h.service.action('payment',payload,{pin:'1234'});payload.recipient.id='changed-after-review';payload.metadata.details[0].label='Changed note';
  release(response({ok:true,result:{ok:true}}));await Promise.all([first,queued]);
  const posted=actions(h).find(call=>call.body.type==='payment').body;
  assert.equal(posted.payload.recipient.id,'reviewed-recipient');assert.equal(posted.payload.metadata.details[0].label,'Keep this note');
  assert.equal(posted.payload.recipient.pin,undefined);assert.equal(posted.payload.metadata.password,undefined);assert.equal(posted.payload.metadata.details[0].refresh_token,undefined);
  assert.equal(payload.recipient.pin,'nested-pin-secret');assert.equal([...h.storage.values.values()].some(value=>/nested-(?:pin|password|refresh)-secret/.test(value)),false);
});

test('unknown attempts survive sign-out, a different account and a restored original session',async()=>{
  let loseFirst=true;const h=harness(body=>{if(body.action==='login')return response(body.handle==='kojo.test'?otherSigned:signed);if(body.action==='action'&&loseFirst){loseFirst=false;throw Error('lost committed response');}return response({ok:true,result:{ok:true,id:'posted-once'}});});
  await h.service.login('ama.test','test-password');const payload={amount:100,recipient:{id:'recipient-one'}};
  assert.equal((await h.service.action('payment',payload,{pin:'1234'})).unknown,true);const original=actions(h)[0].body.attemptId;
  await h.service.signOut();assert.equal(Object.keys(JSON.parse(h.storage.getItem('lumo-approved-pending-v1'))).length,1);
  await h.service.login('kojo.test','different-test-password');await h.service.action('payment',payload,{pin:'5678'});const other=actions(h)[1];
  assert.notEqual(other.body.attemptId,original);assert.equal(other.options.headers.Authorization,'Bearer token-kojo.test');
  const restored=makeService({storage:h.storage,modeStorage:memory(),fetch:async(url,options)=>{const body=JSON.parse(options.body);h.calls.push({url,options,body});return response(body.action==='login'?signed:{ok:true,result:{ok:true,id:'posted-once'}});}});
  await restored.login('ama.test','test-password');await restored.action('payment',payload,{pin:'1234'});
  const retry=actions(h).at(-1);assert.equal(retry.body.attemptId,original);assert.equal(retry.options.headers.Authorization,'Bearer test-access-token');
});

test('HTTP server failures and unknown service codes retain the original money attempt',async()=>{
  for(const status of [200,503]){
    let first=true;const h=harness(body=>{if(body.action==='login')return response(signed);if(first){first=false;return {ok:status===200,status,json:async()=>({ok:false,code:status===200?'COMMIT_FAILED':'SERVICE_UNAVAILABLE',message:'Result not confirmed.'})};}return response({ok:true,result:{ok:true,id:'same-result'}});});
    await h.service.login('ama.test','test-password');const payload={amount:100,recipient:{id:'recipient-one'}};
    const result=await h.service.action('payment',payload,{pin:'1234'});assert.equal(result.unknown,true);
    await h.service.action('payment',payload,{pin:'1234'});assert.equal(actions(h)[0].body.attemptId,actions(h)[1].body.attemptId);
  }
});

test('a queued original-account payment cannot be submitted with the next account token',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});const h=harness(body=>response(body.action==='login'?(body.handle==='kojo.test'?otherSigned:signed):{ok:true,result:{ok:true}}));
  const transport=makeService({storage:h.storage,modeStorage:memory(),onSnapshot:state=>h.snapshots.push(state),fetch:async(url,options)=>{const body=JSON.parse(options.body);h.calls.push({url,options,body});if(body.action==='login')return response(body.handle==='kojo.test'?otherSigned:signed);if(body.type==='settings')return gate;return response({ok:true,result:{ok:true}});}});
  await transport.login('ama.test','test-password');const first=transport.action('settings',{hideBalance:true});await tick();
  const queued=transport.action('payment',{amount:100,recipient:{id:'recipient-one'}},{pin:'1234'});await transport.login('kojo.test','different-test-password');release(response({ok:true,state:{owner:'ama.test'},result:{ok:true}}));
  const results=await Promise.all([first,queued]);assert.ok(results.every(result=>result.code==='ACCOUNT_CHANGED'));assert.equal(actions(h).filter(call=>call.body.type==='payment').length,0);assert.equal(transport.user.id,otherSigned.session.user.id);assert.equal(h.snapshots.at(-1).owner,'kojo.test');
});

test('a late original-account snapshot cannot replace the newly signed-in account state',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});const h=harness(body=>body.action==='login'?response(body.handle==='kojo.test'?otherSigned:signed):gate);
  await h.service.login('ama.test','test-password');const oldSnapshot=h.service.snapshot();await tick();await h.service.login('kojo.test','different-test-password');release(response({ok:true,state:{owner:'old-ama-state'},account:{handle:'ama.test'}}));
  assert.equal((await oldSnapshot).code,'ACCOUNT_CHANGED');assert.equal(h.service.account.handle,'kojo.test');assert.equal(h.snapshots.at(-1).owner,'kojo.test');
});

test('late refresh and logout responses cannot reinstall the prior account session',async()=>{
  let releaseRefresh,releaseLogout;const refresh=new Promise(resolve=>{releaseRefresh=resolve;}),logout=new Promise(resolve=>{releaseLogout=resolve;});
  const expired={...signed,session:{...signed.session,expires_at:1}};const h=harness(body=>{if(body.action==='login')return response(body.handle==='kojo.test'?otherSigned:expired);if(body.refresh_token)return refresh;return logout;});
  await h.service.login('ama.test','test-password');const oldSnapshot=h.service.snapshot();await tick();await h.service.login('kojo.test','different-test-password');releaseRefresh(response(signed.session));assert.equal((await oldSnapshot).code,'ACCOUNT_CHANGED');assert.equal(h.service.user.id,otherSigned.session.user.id);
  const leaving=h.service.signOut();assert.equal(h.service.signedIn,false);await h.service.login('kojo.test','different-test-password');releaseLogout(response({ok:true}));await leaving;
  assert.equal(h.service.user.id,otherSigned.session.user.id);assert.equal(JSON.parse(h.storage.getItem('lumo-approved-session-v1')).user.id,otherSigned.session.user.id);
  assert.ok(h.calls.some(call=>call.url.endsWith('/auth/v1/logout?scope=local')));
});

test('refresh must return the same immutable owner before its session can be installed',async()=>{
  const expired={...signed,session:{...signed.session,expires_at:1}};const h=harness(body=>response(body.action==='login'?expired:otherSigned.session));await h.service.login('ama.test','test-password');const result=await h.service.snapshot();
  assert.equal(result.ok,false);assert.equal(result.code,'UNAUTHENTICATED');assert.equal(h.service.user.id,signed.session.user.id);assert.equal(h.snapshots.length,1);assert.equal(h.calls.filter(call=>call.body.action==='snapshot').length,0);
});

test('a later login wins even when an earlier login response arrives last',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});const h=harness(body=>body.handle==='ama.test'?gate:response(otherSigned));
  const earlier=h.service.login('ama.test','test-password');await h.service.login('kojo.test','different-test-password');release(response(signed));assert.equal((await earlier).code,'ACCOUNT_CHANGED');assert.equal(h.service.user.id,otherSigned.session.user.id);assert.equal(h.snapshots.at(-1).owner,'kojo.test');
});

test('journal leases prevent another tab overwriting an unresolved attempt between read and write',async()=>{
  const storage=memory();storage.setItem('lumo-approved-session-v1',JSON.stringify(signed.session));
  const rawGet=storage.getItem,calls=[];let startOther,otherAction,interleaved=false,firstA=true;
  storage.getItem=key=>{const saved=rawGet(key);if(key==='lumo-approved-pending-v1'&&!interleaved&&startOther){interleaved=true;otherAction=startOther();}return saved;};
  const transport=source=>async(url,options)=>{const body=JSON.parse(options.body);calls.push({source,body});if(source==='A'&&!firstA)return response({ok:true,result:{ok:true}});if(source==='A')firstA=false;throw Error('Unknown outcome in this tab');};
  const a=makeService({storage,modeStorage:memory(),fetch:transport('A')}),b=makeService({storage,modeStorage:memory(),fetch:transport('B')});
  const payload={amount:100,recipient:{id:'recipient-one'}};startOther=()=>a.action('payment',payload,{pin:'1234'});
  const firstB=b.action('payment',{amount:200,recipient:{id:'recipient-two'}},{pin:'1234'});await tick();assert.equal(interleaved,true);await Promise.all([firstB,otherAction]);
  assert.equal(Object.keys(JSON.parse(rawGet('lumo-approved-pending-v1'))).length,2);const original=calls.find(call=>call.source==='A').body.attemptId;
  await a.action('payment',payload,{pin:'1234'});assert.equal(calls.filter(call=>call.source==='A').at(-1).body.attemptId,original);assert.equal(Object.keys(JSON.parse(rawGet('lumo-approved-pending-v1'))).length,1);
});

test('absent or failed cross-tab journal locks stop money requests before a POST',async()=>{
  for(const lockManager of [null,{request:async()=>undefined},{request:async()=>{throw Error('Lock unavailable');}}]){
    const storage=memory();storage.setItem('lumo-approved-session-v1',JSON.stringify(signed.session));let posts=0;
    const service=createApprovedService({storage,modeStorage:memory(),lockManager,fetch:async()=>{posts++;return response({ok:true,result:{ok:true}});}});
    const result=await service.action('payment',{amount:100},{pin:'1234'});assert.equal(result.code,'JOURNAL_UNAVAILABLE');assert.equal(posts,0);
  }
});

test('switching to a sample invalidates late private snapshots and preserves an in-flight money reference',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});const h=harness(body=>body.action==='login'?response(signed):gate);
  await h.service.login('ama.test','test-password');const version=h.service.authVersion,request=h.service.action('payment',{amount:100},{pin:'1234'});await tick();h.service.setSample(true);
  assert.ok(h.service.authVersion>version);release(response({ok:true,state:{privateData:'must-not-hydrate-sample'},result:{ok:true}}));const result=await request;
  assert.equal(result.code,'ACCOUNT_CHANGED');assert.equal(h.service.connected,false);assert.equal(h.snapshots.length,1);assert.equal(Object.keys(JSON.parse(h.storage.getItem('lumo-approved-pending-v1'))).length,1);
});

test('sign-out reports failure when neither saved-session removal nor remote revocation is confirmed',async()=>{
  const h=harness(body=>{if(body.action==='login')return response(signed);throw Error('Logout did not reach Auth');});await h.service.login('ama.test','test-password');
  const remove=h.storage.removeItem;h.storage.removeItem=key=>{if(key==='lumo-approved-session-v1')throw Error('Removal denied');remove(key);};
  const before=h.service.authVersion,result=await h.service.signOut();assert.equal(result.ok,false);assert.equal(result.code,'SIGNOUT_UNCONFIRMED');assert.ok(h.service.authVersion>before);assert.equal(h.service.signedIn,false);assert.ok(h.storage.getItem('lumo-approved-session-v1'));
});

test('an actual empty 204 logout response is a confirmed local-session revocation',async()=>{
  const h=harness(body=>body.action==='login'?response(signed):{ok:true,status:204,json:async()=>{throw Error('No JSON body');}});await h.service.login('ama.test','test-password');
  const result=await h.service.signOut();assert.equal(result.ok,true);assert.equal(result.pendingLogout,false);assert.equal(result.localCleared,true);assert.equal(h.storage.getItem('lumo-approved-session-v1'),null);
});

test('a new account is not installed if its session cannot be saved and read back',async()=>{
  const h=harness(body=>response(body.handle==='kojo.test'?otherSigned:signed));await h.service.login('ama.test','test-password');
  const write=h.storage.setItem;h.storage.setItem=(key,value)=>{if(key==='lumo-approved-session-v1')throw Error('Session quota');write(key,value);};
  const result=await h.service.login('kojo.test','different-test-password');assert.equal(result.ok,false);assert.equal(result.code,'SESSION_STORAGE_UNAVAILABLE');assert.equal(h.service.user.id,signed.session.user.id);assert.equal(h.snapshots.length,1);
});

test('a confirmed reply keeps its original attempt until journal cleanup is durable',async()=>{
  const h=harness(body=>response(body.action==='login'?signed:{ok:true,result:{ok:true,id:'confirmed-once'}}));await h.service.login('ama.test','test-password');
  let failClear=true;const write=h.storage.setItem;h.storage.setItem=(key,value)=>{if(key==='lumo-approved-pending-v1'&&value==='{}'&&failClear)throw Error('Cleanup denied');write(key,value);};
  const payload={amount:100},first=await h.service.action('fund',payload,{pin:'1234'});assert.equal(first.ok,false);assert.equal(first.unknown,true);assert.equal(first.code,'JOURNAL_UNAVAILABLE');
  failClear=false;const next=await h.service.action('fund',payload,{pin:'1234'});assert.equal(next.ok,true);assert.equal(actions(h)[0].body.attemptId,actions(h)[1].body.attemptId);assert.equal(h.storage.getItem('lumo-approved-pending-v1'),'{}');
});

test('an account switch while cleanup waits for its lease preserves the original confirmed attempt',async()=>{
  const storage=memory(),calls=[];let releaseCleanup,leases=0;
  const lockManager={request(name,options,work){if(++leases===2)return new Promise(resolve=>{releaseCleanup=()=>resolve(work());});return Promise.resolve().then(work);}};
  const service=makeService({storage,modeStorage:memory(),lockManager,fetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);return response(body.action==='login'?(body.handle==='kojo.test'?otherSigned:signed):{ok:true,result:{ok:true,id:'confirmed-once'}});}});
  await service.login('ama.test','test-password');const action=service.action('fund',{amount:100},{pin:'1234'});await tick();assert.equal(typeof releaseCleanup,'function');
  const original=calls.find(body=>body.action==='action').attemptId;await service.login('kojo.test','different-test-password');releaseCleanup();const result=await action;
  assert.equal(result.code,'ACCOUNT_CHANGED');assert.equal(result.unknown,true);assert.ok(Object.values(JSON.parse(storage.getItem('lumo-approved-pending-v1'))).includes(original));assert.equal(service.user.id,otherSigned.session.user.id);
});
