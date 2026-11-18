import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {createAccessHandler as current} from '../supabase/functions/lumo-access/handler.mjs';
import {createAccessHandler as access7} from '../verification/readiness-2.14.0/access7-baseline/handler.mjs';
const actor='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222',executionId='33333333-3333-4333-8333-333333333333';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
async function run(factory,scenario,{keyless=true,module='consumer',...options}={}){
 const trace=[];const crypto={subtle:webcrypto.subtle,getRandomValues:x=>webcrypto.getRandomValues(x),randomUUID:()=>executionId};
 const handler=factory({supabaseUrl:'https://iwutbrljiiodamtyoorg.supabase.co',serviceRoleKey:'SYNTHETIC_ONLY',providerMode:'sandbox',prototypeFaceOnly:keyless,crypto,...options,fetch:async(url,init)=>{
  const body=JSON.parse(init.body);trace.push({path:new URL(url).pathname,method:init.method,body});
  if(url.includes('/auth/v1/admin/users/')){if(scenario==='timeout')throw Error('Synthetic unknown acknowledgement');if(typeof scenario==='number')return json({code:'rejected'},scenario);return json({id:scenario==='wrong-auth-owner'?requestId:actor});}
  const command=body.p_command;
  if(command==='complete.claim'||command==='complete.begin')return json(scenario==='pending'?{ok:false,code:'RESET_IN_PROGRESS'}:{ok:true,ownerId:actor,email:'fixture@pilot.lumo.invalid',handle:'fixture',resetState:scenario==='confirming'?'confirming':scenario==='completed'?'completed':'applying',executionId});
  if(command==='complete.applied'&&scenario==='lost-local-ack')return json({ok:false,code:'RESET_IN_PROGRESS'});
  if(['complete.applied','complete.failed','complete.finish'].includes(command))return json({ok:true});
  throw Error('Unexpected RPC '+command);
 }});
 const response=await handler(new Request('https://edge.example/lumo-access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({module,operation:'complete',requestId,resetToken:'T'.repeat(43),newPassword:'CompatibleStrongSecret9',...options.body})}));
 return {status:response.status,body:await response.json(),trace};
}
test('historical access7 references remain exact to the immutable captured live bundle',async()=>{
 const baseline=JSON.parse(await readFile(new URL('../verification/readiness-2.14.0/live-baseline-sha256.json',import.meta.url),'utf8'));
 for(const [path,digest] of Object.entries(baseline.functions['lumo-access'].files)){const name=path.split('/').at(-1);assert.equal(createHash('sha256').update(await readFile(new URL('../verification/readiness-2.14.0/access7-baseline/'+name,import.meta.url))).digest('hex'),digest,name);}
});
test('default flag preserves access7 reset RPC and Auth bytes across successful, pending, acknowledged and uncertain writes',async()=>{
 for(const module of ['consumer','merchant','admin'])for(const keyless of [true,false])for(const scenario of ['success','pending','confirming','completed','timeout','wrong-auth-owner','lost-local-ack',400,401,403,422,429,500,503]){
  const before=await run(access7,scenario,{keyless,module}),after=await run(current,scenario,{keyless,module});assert.deepEqual(after,before,`${module} / ${keyless?'keyless':'protected'} / ${scenario}`);
  assert.ok(after.trace.every(v=>!v.body.app_metadata&&!v.body.p_payload?.markerVersion&&!v.body.p_command?.startsWith('complete.reconcile')));
 }
});
test('active access entrypoint hard-disables staged fence and public payload cannot turn it on',async()=>{
 assert.match(await readFile(new URL('../supabase/functions/lumo-access/index.ts',import.meta.url),'utf8'),/resetFenceEnabled\s*:\s*false/);
 const out=await run(current,'success',{body:{resetFenceEnabled:true,markerVersion:1}});assert.equal(out.body.code,'INVALID_INPUT');assert.equal(out.trace.length,0);
});
