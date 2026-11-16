import test from 'node:test';
import assert from 'node:assert/strict';
import {createSocialHandler,socialCommand} from '../supabase/functions/lumo-social/handler.mjs';
const user='10000000-0000-4000-8000-000000000001',session='10000000-0000-4000-8000-000000000002',recipient='10000000-0000-4000-8000-000000000003',requestId='10000000-0000-4000-8000-000000000004';
const token=claims=>['e30',Buffer.from(JSON.stringify({sub:user,session_id:session,exp:Math.floor(Date.now()/1000)+3600,...claims})).toString('base64url'),'signature'].join('.');
const makeRequest=(body,{auth=token(),origin='https://lumo-connected-pilot.vercel.app',method='POST',contentType='application/json'}={})=>new Request('https://project.supabase.co/functions/v1/lumo-social',{method,headers:{'Content-Type':contentType,...(auth?{Authorization:'Bearer '+auth}:{}),...(origin?{Origin:origin}:{})},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
function fixture({db={ok:true,data:{friends:[]}},userResponse={id:user},authOk=true,throwTransport=false}={}){
 const calls=[];const handler=createSocialHandler({supabaseUrl:'https://project.supabase.co',serviceRoleKey:'test-service-key',allowedOrigins:['https://lumo-connected-pilot.vercel.app'],fetch:async(url,options)=>{calls.push({url,options});if(throwTransport)throw Error('private upstream detail');return new Response(JSON.stringify(url.endsWith('/auth/v1/user')?userResponse:db),{status:url.endsWith('/auth/v1/user')&&!authOk?401:200});}});return {handler,calls};
}
const list={action:'friends',operation:'list'};
const save={action:'friends',operation:'save',recipientId:recipient,listName:'Circle',requestId};
test('signed consumer identity alone supplies owner and current session to service RPC',async()=>{
 const {handler,calls}=fixture();const r=await handler(makeRequest(save));assert.equal(r.status,200);const body=JSON.parse(calls[1].options.body);assert.equal(body.p_payload.actor,user);assert.equal(body.p_payload.session,session);assert.equal(body.p_command,'friends.save');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(calls[0].options.headers.Authorization,'Bearer '+token());assert.equal(calls[1].options.headers.Authorization,'Bearer test-service-key');assert.equal(calls[1].options.redirect,'error');
});
test('native requests without Origin use the same authenticated session checks',async()=>{const {handler,calls}=fixture();assert.equal((await handler(makeRequest(list,{origin:null}))).status,200);assert.equal(calls.length,2);});
test('identity injection and hidden/private fields are rejected before upstream access',async()=>{
 for(const body of[{...save,actor:recipient},{...save,session},{...save,name:'Spoofed'},{...save,badge:'wealthy'},{...list,payload:{actor:recipient}},{action:'rpc',command:'commit',payload:{}}]){const {handler,calls}=fixture();assert.equal((await handler(makeRequest(body))).status,400);assert.equal(calls.length,0);}
});
test('friend mutation contract preserves explicit list labels, UUID retries and revision checks',()=>{
 for(const listName of['Circle','Crew','Lumo Squad','Study Buddies'])assert.equal(socialCommand({...save,listName}).payload.listName,listName);
 assert.equal(socialCommand({...save,revision:9}).payload.revision,9);
 assert.equal(socialCommand({action:'friends',operation:'remove',recipientId:recipient,requestId,revision:9}).command,'friends.remove');
 for(const body of[{...save,listName:'Public group'},{...save,requestId:'bad'},{...save,recipientId:'@name'},{...save,revision:0},{...save,revision:1.5},{...save,revision:null},{action:'friends',operation:'remove',recipientId:recipient,requestId},{...save,operation:'remove',revision:2}])assert.throws(()=>socialCommand(body),e=>e.code==='INVALID_INPUT');
});
test('anonymous, invalid, revoked by Auth, expired and forged-session tokens never reach RPC',async()=>{
 for(const options of[{auth:null},{auth:'invalid'},{auth:token({exp:1})},{auth:token({sub:recipient})},{auth:token({session_id:'invalid'})}]){const {handler,calls}=fixture();assert.equal((await handler(makeRequest(list,options))).status,401);assert.equal(calls.some(c=>c.url.includes('/rpc/')),false);}
 for(const f of[{userResponse:{id:user,is_anonymous:true}},{authOk:false}]){const {handler,calls}=fixture(f);assert.equal((await handler(makeRequest(list))).status,401);assert.equal(calls.length,1);}
});
test('origin, methods, media type and body limits run before authentication',async()=>{
 const {handler,calls}=fixture();assert.equal((await handler(makeRequest(list,{origin:'https://evil.example'}))).status,403);assert.equal((await handler(makeRequest(null,{method:'GET'}))).status,405);assert.equal((await handler(makeRequest(list,{contentType:'text/plain'}))).status,400);assert.equal((await handler(makeRequest('x'.repeat(4097)))).status,413);assert.equal((await handler(makeRequest('[]'))).status,400);assert.equal((await handler(makeRequest('{bad'))).status,400);assert.equal(calls.length,0);const options=await handler(makeRequest(null,{method:'OPTIONS'}));assert.equal(options.status,204);assert.equal(options.headers.get('access-control-allow-origin'),'https://lumo-connected-pilot.vercel.app');
});
test('notification paging is bounded and reads accept only opaque supported references',()=>{
 assert.deepEqual(socialCommand({action:'notifications',operation:'list'}),{command:'notifications.list',payload:{page:1,pageSize:30}});
 for(const notificationId of['payment:'+requestId,'partner:partner-setup-abc:3','support:'+requestId])assert.equal(socialCommand({action:'notifications',operation:'read',notificationId}).payload.notificationId,notificationId);
 for(const body of[{action:'notifications',operation:'list',page:0},{action:'notifications',operation:'list',page:1.5},{action:'notifications',operation:'list',pageSize:51},{action:'notifications',operation:'read',notificationId:'other:abc'},{action:'notifications',operation:'read',notificationId:'payment:../secret'},{action:'notifications',operation:'read',notificationId:'partner:'+'a'.repeat(221)}])assert.throws(()=>socialCommand(body),e=>e.code==='INVALID_INPUT');
});
test('database authorization, stale revisions, rate and replay failures expose bounded errors only',async()=>{
 for(const [code,status] of[['ACCOUNT_REQUIRED',403],['FORBIDDEN',403],['SESSION_REVOKED',401],['RATE_LIMITED',429],['REVISION_CONFLICT',400],['IDEMPOTENCY_CONFLICT',400],['SELF_FRIEND',400],['NOT_FOUND',400],['private_database_error',503]]){const {handler}=fixture({db:{ok:false,code,message:'private table details'}});const r=await handler(makeRequest(list));assert.equal(r.status,status);assert.equal((await r.text()).includes('private table details'),false);}
});
test('network and malformed upstream failures never turn into empty success',async()=>{
 for(const f of[{throwTransport:true},{db:null},{db:{friends:[]}}]){const {handler}=fixture(f);const r=await handler(makeRequest(list));assert.equal(r.status,503);const d=await r.json();assert.equal(d.ok,false);assert.equal(d.code,'SERVICE_UNAVAILABLE');assert.equal(d.message.includes('private'),false);}
});
