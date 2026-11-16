import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSocialExperience,socialFriend,socialNotification,friendMutation,friendGroupMutation,filterFriends,socialFriendGroup,normalizeFriendGroupName,FRIEND_GROUP_NAME_MAX,FRIEND_GROUP_LIMIT} from '../dist/js/social-model.js';
import {createApprovedService} from '../dist/js/approved-service.js';
import {locksFor} from './helpers/web-locks.js';
import {renderFriendRows,resolveSavedFriend,openLumoFriends} from '../dist/js/friends-ui.js';
import {renderNotificationRows,renderNotificationButton,openLumoNotifications} from '../dist/js/notifications-ui.js';

const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',third='33333333-3333-4333-8333-333333333333',requestId='44444444-4444-4444-8444-444444444444';
const person={id:other,userId:other,name:'Synthetic Friend',handle:'sample.friend',rail:'lumo'};
const groupId='55555555-5555-4555-8555-555555555555',secondGroupId='66666666-6666-4666-8666-666666666666',newGroupId='77777777-7777-4777-8777-777777777777';
const group={id:groupId,name:'Family at home',revision:1},secondGroup={id:secondGroupId,name:'Weekend friends',revision:1};
const defaultGroups=[group,secondGroup];
const friend={...person,groupId,listName:group.name,available:true,revision:1};
const notice={id:'partner:fixture:1',kind:'partner',title:'Partner accepted',body:'Your partner accepted the request.',createdAt:'2026-11-15T00:00:00.000Z',readAt:null,target:{kind:'partner',id:requestId,role:'owner',boxId:null}};
const friends=(rows,groups=defaultGroups)=>({ok:true,data:{friends:rows,groups,limit:200,groupLimit:50,schemaVersion:2}});
const notices=(rows=[notice],unread=rows.filter(n=>!n.readAt).length,page=1,hasMore=false)=>({ok:true,data:{notifications:rows,unreadCount:unread,total:rows.length,page,pageSize:30,hasMore}});
const deferred=()=>{let resolve;return{promise:new Promise(r=>{resolve=r;}),resolve:value=>resolve(value)};};
const tick=()=>new Promise(r=>setImmediate(r));
function service(request=async body=>body.action==='friends'?friends([friend]):notices()){
 return{connected:true,signedIn:true,user:{id:owner},authVersion:0,recoveryScope:'fixture',socialRequest:request};
}
function sheetHarness(model,shared){
 const events={},host={isConnected:true,innerHTML:'',scrollTop:0,contains:()=>false,addEventListener:(name,fn)=>{events[name]=fn;},querySelector:()=>({focus(){}}),querySelectorAll:()=>[]};
 let dispose=null;const routes=[],toasts=[],starts=[];
 const ctx={connected:true,shared,social:model,draft:{},state:{transactions:[]},saveDraft(){},sheet(html,bind,options){dispose=options.onDispose;bind({querySelector:()=>host});},closeSheet(){host.isConnected=false;dispose?.();},toast:message=>toasts.push(message),go:route=>routes.push(route),startPayment:(...args)=>starts.push(args)};
 return{ctx,host,routes,toasts,starts,click(dataset){return events.click?.({target:{closest:()=>({dataset,disabled:false,hasAttribute:name=>Object.hasOwn(dataset,name.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase()))})}});},input(id,value){events.input?.({target:{id,value}});},change(id,value){events.change?.({target:{id,value}});},submit(selector='[data-friend-search-form]'){events.submit?.({preventDefault(){},target:{matches:value=>value===selector}});}};
}
function transportHarness(handler){
 const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},calls=[];
 const signed=id=>({ok:true,session:{access_token:'fixture-access',refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id}},account:{userId:id},state:{wallet:0}});
 const api=createApprovedService({storage,lockManager:locksFor(storage),modeStorage:storage,fetch:async(url,init)=>{const body=JSON.parse(init.body);calls.push({url,body,headers:init.headers,credentials:init.credentials,redirect:init.redirect});const result=body.action==='login'?{data:signed(body.handle==='first'?owner:third)}:await handler(body,url);return{ok:(result.status||200)<400,status:result.status||200,json:async()=>result.data};}});
 return{api,values,calls};
}

