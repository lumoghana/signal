/* Customer-facing account split. Ledger, authorisation and migration live in
   two-account-engine; this module composes those same values on every surface. */
(()=>{
'use strict';
const E=L.e,M=L.money,B=L.btn;
const top=(title,back=true)=>`<div class="topline">${back?B(L.icon('arrowLeft',22),'L.back()','icon-btn').replace('<button ','<button aria-label="Go back" '):'<span class="wordmark wordmark-small"><img class="actual-wordmark lumo-wordmark-asset" src="/brand/Lumo-Wordmark-Black.svg" alt="Lumo"></span>'}<span class="eyebrow">${E(title)}</span>${B(L.icon('help',21),"L.go('help',{returnTo:L.route,returnParams:L.params})",'icon-btn').replace('<button ','<button aria-label="Get help" ')}</div>`;
const line=(label,value)=>`<div><dt>${E(label)}</dt><dd>${value}</dd></div>`;
const PM=(key,value,large=false)=>L.privateMoney(key,value,large);
const notice=()=>L.state.profile.campus&&!L.isLegonUniversity?.(L.state.profile.campus)?'<p class="notice pilot-campus-note">Built for Legon first. Some campus features may be limited here.</p>':'';
// Keep unsaved legacy goal metadata separate from the budget draft. No money
// is moved until the customer reviews and authorises a Money Box transfer.
const oldGoal=L.state.planDraft?.goalFields;
if(oldGoal?.name&&!L.state.moneyBoxDraft)L.state.moneyBoxDraft={name:oldGoal.name,target:oldGoal.target||'',date:oldGoal.date||''};
L.views.home=()=>{
 const s=L.state,b=L.balances(),a=L.accountBalances(),has=L.hasMeaningfulPlan(s),budget=L.budgetStateSummary?.(s);
 const name=E((s.profile.displayName||s.profile.name||'there').trim().split(/\s+/)[0]);
 const art=L.campusArt.draw(b.available?'home':'clarity','home');
 const boxes=(s.goals||[]).filter(box=>!box.archived&&!box.deleted).length;
 const primary=has?`<button class="account-room" onclick="L.go('${budget?.ended?'planPeriod':'planExplanation'}')" aria-label="${budget?.ended?'Budget period ended. Review dates':'Left after budget. See how it is calculated'}"><strong id="overview-room">${PM('room',b.room,true)}</strong><small class="home-balance-details">${budget?.ended?'Review budget dates':'See breakdown'} ${L.icon('chevron',14)}</small></button>`:`<div class="account-balance-primary"><strong id="overview-balance">${PM('available',a.available,true)}</strong></div>`;
 const supporting=has?`<div class="account-available account-available-secondary"><span>Available balance</span><strong id="overview-balance">${PM('available',a.available)}</strong></div>`:'';
 const privacy=L.balancePrivacyControl(true,has?'overview-room overview-balance overview-savings':'overview-balance overview-savings');
 const action=(label,icon,code,extra='')=>B(L.icon(icon,19)+'<span>'+label+'</span>',code,extra);
 return `<section class="accounts-home home-refined home-minimal home-restored edition-home" data-illustrated-screen="home"><h1 class="sr-only">Home</h1><div class="home-greeting"><span class="wordmark" aria-label="Lumo"><img class="actual-wordmark lumo-wordmark-asset" src="/brand/Lumo-Wordmark-Black.svg" alt="Lumo"></span><div class="inline home-header-actions">${B(L.icon('bell',22),"L.go('notifications')",'icon-btn').replace('<button ','<button aria-label="Updates" ')}${B(name[0],"L.go('profile')",'avatar').replace('<button ','<button aria-label="Your profile" ')}</div></div>${notice()}<div class="accounts-welcome"><p>Hey, ${name}.</p></div><section class="account-card account-operational${has?' has-budget':''}${Math.abs(has?b.room:a.available)>=10000?' has-wide-amount':''}" aria-label="${has?'Left after budget':'Available balance'}"><div class="home-card-heading"><span>${has?'Left after budget':'Available balance'}</span>${privacy}</div><div class="account-intelligence">${primary}<div class="accounts-home-art">${art}</div></div>${supporting}${a.held?`<button class="home-pending-status" onclick="L.go('pending')">Payment in progress ${L.icon('chevron',14)}</button>`:''}</section>${has&&b.gap?`<button type="button" class="text-btn edition-budget-gap" onclick="L.go('makeRoom')">Your Budget needs attention. ${L.icon('chevron',14)}</button>`:''}<div class="home-funding-actions focus-main-actions" aria-label="Quick actions">${action('Add money','plus',"L.openFunding('home')",'primary home-add-money')}${action('Request money','arrowDown','L.newRequest()','secondary')}</div><div class="home-payment-actions" aria-label="Make a payment">${action('Campus Pay','scan',"L.go('campusPay')",'secondary home-campus-pay')}${action('Transfers','arrowUp',"L.go('sendOptions')",'secondary home-transfers')}</div><section class="account-card account-savings restored-savings" aria-label="Money Boxes"><button type="button" class="restored-savings-line" onclick="L.go('goals')" aria-label="Money Boxes. See your saved money"><span class="restored-savings-icon" aria-hidden="true">${L.icon('target',21)}</span><span class="restored-savings-copy"><strong>Money Boxes</strong><small>${boxes?'Saved separately':'Save for what matters'}</small></span><strong id="overview-savings">${PM('savings',a.savings)}</strong>${L.icon('chevron',16)}</button></section>${Number(s.accounts?.migration?.unfunded)>0?`<p class="notice">${M(s.accounts.migration.unfunded)} of an old goal allocation could not be moved into savings. ${B('Review boxes',"L.go('goals')",'text-btn')}</p>`:''}</section>`;
};
L.views.plan=()=>{
 const b=L.balances(),s=L.state,has=L.hasMeaningfulPlan(s),start=s.planDraft?.step||'planSetup';
 return `<section class="account-budget-page" data-illustrated-screen="plan">${top('Budget',false)}<div class="destination-heading"><h1>${has?'Your everyday costs.':'Give your money a job.'}</h1><p>${has?'Paid from your operational account.':'Save the costs this money needs to cover.'}</p></div><div class="account-budget-art">${L.campusArt.draw('plan','plan',true)}</div>${has?`<div class="budget-summary"><span>Left after budget</span><strong>${L.balanceNumber(b.room)}</strong><p>${M(b.available)} available − ${M(b.essentials)} budget remaining</p>${b.gap?`<p class="warning">${M(b.gap)} of your budget is uncovered.</p>`:''}</div><div class="actions">${B('Edit budget',"L.go('planEdit')")}${B('Add a budget item',"L.go('essentialEdit')",'secondary')}</div><div class="destination-list">${L.row('Budget period',L.planPeriodActionLabel?.()||'How long should this money last? Add a date.','plan',"L.go('planPeriod')")}${L.row('How this is calculated','Uses only your saved costs','help',"L.go('planExplanation')")}</div>`:`<div class="actions">${B(s.planDraft?'Continue budget':'Add a budget',`L.go('${E(start)}')`)}${B('How a budget helps',"L.openPlanBenefit()",'text-btn')}</div>`}<div class="budget-savings-link">${L.row('Money Boxes','A separate place to save in your savings account','target',"L.go('goals')")}</div></section>`;
};
L.views.balances=()=>{
 const b=L.balances(),a=L.accountBalances();
 return `<section class="account-breakdown">${top('Your accounts')}<div class="page-heading"><h1>Two accounts. Clear roles.</h1></div><h2>Operational</h2><dl class="balance-calculation">${line('Confirmed balance',M(a.operational))}${line('Held for pending payments',M(a.held))}${line('Available to use',M(a.available))}${line('Budget still to cover',M(b.essentials))}${line('Left after budget',M(b.room))}</dl><h2>Savings</h2><dl class="balance-calculation">${line('Money Boxes total',M(a.savings))}${a.savingsHeld?line('Held for a transfer back',M(a.savingsHeld)):''}</dl><p>Money Boxes are already in savings. They are not deducted from your operational balance again. Move money back before spending it. Protected boxes also need partner approval.</p><div class="actions">${B('View Money Boxes',"L.go('goals')")}${B('Done','L.taskSheet?.active?L.closeTask():L.back()','secondary')}</div></section>`;
};
L.views.accountInfo=()=>{
 if(!L.state.onboarded||L.state.locked)return L.views.signin();
 const a=L.accountBalances(),p=L.state.profile;
 if(L.state.closed)return `<section class="account-details-page">${top('Saved account records')}<div class="page-heading"><h1>Account closed.</h1></div><p class="notice">These are read-only records from this browser. No money can be added, sent or moved into Money Boxes.</p><h2>${E(p.name)}</h2><div class="receipt">${line('Status','Closed in this preview')}${L.state.closure?.date?line('Closure confirmed',E(L.state.closure.date)):''}</div><div class="list">${L.row('Statements','Download retained activity','download',"L.go('statements')")}${L.row('Download your data','Keep a copy of your saved records','download',"L.go('dataExport')")}${L.row('Help & support','Saved reports and account questions','help',"L.go('help')")}</div>${B('Sign out','L.acct.signout()','secondary')}<p class="small muted">This is a sample account. Closure did not contact a live provider.</p></section>`;
 return `<section class="account-details-page">${top('Your accounts')}<div class="page-heading"><h1>Your Lumo accounts.</h1></div><p class="notice">Sample account details. Do not send real money.</p><h2>${E(p.name)}</h2><p class="small muted">Receiving bank · GCB Bank</p>${[['Operational account',a.operationalNumber,a.available],['Savings account',a.savingsNumber,a.savings]].map(([label,number,value])=>`<div class="account-detail-card"><h3>Lumo ${label.toLowerCase()}</h3><dl>${line('Account number',E(number))}${line(label==='Savings account'?'Money Boxes total':'Available balance',M(value))}</dl>${B('Copy '+label.toLowerCase()+' number',`L.copy('${String(number).replace(/\D/g,'')}')`,'secondary')}</div>`).join('')}<div class="list">${L.row('Add money','Mobile money or bank transfer via GIP','plus',"L.openFunding('accountInfo')")}${L.row('Money Boxes','Create, fund or transfer back','target',"L.go('goals')")}${L.row('Statements','Download your activity','download',"L.go('statements')")}${L.row('Fees, limits & terms','Know the details before you pay','receipt',"L.go('accountTerms')")}${L.row('Close accounts','Review balances and unfinished activity','close',"L.go('closeAccount')")}</div></section>`;
};
const blockers=L.acct.blockers;L.acct.blockers=()=>{
 const items=blockers(),a=L.accountBalances();
 if(a.savings>0)items.push({label:'Money in your savings account',sub:M(a.savings)+' in Money Boxes. Transfer it back before closing.',route:'goals'});
 return items;
};
// Use the same ledger rows but identify internal movements without a misleading
// income/spending sign. Filters for incoming/outgoing still exclude them.
for(const route of ['activity','pending']){
 const view=L.views[route];L.views[route]=()=>{
  let html=view();
  for(const t of L.state.txs.filter(L.isInternalTransfer)){
   const marker=`L.go('txDetail',{id:'${t.id}'})`,amount=(t.type==='in'?'+':'−')+M(Number(t.amount)+Number(t.fee||0));
   const start=html.indexOf(marker);if(start<0)continue;
   const end=html.indexOf('</button>',start);if(end<0)continue;
   const row=html.slice(start,end),replacement=row.replace(amount,'↔ '+M(t.amount));
   html=html.slice(0,start)+replacement+html.slice(end);
  }
  return html;
 };
}
const downloadData=L.acct.downloadData;L.acct.downloadData=()=>{
 if(!L.state.accounts)return downloadData();
 // Existing export keeps its PIN check; add accounts through the one download
 // callback instead of weakening authentication or duplicating its checks.
 const download=L.download;L.download=function(name,content,type){
  if(name==='Lumo-Demo-Data.json'){const data=JSON.parse(content);data.accounts=L.state.accounts;data.budget=data.plan.essentials;data.moneyBoxes=data.plan.goals;delete data.plan;content=JSON.stringify(L.acct.sanitizeExport?L.acct.sanitizeExport(data):data,null,2);}
  return download.call(this,name,content,type);
 };try{return downloadData();}finally{L.download=download;}
};
})();
