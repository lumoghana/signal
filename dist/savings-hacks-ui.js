/* Optional per-box sample saving, kept inside the existing Money Box journey. */
(()=>{
'use strict';
const E=L.e,M=L.money,B=L.btn,J=JSON.stringify,H=()=>L.savingsHacks;
const box=id=>(L.state.goals||[]).find(g=>g.id===id);
const attached=r=>r&&r.kind!=='manual'&&!r.cancelledAt&&r.stoppedReason!=='cancelled';
const key=g=>g?.id||'new';
const tomorrow=()=>new Date(Date.now()+86400000).toISOString().slice(0,10);
const defaults=kind=>({kind,value:kind==='income'?10:kind==='fixed'?10:kind==='roundup'?1:5,cadence:'weekly',startDate:tomorrow(),monthlyCap:100,minBalance:50});
const setup=()=>{
 let s=L.state.savingsHackSetup;
 if(!s||typeof s!=='object'||s.version!==1||!s.drafts||typeof s.drafts!=='object'||Array.isArray(s.drafts))s=L.state.savingsHackSetup={version:1,drafts:{}};
 return s;
};
function draftFor(g){
 const s=setup(),id=key(g);if(s.drafts[id])return s.drafts[id];
 const r=g?.id?H()?.get(g.id):null,d=attached(r)?{...defaults(r.kind),...r,kind:r.enabled?r.kind:'paused',pausedKind:r.kind}:{...defaults('manual')};
 d.values={};d.consent=false;s.drafts[id]=d;return d;
}
const current=()=>box(L.params.id)||L.state.moneyBoxDraft||{};
const val=(id,fallback)=>document.getElementById(id)?.value??fallback;
function read(g,kind){
 const d=draftFor(g),k=kind||val('sh-kind',d.kind);
 return {...d,kind:k,value:val('sh-value',d.value),cadence:val('sh-cadence',d.cadence),startDate:val('sh-start',d.startDate),monthlyCap:val('sh-cap',d.monthlyCap),minBalance:val('sh-buffer',d.minBalance),consent:!!document.getElementById('sh-consent')?.checked};
}
function remember(g=current(),kind){
 if(L.route!=='goalEdit')return;
 const d=read(g,kind);d.consent=false;setup().drafts[key(g)]=d;
 if(!g.id)L.state.moneyBoxDraft={...(L.state.moneyBoxDraft||{}),name:val('goalName',g.name||''),target:val('goalTarget',g.target||''),date:val('goalDate',g.date||'')};
 return d;
}
const option=(value,label,selected)=>`<option value="${value}" ${selected===value?'selected':''}>${E(label)}</option>`;
function numeric(label,id,value,min,max,suffix=''){
 return `<label class="field" for="${id}"><span>${E(label)}</span><div class="sh-input-unit"><input class="input" id="${id}" type="number" inputmode="decimal" min="${min}" max="${max}" step="0.01" value="${E(value)}" aria-describedby="error">${suffix?`<span>${E(suffix)}</span>`:''}</div></label>`;
}
function example(d){
 const v=Number(d.value)||0;
 if(d.kind==='paused')return 'Your saved hack is paused. Choose a method to change it, or resume it from this box.';
 if(d.kind==='income')return `${M(300)} arrives → ${M(300*v/100)} goes into this box.`;
 if(d.kind==='spend')return `Spend ${M(40)} + save ${M(40*v/100)} = ${M(40+40*v/100)} from Everyday Money.`;
 if(d.kind==='roundup'){const n=[1,5,10].includes(v)?v:1,a=Math.round((Math.ceil(23.4/n)*n-23.4)*100)/100;return `Pay ${M(23.4)} + save ${M(a)} = ${M(23.4+a)} from Everyday Money. Exact multiples save ${M(0)}.`;}
 return `${M(v)} ${d.cadence||'weekly'}, starting on your chosen date at 9 am Ghana time.`;
}
const limitsLabel=d=>`Limits: ${M(Number(d.monthlyCap)||0)}/month · keep ${M(Number(d.minBalance)||0)}`;
function limits(d){return `<details class="sh-limits"><summary id="sh-limits-summary">${E(limitsLabel(d))}</summary>${numeric('Monthly saving limit (GH₵)','sh-cap',d.monthlyCap,.01,5000)}${numeric('Keep in Everyday Money (GH₵)','sh-buffer',d.minBalance,0,1000000)}<p class="sh-help">Budget protection is always on. Savings stop at your target. Roundups can feed one box at a time.</p></details>`;}
function config(d,saved){
 if(d.kind==='manual')return '<p class="sh-help">Fund this box whenever you choose.</p>';
 if(d.kind==='paused')return `<p class="sh-help">${E(example(d))}</p>`;
 let fields='';
 if(d.kind==='roundup')fields=`<label class="field" for="sh-value"><span>Round payments up to</span><select class="input" id="sh-value">${[1,5,10].map(v=>option(String(v),M(v),String(d.value))).join('')}</select></label>`;
 else if(d.kind==='fixed')fields=numeric('Amount to save (GH₵)','sh-value',d.value,.01,5000)+`<div class="sh-grid"><label class="field" for="sh-cadence"><span>How often</span><select class="input" id="sh-cadence">${['daily','weekly','monthly'].map(c=>option(c,c[0].toUpperCase()+c.slice(1),d.cadence)).join('')}</select></label><label class="field" for="sh-start"><span>First saving date</span><input class="input" id="sh-start" type="date" value="${E(d.startDate)}" aria-describedby="error"></label></div>`;
 else fields=numeric(d.kind==='income'?'Share of money arriving':'Share of spending','sh-value',d.value,.01,100,'%');
 const changed=attached(saved)&&saved.enabled?'new or changed ':'';
 return fields+`<p class="sh-example" id="sh-example" aria-live="polite">${E(example(d))}</p>`+limits(d)+`<label class="sh-consent" for="sh-consent"><input id="sh-consent" type="checkbox"><span>Allow this ${changed}hack to move sample money from Everyday Money into this box within my limits.</span></label><p class="sh-sample-note">Sample automation only. No bank instruction is created.${d.kind==='fixed'?' Schedule checks run while this preview is open.':''}</p>`;
}
L.moneyBoxSavingsHackFields=g=>{
 const d=draftFor(g),saved=g?.id?H()?.get(g.id):null;
 return `<section class="savings-hack-fields" aria-label="Optional Savings hack"><div class="sh-heading"><h2>Savings hack</h2><span>Optional</span></div><label class="field" for="sh-kind"><span class="sr-only">Choose a savings hack</span><select class="input" id="sh-kind">${option('manual','Save manually',d.kind)}${option('income','Save when money arrives',d.kind)}${option('roundup','Round up payments',d.kind)}${option('spend','Percentage of spending',d.kind)}${option('fixed','Fixed amount on a schedule',d.kind)}${attached(saved)&&!saved.enabled?option('paused','Keep current hack paused',d.kind):''}</select></label>${attached(saved)&&saved.enabled?'<p class="sh-help sh-edit-status">Your current hack stays on. Choose Save manually and save changes to switch it off. Confirm below only for a new or changed hack.</p>':''}<div id="sh-config">${config(d,saved)}</div></section>`;
};
const same=(r,d)=>r.kind===d.kind&&Number(r.value)===Number(d.value)&&Number(r.monthlyCap)===Number(d.monthlyCap)&&Number(r.minBalance)===Number(d.minBalance)&&(r.kind!=='fixed'||r.cadence===d.cadence&&r.startDate===d.startDate);
L.captureMoneyBoxSavingsHack=g=>{
 if(!document.getElementById('sh-kind')||!H())return undefined;
 const input=read(g),saved=g?.id?H().get(g.id):null;remember(g);
 if(input.kind==='paused'&&attached(saved)&&!saved.enabled)return {unchanged:true};
 if(input.kind==='manual'&&!attached(saved))return {unchanged:true};
 if(attached(saved)&&saved.enabled&&same(saved,input))return {unchanged:true};
 const checked=H().validate(input,{boxId:g?.id,requireBox:false});
 if(!checked.ok){L.error(checked.message,checked.field);return false;}
 if(input.kind!=='manual'&&!input.consent){L.error('Confirm this automatic saving instruction, or choose Save manually.','sh-consent');return false;}
 return {...checked.config,consent:input.kind==='manual'?false:input.consent};
};
L.finishMoneyBoxSavingsHackSave=(g,hack,updating)=>{
 if(hack&&!hack.unchanged){const result=H().configure({...hack,boxId:g.id});if(!result.ok){L.error(result.message,result.field);return false;}}
 delete setup().drafts[updating?g.id:'new'];L.clearFormDraft?.('goalEdit',updating?{id:g.id}:{});return true;
};
function changed(event){
 if(L.route!=='goalEdit'||!event.target?.id)return;
 const id=event.target.id,g=current();
 if(id==='sh-kind'){
  if(event.type!=='change')return;
  const old=draftFor(g),kind=event.target.value,prior=remember(g,old.kind);
  prior.values={...(prior.values||{}),[old.kind]:{value:prior.value,cadence:prior.cadence,startDate:prior.startDate}};
  const next={...prior,...defaults(kind),monthlyCap:prior.monthlyCap,minBalance:prior.minBalance,...prior.values[kind],values:prior.values,kind,consent:false};
  setup().drafts[key(g)]=next;const region=document.getElementById('sh-config');if(region)region.innerHTML=config(next,g.id?H().get(g.id):null);return;
 }
 if(!id.startsWith('sh-')&&!['goalName','goalTarget','goalDate','goalProtect','goalPartner'].includes(id))return;
 if(id.startsWith('sh-')&&id!=='sh-consent'){const c=document.getElementById('sh-consent');if(c)c.checked=false;}
 const d=remember(g),node=document.getElementById('sh-example'),limit=document.getElementById('sh-limits-summary');if(node)node.textContent=example(d);if(limit)limit.textContent=limitsLabel(d);
}
document.addEventListener('input',changed);document.addEventListener('change',changed);
const capture=L.captureFormDraft;
L.captureFormDraft=function(){
 if(L.route==='goalEdit')remember();
 const c=L.route==='goalEdit'?document.getElementById('sh-consent'):null,checked=c?.checked;if(c)c.checked=false;
 try{return capture?.apply(this,arguments);}finally{if(c)c.checked=checked;}
};
const restore=L.restoreFormDraft;
L.restoreFormDraft=function(){
 const result=restore?.apply(this,arguments);if(L.route!=='goalEdit')return result;
 const g=current(),d=draftFor(g),select=document.getElementById('sh-kind'),region=document.getElementById('sh-config');
 if(select)select.value=d.kind;if(region)region.innerHTML=config(d,g.id?H().get(g.id):null);return result;
};
let cancelBox='';
const reason=r=>({'monthly-cap':'Monthly limit reached','budget-or-buffer':'Budget or balance buffer protected','target-reached':'Target reached','no-change':'No roundup needed','box-unavailable':'Box unavailable','transfer-unavailable':'Transfer unavailable','balance-unavailable':'Balance unavailable','instruction-changed':'Instruction changed','instruction-unavailable':'Instruction unavailable','instruction-invalid':'Instruction unavailable'}[r]||'Limits protected');
const shortMethod=r=>r.kind==='income'?'Income · '+Number(r.value)+'%':r.kind==='spend'?'Spending · '+Number(r.value)+'%':r.kind==='roundup'?'Roundups · '+M(r.value):(r.cadence==='daily'?'Daily':r.cadence==='monthly'?'Monthly':'Weekly')+' · '+M(r.value);
function activity(id){
 const rows=H()?.history(id)?.slice(0,3)||[];if(!rows.length)return '';
 return `<details class="sh-history"><summary>Recent saving activity</summary><ul>${rows.map(e=>`<li><div><strong>${e.status==='cancelled'?'Savings hack cancelled':e.status==='saved'?'Saved automatically':'Saving skipped'}</strong><span>${e.status==='cancelled'?'No money moved':e.status==='saved'?M(e.amount):E(reason(e.reason))}</span></div><time datetime="${E(e.date)}">${E(new Date(e.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'}))}</time></li>`).join('')}</ul></details>`;
}
L.moneyBoxSavingsHackActions=g=>{
 if(g.archived)return '';
 const r=H()?.get(g.id),has=attached(r),confirm=has&&cancelBox===g.id;
 if(!has)return `<section class="savings-hack-status sh-priority-control" aria-label="Savings hack">${B('Add savings hack',`L.savingsHackUI.edit(${J(g.id)})`,'secondary')}</section>`;
 return `<section class="savings-hack-status sh-priority-control" aria-label="Savings hack"><div class="sh-heading"><h2>Savings hack</h2><span class="sh-status">${r.enabled?'On':r.stoppedReason==='target'?'Target reached':'Paused'}</span></div><span class="sh-help sh-method">${E(shortMethod(r))}</span><div class="sh-actions">${B('Edit',`L.savingsHackUI.edit(${J(g.id)})`,'text-btn')}${r.enabled?B('Pause',`L.savingsHackUI.pause(${J(g.id)})`,'text-btn'):r.stoppedReason==='target'?B('Edit target',`L.savingsHackUI.editTarget(${J(g.id)})`,'text-btn'):B('Resume hack',`L.savingsHackUI.resume(${J(g.id)})`,'text-btn')}${!confirm?B('Cancel hack',`L.savingsHackUI.requestCancel(${J(g.id)})`,'text-btn'):''}</div>${confirm?`<div class="sh-cancel-confirm" role="group" aria-label="Cancel savings hack"><p>Stop automatic saving? This Money Box and its saved money stay unchanged.</p><div class="sh-actions">${B('Keep hack',`L.savingsHackUI.keepHack(${J(g.id)})`,'secondary')}${B('Cancel hack',`L.savingsHackUI.confirmCancel(${J(g.id)})`,'text-btn')}</div></div>`:''}</section>`;
};
L.moneyBoxSavingsHackStatus=L.moneyBoxSavingsHackActions;
L.moneyBoxSavingsHackDetails=g=>{
 const r=H()?.get(g.id),has=attached(r),recent=activity(g.id);
 if(!has&&!recent)return '';
 return `<section class="savings-hack-details" aria-label="Savings hack details">${has?`<details class="sh-info"><summary>How this Savings hack works</summary><p class="sh-description">${E(H().describe(r))}</p><p class="sh-help sh-saved-limits">${E(limitsLabel(r))} · Budget protected</p></details>`:''}${recent}</section>`;
};
const goalView=L.views.goal;
L.views.goal=()=>{const html=goalView(),g=box(L.params.id);return g?html+L.moneyBoxSavingsHackDetails(g):html;};
 const action=(id,fn,message)=>{if(L.route!=='goal'||L.params.id!==id)return;const result=fn();if(!result?.ok)return L.error(result?.message||'Please try again.');cancelBox='';delete setup().drafts[id];L.render();L.toast(typeof message==='function'?message(result.rule):message);};
L.savingsHackUI={
 cancel(){const g=current();delete setup().drafts[key(g)];if(!g.id)delete L.state.moneyBoxDraft;L.clearFormDraft?.();L.skipFormCapture=true;try{L.go(g.id?'goal':'goals',g.id?{id:g.id}:{});}finally{L.skipFormCapture=false;}},
 edit(id){if(!box(id)||box(id).archived)return;cancelBox='';L.go('goalEdit',{id});setTimeout(()=>{if(L.route!=='goalEdit'||L.params.id!==id)return;const field=document.getElementById('sh-kind');field?.closest?.('.savings-hack-fields')?.scrollIntoView?.({block:'start',behavior:'auto'});field?.focus?.({preventScroll:true});},0);},
 pause(id){return action(id,()=>H().pause(id),'Savings hack paused.');},
 resume(id){return action(id,()=>H().resume(id,{consent:true}),r=>r?.enabled?'Savings hack resumed within your saved limits.':r?.stoppedReason==='target'?'Target reached. Edit your target to save more.':'Savings hack stays paused. Review its saved limits.');},
 editTarget(id,field='goalTarget'){if(!box(id)||box(id).archived)return;L.go('goalEdit',{id});setTimeout(()=>{if(L.route!=='goalEdit'||L.params.id!==id)return;document.getElementById(field==='goalDate'?'goalDate':'goalTarget')?.focus?.({preventScroll:false});},0);},
 requestCancel(id){if(L.route!=='goal'||L.params.id!==id||!attached(H().get(id)))return;cancelBox=id;L.render();},
 keepHack(id){if(cancelBox!==id)return;cancelBox='';L.render();},
 confirmCancel(id){if(cancelBox!==id)return;return action(id,()=>H().cancel(id),'Savings hack cancelled. Your saved money stays in this box.');}
};
 L.moneyBoxSavingsHackOverviewLink=()=>{const z=H()?.overview?.();return z?.available&&z.total?B('Savings hacks · '+z.active+' on',"L.go('savingsHackOverview')",'secondary sh-overview-entry'):'';};
 L.views.savingsHackOverview=()=>{
  const z=H()?.overview?.();if(!z?.available)return '';
  const date=value=>new Date(value).toLocaleDateString('en-GH',{timeZone:'Africa/Accra',day:'numeric',month:'short',year:'numeric'});
  return `<section class="savings-hack-overview">${L.header('Your Savings hacks',`${z.active} on · ${z.total} configured`)}${z.rules.length?`<p class="small muted">Your saved rules work together. ${z.spendPercent?`${z.spendPercent}% of eligible spending. `:''}${z.incomePercent?`${z.incomePercent}% of eligible money arriving. `:''}Each rule keeps its own limits.</p>${z.rules.map(r=>`<article class="sh-overview-rule"><div class="sh-heading"><h2>${E(r.name)}</h2><span>${E(r.status)}</span></div><p>${E(r.description)}</p><p class="small muted">${M(r.savedThisMonth)} saved this month · ${M(r.monthlyCap)} limit</p>${r.enabled&&r.nextRunAt?`<p class="small muted">Next scheduled check: ${E(date(r.nextRunAt))}, 9 am Ghana time.</p>`:''}${r.last?.status==='skipped'?`<p class="small muted">Last saving skipped: ${E(reason(r.last.reason))}.</p>`:''}${B('Manage this hack',`L.go('goal',{id:${J(r.boxId)}})`,'secondary')}</article>`).join('')}<details><summary>How rules work together</summary><p class="small muted">Rules are checked in the order you set them up. Earlier rules may use some of the available headroom. Your Budget, balance buffer, monthly limits and targets stay protected. Percentage rules on different boxes add together; only one box can use roundups at a time.</p><p class="small muted">Sample automation only. Scheduled checks run while this preview is open; no bank instruction is created.</p></details>`:'<p>No Savings hacks are set up yet. Add one from a Money Box whenever you are ready.</p>'}<div class="actions">${B('Back to Money Boxes',"L.go('goals')",'secondary')}</div></section>`;
 };
 L.taskSheet?.register('savingsHackOverview',{family:'plan',treatment:'detail',label:'Savings hacks'});
 for(const route of ['bankAdd','momoAdd']){
  const original=L.views[route];if(!original)continue;
  L.views[route]=function(...args){const html=original.apply(this,args),id=route==='bankAdd'?L.state.bankFunding?.txId:L.state.fundingDraft?.txId,extra=L.paymentBudgetResult?.savingMarkup?.(id);return extra&&!html.includes('data-payment-saving-result')?html+extra:html;};
 }
let refreshQueued=false;
window.addEventListener('lumo:savings-hack-due',event=>{
 if(event.detail?.trigger!=='due'||!event.detail?.records?.some(r=>r.status==='saved')||refreshQueued)return;
 refreshQueued=true;setTimeout(()=>{
  refreshQueued=false;if(!L.state.onboarded||L.state.locked||L.state.closed||!['home','goal','goals','plan','balances'].includes(L.route))return;
  const focused=document.activeElement;if(focused?.matches?.('input,select,textarea,[contenteditable="true"]'))return;
  const view=document.getElementById('view');if(!view)return;
  const scroll=view.scrollTop,details=[...view.querySelectorAll('details')].map(d=>d.hasAttribute('open')),focusId=focused?.id,click=focused?.getAttribute?.('onclick');
  L.render();const fresh=document.getElementById('view');if(!fresh)return;
  [...fresh.querySelectorAll('details')].forEach((d,i)=>{if(details[i])d.setAttribute('open','');else d.removeAttribute('open');});fresh.scrollTop=scroll;
  const next=focusId?document.getElementById(focusId):click?[...fresh.querySelectorAll('button')].find(b=>b.getAttribute('onclick')===click):null;next?.focus?.({preventScroll:true});
 },0);
});
})();