test('private friends validate authoritative identities and discard financial or contact fields',()=>{
 assert.deepEqual(socialFriend({...friend,phone:'do not disclose',wallet:50000,spend:900},owner),friend);
 for(const patch of [{id:owner,userId:owner},{userId:third},{id:'local-person'},{handle:'@sample.friend'},{revision:0},{groupId:'not-a-group'},{groupId:null,listName:group.name},{listName:null},{listName:'x'.repeat(41)},{name:'Bad\nname'},{available:'true'}])assert.throws(()=>socialFriend({...friend,...patch},owner));
 const unavailable={...friend,name:'Unavailable Lumo account',handle:'',available:false};assert.deepEqual(socialFriend(unavailable,owner),unavailable);assert.throws(()=>socialFriend({...unavailable,available:true},owner));
 assert.deepEqual(socialFriend({...friend,groupId:null,listName:null},owner),{...friend,groupId:null,listName:null});
});
test('notification records accept nullable optional SQL fields and reject unsafe destinations',()=>{
 const clean=socialNotification({...notice,secretCode:'123456',target:{...notice.target,reference:null,unexpected:'drop'}});
 assert.deepEqual(clean.target,{kind:'partner',id:requestId,role:'owner'});assert.equal(clean.secretCode,undefined);
 for(const patch of [{id:'x'.repeat(241)},{body:''},{createdAt:'yesterday'},{readAt:'not-a-date'},{target:{kind:'admin',id:requestId}},{target:{kind:'partner',id:requestId,role:'stranger'}}])assert.throws(()=>socialNotification({...notice,...patch}));
});
test('friends filters combine private labels with names and @usernames',()=>{
 const rows=[friend,{...friend,id:third,userId:third,name:'Second Person',handle:'second.person',groupId:secondGroupId,listName:secondGroup.name}];
 assert.equal(filterFriends(rows,{query:'@sample'}).length,1);assert.equal(filterFriends(rows,{query:'second person',groupId:secondGroupId})[0].id,third);assert.equal(filterFriends(rows,{query:'sample',groupId:secondGroupId}).length,0);
});
test('friend mutations carry stable request IDs and optimistic revisions without money data',()=>{
 assert.deepEqual(friendMutation('save',person,groupId,requestId),{action:'friends',schemaVersion:2,operation:'save',recipientId:other,groupId,requestId});
 assert.deepEqual(friendMutation('remove',friend,'ignored',requestId),{action:'friends',schemaVersion:2,operation:'remove',recipientId:other,requestId,revision:1});
 for(const args of [['save',friend,'Unknown',requestId],['save',friend,groupId,'unstable'],['remove',person,'',requestId],['save',{...friend,revision:1.2},secondGroupId,requestId],['pay',friend,groupId,requestId]])assert.equal(friendMutation(...args),null);
});
test('friends refresh deduplicates in-flight calls and discards an old account response',async()=>{
 const pending=deferred();let calls=0;const shared=service(async()=>{calls++;return pending.promise;}),model=createSocialExperience({service:shared});
 const a=model.refreshFriends(),b=model.refreshFriends();assert.equal(calls,1);shared.user={id:third};shared.authVersion++;assert.equal(model.snapshot.friends.length,0);pending.resolve(friends([friend]));await Promise.all([a,b]);assert.equal(model.snapshot.friendsLoaded,false);assert.equal(model.snapshot.friends.length,0);
});
test('failed refresh retains the last verified private list and retry clears the error',async()=>{
 let result=friends([friend]);const model=createSocialExperience({service:service(async()=>result)});await model.refreshFriends();result={ok:false,message:'Reconnect to refresh'};await model.refreshFriends();assert.equal(model.snapshot.friends.length,1);assert.equal(model.snapshot.friendsError,'Reconnect to refresh');result=friends([]);await model.refreshFriends();assert.equal(model.snapshot.friendsError,'');assert.deepEqual(model.snapshot.friends,[]);
});
test('duplicate and oversized friends responses fail closed',async()=>{
 let result=friends([friend,friend]);const model=createSocialExperience({service:service(async()=>result)});await model.refreshFriends();assert.equal(model.snapshot.friendsLoaded,false);assert.ok(model.snapshot.friendsError);result=friends(Array(201).fill(friend));await model.refreshFriends();assert.equal(model.snapshot.friendsLoaded,false);assert.deepEqual(model.snapshot.friends,[]);
});
test('a confirmed mutation refreshes current state and cannot be overwritten by an earlier list',async()=>{
 const pending=deferred();let reads=0;const changed={...friend,groupId:secondGroupId,listName:secondGroup.name,revision:2};
 const shared=service(async body=>body.operation==='save'?{ok:true,data:{record:friend,duplicate:true}}:++reads===1?pending.promise:friends([changed]));const model=createSocialExperience({service:shared});
 const old=model.refreshFriends();const result=await model.mutateFriend(friendMutation('save',friend,secondGroupId,requestId));assert.equal(result.ok,true);assert.equal(model.snapshot.friends[0].listName,secondGroup.name);pending.resolve(friends([friend]));await old;assert.equal(model.snapshot.friends[0].revision,2);
});
test('account changes during the post-mutation refresh do not report another account success',async()=>{
 const pending=deferred(),shared=service(async body=>body.operation==='save'?{ok:true,data:{record:friend}}:pending.promise),model=createSocialExperience({service:shared});
 const result=model.mutateFriend(friendMutation('save',friend,secondGroupId,requestId));await tick();shared.user={id:third};shared.authVersion++;pending.resolve(friends([friend]));assert.equal((await result).code,'ACCOUNT_CHANGED');assert.deepEqual(model.snapshot.friends,[]);
});
test('notification announcements begin after the initial feed and deduplicate repeated polls',async()=>{
 let result=notices();const added=[];const model=createSocialExperience({service:service(async()=>result),onNew:item=>added.push(item)});await model.refreshNotifications();assert.equal(added.length,0);result=notices([{...notice,id:'partner:fixture:2'},notice]);await model.refreshNotifications();await model.refreshNotifications();assert.equal(added.length,1);assert.equal(added[0].id,'partner:fixture:2');
});
test('a confirmed read invalidates an older pending poll so unread cannot reappear',async()=>{
 const pending=deferred();let lists=0;const readAt='2026-11-15T01:00:00.000Z',shared=service(async body=>body.operation==='read'?{ok:true,data:{id:body.notificationId,readAt}}:++lists===1?notices():pending.promise),model=createSocialExperience({service:shared});
 await model.refreshNotifications();const old=model.refreshNotifications();await model.readNotification(notice.id);assert.equal(model.snapshot.unreadCount,0);pending.resolve(notices());await old;assert.equal(model.snapshot.unreadCount,0);assert.equal(model.snapshot.notifications[0].readAt,readAt);
});
test('an unconfirmed read leaves unread status unchanged',async()=>{
 const shared=service(async body=>body.operation==='read'?{ok:false,message:'Offline'}:notices()),model=createSocialExperience({service:shared});await model.refreshNotifications();assert.equal((await model.readNotification(notice.id)).ok,false);assert.equal(model.snapshot.unreadCount,1);assert.equal(model.snapshot.notifications[0].readAt,null);
});
test('older pages remain loaded while the notification center holds background refresh',async()=>{
 let calls=0;const older={...notice,id:'partner:older:1'};const shared=service(async body=>{calls++;return body.page===2?notices([older],2,2,false):notices([notice],2,1,true);}),model=createSocialExperience({service:shared});
 await model.refreshNotifications();await model.refreshNotifications({page:2});assert.equal(model.snapshot.notifications.length,2);const release=model.pauseNotifications();await model.refreshNotifications({background:true});assert.equal(calls,2);assert.equal(model.snapshot.page,2);release();await model.refreshNotifications({background:true});assert.equal(calls,3);
});
test('signing out during a notification refresh discards its response',async()=>{
 const pending=deferred(),shared=service(async()=>pending.promise),model=createSocialExperience({service:shared});const result=model.refreshNotifications();shared.signedIn=false;pending.resolve(notices());await result;assert.equal(model.snapshot.notifications.length,0);assert.equal(model.snapshot.unreadCount,0);
});
test('friend and notification text is escaped and badges never expose unavailable handles',()=>{
 const rows=renderFriendRows([{...friend,name:'<img src=x onerror=alert(1)> & Friend'}]);assert.ok(rows.includes('&lt;img'));assert.equal(rows.includes('<img'),false);
 const unavailable=renderFriendRows([{...friend,name:'Unavailable Lumo account',handle:'',available:false}],{selectOnly:true});assert.ok(unavailable.includes('Unavailable for transfers'));assert.equal(unavailable.includes('<span>@'),false);assert.ok(unavailable.includes(' disabled'));
 const updates=renderNotificationRows([{...notice,body:'<script>alert(1)</script>'}]);assert.ok(updates.includes('&lt;script&gt;'));assert.equal(updates.includes('<script>'),false);assert.ok(renderNotificationButton(120).includes('99+'));assert.ok(renderNotificationButton(0).includes('data-lumo-unread hidden'));
});
test('paying a saved friend freshly resolves and compares the immutable account ID',async()=>{
 const shared={...service(),resolve:async()=>({ok:true,recipient:{...person,id:third,userId:third}})},ctx={connected:true,shared};assert.equal((await resolveSavedFriend(ctx,friend)).code,'RECIPIENT_CHANGED');shared.resolve=async()=>({ok:true,recipient:person});const checked=await resolveSavedFriend(ctx,friend);assert.equal(checked.ok,true);assert.equal(checked.recipient.userId,other);assert.equal(checked.recipient.number,'@sample.friend');assert.equal((await resolveSavedFriend(ctx,{...friend,available:false})).ok,false);
});
test('account changes during saved recipient resolution cannot open a payment',async()=>{
 const pending=deferred(),shared={...service(),resolve:async()=>pending.promise};const result=resolveSavedFriend({connected:true,shared},friend);shared.user={id:third};shared.authVersion++;pending.resolve({ok:true,recipient:person});assert.equal((await result).code,'ACCOUNT_CHANGED');
});
test('social transport authenticates its own endpoint and cannot install credentials or money snapshots',async()=>{
 const h=transportHarness(async()=>({data:{ok:true,data:{friends:[friend]},session:{access_token:'rogue',user:{id:third}},account:{userId:third},state:{wallet:900000}}}));await h.api.login('first','fixture-password');const result=await h.api.socialRequest({action:'friends',operation:'list'});assert.equal(result.ok,true);assert.equal(h.api.user.id,owner);assert.equal(h.api.account.userId,owner);assert.equal(result.state,undefined);assert.equal(result.session,undefined);const call=h.calls.at(-1);assert.ok(call.url.endsWith('/functions/v1/lumo-social'));assert.equal(call.headers.Authorization,'Bearer fixture-access');assert.equal(call.credentials,'omit');assert.equal(call.redirect,'error');assert.ok(call.headers.apikey);const count=h.calls.length;assert.equal((await h.api.socialRequest({action:'pay',amount:100})).code,'INVALID_INPUT');assert.equal(h.calls.length,count);
});
test('social transport preserves uncertain outcomes and fences late responses across sign-ins',async()=>{
 const h=transportHarness(async()=>({status:503,data:{ok:false,code:'SERVICE_UNAVAILABLE',message:'Try the same request'}}));await h.api.login('first','fixture-password');assert.equal((await h.api.socialRequest({action:'friends',schemaVersion:2,operation:'save',recipientId:other,groupId:secondGroupId,requestId,revision:1})).unknown,true);
 const pending=deferred(),j=transportHarness(async()=>pending.promise);await j.api.login('first','fixture-password');const old=j.api.socialRequest({action:'friends',operation:'list'});await j.api.login('second','fixture-password');pending.resolve({data:friends([friend])});assert.equal((await old).code,'ACCOUNT_CHANGED');assert.equal(j.api.user.id,third);
});
test('friend double taps send one mutation and uncertain retries keep the identical payload',async()=>{
 const pending=deferred(),writes=[];let saved=false;const shared=service(async body=>{if(body.operation==='save'){writes.push({...body});if(writes.length===1)return pending.promise;saved=true;return{ok:true,data:{record:{...friend,groupId:secondGroupId,listName:secondGroup.name,revision:2}}};}return friends([{...friend,...(saved?{groupId:secondGroupId,listName:secondGroup.name,revision:2}:{})}]);}),model=createSocialExperience({service:shared}),f=sheetHarness(model,shared);
 openLumoFriends(f.ctx);await tick();f.click({friendAction:'detail',friendId:other});f.change('lumo-friend-group',secondGroupId);f.click({friendAction:'save'});f.click({friendAction:'save'});assert.equal(writes.length,1);pending.resolve({ok:false,unknown:true,message:'Retry this same request'});await tick();f.change('lumo-friend-group','');f.click({friendAction:'save'});await tick();assert.equal(writes.length,2);assert.deepEqual(writes[1],writes[0]);assert.equal(writes[1].groupId,secondGroupId);assert.equal(model.snapshot.friends[0].listName,secondGroup.name);f.ctx.closeSheet();
});
test('friend payment waits for fresh resolution before calling the existing payment entry once',async()=>{
 const pending=deferred(),shared={...service(),resolve:async()=>pending.promise},model=createSocialExperience({service:shared}),f=sheetHarness(model,shared);openLumoFriends(f.ctx);await tick();f.click({friendAction:'detail',friendId:other});f.click({friendAction:'pay'});f.click({friendAction:'pay'});assert.equal(f.starts.length,0);pending.resolve({ok:true,recipient:person});await tick();assert.equal(f.starts.length,1);assert.equal(f.starts[0][0].userId,other);assert.equal(f.starts[0][1],'lumo');assert.equal(f.host.isConnected,false);
});
test('the notification center opens the owner partner flow after acknowledging its exact update',async()=>{
 const shared=service(async body=>body.operation==='read'?{ok:true,data:{id:body.notificationId,readAt:'2026-11-15T01:00:00Z'}}:notices()),model=createSocialExperience({service:shared}),f=sheetHarness(model,shared),opened=[];openLumoNotifications(f.ctx,{openOwnerPartner:target=>opened.push(target)});await tick();f.click({lumoNotice:notice.id});await tick();assert.deepEqual(opened,[{kind:'partner',id:requestId,role:'owner'}]);assert.equal(model.snapshot.unreadCount,0);assert.equal(f.host.isConnected,false);
});
test('an account change clears and closes an open private friend detail',async()=>{
 const shared=service(),model=createSocialExperience({service:shared}),f=sheetHarness(model,shared);openLumoFriends(f.ctx);await tick();f.click({friendAction:'detail',friendId:other});assert.ok(f.host.innerHTML.includes('Synthetic Friend'));shared.user={id:third};shared.authVersion++;await model.refreshFriends();assert.equal(f.host.innerHTML,'');assert.equal(f.host.isConnected,false);
});
test('a cross-tab session change during saved-friend verification clears the sheet without paying',async()=>{
 const pending=deferred(),shared={...service(),resolve:async()=>pending.promise},model=createSocialExperience({service:shared}),f=sheetHarness(model,shared);openLumoFriends(f.ctx);await tick();f.click({friendAction:'detail',friendId:other});f.click({friendAction:'pay'});shared.recoveryScope=null;pending.resolve({ok:true,recipient:person});await tick();assert.equal(f.starts.length,0);assert.equal(f.host.innerHTML,'');assert.equal(f.host.isConnected,false);
});
test('signing out during a notification read closes the feed and prevents target navigation',async()=>{
 const pending=deferred(),shared=service(async body=>body.operation==='read'?pending.promise:notices()),model=createSocialExperience({service:shared}),f=sheetHarness(model,shared),opened=[];openLumoNotifications(f.ctx,{openOwnerPartner:target=>opened.push(target)});await tick();f.click({lumoNotice:notice.id});shared.signedIn=false;pending.resolve({ok:true,data:{id:notice.id,readAt:'2026-11-15T01:00:00Z'}});await tick();assert.equal(f.host.innerHTML,'');assert.equal(f.host.isConnected,false);assert.equal(opened.length,0);
});
test('a multiline support response from the SQL feed cannot hide the other notification kinds',async()=>{
 const support={id:'support:'+other,kind:'support',title:'Support update',body:'We have reviewed your report.\nNext step:\r\n\tOpen the case to read our reply.',createdAt:'2026-11-15T12:00:00.123456+00:00',readAt:null,target:{kind:'support',id:requestId,reference:'CS-SYNTHETIC'}};
 assert.equal(socialNotification(support).body,support.body);
 const model=createSocialExperience({service:service(async()=>notices([notice,support],2))});await model.refreshNotifications();assert.equal(model.snapshot.notificationsLoaded,true);assert.equal(model.snapshot.notifications.length,2);assert.equal(model.snapshot.unreadCount,2);assert.equal(model.snapshot.notificationsError,'');
 for(const control of ['\u0000','\u0007','\u000b','\u001f','\u007f'])assert.throws(()=>socialNotification({...support,body:'Unsafe'+control+'body'}));
});

