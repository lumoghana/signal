/* A dated comparison of saved Budget totals with recorded Lumo spending.
   Review prepares the existing next-period flow; it never moves or renews money. */
(()=>{
'use strict';
if(!window.L||L.budgetPeriodReview)return;
const E=L.e,M=L.money,B=L.btn,DAY=86400000;
const clone=x=>JSON.parse(JSON.stringify(x));
const today=()=>new Date().toISOString().slice(0,10);
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''))&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const dateLabel=x=>validDate(x)?new Date(x+'T12:00:00Z').toLocaleDateString('en-GH',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}):'';
const cents=x=>{const v=Number(x),n=Math.round(v*100);return Number.isFinite(v)&&v>=0&&Number.isSafeInteger(n)&&Math.abs(v*100-n)<.000001?n:null;};
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const costs=()=> (L.state.essentials||[]).filter(x=>x&&!x.archived&&!x.deleted&&Number(x.amount)>0);
const fixed=x=>L.budgetCategories?.resolve(x)||null;
const internal=t=>!!(L.isInternalTransfer?.(t)||t?.internal||t?.internalTransfer||t?.boxId||t?.type==='internal'||t?.method==='Money Box transfer');
const currentMark=()=>JSON.stringify([costs().map(x=>[x.id,x.name,x.amount,x.budgetCategory||'',x.date||'']),L.state.planHorizon||{},L.state.budgetCycle||{},L.state.budgetPeriodRecord||{}]);
const ledgerMark=()=>JSON.stringify((L.state.txs||[]).map(t=>[t.id,t.type,t.status,t.date,t.amount,t.fee,t.category,t.categoryMeta,t.essentialId,t.budgetSource,t.refunded,t.refundId,t.refundOf,t.originalId,t.reversed,t.internal,t.internalTransfer,t.boxId,t.migration]));
function reliableStart(){
 const cycle=L.state.budgetCycle;if(validDate(cycle?.start))return {date:cycle.start,source:'saved'};
 const record=L.state.budgetPeriodRecord,ids=new Set(costs().map(x=>x.id));
 return validDate(record?.start)&&Array.isArray(record.costIds)&&record.costIds.some(id=>ids.has(id))?{date:record.start,source:'saved'}:{date:'',source:'missing'};
}
const pendingLinked=()=>{const ids=new Set(costs().map(x=>x.id));return (L.state.txs||[]).some(t=>t.type==='out'&&t.status==='pending'&&ids.has(t.essentialId));};
const norm=x=>String(x||'').trim().toLowerCase();
function categoryFor(t){
 // Historical transaction classifications survive later Budget category edits.
 // A deliberate transaction correction takes precedence; its planning-source
 // link continues to fulfil the original cost in the financial engine.
 if(t.categoryMeta?.source==='customer')return fixed(t.category);
 const source=t.budgetSource,recorded=t.categoryMeta?.budgetCategory||source?.budgetCategory;
 if(recorded){const c=L.budgetCategories.list.find(c=>c.id===recorded);if(c)return c;}
 if(source?.type==='budget-line'){const c=fixed(source.name);if(c)return c;}
 const name=norm(t.category);
 if(!['','uncategorised','uncategorized','unknown','transfers','savings','refunds'].includes(name)){
  if(name==='other'&&!['confirmed','high'].includes(t.categoryMeta?.confidence))return null;
  return fixed(t.category);
 }
 // A genuinely unclassified legacy record may still have its explicit Budget
 // source ID. Never use a newer saved category to replace a recorded category.
 if(!name&&!source){const linked=costs().find(x=>x.id===t.essentialId);if(linked)return fixed(linked);}
 return null;
}
function summary(options={}){
 let now=Number(options.now??Date.now());if(!Number.isFinite(now))now=Date.now();
 const currentDay=new Date(now).toISOString().slice(0,10),startInfo=reliableStart(),startDate=options.start!==undefined?String(options.start):startInfo.date,endDate=options.end!==undefined?String(options.end):validDate(L.state.planHorizon?.date)?L.state.planHorizon.date:'';
 const base={ready:false,reason:'',startDate,endDate,throughDate:'',basis:options.chosen?'chosen':startInfo.source,rows:[],planned:0,recorded:0,categorised:0,unknown:0,pending:0,included:[],unknownRecords:[],excluded:[],pendingRecords:[],ended:validDate(endDate)&&endDate<currentDay,signature:'unavailable'};
 if(!allowed())return {...base,reason:'unavailable'};
 if(!costs().length)return {...base,reason:'no-budget'};
 if(!validDate(startDate)||!validDate(endDate)||endDate<startDate)return {...base,reason:'dates'};
 if(startDate>currentDay)return {...base,reason:'future'};
 const throughDate=endDate<currentDay?endDate:currentDay,start=Date.parse(startDate+'T00:00:00Z'),end=Math.min(Date.parse(endDate+'T23:59:59.999Z'),now),all=(L.state.txs||[]).filter(Boolean),groups=new Map(L.budgetCategories.list.map(c=>[c.id,{categoryId:c.id,name:c.name,planned:0,recorded:0,pending:0,count:0}]));
 for(const x of costs()){const c=fixed(x)||L.budgetCategories.list.find(c=>c.id==='other'),a=cents(x.amount);if(a!==null)groups.get(c.id).planned+=a;}
 const refunded=new Set(all.filter(t=>t.type==='in'&&t.status==='success'&&(t.originalId||t.refundOf)&&(!Number.isFinite(Date.parse(t.date))||Date.parse(t.date)<=now)).map(t=>t.originalId||t.refundOf));
 const included=[],unknownRecords=[],excluded=[],pendingRecords=[];let unknown=0,pending=0;
 for(const t of all){
  const at=Date.parse(t.date);if(t.type!=='out'||!Number.isFinite(at)||at<start||at>end||internal(t)||t.migration)continue;
  const amount=cents(t.amount),fee=cents(t.fee||0);if(amount===null||amount<=0||fee===null){excluded.push(t.id);continue;}
  const total=amount+fee,c=categoryFor(t),record={id:t.id,name:String(t.name||'Payment'),date:t.date,amount:total/100,categoryId:c?.id||'',category:c?.name||'Uncategorised'};
  if(t.status==='pending'){pending+=total;pendingRecords.push(record);if(c)groups.get(c.id).pending+=total;continue;}
  if(t.status!=='success'||Number(t.refunded)>0||t.refundId||t.originalId||t.refundOf||t.reversed||refunded.has(t.id)){excluded.push(t.id);continue;}
  if(!c){unknown+=total;unknownRecords.push(record);continue;}
  const row=groups.get(c.id);row.recorded+=total;row.count++;included.push(record);
 }
 const rows=[...groups.values()].filter(x=>x.planned||x.recorded||x.pending).map(x=>({...x,planned:x.planned/100,recorded:x.recorded/100,pending:x.pending/100,difference:(x.recorded-x.planned)/100}));
 const planned=rows.reduce((n,x)=>n+Math.round(x.planned*100),0)/100,categorised=rows.reduce((n,x)=>n+Math.round(x.recorded*100),0)/100;
 return {...base,ready:true,reason:'',throughDate,rows,planned,categorised,recorded:Math.round((categorised+unknown/100)*100)/100,unknown:unknown/100,pending:pending/100,included,unknownRecords,excluded,pendingRecords,signature:JSON.stringify([currentMark(),ledgerMark(),startDate,endDate,currentDay])};
}
const draft=()=>L.state.budgetPeriodReviewDraft;
function freshQuote(d){return summary({start:d.start,end:d.end,chosen:d.chosen});}
function open(){
 if(!allowed())return false;
 const s=summary();L.state.budgetPeriodReviewDraft={start:s.startDate,end:s.endDate,chosen:false,quoteSignature:s.signature,sourceMark:currentMark(),nextMode:''};L.save();L.go(s.reason==='dates'?'budgetReviewDates':'budgetPeriodReview');return true;
}
function dates(){if(!allowed())return false;if(!draft())return open();L.go('budgetReviewDates');return true;}
function readDates(){const d=draft();if(!d)return;for(const key of ['start','end']){const f=document.getElementById('budget-review-'+key);if(f)d[key]=f.value;}}
function saveDates(){
 if(!allowed()||L.route!=='budgetReviewDates'||!draft())return false;readDates();const d=draft(),s=summary({start:d.start,end:d.end,chosen:true});
 if(!s.ready)return L.error(s.reason==='future'?'Choose a start date of today or earlier.':'Choose a valid start and end date. The end date must follow the start.','budget-review-start'),false;
 d.chosen=true;d.quoteSignature=s.signature;d.sourceMark=currentMark();d.nextMode='';L.save();L.go('budgetPeriodReview');return true;
}
function refresh(){if(!allowed()||!draft())return false;const d=draft(),s=freshQuote(d);d.quoteSignature=s.signature;d.sourceMark=currentMark();L.save();L.render();return true;}
function blocker(){
 if(L.state.planDraft)return {route:'setup',text:'You have an unfinished Budget draft. Continue it before preparing another period.'};
 if(L.state.budgetCycleDraft)return {route:'cycle',text:'Your next Budget is already in a draft. Continue it instead of replacing it.'};
 if(L.state.budgetHistoryDraft)return {route:'history',text:'Your spending-based Budget suggestion is kept. Finish that draft first.'};
 if(pendingLinked())return {route:'pending',text:'A payment linked to your Budget is pending. Wait for its result before starting a new period.'};
 return null;
}
function continueDraft(){const b=blocker();if(!allowed()||!b)return false;if(b.route==='setup')return L.resumeBudgetSetupDraft();if(b.route==='cycle')return L.go('budgetCycle',{id:L.state.budgetCycleDraft.id});if(b.route==='history')return L.budgetHistory.open();return false;}
function quoteOK(){const d=draft();if(!d)return false;const s=freshQuote(d);return s.ready&&d.quoteSignature===s.signature;}
function next(mode){
 if(!allowed()||!['keep','adjust'].includes(mode)||!draft())return false;
 if(!quoteOK())return L.error('Your Budget, records or dates changed. Refresh this review before preparing the next one.'),false;
 const b=blocker();if(b)return L.error(b.text),false;
 draft().nextMode=mode;draft().nextStart=today();draft().nextEnd='';L.save();L.go('budgetReviewNext');return true;
}
function readNext(){const d=draft();if(!d)return;const a=document.getElementById('budget-next-start'),b=document.getElementById('budget-next-end');if(a)d.nextStart=a.value;if(b)d.nextEnd=b.value;}
function prepareNext(){
 if(!allowed()||L.route!=='budgetReviewNext'||!draft())return false;readNext();const d=draft();
 if(!quoteOK())return L.error('Your Budget or records changed. Return to the review and refresh it. Your entered dates are kept.'),false;
 const b=blocker();if(b)return L.error(b.text),false;
 if(!validDate(d.nextStart)||!validDate(d.nextEnd)||d.nextStart!==today()||d.nextEnd<d.nextStart)return L.error('This budget applies now. Choose today as its start date, or keep your draft until you are ready.','budget-next-end'),false;
 const mode=d.nextMode;if(!['keep','adjust'].includes(mode))return false;
 const start=d.nextStart,end=d.nextEnd;L.openBudgetCycle();const cycle=L.state.budgetCycleDraft;if(!cycle)return false;
 cycle.start=start;cycle.end=end;cycle.periodReviewSource={start:d.start,end:d.end};cycle.reviewed=false;L.save();L.go('budgetCycle',{id:cycle.id});
 if(mode==='keep')L.reviewBudgetCycle();return true;
}
const close=()=>B('Close','L.taskSheet?.active?L.closeTask():L.go(\'plan\')','text-btn');
const error='<div id="error" role="alert" aria-live="polite"></div>';
function difference(s){
 const row=s.rows.filter(x=>x.planned>0||x.recorded>0).sort((a,b)=>Math.abs(b.difference)-Math.abs(a.difference))[0];
 if(!row||row.difference===0)return 'The categorised spending recorded here matches these saved Budget totals.';
 return `${row.name}: ${M(Math.abs(row.difference))} ${row.difference>0?'more':'less'} recorded than budgeted${s.ended?'':' so far'}.`;
}
L.views.budgetReviewDates=()=>{
 const d=draft();if(!allowed())return '';if(!d)return L.views.plan();
 return `<section class="budget-period-review budget-review-dates">${L.header('Choose the comparison dates.','Choose the period you want to compare.')}<p class="small">These dates apply to this review only. Your saved Budget and money stay unchanged.</p><form onsubmit="event.preventDefault();L.budgetPeriodReview.saveDates()"><label class="field" for="budget-review-start"><span>Review from</span><input class="input" id="budget-review-start" type="date" max="${today()}" value="${E(d.start||'')}" required></label><label class="field" for="budget-review-end"><span>Review through</span><input class="input" id="budget-review-end" type="date" value="${E(d.end||'')}" required></label>${error}<div class="actions"><button type="submit" class="primary">Show comparison</button>${close()}</div></form></section>`;
};
L.views.budgetReviewNext=()=>{
 const d=draft();if(!allowed())return '';if(!d)return L.views.plan();
 return `<section class="budget-period-review budget-review-next">${L.header('When is your next Budget?','Confirmation replaces your current Budget now.')}<p class="small">${d.nextMode==='keep'?'Keep the same full category amounts.':'Start with your saved category amounts, then edit them.'} Unspent amounts are not added again.</p><form onsubmit="event.preventDefault();L.budgetPeriodReview.prepareNext()"><label class="field" for="budget-next-start"><span>From</span><input class="input" id="budget-next-start" type="date" min="${today()}" max="${today()}" value="${E(d.nextStart||'')}" required></label><label class="field" for="budget-next-end"><span>Through</span><input class="input" id="budget-next-end" type="date" min="${E(d.nextStart||today())}" value="${E(d.nextEnd||'')}" required></label>${error}<div class="actions"><button type="submit" class="primary">${d.nextMode==='keep'?'Review next Budget':'Adjust next Budget'}</button>${B('Back to review',"L.go('budgetPeriodReview')",'secondary')}</div></form></section>`;
};
L.views.budgetPeriodReview=()=>{
 if(!allowed())return '';const d=draft();if(!d)return `${L.header('Review your Budget.')}<div class="actions">${B('Open review','L.budgetPeriodReview.open()')}${close()}</div>`;
 const s=freshQuote(d);if(s.reason==='no-budget')return `<section class="budget-period-review">${L.header('Start with a Budget.')}<p>Save the costs your Everyday money needs to cover. Your next review can compare them with recorded spending.</p>${B('Build with Lumo',"L.budgetGuide.start({mode:'create'})")}${close()}</section>`;
 if(!s.ready)return `<section class="budget-period-review">${L.header('Choose dates for your review.')}<p>Lumo needs the period before comparing saved amounts with recorded spending.</p>${B('Choose review dates','L.budgetPeriodReview.dates()')}${close()}</section>`;
 const changed=d.quoteSignature!==s.signature,b=blocker();
 return `<section class="budget-period-review">${L.header(s.ended?'Your Budget, reviewed.':'Your Budget so far.')}<p class="budget-review-period">${E(dateLabel(s.startDate))} – ${E(dateLabel(s.endDate))}${!s.ended?`<small>Recorded through ${E(dateLabel(s.throughDate))}</small>`:''}</p>${d.chosen?'<p class="small muted">Selected review dates · compared with current saved Budget totals.</p>':''}<dl class="budget-review-totals"><div><dt>Budgeted</dt><dd>${M(s.planned)}</dd></div><div><dt>Recorded money out</dt><dd>${M(s.recorded)}</dd></div></dl><p class="budget-review-insight">${E(difference(s))}</p>${s.unknown?`<p class="small notice">${M(s.unknown)} still needs a category. The category comparison may change.</p>`:''}${s.pending?`<p class="small muted">${M(s.pending)} is pending and is not counted as spending.</p>`:''}<p class="small muted">Lumo records only, including fees. Spending elsewhere may be missing.</p>${changed?`<div class="notice small">Your Budget or records changed.${B('Refresh review','L.budgetPeriodReview.refresh()','text-btn')}</div>`:''}${b?`<div class="notice small">${E(b.text)}${b.route!=='pending'?B('Continue saved draft','L.budgetPeriodReview.continueDraft()','text-btn'):''}</div>`:''}${error}<div class="actions">${!changed&&!b?B('Keep these amounts',"L.budgetPeriodReview.next('keep')")+B('Adjust next Budget',"L.budgetPeriodReview.next('adjust')",'secondary'):''}${close()}</div><details class="optional-fields budget-review-breakdown"><summary>See category comparison</summary>${s.rows.map(r=>`<section class="budget-review-category"><h3>${E(r.name)}</h3><dl><div><dt>Budgeted</dt><dd>${M(r.planned)}</dd></div><div><dt>Recorded</dt><dd>${M(r.recorded)}</dd></div></dl>${r.pending?`<p class="small muted">${M(r.pending)} pending</p>`:''}</section>`).join('')}<p class="small muted">Current saved totals are compared with completed, categorised outgoing payments. Linked Budget payments appear once. Incoming payments, Money Box transfers, failed and reversed payments are excluded. Refunded payments are excluded entirely.</p>${s.excluded.length?`<p class="small muted">${s.excluded.length} record${s.excluded.length===1?' was':'s were'} excluded because of its status, refund or invalid amount.</p>`:''}${B('Change comparison dates','L.budgetPeriodReview.dates()','text-btn')}</details></section>`;
};
function preserveInputs(event){if(L.route==='budgetReviewDates'&&/^budget-review-/.test(event.target?.id||'')){readDates();L.save();}if(L.route==='budgetReviewNext'&&/^budget-next-/.test(event.target?.id||'')){readNext();L.save();}}
document.addEventListener('input',preserveInputs);document.addEventListener('change',preserveInputs);
const before=L.beforeNavigate;L.beforeNavigate=function(...args){if(L.route==='budgetReviewDates')readDates();if(L.route==='budgetReviewNext')readNext();return before?.apply(this,args);};
// A new Budget has a known start only after an explicit successful save.
const save=L.saveFirstPlan;L.saveFirstPlan=function(...args){
 const started=L.route==='firstPlanReview'&&!!L.state.planDraft,wasEmpty=costs().length===0,result=save.apply(this,args);
 if(started&&wasEmpty&&!L.state.planDraft&&costs().length){L.state.budgetPeriodRecord={start:today(),costIds:costs().map(x=>x.id),createdAt:new Date().toISOString(),source:'created'};L.save();}
 return result;
};
const confirm=L.confirmBudgetCycle;L.confirmBudgetCycle=function(...args){
 const candidate=L.state.budgetCycleDraft,previousStart=reliableStart().date,result=confirm.apply(this,args);
 if(candidate&&!L.state.budgetCycleDraft&&L.state.budgetCycle?.id===candidate.id){const archive=L.state.budgetCycles?.at(-1);if(archive&&!archive.start&&validDate(previousStart))archive.start=previousStart;L.state.budgetPeriodRecord={start:candidate.start,costIds:costs().map(x=>x.id),createdAt:new Date().toISOString(),source:'cycle'};L.state.budgetPeriodReviewDraft=null;L.save();}
 return result;
};
L.taskSheet?.register('budgetPeriodReview',{family:'plan',treatment:'detail',label:'Budget review'});
L.taskSheet?.register('budgetReviewDates',{family:'plan',treatment:'edit',label:'Review dates'});
L.taskSheet?.register('budgetReviewNext',{family:'plan',treatment:'edit',label:'Next Budget dates'});
L.budgetPeriodReview={summary,open,dates,saveDates,refresh,next,prepareNext,continueDraft};
})();
