import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {createWebSessionHandler} from '../api/web-session.mjs';
import {trustedWebProxyIp} from '../backend/supabase/functions/lumo-approved/web-proxy-context.mjs';
const key=Buffer.alloc(32,12).toString('base64url'),origin='https://lumo-connected-pilot.vercel.app';
const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),privateKey=pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64url'),publicKeys={test:pair.publicKey.export({format:'jwk'})};
const body={action:'login',handle:'test_actor',password:'private-test-only'};
async function signed(ip){let captured;const run=createWebSessionHandler({key,origin,proxySigningKey:privateKey,proxyKeyId:'test',proxyPublicKeys:publicKeys,clientIp:ip,requireProxyContext:true,fetcher:async(url,init)=>{captured=new Request(url,{method:'POST',headers:init.headers,body:init.body});return new Response('{"ok":false}',{status:401});}});const p=await run({headers:{origin,'x-lumo-web':'1'},body:{operation:'probe'}});const cookie=p.cookies.map(value=>value.split(';')[0]).join('; ');await run({headers:{origin,'x-lumo-web':'1',cookie},body:{operation:'proxy',path:'/functions/v1/lumo-approved',body,probe:p.body.probe,authenticated:false}});return captured;}
test('ES256 proof keeps real client rate buckets distinct without exposing IP or accepting spoofed client headers',async()=>{
 const a=await signed('192.0.2.1'),b=await signed('192.0.2.2'),a2=await signed('192.0.2.1');
 const known=await trustedWebProxyIp(a,body,{publicKeys});assert.match(known,/^web-proxy:[a-f0-9]{64}$/);assert.equal(known,await trustedWebProxyIp(a2,body,{publicKeys}));assert.notEqual(known,await trustedWebProxyIp(b,body,{publicKeys}));assert.doesNotMatch([...a.headers].flat().join(' '),/192\.0\.2\.1|private-test-only/);
 assert.equal(await trustedWebProxyIp(new Request(a.url,{headers:{'x-forwarded-for':'192.0.2.1','x-lumo-web-context':a.headers.get('x-lumo-web-context')}}),body,{publicKeys}),null);
});
test('proof is bound to original body, fixed function audience, public key and short time window',async()=>{
 const req=await signed('192.0.2.1');
 assert.equal(await trustedWebProxyIp(req,{...body,handle:'victim'},{publicKeys}),null);
 assert.equal(await trustedWebProxyIp(new Request(req.url.replace('lumo-approved','lumo-access'),{headers:req.headers}),body,{publicKeys}),null);
 assert.equal(await trustedWebProxyIp(req,body,{publicKeys:{}}),null);
 assert.equal(await trustedWebProxyIp(req,body,{publicKeys,now:()=>Date.now()+61000}),null);
 assert.match(await trustedWebProxyIp(new Request('https://edge.example/lumo-approved',{headers:req.headers}),body,{publicKeys}),/^web-proxy:/);
 assert.equal(req.headers.get('x-lumo-web-signature').length,128);
});
test('hosted signer rejects mismatched public/private key material before any upstream call',async()=>{
 let calls=0;const run=createWebSessionHandler({key,proxySigningKey:privateKey,clientIp:'192.0.2.1',requireProxyContext:true,fetcher:async()=>{calls++;}});
 const out=await run({headers:{origin,'x-lumo-web':'1'},body:{operation:'proxy',path:'/functions/v1/lumo-approved',body,authenticated:false}});assert.equal(out.status,503);assert.equal(calls,0);
});