test('custom group names accept readable Unicode and count normalized codepoints',()=>{
 assert.equal(FRIEND_GROUP_NAME_MAX,40);assert.equal(FRIEND_GROUP_LIMIT,50);
 for(const [input,expected] of [['  Home people  ','Home people'],['\nCafe\u0301\t','Café'],['أصدقائي','أصدقائي'],['朋友们','朋友们'],['Ɛnam me nnamfo','Ɛnam me nnamfo'],['Home  people','Home  people'],['🎉'.repeat(40),'🎉'.repeat(40)]])assert.equal(normalizeFriendGroupName(input),expected);
 for(const name of ['', '   ',null,42,'a'.repeat(41),'🎉'.repeat(41),'Bad\nname','Bad\u202Ename','Bad\u200Bname','Bad\uD800name','Bad\u2028name','Bad\u2029name','Bad\u0000name'])assert.equal(normalizeFriendGroupName(name),null);
 assert.deepEqual(socialFriendGroup({...group,name:'友達 & Family',wallet:40000,members:[owner]}),{id:groupId,name:'友達 & Family',revision:1});
 for(const patch of [{id:'local-group'},{revision:0},{revision:1.5},{name:null},{name:''},{name:' untrimmed '},{name:'Cafe\u0301'}])assert.throws(()=>socialFriendGroup({...group,...patch}));
});

