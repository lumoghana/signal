/* Recorded history can prepare a Budget draft. It never saves commitments or
   moves money. Four complete calendar weeks, including their zero-spend days. */
(()=>{
'use strict';
if(!window.L||L.budgetHistory)return;
const E=L.e,M=L.money,B=L.btn,DAY=86400000,WEEK=7*DAY;
const copy=x=>JSON.parse(JSON.stringify(x));
const cents=n=>{const v=Number(n),rounded=Math.round(v*100);return Number.isFinite(v)&&v>=0&&Number.isSafeInteger(rounded)&&Math.abs(v*100-rounded)<.000001?rounded:null;};
const iso=n=>new Date(n).toISOString().slice(0,10);
const day=n=>Date.parse(iso(n)+'T00:00:00Z');
const label=n=>new Date(n).toLocaleDateString('en-GH',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'});
const norm=n=>String(n||'').trim().toLowerCase().replace(/\s+/g,' ');
const allowed=()=>L.state.onboarded&&!L.state.locked&&!L.state.closed;
const costs=()=> (L.state.essentials||[]).filter(x=>x&&!x.archived&&!x.deleted&&Number(x.amount)>0);
const active=()=>costs().length>0;
const known=['Food','Transport','Study','Data','Phone','Shopping','Bills','Rent','Gifts','Repayment'];
const internal=t=>!!(L.isInternalTransfer?.(t)||t?.internal||t?.internalTransfer||t?.boxId||t?.method==='Money Box transfer');
const category=t=>known.find(x=>norm(x)===norm(t.category))||(!['other','uncategorised','uncategorized','unknown','transfers','savings','refunds',''].includes(norm(t.category))&&t.categoryMeta?.confidence==='confirmed'?String(t.category).trim().slice(0,80):'');
const financialMark=()=>JSON.stringify([L.state.essentials,L.state.planHorizon,L.state.planSaved,L.state.budgetCycle,L.state.planDraft,L.state.budgetCycleDraft]);
const pending=()=>{const ids=new Set(costs().map(x=>x.id));return (L.state.txs||[]).some(t=>t.status==='pending'&&t.type==='out'&&ids.has(t.essentialId));};
function summary(now=Date.now()){
 now=Number(now);if(!Number.isFinite(now))now=Date.now();const today=day(now),weekStart=today-((new Date(today).getUTCDay()+6)%7)*DAY,start=weekStart-4*WEEK,end=weekStart-1;
 if(!allowed())return {eligible:false,covered:false,start,end,startDate:iso(start),endDate:iso(end),weeks:4,rows:[],included:[],excluded:[],total:0,signature:'unavailable',reason:'unavailable'};
 const all=(Array.isArray(L.state.txs)?L.state.txs:[]).filter(t=>t&&typeof t==='object'),history=all.filter(t=>t.status==='success'&&!internal(t)&&!t.migration&&Number.isFinite(Date.parse(t.date))&&Date.parse(t.date)<=now);
 const explicit=[L.state.accounts?.createdAt,L.state.onboardedAt,L.state.accountCreatedAt].map(Date.parse).filter(Number.isFinite),oldest=Math.min(...history.map(t=>Date.parse(t.date)),...explicit);
 const covered=Number.isFinite(oldest)&&oldest<=start,refundIds=new Set(all.filter(t=>t.type==='in'&&t.status==='success'&&(t.originalId||t.refundOf)).map(t=>t.originalId||t.refundOf));
 const groups=new Map(),included=[],excluded=[];
 for(const t of all){
  const at=Date.parse(t?.date);if(!Number.isFinite(at)||at<start||at>end||t.type!=='out'||t.status!=='success'||internal(t)||t.migration)continue;
  const name=category(t),amount=cents(t.amount),fee=cents(t.fee||0);
  if(!name||amount===null||amount<=0||fee===null||Number(t.refunded)>0||refundIds.has(t.id)||t.refundId||t.originalId||t.reversed||t.refundOf){excluded.push(t.id);continue;}
  const fixed=L.budgetCategories?.resolve(name),budgetName=L.budgetCategories?fixed?.name||'Other':name;
  const paid=amount+fee;included.push({id:t.id,name:String(t.name||'Payment'),category:name,budgetCategory:fixed?.id||'other',amount:paid/100,date:t.date});groups.set(budgetName,(groups.get(budgetName)||0)+paid);
 }
 const rows=[...groups].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([name,total])=>({name,total:total/100,weekly:Math.round(total/4)/100,count:included.filter(t=>(L.budgetCategories?L.budgetCategories.resolve(t.category)?.name||'Other':t.category)===name).length}));
 const signature=JSON.stringify([start,end,covered,all.map(t=>[t.id,t.date,t.type,t.status,t.amount,t.fee,t.category,t.categoryMeta?.confidence,t.refunded,t.refundId,t.originalId,t.refundOf,t.internalTransfer,t.internal,t.boxId,t.migration]),explicit]);
 return {eligible:covered&&rows.length>0,covered,start,end,startDate:iso(start),endDate:iso(end),weeks:4,rows,included,excluded,total:rows.reduce((sum,x)=>sum+Math.round(x.total*100),0)/100,signature,reason:!covered?'short-history':!rows.length?'no-categorised-payments':''};
}
const populatedSetup=d=>!!d&&((d.essentials||[]).length>0||String(d.essentialFields?.name||'').trim()||String(d.essentialFields?.amount||'').trim()||d.editingEssentialId||d.planHorizon?.mode&&d.planHorizon.mode!=='unspecified');
function blockers(){
 if(L.state.planDraft&&(active()||populatedSetup(L.state.planDraft)))return {reason:'setup',text:'You already have an unfinished Budget draft. Continue it first; your entries are kept.'};
 if(L.state.budgetCycleDraft)return {reason:'cycle',text:'You already have a draft for your next Budget period. Continue it first; your entries are kept.'};
 if(pending())return {reason:'pending',text:'A payment linked to your Budget is pending. Wait for its result before preparing a new period.'};
 return null;
}
function capture(){
 const d=L.state.budgetHistoryDraft;if(!d||L.route!=='budgetHistory')return;
 d.rows.forEach((r,i)=>{const amount=document.getElementById('history-amount-'+i),include=document.getElementById('history-include-'+i),name=document.getElementById('history-name-'+i);if(amount)r.amount=amount.value;if(include)r.include=!!include.checked;if(name){r.name=name.value;if(L.budgetCategories)r.budgetCategory=L.budgetCategories.resolve(name.value)?.id;}});L.save();
}
function createDraft(){
 L.balances();const s=summary();L.state.budgetHistoryDraft={id:L.id('BH'),budgetCategoryVersion:1,createdAt:Date.now(),source:s,baseMark:financialMark(),start:iso(Date.now()),end:iso(day(Date.now())+6*DAY),rows:s.rows.map(x=>({name:x.name,budgetCategory:L.budgetCategories?.resolve(x.name)?.id,amount:x.weekly.toFixed(2),include:x.weekly>0}))};L.save();return L.state.budgetHistoryDraft;
}
function open(){
 if(!allowed())return false;L.captureFormDraft?.();if(L.route==='firstEssentials')L.capturePlanDraft?.();
 if(!L.state.budgetHistoryDraft)createDraft();L.go('budgetHistory');return true;
}
const stale=d=>!d||d.source.signature!==summary().signature||d.baseMark!==financialMark()||d.start!==iso(Date.now());
function refresh(){if(!allowed()||L.route!=='budgetHistory')return false;createDraft();L.render();return true;}
function resume(){
 if(!allowed())return false;const b=blockers();if(b?.reason==='setup')return L.resumeBudgetSetupDraft();if(b?.reason==='cycle')return L.go('budgetCycle',{id:L.state.budgetCycleDraft.id});return false;
}
function addItem(){
 if(!allowed()||L.route!=='budgetHistory'||!L.state.budgetHistoryDraft)return false;capture();const available=L.budgetCategories?.list.find(c=>!L.state.budgetHistoryDraft.rows.some(r=>L.budgetCategories.resolve(r)?.id===c.id));if(L.budgetCategories&&!available)return L.error('All seven Budget categories are here. Edit an existing total.'),false;L.state.budgetHistoryDraft.rows.push({name:available?.name||'',budgetCategory:available?.id,amount:'',include:true,manual:true});L.save();L.render();document.getElementById('history-name-'+(L.state.budgetHistoryDraft.rows.length-1))?.focus?.();return true;
}
const represented=(c,rows)=>{
 const purpose=L.predictCategory?.({method:'campus',essentialId:c.id})?.category;
 return rows.some(r=>r.include&&(norm(r.name)===norm(c.name)||purpose&&norm(r.name)===norm(purpose)||L.budgetCategories&&(L.budgetCategories.resolve(r)?.id||'other')===(L.budgetCategories.resolve(c)?.id||'other')));
};
const missingCosts=d=>costs().filter(c=>!represented(c,d?.rows||[]));
function missingHtml(d){
 const missing=missingCosts(d);if(!missing.length)return '';
 return `<p class="small">Not in this suggestion: <strong>${missing.map(c=>E(c.name)).join(', ')}</strong>. Needed this week?</p><div class="budget-history-missing-actions">${missing.map(c=>B('Add '+E(c.name),`L.budgetHistory.addSavedItem(${E(JSON.stringify(c.id))})`,'text-btn')).join('')}</div>`;
}
function addSavedItem(id){
 if(!allowed()||L.route!=='budgetHistory'||!L.state.budgetHistoryDraft)return false;capture();const c=costs().find(x=>x.id===id),d=L.state.budgetHistoryDraft;
 if(!c||represented(c,d.rows))return false;
 const fixed=L.budgetCategories?.resolve(c)||L.budgetCategories?.list.find(x=>x.id==='other');if(d.rows.some(r=>L.budgetCategories&&(L.budgetCategories.resolve(r)?.id||'other')===fixed?.id))return L.error('That category already has a line. Edit its weekly total.'),false;d.rows.push({name:fixed?.name||c.name,budgetCategory:fixed?.id,amount:'',include:true,manual:true,fromSavedId:c.id,savedTotal:c.amount});L.save();L.render();document.getElementById('history-amount-'+(d.rows.length-1))?.focus?.();return true;
}
function useDraft(){
 if(!allowed()||L.route!=='budgetHistory')return false;capture();const d=L.state.budgetHistoryDraft,b=blockers();
 if(b)return L.error(b.text),false;
 if(stale(d)||!d.source.eligible)return L.error('Your recorded history, Budget or dates changed. Start a fresh suggestion before using it.'),false;
 const selected=d.rows.filter(r=>r.include);
 if(L.budgetCategories){const categories=selected.map(r=>L.budgetCategories.resolve(r.name));if(categories.some(c=>!c)||new Set(categories.map(c=>c.id)).size!==categories.length||categories.length>7)return L.error('Keep one total for each of the seven student Budget categories.'),false;selected.forEach((r,i)=>{r.name=categories[i].name;r.budgetCategory=categories[i].id;});}
 const valid=r=>/^(?:\d+)(?:\.\d{1,2})?$/.test(String(r.amount))&&Number(r.amount)>0&&Number(r.amount)<=1000000;
 const invalid=d.rows.findIndex(r=>r.include&&(!String(r.name).trim()||String(r.name).trim().length>80||!valid(r)));
 if(!selected.length||invalid>=0){const r=d.rows[invalid],nameInvalid=r&&(!String(r.name).trim()||String(r.name).trim().length>80),field=!selected.length?'history-include-0':nameInvalid&&r.manual?'history-name-'+invalid:'history-amount-'+invalid;return L.error('Keep at least one named item and enter a positive amount with up to two decimal places.',field),false;}
 if(new Set(selected.map(r=>norm(r.name))).size!==selected.length)return L.error('Give each draft item a different name, or untick the duplicate.'),false;
 // Capture the selected quote before an existing route renders or saves.
 const rows=selected.map(r=>({name:String(r.name).trim(),budgetCategory:r.budgetCategory,amount:Number(r.amount)})),from=d.id;
 if(active()){
  // The existing cycle creator supplies its exact base signature and guard.
  L.openBudgetCycle();const cycle=L.state.budgetCycleDraft;if(!cycle)return false;
  cycle.start=d.start;cycle.end=d.end;cycle.namedCostsReplaced=costs().some(x=>x.namedObligation);cycle.costs=rows.map(r=>{const previous=costs().filter(x=>L.budgetCategories?(L.budgetCategories.resolve(x)?.id||'other')===r.budgetCategory:norm(x.name)===norm(r.name));return {previousId:previous.length===1?previous[0].id:'',previousIds:previous.map(x=>x.id),name:r.name,budgetCategory:r.budgetCategory,amount:r.amount.toFixed(2),include:true};});cycle.historySuggestionId=from;cycle.reviewed=false;
  L.state.budgetHistoryDraft=null;L.save();L.render();
  // Use the existing review validator against the prepared cycle fields.
  // The final confirmation remains the only place that replaces a Budget.
  L.reviewBudgetCycle();
 }else{
  L.state.planDraft={step:'firstPlanReview',allowance:copy(L.state.allowance||{}),essentials:rows.map(r=>({id:L.id('ess'),name:r.name,budgetCategory:r.budgetCategory,amount:r.amount,paid:0,externalPaid:0,coverageVersion:1,date:''})),goals:copy(L.state.goals||[]),planHorizon:{mode:'date',date:d.end},essentialFields:{name:'',amount:''},historySuggestionId:from};
  L.capturePlanDraftBaseline?.(L.state.planDraft,{createdFromSaved:true});
  L.state.budgetHistoryDraft=null;L.clearFormDraft?.('firstEssentials');L.save();L.go('firstPlanReview');
 }
 L.toast('Draft ready to review. Nothing saved yet.');return true;
}
function projection(){
 const d=L.state.budgetHistoryDraft;if(!d)return '';
 const rows=d.rows.filter(r=>r.include);if(!rows.length)return 'Keep at least one Budget item.';
 if(rows.some(r=>!String(r.name).trim()||!String(r.amount).trim()||cents(r.amount)===null||Number(r.amount)<=0||Number(r.amount)>1000000))return 'Enter a name and positive weekly total for each selected item.';
 const sum=rows.reduce((n,r)=>n+cents(r.amount),0)/100,available=L.balances().available;
 return sum>available?`${M(sum-available)} of this draft would be uncovered.`:`${M(available-sum)} left after this draft Budget.`;
}
function details(s){
 return `<details class="optional-fields budget-history-details"><summary>See the recorded calculation</summary><p class="small">${E(label(s.start))} to ${E(label(s.end))}: four complete Monday–Sunday weeks. Each category total, including payment fees, is divided by four. All four weeks count, including days with no recorded spending. Past spending is a starting point, not a recommendation.</p><dl>${s.rows.map(r=>`<div class="summary-line"><dt>${E(r.name)} · ${r.count} payment${r.count===1?'':'s'}</dt><dd>${M(r.total)} ÷ 4 = ${M(r.weekly)}</dd></div>`).join('')}</dl>${s.excluded.length?`<p class="small muted">${s.excluded.length} completed outgoing record${s.excluded.length===1?' was':'s were'} excluded because the purpose was unclear, the amount was invalid or a refund was recorded.</p>`:''}<div class="budget-history-transactions">${s.included.map(t=>`<div class="summary-line"><span>${E(t.name)}<small>${E(label(Date.parse(t.date)))} · ${E(t.category)}</small></span><strong>${M(t.amount)}</strong></div>`).join('')}</div><p class="small muted">Incoming, pending, failed, reversed and Money Box movements are excluded. Refunded payments are excluded entirely. Weekly averages are rounded to the nearest pesewa.</p></details>`;
}
L.views.budgetHistory=()=>{
 if(!allowed())return '';
 const d=L.state.budgetHistoryDraft,s=d?.source||summary(),b=blockers(),changed=stale(d);
 const footer=B('Close','L.closeTask()','text-btn');
 if(!d){const resumable=b&&['setup','cycle'].includes(b.reason),title=resumable?'Continue your Budget draft.':b?'Wait for your Budget payment.':'No suggestion to continue.',message=b?b.text:'Prepare a fresh suggestion from your recorded spending, then review it before saving. Your account money stays unchanged.',action=resumable?B('Continue Budget draft','L.budgetHistory.resume()'):b?B('Back to Budget','L.budgetHistory.backToBudget()'):B('Prepare a suggestion','L.budgetHistory.open()');return `<section class="budget-history" data-illustrated-screen="budgetHistory">${L.header(title)}<p>${E(message)}</p><div class="actions">${action}${footer}</div></section>`;}
 if(!s.eligible)return `<section class="budget-history" data-illustrated-screen="budgetHistory">${L.header('Let your history build.')}<p>${s.reason==='short-history'?'Lumo needs records reaching back across four complete weeks before it can prepare this suggestion.':'There are no clearly categorised, completed payments to use in the last four complete weeks.'}</p><p class="small muted">Keep using your Budget or enter one everyday cost. Recorded in Lumo only; other spending may be missing.</p><div class="actions">${changed?B('Check history again','L.budgetHistory.refresh()'):''}${B('Back to Budget','L.budgetHistory.backToBudget()','secondary')}${footer}</div></section>`;
 return `<section class="budget-history" data-illustrated-screen="budgetHistory" aria-label="Edit suggested Budget"><p class="budget-history-period">${E(label(Date.parse(d.start)))} – ${E(label(Date.parse(d.end)))}</p><p class="small muted budget-history-intro">A weekly starting point from four weeks of spending. Recorded in Lumo only; check for missing costs.</p>${costs().some(x=>x.namedObligation)?'<p class="small notice">This suggestion uses category totals. If you choose it, those totals replace your named costs and their due dates. Review before saving.</p>':''}${b?`<div class="notice small">${E(b.text)}${['setup','cycle'].includes(b.reason)?B('Continue saved draft','L.budgetHistory.resume()','text-btn'):''}</div>`:''}${changed?`<div class="notice small">History, Budget or dates have changed. Your edited suggestion is kept.${B('Start a fresh suggestion','L.budgetHistory.refresh()','text-btn')}</div>`:''}<form onsubmit="event.preventDefault();L.budgetHistory.useDraft()"><div class="budget-history-column-labels" aria-hidden="true"><span>Budget item</span><span>Weekly total</span></div><div class="budget-history-items">${d.rows.map((r,i)=>`<div class="budget-history-item"><div><label for="history-include-${i}" class="budget-history-include"><input type="checkbox" id="history-include-${i}"${r.include?' checked':''}><span>${r.manual?'Added by you':E(r.name)}</span></label>${r.manual?`<label class="field" for="history-name-${i}"><span class="sr-only">Added Budget item name</span>${L.budgetCategories?`<select class="input" id="history-name-${i}">${L.budgetCategories.list.map(c=>`<option value="${E(c.name)}"${c.name===r.name?' selected':''}>${E(c.name)}</option>`).join('')}</select>`:`<input class="input" id="history-name-${i}" type="text" maxlength="80" placeholder="For example, Transport" value="${E(r.name)}">`}</label>`:''}${r.fromSavedId?`<small class="muted">Saved total: ${M(r.savedTotal)}. Enter what these seven days need.</small>`:''}</div><label class="field" for="history-amount-${i}"><span class="sr-only">${E(r.name||'Added item')} weekly total in Ghana cedis</span><div class="inline"><span class="payment-currency">GH₵</span><input class="input" id="history-amount-${i}" type="number" inputmode="decimal" min="0.01" max="1000000" step="0.01" value="${E(r.amount)}"></div></label></div>`).join('')}</div><div id="history-missing-costs">${missingHtml(d)}</div>${B('Add a Budget item','L.budgetHistory.addItem()','text-btn')}<p class="small budget-history-projection" id="history-projection" role="status">${E(projection())}</p><p class="small muted budget-history-draft-note">Draft only. ${active()?'Your current Budget stays in place until you confirm.':'Nothing is saved until you confirm.'}</p><div id="error" role="alert"></div><div class="actions budget-history-actions">${!b&&!changed?'<button type="submit" class="primary">Review Budget</button>':''}${footer}</div></form>${details(s)}</section>`;
};
const first=L.views.firstEssentials;
L.views.firstEssentials=function(...args){const html=first.apply(this,args);return html.replace('<div class="first-cost-suggestions"',B('Suggest from my spending','L.budgetHistory.open()','text-btn budget-history-entry')+'<div class="first-cost-suggestions"');};
const plan=L.views.plan;
L.views.plan=function(...args){return plan.apply(this,args).replace('<div class="plan-hub-detail-actions">','<div class="plan-hub-detail-actions">'+B('Suggest from my spending','L.budgetHistory.open()','text-btn budget-history-entry'));};
function onInput(event){if(L.route!=='budgetHistory'||!/^history-(?:amount|include|name)-/.test(event.target?.id||''))return;capture();const p=document.getElementById('history-projection');if(p)p.textContent=projection();const missing=document.getElementById('history-missing-costs');if(missing)missing.innerHTML=missingHtml(L.state.budgetHistoryDraft);}
document.addEventListener('input',onInput);document.addEventListener('change',onInput);
const before=L.beforeNavigate;L.beforeNavigate=function(...args){capture();return before?.apply(this,args);};
// Queue the explicit destination after native close; an older popstate listener
// can otherwise restore Home while the task is removing its history entries.
L.budgetHistory={summary,open,useDraft,refresh,resume,addItem,addSavedItem,backToBudget:()=>{if(!allowed())return false;if(L.state.planDraft)return L.resumeBudgetSetupDraft();if(L.taskSheet?.active)L.closeTask();L.openTab('plan');}};
L.taskSheet?.register('budgetHistory',{family:'plan',treatment:'edit',label:'Budget from spending'});
})();
