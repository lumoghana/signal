import {esc,icon} from './ui.js';
const bell=()=>'<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
const date=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-GH',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Accra'}).format(d):'';};
const identity=ctx=>ctx.connected===true&&ctx.shared?.signedIn&&ctx.shared?.user?.id&&ctx.shared.recoveryScope!==null?`${ctx.shared.user.id}:${ctx.shared.authVersion??0}`:'';
export function renderNotificationButton(count=0){return `<button type="button" class="icon-button lumo-notification-control" data-lumo-notifications aria-label="${count?`${count} unread notifications`:'Open notifications'}">${bell()}<span class="lumo-notification-count" data-lumo-unread${count?'':' hidden'}>${count>99?'99+':count||''}</span></button>`;}
export function paintNotificationBadge(model,root=globalThis.document){
 const count=model?.snapshot?.unreadCount||0;root?.querySelectorAll?.('[data-lumo-unread]').forEach(element=>{element.textContent=count>99?'99+':count?String(count):'';element.hidden=!count;});root?.querySelectorAll?.('[data-lumo-notifications]').forEach(element=>{if(element.classList.contains('lumo-notification-control'))element.setAttribute('aria-label',count?`${count} unread notifications`:'Open notifications');});
}
export function renderNotificationRows(notifications){
 return notifications.map(notice=>`<button type="button" class="lumo-notification-item${notice.readAt?'':' unread'}" data-lumo-notice="${esc(notice.id)}"><span class="lumo-notification-icon" aria-hidden="true">${icon(notice.kind==='partner'?'users':notice.kind==='support'?'chat':'send',20)}</span><span class="lumo-notification-copy"><span class="lumo-notification-title"><strong>${esc(notice.title)}</strong>${notice.readAt?'':'<span class="lumo-unread-dot" aria-label="Unread"></span>'}</span><span>${esc(notice.body)}</span><small>${esc(date(notice.createdAt))}</small></span>${icon('chevron',15)}</button>`).join('');
}
/** The center opens the existing authoritative receipt, partner and support journeys. */
export function openLumoNotifications(ctx,{openSupport,openPartners,openOwnerPartner}={}){
 const model=ctx.social,actor=identity(ctx);if(!model||!actor){ctx.toast('Sign in to see your Lumo notifications.');return()=>{};}
 const resumeNotifications=model.pauseNotifications?.();
 let host=null,alive=true,release=null,filter=ctx.draft.socialNotificationFilter==='unread'?'unread':'all',busy=false,error='';
 const valid=()=>{const same=identity(ctx)===actor;if(!same&&alive&&host?.isConnected!==false){alive=false;host.innerHTML='';ctx.closeSheet();}return alive&&host?.isConnected!==false&&same;};
 const dispose=()=>{alive=false;release?.();release=null;resumeNotifications?.();};
 function paint(){
  if(!valid())return;const data=model.snapshot,items=filter==='unread'?data.notifications.filter(n=>!n.readAt):data.notifications,scroll=host.scrollTop;
  host.innerHTML=`<div class="lumo-social-title"><div><span class="eyebrow">From your Lumo</span><h2>Notifications</h2></div><span class="lumo-social-symbol" aria-hidden="true">${bell()}</span></div><p class="muted">Payment updates, partner requests and support messages appear here while you use Lumo.</p><div class="lumo-notification-filter" role="group" aria-label="Filter notifications"><button type="button" data-notice-filter="all" aria-pressed="${filter==='all'}">All</button><button type="button" data-notice-filter="unread" aria-pressed="${filter==='unread'}">Unread${data.unreadCount?' · '+data.unreadCount:''}</button></div><p class="lumo-social-status" role="status" aria-live="polite">${busy?'Opening this update…':data.notificationsLoading?'Refreshing notifications…':data.notificationsLoaded?data.unreadCount?`${data.unreadCount} unread ${data.unreadCount===1?'update':'updates'}`:'You’re all caught up.':''}</p>${data.notificationsError?`<p class="error" role="alert">${esc(data.notificationsError)}</p>`:''}<div class="lumo-notification-list"${busy?' aria-busy="true"':''}>${renderNotificationRows(items)||(!data.notificationsLoading?`<div class="lumo-social-empty">${bell()}<h3>${filter==='unread'?'No unread updates in this view.':'Your updates will appear here.'}</h3><p>${filter==='unread'&&data.hasMore?'Load older updates to check earlier notifications.':'We’ll keep your payment, partner and support updates together.'}</p></div>`:'')}</div>${error?`<p class="error" role="alert">${esc(error)}</p>`:''}<div class="lumo-social-actions">${data.hasMore?`<button type="button" class="button secondary" data-notice-more${data.notificationsLoading||busy?' disabled':''}>Older updates</button>`:''}<button type="button" class="button secondary" data-notice-refresh${data.notificationsLoading||busy?' disabled':''}>Refresh notifications</button></div>`;
  if(busy)host.querySelectorAll('[data-lumo-notice]').forEach(button=>{button.disabled=true;});host.scrollTop=scroll;
 }
 async function openNotice(id){
  if(!valid()||busy)return;const notice=model.snapshot.notifications.find(n=>n.id===id);if(!notice)return;busy=true;error='';paint();
  const ack=await model.readNotification(id);if(!valid())return;busy=false;
  if(ack?.code==='ACCOUNT_CHANGED'){dispose();return;}
  if(!ack?.ok)ctx.toast('This update is open. Its read status will sync when you reconnect.');
  const target=notice.target;
  if(target.kind==='support'&&typeof openSupport==='function'){ctx.closeSheet();void openSupport(target);return;}
  if(target.kind==='partner'&&target.role!=='owner'&&typeof openPartners==='function'){ctx.closeSheet();void openPartners(target);return;}
  if(target.kind==='partner'&&target.role==='owner'){
   if(typeof openOwnerPartner==='function'){ctx.closeSheet();void openOwnerPartner(target);return;}
   ctx.closeSheet();ctx.go({section:'boxes',page:target.boxId?'detail':'home',...(target.boxId?{id:target.boxId}:{})});return;
  }
  if(target.kind==='activity'){
   const transaction=ctx.state.transactions?.find(item=>item.id===target.id);ctx.closeSheet();ctx.go(transaction?{section:'pay',page:'transaction',id:transaction.id,returnTo:{section:'activity',page:'home'}}:{section:'activity',page:'home'});return;
  }
  error='This update cannot open yet. Refresh and try again.';paint();
 }
 ctx.sheet('<div class="lumo-social" data-lumo-notification-center></div>',sheet=>{
  host=sheet.querySelector('[data-lumo-notification-center]');host.addEventListener('click',event=>{const button=event.target.closest?.('button');if(!valid()||!button||button.disabled)return;
   if(button.dataset.noticeFilter){filter=button.dataset.noticeFilter;ctx.draft.socialNotificationFilter=filter;ctx.saveDraft?.();paint();return;}
   if(button.hasAttribute('data-notice-refresh')){void model.refreshNotifications({force:true});return;}
   if(button.hasAttribute('data-notice-more')){void model.refreshNotifications({page:model.snapshot.page+1});return;}
   if(button.dataset.lumoNotice)void openNotice(button.dataset.lumoNotice);
  });release=model.subscribe(()=>{if(valid())paint();else dispose();});paint();void model.refreshNotifications();
 },{onDispose:dispose,closeLabel:'Close notifications'});
 return dispose;
}