test('group-name normalization matches the backend and Android shared Unicode vectors',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/social-group-names.json',import.meta.url),'utf8'));
 for(const item of fixture.cases)assert.equal(normalizeFriendGroupName(item.input),item.expected,JSON.stringify(item.input));
 for(const [first,last] of fixture.forbiddenRanges)for(let point=first;point<=last;point++)assert.equal(normalizeFriendGroupName('A'+String.fromCodePoint(point)+'B'),null,'Forbidden U+'+point.toString(16));
 for(const point of fixture.trimCodePoints)assert.equal(normalizeFriendGroupName(String.fromCodePoint(point)+'Friends'+String.fromCodePoint(point)),'Friends','Trim U+'+point.toString(16));
 for(const name of ['👩‍👩‍👧','👩‍💻 Friends','دوست‌های من'])assert.equal(normalizeFriendGroupName(name),name);
 for(const name of ['\u200c','\u200d',' \u200c \u200d '])assert.equal(normalizeFriendGroupName(name),null);
});

test('group assignments use stable IDs and Ungrouped never aliases All',()=>{
 const ungrouped={...friend,id:third,userId:third,name:'Another Person',handle:'another.person',groupId:null,listName:null};
 const rows=[friend,ungrouped];assert.equal(filterFriends(rows).length,2);assert.deepEqual(filterFriends(rows,{groupId:null}),[ungrouped]);assert.deepEqual(filterFriends(rows,{groupId,query:'@sample'}),[friend]);assert.deepEqual(filterFriends(rows,{groupId:secondGroupId}),[]);
 assert.deepEqual(friendMutation('save',friend,null,requestId),{action:'friends',schemaVersion:2,operation:'save',recipientId:other,groupId:null,requestId,revision:1});
 assert.equal(friendMutation('save',friend,group.name,requestId),null);
});

