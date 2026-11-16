import test from 'node:test';
import assert from 'node:assert/strict';
import {SignJWT,generateKeyPair,exportJWK,createLocalJWKSet,jwtVerify,decodeJwt} from 'jose';
import {createVercelProofVerifier} from '../supabase/functions/lumo-lux-quota/vercel-proof.mjs';
import {createQuotaHandler} from '../supabase/functions/lumo-lux-quota/handler.mjs';
const pair=await generateKeyPair('RS256'),jwk=await exportJWK(pair.publicKey);jwk.kid='review-key';
const expected={iss:'https://oidc.vercel.com/williedark-6795',aud:'https://vercel.com/williedark-6795',sub:'owner:williedark-6795:project:lumo-connected-pilot:environment:production',owner:'williedark-6795',owner_id:'team_OPfmdrLsTwXjPhqTwBtctJzP',project:'lumo-connected-pilot',project_id:'prj_CtYjW81x8T0lsX37HJDuE2D7sbrv',environment:'production'};
const token=async changes=>{const now=Math.floor(Date.now()/1000);return new SignJWT({...expected,iat:now,nbf:now,exp:now+3600,...changes}).setProtectedHeader({alg:'RS256',kid:'review-key'}).sign(pair.privateKey);};
const verify=createVercelProofVerifier({jwtVerify,decodeJwt,createRemoteJWKSet:url=>{assert.match(url.href,/^https:\/\/oidc\.vercel\.com(?:\/williedark-6795)?\/\.well-known\/jwks$/);return createLocalJWKSet({keys:[jwk]});}});
test('only signed production proofs for the exact two approved workloads are accepted',async()=>{
 assert.equal(await verify(await token({})),true);
 assert.equal(await verify(await token({iss:'https://oidc.vercel.com'})),true);
 assert.equal(await verify(await token({project:'lumo-merchant',project_id:'prj_ojLlx4gBQypX5q0Bx0Hd9QPpXllA',sub:'owner:williedark-6795:project:lumo-merchant:environment:production'})),true);
 for(const change of [{iss:'https://attacker.test'},{aud:'another-service'},{owner_id:'another-team'},{owner:'another-team'},{project_id:'another-project'},{project:'another-project'},{environment:'preview'},{sub:'another-subject'},{exp:1},{nbf:Math.floor(Date.now()/1000)+300},{iat:Math.floor(Date.now()/1000)-8000}])assert.equal(await verify(await token(change)),false,JSON.stringify(change));
 const good=await token({}),parts=good.split('.');parts[1]=Buffer.from(JSON.stringify({...expected,exp:9999999999})).toString('base64url');assert.equal(await verify(parts.join('.')),false);
 assert.equal(await verify('not-a-token'),false);assert.equal(await verify(undefined),false);
});
const actor='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
const userToken='e30.'+Buffer.from(JSON.stringify({sub:actor,session_id:session})).toString('base64url')+'.sig';
const request=({proof='verified-runtime',auth=userToken,body='{}',method='POST'}={})=>new Request('https://edge.example/lumo-lux-quota',{method,headers:{'content-type':'application/json','x-lumo-workload-proof':proof,authorization:'Bearer '+auth},...(method==='POST'?{body}:{})});
test('a customer token alone or invalid workload cannot consume any quota or reach Auth',async()=>{
 let calls=0;const handler=createQuotaHandler({supabaseUrl:'https://project.example',serviceRoleKey:'EDGE_SECRET',verifyServerProof:async p=>p==='verified-runtime',fetch:async()=>{calls++;throw Error();}});
 for(const args of [{proof:''},{proof:'customer-jwt'},{proof:'forged-runtime'},{method:'GET'}])assert.ok((await handler(request(args))).status>=400);assert.equal(calls,0);
});
test('server proof and independently checked customer/session select the reservation actor',async()=>{
 const calls=[];const handler=createQuotaHandler({supabaseUrl:'https://project.example',serviceRoleKey:'EDGE_SECRET',verifyServerProof:async()=>true,fetch:async(url,init)=>{calls.push({url,...init});return new Response(JSON.stringify(url.endsWith('/user')?{id:actor,app_metadata:{lumo_pilot:true}}:{allowed:true}));}});
 const result=await handler(request());assert.deepEqual(await result.json(),{allowed:true});assert.equal(result.headers.get('access-control-allow-origin'),null);
 assert.deepEqual(JSON.parse(calls[1].body),{p_payload:{actor,session}});assert.equal(calls[1].headers.Authorization,'Bearer EDGE_SECRET');assert.equal(calls[0].headers.Authorization,'Bearer '+userToken);assert.doesNotMatch(calls[1].body,/verified-runtime|EDGE_SECRET/);
 calls.length=0;assert.equal((await handler(request({body:JSON.stringify({actor:'spoofed'})}))).status,400);assert.equal(calls.length,0);
 assert.equal((await handler(request({body:' '.repeat(65)+'{}'}))).status,400);assert.equal(calls.length,0);
});
test('Auth mismatch and unavailable reservation fail closed without disclosing upstream details',async()=>{
 let quota=0;const handler=createQuotaHandler({supabaseUrl:'https://project.example',serviceRoleKey:'EDGE_SECRET',verifyServerProof:async()=>true,fetch:async url=>{if(url.endsWith('/user'))return new Response(JSON.stringify({id:'33333333-3333-4333-8333-333333333333',app_metadata:{lumo_pilot:true}}));quota++;return new Response('{"allowed":true}');}});
 assert.equal((await handler(request())).status,401);assert.equal(quota,0);
});
