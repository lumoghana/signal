// Isolated real-PostgreSQL acceptance. No hosted URL, keys or user data.
// Run with LUMO_PGLITE_MODULE pointing at the pinned verification dependency.
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {bootLedger} from '../consumer-loyalty-2.13.0/local-ledger.mjs';
import {createApprovedHandler} from '../../supabase/functions/lumo-approved/handler.mjs';
const {db,applied}=await bootLedger({through:null});
const {assertActiveSchema}=await import('./active-schema.mjs');
await assertActiveSchema(db,applied);
const identities=new Map(),uuid=()=>webcrypto.randomUUID(),b64=v=>Buffer.from(v).toString('base64url');
let checks=0;const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const rpc=async(name,args,claims={role:'service_role'})=>db.transaction(async tx=>{
 await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(claims)]);
 const values=Object.entries(args),types={p_command:'text',p_payload:'jsonb'};
 return (await tx.query('select public.'+name+'('+values.map(([key],i)=>key+'=>$'+(i+1)+'::'+types[key]).join(',')+') as result',values.map(([,v])=>typeof v==='object'?JSON.stringify(v):v))).rows[0].result;
});
const service=(who,command,values={})=>rpc('lumo_approved_service',{p_command:command,p_payload:{...values,actor:who.userId,session:who.sessionId}});
const handler=createApprovedHandler({supabaseUrl:'https://fixture.example',serviceRoleKey:'SYNTHETIC_FIXTURE_ONLY',crypto:webcrypto,fetch:async(url,init)=>{
 const who=identities.get(init.headers.Authorization?.replace(/^Bearer /,'')),path=new URL(url).pathname;
 if(path==='/auth/v1/user')return Response.json(who?{id:who.userId,email:who.email,app_metadata:{lumo_pilot:true}}:{},who?{}:{status:401});
 assert.ok(path.startsWith('/rest/v1/rpc/'),'Only synthetic RPC calls are permitted');
 return Response.json(await rpc(path.split('/').at(-1),JSON.parse(init.body),who?{role:'authenticated',sub:who.userId,session_id:who.sessionId}:{role:'service_role'}));
}});
const call=async(who,body)=>{const r=await handler(new Request('https://fixture.example/approved',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+who.token},body:JSON.stringify(body)}));return {http:r.status,...await r.json()};};
const journals=async()=>Number((await db.query('select count(*) as n from lumo_private.journals')).rows[0].n);
try{
 const actors=[];
 for(const label of ['payer','recipient']){
  const userId=uuid(),sessionId=uuid(),handle='financial_'+label,email=handle+'@pilot.lumo.invalid';
  const who={userId,sessionId,handle,email,token:'e30.'+b64(JSON.stringify({sub:userId,session_id:sessionId}))+'.fixture'};
  identities.set(who.token,who);actors.push(who);
  await db.query("insert into auth.users(id,email,raw_app_meta_data) values($1,$2,'{\"lumo_pilot\":true}')",[userId,email]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
  check((await service(who,'provision',{handle,displayName:'Synthetic '+label,pin:'3159',mode:'consumer'})).ok,'Synthetic personal identity provisioned');
 }
 const [a,b]=actors;
 const body={action:'action',type:'payment',payload:{rail:'lumo',amount:500,recipient:{handle:b.handle}},attemptId:'original-declined-reference',pin:'3159'};
 const wrong=await call(a,{...body,pin:'9999'});check(wrong.code==='PIN_REQUIRED','An incorrect PIN is not persisted as a terminal financial result');
 check(!(await service(a,'attempt',{attemptId:body.attemptId,fingerprint:'a'.repeat(64)})).found,'Wrong-PIN attempt remains absent');
 const rejected=await call(a,body);check(rejected.ok===false&&rejected.code==='DOMAIN_REJECTED'&&rejected.terminal===true&&rejected.noMutation===true,'Authenticated insufficient-funds decline becomes terminal');
 check(rejected.replayed===false&&await journals()===0,'First decline posts no journal');
 const persisted=(await db.query('select result from lumo_private.approved_attempts where user_id=$1 and attempt_id=$2',[a.userId,body.attemptId])).rows[0].result;
 check(!JSON.stringify(persisted).includes('3159')&&!JSON.stringify(persisted).includes('pin')&&!JSON.stringify(persisted).includes('signature'),'Saved decline contains no PIN, signature or original payment payload');
 check((await call(a,{action:'action',type:'fund',payload:{amount:1000},attemptId:'independent-new-funds',pin:'3159'})).ok,'A separate authorised funding action succeeds');
 const beforeReplay=await journals(),replayed=await call(a,body);
 check(!replayed.ok&&replayed.replayed&&replayed.terminal&&replayed.message===rejected.message,'Identical declined reference replays the original decline after funds arrive');
 check(replayed.account.balance===1000&&await journals()===beforeReplay,'Delayed old instruction cannot debit newly arrived funds');
 const recovered=await call(a,{...body,action:'recover'});check(!recovered.ok&&recovered.found&&recovered.replayed&&recovered.terminal,'Recovery preserves the false terminal result');
 check((await call(a,{...body,payload:{...body.payload,amount:600}})).code==='IDEMPOTENCY_CONFLICT','A declined reference cannot be reused with altered details');
 const fresh=await call(a,{...body,attemptId:'fresh-reviewed-reference'});check(fresh.ok&&fresh.account.balance===500&&await journals()===beforeReplay+1,'A fresh reviewed reference can spend the current funded balance');
 const successReplay=await call(a,{...body,attemptId:'fresh-reviewed-reference'});check(successReplay.ok&&successReplay.replayed&&await journals()===beforeReplay+1,'Successful references still replay without a second debit');
 const badFund={action:'action',type:'fund',payload:{amount:100},attemptId:'correctable-pin-reference',pin:'9999'};
 check((await call(a,badFund)).code==='PIN_REQUIRED','Commit PIN errors remain correctable');
 check((await call(a,{...badFund,pin:'3159'})).ok,'Correct PIN succeeds on the same not-yet-committed reference');
 const other=await call(b,{...body,payload:{rail:'lumo',amount:100,recipient:{handle:a.handle}}});
 check(other.ok,'An identical textual reference belongs independently to another authenticated actor');
 // Device approval is consumed with the terminal decline, just as with success.
 const keys=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const deviceId='synthetic-device-terminal',publicKey=b64(await webcrypto.subtle.exportKey('spki',keys.publicKey));
 check((await call(a,{action:'registerDevice',deviceId,algorithm:'ES256',publicKey,pin:'3159'})).ok,'PIN authorises the real synthetic device public key');
 const deviceBody={action:'action',type:'payment',payload:{rail:'lumo',amount:500000,recipient:{handle:b.handle}},attemptId:'device-terminal-reference'};
 const challenge=await call(a,{...deviceBody,action:'challenge',deviceId});check(challenge.ok,'Exact device challenge is created');
 const signature=b64(await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,Buffer.from(challenge.challenge,'base64url')));
 const proof={deviceId,challengeId:challenge.challengeId,signature};
 const invalid=await call(a,{...deviceBody,deviceProof:{...proof,signature:b64(new Uint8Array(64))}});check(invalid.code==='DEVICE_PROOF_INVALID','An invalid signature cannot freeze a financial attempt');
 const deviceDecline=await call(a,{...deviceBody,deviceProof:proof});check(!deviceDecline.ok&&deviceDecline.terminal,'Valid device approval can authorise a terminal decline without a PIN');
 check((await db.query('select consumed_at is not null as used from lumo_private.approved_challenges where id=$1',[challenge.challengeId])).rows[0].used,'Terminal decline consumes its device challenge atomically');
 check((await call(a,{...deviceBody,deviceProof:proof})).replayed,'Replaying the consumed challenge returns the stored outcome without another write');
 const storedAttempts=(await db.query('select result::text as result from lumo_private.approved_attempts')).rows;
 check(storedAttempts.every(x=>!x.result.includes(signature)),'No device signature is saved in financial results');

 // Create an actual PIN-approved legacy mandate, then advance only the synthetic
 // clock fixture. The worker itself runs with an empty JWT and commits normally.
 const claims={role:'authenticated',sub:a.userId,session_id:a.sessionId};
 const schedule=await rpc('lumo_rpc',{p_command:'schedule.create',p_payload:{recipientHandle:b.handle,amount:100,frequency:'once',firstDue:new Date(Date.now()+60000).toISOString(),pin:'3159',attemptId:'synthetic-schedule-create'}},claims);
 check(schedule.ok&&schedule.schedule?.id,'Real schedule command records the independently authorised mandate');
 await db.query("update lumo_private.transfer_schedules set first_due=now()-interval '1 minute',next_due=now()-interval '1 minute' where id=$1",[schedule.schedule.id]);
 const priorJournals=await journals();
 const tick=await db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claims','{}',true)");return (await tx.query('select lumo_private.run_schedules() as result')).rows[0].result;});
 check(tick.posted===1&&await journals()===priorJournals+1,'True database-worker context commits one exact scheduled posting');
 const again=await db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claims','{}',true)");return (await tx.query('select lumo_private.run_schedules() as result')).rows[0].result;});
 check(again.posted===0&&await journals()===priorJournals+1,'Completed mandate is not posted again');
 const occurrence=(await db.query('select journal_id from lumo_private.schedule_occurrences where schedule_id=$1',[schedule.schedule.id])).rows[0];
 check((await db.query('select lumo_private.scheduled_journal_authorized($1) as proof',[occurrence.journal_id])).rows[0].proof,'Commit proof matches its exact immutable occurrence and mandate');
 // Read the real proof against tampered/expired mandate fixtures, rolling every
 // alteration back. The unchanged occurrence cannot authorise these variants.
 const invalidMandates=[
  "update lumo_private.transfer_schedules set amount=amount+1 where id=$1",
  "update lumo_private.transfer_schedules set completed_occurrences=0 where id=$1",
  "update lumo_private.transfer_schedules set first_due=now()+interval '1 day' where id=$1",
  "update lumo_private.transfer_schedules set first_due=first_due-interval '1 minute',end_at=first_due-interval '30 seconds' where id=$1",
  "update lumo_private.transfer_schedules set status='cancelled',next_due=null,cancelled_at=now() where id=$1",
 ];
 for(const mutation of invalidMandates){
  let denied=false;
  try{await db.transaction(async tx=>{await tx.query(mutation,[schedule.schedule.id]);denied=!(await tx.query('select lumo_private.scheduled_journal_authorized($1) as proof',[occurrence.journal_id])).rows[0].proof;throw Error('ROLLBACK_SYNTHETIC_MANDATE');});}catch(e){assert.equal(e.message,'ROLLBACK_SYNTHETIC_MANDATE');}
  check(denied,'Changed amount, invalid occurrence count, future/expired or cancelled mandate cannot back a worker posting');
 }
 let immutable=false;try{await db.query('update lumo_private.schedule_occurrences set failure_code=$1 where schedule_id=$2',['forged',schedule.schedule.id]);}catch{immutable=true;}check(immutable,'Scheduled posting evidence cannot be edited');
 const accounts=(await db.query("select id,owner_user_id from lumo_private.accounts where kind='consumer'")).rows;
 const aid=accounts.find(x=>x.owner_user_id===a.userId).id,bid=accounts.find(x=>x.owner_user_id===b.userId).id;
 let refused=false;try{await db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claims','{}',true)");await tx.query("select lumo_private.post_money($1,'transfer',1,$2,$3)",[a.userId,aid,bid]);});}catch(e){refused=/authenticated actor/.test(e.message);}check(refused&&await journals()===priorJournals+1,'An arbitrary no-JWT journal still fails the deferred guard and rolls back');
 let settingsRefused=false;try{await db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claims','{}',true)");await tx.query("select set_config('lumo.worker.authorized','true',true)");await tx.query("select lumo_private.post_money($1,'transfer',1,$2,$3)",[a.userId,aid,bid]);});}catch{settingsRefused=true;}check(settingsRefused,'A caller-set worker flag grants no posting authority');
 const grants=(await db.query("select has_function_privilege('anon','lumo_private.scheduled_journal_authorized(uuid)','execute') as anon,has_function_privilege('authenticated','lumo_private.scheduled_journal_authorized(uuid)','execute') as authenticated,has_function_privilege('service_role','lumo_private.scheduled_journal_authorized(uuid)','execute') as service,has_function_privilege('authenticated','lumo_private.run_schedules(integer)','execute') as worker")).rows[0];
 check(Object.values(grants).every(x=>x===false),'Neither proof nor worker receives wider client/service execution privileges');
 const invariant=(await db.query('select count(*) as n from (select j.id from lumo_private.journals j left join lumo_private.entries e on e.journal_id=j.id group by j.id having count(e.id)<>2 or sum(e.amount)<>0) q')).rows[0];check(Number(invariant.n)===0,'All actual canonical journals remain exactly balanced');
 console.log(JSON.stringify({passed:true,checks,migrations:applied.length,scope:'Isolated PostgreSQL + actual gateway + real synthetic device signatures; no hosted connections or writes',terminalDeclineFrozen:true,wrongPinCorrectable:true,noJwtWorkerCommits:true,arbitraryNoJwtJournalRejected:true,grantsUnchanged:true}));
}finally{await db.close();}