test('group mutations include only private group fields with stable request IDs and revisions',()=>{
 assert.deepEqual(friendGroupMutation('createGroup',null,' Cafe\u0301 ',requestId),{action:'friends',schemaVersion:2,operation:'createGroup',name:'Café',requestId});
 assert.deepEqual(friendGroupMutation('renameGroup',group,'Friends in Accra',requestId),{action:'friends',schemaVersion:2,operation:'renameGroup',groupId,revision:1,name:'Friends in Accra',requestId});
 assert.deepEqual(friendGroupMutation('deleteGroup',group,null,requestId),{action:'friends',schemaVersion:2,operation:'deleteGroup',groupId,revision:1,requestId});
 for(const args of [['pay',group,'Name',requestId],['createGroup',null,'',requestId],['createGroup',null,'Name','unstable'],['renameGroup',{id:groupId},'Name',requestId],['deleteGroup',{...group,revision:1.2},null,requestId]])assert.equal(friendGroupMutation(...args),null);
});

test('friends and groups install atomically and never silently fall back to the old category protocol',async()=>{
 let result=friends([friend]);const shared=service(async()=>result),model=createSocialExperience({service:shared});await model.refreshFriends();
 const invalid=[friends([friend],[]),friends([friend],[group,group]),friends([friend],[{...group,name:'Renamed elsewhere'}]),friends([friend],Array(51).fill(group)),{ok:true,data:{friends:[friend],limit:200}}];
 for(const response of invalid){result=response;await model.refreshFriends();assert.deepEqual(model.snapshot.groups,defaultGroups);assert.deepEqual(model.snapshot.friends,[friend]);assert.ok(model.snapshot.friendsError);}
 const snapshot=model.snapshot;snapshot.groups[0].name='Tampered';assert.equal(model.snapshot.groups[0].name,group.name);
 result=friends([] ,[]);await model.refreshFriends();assert.deepEqual(model.snapshot.groups,[]);assert.deepEqual(model.snapshot.friends,[]);assert.equal(model.snapshot.friendsError,'');
});

