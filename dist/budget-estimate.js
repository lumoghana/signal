/* Optional arithmetic for an unsaved Budget amount. No account or saved cost
   changes here: the existing Budget Save action remains authoritative. */
(()=>{
'use strict';
if(!window.L||L.openBudgetEstimate)return;
const E=L.e,M=L.money,B=L.btn;
let session=null,application=null;
const field=id=>document.getElementById(id);
const origins=new Set(['firstEssentials','essentialEdit']);
const currentCost=id=>(L.state.essentials||[]).find(x=>x.id===id&&!x.archived&&!x.deleted);
const fingerprint=x=>JSON.stringify(x?[x.id,x.name,x.amount,x.paid,x.externalPaid,x.coverageVersion,x.date]:null);
const pending=id=>(L.state.txs||[]).some(t=>t.type==='out'&&t.status==='pending'&&t.essentialId===id);
const available=()=>L.state.onboarded&&!L.state.locked&&!L.state.closed;
const freshContext=()=>!!session&&session.account===L.state&&available()&&
 (session.route==='firstEssentials'?L.state.planDraft===session.planDraft:!session.params.id||fingerprint(currentCost(session.params.id))===session.costMark&&!pending(session.params.id));
const validSession=()=>freshContext()&&!session.used&&!session.cancelled;
const read=()=>{
 if(L.route!=='budgetEstimate'||!session)return;
 for(const [key,id]of [['rate','estimate-rate'],['count','estimate-count'],['unit','estimate-unit']])if(field(id))session[key]=field(id).value;
};
const quote=()=>{
 const raw=String(session?.rate||'').trim(),units=String(session?.count||'').trim(),unit=session?.unit;
 if(!/^(?:\d+)(?:\.\d{1,2})?$/.test(raw)||!/^\d+$/.test(units)||!['day','week'].includes(unit))return null;
 const rate=Number(raw),count=Number(units),totalCents=Math.round(rate*100)*count;
 if(!Number.isFinite(rate)||rate<.01||rate>1000000||!Number.isSafeInteger(count)||count<1||count>3660||!Number.isSafeInteger(totalCents)||totalCents<1||totalCents>100000000)return null;
 return {rate,count,unit,total:totalCents/100};
};
const result=q=>q?`<span class="budget-estimate-equation">${M(q.rate)} × ${q.count} ${q.unit}${q.count===1?'':'s'}</span><strong>${M(q.total)}</strong><span>You can edit this before saving.</span>`:'<span>Add your own rate and the number of days or weeks.</span>';
L.refreshBudgetEstimate=()=>{
 read();const q=quote(),el=field('estimate-result'),label=field('estimate-count-label');
 if(el)el.innerHTML=result(q);if(label)label.textContent='Number of '+(session?.unit==='week'?'weeks':'days');
 return q;
};
L.openBudgetEstimate=()=>{
 if(!origins.has(L.route)||!available())return false;
 if(L.route==='firstEssentials')L.capturePlanDraft?.();else L.captureFormDraft?.();
 const id=L.params.id||'',cost=id?currentCost(id):null;
 if(L.route==='essentialEdit'&&id&&(!cost||pending(id))){L.error('Check this Budget item’s pending payment before editing.');return false;}
 const amountId=L.route==='firstEssentials'?'firstEssAmount':'essAmount',nameId=L.route==='firstEssentials'?'firstEssName':'essName';
 session={account:L.state,route:L.route,params:{...L.params},amountId,name:field(nameId)?.value||cost?.name||'this Budget item',costMark:fingerprint(cost),planDraft:L.state.planDraft,rate:'',count:'',unit:'day',id:L.id('estimate')};
 application=null;L.go('budgetEstimate',{id:session.id});return true;
};
L.cancelBudgetEstimate=()=>{if(L.route!=='budgetEstimate')return false;if(session)session.cancelled=true;L.clearFormDraft?.();L.back();return true;};
L.useBudgetEstimate=()=>{
 if(L.route!=='budgetEstimate')return false;read();
 if(!validSession()){L.error('This Budget item changed. Return to it and try again.');return false;}
 const q=quote();if(!q){L.error('Enter a positive rate with up to two decimal places and a whole number of days or weeks. Keep the total at GH₵1,000,000 or less.','estimate-rate');return false;}
 application={session,total:q.total};session.used=true;L.clearFormDraft?.();L.back();return true;
};
L.views.budgetEstimate=()=>{
 const valid=validSession()&&L.params.id===session.id;
 if(!valid)return `<section class="budget-estimate">${L.header(session?.used?'Amount added to your draft.':'Return to your Budget item.')}<p>Your saved Budget and account money are unchanged.</p><div class="actions">${B('Back to Budget item','L.back()')}</div></section>`;
 return `<section class="budget-estimate" data-budget-estimate>${L.header('Work out a total.')}<p class="small">For <strong>${E(session.name)}</strong>. Enter your own rate.</p><form onsubmit="event.preventDefault();L.useBudgetEstimate()"><div class="budget-estimate-rate"><label class="field" for="estimate-rate"><span>Amount (GH₵)</span><input class="input" id="estimate-rate" type="number" min="0.01" max="1000000" step="0.01" inputmode="decimal" placeholder="0.00" value="${E(session.rate)}" required></label><label class="field" for="estimate-unit"><span>How often?</span><select class="input" id="estimate-unit"><option value="day"${session.unit==='day'?' selected':''}>Each day</option><option value="week"${session.unit==='week'?' selected':''}>Each week</option></select></label></div><label class="field" for="estimate-count"><span id="estimate-count-label">Number of ${session.unit==='week'?'weeks':'days'}</span><input class="input" id="estimate-count" type="number" min="1" max="3660" step="1" inputmode="numeric" placeholder="0" value="${E(session.count)}" required></label><div id="estimate-result" class="budget-estimate-result" role="status" aria-live="polite">${result(quote())}</div><div id="error" role="alert"></div><div class="actions"><button type="submit" class="primary">Use this amount</button>${B('Cancel','L.cancelBudgetEstimate()','text-btn')}</div></form><p class="small muted">This fills your draft. Save the Budget item to keep it. No money moves.</p></section>`;
};
for(const [route,helpId]of [['firstEssentials','first-cost-period-help'],['essentialEdit','essential-total-help']]){
 const view=L.views[route];L.views[route]=function(...args){const html=view.apply(this,args),link=B('Help me estimate','L.openBudgetEstimate()','text-btn budget-estimate-open');return html.replace(new RegExp('(<p id="'+helpId+'"[^>]*>[\\s\\S]*?<\\/p>)'),'$1'+link);};
}
const before=L.beforeNavigate;
L.beforeNavigate=function(...args){read();return before?.apply(this,args);};
const render=L.render;
L.render=function(...args){
 const r=render.apply(this,args);
 if(L.route==='budgetEstimate')L.refreshBudgetEstimate();
 if(application&&application.session.account===L.state&&L.route===application.session.route&&String(L.params.id||'')===String(application.session.params.id||'')){
  const pendingApplication=application;application=null;const input=field(pendingApplication.session.amountId);
  if(!freshContext()){L.toast('This Budget item changed. Check it before using an estimate.');return r;}
  if(input){input.value=pendingApplication.total.toFixed(2);if(L.route==='firstEssentials'){L.capturePlanDraft?.();L.refreshFirstCostPreview?.();}else L.captureFormDraft?.();input.focus?.({preventScroll:true});L.toast('Estimate added. Review it before saving.');}
 }
 if(application&&L.route!=='budgetEstimate'&&L.route!==application.session.route)application=null;
 return r;
};
for(const event of ['input','change'])document.addEventListener(event,e=>{if(L.route==='budgetEstimate'&&['estimate-rate','estimate-count','estimate-unit'].includes(e.target?.id))L.refreshBudgetEstimate();});
L.taskSheet?.register('budgetEstimate',{family:'plan',treatment:'edit',label:'Budget estimate'});
})();
