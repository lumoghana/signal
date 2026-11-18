import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebSessionHandler} from '../api/web-session.mjs';
import {createApprovedService,APPROVED_CONFIG} from '../dist/js/approved-service.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const ORIGIN='https://lumo-connected-pilot.vercel.app';
const key=Buffer.alloc(32,57).toString('base64url');
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),m};};
function fixture(){
 const tokens=new Map(),refreshes=new Map(),cookieJar=new Map(),calls=[];let count=0,clock=Date.now();
 const auth=(id)=>{const sid='session-'+(++count),s={user:{id,email:(id===A?'a':'b')+'@pilot.lumo.invalid'},access_token:'SERVER_ACCESS_'+count,refresh_token:'SERVER_REFRESH_'+count,expires_at:Math.floor(clock/1000)+3600,sid};tokens.set(s.access_token,s);refreshes.set(s.refresh_token,s);return s;};
 const fresh=auth(A);
 const fetcher=async(url,init)=>{
  const body=JSON.parse(init.body),path=new URL(url).pathname,token=init.headers.Authorization?.replace('Bearer ',''),current=tokens.get(token);calls.push({path,body,token});
  if(path.endsWith('/token')){const old=refreshes.get(body.refresh_token);if(!old||old.revoked)return response({ok:false},401);const next={...auth(old.user.id),sid:old.sid};tokens.set(next.access_token,next);refreshes.set(next.refresh_token,next);return response(next);}
  if(path.endsWith('/logout')){if(current)for(const v of [...tokens.values(),...refreshes.values()])if(v.sid===current.sid)v.revoked=true;return response({ok:true});}
  if(path.endsWith('lumo-approved')&&body.action==='login'){const s=auth(body.handle==='b'?B:A);return response({ok:true,account:{userId:s.user.id},session:s});}
  if(path.endsWith('lumo-approved')&&body.action==='merchant')return response({ok:true,shops:[]});
  if(!current||current.revoked)return response({ok:false,code:'SESSION_REVOKED'},401);
  return response({ok:true,account:{userId:current.user.id},result:{ok:true},echo:body,access_token:'MUST_NOT_ESCAPE',nested:{refresh_token:'MUST_NOT_ESCAPE'}});
 };
 const options={key,origin:ORIGIN,fetcher,now:()=>clock,lux:async({authorization})=>({status:200,body:{ok:true,owner:tokens.get(authorization.replace('Bearer ',''))?.user.id,answer:{title:'Recorded money'}}})};
 const run=createWebSessionHandler(options),headers=()=>({'origin':ORIGIN,'sec-fetch-site':'same-origin','x-lumo-web':'1',cookie:[...cookieJar].map(([k,v])=>k+'='+v).join('; ')});
 const apply=result=>{for(const cookie of result.cookies||[]){const [pair]=cookie.split(';'),at=pair.indexOf('='),n=pair.slice(0,at),v=pair.slice(at+1);if(cookie.includes('Max-Age=0;'))cookieJar.delete(n);else cookieJar.set(n,v);}};
 const call=async body=>{
  if((body.operation==='migrate'||body.operation==='proxy'&&['login','register'].includes(body.body?.action))&&!body.probe){const p=await run({headers:headers(),body:{operation:'probe'}});apply(p);body={...body,probe:p.body.probe};}
  const r=await run({headers:headers(),body});apply(r);return r;
 };
 const browser=async(url,init)=>{assert.equal(url,'/api/web-session');assert.equal(init.credentials,'same-origin');assert.equal(init.headers.Authorization,undefined);const r=await call(JSON.parse(init.body));return response(r.body,r.status);};
 const locks={tail:Promise.resolve(),request(name,opts,work){if(typeof opts==='function')work=opts;const p=this.tail.then(work);this.tail=p.catch(()=>{});return p;}};
 // Storage locks and HTTP locks are independent browser Web Locks, not one
 // recursive mutex. The deterministic fixture models named lock queues.
 const namedLocks={queues:new Map(),request(name,opts,work){if(typeof opts==='function')work=opts;const prev=this.queues.get(name)||Promise.resolve(),p=prev.then(work);this.queues.set(name,p.catch(()=>{}));return p;}};
 const storage=memory(),pending='lumo-approved-pending-v1',service=createApprovedService({config:{...APPROVED_CONFIG,webSession:true},storage,modeStorage:memory(),lockManager:namedLocks,fetch:browser});
 return {run,call,apply,headers,options,lockManager:namedLocks,cookieJar,calls,tokens,refreshes,fresh,storage,service,pending,advance(ms){clock+=ms;}};
}
test('browser login keeps actual credentials in authenticated HttpOnly cookies only and supports private service/Lux routes',async()=>{
 const f=fixture();assert.equal((await f.service.login('a','not-transmitted-to-any-other-service')).ok,true);assert.equal(f.service.signedIn,true);
 const saved=f.storage.getItem('lumo-approved-session-v1');assert.doesNotMatch(saved,/access_token|refresh_token|SERVER_ACCESS|SERVER_REFRESH/);
 assert.equal(f.cookieJar.size,1);assert.ok([...f.cookieJar.keys()][0].startsWith('__Host-lumo-s-'));
 assert.equal((await f.service.snapshot()).ok,true);assert.equal((await f.service.askLux('What is left?',{})).ok,true);
 const raw=await f.call({operation:'proxy',path:'/functions/v1/lumo-approved',body:{action:'snapshot'},authenticated:true,generation:JSON.parse(saved).webSessionId,version:JSON.parse(saved).webSessionVersion,owner:A});
 assert.doesNotMatch(JSON.stringify(raw.body),/MUST_NOT_ESCAPE|SERVER_ACCESS|SERVER_REFRESH/);
 const logout=await f.service.signOut();assert.equal(logout.ok,true);assert.equal(f.service.signedIn,false);assert.equal(f.cookieJar.size,0);
});
test('legacy session migrates only after same-account upstream verification and cookie acknowledgement, preserving the original payment journal',async()=>{
 const f=fixture();f.storage.setItem('lumo-approved-session-v1',JSON.stringify({...f.fresh,lumoAuthGeneration:'existing-non-secret-generation'}));f.storage.setItem(f.pending,'{"original":"original-payment-reference"}');
 const s=createApprovedService({config:{...APPROVED_CONFIG,webSession:true},storage:f.storage,modeStorage:memory(),lockManager:{request:async(n,o,w)=>w()},fetch:async(url,init)=>{const r=await f.call(JSON.parse(init.body));return response(r.body,r.status);}});
 assert.equal((await s.snapshot()).ok,true);assert.doesNotMatch(f.storage.getItem('lumo-approved-session-v1'),/SERVER_ACCESS|SERVER_REFRESH|access_token|refresh_token/);assert.equal(f.storage.getItem(f.pending),'{"original":"original-payment-reference"}');
});
test('unavailable secure-session configuration never falls back to direct credential transport',async()=>{
 const f=fixture(),run=createWebSessionHandler({...f.options,key:undefined});const result=await run({headers:f.headers(),body:{operation:'proxy',path:'/functions/v1/lumo-approved',body:{action:'login'},authenticated:false}});
 assert.equal(result.status,503);assert.equal(f.calls.length,0);assert.equal(result.cookies.length,0);
});
test('origin, custom-header, route and cookie-context checks fail closed without an open proxy',async()=>{
 const f=fixture();for(const headers of [{...f.headers(),origin:'https://attacker.example'},{...f.headers(),'x-lumo-web':undefined},{...f.headers(),'sec-fetch-site':'cross-site'}]){const r=await f.run({headers,body:{operation:'proxy',path:'/functions/v1/lumo-approved',body:{action:'login'},authenticated:false}});assert.equal(r.status,403);}
 assert.equal((await f.call({operation:'proxy',path:'https://attacker.example',body:{},authenticated:false})).status,400);
 assert.equal((await f.call({operation:'proxy',path:'/functions/v1/lumo-approved',body:{action:'snapshot'},authenticated:true,generation:'a'.repeat(32),version:'b'.repeat(24),owner:A})).status,401);
});
test('delayed old rotation cookies cannot overwrite a newer account or resurrect the selected session after logout across handler instances',async()=>{
 const f=fixture(),first=await f.call({operation:'proxy',path:'/functions/v1/lumo-approved',body:{action:'login',handle:'a'},authenticated:false});const a=first.body.session;
 const oldHeaders=f.headers();
 const old=await createWebSessionHandler(f.options)({headers:oldHeaders,body:{operation:'proxy',path:'/auth/v1/token?grant_type=refresh_token',body:{},authenticated:true,generation:a.webSessionId,version:a.webSessionVersion,owner:A}});
 const next=await f.call({operation:'proxy',path:'/functions/v1/lumo-approved',body:{action:'login',handle:'b'},authenticated:false,generation:a.webSessionId,version:a.webSessionVersion,owner:A});const b=next.body.session;
 f.apply(old);assert.ok(f.cookieJar.has('__Host-lumo-s-'+b.webSessionId+'-'+b.webSessionVersion));
 const current={operation:'proxy',path:'/functions/v1/lumo-approved',body:{action:'snapshot'},authenticated:true,generation:b.webSessionId,version:b.webSessionVersion,owner:B};assert.equal((await f.call(current)).body.account.userId,B);
 const out=await f.call({...current,path:'/auth/v1/logout?scope=local',body:{}});assert.equal(out.body.ok,true);f.apply(old);
 assert.equal((await f.call({...current,generation:a.webSessionId,version:old.body.webSessionVersion,owner:A})).status,401);
});
test('blocked HttpOnly cookie installation cannot report a successful browser login',async()=>{
 const f=fixture();const storage=memory();
 const service=createApprovedService({config:{...APPROVED_CONFIG,webSession:true},storage,modeStorage:memory(),lockManager:{request:async(n,o,w)=>w()},fetch:async(url,init)=>{const r=await f.run({headers:f.headers(),body:JSON.parse(init.body)});return response(r.body,r.status);}});
 const result=await service.login('a','quiet canoe violet orchard');assert.equal(result.ok,false);assert.equal(result.code,'WEB_COOKIES_REQUIRED');assert.match(result.message,/directly.*secure cookies/);assert.equal(service.signedIn,false);assert.equal(storage.getItem('lumo-approved-session-v1'),null);assert.equal(f.calls.length,0);
});
test('legacy signout revokes its original Auth session even before cookie migration and preserves unknown payment references',async()=>{
 const f=fixture();f.storage.setItem('lumo-approved-session-v1',JSON.stringify(f.fresh));f.storage.setItem(f.pending,'{"original":"original-payment-reference"}');
 const service=createApprovedService({config:{...APPROVED_CONFIG,webSession:true},storage:f.storage,modeStorage:memory(),lockManager:{request:async(n,o,w)=>w()},fetch:async(url,init)=>{const r=await f.call(JSON.parse(init.body));return response(r.body,r.status);}});
 const out=await service.signOut();assert.equal(out.pendingLogout,false);assert.equal(f.tokens.get(f.fresh.access_token).revoked,true);assert.equal(f.storage.getItem(f.pending),'{"original":"original-payment-reference"}');assert.equal(f.storage.getItem('lumo-approved-session-v1'),null);
});
test('hosted proxy fails closed if trusted provenance configuration is unavailable',async()=>{
 const f=fixture();for(const options of [{requireProxyContext:true},{requireProxyContext:true,proxySecret:key,clientIp:'client-controlled'}]){const result=await createWebSessionHandler({...f.options,...options})({headers:f.headers(),body:{operation:'proxy',path:'/functions/v1/lumo-approved',body:{action:'login'},authenticated:false}});assert.equal(result.status,503);}assert.equal(f.calls.length,0);
});
test('two tabs sharing storage serialize Auth rotation and reuse the acknowledged refresh from the first tab',async()=>{
 const f=fixture();await f.service.login('a','quiet canoe violet orchard');const saved=JSON.parse(f.storage.getItem('lumo-approved-session-v1'));saved.expires_at=Math.floor(Date.now()/1000)-1;f.storage.setItem('lumo-approved-session-v1',JSON.stringify(saved));
 const next=createApprovedService({config:{...APPROVED_CONFIG,webSession:true},storage:f.storage,modeStorage:memory(),lockManager:f.lockManager,fetch:async(url,init)=>{const r=await f.call(JSON.parse(init.body));return response(r.body,r.status);}});
 const out=await Promise.all([f.service.snapshot(),next.snapshot()]);assert.equal(out.every(r=>r.ok),true);assert.equal(f.calls.filter(c=>c.path.endsWith('/token')).length,1);assert.equal(f.service.signedIn,true);assert.equal(next.signedIn,true);assert.doesNotMatch(f.storage.getItem('lumo-approved-session-v1'),/SERVER_ACCESS|SERVER_REFRESH|access_token|refresh_token/);
});
test('failed cookie acknowledgement leaves legacy credentials and payment journal intact for an explicit retry',async()=>{
 const f=fixture();f.storage.setItem('lumo-approved-session-v1',JSON.stringify(f.fresh));f.storage.setItem(f.pending,'{"original":"original-payment-reference"}');
 const next=createApprovedService({config:{...APPROVED_CONFIG,webSession:true},storage:f.storage,modeStorage:memory(),lockManager:f.lockManager,fetch:async(url,init)=>{const r=await f.run({headers:f.headers(),body:JSON.parse(init.body)});return response(r.body,r.status);}});
 const out=await next.snapshot();assert.equal(out.ok,false);assert.equal(out.code,'WEB_COOKIES_REQUIRED');assert.equal(f.calls.length,0);assert.equal(f.tokens.get(f.fresh.access_token).revoked,undefined);assert.equal(JSON.parse(f.storage.getItem('lumo-approved-session-v1')).refresh_token,f.fresh.refresh_token);assert.equal(f.storage.getItem(f.pending),'{"original":"original-payment-reference"}');
});
test('server requires a valid secure-cookie roundtrip before registration, login or legacy rotation reaches Auth',async()=>{
 const f=fixture();
 for(const body of [{operation:'proxy',path:'/functions/v1/lumo-approved',body:{action:'login'},authenticated:false},{operation:'proxy',path:'/functions/v1/lumo-approved',body:{action:'register'},authenticated:false},{operation:'migrate',legacy:{access_token:f.fresh.access_token,refresh_token:f.fresh.refresh_token,user:f.fresh.user}}]){const r=await f.run({headers:f.headers(),body});assert.equal(r.status,401);assert.equal(r.body.code,'WEB_COOKIES_REQUIRED');}
 assert.equal(f.calls.length,0);const probe=await f.run({headers:f.headers(),body:{operation:'probe'}});assert.equal(probe.body.ok,true);assert.equal((await f.run({headers:f.headers(),body:{operation:'probe-ack',probe:probe.body.probe}})).status,401);assert.equal(f.calls.length,0);
});
