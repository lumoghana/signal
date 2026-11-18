import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createEmptyState} from '../supabase/functions/lumo-approved/domain/model.js';
import {createApprovedHandler} from '../supabase/functions/lumo-approved/handler.mjs';

const actor='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222',recipient='33333333-3333-4333-8333-333333333333';
const token='x.'+Buffer.from(JSON.stringify({sub:actor,session_id:session})).toString('base64url')+'.fixture';
function fixture({staleDecline=false}={}){
 let balance=0,revision=0,commits=0,declines=0;const attempts=new Map(),calls=[];
 const snapshot=()=>{const state=createEmptyState({name:'Synthetic payer'});state.wallet=balance;state.buffer=0;return {ok:true,revision,account:{id:'wallet',userId:actor,displayName:'Synthetic payer',balance},state,groups:[],boxes:[],receipts:[],requests:[],partners:[]};};
 const lookup=p=>{const saved=attempts.get(p.attemptId);return saved?(saved.fingerprint!==p.fingerprint?{ok:false,code:'IDEMPOTENCY_CONFLICT'}:{ok:true,found:true,result:saved.result,snapshot:snapshot()}):{ok:true,found:false};};
 const handler=createApprovedHandler({supabaseUrl:'https://fixture.example',serviceRoleKey:'synthetic-fixture',crypto:webcrypto,fetch:async(url,init)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:actor,app_metadata:{lumo_pilot:true}});
  const body=JSON.parse(init.body),p=body.p_payload;calls.push({command:body.p_command,payload:p});
  if(body.p_command==='attempt')return Response.json(lookup(p));
  if(body.p_command==='load')return Response.json(snapshot());
  if(body.p_command==='resolve')return Response.json({ok:true,recipient:{id:recipient,userId:recipient,handle:'synthetic_receiver',name:'Synthetic recipient'}});
  if(body.p_command==='decline'){
   declines++;if(staleDecline){staleDecline=false;balance=1000;return Response.json({ok:false,code:'REVISION_CONFLICT'});}
   if(p.pin!=='3159')return Response.json({ok:false,code:'PIN_REQUIRED'});
   assert.deepEqual(Object.keys(p.result).sort(),['message','ok']);
   const result={ok:false,code:'DOMAIN_REJECTED',terminal:true,noMutation:true,result:p.result,receipts:[],revision};
   attempts.set(p.attemptId,{fingerprint:p.fingerprint,result});return Response.json({ok:true,found:true,replayed:false,result,snapshot:snapshot()});
  }
  if(body.p_command==='commit'){
   if(p.pin!=='3159')return Response.json({ok:false,code:'PIN_REQUIRED'});
   commits++;balance=p.state.wallet;revision++;const result={ok:true,result:p.result,receipts:[]};attempts.set(p.attemptId,{fingerprint:p.fingerprint,result});return Response.json({...result,snapshot:snapshot()});
  }
  throw Error('Unexpected fixture command '+body.p_command);
 }});
 return {calls,attempts,setBalance:n=>{balance=n;},get balance(){return balance;},get commits(){return commits;},get declines(){return declines;},call:async(body)=>{const response=await handler(new Request('https://fixture.example/approved',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)}));return {...await response.json(),httpStatus:response.status};}};
}
const payment=(extra={})=>({action:'action',type:'payment',attemptId:'terminal-payment-reference',payload:{rail:'lumo',amount:500,recipient:{handle:'synthetic_receiver'}},pin:'3159',...extra});

test('authenticated terminal decline is returned again after incoming funds without posting the old reference',async()=>{
 const f=fixture(),body=payment(),first=await f.call(body);
 assert.equal(first.ok,false);assert.equal(first.code,'DOMAIN_REJECTED');assert.equal(first.terminal,true);assert.equal(first.noMutation,true);assert.equal(first.replayed,false);
 assert.equal(f.declines,1);assert.equal(f.attempts.size,1);assert.equal(f.commits,0);
 assert.equal(JSON.stringify(f.attempts.get(body.attemptId)).includes('3159'),false);
 f.setBalance(1000);const replay=await f.call(body);
 assert.equal(replay.ok,false);assert.equal(replay.replayed,true);assert.equal(replay.message,first.message);assert.equal(replay.state.wallet,1000);assert.equal(f.balance,1000);assert.equal(f.commits,0);
 const fresh=await f.call(payment({attemptId:'fresh-reviewed-payment-reference'}));assert.equal(fresh.ok,true);assert.equal(f.commits,1);assert.equal(f.balance,500);
});

test('recovery preserves the terminal false result and a changed payload cannot reuse its reference',async()=>{
 const f=fixture(),body=payment();await f.call(body);
 const recovered=await f.call({...body,action:'recover'});assert.equal(recovered.found,true);assert.equal(recovered.ok,false);assert.equal(recovered.terminal,true);assert.equal(recovered.noMutation,true);
 const conflict=await f.call({...body,payload:{...body.payload,amount:600}});assert.equal(conflict.code,'IDEMPOTENCY_CONFLICT');assert.equal(f.commits,0);
});

test('incorrect PIN never freezes an attempt and corrected PIN can still authorise a fresh current result',async()=>{
 const f=fixture(),body=payment({pin:'9999'}),bad=await f.call(body);
 assert.equal(bad.code,'PIN_REQUIRED');assert.equal(f.attempts.size,0);
 f.setBalance(1000);const corrected=await f.call({...body,pin:'3159'});assert.equal(corrected.ok,true);assert.equal(f.commits,1);assert.equal(f.balance,500);
});

test('a stale decline snapshot is re-evaluated, not recorded over concurrently received money',async()=>{
 const f=fixture({staleDecline:true}),result=await f.call(payment());
 assert.equal(result.ok,true);assert.equal(f.declines,1);assert.equal(f.commits,1);assert.equal(f.balance,500);
 assert.equal(f.calls.filter(x=>x.command==='load').length,2);
});
