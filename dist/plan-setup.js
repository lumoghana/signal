/* Plan setup keeps a recoverable draft and changes the saved plan only on confirmation. */
(()=>{
const E=L.e,M=L.money;
const separate=state=>(state||L.state).accounts?.version===2;
// Keep historical route IDs while the customer-facing journey is a budget.
const budgetText=text=>String(text).replace(/\bEssentials\b/g,'Budget costs').replace(/\bessentials\b/g,'budget costs').replace(/\bEssential\b/g,'Budget cost').replace(/\bessential\b/g,'budget cost').replace(/\bPlan\b/g,'Budget').replace(/\bplan\b/g,'budget');
const copy=text=>separate()?budgetText(text):text;
const fail=(message,field)=>L.error(separate()?budgetText(message):message,field);
// Expected income and unallocated targets are useful context, not commitments.
// A deliberately saved plan stays recognised when its costs become covered.
L.hasMeaningfulPlan=(state=L.state)=>!!(state.planSaved||(state.essentials||[]).some(cost=>Number(cost.amount)>0)||!separate(state)&&(state.goals||[]).some(goal=>Number(goal.allocated)>0));
// Provenance, not a completeness score: Lumo only knows the costs entered.
// Paid costs remain part of this saved scope even when nothing is left to cover.
L.planScopeSummary=(state=L.state)=>{
 const positive=value=>Number.isFinite(Number(value))&&Number(value)>0;
 const costCount=(Array.isArray(state?.essentials)?state.essentials:[]).filter(cost=>positive(cost?.amount)).length;
 const goalCount=separate(state)?0:(Array.isArray(state?.goals)?state.goals:[]).filter(goal=>positive(goal?.allocated)).length;
 const label=costCount?`Based on your ${costCount} saved cost${costCount===1?'':'s'}${goalCount?` and ${goalCount} goal${goalCount===1?'':'s'}`:''}.`:goalCount?`Based on ${goalCount} goal${goalCount===1?'':'s'} only · no costs saved.`:'No saved costs or money set aside yet.';
 const draftLabel=costCount?`Based on ${costCount} cost${costCount===1?'':'s'} in this draft${goalCount?` and ${goalCount} goal${goalCount===1?'':'s'}`:''}.`:goalCount?`Based on ${goalCount} goal${goalCount===1?'':'s'} only · no costs in this draft.`:'No costs or money set aside in this draft yet.';
 return {costCount,goalCount,label:separate(state)?label.replace('No saved costs or money set aside yet.','No budget costs saved yet.'):label,draftLabel:separate(state)?draftLabel.replace('No costs or money set aside in this draft yet.','No costs in this budget draft yet.'):draftLabel,detail:separate(state)?'Only your saved budget costs are included. Money Boxes are held separately in savings.':'Only costs and money set aside in your plan are included. Add any costs that are missing.'};
};
const routes=new Set(['planSetup','firstEssentials','firstGoal','firstPlanReview']);
const stages=['Costs to cover','Review'];
let moving=false;
const today=()=>{const n=new Date();return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;};
const dateOK=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!Number.isNaN(new Date(value+'T12:00:00Z').getTime())&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const horizon=value=>value&&['date','allowance'].includes(value.mode)&&dateOK(value.date)?{mode:value.mode,date:value.date}:{mode:'unspecified',date:''};
const savedHorizon=()=>{if(!L.state.planHorizon)L.state.planHorizon={mode:'unspecified',date:''};return horizon(L.state.planHorizon);};
const dateName=value=>new Date(value+'T12:00:00Z').toLocaleDateString('en-GH',{day:'numeric',month:'short',...(value.slice(0,4)!==today().slice(0,4)?{year:'numeric'}:{})});
const periodLabel=value=>{const h=horizon(value);return h.mode==='unspecified'?(separate()?'Budget period not set':'Plan period not set'):h.date<today()?(separate()?'Budget ended ':'Plan ended ')+dateName(h.date):'Through '+dateName(h.date);};
L.planPeriodLabel=()=>periodLabel(savedHorizon());
L.planPeriodActionLabel=()=>savedHorizon().mode==='unspecified'?'How long should this money last? Add a date.':periodLabel(savedHorizon())+' · Change date';
// Saved scope and lifecycle are separate from whether costs still need money.
// This pure description never renews a period or changes financial commitments.
L.budgetStateSummary=(state=L.state,now=Date.now())=>{
 const cash=n=>Math.max(0,Math.round((Number(n)||0)*100)/100);
 const costs=(Array.isArray(state.essentials)?state.essentials:[]).filter(x=>x&&!x.archived&&!x.deleted&&Number.isFinite(Number(x.amount))&&Number(x.amount)>0);
 const time=new Date(now),current=Number.isNaN(time.getTime())?today():time.toISOString().slice(0,10);
 const h=horizon(state.planHorizon),endDate=h.mode==='unspecified'?'':h.date,ended=!!endDate&&endDate<current;
 const facts={...state,essentials:costs,goals:(Array.isArray(state.goals)?state.goals:[]).filter(Boolean)};
 const position=L.pauseEngine?.planPosition?.({amount:0,fee:0},facts);
 const pending=cash((state.txs||[]).filter(t=>t.type==='out'&&t.status==='pending'&&costs.some(c=>c.id===t.essentialId)).reduce((sum,t)=>sum+Number(t.amount||0),0));
 const remaining=cash(position?.essentialsBefore??costs.reduce((sum,c)=>sum+Math.max(0,Number(c.amount)-Number(c.paid||0)),0));
 const scope=L.planScopeSummary(facts).label,status=!costs.length?'none':ended?'ended':remaining===0?'completed':'active';
 const name=separate(state)?'Budget':'plan';
 const period=endDate?new Date(endDate+'T12:00:00Z').toLocaleDateString('en-GH',{day:'numeric',month:'short',...(endDate.slice(0,4)!==current.slice(0,4)?{year:'numeric'}:{})}):'';
 const headline=status==='none'?'No budget costs saved yet.':status==='ended'?`Your ${name} period has ended.`:status==='completed'?pending?'Your saved costs are paid or pending.':'Your saved costs are covered.':`${M(remaining)} of saved costs remain.`;
 const qualifier=status==='ended'?`Based on your ${name} through ${period}. Review the dates and costs.`:status==='completed'?pending?`${scope} Includes pending payments; their result may change what remains.`:`${scope} No unpaid saved costs remain.`:`${scope} Other costs aren’t included.`;
 return {status,hasBudget:costs.length>0,costCount:costs.length,remaining,pending,ended,endDate,scope,qualifier,headline,action:status==='ended'?'Review Budget':status==='completed'?'Review saved costs':'Edit Budget',depletedIds:(position?.essentials||[]).filter(x=>x.before===0).map(x=>x.id)};
};
savedHorizon();
// A draft can change its own costs without replacing a newer saved Budget.
// Coverage is deliberately absent: confirmed payments may fulfil a saved cost
// while the draft is open, and position() reconciles that coverage separately.
const planningRows=rows=>(rows||[]).map(x=>[x.id,x.name,x.amount,x.date||'',x.budgetCategory||'',!!x.archived,!!x.deleted]);
const savedDraftMark=()=>JSON.stringify([planningRows(L.state.essentials),L.state.planHorizon||{},L.state.allowance||{},!!L.state.planSaved,L.state.accounts?.version||0]);
const draftContentMark=d=>JSON.stringify([d.essentials,d.allowance,d.planHorizon,d.essentialFields,d.editingEssentialId]);
L.capturePlanDraftBaseline=(d,{createdFromSaved=false}={})=>{
 if(!d||d.savedBudgetMark||d.savedBudgetMarkUnverified)return d;
 const current=savedDraftMark(),guide=L.state.budgetGuideSession;
 const guided=guide&&guide.draftId===d.guideId&&guide.baseMark===current;
 const saved=L.state.essentials||[],proposed=d.essentials||[];
 const retained=JSON.stringify(planningRows(proposed.filter(x=>saved.some(y=>y.id===x.id))))===JSON.stringify(planningRows(saved));
 const metadata=JSON.stringify(d.planHorizon||{})===JSON.stringify(L.state.planHorizon||{})&&JSON.stringify(d.allowance||{})===JSON.stringify(L.state.allowance||{});
 // Old manual drafts could add costs but could not edit saved ones. Adopt only
 // a provably matching saved snapshot; old guided drafts have their own mark.
 if(createdFromSaved||guided||retained&&metadata)d.savedBudgetMark=current;
 else d.savedBudgetMarkUnverified=true;
 return d;
};
L.planDraftSafety=d=>{
 if(!d)return 'Open your Budget to start a draft.';
 if(L.state.onboarded===false)return 'Finish account setup before changing your Budget.';
 if(L.state.locked||L.state.closed)return 'Unlock Lumo before changing your Budget.';
 L.capturePlanDraftBaseline(d);
 if(d.savedBudgetMarkUnverified||d.savedBudgetMark!==savedDraftMark())return 'Your saved Budget changed. Your draft is kept. Review it or replace this draft from your current saved Budget.';
 const ids=new Set((L.state.essentials||[]).map(x=>x.id));
 if((L.state.txs||[]).some(t=>t.type==='out'&&t.status==='pending'&&ids.has(t.essentialId)))return 'A payment linked to your Budget is pending. Wait for its result before changing these saved costs.';
 const guide=L.state.budgetGuideSession;
 if(guide&&guide.draftId===d.guideId&&['category','duplicate','combine','combine-limit','legacy-category'].includes(guide.pending?.kind))return 'Finish the category or total choice in Chat before editing these draft costs. Your proposed costs are kept.';
 return '';
};
const draft=()=>{
 if(!L.state.planDraft){L.state.planDraft={step:'planSetup',allowance:{...L.state.allowance},essentials:L.state.essentials.map(x=>({...x})),goals:L.state.goals.map(g=>({...g})),planHorizon:savedHorizon()};L.capturePlanDraftBaseline(L.state.planDraft,{createdFromSaved:true});}
 if(!L.state.planDraft.planHorizon)L.state.planDraft.planHorizon={mode:'unspecified',date:''};
 return L.capturePlanDraftBaseline(L.state.planDraft);
};
const raw=id=>document.getElementById(id)?.value??'';
const amountOK=(n,zero=true)=>Number.isFinite(n)&&n>=(zero?0:.01)&&n<=1000000&&Math.abs(n*100-Math.round(n*100))<.000001;
const syncCoverage=d=>{
 L.reconcileEssentialCoverage?.();
 d.essentials=d.essentials.map(x=>{const live=L.state.essentials.find(item=>item.id===x.id);return live?{...x,paid:live.paid||0,...(live.externalPaid!==undefined?{externalPaid:live.externalPaid}:{}),...(live.coverageVersion!==undefined?{coverageVersion:live.coverageVersion}:{})}:x;});
 return d;
};
const remaining=x=>Math.max(0,Number(x.amount)-(x.paid||0)-L.state.txs.filter(t=>t.type==='out'&&t.status==='pending'&&t.essentialId===x.id).reduce((held,t)=>held+Number(t.amount),0));
// A goal added from My plan while setup is paused must survive the older draft.
// Keep this a local candidate: changing d.goals would retarget its optional editor.
const candidateGoals=d=>separate()?[]:[...d.goals,...L.state.goals.filter(saved=>!d.goals.some(g=>g.id===saved.id))].map(g=>({...g}));
// A later confirmed edit/release/archive takes precedence over its older setup
// snapshot. Draft-only goals stay untouched until the student saves the plan.
L.syncPlanDraftGoal=id=>{
 if(separate())return;
 const d=L.state.planDraft;if(!d)return;
 const index=d.goals.findIndex(g=>g.id===id);if(index<0)return;
 const saved=L.state.goals.find(g=>g.id===id);
 if(saved){d.goals[index]={...saved};if(index===0&&d.goalFields)d.goalFields={name:saved.name,target:String(saved.target),allocated:String(saved.allocated||0)};}
 else {d.goals=d.goals.filter(g=>g.id!==id);if(index===0)delete d.goalFields;}
};
const position=d=>{
 syncCoverage(d);const state={...L.state,allowance:d.allowance,essentials:d.essentials,goals:candidateGoals(d)};
 if(L.pauseEngine?.planPosition)return L.pauseEngine.planPosition({amount:0,fee:0},state);
 const available=L.balances().available,essentialsBefore=d.essentials.reduce((sum,x)=>sum+remaining(x),0),allocated=state.goals.reduce((sum,g)=>sum+Number(g.allocated||0),0);
 return {available,essentialsBefore,allocated,room:Math.max(0,available-essentialsBefore-allocated),totalGap:Math.max(0,essentialsBefore+allocated-available)};
};
const unpaid=d=>position(d).essentialsBefore;
const goalRoom=d=>Math.max(0,position(d).available-unpaid(d)-candidateGoals(d).filter(g=>g.id!==d.goals[0]?.id).reduce((v,g)=>v+Number(g.allocated||0),0));
L.firstPlanPosition=()=>position(draft());
const field=(label,id,placeholder='',type='text',value='')=>L.field(copy(label),id,placeholder,type,value)
 .replace('<input ','<input oninput="L.capturePlanDraft()" onchange="L.capturePlanDraft()" ')
 .replace('autocomplete="off"',type==='number'?'autocomplete="off" min="0" max="1000000" step="0.01"':'autocomplete="off"'+(type==='text'?' maxlength="80"':''));
const finishLater=()=>L.btn('Finish later','L.firstPlanLeave()','text-btn');
const frame=(step,title,sub,body)=>L.route==='firstPlanReview'?`<section class="simple-plan-setup simple-plan-review" data-illustrated-screen="firstPlanReview" aria-label="Review ${separate()?'Budget':'plan'}"><p class="small muted" role="progressbar" aria-label="${separate()?'Budget':'Plan'} setup" aria-valuemin="1" aria-valuemax="2" aria-valuenow="2" aria-valuetext="Step 2 of 2: Review">2 of 2 · Review</p><p class="small muted">${copy('Saving a plan doesn’t move money.')}</p>${body}<div id="error" role="alert" aria-live="polite"></div></section>`:`<section class="simple-plan-setup" data-illustrated-screen="${L.route}">${L.header(copy(title),copy(sub))}<div class="simple-plan-art">${L.illustration?.('plan',true)||''}</div>${step?`<div class="plan-setup-progress"><span class="small muted">${step} of 2 · ${stages[step-1]}</span><div class="progress" role="progressbar" aria-label="${separate()?'Budget':'Plan'} setup" aria-valuemin="1" aria-valuemax="2" aria-valuenow="${step}" aria-valuetext="Step ${step} of 2: ${stages[step-1]}"><div class="progress-bar" style="width:${step*50}%"></div></div></div>`:'<p class="small muted">Optional · your costs are kept</p>'}${body}<div id="error" role="alert" aria-live="polite"></div></section>`;
const move=(route,params={})=>{moving=true;try{L.go(route,params);}finally{moving=false;}};
let restartDraft=null;
L.openPlanDraftRestart=()=>{
 if(!L.state.planDraft||L.state.onboarded===false||L.state.locked||L.state.closed)return false;
 L.capturePlanDraft();restartDraft={account:L.state,saved:savedDraftMark(),draft:draftContentMark(L.state.planDraft),route:L.route,params:{...L.params}};
 L.taskSheet?.register?.('planDraftRestart',{family:'plan',treatment:'confirmation',label:'Replace Budget draft'});
 L.go('planDraftRestart');return true;
};
L.cancelPlanDraftRestart=()=>{const p=restartDraft;restartDraft=null;return p&&p.account===L.state?L.go(p.route,p.params):L.go('plan');};
L.replacePlanDraft=()=>{
 const p=restartDraft,d=L.state.planDraft;if(!p||p.account!==L.state||L.route!=='planDraftRestart'||L.state.onboarded===false||L.state.locked||L.state.closed)return false;
 if(p.saved!==savedDraftMark()||p.draft!==draftContentMark(d))return fail('Your Budget or draft changed again. Keep this draft and review the latest saved Budget.'),false;
 const ids=new Set((L.state.essentials||[]).map(x=>x.id));
 if((L.state.txs||[]).some(t=>t.type==='out'&&t.status==='pending'&&ids.has(t.essentialId)))return fail('A payment linked to your Budget is pending. Wait for its result before replacing this draft.'),false;
 const guide=L.state.budgetGuideSession?.draftId;
 if(guide)for(const r of L.state.chats||[])if(r.guideDraftId===guide){for(const key of ['action','route','secondaryAction','secondaryRoute','guideChoices'])delete r[key];r.guideComplete=true;}
 L.state.planDraft=null;L.state.budgetGuideSession=null;restartDraft=null;
 for(const route of ['firstEssentials','firstPlanReview','planSetup'])L.clearFormDraft?.(route,{});
 draft().step='firstEssentials';L.save();move('firstEssentials');return true;
};
L.views.planDraftRestart=()=>`<section>${L.header('Replace this unsaved draft?')}<p>Start again from your current saved Budget. Your unsaved Budget edits will be replaced. Your conversation and payment history stay as they are.</p><p class="small muted">No money moves.</p><div id="error" role="alert" aria-live="polite"></div><div class="actions">${L.btn('Replace unsaved draft','L.replacePlanDraft()')}${L.btn('Keep my draft','L.cancelPlanDraftRestart()','secondary')}</div></section>`;
const safetyNotice=d=>{const message=L.planDraftSafety(d);return message?`<div class="notice small" role="status">${E(copy(message))}${d.savedBudgetMarkUnverified||d.savedBudgetMark!==savedDraftMark()?L.btn('Review current Budget',"L.go('planEdit')",'text-btn')+L.btn('Replace this draft','L.openPlanDraftRestart()','text-btn'):''}</div>`:'';};
L.taskSheet?.register?.('planDraftRestart',{family:'plan',treatment:'confirmation',label:'Replace Budget draft'});
const periodFields=(value,allowance,prefix)=>{
 const h=value&&['date','allowance','unspecified'].includes(value.mode)?value:{mode:'unspecified',date:''},incomeDate=allowance?.date||'',upcoming=dateOK(incomeDate)&&incomeDate>today();
 return `<div class="field plan-period-field"><label for="${prefix}Mode">${copy('How long should this plan cover?')} <span class="muted">· optional</span></label><select id="${prefix}Mode" onchange="L.changePlanPeriod()"><option value="unspecified"${h.mode==='unspecified'?' selected':''}>Not sure yet</option>${upcoming||h.mode==='allowance'?`<option value="allowance"${h.mode==='allowance'?' selected':''}${upcoming?'':' disabled'}>${upcoming?'Until expected income · '+E(dateName(incomeDate)):'Expected income date needs updating'}</option>`:''}<option value="date"${h.mode==='date'?' selected':''}>Choose a date</option></select></div>${h.mode==='date'?L.field(copy('Plan through'),''+prefix+'Date','','date',h.date).replace('<input ',`<input min="${today()}" oninput="L.capturePlanPeriod()" onchange="L.capturePlanPeriod()" `):''}${h.mode==='allowance'&&dateOK(h.date)?`<p class="tiny muted">Through ${E(dateName(h.date))}. Expected income is an estimate, not money received.</p>`:''}`;
};
const readPeriod=(prefix,allowance,previous)=>{
 const mode=raw(prefix+'Mode')||previous?.mode||'unspecified';
 return mode==='date'?{mode,date:document.getElementById(prefix+'Date')?raw(prefix+'Date'):((previous?.mode==='date')?previous.date:'')}:mode==='allowance'?{mode,date:allowance?.date||''}:{mode:'unspecified',date:''};
};
const validPeriod=value=>{
 if(value?.mode==='unspecified')return true;
 if(!dateOK(value?.date)||value.date<today()||(value.mode==='allowance'&&value.date<=today())){fail('Choose today or a future plan date, or select “Not sure yet”. Expected income must have a future date.');return false;}
 return ['date','allowance'].includes(value.mode);
};
L.capturePlanPeriod=()=>{
 if(L.route==='firstEssentials'&&L.state.planDraft){const d=draft();d.planHorizon=readPeriod('firstPlanPeriod',d.allowance,d.planHorizon);L.capturePlanDraft();}
 else if(L.route==='planPeriod'&&L.state.planPeriodDraft){L.state.planPeriodDraft=readPeriod('planPeriod',L.state.allowance,L.state.planPeriodDraft);L.save();}
};
L.changePlanPeriod=()=>{L.capturePlanPeriod();L.render();};

// Preserve unfinished fields when using Back, Help, another tab, or reloading.
L.capturePlanDraft=()=>{
 const d=L.state.planDraft;if(moving||!d||!routes.has(L.route))return;
 d.step=L.route;
 if(L.route==='planSetup'&&document.getElementById('firstAllowance'))d.allowanceFields={amount:raw('firstAllowance'),date:raw('firstDate')};
 if(L.route==='firstEssentials'&&document.getElementById('firstEssName')){d.essentialFields={name:raw('firstEssName'),amount:raw('firstEssAmount')};d.planHorizon=readPeriod('firstPlanPeriod',d.allowance,d.planHorizon);}
 if(L.route==='firstGoal'&&document.getElementById('firstGoalName'))d.goalFields={name:raw('firstGoalName'),target:raw('firstGoalTarget'),allocated:raw('firstGoalAllocation')};
 L.save();if(L.route==='firstEssentials')L.refreshFirstCostPreview?.();
};
const previousNavigate=L.beforeNavigate;
L.beforeNavigate=(...args)=>{L.capturePlanDraft();if(L.route==='planPeriod')L.capturePlanPeriod();return previousNavigate?.(...args);};

L.views.planPeriod=()=>{
 if(!L.state.planPeriodDraft)L.state.planPeriodDraft=savedHorizon();
 return L.header(copy('Give your plan a period.'),'Choose the date you’re planning through.')+periodFields(L.state.planPeriodDraft,L.state.allowance,'planPeriod')+`<p class="small muted">${copy('Essential due dates stay separate.')} This period doesn’t change your balance or move money.</p><div id="error" role="alert" aria-live="polite"></div><div class="actions">${L.btn(copy('Save plan period'),'L.savePlanPeriod()')}${L.btn('Cancel','L.cancelPlanPeriod()','text-btn')}</div>`;
};
L.savePlanPeriod=()=>{
 L.capturePlanPeriod();const h=L.state.planPeriodDraft;if(!validPeriod(h))return;
 L.state.planHorizon={...h};L.state.planPeriodDraft=null;L.save();L.go('plan');L.toast(separate()?'Budget period saved.':'Plan period saved.');
};
L.cancelPlanPeriod=()=>{L.state.planPeriodDraft=null;moving=true;try{L.go('plan');}finally{moving=false;}L.state.planPeriodDraft=null;L.save();};

L.views.planSetup=()=>{
 const d=draft();d.step='planSetup';const a=d.allowanceFields||d.allowance;
 return frame(0,'Expecting more money?','An estimate only. It counts when it arrives.',
  field('Expected amount (GH₵, optional)','firstAllowance','For example, 600','number',a.amount||'')+
  `<details class="optional-fields"${a.date?' open':''}><summary>Expected date · optional</summary>${field('Expected date','firstDate','','date',a.date||'')}</details><div class="actions">${L.btn(L.params.returnTo==='firstPlanReview'?'Keep this estimate':'Continue to costs','L.firstPlanAllowance()')}${L.btn('Not sure yet','L.firstPlanAllowance(true)','secondary')}${finishLater()}</div>`);
};
L.firstPlanAllowance=unknown=>{
 L.capturePlanDraft();const d=draft(),a=Number(L.value('firstAllowance')||0);
 if(!unknown&&!amountOK(a))return fail('Enter an amount from GH₵0.00 to GH₵1,000,000.00, with up to two decimal places.','firstAllowance');
 if(!unknown){d.allowance={amount:a,date:L.value('firstDate'),source:d.allowance.source||'Family'};d.allowanceFields={amount:raw('firstAllowance'),date:d.allowance.date};}
 L.save();move(L.params.returnTo==='firstPlanReview'?'firstPlanReview':'firstEssentials');
};
const costPreview=p=>copy(p.totalGap?`${M(p.totalGap)} of your plan still needs money.`:`${M(p.room)} left after your plan.`);
const costPeriodHelp=d=>{
 const h=horizon(d.planHorizon),name=String(d.essentialFields?.name||'This cost').trim()||'This cost';
 return h.mode==='unspecified'?'One total, not per day. Add an end date whenever you know it.':`${name}: one total through ${dateName(h.date)}, not per day.`;
};
const previewPosition=d=>{
 const name=String(d.essentialFields?.name||'').trim(),amount=Number(d.essentialFields?.amount),preview={...d,essentials:d.essentials.map(x=>({...x}))};
 if(name&&amountOK(amount,false)){
  const index=preview.essentials.findIndex(x=>x.id===d.editingEssentialId);
  if(index>=0)preview.essentials[index]={...preview.essentials[index],name,amount};
  else preview.essentials.push({id:'draft-preview',name,amount,paid:0});
 }
 return preview.essentials.length||!separate()&&preview.goals.some(g=>Number(g.allocated)>0)?costPreview(position(preview)):'Enter a cost to see what remains.';
};
L.refreshFirstCostPreview=()=>{
 if(!L.state.planDraft)return;const d=draft(),el=document.getElementById('first-cost-preview'),help=document.getElementById('first-cost-period-help');
 if(el)el.textContent=previewPosition(d);if(help)help.textContent=costPeriodHelp(d);
};
L.views.firstEssentials=()=>{
 const d=draft();d.step='firstEssentials';const p=position(d),newCost=x=>!L.state.essentials.some(saved=>saved.id===x.id);
 const added=d.essentials.length?`<div class="first-cost-list" aria-label="${copy('Costs in this plan')}">${d.essentials.filter(x=>!x.archived&&!x.deleted).map(x=>`<div class="summary-line"><span>${E(x.name)}</span><span class="inline"><strong>${M(separate()?x.amount:remaining(x))}</strong>${separate()&&remaining(x)<Number(x.amount)?`<small class="muted budget-review-remaining">${M(remaining(x))} still to cover</small>`:''}<button type="button" class="text-btn" onclick="L.firstPlanEditEssential('${E(x.id)}')" aria-label="Edit ${E(x.name)} in this draft">Edit</button>${newCost(x)?`<button type="button" class="icon-btn" onclick="L.firstPlanRemoveEssential('${E(x.id)}')" aria-label="Remove ${E(x.name)} from this draft">${L.icon('close',16)}</button>`:''}</span></div>`).join('')}</div>`:'';
 const h=d.planHorizon;
 return frame(1,'What must this money cover?','Start with one cost. You can add more.',
  safetyNotice(d)+added+`<div class="first-cost-suggestions" role="group" aria-label="Choose a cost">${['Food','Transport','Data','Other'].map(name=>L.btn(name,`L.firstPlanSelectCost('${name==='Other'?'':name}')`,'chip')).join('')}</div>`+
  field('Cost name','firstEssName','For example, Food','text',d.essentialFields?.name||'')+
  `<div class="first-cost-period">${periodFields(h,d.allowance,'firstPlanPeriod')}</div>`+
  field('Total to cover (GH₵)','firstEssAmount','0.00','number',d.essentialFields?.amount||'').replace('<input ','<input aria-describedby="first-cost-period-help" ')+
  `<p id="first-cost-period-help" class="small muted">${E(costPeriodHelp(d))}</p>`+
  `<p id="first-cost-preview" class="first-cost-preview" aria-live="polite">${previewPosition(d)}</p><div class="actions">${L.btn(copy('Review my plan'),'L.reviewFirstPlanCosts()')}${L.btn(d.editingEssentialId?'Keep this change':'Add another cost','L.firstPlanAddEssential()','secondary')}${finishLater()}</div>`);
};
L.firstPlanSelectCost=name=>{
 if(L.route!=='firstEssentials')return;L.capturePlanDraft();const d=draft(),input=document.getElementById('firstEssName');if(input)input.value=name;
 d.essentialFields={...(d.essentialFields||{}),name};L.save();L.refreshFirstCostPreview();document.getElementById(name?'firstEssAmount':'firstEssName')?.focus?.();
};
const addEssential=()=>{
 const n=L.value('firstEssName'),a=Number(L.value('firstEssAmount'));
 if(!n||n.length>80)return fail('Name this cost, such as Food.','firstEssName'),false;
 if(!amountOK(a,false))return fail('Enter an amount above zero, with up to two decimal places.','firstEssAmount'),false;
 const d=draft(),index=d.essentials.findIndex(x=>x.id===d.editingEssentialId);
 if(index>=0)d.essentials[index]={...d.essentials[index],name:n,amount:a};
 else d.essentials.push({id:L.id('ess'),name:n,amount:a,date:'',paid:0});
 d.essentialFields={name:'',amount:''};delete d.editingEssentialId;return true;
};
L.firstPlanAddEssential=()=>{
 if(L.route!=='firstEssentials')return;L.capturePlanDraft();const message=L.planDraftSafety(draft());if(message)return fail(message);if(!addEssential())return;L.save();L.render();L.toast('Cost kept. Add another or review.');document.getElementById('firstEssName')?.focus?.({preventScroll:true});
};
L.firstPlanEditEssential=id=>{
 const d=draft(),x=d.essentials.find(item=>item.id===id&&!item.archived&&!item.deleted);if(!x)return;
 const message=L.planDraftSafety(d);if(message)return fail(message);
 L.capturePlanDraft();d.editingEssentialId=id;d.essentialFields={name:L.budgetCategories?.resolve(x)?.name||x.name,amount:String(x.amount)};L.clearFormDraft?.('firstEssentials',{});L.save();move('firstEssentials');
};
L.firstPlanRemoveEssential=id=>{
 if(L.state.essentials.some(x=>x.id===id))return;L.capturePlanDraft();const d=draft();d.essentials=d.essentials.filter(x=>x.id!==id);
 if(d.editingEssentialId===id){delete d.editingEssentialId;d.essentialFields={name:'',amount:''};}L.save();L.render();L.toast('Removed from this draft.');
};
L.reviewFirstPlanCosts=()=>{
 if(L.route!=='firstEssentials')return;L.capturePlanDraft();const d=draft(),message=L.planDraftSafety(d);if(message)return fail(message);if(!validPeriod(d.planHorizon))return;
 if((L.value('firstEssName')||L.value('firstEssAmount'))&&!addEssential())return;
 if(!d.essentials.length&&(separate()||!d.goals.some(g=>Number(g.allocated)>0)))return fail('Add one cost to see what your money needs to cover.','firstEssName');
 d.essentialFields={name:'',amount:''};L.save();move('firstPlanReview');
};
// Retain the older optional-goal entry for saved links and unfinished drafts.
L.firstPlanNextGoal=()=>{
 if(separate())return L.go('goalEdit');
 L.capturePlanDraft();if(!validPeriod(draft().planHorizon))return;if((L.value('firstEssName')||L.value('firstEssAmount'))&&!addEssential())return;
 draft().essentialFields={name:'',amount:''};L.save();move('firstGoal');
};

L.views.firstGoal=()=>{
 if(separate())return `<section>${L.header('Money Boxes have their own home.','Save your budget here. Create and fund a Money Box from Savings.')}<div class="actions">${L.btn('Create a Money Box',"L.go('goalEdit')")}${L.btn('Back to budget',"L.go('firstPlanReview')",'secondary')}</div></section>`;
 const d=draft();d.step='firstGoal';const g=d.goalFields||d.goals[0]||{};
 return frame(0,'Anything you’re saving for?','A goal is optional. Your costs come first.',
  field('Goal name · optional','firstGoalName','My next laptop','text',g.name||'')+
  field('Target amount (GH₵)','firstGoalTarget','3,500','number',g.target||'')+
  `<details class="optional-fields"${Number(g.allocated)>0?' open':''}><summary>Set aside some money · optional</summary>${field('Set aside now (GH₵)','firstGoalAllocation','0','number',g.allocated||'')}<p class="tiny muted">Up to ${M(goalRoom(d))} after costs and other goals. This stays in your account.</p></details><div class="actions">${L.btn('Keep this goal','L.firstPlanGoal()')}<div class="split">${L.btn('Skip goal for now','L.firstPlanGoal(true)','text-btn')}${finishLater()}</div></div>`);
};
L.firstPlanGoal=skip=>{
 if(separate())return L.go('goalEdit');
 L.capturePlanDraft();const d=draft(),n=L.value('firstGoalName'),tRaw=L.value('firstGoalTarget'),aRaw=L.value('firstGoalAllocation'),t=Number(tRaw||0),a=Number(aRaw||0);
 if(skip||!(n||tRaw||aRaw)){
  d.goals=L.state.goals.map(g=>({...g}));d.goalFields={name:'',target:'',allocated:''};
 }else{
  if(!n||n.length>80||!amountOK(t,false)||!amountOK(a))return fail('Add a goal name and a target above zero. Use up to two decimal places; you can set aside zero for now.');
  if(a>t)return fail('Set aside up to your goal target. You can increase the target first.');
  const savedAllocation=Number(L.state.goals.find(g=>g.id===d.goals[0]?.id)?.allocated||0);
  if(a>goalRoom(d)+.001&&a>savedAllocation)return fail(`You can set aside up to ${M(goalRoom(d))} after essentials and other goals. Keep the target and set aside money later.`);
  const g={...(d.goals[0]||{}),id:d.goals[0]?.id||L.id('goal'),name:n,target:t,allocated:a};d.goals=[g,...d.goals.slice(1)];
 }
 L.save();move('firstPlanReview');
};

L.views.firstPlanReview=()=>{
 const d=draft();d.step='firstPlanReview';const p=position(d),total=Math.round(d.essentials.filter(x=>!x.archived&&!x.deleted).reduce((sum,x)=>sum+Number(x.amount||0),0)*100)/100;
 const costRows=d.essentials.filter(x=>!x.archived&&!x.deleted).map(x=>`<div class="summary-line"><span>${E(x.name)}</span><span class="inline"><strong>${M(separate()?x.amount:remaining(x))}</strong>${separate()&&remaining(x)<Number(x.amount)?`<small class="muted budget-review-remaining">${M(remaining(x))} still to cover</small>`:''}${L.btn('Edit',`L.firstPlanEditEssential('${E(x.id)}')`,'text-btn').replace('<button ',`<button aria-label="Edit ${E(x.name)} in this draft" `)}</span></div>`).join('');
 return frame(2,p.totalGap?'Here’s what still needs covering.':'Here’s what your plan leaves.','Saving a plan doesn’t move money.',
  safetyNotice(d)+`<div class="first-plan-conclusion" data-plan-preview><span>${separate()?'Total Budget':copy('Left after your plan')}</span><strong>${M(separate()?total:p.room)}</strong>${separate()?`<p class="small budget-review-room">${M(p.room)} left after this Budget.</p>`:''}<p class="plan-scope-cue" data-plan-scope>${E(L.planScopeSummary({...L.state,essentials:d.essentials,goals:candidateGoals(d)}).draftLabel)}</p>${p.totalGap?`<p class="warning">${M(p.totalGap)} still to cover. Save your costs and add money when ready.</p>`:''}</div><dl class="first-plan-math"><div><dt>${separate()?'Operational balance':'Available balance'}</dt><dd>${M(p.available)}</dd></div><div><dt>${copy('Essentials to cover')}</dt><dd>${M(p.essentialsBefore)}</dd></div>${p.allocated?`<div><dt>Set aside for goals</dt><dd>${M(p.allocated)}</dd></div>`:''}</dl><p class="first-plan-period-review small muted">${d.planHorizon.mode!=='unspecified'?`Cost totals planned through ${E(dateName(d.planHorizon.date))}.`:'No end date yet. These are cost totals, not daily amounts.'}</p><details class="optional-fields"><summary>Your costs · ${d.essentials.length}</summary>${costRows}</details><details class="optional-fields"><summary>${separate()?'Expected money · optional':'Add a goal or expected money · optional'}</summary><div class="first-plan-extras">${separate()?'':L.btn(d.goals.length?'Edit your goal':'Add a goal',"L.go('firstGoal')",'text-btn')}${L.btn(d.allowance.amount?'Edit expected money':'Expecting more money?',"L.go('planSetup',{returnTo:'firstPlanReview'})",'text-btn')}</div><p class="small muted">Expected money is excluded until it arrives.</p></details><div class="actions">${L.btn(copy('Save my plan'),'L.saveFirstPlan()')}${L.btn('Edit costs',"L.go('firstEssentials')",'secondary')}${finishLater()}</div>`);
};
L.saveFirstPlan=()=>{
 if(L.route!=='firstPlanReview'||!L.state.planDraft)return;
 const d=draft(),message=L.planDraftSafety(d);if(L.state.locked||L.state.closed)return fail('Unlock Lumo before saving your Budget.');if(message)return fail(message);position(d);const goals=candidateGoals(d),allocated=goals.reduce((a,x)=>a+Number(x.allocated||0),0);
 if(!validPeriod(d.planHorizon))return;
 if(!d.essentials.length&&!goals.some(g=>Number(g.allocated)>0))return fail('Add a cost before saving your plan.');
 if(goals.some(g=>!amountOK(Number(g.target),false)||!amountOK(Number(g.allocated||0))||Number(g.allocated||0)>Number(g.target)))return fail('Review your goal target and money set aside before saving. Your draft is kept.');
 const increased=goals.some(g=>Number(g.allocated||0)>Number(L.state.goals.find(saved=>saved.id===g.id)?.allocated||0));
 if(increased&&allocated>Math.max(0,position(d).available-unpaid(d))+.001)return fail('Your available money changed. Review the new amount set aside before saving. Your draft is kept.');
 const first=!L.hasMeaningfulPlan()&&!L.state.firstBudgetPayoff,patch=JSON.parse(JSON.stringify(d));Object.assign(L.state,{allowance:patch.allowance,essentials:patch.essentials,...(separate()?{}:{goals}),planHorizon:patch.planHorizon,planDraft:null,planSaved:true});if(first)L.state.firstBudgetPayoff={status:'ready',amount:80};L.save();move('home');L.toast(separate()?'Budget saved.':'Plan saved.');
};
L.firstPlanLeave=()=>{L.capturePlanDraft();L.save();move('home');L.toast(separate()?'Progress saved. Pick it up from Budget.':'Progress saved. Pick it up from My plan.');};
// A personal, optional projection after the first Budget. It is never a
// payment draft and cannot authorise or submit money movement.
L.firstBudgetPayoffCard=()=>{
 const marker=L.state.firstBudgetPayoff,status=L.budgetStateSummary();
 if(marker?.status!=='ready'||!status.hasBudget||status.ended)return '';
 return `<section class="home-focus-group home-money-story home-budget-payoff" data-home-focus="story" aria-label="Your Budget is ready"><button type="button" class="home-story-open" onclick="L.openFirstBudgetExample()"><span class="home-story-heading"><span class="home-story-copy"><span class="home-story-title">Your Budget is ready</span><strong class="home-story-insight">See what ${M(marker.amount)} would change.</strong></span><span class="home-story-arrow" aria-hidden="true">${L.icon('chevron',20)}</span></span></button>${L.btn('Not now','L.dismissFirstBudgetExample()','text-btn')}</section>`;
};
L.dismissFirstBudgetExample=()=>{if(L.state.firstBudgetPayoff)L.state.firstBudgetPayoff.status='dismissed';L.save();L.render();};
L.openFirstBudgetExample=()=>{
 if(!L.hasMeaningfulPlan())return L.openPlanBenefit?.();
 // Open against the visible Home state, then mark the optional example seen.
 // Closing the sheet can now refresh the retained shelf without reoffering it.
 L.go('firstBudgetExample');if(L.state.firstBudgetPayoff)L.state.firstBudgetPayoff.status='seen';L.save();
};
L.views.firstBudgetExample=()=>{
 const amount=Number(L.state.firstBudgetPayoff?.amount)||80,p=L.planImpactSummary({amount,fee:0,method:'campus',name:'Example extra purchase'}),status=L.budgetStateSummary(),comparison=L.pauseComparison?.(p)||{label:'Left after Budget',before:p.roomBefore,after:p.room};
 const compare=`<div class="first-budget-comparison"><h3>${E(comparison.label)}</h3><dl class="balance-calculation"><div><dt>Now</dt><dd>${M(comparison.before)}${Number.isFinite(comparison.requiredBefore)?`<small> of ${M(comparison.requiredBefore)} planned</small>`:''}</dd></div><div><dt>After example · projected</dt><dd>${M(comparison.after)}${Number.isFinite(comparison.requiredAfter)?`<small> of ${M(comparison.requiredAfter)} planned</small>`:''}</dd></div></dl></div>`;
 return `<section class="first-budget-example" data-plan-payoff><span class="eyebrow">Example · your saved Budget</span>${L.header('Here’s what your Budget does.')}<p class="small">Considering ${M(amount)} of <strong>extra spending</strong>, outside your saved costs.</p><h2 class="consequence-headline">${E(p.headline)}</h2><p class="small">${E(status.qualifier)}</p>${compare}<details class="optional-fields"><summary>See calculation</summary><dl class="balance-calculation"><div><dt>Available ${separate()?'Everyday money':'balance'}</dt><dd>${M(p.available)}</dd></div><div><dt>Example extra spending</dt><dd>−${M(amount)}</dd></div><div><dt>Projected balance</dt><dd>${M(p.after)}</dd></div><div><dt>Saved costs still to cover</dt><dd>${M(p.essentialsAfter)}</dd></div></dl>${p.totalGap?`<p>${M(p.totalGap)} of saved commitments would be uncovered.</p>`:''}</details><p class="preview-boundary">Example only. No payment is being made. Your balances and Budget are unchanged.</p><div class="actions">${L.btn('Got it','L.taskSheet?.active?L.closeTask():L.back()')}${L.btn('Review my Budget',"L.go('planEdit')",'text-btn')}</div></section>`;
};
})();
