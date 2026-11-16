import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAvailability,infrastructureFailure,servicesForAction} from '../supabase/functions/lumo-approved/availability.mjs';
import {createApprovedHandler} from '../supabase/functions/lumo-approved/handler.mjs';
import {guestAvailabilityMessage} from '../../merchant-approved/dist/public-checkout.js';
import {availabilityMessage,availabilitySignature} from '../../dist/js/service-availability.js';
const available=(id,extra={})=>({serviceId:id,available:true,message:'',...extra});
test('new payments are scoped by operation and network; status, refunds and recovery are never new payments',()=>{
 assert.deepEqual(servicesForAction({action:'action',type:'payment',payload:{rail:'momo',recipient:{network:'MTN MoMo'}}}),['momo_send','momo_send_mtn']);
 assert.deepEqual(servicesForAction({action:'guestCheckout',operation:'initiate',network:'airteltigo'}),['merchant_payment','momo_collection','momo_collection_at']);
 for(const body of [{action:'recover',type:'payment'},{action:'guestCheckout',operation:'status'},{action:'guestCheckout',operation:'sandboxResult'},{action:'action',type:'refund'}])assert.deepEqual(servicesForAction(body),[]);
});
test('manual or circuit unavailability rejects before a new action; another network stays usable',async()=>{
 const rows=[available('momo_send'),available('momo_send_mtn',{available:false,message:'MTN is temporarily unavailable.'}),available('momo_send_telecel')];
 const client=createAvailability({serviceRpc:async()=>({ok:true,services:rows})});
 await assert.rejects(()=>client.gate({action:'action',type:'payment',payload:{rail:'momo',recipient:{network:'MTN MoMo'}}}),error=>error.code==='SERVICE_PAUSED'&&error.noMutation===true&&error.message==='MTN is temporarily unavailable.');
 await client.gate({action:'action',type:'payment',payload:{rail:'momo',recipient:{network:'Telecel Cash'}}});
});
test('customer validation errors never count as infrastructure failures',async()=>{
 const calls=[];const client=createAvailability({serviceRpc:async(name,args)=>{calls.push({name,args});return {ok:true};}});
 for(const code of ['PIN_REQUIRED','INSUFFICIENT_FUNDS','RECIPIENT_NOT_FOUND','INVALID_INPUT','SERVICE_PAUSED']){assert.equal(infrastructureFailure({code}),false);await client.observe(['momo_send'],{code});}
 assert.equal(calls.length,0);await client.observe(['momo_send'],{code:'COMMIT_FAILED'});assert.equal(calls[0].args.p_payload.outcome,'infrastructure_failure');
});
test('public status strips caller probe and rejects additional fields',async()=>{
 const calls=[];const handler=createApprovedHandler({supabaseUrl:'https://test.example',serviceRoleKey:'server',availabilityEnabled:true,fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({ok:true,services:[available('momo_send')]});}});
 const result=await (await handler(new Request('https://edge.example',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'serviceStatus'})}))).json();
 assert.equal(result.ok,true);assert.equal(calls[0].p_payload.probe,false);
 const bad=await (await handler(new Request('https://edge.example',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'serviceStatus',probe:true})}))).json();assert.equal(bad.code,'INVALID_INPUT');
});
test('production entry enables database-backed controls',async()=>{assert.match(await readFile(new URL('../supabase/functions/lumo-approved/index.ts',import.meta.url),'utf8'),/availabilityEnabled:true/);});
test('consumer status changes affect quiet sync and guest controls retain recovery',()=>{
 const rows=[available('merchant_payment'),available('momo_collection',{available:false,message:'MoMo temporarily unavailable.'})];
 assert.equal(guestAvailabilityMessage({serviceAvailability:rows}),'MoMo temporarily unavailable.');
 const ctx={connected:true,shared:{capabilities:{serviceAvailability:[available('momo_send',{available:false,message:'Paused'})]}}};assert.equal(availabilityMessage(ctx,'momo'),'Paused');
 assert.notEqual(availabilitySignature(ctx.shared.capabilities),availabilitySignature({serviceAvailability:[available('momo_send')]}));
});
