// Isolated PostgreSQL + actual merchant HTTP adapter. Synthetic identities only.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {bootLedger} from '../consumer-loyalty-2.13.0/local-ledger.mjs';
import {createMerchantHandler,hydrateMerchantNetwork} from '../../supabase/functions/lumo-approved/merchant/handler.mjs';
import {hashToken} from '../../supabase/functions/lumo-approved/merchant/server/network.js';
import {createConsumerLoyalty} from '../../supabase/functions/lumo-approved/consumer-loyalty.mjs';
import {normalizeLoyalty} from '../../supabase/functions/lumo-approved/merchant/dist/loyalty-model.js';
import {createApprovedHandler} from '../../supabase/functions/lumo-approved/handler.mjs';

const migration='20261118054212_merchant_read_scaling_boundaries.sql';
const {db,applied}=await bootLedger({through:'20261117999999'});
const calls=[],uuid=()=>crypto.randomUUID();let checks=0,metadataConflicts=0,concurrentReadGate=null;
const check=(value,label)=>{assert.ok(value,label);checks++;};
const types={p_actor:'uuid',p_session:'uuid',p_token_hash:'text',p_revision:'bigint',p_ledger_stamp:'text',p_state:'jsonb',p_money_authorized:'boolean',p_command:'text',p_payload:'jsonb',p_request:'uuid',p_shop:'uuid',p_test_key:'text'};
async function rpc(name,args={},claims={role:'service_role'}){
 calls.push({name,args:structuredClone(args)});
 const value=await db.transaction(async tx=>{
  await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(claims)]);
  const entries=Object.entries(args),parameters=entries.map(([key],i)=>key+'=>$'+(i+1)+'::'+types[key]).join(',');
  const result=await tx.query('select public.'+name+'('+parameters+') as value',entries.map(([,value])=>value&&typeof value==='object'?JSON.stringify(value):value));
  const value=result.rows[0].value;if(name==='lumo_approved_merchant_commit'&&value?.code==='CONCURRENT_UPDATE')metadataConflicts++;
  return value;
 });
 // Hold the two completed reads outside any transaction so both HTTP requests
 // race from one revision. PGlite serialises transactions on one connection;
 // this verifies the real SQL stale-CAS/retry protocol, not lock throughput.
 const gate=concurrentReadGate;if(gate&&name==='lumo_approved_merchant_read'&&gate.arrived<2){gate.arrived++;if(gate.arrived===2)gate.release();await gate.ready;}
 return value;
}
const api=createMerchantHandler({serviceRpc:rpc,prototypeFaceOnly:true,readScalingEnabled:true,retryDelay:async()=>{}});
async function call(who,path,body){return api({identity:who,body:{path,method:body?'POST':'GET',body:body||{},merchantToken:who?.token||''}});}
async function owner(label){
 const userId=uuid(),sessionId=uuid(),handle='scope_'+label;
 await db.query("insert into auth.users(id,email,raw_app_meta_data) values($1,$2,'{\"lumo_pilot\":true}')",[userId,handle+'@pilot.lumo.invalid']);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
 const provision=await rpc('lumo_approved_service',{p_command:'provision',p_payload:{actor:userId,session:sessionId,handle,displayName:'Synthetic '+label,pin:'482951',mode:'merchant'}});
 check(provision.ok,'shared identity provisioned: '+JSON.stringify(provision));
 const who={userId,sessionId,user:{email:handle+'@pilot.lumo.invalid'}};
 const signup=await call(who,'/api/signup',{attemptId:'scope-signup-'+uuid(),name:'Scope '+label,ownerName:'Synthetic '+label,phone:label==='a'?'0241110001':'0241110002',businessType:'sole-trader',destination:'Sandbox only',verification:{identity:true,face:true},shop:{name:'Counter '+label,area:'Legon',category:'Food',lat:5.65,lng:-.18},credentials:{username:handle,password:'ScopeFixtureStrong2026'}});
 check(signup.ok,'merchant signup: '+JSON.stringify(signup.message));
 return {...who,token:signup.merchantToken,businessId:signup.state.business.id,shopId:signup.state.shops[0].id};
}
try{
 const publicationBefore=(await db.query("select pg_get_functiondef('lumo_private.approved_merchant_payment_guard()'::regprocedure) as definition")).rows[0].definition;
 await db.exec(await readFile(new URL('../../supabase/migrations/'+migration,import.meta.url),'utf8'));
 const publicationAfter=(await db.query("select pg_get_functiondef('lumo_private.approved_merchant_payment_guard()'::regprocedure) as definition")).rows[0].definition;
 const oldLookup="select item.value into shop from lumo_private.approved_merchant_network n cross join lateral jsonb_each(n.document->'businesses') business cross join lateral jsonb_array_elements(business.value->'shops') item where item.value->>'id'=new.shop_id::text;";
 assert.equal(publicationAfter,publicationBefore.replace(oldLookup,"select jsonb_build_object('published',a.published) into shop from lumo_private.approved_shop_access a where a.shop_id=new.shop_id;"),'publication optimisation preserves every other current posting guard, including pending guest reservations');checks++;
 const [a,b]=[await owner('a'),await owner('b')];
 async function change(who,mutate){const loaded=await rpc('lumo_approved_merchant_read',{p_actor:who.userId,p_session:who.sessionId});mutate(loaded.state);const saved=await rpc('lumo_approved_merchant_commit',{p_actor:who.userId,p_session:who.sessionId,p_revision:loaded.revision,p_ledger_stamp:loaded.ledgerStamp,p_state:loaded.state,p_money_authorized:false});check(saved.ok,'fixture metadata commits');}
 await change(a,n=>{n.businesses[a.businessId].shops[0].published=true;});
 await change(b,n=>{n.businesses[b.businessId].shops[0].published=true;});
 const payerId=uuid(),payerSession=uuid();
 await db.query("insert into auth.users(id,email,raw_app_meta_data) values($1,'scope_payer@pilot.lumo.invalid','{\"lumo_pilot\":true}')",[payerId]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[payerSession,payerId]);
 check((await rpc('lumo_approved_service',{p_command:'provision',p_payload:{actor:payerId,session:payerSession,handle:'scope_payer',displayName:'Synthetic payer',mode:'consumer',pin:'482951'}})).ok,'payer identity provisioned');
 const payerClaims={role:'authenticated',sub:payerId,session_id:payerSession};
 check((await rpc('lumo_rpc',{p_command:'wallet.fund',p_payload:{amount:10000,confirmSandbox:true,attemptId:'scope-payer-fund-1'}},payerClaims)).ok,'actual balanced test funding');
 // Trusted local fixture invokes the actual private posting primitive. This
 // exercises real balanced journals; it does not claim to test payment consent.
 for(const who of [a,b])await db.transaction(async tx=>{
  await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(payerClaims)]);
  const posting=await tx.query("select lumo_private.post_money($1,'merchant_payment',500,(select id from lumo_private.accounts where owner_user_id=$1 and kind='consumer'),(select account_id from lumo_private.merchants where id=$2),$3) as journal",[payerId,who.businessId,who.shopId]);
  check(!!posting.rows[0].journal,'actual canonical shop journal fixture');
 });
 const directory=await rpc('lumo_approved_public_directory');
 check(directory.ok&&directory.shops.length===2,'normalised public directory lists both shops');
 check(!/password|tokenHash|testAcceptanceToken|_sharedUserId|transactions|_claimGrants/.test(JSON.stringify(directory)),'directory contains public allowlist only');
 const directoryStart=calls.length,publicReply=await call(null,'/api/directory');
 check(publicReply.ok&&publicReply.shops.length===2,'actual public wrapper uses normalised directory');
 check(calls.length===directoryStart+1&&calls.at(-1).name==='lumo_approved_public_directory','public read never loads network or ledger');
 const scoped=await rpc('lumo_approved_merchant_read_scoped',{p_actor:a.userId,p_session:a.sessionId,p_token_hash:await hashToken(a.token)});
 const whole=await rpc('lumo_approved_merchant_read',{p_actor:a.userId,p_session:a.sessionId});
 const byteSize=value=>new TextEncoder().encode(JSON.stringify(value)).length;
 const measurements={fixtureBusinesses:2,fullSnapshotBytes:byteSize(whole),tenantSnapshotBytes:byteSize(scoped),publicDirectoryBytes:byteSize(directory),fullLedgerRows:whole.ledger.length,tenantLedgerRows:scoped.ledger.length};
 check(scoped.ok&&scoped.readOnly===true&&scoped.ledgerStamp===null,'tenant projection is explicitly display-only');
 check(JSON.stringify(Object.keys(scoped.state.businesses))===JSON.stringify([a.businessId]),'tenant read excludes other business');
 check(scoped.state.users.every(u=>u.businessId===a.businessId)&&scoped.state.sessions.every(s=>s.businessId===a.businessId),'other tenant users and sessions excluded');
 check(scoped.ledger.length===1&&scoped.ledger[0].merchantId===a.businessId&&scoped.ledger[0].amount===500,'actual canonical receipt is tenant-scoped with other merchant excluded');
 check(scoped.requests.every(r=>r.shopId===a.shopId)&&Object.keys(scoped.balances).every(id=>id===a.businessId),'canonical projections stay tenant-scoped');
 const fixed=await call(a,'/api/action',{type:'CREATE_REQUEST',payload:{shopId:a.shopId,amount:250,description:'Synthetic bound reward fixture',attemptId:'scope-bound-request-'+uuid()}});
 check(fixed.ok&&fixed.entity?.id,'actual merchant creates fixed request');
 const requestId=fixed.entity.id;
 await change(a,n=>{n.businesses[a.businessId].requests.find(r=>r.id===requestId)._consumerUserId=payerId;});
 const journalCount=Number((await db.query('select count(*) as n from lumo_private.journals')).rows[0].n);
 await assert.rejects(db.transaction(async tx=>{
  await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:b.userId,session_id:b.sessionId})]);
  await tx.query("select lumo_private.post_money($1,'merchant_payment',250,(select id from lumo_private.accounts where owner_user_id=$2 and kind='consumer'),(select account_id from lumo_private.merchants where id=$3),$4,$5)",[b.userId,payerId,a.businessId,a.shopId,requestId]);
 }),error=>error.code==='P0001'&&error.message==='REQUEST_UNAVAILABLE');checks++;
 check(Number((await db.query('select count(*) as n from lumo_private.journals')).rows[0].n)===journalCount,'indexed original-payer guard rejects without a journal');
 const bound=(await db.query('select consumer_user_id from lumo_private.approved_consumer_request_binding where request_id=$1',[requestId])).rows[0];
 check(bound?.consumer_user_id===payerId,'request binding projection is atomic with metadata');
 const rewards=createConsumerLoyalty({serviceRpc:rpc,requestContextEnabled:true});
 await change(a,n=>{const tenant=n.businesses[a.businessId];tenant.loyalty=normalizeLoyalty({members:[{id:'scope-private-membership',_consumerUserId:payerId}],collections:[{id:'scope-private-collection',requestId,memberId:'scope-private-membership',grossAmount:400,discount:150,amount:250,rewardId:'scope-private-reward'}]});});
 const contextStart=calls.length,ownContext=await rewards.assertRequest({userId:payerId,sessionId:payerSession},requestId);
 assert.deepEqual(ownContext,{grossAmount:400,discount:150,amount:250,membershipId:'scope-private-membership',rewardId:'scope-private-reward'});checks++;
 check(calls.length===contextStart+1&&calls.at(-1).name==='lumo_approved_reward_request_context','actual reward quote adapter performs only the private indexed point lookup');
 await assert.rejects(rewards.assertRequest({userId:b.userId,sessionId:b.sessionId},requestId),error=>error.code==='REQUEST_UNAVAILABLE'&&error.status===403);checks++;
 const gateway=createApprovedHandler({supabaseUrl:'https://fixture.supabase.co',serviceRoleKey:'synthetic-local-service',loyaltyReadScalingEnabled:true,fetch:async(url,options)=>{
  const path=new URL(url).pathname,json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  const claims=JSON.parse(Buffer.from(options.headers.Authorization.split(' ')[1].split('.')[1]||'e30','base64url').toString());
  if(path==='/auth/v1/user')return json({id:claims.sub,app_metadata:{lumo_pilot:true}});
  if(path.startsWith('/rest/v1/rpc/'))return json(await rpc(path.split('/').at(-1),JSON.parse(options.body),path.endsWith('/lumo_rpc')?{...claims,role:'authenticated'}:{role:'service_role'}));
  throw Error('Unexpected local gateway transport path '+path);
 }});
 const gatewayQuote=async(userId,sessionId)=>{const token='e30.'+Buffer.from(JSON.stringify({sub:userId,session_id:sessionId})).toString('base64url')+'.synthetic';return gateway(new Request('https://fixture.invalid/functions/v1/lumo-approved',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'quote',shopId:a.shopId,requestId})}));};
 const gatewayStart=calls.length,quoted=await gatewayQuote(payerId,payerSession),quoteBody=await quoted.json();
 check(quoted.status===200&&quoteBody.ok&&quoteBody.loyalty?.membershipId==='scope-private-membership','actual approved HTTP gateway enables indexed context with canonical SQL payment quote');
 check(!calls.slice(gatewayStart).some(c=>c.name==='lumo_approved_merchant_read'),'production-enabled quote path does not load the complete merchant network');
 const wrongQuote=await gatewayQuote(b.userId,b.sessionId);check(wrongQuote.status===403&&(await wrongQuote.json()).code==='REQUEST_UNAVAILABLE','actual approved HTTP quote preserves wrong-payer rejection');
 await change(a,n=>{delete n.businesses[a.businessId].requests.find(r=>r.id===requestId)._consumerUserId;});
 assert.deepEqual(await rewards.assertRequest({userId:b.userId,sessionId:b.sessionId},requestId),{grossAmount:400,discount:150,amount:250},'cashier bearer discount exposes amounts without another customer membership or reward identifiers');checks++;
 check(await rewards.assertRequest({userId:b.userId,sessionId:b.sessionId},uuid())===null,'ordinary unknown request has no reward context');
 await change(a,n=>{n.businesses[a.businessId].requests.find(r=>r.id===requestId)._consumerUserId=payerId;n.businesses[a.businessId].loyalty.collections=[];});
 check(await rewards.assertRequest({userId:payerId,sessionId:payerSession},requestId)===null,'collection removal atomically removes private reward quote context');
 const before=hydrateMerchantNetwork(await rpc('lumo_approved_merchant_read',{p_actor:b.userId,p_session:b.sessionId})).businesses[b.businessId];
 // A GET can prepare legacy missing private QR tokens. The adapter must discard
 // its partial draft and rerun from full authority before any such commit.
 await change(a,n=>{delete n.businesses[a.businessId].shops[0].testAcceptanceToken;});
 const readStart=calls.length,session=await call(a,'/api/session');
 check(session.ok,'GET with metadata reconciliation succeeds');
 const recent=calls.slice(readStart),commit=recent.find(c=>c.name==='lumo_approved_merchant_commit');
 check(recent.some(c=>c.name==='lumo_approved_merchant_read_scoped'),'GET began from scoped projection');
 check(commit&&Object.keys(commit.args.p_state.businesses).length===2,'metadata reconciliation committed complete authority');
 const after=hydrateMerchantNetwork(await rpc('lumo_approved_merchant_read',{p_actor:b.userId,p_session:b.sessionId})).businesses[b.businessId];
 assert.deepEqual(after,before,'scoped GET never erases or changes unrelated tenant');checks++;
 await db.exec("create temporary table scale_shop_updates(merchant_id uuid);create function pg_temp.track_scale_shop_update() returns trigger language plpgsql as $$begin insert into pg_temp.scale_shop_updates values(new.merchant_id);return new;end$$;create trigger readiness_scale_shop_update after update on lumo_private.shops for each row execute function pg_temp.track_scale_shop_update();");
 await change(a,n=>{n.businesses[a.businessId].shops[0].hours='Synthetic updated hours';});
 const writes=(await db.query('select merchant_id,count(*) as n from pg_temp.scale_shop_updates group by merchant_id')).rows;
 check(writes.some(r=>r.merchant_id===a.businessId)&&!writes.some(r=>r.merchant_id===b.businessId),'changing one business does not rewrite another business canonical shop rows');
 await db.exec('drop trigger readiness_scale_shop_update on lumo_private.shops;');
 concurrentReadGate={arrived:0};concurrentReadGate.ready=new Promise(resolve=>{concurrentReadGate.release=resolve;});
 const concurrent=await Promise.all([call(a,'/api/action',{type:'UPDATE_SHOP',payload:{id:a.shopId,hours:'Synthetic concurrent A'}}),call(b,'/api/action',{type:'UPDATE_SHOP',payload:{id:b.shopId,hours:'Synthetic concurrent B'}})]);concurrentReadGate=null;
 check(concurrent.every(reply=>reply.ok),'concurrent actual merchant HTTP metadata updates both complete through canonical SQL CAS');
 const concurrencyState=(await rpc('lumo_approved_merchant_read',{p_actor:a.userId,p_session:a.sessionId})).state;
 check(concurrencyState.businesses[a.businessId].shops[0].hours==='Synthetic concurrent A'&&concurrencyState.businesses[b.businessId].shops[0].hours==='Synthetic concurrent B','cross-merchant concurrent retries preserve both tenant changes');
 check(metadataConflicts>0,'test observes the still-shared metadata revision conflict instead of claiming tenant write isolation');
 // A relevant access-record change must still project even if the business JSON
 // itself is unchanged. This prevents the write optimisation hiding revocation.
 await change(a,n=>{n.users.push({id:'synthetic-cashier-access',businessId:a.businessId,role:'cashier',active:true,shopIds:[a.shopId],_sharedUserId:payerId});});
 check((await db.query('select status from lumo_private.staff_memberships where shop_id=$1 and user_id=$2',[a.shopId,payerId])).rows[0]?.status==='active','user-only access creation still projects to canonical membership');
 await change(a,n=>{n.users.find(u=>u.id==='synthetic-cashier-access').active=false;});
 check((await db.query('select status from lumo_private.staff_memberships where shop_id=$1 and user_id=$2',[a.shopId,payerId])).rows[0]?.status==='removed','user-only revocation still projects to canonical membership');
 await change(a,n=>{n.businesses[a.businessId].shops[0].published=false;});
 check((await rpc('lumo_approved_public_directory')).shops.every(s=>s.id!==a.shopId),'unpublish removes directory projection transactionally');
 const unpublished=await rpc('lumo_approved_merchant_read',{p_actor:a.userId,p_session:a.sessionId});
 const privateToken=unpublished.state.businesses[a.businessId].shops[0].testAcceptanceToken;
 // Explicitly typed service lookup; the raw key is synthetic and never emitted.
 const access=async key=>db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");return (await tx.query('select public.lumo_approved_merchant_access($1,$2) as value',[a.shopId,key])).rows[0].value;});
 check((await access(privateToken)).ok===true,'indexed private test token preserves unpublished QR access');
 check((await access('f'.repeat(64))).code==='SHOP_NOT_READY','wrong private key is still rejected');
 const storedKey=(await db.query('select test_key_hash from lumo_private.approved_shop_access where shop_id=$1',[a.shopId])).rows[0].test_key_hash;
 check(/^[0-9a-f]{64}$/.test(storedKey)&&storedKey!==privateToken,'private lookup cache stores only a test-key hash');
 await db.query("update lumo_private.accounts set status='suspended' where id=(select account_id from lumo_private.merchants where id=$1)",[b.businessId]);
 check((await rpc('lumo_approved_public_directory')).shops.find(s=>s.id===b.shopId).accepting===false,'canonical account suspension immediately pauses public acceptance');
 await db.query('update auth.sessions set not_after=now()-interval \'1 second\' where id=$1',[a.sessionId]);
 check((await rpc('lumo_approved_merchant_read_scoped',{p_actor:a.userId,p_session:a.sessionId,p_token_hash:await hashToken(a.token)})).code==='SESSION_REVOKED','expired Auth session cannot read tenant projection');
 await assert.rejects(rewards.assertRequest({userId:a.userId,sessionId:a.sessionId},requestId),error=>error.code==='SESSION_REVOKED'&&error.status===401);checks++;
 const privileges=await db.query("select has_function_privilege('anon','public.lumo_approved_public_directory()','execute') as anon_directory,has_function_privilege('authenticated','public.lumo_approved_merchant_read_scoped(uuid,uuid,text)','execute') as client_snapshot,has_function_privilege('authenticated','public.lumo_approved_reward_request_context(uuid,uuid,uuid)','execute') as client_context");
 check(!privileges.rows[0].anon_directory&&!privileges.rows[0].client_snapshot&&!privileges.rows[0].client_context,'new RPCs remain service-only');
 const definition=(await db.query("select pg_get_functiondef('public.lumo_approved_public_directory()'::regprocedure) as definition")).rows[0].definition;
 check(!/from\s+lumo_private\.(journals|payment_requests|approved_merchant_refunds)/i.test(definition),'public function has no financial history read');
 const lockDefinition=(await db.query("select pg_get_functiondef('public.lumo_approved_merchant_commit(uuid,uuid,bigint,text,jsonb,boolean)'::regprocedure) as definition")).rows[0].definition;
 check(lockDefinition.includes('m.account_id=a.id and lumo_private.merchant_projection_changed(saved.document,p_state,m.id)'),'financial account locks restricted to changed businesses');
 check(lockDefinition.includes('if not lumo_private.merchant_projection_changed(saved.document,p_state,merchant_id) then continue;end if;'),'unchanged businesses do not rewrite canonical shops and staff');
 const pointGuards=(await db.query("select pg_get_functiondef('lumo_private.approved_merchant_payment_guard()'::regprocedure) as publication,pg_get_functiondef('lumo_private.guard_consumer_loyalty_payer()'::regprocedure) as payer")).rows[0];
 check(!pointGuards.publication.includes('approved_merchant_network')&&!pointGuards.payer.includes('approved_merchant_network'),'canonical guards no longer unpack the project-wide JSON');
 const contextDefinition=(await db.query("select pg_get_functiondef('public.lumo_approved_reward_request_context(uuid,uuid,uuid)'::regprocedure) as definition")).rows[0].definition;
 check(!contextDefinition.includes('approved_merchant_network')&&!contextDefinition.includes('lumo_private.journals'),'reward quote context never loads complete merchant metadata or financial histories');
 const cacheGrants=(await db.query("select has_table_privilege('authenticated','lumo_private.approved_shop_access','select') as shop,has_table_privilege('authenticated','lumo_private.approved_consumer_request_binding','select') as payer,has_table_privilege('authenticated','lumo_private.approved_reward_request_context','select') as reward")).rows[0];
 check(!cacheGrants.shop&&!cacheGrants.payer&&!cacheGrants.reward,'private guard caches expose no client table grants');
 const reconciled=(await db.query(await readFile(new URL('./merchant-read-scaling-validation.sql',import.meta.url),'utf8'))).rows[0];
 check(reconciled.validation_passed,'read-only source/cache reconciliation finds no missing, extra or changed projection rows: '+JSON.stringify(reconciled.mismatch_counts));
 const evidence={passed:true,checks,baselineMigrations:applied.length,migration,measurements,metadataConflicts,tenantReadOnly:true,publicDirectoryFinancialRead:false,partialDraftCommit:false,otherTenantPreserved:true,fullWriteNormalisationCompleted:false,loyaltyLifetimeCapsRetained:true,hostedWrites:false};
 console.log(JSON.stringify(evidence,null,2));
 if(process.env.LUMO_SCALE_EVIDENCE)await writeFile(process.env.LUMO_SCALE_EVIDENCE,JSON.stringify(evidence,null,2)+'\n');
}finally{await db.close();}