test('the social transport negotiates group operations explicitly while keeping safe legacy requests',async()=>{
 const h=transportHarness(async()=>({data:{ok:true,data:{record:group,duplicate:false}}}));await h.api.login('first','fixture-password');
 for(const operation of ['createGroup','renameGroup','deleteGroup']){const body=friendGroupMutation(operation,group,'My people',requestId);assert.equal((await h.api.socialRequest(body)).ok,true);assert.deepEqual(h.calls.at(-1).body,body);assert.ok(h.calls.at(-1).url.endsWith('/functions/v1/lumo-social'));}
 assert.equal((await h.api.socialRequest({action:'friends',operation:'list'})).ok,true);
 const count=h.calls.length;for(const body of [{action:'friends',operation:'createGroup',name:'Name',requestId},{action:'friends',schemaVersion:1,operation:'list'},{action:'friends',schemaVersion:'2',operation:'list'},{action:'friends',schemaVersion:2,operation:'moveMoney'}])assert.equal((await h.api.socialRequest(body)).code,'INVALID_INPUT');assert.equal(h.calls.length,count);
});

test('an empty account has All and Ungrouped without invented group categories',async()=>{
 const shared=service(async()=>friends([],[])),model=createSocialExperience({service:shared}),f=sheetHarness(model,shared);openLumoFriends(f.ctx);await tick();
 assert.ok(f.host.innerHTML.includes('>All</bdi>'));assert.ok(f.host.innerHTML.includes('>Ungrouped</bdi>'));for(const label of ['Circle','Crew','Lumo Squad','Study Buddies'])assert.equal(f.host.innerHTML.includes(label),false);
 f.click({friendAction:'new-group'});assert.ok(f.host.innerHTML.includes('Name your group'));f.ctx.closeSheet();
});

