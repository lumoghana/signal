import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSocialHandler,normalizeGroupName,socialCommand} from '../supabase/functions/lumo-social/handler.mjs';

const user='20000000-0000-4000-8000-000000000001';
const session='20000000-0000-4000-8000-000000000002';
const recipientId='20000000-0000-4000-8000-000000000003';
const groupId='20000000-0000-4000-8000-000000000004';
const requestId='20000000-0000-4000-8000-000000000005';
const list={action:'friends',operation:'list',schemaVersion:2};
const save={action:'friends',operation:'save',schemaVersion:2,recipientId,groupId,requestId};
const create={action:'friends',operation:'createGroup',schemaVersion:2,name:'School friends',requestId};
const rename={...create,operation:'renameGroup',groupId,revision:1};
const remove={action:'friends',operation:'deleteGroup',schemaVersion:2,groupId,revision:1,requestId};
const invalid=body=>assert.throws(()=>socialCommand(body),e=>e.code==='INVALID_INPUT');
const vectors=JSON.parse(readFileSync(new URL('./fixtures/social-group-names.json',import.meta.url)));

test('v2 list negotiation is explicit and the unchanged v1 contract remains accepted',()=>{
 assert.deepEqual(socialCommand(list),{command:'friends.list',payload:{schemaVersion:2}});
 assert.deepEqual(socialCommand({action:'friends',operation:'list'}),{command:'friends.list',payload:{}});
 for(const schemaVersion of[null,1,3,'2',true,[],{}])invalid({...list,schemaVersion});
 invalid({...list,ownerId:user});invalid({...list,groups:[]});
});
test('v2 assignment requires an explicit stable group ID or explicit null for ungrouped',()=>{
 assert.deepEqual(socialCommand(save).payload,{schemaVersion:2,recipientId,groupId,requestId});
 assert.equal(socialCommand({...save,groupId:null,revision:2}).payload.groupId,null);
 for(const groupId of[undefined,'',0,[],{},'School friends','@someone'])invalid({...save,groupId});
 invalid({...save,listName:'Crew'});invalid({...save,name:'Someone'});
 const {schemaVersion,...mixedLegacy}=save;invalid(mixedLegacy);
 const {groupId:_group,...v1}=mixedLegacy;
 assert.equal(socialCommand({...v1,listName:'Crew'}).payload.listName,'Crew');
});
test('v2 remove preserves stable recipient identity and requires its current revision',()=>{
 const body={action:'friends',operation:'remove',schemaVersion:2,recipientId,requestId,revision:3};
 assert.deepEqual(socialCommand(body),{command:'friends.remove',payload:{schemaVersion:2,recipientId,requestId,revision:3}});
 for(const revision of[undefined,null,0,-1,1.2,Number.MAX_SAFE_INTEGER+1,'3'])invalid({...body,revision});
 invalid({...body,groupId});invalid({...body,listName:'Circle'});
});
test('group create, rename and delete use bounded UUID, revision and operation schemas',()=>{
 for(const body of[create,rename,remove])assert.equal(socialCommand(body).command,'friends.'+body.operation);
 for(const body of[create,rename,remove]){
  invalid({...body,actor:user});invalid({...body,session});invalid({...body,ownerId:user});invalid({...body,requestId:'reuse-me'});
  const {schemaVersion,...legacy}=body;invalid(legacy);
 }
 invalid({...create,revision:1});invalid({...create,groupId});invalid({...rename,groupId:null});invalid({...rename,revision:undefined});invalid({...remove,name:'School friends'});
 invalid({...create,operation:'inviteGroup'});
});
test('group names use shared Unicode vectors and normalized payloads for stable retries',()=>{
 for(const {input,expected} of vectors.cases)assert.equal(normalizeGroupName(input),expected,JSON.stringify(input));
 assert.equal(socialCommand({...create,name:'  Cafe\u0301 friends  '}).payload.name,'Café friends');
 for(const name of[null,undefined,'','  ','Unsafe\u202ename'])invalid({...create,name});
});
test('group length uses normalized Unicode code points rather than UTF-16 units',()=>{
 assert.equal(normalizeGroupName('🎓'.repeat(40)),'🎓'.repeat(40));
 assert.equal(normalizeGroupName('🎓'.repeat(41)),null);
 assert.equal(normalizeGroupName('a\u0301'.repeat(40)),'á'.repeat(40));
 assert.equal(normalizeGroupName('a\u0301'.repeat(41)),null);
 assert.equal(normalizeGroupName('x'.repeat(40)),'x'.repeat(40));
 assert.equal(normalizeGroupName('x'.repeat(41)),null);
});
test('all documented forbidden ranges reject inside names, including supplementary format controls',()=>{
 for(const [first,last] of vectors.forbiddenRanges)for(const point of new Set([first,last]))assert.equal(normalizeGroupName('a'+String.fromCodePoint(point)+'b'),null,'U+'+point.toString(16));
 for(const point of vectors.trimCodePoints)assert.equal(normalizeGroupName(String.fromCodePoint(point)+'Crew'+String.fromCodePoint(point)),'Crew','trim U+'+point.toString(16));
});
test('schema negotiation never alters notifications or accepts client-side group membership lists',()=>{
 invalid({action:'notifications',operation:'list',schemaVersion:2});
 invalid({...create,members:[recipientId]});invalid({...rename,friends:[recipientId]});invalid({...save,group:{id:groupId,name:'Fake'}});
 assert.deepEqual(socialCommand({action:'notifications',operation:'list'}),{command:'notifications.list',payload:{page:1,pageSize:30}});
});
test('group mutations carry only the authenticated actor and live session to the service RPC',async()=>{
 const calls=[];
 const jwt=['e30',Buffer.from(JSON.stringify({sub:user,session_id:session,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'signature'].join('.');
 const handler=createSocialHandler({supabaseUrl:'https://project.supabase.co',serviceRoleKey:'test-key',fetch:async(url,options)=>{
  calls.push({url,options});return new Response(JSON.stringify(url.endsWith('/user')?{id:user}:{ok:true,data:{record:{id:groupId,name:'Café friends',revision:1},duplicate:false}}));
 }});
 const response=await handler(new Request('https://project.supabase.co/functions/v1/lumo-social',{method:'POST',headers:{Authorization:'Bearer '+jwt,'Content-Type':'application/json'},body:JSON.stringify({...create,name:'  Cafe\u0301 friends  '})}));
 assert.equal(response.status,200);assert.equal(calls.length,2);
 const request=JSON.parse(calls[1].options.body);
 assert.equal(request.p_command,'friends.createGroup');assert.deepEqual(request.p_payload,{schemaVersion:2,name:'Café friends',requestId,actor:user,session});
 assert.equal(response.headers.get('cache-control'),'no-store');
});
test('known group failures remain actionable and never expose database details',async()=>{
 const jwt=['e30',Buffer.from(JSON.stringify({sub:user,session_id:session,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'signature'].join('.');
 for(const code of['GROUP_NAME_TAKEN','GROUP_NOT_FOUND','GROUP_UNAVAILABLE','GROUP_LIMIT','REVISION_CONFLICT','IDEMPOTENCY_CONFLICT']){
  const handler=createSocialHandler({supabaseUrl:'https://project.supabase.co',serviceRoleKey:'test-key',fetch:async url=>new Response(JSON.stringify(url.endsWith('/user')?{id:user}:{ok:false,code,message:'private constraint detail'}))});
  const response=await handler(new Request('https://project.supabase.co/functions/v1/lumo-social',{method:'POST',headers:{Authorization:'Bearer '+jwt,'Content-Type':'application/json'},body:JSON.stringify(create)}));
  const result=await response.json();assert.equal(response.status,400);assert.equal(result.code,code);assert.ok(!result.message.includes('private'));
 }
});
