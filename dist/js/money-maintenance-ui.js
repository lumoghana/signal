/** Short, reviewed updates for the student's recorded money picture. */
import {esc,cash,icon,pageHead,row,field,btn,dateLabel} from './ui.js';
import {getSummary,budgetCategoryKey} from './model.js';
import {getMoneyMaintenance,getOutsideFreshness,prepareEssentialReuse} from './money-maintenance-model.js';

const today=()=>new Date().toISOString().slice(0,10);
const after=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const key=()=>globalThis.crypto?.randomUUID?.()||`maintenance-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clone=v=>JSON.parse(JSON.stringify(v));
const money=v=>{const raw=String(v??'').trim();return /^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(raw)?Math.round(Number(raw)*100):NaN;};
const amountText=v=>Number.isSafeInteger(v)?(v/100).toFixed(2):'';
const sampleOwners=new WeakMap();let ownerSerial=0;
const actor=ctx=>{const id=ctx.shared?.user?.id||ctx.state.account?.userId||ctx.state.account?.id;if(!id&&!sampleOwners.has(ctx.state))sampleOwners.set(ctx.state,++ownerSerial);return `${id||`sample-${sampleOwners.get(ctx.state)}`}:${ctx.shared?.authVersion??''}:${ctx.state.account?.signedOut===true}`;};
const shown=(ctx,value)=>ctx.state.settings?.hideBalance?'••••.••':cash(value);
const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const labels={cash:'Cash',bank:'Bank',momo:'MoMo'};
const errors='<p class="error maintenance-error" role="alert"></p>';
const notice='<p class="maintenance-note">This updates your records. It does not move money or change your Lumo payment balance.</p>';
function error(root,message){const el=root?.querySelector('.maintenance-error');if(el)el.textContent=message;}
function heading(title,body=''){return `<div class="maintenance-sheet"><h2>${esc(title)}</h2>${body?`<p class="muted">${esc(body)}</p>`:''}`;}
function budgetStamp(s){return JSON.stringify([s.budget?.periodId||'',(s.budget?.items||[]).map(i=>[i.id,i.name,i.amount,i.spent,i.due||''])]);}
function accountById(ctx,id){return (ctx.state.externalBalances||[]).find(x=>x.id===id);}
function send(ctx,type,payload){return (ctx.actAsync||ctx.act).call(ctx,type,payload);}
function accountStamp(a){return a?{id:a.id,expectedRevision:a.revision||0,expectedUpdatedAt:a.updatedAt,expectedBalance:a.balance}:{};}
function safeCurrent(ctx,owner,root,draft={}){if(root?.isConnected===false)return false;if(actor(ctx)!==owner||draft.isCurrent&&!draft.isCurrent()){error(root,'Your money picture changed. Close this review and check again.');return false;}return true;}
function pendingForm(form,pending){for(const node of form.querySelectorAll('input,select,textarea,button[type="submit"]'))node.disabled=pending;}
export function freshnessLabel(item){if(!item)return 'Manually recorded';const d=item.confirmedAt||item.updatedAt;if(!d||!Number.isFinite(Date.parse(d)))return 'Balance needs a check';return `Checked ${new Date(d).toLocaleDateString('en-GH',{day:'numeric',month:'short',timeZone:'Africa/Accra'})}${item.stale?' · Check balance':''}`;}

export function commitmentReview(s,p={}){
 const item=(s.budget?.items||[]).find(i=>p.budgetItemId?i.id===p.budgetItemId:budgetCategoryKey(i.name)===budgetCategoryKey(p.name||''));
 if(!item)return null;
 const additional=Number.isSafeInteger(p.amount)&&p.amount>0?p.amount:0,total=Math.max(item.amount,item.spent||0)+additional,due=p.due&&(!item.due||p.due<item.due)?p.due:item.due||p.due||'';
 return {id:item.id,name:item.name,additional,total,spent:item.spent||0,remaining:Math.max(0,total-(item.spent||0)),due,earlierDue:!!item.due&&!!p.due&&item.due<p.due};
}
function commitmentImpact(ctx,p){const r=commitmentReview(ctx.state,p);return r?`<strong>Add to ${esc(r.name)}</strong><span>${shown(ctx,r.additional)} extra · new total ${shown(ctx,r.total)} · ${shown(ctx,r.spent)} already used</span>${r.due?`<span>Needed by ${esc(dateLabel(r.due))}${r.earlierDue?' · existing earlier date kept':''}</span>`:''}<small>Change the name if this is a separate cost.</small>`:'';}

export function renderMaintenanceEntry(ctx,{compact=false}={}){
 const m=getMoneyMaintenance(ctx.state),stale=m.freshness?.staleCount||0;
 return `<div class="maintenance-entry ${compact?'compact':''}">${row({emoji:icon('check',20),title:'A quick money check',sub:stale?`${stale} outside ${stale===1?'balance needs':'balances need'} a check`:m.lastCheckAt?`Last check ${dateLabel(m.lastCheckAt)}`:'Only update what has changed',action:'maintenance-check'})}</div>`;
}
export function openMoneyCheck(ctx){ctx.go({section:'life',page:'money-check'});}
export function openMoneyPreferences(ctx){ctx.go({section:'life',page:'money-preferences'});}

export function renderOutsideQuickActions(ctx,account){
 return `<div class="maintenance-quick" aria-label="Update ${esc(account.name)}"><button type="button" data-maintenance="outside-in" data-id="${esc(account.id)}">${icon('plus',16)} Received</button><button type="button" data-maintenance="outside-out" data-id="${esc(account.id)}">${icon('minus',16)} Spent</button><button type="button" data-maintenance="outside-confirm" data-id="${esc(account.id)}">Check balance</button></div>`;
}
export function renderMoneyMaintenance(ctx,route){
 const m=getMoneyMaintenance(ctx.state),fresh=getOutsideFreshness(ctx.state),outside=fresh.items||[];
 if(route.page==='money-preferences')return `<section class="page maintenance-page">${pageHead('Your Lumo, your pace')}<div class="content"><p class="lead muted">Start with what helps. Every feature remains available.</p><form id="maintenance-preferences" class="form-stack"><fieldset><legend>How would you like to start?</legend><label class="maintenance-choice"><input type="radio" name="experience" value="minimal" ${m.experience==='minimal'?'checked':''}><span><strong>Keep it simple</strong><small>Money, essentials and Lumo first. Explore more when you want.</small></span></label><label class="maintenance-choice"><input type="radio" name="experience" value="full" ${m.experience!=='minimal'?'checked':''}><span><strong>Show me the full experience</strong><small>Keep all the familiar shortcuts.</small></span></label></fieldset><label class="field"><span>A day for a short money check</span><select class="input" name="checkDay"><option value="">Whenever I choose</option>${days.map((name,i)=>`<option value="${i}" ${m.checkDay===i?'selected':''}>${name}</option>`).join('')}</select><small>Shown when you open Lumo. You can change this any time.</small></label>${errors}<button class="button" type="submit">Save my preferences</button></form><div class="section-label">More with Lumo</div><div class="panel">${row({emoji:icon('bank',20),title:'All your money',sub:'Add cash, MoMo or another bank when useful',action:'maintenance-overview'})}${row({emoji:icon('box',20),title:'Money Boxes',sub:'Give a goal its own space',action:'maintenance-boxes'})}${row({emoji:icon('users',20),title:'Money with friends',sub:'Requests, splits and collections',action:'maintenance-groups'})}</div></div></section>`;
 if(route.page!=='money-check')return null;
 const stale=outside.filter(a=>a.stale),income=ctx.state.income||{},sum=getSummary(ctx.state);
 return `<section class="page maintenance-page">${pageHead('A little money check')}<div class="content"><h1 class="large-question">What has changed?</h1><p class="muted">Keep what is right. Update what needs a second look.</p>${stale.length?`<div class="section-label">Outside balances to check</div><div class="panel">${stale.map(a=>`<div class="maintenance-account">${row({emoji:icon(a.type==='bank'?'bank':a.type==='momo'?'phone':'card',20),title:a.name,sub:freshnessLabel(a),right:shown(ctx,a.balance),action:`maintenance-confirm:${a.id}`})}<div class="maintenance-quick"><button type="button" data-maintenance="still-correct" data-id="${esc(a.id)}">Still correct</button><button type="button" data-maintenance="outside-confirm" data-id="${esc(a.id)}">Update amount</button></div></div>`).join('')}</div><p class="maintenance-note">These are manual records, separate from the ${shown(ctx,sum.available)} available in Lumo.</p>`:outside.length?'<p class="notice">Your outside balances were checked recently. Update one only if it has changed.</p>':'<p class="notice">Your Lumo money updates from confirmed activity. Add outside balances whenever they become useful.</p>'}${outside.length?btn('Update outside money','maintenance-overview',{secondary:true}):''}${income.amount>0?`<div class="section-label">Next allowance</div><div class="panel">${row({emoji:icon('calendar',20),title:income.nextDate?dateLabel(income.nextDate):'No date recorded',sub:`${shown(ctx,income.amount||0)} expected · not available yet`,right:'Change',action:'maintenance-income'})}</div>`:''}<div class="section-label">Anything coming up?</div><div class="panel">${row({emoji:icon('plus',20),title:'Add a new cost',sub:'Lab fees, printing or something else',action:'maintenance-commitment'})}${(ctx.state.budget?.items||[]).length?row({emoji:icon('repeat',20),title:'Plan for the next allowance',sub:'Reuse only the essentials you choose',action:'maintenance-reuse'}):row({emoji:icon('plan',20),title:'Give your money a plan',sub:'Start with food, transport or data',action:'maintenance-plan'})}</div>${errors}<button type="button" class="button" data-maintenance="finish-check">Finish my check</button><p class="maintenance-note">Your manual balances keep their own check dates.</p><button type="button" class="text-button" data-action="maintenance-preferences">Choose my check day</button></div></section>`;
}

/** A draft alone never writes. Fields stay editable until the explicit confirmation. */
export function openMaintenanceReview(ctx,draft={}){
 const owner=actor(ctx);
 if(draft.isCurrent&&!draft.isCurrent()){ctx.toast('Your money picture changed. Ask Lumo to check again.');return;}
 if(draft.kind==='reuseEssentialPlan')return openReusePlan(ctx,null,draft);
 if(draft.kind==='completeMoneyCheck')return openMoneyCheck(ctx);
 const kind=draft.kind,p={...(draft.payload||{})},openedRevision=getMoneyMaintenance(ctx.state).revision,openedPlanFingerprint=getMoneyMaintenance(ctx.state).planFingerprint,openedBudget=budgetStamp(ctx.state);
 if(!['externalMovement','confirmExternalBalance','saveCommitment'].includes(kind)){ctx.toast('Choose a money update to review.');return;}
 const movement=kind==='externalMovement',external=kind!=='saveCommitment',accounts=ctx.state.externalBalances||[];
 if(external&&!accounts.length){ctx.toast('Add the cash, MoMo or bank balance first, so this update has a clear starting point.');ctx.go({section:'life',page:'overview'});return;}
 const selected=p.id||p.externalBalanceId||(accounts.length===1?accounts[0].id:''),initial=accountById(ctx,selected);
 let baseline=accountStamp(initial),requestKey=p.idempotencyKey||key(),busy=false,uncertainPayload=null;
 const title=external?movement?(p.direction==='out'?'Record money spent':'Record money received'):'Check your outside balance':'Keep this cost in view';
 ctx.sheet(heading(title,external?'Review the record before saving.':'Review the amount and date, then save it in your plan.')+`<form class="form-stack maintenance-review">${external?`<label class="field"><span>Where is this money?</span><select class="input" name="outsideId" required><option value="">Choose a balance</option>${accounts.map(a=>`<option value="${esc(a.id)}" ${a.id===selected?'selected':''}>${esc(a.name)} · ${labels[a.type]||'Outside'}</option>`).join('')}</select></label><p class="maintenance-baseline muted">${initial?`Recorded balance ${shown(ctx,initial.balance)}`:'Choose the balance this update belongs to.'}</p>`:field({label:'What needs covering?',name:'commitmentName',value:p.name||'',placeholder:'Lab fees',required:true})}<label class="field"><span>${movement?'Amount (GH₵)':external?'Current balance (GH₵)':'Additional cost (GH₵)'}</span><input class="input" inputmode="decimal" name="amount" value="${esc(amountText(p.amount??p.balance??(kind==='confirmExternalBalance'?initial?.balance:undefined)))}" placeholder="0.00" autocomplete="off" required></label>${movement&&p.direction==='out'?`<label class="field"><span>Did this cover an essential?</span><select class="input" name="budgetItemId"><option value="">No plan update</option>${(ctx.state.budget?.items||[]).map(i=>`<option value="${esc(i.id)}" ${i.id===p.budgetItemId?'selected':''}>${esc(i.name)}</option>`).join('')}</select><small>Updates that essential once. Lumo money stays unchanged.</small></label>`:''}${!external?field({label:'Needed by',name:'due',type:'date',value:p.due||after(7),min:today(),required:true})+'<div class="maintenance-commitment-impact" data-commitment-impact role="status"></div>':''}${external?notice:'<p class="maintenance-note">This gives existing money a purpose. It does not make a payment or add income.</p>'}${errors}<button type="submit" class="button">${external?'Confirm record':'Save this cost'}</button><button type="button" class="button secondary" data-maintenance-cancel>Cancel</button></form></div>`,root=>{
  const form=root.querySelector('form'),select=form.querySelector('[name="outsideId"]'),submit=form.querySelector('[type="submit"]');
  if(!external){const impact=root.querySelector('[data-commitment-impact]'),update=()=>{impact.innerHTML=commitmentImpact(ctx,{...p,name:form.querySelector('[name="commitmentName"]').value,amount:money(form.querySelector('[name="amount"]').value),due:form.querySelector('[name="due"]').value});impact.hidden=!impact.innerHTML;};form.oninput=update;update();}
  if(select)select.onchange=()=>{const a=accountById(ctx,select.value);baseline=accountStamp(a);root.querySelector('.maintenance-baseline').textContent=a?`Recorded balance ${shown(ctx,a.balance)}`:'Choose the balance this update belongs to.';if(kind==='confirmExternalBalance'&&a)form.querySelector('[name="amount"]').value=amountText(a.balance);};
  root.querySelector('[data-maintenance-cancel]').onclick=()=>ctx.closeSheet();
  form.onsubmit=async event=>{
   event.preventDefault();if(busy||!safeCurrent(ctx,owner,root,uncertainPayload?{}:draft))return;
   if(!uncertainPayload&&!external&&budgetStamp(ctx.state)!==openedBudget)return error(root,'Your plan changed while this review was open. Close it and review the cost again.');
   let payload=uncertainPayload;
   if(!payload){const value=money(form.querySelector('[name="amount"]').value);if(!Number.isSafeInteger(value)||value<0||value>1000000000||(kind!=='confirmExternalBalance'&&value===0))return error(root,'Use a valid amount with up to two decimal places.');
    if(external){if(!baseline.id)return error(root,'Choose the balance to update.');payload={...baseline,idempotencyKey:requestKey,...(movement?{amount:value,direction:p.direction==='out'?'out':'in',...(form.querySelector('[name="budgetItemId"]')?.value?{budgetItemId:form.querySelector('[name="budgetItemId"]').value,expectedPlanFingerprint:openedPlanFingerprint}:{})}:{balance:value})};}
    else{const name=form.querySelector('[name="commitmentName"]').value.trim(),due=form.querySelector('[name="due"]').value;if(!name||!due||due<today())return error(root,'Give the cost a name and choose today or a future date.');payload={name,amount:value,due,recurring:false,...(p.budgetItemId?{budgetItemId:p.budgetItemId}:{}),expectedRevision:p.expectedRevision??openedRevision,expectedPlanFingerprint:p.expectedPlanFingerprint??openedPlanFingerprint,idempotencyKey:requestKey};}
   }
   busy=true;pendingForm(form,true);error(root,'');let result;try{result=await send(ctx,kind,payload);}catch{result={ok:false,unknown:true,message:'We could not confirm this update. Check it again using the same reference.'};}
   if(actor(ctx)!==owner||!root.isConnected)return;
   busy=false;
   if(!result?.ok){error(root,result?.message||'The record could not be saved.');if(result?.unknown){uncertainPayload=payload;submit.disabled=false;submit.textContent='Check this update';}else{pendingForm(form,false);requestKey=key();}return;}
   ctx.closeSheet();ctx.refresh();ctx.toast(result.message||'Your money record is up to date.');draft.onSaved?.(result,payload);
  };
 },{closeLabel:'Cancel money update'});
}

export function reuseSourceExplanation(p){
 if(!p)return '';
 const sources=Object.values(p.sources||{});
 if(!p.sources)return 'Earlier suggested amounts. Review every category; some may use sample student starting amounts.';
 if(sources.includes('sample'))return 'Includes sample student starting amounts, not a prediction from your spending. Review each amount for this new period.';
 if(sources.includes('history'))return `Earlier suggestions used ${p.transactions||'recorded'} confirmed payments${p.start&&p.end?` from ${dateLabel(p.start)} to ${dateLabel(p.end)}`:''}. These are saved amounts, not a fresh forecast. Review them for this period.`;
 return 'Based on your previously saved plan. Review the amounts for this new period.';
}

export function reusePlanPreview(s,{items,buffer,startDate,endDate}){
 const preview={...s,buffer,budget:{created:true,items:items.map((i,index)=>({...i,id:`maintenance-preview-${index}`,spent:0})),startDate,endDate}};
 const summary=getSummary(preview),essentials=items.reduce((n,i)=>n+i.amount,0);
 return {essentials,otherCommitments:Math.max(0,summary.planned-essentials),buffer,available:summary.available,left:summary.spendable,gap:Math.max(0,summary.planned+buffer-summary.available)};
}
function readReuseDraft(form,plan){
 const startDate=form.querySelector('[name="startDate"]').value,endDate=form.querySelector('[name="endDate"]').value,buffer=money(form.querySelector('[name="buffer"]').value),items=[],includeOneOffIds=[];
 if(!startDate||startDate>today()||!endDate||endDate<startDate||!Number.isSafeInteger(buffer)||buffer<0)return {error:'Check the plan dates and keep-back amount.'};
 for(const input of form.querySelectorAll('[data-reuse-id]')){if(!input.value.trim())continue;const amount=money(input.value),old=plan.items.find(i=>i.id===input.dataset.reuseId);if(!Number.isSafeInteger(amount)||amount<=0)return {error:'Use a valid amount for each selected essential.'};items.push({...old,amount,spent:0,due:''});}
 for(const checkbox of form.querySelectorAll('[data-include-id]'))if(checkbox.checked){const id=checkbox.dataset.includeId,old=plan.oneOffItems.find(i=>i.id===id),amount=money([...form.querySelectorAll('[data-oneoff-id]')].find(n=>n.dataset.oneoffId===id)?.value),due=[...form.querySelectorAll('[name]')].find(n=>n.name===`due-${id}`)?.value||'';if(!Number.isSafeInteger(amount)||amount<=0||due&&(due<startDate||due>endDate))return {error:'Check the selected one-off amount and its date within this plan.'};includeOneOffIds.push(id);items.push({...old,amount,spent:0,due});}
 return {startDate,endDate,buffer,items,includeOneOffIds};
}

export function excludedReuseCosts(source,plan,{startDate=plan.startDate,endDate=plan.endDate,includeOneOffIds=[]}={}){
 const included=new Set(includeOneOffIds),excluded=(plan.oneOffItems||[]).filter(i=>!included.has(i.sourceId||i.id)),original=source?.items||[];
 const due=excluded.map(i=>original.find(old=>old.id===(i.sourceId||i.id))||i).filter(i=>i.due&&i.due>=startDate&&i.due<=endDate&&i.amount>(i.spent||0));
 return {count:excluded.length,due};
}
function excludedCostCopy(source,plan,values){
 const review=excludedReuseCosts(source,plan,values);if(!review.count)return '';
 const names=review.due.slice(0,3).map(i=>`${esc(i.name)} (${esc(dateLabel(i.due))})`).join(', '),extra=review.due.length>3?` and ${review.due.length-3} more`:'';
 const dueLine=review.due.length?`<span>Still due in this period: ${names}${extra}.</span>`:'';
 return `<strong>${review.count} previous ${review.count===1?'cost stays':'costs stay'} out.</strong><span>Check any you still need.</span>${dueLine}`;
}

export function openReusePlan(ctx,source=null,draft={}){
 const owner=actor(ctx),prepared=prepareEssentialReuse(ctx.state,{startDate:today(),...(source?{sourcePeriodId:source.periodId}:{})});
 if(!prepared.ok){ctx.toast(prepared.message||'Choose essentials to reuse first.');ctx.go({section:'plan',page:'home'});return;}
 const plan={...clone(prepared),...(draft.payload||{})},sourcePlan=source||(ctx.state.budget?.periodId===plan.sourcePeriodId?ctx.state.budget:(ctx.state.budgetHistory||[]).find(p=>p.periodId===plan.sourcePeriodId))||ctx.state.budget;let busy=false,requestKey=key(),uncertain=null;
 ctx.sheet(heading('Same essentials, fresh plan?','Keep the amounts that fit. Previous spending stays in the previous period.')+`<form class="form-stack maintenance-reuse">${sourcePlan?.provenance?`<p class="maintenance-note">${esc(reuseSourceExplanation(sourcePlan.provenance))}</p>`:''}${field({label:'Starts',name:'startDate',type:'date',value:plan.startDate||today(),max:today(),required:true})}${field({label:'Covers me until',name:'endDate',type:'date',value:plan.endDate||prepared.endDate,min:today(),required:true})}<div class="section-label">Repeating essentials</div>${(plan.items||[]).length?(plan.items||[]).map(i=>`<label class="field"><span>${esc(i.name)}</span><input class="input" inputmode="decimal" data-reuse-id="${esc(i.id)}" value="${amountText(i.amount)}" aria-label="${esc(i.name)} amount in cedis"><small>GH₵ · leave blank to skip this time</small>${i.oneOffExtra>0?`<small>${shown(ctx,i.oneOffExtra)} extra from the previous period stays out. Edit if needed.</small>`:''}</label>`).join(''):'<p class="muted">No essentials are marked to repeat yet. You can choose a previous cost below, or set repeats in your plan.</p>'}${(plan.oneOffItems||[]).length?`<div class="maintenance-excluded-notice" data-excluded-notice role="status">${excludedCostCopy(sourcePlan,plan,{})}</div><details class="maintenance-oneoffs"><summary>Choose from ${plan.oneOffItems.length} previous ${plan.oneOffItems.length===1?'cost':'costs'}</summary><p class="muted">They stay out unless you select them. Set a new date where needed.</p>${plan.oneOffItems.map(i=>`<div class="maintenance-oneoff"><label><input type="checkbox" data-include-id="${esc(i.id)}"> ${esc(i.name)}</label><label class="field"><span>Amount (GH₵)</span><input class="input" data-oneoff-id="${esc(i.id)}" inputmode="decimal" value="${amountText(i.amount)}"></label>${field({label:'New due date',name:`due-${i.id}`,type:'date',value:'',min:today()})}</div>`).join('')}</details>`:''}${field({label:'Keep-back (GH₵)',name:'buffer',value:amountText(plan.buffer??ctx.state.buffer??0),type:'text'})}<div class="maintenance-reuse-preview" data-reuse-preview role="status"></div><p class="maintenance-note">Money you owe stays included separately where due. A new period resets used amounts in the new plan only.</p>${errors}<button class="button" type="submit">Start this reviewed plan</button><button type="button" class="button secondary" data-maintenance-cancel>Cancel</button></form></div>`,root=>{
  const form=root.querySelector('form'),submit=form.querySelector('[type="submit"]');root.querySelector('[data-maintenance-cancel]').onclick=()=>ctx.closeSheet();
  const updatePreview=()=>{const excludedNotice=root.querySelector('[data-excluded-notice]');if(excludedNotice){const selected=[...form.querySelectorAll('[data-include-id]')].filter(n=>n.checked).map(n=>n.dataset.includeId);excludedNotice.innerHTML=excludedCostCopy(sourcePlan,plan,{startDate:form.querySelector('[name="startDate"]').value,endDate:form.querySelector('[name="endDate"]').value,includeOneOffIds:selected});excludedNotice.hidden=!excludedNotice.innerHTML;}const values=readReuseDraft(form,plan),preview=root.querySelector('[data-reuse-preview]');if(values.error||!values.items.length){preview.innerHTML='<p class="muted">Select essentials and check the dates to see the new plan.</p>';return;}const picture=reusePlanPreview(ctx.state,values);preview.innerHTML=`<strong>Your reviewed plan</strong><span>Essentials ${shown(ctx,picture.essentials)}</span>${picture.otherCommitments?`<span>Other due commitments ${shown(ctx,picture.otherCommitments)}</span>`:''}<span>Keep-back ${shown(ctx,picture.buffer)}</span><span>Left in Lumo after plan ${shown(ctx,picture.left)}</span>${picture.gap?`<small>This plan needs ${shown(ctx,picture.gap)} more than is available.</small>`:''}`;};form.oninput=updatePreview;form.onchange=updatePreview;updatePreview();
  form.onsubmit=async e=>{
   e.preventDefault();if(busy||!safeCurrent(ctx,owner,root,uncertain?{}:draft))return;let payload=uncertain;
   if(!payload){const reviewed=readReuseDraft(form,plan);if(reviewed.error)return error(root,reviewed.error);if(!reviewed.items.length)return error(root,'Select at least one essential for this period.');payload={sourcePeriodId:plan.sourcePeriodId,sourceFingerprint:plan.sourceFingerprint,expectedRevision:plan.expectedRevision,...reviewed,items:reviewed.items.map(i=>({id:i.id,sourceId:i.sourceId||i.id,name:i.name,emoji:i.emoji,amount:i.amount,due:i.due||''})),idempotencyKey:requestKey};}

   busy=true;pendingForm(form,true);error(root,'');let result;try{result=await send(ctx,'reuseEssentialPlan',payload);}catch{result={ok:false,unknown:true,message:'We could not confirm this plan. Check the same update again.'};}
   if(actor(ctx)!==owner||!root.isConnected)return;busy=false;if(!result?.ok){error(root,result?.message||'The plan could not be saved.');if(result?.unknown){uncertain=payload;submit.disabled=false;submit.textContent='Check this plan';}else{pendingForm(form,false);requestKey=key();}return;}ctx.closeSheet();ctx.go({section:'plan',page:'home'});ctx.toast(result.message||'Your fresh plan is ready.');
  };
 },{closeLabel:'Cancel fresh plan'});
}

function openExpectedIncome(ctx){
 const owner=actor(ctx),income=ctx.state.income||{},incomeStamp=JSON.stringify([income.amount,income.nextDate]),requestKey=key();let busy=false;
 ctx.sheet(heading('Has your next allowance changed?','It stays expected until money actually arrives.')+`<form class="form-stack">${field({label:'Expected amount (GH₵)',name:'amount',value:amountText(income.amount||0),required:true})}${field({label:'Expected date',name:'date',type:'date',value:income.nextDate||after(7),required:true})}${errors}<button class="button" type="submit">Update expectation</button></form></div>`,root=>{const form=root.querySelector('form');form.onsubmit=async e=>{e.preventDefault();if(busy||!safeCurrent(ctx,owner,root))return;if(JSON.stringify([ctx.state.income?.amount,ctx.state.income?.nextDate])!==incomeStamp)return error(root,'Your expected income changed. Close this review and check the latest record.');const amount=money(form.querySelector('[name="amount"]').value),date=form.querySelector('[name="date"]').value;if(!Number.isSafeInteger(amount)||amount<0||!date)return error(root,'Check the expected amount and date.');busy=true;pendingForm(form,true);let r;try{r=await send(ctx,'setExpectedIncome',{amount,date,idempotencyKey:requestKey});}catch{r={ok:false,message:'Could not confirm the expectation. Try again.'};}if(actor(ctx)!==owner||!root.isConnected)return;busy=false;if(!r?.ok){pendingForm(form,false);error(root,r?.message||'Could not update the expectation.');return;}ctx.closeSheet();ctx.refresh();ctx.toast('Expected income updated. Your available money is unchanged.');};},{closeLabel:'Cancel expectation update'});
}

export function bindMaintenanceEntries(ctx,scope=null){
 const root=scope||ctx.$?.('.maintenance-page')||globalThis.document?.querySelector('#view');if(!root)return()=>{};const nodes=[...root.querySelectorAll('[data-maintenance],[data-action^="maintenance-"]')],clean=[],boundOwner=actor(ctx);
 for(const node of nodes){const initialAction=node.dataset.maintenance||node.dataset.action?.slice(12),displayed=initialAction==='still-correct'?accountById(ctx,node.dataset.id):null,displayedConfirmation=displayed?{...accountStamp(displayed),balance:displayed.balance,idempotencyKey:key()}:null;let confirmPayload=displayedConfirmation;const handler=async()=>{if(node.isConnected===false||actor(ctx)!==boundOwner)return;const action=node.dataset.maintenance||node.dataset.action?.slice(12),id=node.dataset.id;
  if(action==='check')return openMoneyCheck(ctx);if(action==='preferences')return openMoneyPreferences(ctx);if(action==='overview')return ctx.go({section:'life',page:'overview'});if(action==='plan')return ctx.go({section:'plan',page:'home'});if(action==='boxes')return ctx.go({section:'boxes',page:'home'});if(action==='groups')return ctx.go({section:'life',page:'groups'});if(action==='reuse')return openReusePlan(ctx);if(action==='commitment')return openMaintenanceReview(ctx,{kind:'saveCommitment',payload:{}});if(action==='income')return openExpectedIncome(ctx);
  if(action?.startsWith('confirm:'))return openMaintenanceReview(ctx,{kind:'confirmExternalBalance',payload:{id:action.slice(8)}});
  if(['outside-in','outside-out','outside-confirm'].includes(action))return openMaintenanceReview(ctx,{kind:action==='outside-confirm'?'confirmExternalBalance':'externalMovement',payload:{id,direction:action==='outside-out'?'out':'in'}});
  if(action==='still-correct'){if(node.disabled)return;const a=accountById(ctx,id);if(!a)return;const owner=actor(ctx);confirmPayload||=displayedConfirmation||{...accountStamp(a),balance:a.balance,idempotencyKey:key()};node.disabled=true;let r;try{r=await send(ctx,'confirmExternalBalance',confirmPayload);}catch{r={ok:false,unknown:true,message:'Could not confirm the balance check. Check the same update again.'};}if(actor(ctx)!==owner||!node.isConnected)return;if(!r?.ok){node.disabled=false;if(r.unknown){node.textContent='Check this update';error(root,r.message||'Could not save the balance check.');}else{ctx.refresh();ctx.toast(r.message||'Review the latest recorded balance before checking it again.');}return;}ctx.refresh();ctx.toast('Recorded balance checked. Your Lumo money is unchanged.');return;}
  if(action==='finish-check'){if(node.disabled)return;const owner=actor(ctx),requestKey=node.dataset.requestKey||(node.dataset.requestKey=key());node.disabled=true;let r;try{r=await send(ctx,'completeMoneyCheck',{idempotencyKey:requestKey});}catch{r={ok:false,message:'Could not confirm your check. Try again.'};}if(actor(ctx)!==owner||!node.isConnected)return;if(!r?.ok){node.disabled=false;error(root,r?.message||'Could not finish your check.');return;}ctx.go({section:'home',page:'home'});ctx.toast('Money check finished. Your next step is a little clearer.');}
 };node.addEventListener('click',handler);clean.push(()=>node.removeEventListener('click',handler));}return()=>clean.forEach(f=>f());
}
export function bindMoneyMaintenance(ctx,route){
 if(!['money-check','money-preferences'].includes(route.page))return null;const root=ctx.$?.('.maintenance-page')||document.querySelector('.maintenance-page'),cleanup=bindMaintenanceEntries(ctx,root),form=root?.querySelector('#maintenance-preferences');
 if(form){const owner=actor(ctx),requestKey=key();let busy=false;const handler=async e=>{e.preventDefault();if(busy||!safeCurrent(ctx,owner,root))return;const experience=form.querySelector('[name="experience"]:checked')?.value||'full',day=form.querySelector('[name="checkDay"]').value;busy=true;pendingForm(form,true);let r;try{r=await send(ctx,'setMaintenancePreferences',{experience,checkDay:day===''?null:Number(day),idempotencyKey:requestKey});}catch{r={ok:false,message:'Could not save preferences. Try again.'};}if(actor(ctx)!==owner||!root.isConnected)return;busy=false;if(!r?.ok){pendingForm(form,false);return error(root,r?.message||'Could not save preferences.');}ctx.refresh();ctx.toast('Your Lumo preferences are saved.');};form.addEventListener('submit',handler);return()=>{cleanup();form.removeEventListener('submit',handler);};}return cleanup;
}
