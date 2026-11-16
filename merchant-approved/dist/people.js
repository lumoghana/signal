const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const drawings={
 plus:'<path d="M12 5v14M5 12h14"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',back:'<path d="M19 12H5m5-5-5 5 5 5"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',
 shop:'<path d="M3 10h18M4 10v11h16V10M2 10l3-7h14l3 7M9 21v-7h6v7"/>',
 shield:'<path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6z"/><path d="m8 12 3 3 5-6"/>',
 check:'<path d="m5 12 4 4L19 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
 search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',chevron:'<path d="m9 5 7 7-7 7"/>',
 copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
 link:'<path d="m10 13 4-4m-7 6-2 2a4 4 0 0 0 6 6l4-4a4 4 0 0 0-1-6M17 9l2-2a4 4 0 0 0-6-6L9 5a4 4 0 0 0 1 6" transform="translate(0 -1) scale(.95)"/>',
 key:'<circle cx="8" cy="8" r="5"/><path d="m11 12 9 9m-4-4 3-3m-6 0 3-3"/>',
 pause:'<path d="M8 5v14M16 5v14"/>',refresh:'<path d="M20 7a9 9 0 1 0 1 9M20 2v6h-6"/>'
};
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawings[name]||drawings.users}</svg>`;
const button=(label,action,style='secondary',extra='')=>`<button type="button" class="btn ${style}" data-action="people-${action}" ${extra}>${label}</button>`;
const initials=name=>String(name||'L').split(' ').filter(Boolean).slice(0,2).map(v=>v[0]).join('').toUpperCase();
const humanRole=role=>({owner:'Business owner',manager:'Shop manager',cashier:'Cashier'})[role]||role||'User';
const readableDate=value=>value?new Date(value).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
const isActive=user=>user?.active!==false&&!['suspended','inactive','disabled','revoked'].includes(user?.status);
const invitationStatus=invite=>invite?.status==='pending'&&Date.parse(invite.expiresAt)<=Date.now()?'expired':invite?.status||'pending';
const pill=status=>`<span class="badge ${status==='active'||status==='accepted'?'success':status==='pending'?'warning':status==='suspended'||status==='revoked'?'danger':'neutral'}"><span class="dot"></span>${E(status[0]?.toUpperCase()+status.slice(1))}</span>`;
export function createPeople(config={}){
 const auth=config.auth;
 const supports=name=>typeof auth.supportsCapability!=='function'||auth.supportsCapability(name);
 const shared=()=>typeof config.shared==='function'?Boolean(config.shared()):typeof auth.isShared==='function'?Boolean(auth.isShared()):Boolean(auth.isShared);
 let view='list',selection=null,search='',roleFilter='all',statusFilter='all',busy=false,error='',notice='',confirmation=null;
 let inviteDraft={name:'',phone:'',role:'cashier',shopIds:[]},userDraft=null,resetInfo=null,transferDraft=null,context='';
 const state=()=>config.getState?.()||{};
 const session=()=>config.getSession?.()||null;
 const business=()=>state().business||{};
 const shops=()=>state().shops||[];
 const userList=()=>auth.listUsers(business().id)||[];
 const invitations=()=>auth.listInvitations(business().id)||[];
 const currentUser=()=>userList().find(u=>u.id===selection);
 const currentInvite=()=>invitations().find(i=>i.id===selection);
 const shopName=id=>shops().find(s=>s.id===id)?.name||'Unassigned shop';
 const shopLabel=(ids,role)=>role==='owner'?'All shops':(ids||[]).map(shopName).join(', ')||'No shops assigned';
 function contextKey(){const current=session();return config.getContextKey?.()||[business().id,current?.userId,current?.id||current?.sessionId||'',current?.role].join(':')}
 function resetState(){view='list';selection=null;search='';roleFilter='all';statusFilter='all';clear();busy=false;userDraft=null;inviteDraft={name:'',phone:'',role:'cashier',shopIds:[]}}
 function ensureContext(){const next=contextKey();if(context&&context!==next)resetState();context=next}
 function redraw(){config.onRender?.()}
 function clear(){error='';notice='';confirmation=null;resetInfo=null;transferDraft=null}
 function navigate(next,id=null){clear();view=next;selection=id;redraw()}
 function failure(e){error=e?.message||'We could not complete that action. Please try again.';notice='';redraw()}
 async function changed(){await Promise.resolve(config.onUsersChanged?.())}
 function assertOwner(){
  const actor=session();
  if(!actor||actor.role!=='owner'||actor.businessId!==business().id)throw new Error('Only the signed-in business owner can manage users.');
  return actor;
 }
 function field(label,name,value='',extra='',help=''){
  return `<label class="field"><span class="label">${label}</span><input class="input" name="${name}" id="people-${name}" value="${E(value)}" ${extra}>${help?`<span class="hint">${help}</span>`:''}</label>`;
 }
 function heading(title,description,actions=''){
  return `<div class="page-heading"><div><div class="eyebrow">PEOPLE & ACCESS</div><h1 class="page-title">${title}</h1><p class="subtitle">${description}</p></div><div class="page-actions">${actions}</div></div>`;
 }
 function messages(){
  return `${error?`<div class="people-message error" role="alert">${icon('shield')}<span>${E(error)}</span></div>`:''}${notice?`<div class="people-message success" role="status">${icon('check')}<span>${E(notice)}</span></div>`:''}`;
 }
 function roleSelect(value,disabled=false){
  return `<label class="field"><span class="label">Role</span><select class="select" name="role" id="people-role" ${disabled?'disabled':''}>${disabled?'<option value="owner">Business owner</option>':['manager','cashier'].map(role=>`<option value="${role}" ${role===value?'selected':''}>${humanRole(role)}</option>`).join('')}</select></label>`;
 }
 function shopChecks(ids=[],disabled=false){
  return `<fieldset class="people-shops"><legend class="label">Assigned shops</legend><p class="hint">${disabled?'The business owner oversees every shop.':'Choose every shop this person is authorised to work in.'}</p><div class="people-shop-options">${shops().map(shop=>`<label class="people-shop-option"><input type="checkbox" name="shopIds" value="${E(shop.id)}" ${disabled||ids.includes(shop.id)?'checked':''} ${disabled?'disabled':''}>${icon('shop')}<span><strong>${E(shop.name)}</strong><small>${E(shop.area)} · ${E(shop.code)}</small></span></label>`).join('')}</div></fieldset>`;
 }
 function permissions(role){
  const rows=role==='owner'?[
   ['Business visibility','All shops and the shared merchant balance'],
   ['People & access','Invite, assign, suspend and restore users'],
   ['Money controls','Settlement and refund approvals']
  ]:role==='manager'?[
   ['Shop visibility','Assigned shops and their collection periods'],
   ['Day-to-day control','Take payments, close a shop day and view reports'],
   ['Refunds','Approve up to GH₵100; larger requests go to the owner']
  ]:[
   ['Checkout','Create payment requests for assigned shops'],
   ['Payment confirmation','View shop receipts and hear assigned announcements'],
   ['Refunds','Request owner approval against the original payment']
  ];
  return `<section class="people-permissions"><div class="people-permissions-title">${icon('shield')}<h3>${humanRole(role)} permissions</h3></div>${rows.map(([title,body])=>`<div><strong>${title}</strong><span>${body}</span></div>`).join('')}${role!=='owner'?'<p>Merchant account balance, settlement destinations and user management remain owner-only.</p>':''}</section>`;
 }
 function matches(item){
  const query=search.toLowerCase().trim();
  return !query||[item.name,item.phone,item.username,humanRole(item.role),shopLabel(item.shopIds,item.role)].some(v=>String(v||'').toLowerCase().includes(query));
 }
 function listView(){
  const users=userList(),allInvites=invitations();
  const activeCount=users.filter(isActive).length,pendingCount=allInvites.filter(i=>invitationStatus(i)==='pending').length,suspendedCount=users.filter(u=>!isActive(u)).length;
  const filteredUsers=users.filter(matches).filter(u=>roleFilter==='all'||u.role===roleFilter).filter(u=>statusFilter==='all'||(statusFilter==='active'?isActive(u):statusFilter==='suspended'?!isActive(u):false));
  const filteredInvites=allInvites.filter(matches).filter(i=>roleFilter==='all'||i.role===roleFilter).filter(i=>statusFilter==='all'||statusFilter===invitationStatus(i));
  return heading('The right people. The right access.','Create individual logins and give every person a clear place in your business.',button(icon('plus')+' Invite a user','new','primary'))
   +messages()
   +`<div class="people-stats">${[['Active accounts',activeCount,'People with current access','users'],['Pending invitations',pendingCount,'Waiting to create a login','link'],['Suspended accounts',suspendedCount,'Access can be restored','pause'],['Connected shops',shops().length,'Assign one or several locations','shop']].map(([label,value,note,i])=>`<div class="stat-card"><div class="stat-label">${label}${icon(i)}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`).join('')}</div>`
   +`<section class="panel people-directory"><div class="panel-heading"><div><h2 class="panel-title">Business users</h2><p class="muted text-small">Each person signs in with their own username and password.</p></div><span class="badge neutral">${users.length} accounts</span></div><div class="people-filters"><div class="search-field">${icon('search')}<input type="search" class="input" name="peopleSearch" id="people-search" placeholder="Search a name, username or shop" aria-label="Search business users" value="${E(search)}"></div><select class="select" name="peopleRole" id="people-role-filter" aria-label="Filter users by role"><option value="all">All roles</option>${['owner','manager','cashier'].map(r=>`<option value="${r}" ${roleFilter===r?'selected':''}>${humanRole(r)}</option>`).join('')}</select><select class="select" name="peopleStatus" id="people-status-filter" aria-label="Filter users by status">${[['all','All statuses'],['active','Active'],['suspended','Suspended'],['pending','Pending invitation'],['expired','Expired invitation'],['revoked','Revoked invitation']].map(([value,text])=>`<option value="${value}" ${statusFilter===value?'selected':''}>${text}</option>`).join('')}</select></div><div class="people-row people-row-heading"><span>Person</span><span>Role</span><span>Shop access</span><span>Status</span><span></span></div>${filteredUsers.length?filteredUsers.map(user=>`<button type="button" class="people-row people-user-row" data-action="people-user" data-id="${E(user.id)}"><span class="people-person"><span class="avatar">${E(initials(user.name))}</span><span><strong>${E(user.name)}</strong><small>@${E(user.username)}${user.id===session()?.userId?' · You':''}</small></span></span><span class="people-role">${humanRole(user.role)}</span><span class="people-assignment">${E(shopLabel(user.shopIds,user.role))}</span>${pill(isActive(user)?'active':'suspended')}${icon('chevron')}</button>`).join(''):`<div class="people-empty">${icon('users')}<h3>No matching accounts</h3><p>Try another filter, or invite someone to join the team.</p></div>`}</section>`
   +`<section class="panel people-invitations"><div class="panel-heading"><div><h2 class="panel-title">Invitations</h2><p class="muted text-small">Access begins when the person accepts and creates their login.</p></div>${button('Invite someone','new','ghost small')}</div>${filteredInvites.length?`<div class="people-invitation-list">${[...filteredInvites].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(invite=>`<button type="button" class="people-invitation-row" data-action="people-invitation" data-id="${E(invite.id)}"><span class="people-invite-icon">${icon('link')}</span><span><strong>${E(invite.name)}</strong><small>${humanRole(invite.role)} · ${E(shopLabel(invite.shopIds,invite.role))}</small></span>${pill(invitationStatus(invite))}${icon('chevron')}</button>`).join('')}</div>`:`<div class="people-empty compact"><p>${allInvites.length?'No invitations match these filters.':'Your first invitation will appear here.'}</p></div>`}</section>`
   +`<div class="callout people-local-note">${icon('shield')}<span>${shared()?'Business users can sign in on their own devices using the shared prototype.':'Local sample accounts work in this browser.'} Invitation links must be shared by the owner. No SMS is sent.</span></div>`;
 }
 function inviteForm(){
  return heading('Invite someone you trust.','They will create their own username and password when they accept.',button(icon('back')+' Back to users','list','ghost'))
   +messages()
   +`<div class="people-form-layout"><section class="panel people-form-panel"><form data-form="people" data-people-form="invite"><div class="people-form-heading"><h2 class="panel-title">New invitation</h2><p class="muted text-small">Give this person only the access they need.</p></div>${field('Full name','name',inviteDraft.name,'required maxlength="60" autocomplete="name" autofocus')}${field('Mobile number','phone',inviteDraft.phone,'type="tel" inputmode="tel" required maxlength="22" placeholder="024 000 0000"')}${roleSelect(inviteDraft.role)}${shopChecks(inviteDraft.shopIds)}<div class="people-form-actions">${button('Cancel','list','secondary')}<button class="btn primary" type="submit" ${busy?'disabled':''}>${busy?'Creating invitation…':'Create invitation'} ${icon('arrow')}</button></div><p class="notice">No message is sent from this prototype. You will get a demo invitation link to test here.</p></form></section>${permissions(inviteDraft.role)}</div>`;
 }
 function inviteDetails(){
  const invite=currentInvite();
  if(!invite)return heading('Invitation unavailable.','It may have been removed or replaced.',button('Back to users','list','secondary'))+messages();
  const status=invitationStatus(invite),pending=status==='pending',link=invite.token?`${location.origin}${new URL('.',import.meta.url).pathname}?invite=${encodeURIComponent(invite.token)}`:'';
  return heading(pending?'Their place is ready.':'Invitation details',`${E(invite.name)} · ${humanRole(invite.role)}`,button(icon('back')+' Back to users','list','ghost'))
   +messages()
   +`<div class="people-form-layout"><section class="panel"><div class="panel-heading"><div><h2 class="panel-title">${E(invite.name)}</h2><p class="muted text-small">${E(invite.phone)}</p></div>${pill(status)}</div><div class="detail-list"><div class="detail-row"><span>Role</span><strong>${humanRole(invite.role)}</strong></div><div class="detail-row"><span>Shop access</span><strong>${E(shopLabel(invite.shopIds,invite.role))}</strong></div><div class="detail-row"><span>Expires</span><strong>${readableDate(invite.expiresAt)}</strong></div></div>${pending&&link?`<div class="people-link-box"><label class="field"><span class="label">Invitation link</span><input class="input" name="invitationLink" value="${E(link)}" readonly aria-label="Invitation link"></label><div class="people-link-actions">${button(icon('copy')+' Copy link','copy','secondary',`data-value="${E(link)}"`)}${button('Try invitation '+icon('arrow'),'try-invitation','primary',`data-token="${E(invite.token)}"`)}</div><p class="hint">The person chooses their own username and password. ${shared()?'Share this invitation link with the person so they can accept on their own phone.':'This local sample invitation works in this browser.'} No SMS is sent.</p></div>`:`<div class="people-state-note">${icon(status==='accepted'?'check':'clock')}<p>${status==='accepted'?'This invitation has been accepted. Manage the person’s access from Business users.':status==='revoked'?'This invitation was revoked and can no longer create access. Reissue it to invite this person again.':'This invitation has expired. Reissue it to create a new valid link.'}</p></div>`}<div class="people-form-actions people-panel-actions">${status!=='accepted'?button(icon('refresh')+' Reissue invitation','resend','secondary',`data-id="${E(invite.id)}" ${busy?'disabled':''}`):''}${pending?button('Revoke invitation','ask-revoke','danger',`data-id="${E(invite.id)}" ${busy?'disabled':''}`):''}</div>${confirmation?.type==='revoke'?confirmBox('Revoke this invitation?','Its current link will stop working. The person will not gain access.','revoke',invite.id):''}</section>${permissions(invite.role)}</div>`;
 }
 function confirmBox(title,body,action,id){
  return `<div class="people-confirm" role="alert"><strong>${title}</strong><p>${body}</p><div>${button('Keep it as it is','cancel-confirm','secondary small')}${button('Confirm','confirm-'+action,'danger small',`data-id="${E(id)}" ${busy?'disabled':''}`)}</div></div>`;
 }
 function transferBox(user){
  if(transferDraft?.targetUserId!==user.id)transferDraft={targetUserId:user.id,currentPassword:'',confirmation:'',acceptResponsibility:false};
  return `<form class="people-transfer-box" data-form="people" data-people-form="transfer"><input type="hidden" name="targetUserId" value="${E(user.id)}"><span class="badge warning">Ownership handover</span><h3>Make ${E(user.name)} the business owner?</h3><p>They will control all shops, the merchant balance, settlement details and user access. Your account will lose owner permissions. Account history stays in place.</p>${field('Your current password','currentPassword',transferDraft.currentPassword,'required type="password" autocomplete="current-password"')}${field('Type TRANSFER to confirm','confirmation',transferDraft.confirmation,'required autocomplete="off" spellcheck="false" placeholder="TRANSFER"')}<label class="people-transfer-consent"><input type="checkbox" name="acceptResponsibility" required ${transferDraft.acceptResponsibility?'checked':''}><span>I have agreed this handover with ${E(user.name)} and understand that I will no longer control this business as owner.</span></label><div class="people-form-actions">${button('Keep my ownership','cancel-confirm','secondary small')}<button class="btn danger" type="submit" ${busy?'disabled':''}>${busy?'Transferring…':'Transfer ownership'}</button></div></form>`;
 }
 function userDetail(){
  const user=currentUser();
  if(!user)return heading('User unavailable.','Return to your business directory.',button('Back to users','list','secondary'));
  const owner=user.role==='owner',self=user.id===session()?.userId,draft=userDraft||user,active=isActive(user);
  let allSessions=[];try{allSessions=auth.listSessions(business().id,session())||[]}catch{}
  const sessions=allSessions.filter(s=>s.userId===user.id&&s.active!==false&&!s.revokedAt&&!s.revoked&&Date.parse(s.expiresAt)>Date.now());
  let events=[];try{events=(auth.getAuthAudit?.(business().id)||[]).filter(e=>[e.userId,e.targetUserId,e.entityId,e.subjectUserId,e.detail?.targetUserId].includes(user.id)).slice(0,5)}catch{}
  return heading(E(user.name),`@${E(user.username)} · ${humanRole(user.role)}`,button(icon('back')+' Back to users','list','ghost'))
   +messages()
   +`<div class="people-form-layout"><section class="panel people-form-panel"><form data-form="people" data-people-form="user"><input type="hidden" name="userId" value="${E(user.id)}"><div class="people-form-heading"><div><h2 class="panel-title">Account & assignments</h2><p class="muted text-small">${E(user.phone||'No mobile number recorded')}</p></div>${pill(active?'active':'suspended')}</div>${field('Full name','name',draft.name,'required maxlength="60"')}${field('Username','username',user.username,'readonly','Usernames stay fixed so access history remains consistent.')}${roleSelect(draft.role,owner)}${shopChecks(draft.shopIds,owner)}${owner?`<div class="people-state-note">${icon('shield')}<p>${self?'Your owner account keeps full business oversight. You cannot suspend your own access or change this account to a shop role.':'Business owner access is protected. Shop-role assignment controls do not apply.'}</p></div>`:''}<div class="people-form-actions"><button type="submit" class="btn primary" ${busy?'disabled':''}>${busy?'Saving changes…':'Save changes'}</button></div></form></section>${permissions(draft.role)}</div>`
   +`<div class="people-detail-grid"><section class="panel"><div class="panel-heading"><h2 class="panel-title">Account access</h2>${icon('key')}</div><div class="people-security-copy"><p>Passwords are private to the person who signs in. ${supports('staffReset')?'You can start a reset without seeing or choosing their password.':'Keep each person’s existing sign-in details safe until shared password recovery is available.'}</p><div class="people-security-actions">${supports('staffReset')?button('Start password reset','reset-password','secondary',`data-id="${E(user.id)}" ${busy?'disabled':''}`):'<p class="notice">Password recovery is not available in the connected test yet. Existing passwords stay unchanged.</p>'}${!owner&&!self?button(active?'Suspend access':'Restore access',active?'ask-suspend':'restore',active?'danger':'secondary',`data-id="${E(user.id)}" ${busy?'disabled':''}`):''}${!owner&&!self&&active&&supports('ownershipTransfer')&&typeof auth.transferOwner==='function'?button('Transfer business ownership','ask-transfer','ghost small',`data-id="${E(user.id)}" ${busy?'disabled':''}`):''}</div></div>${confirmation?.type==='suspend'?confirmBox('Suspend this person’s access?','Their active sessions will end and they will be unable to sign in until you restore access.','suspend',user.id):''}${confirmation?.type==='transfer'?transferBox(user):''}${resetInfo?`<div class="people-reset-result" role="status">${icon('check')}<div><strong>Password reset is ready.</strong><p>${E(resetInfo.username||user.username)} can complete recovery using the phone ending ${E(String(resetInfo.maskedPhone||user.phone||'').slice(-4))}.</p><small>${shared()?'No SMS was sent. The person uses their saved private recovery key in Forgot password. Owners and support never need to see that key.':'No SMS was sent. The local sample uses the displayed prototype recovery code.'}</small></div></div>`:''}</section><section class="panel"><div class="panel-heading"><h2 class="panel-title">Active sessions</h2><span class="badge neutral">${sessions.length}</span></div>${sessions.length?`<div class="people-session-list">${sessions.map(s=>`<div class="people-session"><span class="people-session-icon">${icon('phone')}</span><div><strong>${E(s.deviceLabel||s.label||s.deviceName||s.device||'Browser session')}${s.id===session()?.id?' · Current':''}</strong><small>Started ${readableDate(s.createdAt)}<br>Expires ${readableDate(s.expiresAt)}</small></div>${s.id===session()?.id?'<span class="badge neutral">This session</span>':button('Sign out','revoke-session','ghost small',`data-id="${E(s.id)}" ${busy?'disabled':''}`)}</div>`).join('')}</div>`:`<div class="people-empty compact"><p>No active sessions for this account.</p></div>`}</section></div>`
   +(events.length?`<section class="panel people-invitations"><div class="panel-heading"><h2 class="panel-title">Recent access activity</h2></div><div class="people-audit">${events.map(e=>`<div><span>${E(String(e.type||e.action||'Account activity').replaceAll('_',' ').toLowerCase())}</span><small>${readableDate(e.createdAt||e.timestamp)}</small></div>`).join('')}</div></section>`:'');
 }
 function render(){
  ensureContext();const actor=session();
  if(!actor||actor.role!=='owner'||actor.businessId!==business().id)return heading('Owner access required.','Sign in as the business owner to manage user accounts.')+`<div class="callout">${icon('shield')}<span>Shop managers and cashiers cannot change business users or permissions.</span></div>`;
  return `<div class="people-workspace">${view==='invite'?inviteForm():view==='invitation'?inviteDetails():view==='user'?userDetail():listView()}</div>`;
 }
 async function run(task,success){
  if(busy)return;busy=true;error='';redraw();
  try{const value=await task();if(success)await success(value)}
  catch(e){failure(e)}
  finally{busy=false;redraw()}
 }
 function openInvite(shopId){
  ensureContext();
  const preferred=shopId||config.getPreferredShopId?.();
  const assigned=shops().some(shop=>shop.id===preferred)?[preferred]:shops().length===1?[shops()[0].id]:[];
  inviteDraft={name:'',phone:'',role:'cashier',shopIds:assigned};navigate('invite');
 }
 async function handleClick(action,element){
  ensureContext();
  const a=action.replace(/^people-/,'');
  if(a==='ask-transfer'&&!supports('ownershipTransfer')){error='Ownership transfer is not available in this connected test yet.';redraw();return}
  if(a==='list'){navigate('list');return}
  if(a==='new'){openInvite();return}
  if(a==='user'){selection=element.dataset.id;userDraft={...currentUser(),shopIds:[...(currentUser()?.shopIds||[])]};navigate('user',selection);return}
  if(a==='invitation'){navigate('invitation',element.dataset.id);return}
  if(a==='copy'){
   try{await navigator.clipboard.writeText(element.dataset.value);notice='Invitation link copied.';redraw()}
   catch{notice='Copy the invitation link from the field above.';redraw()}return;
  }
  if(a==='try-invitation'){config.onInvitation?.(element.dataset.token);return}
  if(a==='ask-revoke'){confirmation={type:'revoke',id:element.dataset.id};redraw();return}
  if(a==='ask-suspend'){confirmation={type:'suspend',id:element.dataset.id};redraw();return}
  if(a==='ask-transfer'){assertOwner();transferDraft=null;confirmation={type:'transfer',id:element.dataset.id};redraw();return}
  if(a==='cancel-confirm'){confirmation=null;transferDraft=null;redraw();return}
  if(a==='resend')await run(()=>auth.resendInvitation(element.dataset.id,assertOwner()),value=>{selection=value?.id||selection;confirmation=null;notice='A new invitation link is ready. The previous link no longer works.'});
  if(a==='confirm-revoke')await run(()=>auth.revokeInvitation(element.dataset.id,assertOwner()),()=>{confirmation=null;notice='Invitation revoked. Its link no longer grants access.'});
  if(a==='confirm-suspend')await run(()=>auth.updateUser(element.dataset.id,{active:false},assertOwner()),async()=>{await changed();confirmation=null;notice='Access suspended. Existing sessions have ended.';userDraft={...currentUser()}});
  if(a==='restore')await run(()=>auth.updateUser(element.dataset.id,{active:true},assertOwner()),async()=>{await changed();notice='Access restored. This person can sign in again.';userDraft={...currentUser()}});
  if(a==='reset-password'&&!supports('staffReset')){error='Password recovery is not available in this connected test yet.';redraw();return}
  if(a==='reset-password')await run(()=>auth.requestUserReset(element.dataset.id,assertOwner()),value=>{resetInfo=value;notice='Password recovery has been prepared for this account.';config.onPasswordReset?.({...value,userId:element.dataset.id,initiatedByOwner:true})});
  if(a==='revoke-session')await run(()=>auth.revokeSession(element.dataset.id,assertOwner()),()=>{notice='The selected session has been signed out.'});
 }
 async function handleSubmit(form){
  ensureContext();
  const p=Object.fromEntries(new FormData(form)),assigned=new FormData(form).getAll('shopIds');
  if(form.dataset.peopleForm==='transfer'){
   if(!supports('ownershipTransfer')){error='Ownership transfer is not available in this connected test yet. Your access has not changed.';redraw();return}
   const target=currentUser();if(!target||target.id!==p.targetUserId||target.role==='owner'||!isActive(target)){error='Choose an active staff account for ownership handover.';redraw();return}
   if(String(p.confirmation||'').trim()!=='TRANSFER'||!p.currentPassword||!p.acceptResponsibility){error='Enter your current password, type TRANSFER and confirm the agreed handover.';redraw();return}
   if(typeof auth.transferOwner!=='function'){error='Ownership handover is unavailable in this local sample.';redraw();return}
   await run(()=>auth.transferOwner({targetUserId:target.id,currentPassword:p.currentPassword,confirmation:'TRANSFER',acceptResponsibility:true},assertOwner()),async result=>{confirmation=null;transferDraft=null;view='list';selection=null;await changed();notice='Business ownership has been transferred. Your owner access has ended.';config.toast?.(notice);await config.onOwnershipTransferred?.(result)});return;
  }
  if(form.dataset.peopleForm==='invite'){
   inviteDraft={name:String(p.name||'').trim(),phone:String(p.phone||'').trim(),role:p.role||'cashier',shopIds:assigned};
   if(!inviteDraft.name||!inviteDraft.phone){error='Enter this person’s name and mobile number.';redraw();return}
   if(!assigned.length){error='Assign at least one shop before creating the invitation.';redraw();return}
   await run(()=>auth.createInvitation({businessId:business().id,...inviteDraft},assertOwner()),invite=>{selection=invite.id;view='invitation';notice='Invitation created. This person will choose their own login.'});
  }else if(form.dataset.peopleForm==='user'){
   const user=currentUser();if(!user)return;
   const payload={name:String(p.name||'').trim()};
   if(user.role!=='owner'){payload.role=p.role;payload.shopIds=assigned;if(!assigned.length){error='Assign at least one shop for this account.';redraw();return}}
   userDraft={...user,...payload};
   await run(()=>auth.updateUser(user.id,payload,assertOwner()),async()=>{await changed();userDraft={...currentUser()};notice='Account and shop assignments updated. Changed permissions require a fresh sign-in.'});
  }
 }
 function handleChange(element){
  ensureContext();if(!element?.name)return;
  if(confirmation?.type==='transfer'&&['currentPassword','confirmation','acceptResponsibility'].includes(element.name)){
   if(transferDraft?.targetUserId!==confirmation.id)transferDraft={targetUserId:confirmation.id,currentPassword:'',confirmation:'',acceptResponsibility:false};
   transferDraft[element.name]=element.name==='acceptResponsibility'?Boolean(element.checked):element.value;return;
  }
  if(element.name==='peopleSearch'){search=element.value;redraw();return}
  if(element.name==='peopleRole'){roleFilter=element.value;redraw();return}
  if(element.name==='peopleStatus'){statusFilter=element.value;redraw();return}
  const draft=view==='invite'?inviteDraft:view==='user'?userDraft:null;
  if(!draft)return;
  if(element.name==='shopIds'){
   const selected=new Set(draft.shopIds||[]);element.checked?selected.add(element.value):selected.delete(element.value);draft.shopIds=[...selected];return;
  }
  if(['name','phone','role'].includes(element.name)){draft[element.name]=element.value;if(element.name==='role')redraw()}
 }
 return {render,handleClick,handleSubmit,handleChange,openInvite,leave(){transferDraft=null;confirmation=null},reset(){resetState();context=contextKey()}};
}