test('creating a group from a new friend returns to that person with the new group selected',async()=>{
 let records=[],groups=[];const writes=[],newPerson={...person,id:third,userId:third,name:'Efua Example',handle:'efua.example'};
 const shared={...service(async body=>{if(body.operation==='createGroup'){writes.push(body);const created={id:newGroupId,name:body.name,revision:1};groups=[created];return{ok:true,data:{record:created,duplicate:false}};}if(body.operation==='save'){writes.push(body);records=[{...newPerson,groupId:body.groupId,listName:groups[0].name,available:true,revision:1}];return{ok:true,data:{record:records[0],duplicate:false}};}return friends(records,groups);}),searchPeople:async()=>({ok:true,people:[newPerson]})};
 const model=createSocialExperience({service:shared}),f=sheetHarness(model,shared);openLumoFriends(f.ctx);await tick();f.click({friendAction:'add'});f.input('lumo-friend-lookup','@efua.example');f.submit();await tick();f.click({friendAction:'choose',friendId:third});f.click({friendAction:'new-group'});f.input('lumo-friend-group-name','  Café friends  ');f.submit('[data-friend-group-form]');await tick();
 assert.ok(f.host.innerHTML.includes('Efua Example'));assert.ok(f.host.innerHTML.includes(`value="${newGroupId}" selected`));assert.equal(writes[0].name,'Café friends');f.click({friendAction:'save'});await tick();assert.equal(writes[1].recipientId,third);assert.equal(writes[1].groupId,newGroupId);assert.equal(writes[1].revision,undefined);assert.equal(writes[1].listName,undefined);assert.equal(model.snapshot.friends[0].groupId,newGroupId);assert.equal(f.starts.length,0);f.ctx.closeSheet();
});

test('group creation rejects invalid names and shows a server duplicate without losing the draft',async()=>{
 const writes=[];const shared=service(async body=>{if(body.operation==='createGroup'){writes.push(body);return{ok:false,code:'GROUP_NAME_TAKEN',message:'You already have a group with that name.'};}return friends([friend]);}),model=createSocialExperience({service:shared}),f=sheetHarness(model,shared);
 openLumoFriends(f.ctx);await tick();f.click({friendAction:'new-group'});f.input('lumo-friend-group-name','x'.repeat(41));f.click({friendAction:'group-save'});assert.equal(writes.length,0);assert.ok(f.host.innerHTML.includes('1–40 characters'));f.input('lumo-friend-group-name',group.name.toUpperCase());f.click({friendAction:'group-save'});await tick();assert.equal(writes.length,1);assert.ok(f.host.innerHTML.includes('You already have a group'));assert.ok(f.host.innerHTML.includes(`value="${group.name.toUpperCase()}"`));f.ctx.closeSheet();
});

test('group double taps send once and uncertain retries preserve the exact normalized payload',async()=>{
 const pending=deferred(),writes=[];let groups=[];const shared=service(async body=>{if(body.operation==='createGroup'){writes.push(body);if(writes.length===1)return pending.promise;groups=[{id:newGroupId,name:body.name,revision:1}];return{ok:true,data:{record:groups[0],duplicate:true}};}return friends([],groups);}),model=createSocialExperience({service:shared}),f=sheetHarness(model,shared);
 openLumoFriends(f.ctx);await tick();f.click({friendAction:'new-group'});f.input('lumo-friend-group-name',' Cafe\u0301 ');f.click({friendAction:'group-save'});f.click({friendAction:'group-save'});assert.equal(writes.length,1);pending.resolve({ok:false,unknown:true,message:'Retry the same request to confirm.'});await tick();f.input('lumo-friend-group-name','Different name');f.click({friendAction:'group-back'});assert.ok(f.host.innerHTML.includes('Retry the same change'));f.click({friendAction:'group-save'});await tick();assert.equal(writes.length,2);assert.deepEqual(writes[1],writes[0]);assert.equal(writes[1].name,'Café');assert.equal(model.snapshot.groups.length,1);f.ctx.closeSheet();
});

test('renaming a custom group refreshes its friend labels without resaving or removing a friend',async()=>{
 let groups=[group],records=[friend];const writes=[],shared=service(async body=>{if(body.operation==='renameGroup'){writes.push(body);groups=[{...group,name:body.name,revision:2}];records=[{...friend,listName:body.name}];return{ok:true,data:{record:groups[0],duplicate:false}};}return friends(records,groups);}),model=createSocialExperience({service:shared}),f=sheetHarness(model,shared);
 openLumoFriends(f.ctx);await tick();f.click({friendAction:'groups'});f.click({friendAction:'edit-group',friendGroup:groupId});f.input('lumo-friend-group-name','朋友 & Family');f.click({friendAction:'group-save'});await tick();assert.equal(writes.length,1);assert.equal(writes[0].revision,1);assert.equal(writes[0].groupId,groupId);assert.equal(model.snapshot.friends[0].id,other);assert.equal(model.snapshot.friends[0].listName,'朋友 & Family');assert.ok(f.host.innerHTML.includes('朋友 &amp; Family'));f.ctx.closeSheet();
});

