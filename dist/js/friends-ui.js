import {esc,icon} from './ui.js';
import {FRIEND_GROUP_LIMIT,FRIEND_GROUP_NAME_MAX,filterFriends,friendMutation,friendGroupMutation} from './social-model.js';
import {lumoDirectoryPeople} from './lumo-recipient-directory.js';
const identity=ctx=>ctx.connected===true&&ctx.shared?.signedIn&&ctx.shared?.user?.id&&ctx.shared.recoveryScope!==null?`${ctx.shared.user.id}:${ctx.shared.authVersion??0}`:'';
const choices=(groups,value)=>`<option value=""${value===null?' selected':''}>Ungrouped</option>`+groups.map(group=>`<option value="${esc(group.id)}"${value===group.id?' selected':''}>${esc(group.name)}</option>`).join('');
const initials=friend=>String(friend.name||'').trim().split(/\s+/).slice(0,2).map(word=>word.charAt(0)).join('').toUpperCase();
const groupCount=(data,id)=>data.friends.filter(friend=>friend.groupId===id).length;
const countLabel=count=>`${count} ${count===1?'friend':'friends'}`;
export function renderFriendRows(friends,{selectOnly=false}={}){
 return friends.map(friend=>`<div class="lumo-friend-row"><button type="button" class="lumo-friend-person" data-friend-action="${selectOnly?'select':'detail'}" data-friend-id="${esc(friend.id)}"${selectOnly&&!friend.available?' disabled':''}><span class="lumo-friend-avatar" aria-hidden="true">${esc(initials(friend))}</span><span class="lumo-friend-copy"><strong>${esc(friend.name)}</strong>${friend.handle?`<span>@${esc(friend.handle)}</span>`:''}<small>${friend.available?`<span class="lumo-friend-list-badge" dir="auto">${esc(friend.listName||'Ungrouped')}</span>`:'Unavailable for transfers'}</small></span>${icon('chevron',17)}</button></div>`).join('');
}
/** Re-resolve the handle and compare its stable owner before opening any payment. */
export async function resolveSavedFriend(ctx,friend){
 const owner=identity(ctx);if(!owner||friend?.available===false)return{ok:false,message:'This friend is not currently available for a transfer.'};
 try{const result=await ctx.shared.resolve(friend.handle);if(identity(ctx)!==owner)return{ok:false,code:'ACCOUNT_CHANGED',message:'Your account changed. Reopen your friends list.'};if(!result?.ok)return result;
  const p=result.recipient,person=lumoDirectoryPeople({ok:true,people:[{...p,id:p?.id||p?.userId,userId:p?.userId||p?.id,rail:'lumo'}]},ctx.shared.user.id)[0];
  if(person.id!==friend.id)return{ok:false,code:'RECIPIENT_CHANGED',message:'That username changed. Refresh your friends list and check the person before paying.'};
  return{ok:true,recipient:{...person,number:'@'+person.handle,emoji:initials(person),network:'Lumo'}};
 }catch{return{ok:false,message:'We could not verify this friend. Reconnect and try again.'};}
}
/** Friends and their custom groups are private to this account, never shared money groups. */
export function openLumoFriends(ctx,{onSelect=null}={}){
 const model=ctx.social,actor=identity(ctx);if(!model||!actor){ctx.toast('Sign in to use your Lumo friends list.');return()=>{};}
 const saved=ctx.draft.socialFriends||{},form={query:String(saved.query||'').slice(0,80),groupId:saved.groupId===null?null:typeof saved.groupId==='string'?saved.groupId:'',lookup:'',group:null,groupName:''};
 let host=null,alive=true,release=null,friendsSignature='',view='list',selected=null,selectedGroup=null,groupReturn='groups',people=[],lookupStatus='',error='',busy=false,lookupSerial=0,timer=null,mutation=null;
 const valid=()=>{const same=identity(ctx)===actor;if(!same&&alive&&host?.isConnected!==false){alive=false;host.innerHTML='';ctx.closeSheet();}return alive&&host?.isConnected!==false&&same;};
 const dispose=()=>{alive=false;lookupSerial++;clearTimeout(timer);release?.();release=null;};
 const remember=()=>{ctx.draft.socialFriends={query:form.query,groupId:form.groupId};ctx.saveDraft?.();};
 const back=()=>{view='list';selected=null;selectedGroup=null;people=[];lookupStatus='';error='';mutation=null;lookupSerial++;clearTimeout(timer);paint();};
 const backButton=(action,label,locked)=>`<button type="button" class="text-button lumo-social-back" data-friend-action="${action}"${locked?' disabled':''}>${icon('back',17)} ${label}</button>`;
 function paint(){
  if(!valid())return;const data=model.snapshot,active=globalThis.document?.activeElement,focus=host.contains?.(active)?{id:active.id,start:active.selectionStart,end:active.selectionEnd}:null,locked=busy||mutation?.unknown===true;
  if(data.friendsLoaded&&form.groupId&& !data.groups.some(group=>group.id===form.groupId)){form.groupId='';remember();}
  if(data.friendsLoaded&&form.group&&!data.groups.some(group=>group.id===form.group)&&!locked)form.group=null;
  let content='';
  if(view==='list'){
   const friends=filterFriends(data.friends,form),filters=[{id:'',name:'All'},{id:null,name:'Ungrouped'},...data.groups],filterName=filters.find(group=>group.id===form.groupId)?.name;
   content=`<div class="lumo-social-title"><div><span class="eyebrow">Your people</span><h2>${onSelect?'Select a friend':'Lumo friends'}</h2></div><span class="lumo-social-symbol" aria-hidden="true">${icon('users',27)}</span></div><p class="muted">Save your friends and organise them into groups you name. Your groups are private to you.</p><label class="lumo-social-search" for="lumo-friend-filter">${icon('search',18)}<input id="lumo-friend-filter" type="search" maxlength="80" value="${esc(form.query)}" placeholder="Find a saved friend" autocomplete="off" aria-label="Search saved friends"></label><div class="lumo-friend-filters" role="group" aria-label="Filter your friends">${filters.map(group=>`<button type="button" data-friend-action="filter" data-friend-group="${group.id===null?'ungrouped':esc(group.id)}" aria-pressed="${form.groupId===group.id}"><bdi>${esc(group.name)}</bdi></button>`).join('')}</div><div class="lumo-friend-group-tools"><button type="button" class="text-button" data-friend-action="new-group"${!data.friendsLoaded||data.groups.length>=FRIEND_GROUP_LIMIT?' disabled':''}>${icon('plus',16)} Create a group</button><button type="button" class="text-button" data-friend-action="groups"${!data.friendsLoaded?' disabled':''}>Manage groups</button></div>${data.friendsError?`<p class="error" role="alert">${esc(data.friendsError)}</p>`:''}<p class="lumo-social-status" role="status">${data.friendsLoading?'Refreshing your friends…':friends.length?`${countLabel(friends.length)}${form.groupId!==''?' in '+esc(filterName):''}`:''}</p><div class="lumo-friend-results">${renderFriendRows(friends,{selectOnly:!!onSelect})||(!data.friendsLoading?`<div class="lumo-social-empty">${icon('users',30)}<h3>${data.friends.length?'No friends match this view.':'Start with someone you know.'}</h3><p>${data.friends.length?'Try another group or search.':'Add their Lumo @username. You can choose a group or leave them ungrouped.'}</p></div>`:'')}</div><div class="lumo-social-actions"><button type="button" class="button" data-friend-action="add"${!data.friendsLoaded?' disabled':''}>${icon('plus',18)} Add a friend</button><button type="button" class="button secondary" data-friend-action="refresh"${data.friendsLoading?' disabled':''}>Refresh friends</button></div>`;
  }else if(view==='groups'){
   content=`${backButton('back','Your friends',locked)}<span class="eyebrow">Only for you</span><h2>Your friend groups</h2><p class="muted">Choose your own names. Renaming or deleting a group keeps every friend saved.</p><div class="lumo-friend-results">${data.groups.map(group=>`<div class="lumo-friend-row"><button type="button" class="lumo-friend-person" data-friend-action="edit-group" data-friend-group="${esc(group.id)}"><span class="lumo-friend-avatar" aria-hidden="true">${icon('users',20)}</span><span class="lumo-friend-copy"><strong dir="auto">${esc(group.name)}</strong><span>${countLabel(groupCount(data,group.id))}</span></span>${icon('chevron',17)}</button></div>`).join('')||'<div class="lumo-social-empty"><h3>Make a group your own.</h3><p>Create a name that makes sense to you, then add your saved friends.</p></div>'}</div>${data.groups.length>=FRIEND_GROUP_LIMIT?`<p class="notice">You have ${FRIEND_GROUP_LIMIT} groups. Rename or delete an existing group to make room.</p>`:''}${data.friendsError?`<p class="error" role="alert">${esc(data.friendsError)}</p>`:''}<div class="lumo-social-actions"><button type="button" class="button" data-friend-action="new-group"${data.groups.length>=FRIEND_GROUP_LIMIT?' disabled':''}>${icon('plus',18)} Create a group</button><button type="button" class="button secondary" data-friend-action="refresh"${data.friendsLoading?' disabled':''}>Refresh groups</button></div>`;
  }else if(view==='group-create'||view==='group-edit'){
   const creating=view==='group-create';
   content=`${backButton('group-back',groupReturn==='list'?'Your friends':groupReturn==='groups'?'Your groups':'Your friend',locked)}<span class="eyebrow">Your private group</span><h2>${creating?'Create a group':'Rename group'}</h2><form data-friend-group-form><label class="field" for="lumo-friend-group-name"><span>Group name</span><input class="input" id="lumo-friend-group-name" type="text" dir="auto" autocomplete="off" value="${esc(form.groupName)}" placeholder="Name your group" aria-describedby="lumo-friend-group-help lumo-friend-group-count"${locked?' disabled':''}></label><p class="muted small" id="lumo-friend-group-help">Use up to ${FRIEND_GROUP_NAME_MAX} characters. Only you can see this group.</p><p class="lumo-group-count" id="lumo-friend-group-count" aria-live="polite">${[...form.groupName.normalize('NFC').trim()].length} / ${FRIEND_GROUP_NAME_MAX}</p><div class="lumo-social-actions"><button type="submit" class="button" data-friend-action="group-save"${busy?' disabled':''}>${busy?'Saving…':mutation?.unknown?'Retry the same change':creating?'Create group':'Save name'}</button>${!creating?`<button type="button" class="text-button" data-friend-action="group-delete"${locked?' disabled':''}>Delete group</button>`:''}</div></form>`;
  }else if(view==='group-delete'&&selectedGroup){
   const count=groupCount(data,selectedGroup.id);
   content=`${backButton('group-back','Group settings',locked)}<span class="eyebrow">Keep your friends</span><h2>Delete this group?</h2><p class="lumo-group-delete-name" dir="auto">${esc(selectedGroup.name)}</p><p class="muted">${count?`${countLabel(count)} will move to Ungrouped.`:'This group has no saved friends.'} Your friends will stay saved in Lumo.</p><div class="lumo-social-actions"><button type="button" class="button secondary" data-friend-action="group-back"${locked?' disabled':''}>Keep group</button><button type="button" class="button" data-friend-action="group-delete-confirm"${busy?' disabled':''}>${busy?'Deleting…':mutation?.unknown?'Retry the same change':'Delete group'}</button></div>`;
  }else if(view==='add'){
   content=`${backButton('back','Your friends',locked)}<span class="eyebrow">Find your person</span><h2>Add a friend</h2><p class="muted">Search their name or @username. Check who it is before saving.</p><form data-friend-search-form><label class="lumo-social-search" for="lumo-friend-lookup">${icon('search',18)}<input id="lumo-friend-lookup" type="search" maxlength="80" value="${esc(form.lookup)}" placeholder="Name or @username" autocapitalize="none" spellcheck="false" autocomplete="off" aria-label="Find a Lumo friend"></label><button type="submit" class="button secondary">Search Lumo</button></form><p class="lumo-social-status" role="status" aria-live="polite">${esc(lookupStatus||'Type at least two letters to search Lumo.')}</p><div class="lumo-friend-results">${people.map(person=>`<button type="button" class="lumo-friend-person" data-friend-action="choose" data-friend-id="${esc(person.id)}"><span class="lumo-friend-avatar" aria-hidden="true">${esc(initials(person))}</span><span class="lumo-friend-copy"><strong>${esc(person.name)}</strong><span>@${esc(person.handle)}</span></span>${icon('chevron',17)}</button>`).join('')}</div>`;
  }else if(selected){
   const existing=data.friends.find(f=>f.id===selected.id),isNew=view==='confirm';
   content=`${backButton('back','Your friends',locked)}<div class="lumo-friend-detail"><span class="lumo-friend-avatar large" aria-hidden="true">${esc(initials(selected))}</span><span class="eyebrow">${isNew?'Check your friend':'Lumo friend'}</span><h2>${esc(selected.name)}</h2>${selected.handle?`<p>@${esc(selected.handle)}</p>`:''}</div>${!isNew&&selected.available===false?'<p class="notice">This person is unavailable for transfers. You can change their group or remove them from your friends.</p>':''}<label class="field"><span>Your private group</span><select class="input" id="lumo-friend-group"${locked?' disabled':''}>${choices(data.groups,form.group)}</select></label><button type="button" class="text-button lumo-create-group-link" data-friend-action="new-group"${locked||data.groups.length>=FRIEND_GROUP_LIMIT?' disabled':''}>${icon('plus',16)} Create a group</button><p class="muted small">Only you can see this group and who you save in it.</p><div class="lumo-social-actions">${!isNew?`<button type="button" class="button" data-friend-action="pay"${locked||selected.available===false?' disabled':''}>${icon('send',18)} ${onSelect?'Select this friend':'Pay this friend'}</button>`:''}<button type="button" class="button${isNew?'':' secondary'}" data-friend-action="save"${busy||!isNew&&!existing||isNew&&selected.available===false?' disabled':''}>${busy?'Saving…':mutation?.unknown?'Retry the same change':isNew?'Add friend':'Save group'}</button>${!isNew?`<button type="button" class="text-button" data-friend-action="remove"${locked?' disabled':''}>Remove friend</button>`:''}</div>`;
  }
  host.innerHTML=content+`<p class="error lumo-social-error" role="alert"${error?'':' hidden'}>${esc(error)}</p>`;
  if(focus?.id){const field=host.querySelector('#'+focus.id);if(field){field.focus({preventScroll:true});if(typeof field.setSelectionRange==='function'&&focus.start!==null)try{field.setSelectionRange(focus.start,focus.end);}catch{}}}
 }
 async function search(){
  if(!valid()||view!=='add')return;clearTimeout(timer);const query=form.lookup.trim(),serial=++lookupSerial;people=[];error='';
  if(query.replace(/^@/,'').length<2){lookupStatus='Type at least two letters to search Lumo.';paint();return;}
  lookupStatus='Finding people on Lumo…';paint();
  try{const result=await ctx.shared.searchPeople(query);if(!valid()||serial!==lookupSerial||view!=='add')return;people=lumoDirectoryPeople(result,ctx.shared.user.id);lookupStatus=people.length?result.hasMore?'Showing the first 20 matches. Add more letters to narrow them down.':'Check the name and @username before saving.':'No one matches. Check their Lumo @username.';}
  catch(failure){if(!valid()||serial!==lookupSerial)return;lookupStatus='';error=failure.message||'Lumo could not search right now. Try again.';}paint();
 }
 async function save(operation){
  if(!valid()||busy||!selected)return;const current=model.snapshot.friends.find(f=>f.id===selected.id),friend=current||selected;
  if(operation==='remove'&&!current)return back();
  if(!mutation){const body=friendMutation(operation,friend,form.group,globalThis.crypto?.randomUUID?.());if(!body){error='Lumo could not safely prepare this change. Refresh and try again.';paint();return;}mutation={body,unknown:false};}
  busy=true;error='';paint();const result=await model.mutateFriend(mutation.body);if(!valid())return;busy=false;
  if(result?.ok){const removed=mutation.body.operation==='remove';mutation=null;back();ctx.toast(removed?'Friend removed.':'Your friend is saved.');return;}
  mutation.unknown=result?.unknown===true;error=result?.message||'This change was not confirmed. Retry to check the same request.';
  if(!mutation.unknown){mutation=null;if(['REVISION_CONFLICT','CONFLICT','STALE_REVISION','GROUP_NOT_FOUND'].includes(result?.code)){await model.refreshFriends({force:true});if(!valid())return;const latest=model.snapshot.friends.find(f=>f.id===selected.id);if(latest){selected=latest;form.group=latest.groupId;}else if(view!=='confirm'){view='list';selected=null;}}}
  paint();
 }
 async function saveGroup(operation){
  if(!valid()||busy||!['group-create','group-edit','group-delete'].includes(view))return;
  if(!mutation){const body=friendGroupMutation(operation,selectedGroup,form.groupName,globalThis.crypto?.randomUUID?.());if(!body){error=`Use a group name with 1–${FRIEND_GROUP_NAME_MAX} characters.`;paint();return;}mutation={body,unknown:false};}
  busy=true;error='';paint();const result=await model.mutateGroup(mutation.body);if(!valid())return;busy=false;
  if(result?.ok){const operation=mutation.body.operation,id=mutation.body.groupId,created=operation==='createGroup'?model.snapshot.groups.find(group=>group.id===result.data?.record?.id):null;
   if(created&&['confirm','detail'].includes(groupReturn))form.group=created.id;
   if(operation==='deleteGroup'){if(form.groupId===id){form.groupId='';remember();}if(form.group===id)form.group=null;}
   mutation=null;selectedGroup=null;view=groupReturn;error=model.snapshot.friendsError;paint();ctx.toast(operation==='createGroup'?'Your group is created.':operation==='renameGroup'?'Your group name is saved.':'Group deleted. Your friends are still saved.');return;
  }
  mutation.unknown=result?.unknown===true;error=result?.message||'This change was not confirmed. Retry to check the same request.';
  if(!mutation.unknown){mutation=null;if(['REVISION_CONFLICT','CONFLICT','STALE_REVISION','GROUP_NOT_FOUND'].includes(result?.code)){await model.refreshFriends({force:true});if(!valid())return;const latest=model.snapshot.groups.find(group=>group.id===selectedGroup?.id);if(latest)selectedGroup=latest;else if(view!=='group-create'){selectedGroup=null;view='groups';}}}
  paint();
 }
 async function pay(friend){
  if(!valid()||busy||!friend)return;if(onSelect){ctx.closeSheet();onSelect({...friend});return;}
  if(typeof ctx.startPayment!=='function'){error='Open Payments to choose this friend.';paint();return;}
  busy=true;error='';paint();const verified=await resolveSavedFriend(ctx,friend);if(!valid())return;busy=false;
  if(!verified?.ok){error=verified?.message||'This recipient could not be verified.';paint();return;}
  ctx.closeSheet();ctx.startPayment(verified.recipient,'lumo');
 }
 function click(event){
  const button=event.target.closest?.('[data-friend-action]');if(!valid()||busy||!button||button.disabled)return;const action=button.dataset.friendAction,data=model.snapshot;
  if(mutation?.unknown&&!['save','group-save','group-delete-confirm'].includes(action))return;
  if(action==='filter'){const id=button.dataset.friendGroup;form.groupId=id==='ungrouped'?null:id;remember();paint();return;}
  if(action==='refresh'){void model.refreshFriends({force:true});return;}
  if(action==='back'){back();return;}
  if(action==='groups'){view='groups';error='';paint();return;}
  if(action==='new-group'){if(!data.friendsLoaded||data.groups.length>=FRIEND_GROUP_LIMIT)return;groupReturn=view;view='group-create';selectedGroup=null;form.groupName='';mutation=null;error='';paint();host.querySelector('#lumo-friend-group-name')?.focus();return;}
  if(action==='edit-group'){selectedGroup=data.groups.find(group=>group.id===button.dataset.friendGroup);if(!selectedGroup)return;groupReturn='groups';view='group-edit';form.groupName=selectedGroup.name;error='';paint();return;}
  if(action==='group-back'){view=view==='group-delete'?'group-edit':groupReturn;mutation=null;error='';paint();return;}
  if(action==='group-save'){event.preventDefault?.();void saveGroup(mutation?.body.operation||(view==='group-create'?'createGroup':'renameGroup'));return;}
  if(action==='group-delete'){view='group-delete';error='';paint();return;}
  if(action==='group-delete-confirm'){void saveGroup('deleteGroup');return;}
  if(action==='add'){view='add';form.lookup='';people=[];error='';lookupStatus='';paint();host.querySelector('#lumo-friend-lookup')?.focus();return;}
  if(action==='choose'){selected=people.find(p=>p.id===button.dataset.friendId);if(!selected)return;const existing=data.friends.find(p=>p.id===selected.id);if(existing){selected=existing;view='detail';form.group=existing.groupId;}else{view='confirm';form.group=form.groupId||null;}mutation=null;error='';paint();return;}
  if(action==='detail'||action==='select'){const friend=data.friends.find(p=>p.id===button.dataset.friendId);if(!friend)return;if(action==='select'){void pay(friend);return;}selected=friend;view='detail';form.group=friend.groupId;mutation=null;error='';paint();return;}
  if(action==='pay'){void pay(selected);return;}
  if(action==='save'){void save(mutation?.body.operation||'save');return;}
  if(action==='remove')void save('remove');
 }
 ctx.sheet('<div class="lumo-social" data-lumo-friends></div>',sheet=>{
  host=sheet.querySelector('[data-lumo-friends]');host.addEventListener('click',click);
  host.addEventListener('input',event=>{if(!valid()||busy||mutation?.unknown)return;const field=event.target;if(field.id==='lumo-friend-filter'){form.query=field.value.slice(0,80);remember();paint();}else if(field.id==='lumo-friend-lookup'){form.lookup=field.value.slice(0,80);lookupSerial++;clearTimeout(timer);people=[];lookupStatus='Finding people on Lumo…';timer=setTimeout(()=>void search(),250);}else if(field.id==='lumo-friend-group-name'){form.groupName=field.value;error='';const count=host.querySelector('#lumo-friend-group-count'),message=host.querySelector('.lumo-social-error');if(count)count.textContent=`${[...form.groupName.trim().normalize('NFC')].length} / ${FRIEND_GROUP_NAME_MAX}`;if(message){message.textContent='';message.hidden=true;}}});
  host.addEventListener('change',event=>{if(valid()&&!busy&&!mutation?.unknown&&event.target.id==='lumo-friend-group'){form.group=event.target.value||null;mutation=null;paint();}});
  host.addEventListener('submit',event=>{if(event.target.matches?.('[data-friend-search-form]')){event.preventDefault();void search();}else if(event.target.matches?.('[data-friend-group-form]')){event.preventDefault();void saveGroup(mutation?.body.operation||(view==='group-create'?'createGroup':'renameGroup'));}});
  release=model.subscribe(()=>{if(!valid()){dispose();return;}const data=model.snapshot,signature=JSON.stringify([data.friendsLoaded,data.friendsLoading,data.friendsError,data.friends,data.groups]);if(signature!==friendsSignature){friendsSignature=signature;paint();}});paint();void model.refreshFriends();
 },{onDispose:dispose,closeLabel:onSelect?'Close friends picker':'Close Lumo friends'});
 return dispose;
}
