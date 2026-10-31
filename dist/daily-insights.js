/* One useful Home observation and device-local updates. This layer never
   submits a payment, changes an allocation or claims a live message was sent. */
(() => {
 'use strict';
 if(!window.L||L.dailyInsights)return;
 const E=L.e,M=L.money,B=L.btn,DAY=86400000;
 const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
 const money=x=>Math.round((Number(x)||0)*100)/100;
 const iso=now=>new Date(now).toISOString().slice(0,10);
 const dateMs=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return NaN;const parsed=Date.parse(value+'T00:00:00Z');return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===value?parsed:NaN;};
 const timeOK=value=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value||'');
 const clock=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
 const stamp=value=>new Date(value).toLocaleString('en-GH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Africa/Accra'});
 const internal=t=>!!(L.isInternalTransfer?.(t)||t?.internal||t?.internalTransfer);
 let syncing=false;
 function ensure(){
  const s=L.state;
  if(!s.dailyInsights||s.dailyInsights.version!==1)s.dailyInsights={version:1,events:[],status:{},lastGap:null,prefs:{weekly:false,reviewDay:0,reviewTime:'18:00',quiet:true,quietStart:'22:00',quietEnd:'07:00',privateUpdates:false}};
  const d=s.dailyInsights;d.events=Array.isArray(d.events)?d.events:[];d.status=d.status&&typeof d.status==='object'?d.status:{};d.seen=d.seen&&typeof d.seen==='object'?d.seen:{};
  d.prefs={weekly:false,reviewDay:0,reviewTime:'18:00',quiet:true,quietStart:'22:00',quietEnd:'07:00',privateUpdates:false,...d.prefs};
  return d;
 }
 const quiet=(now=Date.now())=>{
  const p=ensure().prefs;if(!p.quiet||!timeOK(p.quietStart)||!timeOK(p.quietEnd))return false;
  const n=new Date(now),at=n.getUTCHours()*60+n.getUTCMinutes(),start=clock(p.quietStart),end=clock(p.quietEnd);
  if(start===end)return false;return start<end?at>=start&&at<end:at>=start||at<end;
 };
 function summary(period='today',now=Date.now(),range={}){return L.dailySpendingSummary({period,now,...range});}
 const received=(start,end)=>(L.state.txs||[]).filter(t=>t.type==='in'&&t.status==='success'&&!internal(t)&&!t.originalId&&Number(t.amount)>0&&Date.parse(t.date)>=start&&Date.parse(t.date)<=end);
 const periodEnd=()=>Number.isFinite(dateMs(L.state.planHorizon?.date))&&['date','allowance'].includes(L.state.planHorizon?.mode)?L.state.planHorizon.date:'';
 const renewRoute=()=>L.views.budgetCycle?'budgetCycle':'planPeriod';
 const renewAction=()=>L.openBudgetCycle?'L.openBudgetCycle()':`L.go('${renewRoute()}')`;
 const groupLine=s=>{
  const first=s.categories[0];if(!first)return 'No completed payments in this period.';
  const tied=s.categories.filter(x=>x[1]===first[1]);
  return tied.length>1?`${tied.length} categories share the largest amount, at ${M(first[1])} each.`:`${first[0]} took the largest share: ${M(first[1])}.`;
 };
 const dateLabel=value=>new Date(value).toLocaleDateString('en-GH',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
 // Due dates are entered facts, not a forecast of allowance or daily spending.
 // Pending linked payments already reserve the corresponding saved cost.
 function dueCost(now=Date.now()){
  const today=dateMs(iso(now)),position=L.pauseEngine?.planPosition?.({amount:0,fee:0},L.state);
  const items=(L.state.essentials||[]).filter(x=>x&&!x.archived&&!x.deleted).map(x=>({
   ...x,due:dateMs(x.date),remaining:Number(position?.essentials?.find(c=>c.id===x.id)?.before)||0
  })).filter(x=>Number.isFinite(x.due)&&x.due<=today+DAY&&x.remaining>0);
  items.sort((a,b)=>a.due-b.due||String(a.name).localeCompare(String(b.name)));
  const cost=items[0];if(!cost)return null;
  const daysAway=Math.round((cost.due-today)/DAY),when=daysAway===1?'is due tomorrow':daysAway===0?'is due today':`was due ${dateLabel(cost.due)}`;
  return {kind:'due',label:daysAway<0?'Your money story · Cost to review':'Your money story · Coming up',
   headline:`${M(cost.remaining)} for ${cost.name} ${when}.`,support:'Already included in your Budget.',
   detail:'This is the unpaid amount of a saved cost, not an extra deduction.',route:'essentialEdit',costId:cost.id,action:'Review '+cost.name,period:'today'};
 }
 L.openDueBudgetCost=id=>{
  const cost=(L.state.essentials||[]).find(x=>x.id===id&&!x.archived&&!x.deleted),position=L.pauseEngine?.planPosition?.({amount:0,fee:0},L.state);
  if(!cost||!Number.isFinite(dateMs(cost.date))||!(position?.essentials?.find(x=>x.id===id)?.before>0)){
   L.go('plan');L.toast('That cost has changed. Review your Budget.');return false;
  }
  L.go('essentialEdit',{id});return true;
 };
 // Home leads with the category that explains recorded money out. Transfers
 // remain money sent, and an unknown purpose is never presented as a purchase.
 const todayLine=s=>{
  const first=s.categories[0];if(!first)return 'No completed payments today.';
  const [name,amount]=first,tied=s.categories.filter(x=>x[1]===amount);
  if(tied.length>1){
   const names=tied.map(x=>x[0]==='Transfers'?'money sent':x[0]);
   return tied.length===2?`${names.join(' and ')}: ${M(amount)} each today.`:`${tied.length} categories tied at ${M(amount)} each today.`;
  }
  if(name==='Uncategorised')return `${M(amount)} paid out today still needs a category.`;
  if(name==='Transfers')return `${M(amount)} sent in transfers today.`;
  return `${name} took ${M(amount)}${s.categories.length>1?' of '+M(s.total):''} today.`;
 };
 function insight(now=Date.now()){
  const b=L.balances(),end=periodEnd(),today=summary('today',now),week=L.spendingSummary({days:7,now});
  if(b.gap>0)return {kind:'gap',label:'Your money story · Budget',headline:`${M(b.gap)} of your saved Budget is uncovered.`,detail:`${M(b.gap)} of your saved costs is not covered by available operational money.`,route:'makeRoom',action:'Review your options',period:'today'};
  if(end&&end<iso(now))return {kind:'period',label:'Your money story · Next Budget',headline:'Your Budget period has ended.',detail:'Review the costs and dates before using this Budget again. Past payments stay in your history.',route:renewRoute(),action:'Use your Budget again',period:'today'};
  const due=dueCost(now);if(due)return due;
  if(today.total>0)return {kind:'today',label:'Your money story · Today in Lumo',headline:todayLine(today),detail:groupLine(today),route:'dailyMoneyStory',action:'See today’s payments',period:'today'};
  const inflows=received(Date.parse(iso(now)+'T00:00:00Z'),now),income=money(inflows.reduce((n,t)=>n+Number(t.amount),0));
  if(income>0)return {kind:'income',label:'Your money story · Today',headline:`${M(income)} received today.`,detail:'Confirmed incoming money, excluding Money Box movements and refunds. Your existing Budget stays in place.',route:L.hasMeaningfulPlan?.()?'planEdit':'planBenefit',action:L.hasMeaningfulPlan?.()?'Review Budget':'Give it a Budget',period:'today'};
  if(!L.hasMeaningfulPlan?.()&&b.available>0)return {kind:'start',label:'Your money story · Start here',headline:'What does this money need to cover?',detail:'Save one everyday cost to see what remains. A Budget does not move or lock your money.',route:'planBenefit',action:'See how Budget helps',period:'today'};
  return {kind:'week',label:'Your money story · last 7 days',headline:week.total?`${M(week.total)} paid out in the last 7 days.`:'Your money story starts with your first payment.',detail:groupLine(week),route:'homeMoneyStory',action:'See your money story',period:'thisWeek'};
 }
 function sync(now=Date.now()){
  if(syncing||!L.state.onboarded||L.state.closed||L.state.locked)return [];
  syncing=true;
  try{
   const d=ensure(),p=d.prefs,existing=new Set(d.events.map(x=>x.key));let changed=false;
   const add=event=>{if(existing.has(event.key)||d.seen[event.key])return;existing.add(event.key);d.seen[event.key]=true;d.events.unshift({id:'DI-'+event.key,key:event.key,read:false,createdAt:new Date(now).toISOString(),quiet:quiet(now),...event});changed=true;};
   for(const t of L.state.txs||[]){
    if(!t.id)continue;const previous=d.status[t.id];
    if(previous==='pending'&&['success','failed','reversed'].includes(t.status))add({key:`resolved:${t.id}:${t.status}`,kind:'status',critical:true,txId:t.id,title:t.status==='success'?(t.type==='in'?'Incoming money confirmed.':'Payment confirmed.'):t.status==='reversed'?'Payment reversed.':t.type==='in'?'Incoming money did not complete.':'Payment did not complete.',body:`${t.name||'Your payment'} · ${M(t.amount)}. Follow the original reference.`,status:t.status});
    if(t.type==='in'&&t.status==='success'&&!internal(t)&&!t.originalId&&Number.isFinite(Number(t.amount))&&Number(t.amount)>0&&L.state.prefs?.payment!==false&&!d.seen[`resolved:${t.id}:success`]&&Date.parse(t.date)>=now-14*DAY&&Date.parse(t.date)<=now)add({key:`receipt:${t.id}`,kind:'receipt',txId:t.id,title:`${M(t.amount)} received.`,body:`Confirmed incoming money from ${t.name||'your funding source'}.`});
    if(previous!==t.status){d.status[t.id]=t.status;changed=true;}
   }
   const gap=money(L.balances().gap),allowPlan=L.state.accountPrefs?.plan!==false;
   if(d.lastGap!==null&&gap>d.lastGap&&allowPlan){const scope=(L.state.essentials||[]).map(x=>[x.id,Number(x.amount),Number(x.paid||0)]);add({key:'gap:'+JSON.stringify([scope,gap]),kind:'budget',title:'Your saved Budget needs attention.',body:`${M(gap)} of your saved costs is not covered. Review before your next payment.`});}
   if(d.lastGap!==gap){d.lastGap=gap;changed=true;}
   const end=periodEnd();if(end&&end<iso(now)&&allowPlan)add({key:'period:'+end,kind:'period',title:'Your Budget period has ended.',body:'Review the dates and costs before starting the next one.'});
   // Keep the most recent eligible weekly review for the next visit. Starting
   // or changing a schedule never backfills reviews from before that choice.
   const enabled=!!p.weekly&&L.state.prefs?.insights!==false&&Number.isInteger(Number(p.reviewDay))&&Number(p.reviewDay)>=0&&Number(p.reviewDay)<=6&&timeOK(p.reviewTime),schedule=enabled?`${Number(p.reviewDay)}|${p.reviewTime}`:'';
   if(!enabled){if(d.weeklySchedule?.active){d.weeklySchedule.active=false;changed=true;}}
   else{
    if(!d.weeklySchedule?.active||d.weeklySchedule.signature!==schedule||!Number.isFinite(d.weeklySchedule.enabledAt)||d.weeklySchedule.enabledAt>now){d.weeklySchedule={active:true,signature:schedule,enabledAt:now,lastDueAt:null};changed=true;}
    const n=new Date(now),today=dateMs(iso(now)),offset=(n.getUTCDay()-Number(p.reviewDay)+7)%7;
    let dueAt=today-offset*DAY+clock(p.reviewTime)*60000;if(dueAt>now)dueAt-=7*DAY;
    const tracker=d.weeklySchedule;
    if(dueAt>=tracker.enabledAt&&(tracker.lastDueAt===null||dueAt>tracker.lastDueAt)){
     // Seven complete days, ending before the chosen review day. A catch-up
     // uses this same frozen range, never newly arrived spending after it.
     const end=dateMs(iso(dueAt))-1,start=end+1-7*DAY,s=summary('range',now,{start,end});
     add({key:'weekly:'+iso(dueAt),kind:'weekly',title:'Your week in focus.',body:`${M(s.total)} paid out · ${dateLabel(start)} to ${dateLabel(end)}. ${groupLine(s)}`,start,end,reviewAt:dueAt});
     tracker.lastDueAt=dueAt;changed=true;
    }
   }
   if(d.events.length>60){d.events=d.events.slice(0,60);changed=true;}
   if(changed)L.save();return d.events;
  }finally{syncing=false;}
 }
 const accountNotices=()=>Array.isArray(L.state.notifications)?L.state.notifications:[];
 const noticeText=n=>typeof n==='string'?{title:'Account notice',body:n}:{title:String(n?.title||n?.label||'Account notice'),body:String(n?.body||n?.message||n?.text||n?.description||'Open account details for this notice.')};
 const unread=(now=Date.now())=>ensure().events.filter(x=>!x.read&&(x.critical||!quiet(now))).length+accountNotices().filter(n=>typeof n==='object'&&n&&!n.read).length;
 const baseHome=L.homeMoneyStoryCard;
 L.homeMoneyStoryCard=()=>{
  const i=insight(),payoff=!['gap','period','due'].includes(i.kind)&&L.firstBudgetPayoffCard?.();
  if(payoff)return payoff;
  if(i.kind==='week')return baseHome().replace('Your money story · last 7 days','Your money story · 7 days in Lumo');
  const params=i.route==='dailyMoneyStory'?`,{period:'${i.period}'}`:'',action=i.kind==='period'?renewAction():i.kind==='due'?`L.openDueBudgetCost(${E(JSON.stringify(i.costId))})`:`L.go('${i.route}'${params})`;
  return `<section class="home-focus-group home-money-story home-daily-insight" data-home-focus="story" aria-label="Your money story"><button type="button" class="home-story-open" onclick="${action}"><span class="home-story-heading"><span class="home-story-copy"><span class="home-story-title">${E(i.label)}</span><strong class="home-story-insight">${E(i.headline)}</strong>${i.support?`<small>${E(i.support)}</small>`:''}</span><span class="home-story-arrow" aria-hidden="true">${L.icon('chevron',20)}</span></span></button></section>`;
 };
 const home=L.views.home;
 L.views.home=()=>{
  sync();let html=home(),count=unread();if(!count)return html;
  return html.replace(/(<button\b[^>]*aria-label="Updates"[^>]*>)([\s\S]*?)(<\/button>)/,(_,open,body,close)=>open.replace('aria-label="Updates"','aria-label="Updates" aria-describedby="daily-unread-description"')+body+`<span class="daily-unread-badge" aria-hidden="true">${Math.min(count,9)}${count>9?'+':''}</span><span id="daily-unread-description" class="sr-only">${count} unread update${count===1?'':'s'}</span>`+close);
 };
 function refreshBadge(){
  const button=document.querySelector('.home-header-actions button[aria-label="Updates"]');if(!button)return;
  button.querySelector('.daily-unread-badge')?.remove();button.querySelector('#daily-unread-description')?.remove();button.removeAttribute('aria-describedby');
  const count=unread();if(!count)return;
  const badge=document.createElement('span');badge.className='daily-unread-badge';badge.setAttribute('aria-hidden','true');badge.textContent=Math.min(count,9)+(count>9?'+':'');button.appendChild(badge);
  const description=document.createElement('span');description.className='sr-only';description.id='daily-unread-description';description.textContent=count+' unread updates';button.appendChild(description);button.setAttribute('aria-describedby',description.id);
 }
 L.markDailyUpdatesRead=()=>{ensure().events.forEach(x=>x.read=true);accountNotices().forEach(n=>{if(n&&typeof n==='object')n.read=true;});L.save();refreshBadge();L.render();};
 L.openSavedAccountNotice=index=>{const notice=accountNotices()[index];if(!notice)return;if(typeof notice==='object')notice.read=true;L.save();refreshBadge();L.go('dailyAccountNotice',{index});};
 L.views.dailyAccountNotice=()=>{
  const n=accountNotices()[Number(L.params.index)];
  if(!n)return `<section>${L.header('Notice unavailable.','Open your updates to choose another notice.')}<div class="actions">${B('View updates',"L.go('notifications')",'secondary')}</div></section>`;
  const text=noticeText(n);return `<section>${L.header(text.title)}<p>${E(text.body)}</p><p class="small muted">Saved account notice. Important notices remain available inside Lumo.</p>${B('Done','L.back()','secondary')}</section>`;
 };
 L.openDailyUpdate=id=>{
  const event=ensure().events.find(x=>x.id===id);if(!event)return;
  event.read=true;L.save();refreshBadge();
  if(event.txId&&L.state.txs.some(t=>t.id===event.txId))return L.go('txDetail',{id:event.txId});
  if(event.kind==='weekly')return L.go('dailyMoneyStory',{period:'thisWeek',start:event.start,end:event.end});
  if(event.kind==='period')return L.openBudgetCycle?L.openBudgetCycle():L.go(renewRoute());
  if(event.kind==='budget')return L.go('makeRoom');
 };
 L.views.notifications=()=>{
  const events=sync(),notices=accountNotices(),pending=(L.state.txs||[]).filter(t=>t.status==='pending').length,gap=L.balances().gap,p=ensure().prefs;
  const hasUnread=events.some(x=>!x.read)||notices.some(n=>n&&typeof n==='object'&&!n.read);
  const privateTitle=kind=>({receipt:'Incoming payment update',status:'Payment status update',budget:'Budget update',period:'Budget period update',weekly:'Weekly review'}[kind]||'Money update');
  const saved=notices.length?`<section class="daily-account-notices"><h2>Account notices</h2>${notices.map((n,index)=>{const text=noticeText(n);return L.row(text.title,text.body,typeof n==='object'&&n?.type==='security'?'shield':'bell',`L.openSavedAccountNotice(${index})`);}).join('')}</section>`:'';
  return `<section class="daily-updates-page">${L.header('Your updates','Useful things, when they matter.')}${pending?L.row('Payment in progress','Follow the same reference. Do not pay again.','clock',"L.go('pending')"):''}${gap?L.row('Your Budget needs attention',M(gap)+' of saved costs is uncovered.','plan',"L.go('makeRoom')"):''}${events.length||notices.length?`${hasUnread?`<div class="daily-updates-toolbar">${B('Mark all read','L.markDailyUpdatesRead()','text-btn')}</div>`:''}${saved}<div class="daily-updates-list">${events.map(x=>`<button type="button" class="daily-update-row${x.read?'':' is-unread'}" onclick="L.openDailyUpdate(${E(JSON.stringify(x.id))})"><span class="daily-update-symbol" aria-hidden="true">${L.icon(x.kind==='receipt'?'arrowDown':x.kind==='status'?'receipt':x.kind==='weekly'?'chat':'plan',21)}</span><span><strong>${E(p.privateUpdates?privateTitle(x.kind):x.title)}</strong><small>${E(p.privateUpdates?'Open to see the details.':x.body)}</small><time datetime="${E(x.createdAt)}">${E(stamp(x.createdAt))}${x.read?'':' · Unread'}</time></span>${L.icon('chevron',17)}</button>`).join('')}</div>`:!pending&&!gap?'<div class="empty"><h2>You’re all caught up.</h2><p>Confirmed receipts, resolved payments and useful Budget updates appear here.</p></div>':''}${quiet()?'<p class="daily-quiet-note small muted">Quiet hours are on. Optional update badges wait; account status stays available.</p>':''}${L.row('Your notification preferences','Choose updates, review time and quiet hours.','bell',"L.go('notificationPrefs')")}<p class="daily-delivery-note small muted">In-app preview only. Push, SMS and email are not connected.</p></section>`;
 };
 const preferences=L.views.notificationPrefs;
 L.views.notificationPrefs=()=>preferences()+`<section class="daily-preferences-link">${L.row('Review time & quiet hours',ensure().prefs.weekly?'Weekly review is on.':'Weekly review is optional.','clock',"L.go('dailyUpdatePrefs')")}${B("Preview this week's spending","L.go('dailyMoneyStory',{period:'thisWeek'})",'secondary')}</section>`;
 const preferenceOptions=(id,enabled,html)=>`<div id="${id}"${enabled?'':' hidden'}>${enabled?html:html.replace(/<(input|select)\b/g,'<$1 disabled')}</div>`;
 L.views.dailyUpdatePrefs=()=>{
  const p=ensure().prefs;
  const review=`<label class="field" for="daily-review-day"><span>Review day</span><select id="daily-review-day">${days.map((name,i)=>`<option value="${i}"${i===Number(p.reviewDay)?' selected':''}>${name}</option>`).join('')}</select></label>${L.field('Review time','daily-review-time','','time',p.reviewTime)}`;
  const quietTimes=`<div class="daily-time-pair">${L.field('From','daily-quiet-start','','time',p.quietStart)}${L.field('Until','daily-quiet-end','','time',p.quietEnd)}</div>`;
  return `<section class="daily-preferences-page">${L.header('Useful updates. Your timing.','These preferences apply to this device’s in-app preview.')}<form onsubmit="event.preventDefault();L.saveDailyUpdatePrefs()"><label class="daily-check"><input id="daily-weekly-enabled" type="checkbox" aria-controls="daily-weekly-options"${p.weekly?' checked':''}><span><strong>A weekly money story</strong><small>One observation and a useful next step.</small></span></label>${preferenceOptions('daily-weekly-options',p.weekly,review)}<label class="daily-check"><input id="daily-quiet-enabled" type="checkbox" aria-controls="daily-quiet-options"${p.quiet?' checked':''}><span><strong>Quiet hours</strong><small>Hold optional update badges during these hours.</small></span></label>${preferenceOptions('daily-quiet-options',p.quiet,quietTimes)}<label class="daily-check"><input id="daily-private-updates" type="checkbox"${p.privateUpdates?' checked':''}><span><strong>Private update previews</strong><small>Keep amounts and names out of the update list.</small></span></label><p class="small muted">Times use Ghana time. Weekly stories cover seven complete days. A missed review waits for your next visit. Important payment status remains available.</p><div id="error" role="alert"></div><div class="actions"><button type="submit" class="primary">Save preferences</button>${B('Cancel','L.cancelDailyUpdatePrefs()','text-btn')}</div></form></section>`;
 };
 L.syncDailyUpdateOptions=()=>{
  if(L.route!=='dailyUpdatePrefs')return;
  for(const [toggle,id]of [['daily-weekly-enabled','daily-weekly-options'],['daily-quiet-enabled','daily-quiet-options']]){
   const group=document.getElementById(id);if(!group)continue;
   const enabled=!!document.getElementById(toggle)?.checked;group.hidden=!enabled;
   for(const field of group.querySelectorAll('input,select'))field.disabled=!enabled;
  }
 };
 document.addEventListener('change',event=>{if(['daily-weekly-enabled','daily-quiet-enabled'].includes(event.target?.id))L.syncDailyUpdateOptions();});
 const finishUpdatePrefs=()=>{
  L.clearFormDraft?.('dailyUpdatePrefs',L.params);
  const capture=L.skipFormCapture;L.skipFormCapture=true;
  try{return L.go('notificationPrefs');}finally{L.skipFormCapture=capture;}
 };
 L.cancelDailyUpdatePrefs=()=>finishUpdatePrefs();
 L.saveDailyUpdatePrefs=()=>{
  const value=id=>document.getElementById(id)?.value||'',checked=id=>!!document.getElementById(id)?.checked;
  const day=Number(value('daily-review-day')),review=value('daily-review-time'),start=value('daily-quiet-start'),end=value('daily-quiet-end'),weekly=checked('daily-weekly-enabled'),quietEnabled=checked('daily-quiet-enabled'),previous=ensure().prefs;
  const dayOK=/^[0-6]$/.test(value('daily-review-day')),quietOK=timeOK(start)&&timeOK(end)&&start!==end;
  if(weekly&&!dayOK)return L.error('Choose a review day.','daily-review-day');
  if(weekly&&!timeOK(review))return L.error('Choose a valid review time.','daily-review-time');
  if(quietEnabled&&!quietOK)return L.error('Choose different start and end times for quiet hours.','daily-quiet-start');
  const previousQuietOK=timeOK(previous.quietStart)&&timeOK(previous.quietEnd)&&previous.quietStart!==previous.quietEnd;
  ensure().prefs={weekly,reviewDay:dayOK?day:/^[0-6]$/.test(String(previous.reviewDay))?Number(previous.reviewDay):0,reviewTime:timeOK(review)?review:timeOK(previous.reviewTime)?previous.reviewTime:'18:00',quiet:quietEnabled,quietStart:quietOK?start:previousQuietOK?previous.quietStart:'22:00',quietEnd:quietOK?end:previousQuietOK?previous.quietEnd:'07:00',privateUpdates:checked('daily-private-updates')};L.save();sync();refreshBadge();finishUpdatePrefs();L.toast('Update preferences saved.');
 };
 L.views.dailyMoneyStory=()=>{
  const period=['today','yesterday','thisWeek','lastWeek'].includes(L.params.period)?L.params.period:'today',range=Number.isFinite(Number(L.params.start))&&Number.isFinite(Number(L.params.end)),s=summary(range?'range':period,Date.now(),range?{start:Number(L.params.start),end:Number(L.params.end)}:{}),i=insight();
  const label=range?new Date(s.start).toLocaleDateString('en-GH',{day:'numeric',month:'short',timeZone:'Africa/Accra'})+' to '+new Date(s.end).toLocaleDateString('en-GH',{day:'numeric',month:'short',timeZone:'Africa/Accra'}):s.label;
  const question=range&&s.valid!==false?`Show spending from ${iso(s.start)} to ${iso(s.end)}`:`What did I spend ${period==='today'?'today':period==='yesterday'?'yesterday':period==='lastWeek'?'last week':'this week'}?`;
  return `<section class="daily-money-story">${L.header(['today','yesterday'].includes(period)?'Your day, in focus.':'Your week, in focus.',label+' · Lumo activity only')}<div class="daily-story-conclusion"><span>Completed money out</span><strong>${L.balanceNumber(s.total)}</strong><p>${E(groupLine(s))}</p></div><div class="daily-story-actions">${B(i.kind==='gap'?'Review Budget':i.kind==='period'?'Use Budget again':'Ask about this',i.kind==='gap'?"L.go('makeRoom')":i.kind==='period'?renewAction():`L.go('chat',{question:${E(JSON.stringify(question))}})`,'secondary')}</div>${L.dailyStoryCategoryPrompt?.(s)||''}<details class="daily-story-details"><summary>See the breakdown · ${s.txs.length} payment${s.txs.length===1?'':'s'}</summary><dl>${s.categories.map(([name,value])=>`<div><dt>${E(name)}</dt><dd>${M(value)}</dd></div>`).join('')}</dl>${s.txs.map(t=>`<button type="button" class="daily-story-payment" onclick="L.go('txDetail',{id:${E(JSON.stringify(t.id))}})"><span><strong>${E(t.name||'Payment')}</strong><small>${E(stamp(t.date))}</small></span><strong>${M(Number(t.amount)+Number(t.fee||0))}</strong></button>`).join('')}</details><p class="small muted">Includes completed outgoing payments and their fees. Incoming money, failed or pending payments and transfers between your own Lumo accounts are excluded. Money sent to someone else is not necessarily a purchase.</p>${B('Done','L.back()','text-btn')}</section>`;
 };
 L.taskSheet?.register?.('dailyMoneyStory',{family:'records',treatment:'detail',label:'Your money story'});
 L.taskSheet?.register?.('dailyAccountNotice',{family:'account',treatment:'detail',label:'Account notice'});
 L.taskSheet?.register?.('dailyUpdatePrefs',{family:'account',treatment:'edit',label:'Update preferences'});
 for(const name of ['addTx','resolveTx']){const action=L[name];L[name]=function(...args){const result=action.apply(this,args);sync();return result;};}
 const render=L.render;L.render=function(...args){sync();const result=render.apply(this,args);L.syncDailyUpdateOptions();return result;};
 L.dailyInsights={sync,insight,summary,prefs:()=>ensure().prefs,events:()=>ensure().events,unread,isQuiet:quiet};
})();
