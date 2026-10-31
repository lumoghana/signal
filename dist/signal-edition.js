/* Signal is an edition-owned presentation. Native ledgers, consent, drafts,
   payment review, Pause timing and authentication remain authoritative. */
(()=>{
'use strict';
if(!window.L||L.signalEdition)return;
const E=L.e;
const assets='/assets/signal/';
const allowed=()=>L.state.onboarded&&!L.state.locked&&!L.state.closed;
const visible=()=>!!L.monoConversation?.visible();
const mask=()=>'<span class="money-mask" aria-label="Amount hidden"><span aria-hidden="true">•••••</span></span>';
// Home uses the cedi symbol and omits zero pesewas, as in the approved card.
// Native formatters still own rounding, values and privacy; nonzero pesewas stay.
const homeMoney=html=>String(html).replace(/GH₵/g,'₵').replace(/<span class="cents">\.00<\/span>/g,'').replace(/\.00(?=<\/span>$|$)/,'');
const privateHomeMoney=(...args)=>homeMoney(L.privateMoney(...args));
const costs=()=>{const b=L.balances();return Math.round((Number(b.essentials||0)+Number(b.allocated||0))*100)/100;};
const plannedMarkup=()=>visible()?E(L.money(costs())).replace('GH₵','₵').replace(/\.00$/,''):mask();
const insightMarkup=()=>{
 const p=L.monoConversation?.current();
 if(!visible())return '<span class="money-mask" aria-label="Insight hidden"><span aria-hidden="true">•••••</span></span>';
 return p?E(p.insight)+(p.detail?`<span class="mono-conversation-insight-detail">${E(p.detail)}</span>`:''):'A little clarity for today.';
};
const avatar=()=>'<img class="signal-lux signal-avatar-2d" src="/brand/lumo-avatar-icon-512.png" alt="" width="512" height="512" decoding="async" aria-hidden="true">';
const wordmark=()=>`<img class="signal-wordmark" src="${assets}signal-wordmark.webp" alt="Lumo" width="868" height="289">`;
const paperPlane='<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m28 4-8 24-6-10-10-6Z"/><path d="m14 18 14-14"/></svg>';
const boxIcon='<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><rect x="6" y="2" width="20" height="4" rx="2" fill="#748b40"/><rect x="2" y="9" width="28" height="22" rx="6"/><rect x="15" y="16" width="2.5" height="8" rx="1.25" fill="#d7ff3f"/></svg>';
const storyIcon='<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><rect x="3" y="17" width="7" height="13" rx="2"/><rect x="13" y="3" width="7" height="27" rx="2"/><rect x="23" y="11" width="7" height="19" rx="2"/></svg>';
const inheritedHome=L.views.home;
L.views.home=function(...args){
 if(!allowed())return inheritedHome.apply(this,args);
 const s=L.state,b=L.balances(),a=L.accountBalances(),has=L.hasMeaningfulPlan(s),budget=L.budgetStateSummary?.(s);
 const boxes=(s.goals||[]).filter(g=>g&&!g.archived&&!g.deleted).length;
 const amount=has?b.room:a.available,key=has?'room':'available',id=has?'overview-room':'overview-balance';
 const name=String(s.profile?.displayName||s.profile?.name||'').trim().split(/\s+/)[0];
 const start=s.planDraft?.step||'planSetup';
 const calculation=has?(budget?.ended?"L.go('planPeriod')":"L.spendingOutlook.open()"):`L.go('${E(start)}')`;
 const details=has&&!budget?.ended?"L.budgetReadability?.rememberItems(true);L.openTab('plan')":calculation;
 const budgetLabel=has?(budget?.ended?'Review budget dates':'View budget'):s.planDraft?'Continue your budget':'Create your budget';
 const basis=L.experienceClarity?.basis?.({state:s})||{status:has?'saved-costs':'no-budget',count:0};
 const dateAction=has&&['saved-costs','ended','changed-allowance','allowance-due'].includes(basis.status);
 const basisText=has?(basis.status==='saved-costs'?`${basis.count} planned ${basis.count===1?'cost':'costs'}`:basis.text):'Start with the costs that matter.';
 const planInfo=`<details class="signal-plan-details"><summary aria-label="Budget information and dates"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></svg></summary><div class="signal-plan-footer"><button type="button" class="everyday-budget-link mono-budget-link" onclick="${details}"><span>${budgetLabel}</span>${L.icon('chevron',15)}</button><p class="experience-budget-basis mono-budget-basis" data-budget-basis data-basis-status="${E(basis.status)}"><span>${E(basisText||'Your saved plan')}</span>${dateAction?`<button type="button" class="mono-budget-date-action" onclick="L.go('planPeriod')">${basis.status==='saved-costs'?'Add dates':'Review dates'}</button>`:''}</p></div></details>`;
 const privacy=L.balancePrivacyControl(true,(has?'overview-room overview-balance':'overview-balance')+(boxes?' overview-savings':'')+' signal-planned-costs');
 const action=(label,detail,icon,handler,cls='')=>`<button type="button" class="mono-quick-action signal-action ${cls}" onclick="${handler}"${label==='Collect'?' aria-label="Collect. Request money, split costs or collect together" title="Request money, split costs or collect together"':` aria-label="${E(label)}"`}><span class="mono-action-icon">${icon}</span><span class="signal-action-label">${label}</span><small class="signal-action-detail">${detail}</small></button>`;
 const pending=a.held?`<button type="button" class="mono-home-alert everyday-pending" onclick="L.go('pending')">${L.icon('clock',17)}<span>Payment in progress</span>${L.icon('chevron',16)}</button>`:'';
 const gap=has&&b.gap?`<button type="button" class="mono-home-alert everyday-gap" onclick="L.go('makeRoom')">${L.icon('help',17)}<span>Your budget needs attention</span>${L.icon('chevron',16)}</button>`:'';
 const migration=Number(s.accounts?.migration?.unfunded)>0?`<p class="notice everyday-migration">${E(L.money(s.accounts.migration.unfunded))} of an old allocation could not move into savings. ${L.btn('Review boxes',"L.go('goals')",'text-btn')}</p>`:'';
 const campus=s.profile?.campus&&!/University of Ghana|Legon|\bUG\b/i.test(s.profile.campus)?'<p class="signal-campus-note">This preview is optimised for University of Ghana students.</p>':'';
 return `<section class="edition-home everyday-account-home home-refined mono-home signal-home"><h1 class="sr-only">Home</h1>
 <div class="home-greeting signal-header"><span class="signal-brand-wordmark" aria-label="Lumo">${wordmark()}</span><div class="home-header-actions"><button type="button" class="avatar signal-profile" onclick="L.go('profile')" aria-label="You. Profile, security and settings">${E((name||'You')[0])}</button></div></div>
 <div class="mono-home-intro signal-greeting"><p>${name?'Hey, '+E(name):'Hey there'}</p><span class="signal-greeting-detail">Let’s make room for what’s next.</span></div>${campus}
 <section class="account-card account-operational everyday-money-card mono-money-card signal-money-card${has?' has-budget':''}${Math.abs(amount)>=1000?' has-wide-amount':''}${Math.abs(amount)>=10000?' has-long-amount':''}${Math.abs(amount)>=1000000?' has-huge-amount':''}" aria-label="Everyday money">
 <div class="everyday-account-heading signal-money-heading"><h2 class="sr-only">Everyday money</h2><div class="signal-money-copy"><div class="signal-money-title-row"><span class="signal-money-label">${has?'Room to spend':'Available balance'}</span>${planInfo}</div><small class="signal-money-subtitle">${has?'After planned costs':'In your account'}</small></div>${privacy}</div>
 <div class="signal-money-stage"><button type="button" class="everyday-primary-money account-room signal-reference-money" ${has&&!budget?.ended?'data-spending-outlook-entry':''} onclick="${has?calculation:"L.go('balances')"}" aria-label="${has?'Left after planned costs. See calculation':'Available balance. See account breakdown'}"><strong id="${id}">${privateHomeMoney(key,amount,true)}</strong></button></div>
 <div class="signal-balance-breakdown"><span class="signal-balance-cell"><span>${has?'Available balance':'Everyday money'}</span><strong${has?' id="overview-balance"':''}>${has?privateHomeMoney('available',a.available):'<span>In your account</span>'}</strong></span><span class="signal-balance-cell"><span>Planned costs</span><strong id="signal-planned-costs" data-signal-planned>${plannedMarkup()}</strong></span></div><button type="button" class="signal-card-budget" onclick="${has?"L.budgetReadability?.rememberItems(true);L.openTab('plan')":"L.openTab('plan')"}"><span>${has?'View budget':'Create a budget'}</span>${L.icon('arrowRight',17)}</button></section>
 ${gap}${pending}<div class="everyday-home-actions mono-home-actions signal-home-actions" role="group" aria-label="Quick actions">${action('Add money','Top up your balance',L.icon('plus',28),"L.openFunding('home')")}${action('Pay','Send, pay or top up',paperPlane,"L.openTab('pay')",'signal-action-pay')}${action('Collect','Request or collect','<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="10" r="5"/><circle cx="24" cy="12" r="4"/><path d="M3 29v-4a9 9 0 0 1 18 0v4ZM21 19a7 7 0 0 1 9 7v3h-9"/></svg>','L.newRequest()')}</div>
 <section class="account-card mono-conversation-card signal-buddy" data-conversation-kind="${E(L.monoConversation?.current()?.kind||'affordability')}" aria-label="Ask Lumo"><button type="button" class="mono-conversation-open" onclick="L.monoConversation.open()"><span class="signal-buddy-art" aria-hidden="true">${avatar()}<svg class="signal-buddy-rays" viewBox="0 0 40 36" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="m5 14 2-10m10 15 7-9m1 20 10-4"/></svg></span><span class="mono-conversation-copy"><span class="mono-conversation-eyebrow">Lumo noticed</span><strong class="mono-conversation-insight" data-mono-conversation-insight>${insightMarkup()}</strong><span class="mono-conversation-question">${E(L.monoConversation?.current()?.question||'Ask Lumo')}</span></span><span class="signal-buddy-chevron" aria-hidden="true">${L.icon('chevron',16)}</span></button></section>
 <div class="signal-home-destinations"><section class="account-card account-savings everyday-boxes-card mono-boxes-card${boxes?'':' is-empty'}" aria-label="Money Boxes"><button type="button" class="everyday-boxes-open" onclick="L.go('${boxes?'goals':'goalEdit'}')"><span class="mono-box-symbol" aria-hidden="true">${boxIcon}</span><span class="mono-box-copy"><strong class="mono-box-title">${boxes?'Money Boxes':'Create a Money Box'}</strong>${boxes?`<span class="signal-savings-line"><strong class="everyday-savings-amount${Math.abs(a.savings)>=10000?' has-wide-savings':''}${Math.abs(a.savings)>=10000000?' has-huge-savings':''}" id="overview-savings">${privateHomeMoney('savings',a.savings)}<span class="mono-savings-reserve" aria-hidden="true"></span></strong><span class="signal-saved-label">saved</span></span><small class="signal-destination-helper">Save for what matters</small><small class="sr-only">${boxes} ${boxes===1?'box':'boxes'} · Total saved</small>`:'<small class="mono-box-empty-note">Put money aside for a goal.</small>'}</span>${L.icon('chevron',16)}</button></section>
 <section class="account-card signal-story-card" aria-label="Money Story"><button type="button" onclick="L.openTab('moneyStoryHome')"><span class="signal-story-symbol" aria-hidden="true">${storyIcon}</span><span class="signal-story-copy"><strong>Money Story</strong><small class="signal-story-period">This week, clearer</small><small class="signal-destination-helper">See where your money goes</small></span>${L.icon('chevron',16)}</button></section></div>${migration}</section>`;
};
// Native mono-brand owns the original avatar throughout setup, Chat, Menu,
// cards, QR and help. Status symbols and customer identity remain separate.
const decorate=L.decorateView;
L.decorateView=function(html,route){
 let out=decorate?decorate.call(this,html,route):html;
 out=out.replace(/\/brand\/Lumo-Wordmark-(?:Black|White)\.svg/g,assets+'signal-wordmark.webp');
 if(['pause','samplePause','pauseDemo'].includes(route)){
  // Native mono-pause owns the original 2D face, raised hand and timing hooks.
  out=out.replace(/(<div\b[^>]*class="[^\"]*\bmono-pause-moment\b[^\"]*"[^>]*>)/,'$1<span class="signal-pause-label">Pause.</span>');
 }
 // The account control means Profile on every ordinary root, just as on Home.
 // Menu keeps its own native navigation and closing queue.
 if(allowed()&&route!=='monoMenu'&&route!=='more'){
  const name=String(L.state.profile?.displayName||L.state.profile?.name||'You').trim();
  const initial=E(Array.from(name)[0]||'Y');
  out=out.replace(/(<button\b[^>]*class="[^"]*\bhibiscus-header-you\b[^"]*"[^>]*>)[\s\S]*?<\/button>/,(whole,opening)=>{
   const button=opening.replace(/onclick="[^"]*"/,'onclick="L.go(\'profile\')"').replace(/class="([^"]*)"/,(_,classes)=>`class="${classes.includes('signal-root-profile')?classes:classes+' signal-root-profile'}"`);
   return button+`<span aria-hidden="true">${initial}</span></button>`;
  });
 }
 return out;
};
function syncNavigation(){
 const nav=document.getElementById('nav');if(!nav?.classList.contains('mono-primary-nav'))return;
 const items=nav.querySelectorAll('.nav-item');if(items.length!==3)return;
 const chat=items[1];
 if(chat.getAttribute('data-signal-chat')!=='true'){
  chat.innerHTML=L.icon('chat',24)+'<span>Ask Lumo</span>';chat.setAttribute('data-signal-chat','true');
 }
 chat.setAttribute('onclick','L.openBankingChat()');chat.setAttribute('title','Ask Lumo · Your money companion');
 if(allowed()&&!L.taskSheet?.active&&!L.contextualChat?.current?.()&&!L.budgetGuide?.active?.()){
  const selected=L.route==='home'?0:L.route==='chat'?1:2;
  for(let i=0;i<items.length;i++){items[i].classList.toggle('active',i===selected);if(i===selected)items[i].setAttribute('aria-current','page');else items[i].removeAttribute('aria-current');}
 }
}
function sync(){
 document.body.classList.add('signal-edition');
 for(const node of document.querySelectorAll('.signal-money-card [data-private-value],.signal-home .everyday-savings-amount [data-private-value]')){const html=homeMoney(node.innerHTML);if(html!==node.innerHTML)node.innerHTML=html;}
 for(const img of document.querySelectorAll('img[src*="/brand/Lumo-Wordmark-"]'))img.setAttribute('src',assets+'signal-wordmark.webp');
 syncNavigation();
}
const refresh=L.refreshPrivateMoney;
L.refreshPrivateMoney=function(...args){const result=refresh?.apply(this,args);for(const node of document.querySelectorAll('[data-signal-planned]'))node.innerHTML=plannedMarkup();for(const node of document.querySelectorAll('.signal-money-card [data-private-value],.signal-home .everyday-savings-amount [data-private-value]')){const html=homeMoney(node.innerHTML);if(html!==node.innerHTML)node.innerHTML=html;}return result;};
const render=L.render;
L.render=function(...args){const result=render.apply(this,args);sync();return result;};
const chatSync=L.syncChatBanking;
L.syncChatBanking=function(...args){const result=chatSync?.apply(this,args);syncNavigation();return result;};
L.signalEdition=Object.freeze({version:2,sync});
sync();
})();
