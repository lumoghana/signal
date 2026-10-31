/* One contextual illustration per screen. Payment actions use the existing engine. */
(()=>{
'use strict';
const E=L.e,M=L.money,B=L.btn;
const sprites={lumo:[4,60,376,324],momo:[394,60,330,320],bank:[754,92,300,272],campus:[1084,108,354,262],request:[8,392,356,312],airtime:[400,392,310,316],data:[736,426,330,256],electricity:[1114,390,308,314],water:[30,718,330,338],tv:[396,720,316,342],internet:[738,710,326,346],activity:[1082,716,356,346]};
L.paymentArt=(kind,extra='')=>{
 const key=Object.hasOwn(sprites,kind)?kind:'activity',box=sprites[key],[x,y,width,height]=box,clip='lumo-payment-clip-'+key;
 return `<span class="option-art scene-legon scene-size-everyday ${extra}" data-art="payment-${key}" data-campus="${L.legonCampusFor(key)}" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(' ')}" preserveAspectRatio="xMidYMid meet" overflow="hidden"><defs><clipPath id="${clip}" clipPathUnits="userSpaceOnUse"><rect x="${x}" y="${y}" width="${width}" height="${height}"/></clipPath></defs><g clip-path="url(#${clip})">${L.legonBackdrop(key,box)}<image href="/assets/lumo-payment-atlas-v19.webp" width="1448" height="1086"/></g></svg></span>`;
};
const accountSprites={profile:[0,0,418,418],account:[418,0,418,418],security:[836,0,418,418],privacy:[0,418,428,418],notifications:[428,418,386,418],help:[814,418,440,418],testing:[0,836,404,418],feedback:[404,836,422,418],devices:[830,836,424,418]};
const accountSources={profile:[0,0,418,440],account:[418,0,418,438],security:[836,0,418,438],privacy:[0,440,418,413],notifications:[426,438,396,420],help:[836,438,418,416],testing:[0,853,418,401],feedback:[418,858,418,396],devices:[836,854,418,400]};
L.accountArt=kind=>{
 const key=Object.hasOwn(accountSprites,kind)?kind:'profile',box=accountSprites[key],[x,y,width,height]=box,clip='lumo-account-clip-'+key;
 return `<figure class="scene-art scene-editorial scene-account scene-legon scene-size-everyday" data-art="account-${key}" data-campus="${L.legonCampusFor(key)}" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(' ')}" preserveAspectRatio="xMidYMid meet" overflow="hidden"><defs><clipPath id="${clip}" clipPathUnits="userSpaceOnUse"><rect x="${x}" y="${y}" width="${width}" height="${height}"/></clipPath></defs><g clip-path="url(#${clip})">${L.legonBackdrop(key,box)}${L.atlasScene('/assets/lumo-you-atlas-v22.webp',accountSources[key],box,'lumo-account-subject-'+key,[1254,1254])}</g></svg></figure>`;
};
const menuIcons={lumo:'user',momo:'phone',bank:'bank',campus:'scan',request:'arrowDown',airtime:'phone',data:'grid',electricity:'bolt',water:'drop',tv:'tv',internet:'wifi',activity:'receipt',identity:'user',home:'shield',chat:'help',merchant:'grid',plan:'target',goals:'target'};
const choice=(label,key,action,scene=false,sub='')=>`<button class="menu-choice" onclick="${action.replace(/"/g,'&quot;')}"><span class="menu-icon">${L.icon(menuIcons[key]||'grid',23)}</span><span><strong>${E(label)}</strong>${sub?`<small>${E(sub)}</small>`:''}</span></button>`;
const menuRow=(label,sub,key,action)=>L.row(label,sub,menuIcons[key]||'grid',action);
const payTabs=[['send','Send money'],['campus','Campus Pay'],['bills','Bills & top-ups']];
L.payTab=()=>payTabs.some(([key])=>key===L.params.tab)?L.params.tab:'send';
L.setPayTab=tab=>{
 if(!payTabs.some(([key])=>key===tab))return;
 L.params={...L.params,tab};L.render();
 document.getElementById('pay-tab-'+tab)?.focus?.({preventScroll:true});
};
L.payTabKey=event=>{
 const index=payTabs.findIndex(([key])=>key===L.payTab());let next;
 if(event.key==='ArrowRight')next=(index+1)%payTabs.length;
 else if(event.key==='ArrowLeft')next=(index+payTabs.length-1)%payTabs.length;
 else if(event.key==='Home')next=0;else if(event.key==='End')next=payTabs.length-1;else return;
 event.preventDefault();L.setPayTab(payTabs[next][0]);
};
// Artwork belongs to the selected task, never to every menu option.
L.contextualIllustration=route=>{
 const d=L.state.paymentDraft,service=kind=>`<figure class="scene-art scene-editorial scene-service scene-legon" data-campus="${L.legonCampusFor(kind)}" aria-hidden="true">${L.paymentArt(kind)}</figure>`;
 const accountArt={profile:'profile',profileEdit:'profile',profilePhone:'devices',accountInfo:'account',accountTerms:'account',security:'security',changePin:'security',devices:'devices',privacy:'privacy',privacyNotice:'privacy',dataExport:'account',notificationPrefs:'notifications',notifications:'notifications',help:'help',supportCase:'feedback',caseDetail:'help',testing:'testing',feedback:'feedback',closeAccount:'privacy',recovery:'security',recoveryOwnership:'profile',recoveryReplacement:'devices',recoveryStatus:'security',authorize:'security'};
 if(Object.hasOwn(accountArt,route))return L.accountArt(accountArt[route]);
 if(route==='pay'&&L.payTab()==='campus')return L.illustration('merchant');
 if(route==='pay'&&L.payTab()==='bills')return service('activity');
 if(route==='send'&&!d?.submittedTxId)return service(d?.method==='campus'?'campus':d?.method==='request'?'request':d?.method==='bank'?'bank':d?.method==='momo'?'momo':'lumo');
 if(route==='bill'&&!d?.submittedTxId)return service(d?.bill||L.params.kind||'airtime');
 const taskArt={campusPay:'merchant',pay:'pay',more:'identity',paymentReview:'plan'};
 if(Object.hasOwn(taskArt,route))return L.illustration(taskArt[route],true);
 const serviceArt={requests:'request',requestCreate:'lumo',requestDetail:'activity',requestConfirm:'request',activity:'activity',txDetail:'activity',bankAdd:'bank',momoAdd:'momo',story:'activity',allowance:'momo',essentials:'campus',statements:'activity'};
 if(Object.hasOwn(serviceArt,route))return service(serviceArt[route]);
 return null;
};
const top=title=>`<div class="topline"><span class="wordmark wordmark-small" aria-hidden="true"><img class="actual-wordmark lumo-wordmark-asset" src="/brand/Lumo-Wordmark-Black.svg" alt="Lumo"></span><span class="eyebrow">${E(title)}</span><button class="icon-btn" onclick="L.go('help',{returnTo:L.route,returnParams:L.params})" aria-label="Get help">${L.icon('help',21)}</button></div>`;

L.views.pay=()=>{
 const d=L.state.paymentDraft,pending=L.state.txs.filter(t=>t.status==='pending').length,tab=L.payTab();
 const sending=[['To a Lumo user','lumo',"L.startSend('lumo')"],['To mobile money','momo',"L.startSend('momo')"],['To a bank account','bank',"L.startSend('bank')"]];
 const bills=[['Airtime','airtime',"L.startBill('airtime')"],['Data bundles','data',"L.startBill('data')"],['Electricity','electricity',"L.startBill('electricity')"],['Water','water',"L.startBill('water')"],['TV subscription','tv',"L.startBill('tv')"],['Internet','internet',"L.startBill('internet')"]];
 const list=items=>`<div class="pay-option-list">${items.map(([label,key,action])=>menuRow(label,'',key,action)).join('')}</div>`;
 const panel=(key,content)=>`<section class="pay-tab-panel" id="pay-panel-${key}" role="tabpanel" aria-labelledby="pay-tab-${key}" tabindex="0" ${tab===key?'':'hidden'}>${content}</section>`;
 const campus=`<button type="button" class="primary qr-launch-button" onclick="L.qr.open()">${L.icon('scan',22)} Scan QR</button><form class="campus-code" onsubmit="event.preventDefault();L.findMerchant()"><label for="merchant-code">Merchant or sale code</label><div class="inline"><input id="merchant-code" name="merchantCode" placeholder="Enter a code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="64"><button class="secondary" type="submit">Find</button></div></form><div id="error" role="alert"></div><div class="pay-option-list">${L.row('Akua’s Kitchen','Food · AK01','scan',"L.pickMerchant('AK01')")}${L.row('Campus Print','Printing · CP02','scan',"L.pickMerchant('CP02')")}${L.row('Ride & Go','Transport · RB03','scan',"L.pickMerchant('RB03')")}</div>${L.testMode?`<details class="pay-campus-code"><summary>Ambassador tools</summary>${B('Try sample QR ↗',"L.pickMerchant('AK01')",'text-btn')}${B('All Campus Pay options ↗',"L.go('campusPay')",'text-btn')}</details>`:''}`;
 return `<section data-illustrated-screen="pay">${top('Pay')}<div class="pay-hero">${L.contextualIllustration('pay')}</div><h1 class="sr-only">Pay</h1><div class="pay-tabs" role="tablist" aria-label="Payment type">${payTabs.map(([key,label])=>`<button type="button" id="pay-tab-${key}" role="tab" aria-selected="${tab===key}" aria-controls="pay-panel-${key}" tabindex="${tab===key?0:-1}" onclick="L.setPayTab('${key}')" onkeydown="L.payTabKey(event)">${E(label)}</button>`).join('')}</div>${d&&!d.submittedTxId?`<button class="compact-draft" onclick="L.editPayment()">${L.icon('clock',17)}<span>Continue ${E(d.name||'your saved payment')}${d.amount?' · '+M(d.amount):''}</span>${L.icon('chevron',15)}</button>`:''}${panel('send',list(sending))}${panel('campus',campus)}${panel('bills',list(bills))}<div class="pay-utilities">${B(L.icon('arrowDown',16)+' Requests',"L.go('requests')",'text-btn')}${B(L.icon('receipt',16)+' Activity',"L.go('activity')",'text-btn')}${pending?B(L.icon('clock',16)+' Pending ('+pending+')',"L.go('pending')",'text-btn'):''}</div></section>`;
};

L.views.home=()=>{
 const s=L.state,b=L.balances(),name=E(s.profile.name.split(' ')[0]),funded=b.available>0;
 const last=[...s.txs].sort((a,b)=>new Date(b.date)-new Date(a.date))[0],d=s.paymentDraft;
 const latestLabel=last?.status==='pending'?'Payment in progress':last?.status==='failed'?'Payment not completed':last?.status==='reversed'?'Payment reversed':last?.type==='in'?'Latest money in':'Latest payment';
 return `<section data-illustrated-screen="home"><h1 class="sr-only">Home</h1><div class="home-greeting"><span class="wordmark" aria-label="Lumo"><img class="actual-wordmark lumo-wordmark-asset" src="/brand/Lumo-Wordmark-Black.svg" alt="Lumo"></span><div class="inline"><button class="icon-btn" aria-label="Updates" onclick="L.go('notifications')">${L.icon('bell',21)}</button><button class="avatar" style="border:0" onclick="L.go('profile')" aria-label="Open your profile">${name[0]}</button></div></div><div class="home-balance-scene"><div><p class="small muted">Hey, ${name}.</p><button class="text-btn balance-label" onclick="L.go('balances')">Available balance ${L.icon('chevron',13)}</button><div class="balance-main"><span class="balance-accent">${L.balanceNumber(b.available)}</span></div></div>${L.illustration('home')}</div><div class="home-art-actions">${choice('Add money','momo',"L.openFunding('home')")}${choice('Send money','lumo',"L.openTab('pay')")}${choice('Campus Pay','campus',"L.go('campusPay')")}${choice('Request','request','L.newRequest()')}</div>${funded?`<button class="home-compact-plan" onclick="L.go('plan')"><span><span class="eyebrow">AFTER YOUR PLAN</span><strong>${M(b.room)}</strong><small>${b.gap?M(b.gap)+' still uncovered':'Room after essentials and goals'}</small></span>${L.icon('arrowRight',19)}</button>`:`<button class="home-compact-plan" onclick="L.openFunding('home')"><span><strong>Ready for your first move?</strong><small>Add money to get started.</small></span>${L.icon('arrowRight',19)}</button>`}${L.homeMoneyStory()}${d&&!d.submittedTxId&&d.amount?`<button class="home-resume" onclick="L.editPayment()">${L.icon('clock',18)}<span><strong>Saved payment</strong><small>${E(d.name||'Pick up where you left off')} · ${M(d.amount)}</small></span>${L.icon('chevron',17)}</button>`:''}<div class="home-latest">${last?`<button class="home-latest-entry" onclick="L.go('txDetail',{id:'${last.id}'})"><span><small>${latestLabel}</small><strong>${E(last.name)}</strong></span><span class="home-latest-amount">${last.status==='success'||last.status==='pending'?(last.type==='in'?'+':'−'):''}${M(last.amount)}</span></button>`:'<p class="small muted" style="flex:1">Your first payment will appear here.</p>'}<button class="icon-btn" onclick="L.go('activity')" aria-label="View all activity">${L.icon('arrowRight',19)}</button></div></section>`;
};

L.views.plan=()=>{
 const s=L.state,b=L.balances();
 const date=d=>d?new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'}):'Date not set';
 return L.header('Make room for your life.','A little structure. Plenty of living.')+`<div class="plan-total"><span class="small muted">Room after your saved plan</span><div class="balance-main">${L.balanceNumber(b.room)}</div>${b.gap?B(M(b.gap)+' still uncovered · adjust ↗',"L.go('makeRoom')",'text-btn'):`<p class="tiny muted">${M(b.essentials)} essentials · ${M(b.allocated)} goals</p>`}</div>${!s.allowance.amount&&!s.essentials.length&&!s.goals.length?B(s.planDraft?'Continue my plan':'Set up my first plan',"L.go(L.state.planDraft?.step||'planSetup')",'secondary'):''}<div class="illustrated-list">${menuRow('My allowance',s.allowance.amount?M(s.allowance.amount)+' · '+date(s.allowance.date):'What’s coming, and when','momo',"L.go('allowance')")}${menuRow('Upcoming essentials',s.essentials.length?s.essentials.length+' things to cover':'Food, transport, data','campus',"L.go('essentials')")}${menuRow('Something to aim for',s.goals[0]?.name||'Give a future plan a name','goals',"L.go('goals')",true)}${menuRow('Your money story','See where it went','activity',"L.go('story')")}</div><div class="plan-footer">${B('My milestones ↗',"L.go('missions')",'text-btn')}<span class="tiny muted">Your plan. Always adjustable.</span></div>`;
};

const previousMore=L.views.more;
L.views.more=()=>{
 previousMore();const p=L.state.profile;
 return `<section data-illustrated-screen="more">${top('You')}<div class="compact-title page-heading">${L.contextualIllustration('more')}<h1>Your Lumo.</h1><p class="muted">${E(p.displayName||p.name)} · ${E(p.campus||'Your campus')}</p></div><div class="account-choice-grid">${choice('Profile','identity',"L.go('profile')")}${choice('Account','bank',"L.go('accountInfo')")}${choice('Security','home',"L.go('security')")}${choice('Privacy','request',"L.go('privacy')")}${choice('Notifications','airtime',"L.go('notificationPrefs')")}${choice('Help','chat',"L.go('help')")}</div>${L.testMode?`<details class="testing-drawer"><summary>Ambassador tools</summary>${menuRow('Test guide','Scenarios and sample account','plan',"L.go('testing')")}${menuRow('Merchant preview','Explore the counter','merchant',"L.go('merchant')")}${menuRow('Feedback','Save notes for the Lumo team','activity',"L.go('feedback')")}</details>`:''}<div class="account-footer"><span class="tiny muted">Lumo · A little clearer.</span>${B('Sign out','L.acct.signout()','text-btn')}</div></section>`;
};

L.views.addMoney=()=>L.header('Add money.','Choose where your money comes from.')+`<div class="funding-balance"><span class="small muted">Available balance</span><strong>${M(L.balances().available)}</strong></div><div class="funding-choices">${choice('Mobile money','momo','L.startMomoFunding()',false,'From a mobile wallet')}${choice('Bank transfer','bank','L.startBankFunding()',false,'Your account details')}</div><p class="preview-boundary">This preview uses sample money. Do not send real funds.</p><div class="actions">${B('Back to '+(L.state.fundingReturn==='paymentReview'?'my payment':L.state.fundingReturn==='story'?'my money story':'Home'),'L.fundingDone()','text-btn')}</div>`;

L.views.campusPay=()=>L.header('Campus Pay','Your everyday places, one simple payment.')+`<form class="campus-code" onsubmit="event.preventDefault();L.findMerchant()"><label for="merchant-code" class="small">Merchant or sale code</label><div class="inline"><input id="merchant-code" name="merchantCode" placeholder="Enter a code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="64"><button class="secondary" type="submit">Find</button></div></form><div id="error" role="alert"></div><div class="compact-section"><span class="eyebrow">AROUND CAMPUS</span>${L.testMode?B('Try sample QR ↗',"L.pickMerchant('AK01')",'text-btn'):''}</div><div class="illustrated-list campus-merchants">${menuRow('Akua’s Kitchen','Food · Night market · AK01','campus',"L.pickMerchant('AK01')")}${menuRow('Campus Print','Printing · Balme Library · CP02','activity',"L.pickMerchant('CP02')")}${menuRow('Ride & Go','Transport · Main gate · RB03','home',"L.pickMerchant('RB03')")}</div>`;

L.views.welcome=()=>{
 const s=L.state.setup||{},hasSetup=!!(s.phone||s.phoneConfirmed||s.interest);
 return `<section class="welcome-screen" data-illustrated-screen="welcome"><div class="topline"><span class="wordmark"><img class="actual-wordmark lumo-wordmark-asset" src="/brand/Lumo-Wordmark-Black.svg" alt="Lumo"></span>${L.testMode?'<span class="pill">Ambassador mode</span>':''}</div><div class="welcome-art-stage">${L.illustration('welcome')}</div><h1>See what spending changes.</h1><p class="muted">Keep your everyday costs in view.</p><div class="actions">${B(hasSetup&&!L.state.onboarded?'Continue my setup':'Get started',hasSetup&&!L.state.onboarded?'L.onboarding.resume()':"L.go('samplePause',{returnTo:'welcome',intent:'signup'})")}${B('I already have Lumo',"L.go('signin')",'secondary')}${hasSetup&&!L.state.onboarded?B('See a sample Pause',"L.go('samplePause',{returnTo:'welcome'})",'text-btn'):B('Skip example and sign up','L.onboarding.start()','text-btn')}</div>${L.testMode?B('Explore a sample account ↗',"L.go('sampleConfirm')",'text-btn welcome-explore'):''}<div class="welcome-utilities">${L.testMode?B('Merchant preview',"L.go('merchantApply')",'text-btn'):''}${B('Privacy',"L.go('privacyNotice',{returnTo:'welcome'})",'text-btn')}${hasSetup&&!L.state.onboarded?B('New setup','L.onboarding.start()','text-btn'):B('Help',"L.go('help',{returnTo:'welcome'})",'text-btn')}</div><p class="preview-boundary center">Interactive preview · Sample money only.</p></section>`;
};

// Keep long histories navigable without rendering an ever-growing page.
L.compactPage=(items,size=4)=>{
 const pages=Math.max(1,Math.ceil(items.length/size)),page=Math.max(0,Math.min(pages-1,Number(L.params.page)||0));
 return {items:items.slice(page*size,page*size+size),page,pages,total:items.length};
};
L.turnPage=page=>L.go(L.route,{...L.params,page});
const pager=p=>p.pages<2?'':`<div class="page-controls" aria-label="List pages"><button class="secondary" onclick="L.turnPage(${p.page-1})" ${p.page===0?'disabled':''} aria-label="Previous page">${L.icon('arrowLeft',17)}</button><span>${p.page+1} / ${p.pages}</span><button class="secondary" onclick="L.turnPage(${p.page+1})" ${p.page===p.pages-1?'disabled':''} aria-label="Next page">${L.icon('arrowRight',17)}</button></div>`;
L.listPager=pager;
// Spending drill-downs keep the same completed-payment scope as Money Story and Chat.
// Ordinary activity remains an all-status history and can be opened explicitly below.
L.updateActivity=patch=>L.go('activity',{...L.params,...patch,page:0});
L.searchActivity=()=>L.updateActivity({query:L.value('activity-search')});
L.views.activity=()=>{
 const spending=L.params.scope==='spending',filter=L.params.filter||'all',query=String(L.params.query||'').trim().toLowerCase();
 const days=[7,30,90].includes(Number(L.params.days))?Number(L.params.days):30,category=typeof L.params.category==='string'?L.params.category.trim().slice(0,80):'';
 const cardId=typeof L.params.cardId==='string'?L.params.cardId.slice(0,80):'',card=cardId?L.virtualCards?.get(cardId):null;
 // A card top-up is outgoing Everyday money and incoming card money. A scoped
 // card history presents the latter perspective without rewriting the ledger.
 const direction=t=>cardId&&t.virtualCardTransfer?'in':t.type;
 const now=Date.now(),cutoff=now-days*86400000;
 let items;
 if(spending){
  items=L.spendingSummary?L.spendingSummary({days,category,now}).txs:[...L.state.txs].filter(t=>{
   const date=new Date(t.date).getTime(),amount=Number(t.amount),fee=Number(t.fee||0);
   return t.type==='out'&&t.status==='success'&&date>=cutoff&&date<=now&&Number.isFinite(amount)&&amount>0&&Number.isFinite(fee)&&fee>=0&&(!category||String(t.category||'Other').toLowerCase()===category.toLowerCase());
  }).sort((a,b)=>new Date(b.date)-new Date(a.date));
 }else{
  items=[...L.state.txs].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(filter==='pending')items=items.filter(t=>t.status==='pending');else if(filter==='in'||filter==='out')items=items.filter(t=>direction(t)===filter);
  if(category)items=items.filter(t=>String(t.category||'Other').toLowerCase()===category.toLowerCase());
  if(L.params.days)items=items.filter(t=>new Date(t.date).getTime()>=cutoff&&new Date(t.date).getTime()<=now);
 }
 if(cardId)items=card?items.filter(t=>t.cardId===card.id):[];
 if(query)items=items.filter(t=>(t.name+' '+t.id+' '+(t.note||'')).toLowerCase().includes(query));
 const p=L.compactPage(items),total=Math.round(items.reduce((sum,t)=>sum+Number(t.amount)+Number(t.fee||0),0)*100)/100;
 const chip=(label,action,selected)=>B(label,action,'chip '+(selected?'selected':'')).replace('<button ',`<button aria-pressed="${selected}" `);
 const periods=spending?`<div class="chips" role="group" aria-label="Completed spending period">${[7,30,90].map(d=>chip(d+' days',`L.updateActivity({days:${d}})`,days===d)).join('')}</div>`:`<div class="chips" role="group" aria-label="Activity status">${[['all','All'],['in','Money in'],['out','Money out'],['pending','Pending']].map(([v,t])=>chip(t,`L.updateActivity({filter:'${v}'})`,filter===v)).join('')}</div>`;
 const scopeLabel=[cardId?(card?.name||'Card unavailable'):'',category,spending||L.params.days?'Last '+days+' days':'',spending?'Completed spending':''].filter(Boolean).join(' · ');
 const scope=scopeLabel?`<p class="small muted activity-scope">${E(scopeLabel)}</p>`:'';
 const summary=spending?`<div class="summary-line activity-spending-total"><span>${query?'Matching completed spending':'Completed spending'}</span><strong>${M(total)}</strong></div><p class="tiny muted">Amounts include fees. Pending, failed, reversed and incoming payments are excluded.</p>`:'';
 const filtered=!!(spending||category||L.params.days||query||filter!=='all');
 const reset=filtered||cardId?`<div class="activity-reset">${category?B('All categories',"L.updateActivity({category:''})",'text-btn'):''}${query?B('Clear search',"L.updateActivity({query:''})",'text-btn'):''}${card?B('Back to card',`L.go('virtualCard',{id:'${E(card.id)}'})`,'text-btn'):''}${B('Show all activity',"L.go('activity',{})",'text-btn')}</div>`:'';
 const empty=cardId&&!card?'<h2>Card unavailable.</h2><p class="small muted">Return to cards to choose a current card.</p>':filtered?'<h2>Nothing here yet.</h2><p class="small muted">No payments match these filters. Try another search or clear a filter.</p>':cardId?'<h2>No card activity yet.</h2><p class="small muted">Top-ups, payments and refunds for this card will appear here.</p>':'<h2>No activity yet.</h2><p class="small muted">Your payments, incoming money and their status will appear here.</p>';
 return L.header(spending?'Your spending.':cardId?'Card activity.':'Your activity.',spending?'The same spending, down to each payment.':cardId?'Top-ups, payments and refunds for this card.':'Every payment has a story.')+periods+scope+`<form class="activity-search" onsubmit="event.preventDefault();L.searchActivity()"><input id="activity-search" aria-label="Search activity" placeholder="Name, note or reference" value="${E(L.params.query||'')}"><button class="icon-btn" type="submit" aria-label="Find payments">${L.icon('arrowRight',20)}</button></form>`+summary+`<div class="list">${p.items.map(t=>{
  const fee=Number(t.fee||0),flow=direction(t),cost=Number(t.amount)+(flow==='out'?fee:0);
  const status=t.status==='success'?(t.delivery==='pending'?'Paid · delivery pending':t.delivery==='failed'?'Paid · delivery failed':'Completed'):t.status==='pending'?'Being checked':t.status==='reversed'?'Money returned':'Not completed';
  const label=cardId&&t.virtualCardTransfer?'Card top-up · '+status:status;
  const signed=t.status==='success'||!cardId&&t.status==='pending';
  return L.row(t.name,`${label} · ${new Date(t.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}${flow==='out'&&fee>0?' · incl. '+M(fee)+' fee':''}`,flow==='in'?'arrowDown':'arrowUp',`L.go('txDetail',{id:'${t.id}'})`,`${signed?(flow==='in'?'+':'−'):''}${M(cost)}`);
 }).join('')||'<div class="empty">'+empty+'</div>'}</div>${pager(p)}`+reset;
};

const previousChat=L.views.chat;
L.views.chat=()=>{
 let html=previousChat(),start=html.indexOf('<div class="chat-bubble">'),end=html.indexOf('<div class="chips">',start);
 if(start>=0&&end>start)html=html.slice(0,start)+`<div class="chat-thread" role="log" aria-label="Your conversation">${html.slice(start,end)}</div>`+html.slice(end);
 html=html.replace(/<div class="chips">([\s\S]*?)<\/div>(?=<form class="chat-entry")/,'<details class="chat-prompts"><summary>Try a question</summary><div class="chips">$1</div></details>');
 return html;
};

const previousDecorate=L.decorateView;
L.decorateView=(html,route)=>{
 if(route==='send'||route==='bill'){
  // Only the optional note is collapsed. Planned spending stays visible beside the amount.
  html=html.replace(/<label class="field" for="payment-note">[\s\S]*?<\/label>/,match=>`<details class="optional-fields"><summary>Add a note</summary>${match}</details>`);
 }
 if(route==='txDetail')html=html.replace(/<div class="receipt">((?:<div class="summary-line[^\"]*">[\s\S]*?<\/div>)+)<\/div>/,(all,inside)=>{
  const rows=inside.match(/<div class="summary-line[^\"]*">[\s\S]*?<\/div>/g)||[];
  if(rows.length<6)return all;
  const main=rows.filter(r=>/^<div[^>]*><span>(?:Reference|Amount|Fee|Total)<\/span>/.test(r)),other=rows.filter(r=>!main.includes(r));
  return `<div class="receipt">${main.join('')}<details class="receipt-more"><summary>Full payment details</summary>${other.join('')}</details></div>`;
 });
 return previousDecorate(html,route);
};

// A fit pass tightens spacing while keeping artwork prominent. Overflow remains available for small
// phones, large accessibility text, an open keyboard or expanded information.
const queue=fn=>typeof requestAnimationFrame==='function'?requestAnimationFrame(fn):fn();
let scheduled=false;
L.fitScreen=()=>{
 if(scheduled)return;scheduled=true;
 queue(()=>{
  scheduled=false;const view=document.getElementById('view'),screen=view?.querySelector('.screen');
  if(!screen||!view.clientHeight)return;
  screen.dataset.density='comfortable';
  if(screen.scrollHeight>view.clientHeight+2)screen.dataset.density='snug';
  if(screen.scrollHeight>view.clientHeight+2)screen.dataset.density='compact';
 });
};
const render=L.render;L.render=()=>{render();L.fitScreen();};
const view=document.getElementById('view');
if(typeof ResizeObserver==='function'&&view)new ResizeObserver(()=>L.fitScreen()).observe(view);
view?.addEventListener?.('toggle',()=>L.fitScreen(),true);
window.addEventListener('resize',()=>L.fitScreen());
})();
