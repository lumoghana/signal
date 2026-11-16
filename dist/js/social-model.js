/** Private friends and in-app notifications. Never owns a wallet or a money command. */
export const FRIEND_GROUP_LIMIT=50;
export const FRIEND_GROUP_NAME_MAX=40;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLE=/^[a-z0-9][a-z0-9._-]{2,29}$/;
const revision=value=>Number.isSafeInteger(value)&&value>0;
export function normalizeFriendGroupName(value){
 if(typeof value!=='string')return null;
 const name=value.trim().normalize('NFC'),visible=name.replace(/[\u200c\u200d]/gu,'');return name&&[...name].length<=FRIEND_GROUP_NAME_MAX&&visible.trim()&&!/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(visible)?name:null;
}
export function socialFriendGroup(value){
 if(!value||!UUID.test(value.id||'')||!revision(value.revision)||typeof value.name!=='string'||normalizeFriendGroupName(value.name)!==value.name)throw Error('Lumo could not verify your friend groups. Refresh and try again.');
 return{id:value.id,name:value.name,revision:value.revision};
}
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
// Support messages can contain ordinary line breaks and tabs. Their content is escaped by the view.
const bodyText=value=>typeof value==='string'&&value.length>0&&value.length<=600&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const when=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const empty=()=>({friends:[],groups:[],friendsLoaded:false,friendsLoading:false,friendsError:'',notifications:[],notificationsLoaded:false,notificationsLoading:false,notificationsError:'',unreadCount:0,total:0,page:1,hasMore:false});
export function socialFriend(value,owner){
 if(!value||!UUID.test(value.id||'')||value.userId!==value.id||value.id===owner||(value.available? !HANDLE.test(value.handle||'') : value.handle!==''&&!HANDLE.test(value.handle||''))||!text(value.name,80)||value.rail!=='lumo'||(value.groupId===null?value.listName!==null:!UUID.test(value.groupId||'')||typeof value.listName!=='string'||normalizeFriendGroupName(value.listName)!==value.listName)||typeof value.available!=='boolean'||!revision(value.revision))throw Error('Lumo could not verify your friends list. Refresh and try again.');
 return{id:value.id,userId:value.id,handle:value.handle,name:value.name,rail:'lumo',groupId:value.groupId,listName:value.listName,available:value.available,revision:value.revision};
}
export function socialNotification(value){
 const target=value?.target;
 if(!value||!text(value.id,240)||!['payment','partner','support'].includes(value.kind)||!text(value.title,120)||!bodyText(value.body)||!when(value.createdAt)||value.readAt!==null&&!when(value.readAt)||!target||!['activity','partner','support'].includes(target.kind)||!text(target.id,160)||target.reference!=null&&!text(target.reference,120)||target.role!=null&&!['owner','partner'].includes(target.role)||target.boxId!=null&&!text(target.boxId,160))throw Error('Lumo could not verify your notifications. Refresh and try again.');
 const clean={kind:target.kind,id:target.id};for(const key of ['reference','role','boxId'])if(target[key]!=null)clean[key]=target[key];
 return{id:value.id,kind:value.kind,title:value.title,body:value.body,createdAt:value.createdAt,readAt:value.readAt,target:clean};
}
export function filterFriends(friends,{groupId='',query=''}={}){
 const q=String(query||'').trim().toLocaleLowerCase().replace(/^@/,'');
 return friends.filter(friend=>(groupId===''||friend.groupId===groupId)&&(!q||`${friend.name} ${friend.handle}`.toLocaleLowerCase().includes(q)));
}
export function friendMutation(operation,friend,groupId,requestId){
 if(!['save','remove'].includes(operation)||!UUID.test(friend?.id||'')||!UUID.test(requestId||'')||operation==='save'&&groupId!==null&&!UUID.test(groupId||'')||operation==='remove'&&friend.revision===undefined||friend.revision!==undefined&&!revision(friend.revision))return null;
 return{action:'friends',schemaVersion:2,operation,recipientId:friend.id,...(operation==='save'?{groupId}:{}),requestId,...(friend.revision!==undefined?{revision:friend.revision}:{})};
}
export function friendGroupMutation(operation,group,name,requestId){
 if(!['createGroup','renameGroup','deleteGroup'].includes(operation)||!UUID.test(requestId||'')||operation!=='createGroup'&&(!UUID.test(group?.id||'')||!revision(group?.revision)))return null;
 const normalized=operation==='deleteGroup'?null:normalizeFriendGroupName(name);if(operation!=='deleteGroup'&&!normalized)return null;
 return{action:'friends',schemaVersion:2,operation,...(operation==='createGroup'?{}:{groupId:group.id,revision:group.revision}),...(operation==='deleteGroup'?{}:{name:normalized}),requestId};
}
export function createSocialExperience({service,onChange=()=>{},onNew=()=>{}}={}){
 let owner='',generation=0,state=empty(),friendPending=null,noticePending=null,friendSerial=0,noticeSerial=0,stop=null;
 const listeners=new Set(),notificationHolds=new Set(),copy=()=>({...state,friends:state.friends.map(f=>({...f})),groups:state.groups.map(g=>({...g})),notifications:state.notifications.map(n=>({...n,target:{...n.target}}))});
 const scope=()=>service?.connected&&service?.signedIn&&service?.user?.id&&service.recoveryScope!==null?`${service.user.id}:${service.authVersion??0}`:'';
 function current(){const next=scope();if(next!==owner){owner=next;generation++;friendSerial++;noticeSerial++;state=empty();friendPending=null;noticePending=null;notificationHolds.clear();}return owner;}
 const emit=()=>{onChange();for(const listener of [...listeners])listener();};
 const failure=(message='Reconnect and try again.',code='UNAVAILABLE')=>({ok:false,code,message});
 async function send(body){const actor=current(),epoch=generation;if(!actor)return failure('Sign in to use Lumo friends and notifications.','AUTH_REQUIRED');let result;try{result=await service.socialRequest(body);}catch{result=failure();}if(current()!==actor||generation!==epoch)return failure('Your account changed. Reopen this from your current account.','ACCOUNT_CHANGED');return result;}
 async function refreshFriends({force=false}={}){
  if(!current()){emit();return copy();}if(friendPending&&!force)return friendPending.promise;
  const actor=owner,epoch=generation,serial=++friendSerial;state.friendsLoading=true;state.friendsError='';emit();
  const operation={promise:null};operation.promise=(async()=>{const result=await send({action:'friends',schemaVersion:2,operation:'list'});if(current()!==actor||generation!==epoch||serial!==friendSerial)return copy();
   try{if(!result?.ok||result.data?.schemaVersion!==2||!Array.isArray(result.data.friends)||result.data.friends.length>200||!Array.isArray(result.data.groups)||result.data.groups.length>FRIEND_GROUP_LIMIT)throw Error(result?.message||'Your friends and groups could not refresh. Try again.');const groups=result.data.groups.map(socialFriendGroup),friends=result.data.friends.map(f=>socialFriend(f,service.user.id)),groupMap=new Map(groups.map(g=>[g.id,g]));if(new Set(friends.map(f=>f.id)).size!==friends.length||groupMap.size!==groups.length||friends.some(f=>f.groupId!==null&&groupMap.get(f.groupId)?.name!==f.listName))throw Error('Your friends and groups could not be verified. Refresh and try again.');state.friends=friends;state.groups=groups;state.friendsLoaded=true;}
   catch(error){state.friendsError=error.message;}state.friendsLoading=false;emit();return copy();
  })().finally(()=>{if(friendPending===operation)friendPending=null;});friendPending=operation;return operation.promise;
 }
 async function refreshNotifications({page=1,force=false,background=false}={}){
  if(!current()){emit();return copy();}if(background&&notificationHolds.size)return copy();if(noticePending&&!force)return noticePending.promise;
  if(!Number.isSafeInteger(page)||page<1||page>1000)return copy();
  const actor=owner,epoch=generation,serial=++noticeSerial;state.notificationsLoading=true;state.notificationsError='';emit();const operation={promise:null};
  operation.promise=(async()=>{const result=await send({action:'notifications',operation:'list',page,pageSize:30});if(current()!==actor||generation!==epoch||serial!==noticeSerial)return copy();
   try{const data=result?.data;if(!result?.ok||!Array.isArray(data?.notifications)||data.notifications.length>30||!Number.isSafeInteger(data.unreadCount)||data.unreadCount<0||!Number.isSafeInteger(data.total)||data.total<0||data.page!==page||typeof data.hasMore!=='boolean')throw Error(result?.message||'Your notifications could not refresh. Try again.');
    const rows=data.notifications.map(socialNotification);if(new Set(rows.map(n=>n.id)).size!==rows.length)throw Error('Your notifications could not be verified. Refresh and try again.');
    const known=new Set(state.notifications.map(n=>n.id)),fresh=state.notificationsLoaded&&page===1?rows.find(n=>!n.readAt&&!known.has(n.id)):null;
    state.notifications=page>1?[...new Map([...state.notifications,...rows].map(n=>[n.id,n])).values()]:rows;state.notificationsLoaded=true;state.unreadCount=data.unreadCount;state.total=data.total;state.page=page;state.hasMore=data.hasMore;if(fresh)onNew({...fresh,target:{...fresh.target}});
   }catch(error){state.notificationsError=error.message;}state.notificationsLoading=false;emit();return copy();
  })().finally(()=>{if(noticePending===operation)noticePending=null;});noticePending=operation;return operation.promise;
 }
 async function mutateFriend(body){
  const clean=body?.action==='friends'&&body.schemaVersion===2&&friendMutation(body.operation,{id:body.recipientId,revision:body.revision},body.groupId,body.requestId);if(!clean)return failure('Check this friend and group before saving.','INVALID_INPUT');
  const actor=current(),result=await send(clean);if(current()!==actor)return failure('Your account changed.','ACCOUNT_CHANGED');
  if(result?.ok)await refreshFriends({force:true});if(current()!==actor)return failure('Your account changed.','ACCOUNT_CHANGED');return result;
 }
 async function mutateGroup(body){
  const clean=body?.action==='friends'&&body.schemaVersion===2&&friendGroupMutation(body.operation,{id:body.groupId,revision:body.revision},body.name,body.requestId);if(!clean)return failure('Check your group name and try again.','INVALID_INPUT');
  const actor=current(),result=await send(clean);if(current()!==actor)return failure('Your account changed.','ACCOUNT_CHANGED');
  if(result?.ok)await refreshFriends({force:true});if(current()!==actor)return failure('Your account changed.','ACCOUNT_CHANGED');return result;
 }
 async function readNotification(id){
  if(!text(id,240)||!current())return failure('Reopen your notifications and try again.','INVALID_INPUT');
  const actor=owner,epoch=generation,result=await send({action:'notifications',operation:'read',notificationId:id});if(current()!==actor||generation!==epoch)return failure('Your account changed.','ACCOUNT_CHANGED');
  if(result?.ok&&result.data?.id===id&&when(result.data.readAt)){noticeSerial++;noticePending=null;const changed=state.notifications.some(n=>n.id===id&&!n.readAt);state.notifications=state.notifications.map(n=>n.id===id?{...n,readAt:result.data.readAt}:n);if(changed)state.unreadCount=Math.max(0,state.unreadCount-1);state.notificationsLoading=false;emit();return result;}
  return result?.ok?failure('The read status was not confirmed. Refresh and try again.'):result;
 }
 function start(){if(stop)return stop;const update=()=>{if(!globalThis.document||document.visibilityState!=='hidden')void refreshNotifications({background:true});};const timer=setInterval(update,15000);timer.unref?.();globalThis.document?.addEventListener('visibilitychange',update);globalThis.addEventListener?.('focus',update);update();stop=()=>{clearInterval(timer);globalThis.document?.removeEventListener('visibilitychange',update);globalThis.removeEventListener?.('focus',update);stop=null;};return stop;}
 return{get snapshot(){current();return copy();},get signedIn(){return!!current();},identity:current,pauseNotifications(){current();const hold={};notificationHolds.add(hold);return()=>notificationHolds.delete(hold);},refreshFriends,refreshNotifications,mutateFriend,mutateGroup,readNotification,start,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}};
}