test('deleting a group confirms first and keeps every friend saved under Ungrouped',async()=>{
 let groups=[group],records=[friend];const writes=[],shared=service(async body=>{if(body.operation==='deleteGroup'){writes.push(body);groups=[];records=[{...friend,groupId:null,listName:null,revision:2}];return{ok:true,data:{record:null,duplicate:false}};}return friends(records,groups);}),model=createSocialExperience({service:shared}),f=sheetHarness(model,shared);
 openLumoFriends(f.ctx);await tick();f.click({friendAction:'filter',friendGroup:groupId});f.click({friendAction:'groups'});f.click({friendAction:'edit-group',friendGroup:groupId});f.click({friendAction:'group-delete'});assert.equal(writes.length,0);assert.ok(f.host.innerHTML.includes('1 friend will move to Ungrouped'));f.click({friendAction:'group-delete-confirm'});await tick();assert.equal(writes.length,1);assert.equal(writes[0].operation,'deleteGroup');assert.equal(writes[0].recipientId,undefined);assert.equal(model.snapshot.groups.length,0);assert.equal(model.snapshot.friends.length,1);assert.equal(model.snapshot.friends[0].id,other);assert.equal(model.snapshot.friends[0].groupId,null);assert.equal(model.snapshot.friends[0].revision,2);assert.equal(f.ctx.draft.socialFriends.groupId,'');f.click({friendAction:'back'});assert.ok(f.host.innerHTML.includes('Synthetic Friend'));assert.ok(f.host.innerHTML.includes('Ungrouped'));f.ctx.closeSheet();
});

test('a group changed on another device refreshes its revision before a new rename request',async()=>{
 let groups=[group],records=[friend];const writes=[],shared=service(async body=>{if(body.operation==='renameGroup'){writes.push(body);if(writes.length===1){groups=[{...group,name:'Changed elsewhere',revision:2}];records=[{...friend,listName:groups[0].name}];return{ok:false,code:'REVISION_CONFLICT',message:'This group changed. Review and try again.'};}groups=[{...group,name:body.name,revision:3}];records=[{...friend,listName:body.name}];return{ok:true,data:{record:groups[0],duplicate:false}};}return friends(records,groups);}),model=createSocialExperience({service:shared}),f=sheetHarness(model,shared);
 openLumoFriends(f.ctx);await tick();f.click({friendAction:'groups'});f.click({friendAction:'edit-group',friendGroup:groupId});f.input('lumo-friend-group-name','My updated name');f.click({friendAction:'group-save'});await tick();assert.ok(f.host.innerHTML.includes('This group changed'));f.click({friendAction:'group-save'});await tick();assert.equal(writes.length,2);assert.equal(writes[1].revision,2);assert.notEqual(writes[1].requestId,writes[0].requestId);assert.equal(model.snapshot.groups[0].name,'My updated name');f.ctx.closeSheet();
});

test('an unavailable saved friend can change private group while payment stays unavailable',async()=>{
 let records=[{...friend,name:'Unavailable Lumo account',handle:'',available:false}];const writes=[],shared=service(async body=>{if(body.operation==='save'){writes.push(body);records=[{...records[0],groupId:null,listName:null,revision:2}];return{ok:true,data:{record:records[0],duplicate:false}};}return friends(records);}),model=createSocialExperience({service:shared}),f=sheetHarness(model,shared);
 openLumoFriends(f.ctx);await tick();f.click({friendAction:'detail',friendId:other});assert.ok(f.host.innerHTML.includes('id="lumo-friend-group">'));assert.match(f.host.innerHTML,/data-friend-action="pay" disabled/);f.change('lumo-friend-group','');f.click({friendAction:'save'});await tick();assert.equal(writes.length,1);assert.equal(writes[0].recipientId,other);assert.equal(writes[0].revision,1);assert.equal(writes[0].groupId,null);assert.equal(model.snapshot.friends[0].available,false);assert.equal(f.starts.length,0);f.ctx.closeSheet();
});

test('custom group names are escaped in filters, fields and friend badges',async()=>{
 const name='<img src=x onerror=alert(1)>',custom={...group,name},shared=service(async()=>friends([{...friend,listName:name}],[custom])),model=createSocialExperience({service:shared}),f=sheetHarness(model,shared);
 openLumoFriends(f.ctx);await tick();assert.ok(f.host.innerHTML.includes('&lt;img'));assert.equal(f.host.innerHTML.includes('<img'),false);f.click({friendAction:'groups'});f.click({friendAction:'edit-group',friendGroup:groupId});assert.ok(f.host.innerHTML.includes('value="&lt;img'));assert.equal(f.host.innerHTML.includes('<img'),false);f.ctx.closeSheet();
});

test('signing out during a group mutation clears private groups and prevents a success message',async()=>{
 const pending=deferred(),shared=service(async body=>body.operation==='createGroup'?pending.promise:friends([],[])),model=createSocialExperience({service:shared}),f=sheetHarness(model,shared);
 openLumoFriends(f.ctx);await tick();f.click({friendAction:'new-group'});f.input('lumo-friend-group-name','Private people');f.click({friendAction:'group-save'});shared.signedIn=false;pending.resolve({ok:true,data:{record:{id:newGroupId,name:'Private people',revision:1},duplicate:false}});await tick();assert.equal(f.host.innerHTML,'');assert.equal(f.host.isConnected,false);assert.deepEqual(model.snapshot.groups,[]);assert.equal(f.toasts.length,0);
});
