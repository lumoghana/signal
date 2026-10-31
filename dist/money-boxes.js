/* Money Boxes hold actual savings. Metadata never moves money. Manual moves
   use review and authorisation; opted-in sample hacks use a standing instruction.
   Both are posted by the authoritative two-account engine. */
(()=>{
'use strict';
const E=L.e,M=L.money,B=L.btn,J=JSON.stringify;
const error='<div id="error" role="alert"></div>';
const box=id=>L.state.goals.find(g=>g.id===id);
const draft=()=>L.state.paymentDraft;
const isBox=d=>d?.method==='box';
const isWithdrawal=d=>isBox(d)&&d.boxDirection==='out';
const internal=t=>!!t&&(t.internalTransfer||t.type==='internal');
const line=(label,value)=>`<div class="summary-line"><span>${E(label)}</span><strong>${value}</strong></div>`;
const date=value=>value?new Date(value+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'';
const pending=id=>L.state.txs.some(t=>internal(t)&&t.boxId===id&&t.status==='pending');
const close="L.taskSheet?.active?L.closeTask():L.openTab('plan')";
const target=g=>Number(g.target)>0?`${M(g.allocated)} of ${M(g.target)}`:M(g.allocated);
const progress=g=>Number(g.target)>0?`<div class="progress" role="progressbar" aria-label="${E(g.name)} target progress" aria-valuemin="0" aria-valuemax="${Number(g.target)}" aria-valuenow="${Math.min(Number(g.allocated),Number(g.target))}"><div class="progress-bar" style="width:${Math.min(100,Number(g.allocated)/Number(g.target)*100)}%"></div></div>`:'';
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
L.moneyBoxGoalGuide=(id,{now=Date.now(),targetDate}={})=>{
 const g=box(id);if(!L.state.onboarded||L.state.locked||L.state.closed||!g||g.archived||g.deleted)return {available:false};
 const target=Math.max(0,Number(g.target)||0),saved=Math.max(0,Number(g.allocated)||0),remaining=Math.max(0,Math.round((target-saved)*100)/100),when=targetDate===undefined?String(g.date||''):String(targetDate),hasDate=validDate(when),today=new Date(Number.isFinite(Number(now))?Number(now):Date.now()).toISOString().slice(0,10),days=hasDate?Math.round((Date.parse(when+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000)+1:0,reached=target>0&&remaining===0,overdue=target>0&&remaining>0&&hasDate&&days<=0,requiredWeekly=target>0&&remaining>0&&hasDate&&days>0?Math.ceil(Math.round(remaining*100)*7/days)/100:null;
 const requiredDaily=requiredWeekly!==null?Math.ceil(Math.round(remaining*100)/days)/100:null;
 const headline=reached?'Target reached.':overdue?`${M(remaining)} left. Choose a new target date.`:requiredDaily!==null&&days===1?`${M(remaining)} left to reach your target today.`:requiredDaily!==null&&days<7?`${M(requiredDaily)} a day to reach ${date(when)}.`:requiredWeekly!==null?`${M(requiredWeekly)} a week to reach ${date(when)}.`:target>0?`${M(remaining)} left to save.`:'Add a target for a saving guide.';
 return {available:true,id:g.id,name:g.name,hasTarget:target>0,hasDate,date:hasDate?when:'',dateSource:targetDate===undefined?'saved':'question',target,saved,remaining,daysLeft:Math.max(0,days),weeksLeft:Math.max(0,days)/7,requiredWeekly,requiredDaily,overdue,reached,pending:L.moneyBoxAvailable(id)<saved,headline,assumption:'A planning amount, not a forecast. It spreads the amount left evenly across today through the target date. It assumes no withdrawals or interest; pending transfers may change the balance.',actionLabel:overdue?'Update target date':reached?'Edit target':'Edit target or date',actionRoute:'goalEdit',actionParams:{id:g.id}};
};
function goalGuide(g){
 const z=L.moneyBoxGoalGuide(g.id);if(!z.available||!z.hasTarget||!z.hasDate&&!z.reached)return '';
 return `<section class="money-box-goal-guide" aria-label="Goal saving guide"><p>${E(z.headline)}</p>${z.overdue?B('Update target date',`L.savingsHackUI?L.savingsHackUI.editTarget(${J(g.id)},'goalDate'):L.go('goalEdit',{id:${J(g.id)}})`,'text-btn'):''}${z.requiredWeekly!==null?`<details><summary>How this is worked out</summary><p>${M(z.remaining)} left over ${z.daysLeft} day${z.daysLeft===1?'':'s'}, including today. ${z.daysLeft<7?'Daily amount':'Weekly equivalent'} rounded up to the nearest pesewa.</p><p>${E(z.assumption)}</p></details>`:''}</section>`;
}

L.views.goals=()=>{
 L.ensureAccounts();const a=L.accountBalances(),active=L.state.goals.filter(g=>!g.archived),archived=L.state.goals.filter(g=>g.archived),saved=box(L.params.savedGoalId);
 const notice=saved?`<div class="notice goal-saved" role="status"><strong>${E(saved.name)} ${L.params.goalSavedAction==='updated'?'updated':'added'}.</strong><p class="small">${L.params.goalSavedAction==='updated'?'Your saved money has not changed.':'It starts at '+M(0)+'. Fund it when you’re ready.'}</p></div>`:'';
 return L.header('Money Boxes','Save for what matters to you.')+notice+`<div class="hero"><p class="small muted">In your Lumo savings account</p><div class="balance-main">${L.balanceNumber(a.savings)}</div>${a.savingsHeld?`<p class="small muted">${M(a.savingsHeld)} returning to your operational account · pending</p>`:''}</div>`+(L.moneyBoxSavingsHackOverviewLink?.()||'')+(saved&&!saved.archived?`<div class="actions">${B('Fund this box',`L.startMoneyBoxTransfer(${J(saved.id)},'in')`)}</div>`:'')+active.map(g=>`<button type="button" class="goal-summary card" onclick="L.go('goal',{id:${E(J(g.id))}})"><div class="split"><h3>${E(g.name)}</h3>${L.icon('chevron',18)}</div><p class="small muted">${target(g)}${pending(g.id)?' · Transfer pending':''}</p>${L.moneyBoxProtectionStatus?.(g,true)||''}${progress(g)}</button>`).join('')+(!active.length?`<div class="empty"><h2>Give your savings a purpose.</h2><p class="small muted">A laptop, an emergency buffer or your next idea.</p></div>`:'')+`<div class="actions">${B(active.length?'Add another Money Box':'Add a Money Box',"L.go('goalEdit')")}${B('Close',close,'secondary')}</div>`+(archived.length?`<details class="screen-explainer"><summary>Archived Money Boxes (${archived.length})</summary>${archived.map(g=>L.row(g.name,'Empty · archived','target',`L.restoreMoneyBox(${J(g.id)})`,'Restore')).join('')}</details>`:'')+`<details class="screen-explainer"><summary>How Money Boxes work</summary><p class="small muted">Funding a box transfers money from your operational account into your Lumo savings account. Transfer it back with your PIN or biometric approval. Protected boxes also need partner approval. This is movement between your accounts, not spending.</p></details>`;
};
L.views.goalEdit=()=>{
 const g=box(L.params.id)||L.state.moneyBoxDraft||{};
 return L.header(g.id?'Edit Money Box':'Add a Money Box')+L.field('Money Box name','goalName','My next laptop','text',g.name||'')+L.field('Target amount (optional, GH₵)','goalTarget','No target needed','number',g.target||'')+L.field('Target date (optional)','goalDate','','date',g.date||'')+(L.moneyBoxSavingsHackFields?.(g)||'')+(L.moneyBoxProtectionFields?.(g)||'')+error+`<div class="actions">${B(g.id?'Save changes':'Add Money Box','L.saveGoal()')}${B('Cancel',"L.savingsHackUI?L.savingsHackUI.cancel():L.go('goals')",'text-btn')}</div><p class="small muted">Creating a Money Box doesn’t move money. Fund it when you choose, or use an optional Savings hack.</p>`;
};
L.saveGoal=()=>{
 if(L.route!=='goalEdit')return;
 const name=L.value('goalName').trim(),raw=L.value('goalTarget').trim(),value=raw?L.moneyInput(raw,.01):0,when=L.value('goalDate');
 if(!name||name.length>80)return L.error('Give your Money Box a name, up to 80 characters.','goalName');
 if(value===null)return L.error('Enter a positive target with up to two decimal places, or leave it empty.','goalTarget');
 if(when&&!validDate(when))return L.error('Choose a valid target date, or leave it empty.','goalDate');
 let g=box(L.params.id);const updating=!!g;
 const hack=L.captureMoneyBoxSavingsHack?.(g);if(hack===false)return;
 const protection=L.captureMoneyBoxProtection?.(g);if(protection===false)return;
 const before=g?{name:g.name,target:g.target,date:g.date}:null;
 if(g)Object.assign(g,{name,target:value,date:when});
 else {g={id:L.id('box'),name,target:value,date:when,allocated:0,boxVersion:2};L.state.goals.push(g);}
 if(L.finishMoneyBoxSavingsHackSave?.(g,hack,updating)===false){if(updating)Object.assign(g,before);else L.state.goals.splice(L.state.goals.indexOf(g),1);L.save();return;}
 if(!updating)delete L.state.moneyBoxDraft;
 L.save();if(L.finishMoneyBoxProtectionSave?.(g,protection,updating))return;L.finishForm(updating?'goal':'goals',updating?{id:g.id}:{savedGoalId:g.id,goalSavedAction:'added'});L.toast(updating?'Money Box updated.':'Money Box added.');
};
const saveGoal=L.saveGoal;
L.saveGoal=()=>{
 if(L.route!=='goalEdit')return;
 const params={...L.params},fields=[...document.getElementById('view')?.querySelectorAll('input,select,textarea')||[]].filter(el=>el.id&&el.type!=='password'&&!/pin|verification|otp|password/i.test(el.id)).map(el=>({id:el.id,value:el.value,checked:el.checked}));
 try{return L.persistence?.transaction?L.persistence.transaction(()=>saveGoal(),{label:'Save your Money Box'}):saveGoal();}
 catch(error){
  L.skipFormCapture=true;try{L.go('goalEdit',params);}finally{L.skipFormCapture=false;}
  for(const field of fields){const el=document.getElementById(field.id);if(el){el.value=field.value;if(typeof field.checked==='boolean')el.checked=field.checked;}}
  L.toggleMoneyBoxProtectionFields?.();L.captureFormDraft?.();L.error(error.message||'Your Money Box changes could not be saved. Review and try again.');L.toast('Your Money Box changes were not saved. Review and try again.');return false;
 }
};
L.views.goal=()=>{
 const g=box(L.params.id);if(!g)return L.views.goals();const available=L.moneyBoxAvailable(g.id),held=Math.max(0,Number(g.allocated)-available);
 return L.header(g.name,'In your Lumo savings account.')+`<div class="hero"><p class="small muted">Money in this box</p><div class="balance-main">${L.balanceNumber(g.allocated)}</div>${Number(g.target)>0?`<p class="small muted">Target ${M(g.target)}${g.date?' · '+E(date(g.date)):''}</p>${progress(g)}`:g.date?`<p class="small muted">Target date ${E(date(g.date))}</p>`:''}${held?`<p class="small muted">${M(held)} reserved for a transfer back. ${M(available)} available.</p>`:''}</div>`+goalGuide(g)+(L.moneyBoxProtectionStatus?.(g)||'')+error+`<div class="actions">${!g.archived?B('Fund this box',`L.startMoneyBoxTransfer(${J(g.id)},'in')`):''}${available>0?B('Transfer back',`L.startMoneyBoxTransfer(${J(g.id)},'out')`,'secondary'):''}${L.moneyBoxSavingsHackActions?.(g)||''}${B('Edit Money Box',`L.go('goalEdit',{id:${J(g.id)}})`,'text-btn')}${g.archived?B('Restore Money Box',`L.restoreMoneyBox(${J(g.id)})`,'text-btn'):B('Archive Money Box',`L.archiveGoal(${J(g.id)})`,'text-btn')}</div><p class="small muted">Your budget applies to your operational account. Money here is separate. Transferring back needs your PIN or biometric approval${L.boxProtection?.get(g.id)?.status==='active'?' and your partner’s approval':''}.</p>`;
};
L.archiveGoal=id=>{
 const g=box(id);if(!g)return;
 if(pending(id)){L.go('goal',{id});L.toast('Wait for the pending transfer to resolve before archiving.');return;}
 if(Number(g.allocated)>0){L.go('goal',{id});L.toast('Transfer this box’s money back before archiving.');return;}
 g.archived=true;L.save();L.go('goals');L.toast('Money Box archived. Restore it below anytime.');
};
L.restoreMoneyBox=id=>{const g=box(id);if(!g)return;g.archived=false;L.save();L.go('goal',{id});L.toast('Money Box restored.');};

function newDraft(g,direction,amount=''){
 const a=L.accountBalances(),prior=draft(),returnPaymentDraft=isBox(prior)?prior.returnPaymentDraft:prior&&!prior.submittedTxId?{...prior}:undefined;
 return {id:L.id('D'),method:'box',paymentEntryKey:'box:'+g.id+':'+direction,boxId:g.id,boxDirection:direction,name:g.name,provider:direction==='in'?'Lumo Savings':'Lumo operational account',destination:direction==='in'?a.savingsNumber:a.operationalNumber,checked:true,amount,fee:0,essentialId:'',note:'',pinAttempts:0,...(returnPaymentDraft?{returnPaymentDraft}:{})};
}
L.startMoneyBoxTransfer=(id,direction='in')=>{
 const g=box(id);if(!g||g.archived)return L.toast('Restore this Money Box before moving money.');
 if(isBox(draft())&&!draft().submittedTxId&&L.requestPaymentReplacement?.(()=>L.startMoneyBoxTransfer(id,direction),'box:'+id+':'+direction,{replaceLabel:'Start this Money Box transfer',keepLabel:'Continue saved transfer'}))return;
 L.state.paymentDraft=newDraft(g,direction);L.save();L.go(direction==='out'?'releaseGoal':'allocate',{id});
};
function currentDraft(g,direction){
 const d=draft();if(isBox(d)&&!d.submittedTxId&&d.boxId===g.id&&d.boxDirection===direction)return d;
 L.state.paymentDraft=newDraft(g,direction);return L.state.paymentDraft;
}
function entry(direction){
 const g=box(L.params.id);if(!g)return L.views.goals();
 if(g.archived)return L.header('This Money Box is archived')+B('Restore Money Box',`L.restoreMoneyBox(${J(g.id)})`);
 const d=currentDraft(g,direction),a=L.accountBalances(),out=direction==='out',id=out?'release':'allocation';
 return `<section data-money-box-entry>`+L.header(out?'Transfer back':'Fund your Money Box',E(g.name))+`<div class="receipt">${line(out?'Available in this box':'Operational balance available',M(out?L.moneyBoxAvailable(g.id):a.available))}${line(out?'To operational account':'To savings account',E(out?a.operationalNumber:a.savingsNumber))}</div>`+`<form class="form" onsubmit="event.preventDefault();L.${out?'reviewRelease':'reviewAllocation'}()">`+L.field('Amount (GH₵)',id,'0.00','number',d.amount||'').replace('<input ','<input min="0.01" max="5000" step="0.01" ')+`<p class="small muted" id="money-box-projection" aria-live="polite">${out?'This money becomes available in your operational account only after confirmation.':'This moves sample money from your operational account into savings. Lumo will show a Pause if your budget would be affected.'}</p>`+error+`<div class="actions"><button type="submit" class="primary">Review transfer</button>${B('Cancel','L.cancelMoneyBoxTransfer()','text-btn')}</div></form><p class="tiny muted">Sample money · No live transfer</p></section>`;
}
L.views.allocate=()=>entry('in');L.views.releaseGoal=()=>entry('out');
function review(direction){
 const g=box(L.params.id);if(!g)return L.go('goals');
 const out=direction==='out',id=out?'release':'allocation',amount=L.moneyInput(L.value(id),.01,5000),available=out?L.moneyBoxAvailable(g.id):L.accountBalances().available;
 if(amount===null)return L.error('Enter GH₵0.01 to GH₵5,000.00, using up to two decimal places.',id);
 if(amount>available)return L.error(out?'Choose an amount within the available money in this box.':'Choose an amount within your available operational balance.',id);
 const d=currentDraft(g,direction);Object.assign(d,{amount,fee:0,essentialId:'',reviewFingerprint:null,boxQuote:null,pauseAcceptedSignature:null,pinAttempts:0});
 L.clearFormDraft();L.save();L.skipFormCapture=true;try{L.go('paymentReview');}finally{L.skipFormCapture=false;}
}
L.reviewAllocation=()=>review('in');L.reviewRelease=()=>review('out');
// Old route bookmarks remain useful, but never commit funds without a PIN.
L.views.allocationReview=()=>L.views.paymentReview();L.views.releaseReview=()=>L.views.paymentReview();
L.confirmAllocation=()=>{if(isBox(draft()))L.continuePayment();else L.go('allocate',{id:L.params.id});};
L.confirmRelease=()=>{if(isWithdrawal(draft()))L.continuePayment();else L.go('releaseGoal',{id:L.params.id});};
const editPayment=L.editPayment;
L.editPayment=()=>{const d=draft();if(!isBox(d))return editPayment();if(d.submittedTxId)return L.go('paymentResult',{id:d.submittedTxId});L.go(d.boxDirection==='out'?'releaseGoal':'allocate',{id:d.boxId});};
L.cancelMoneyBoxTransfer=()=>{const d=draft();if(!isBox(d))return;const original=d.returnPaymentDraft,id=d.boxId;L.state.paymentDraft=original||null;L.save();L.go(original?'paymentReview':'goal',original?{}:{id});};
const finishPayment=L.finishPayment,discardPayment=L.discardPayment;
L.finishPayment=()=>{const d=draft();if(!isBox(d)||!d.returnPaymentDraft)return finishPayment();L.state.paymentDraft=d.returnPaymentDraft;L.save();L.go('paymentReview');L.toast('Your payment details are kept. Review the updated balance.');};
L.discardPayment=()=>{const d=draft();if(isBox(d)&&d.returnPaymentDraft)return L.cancelMoneyBoxTransfer();return discardPayment();};
const send=L.views.send;
L.views.send=()=>{const d=draft();if(!isBox(d))return send();const prior=L.params;L.params={...prior,id:d.boxId};try{return entry(d.boxDirection);}finally{L.params=prior;}};

const paymentReview=L.views.paymentReview;
L.views.paymentReview=()=>{
 const d=draft();if(!isBox(d))return paymentReview();if(d.submittedTxId)return L.views.paymentResult();
 const g=box(d.boxId),a=L.accountBalances(),out=d.boxDirection==='out',available=out?L.moneyBoxAvailable(d.boxId):a.available;
 if(!g)return L.header('Money Box unavailable')+B('Back to Money Boxes',"L.go('goals')");
 const short=Number(d.amount)>available;
 return `<section class="box-transfer-review">`+L.header('Review transfer','Between your own Lumo accounts.')+`<div class="box-transfer-total"><span>Total to transfer</span><div class="balance-main">${L.balanceNumber(d.amount)}</div></div><div class="receipt box-transfer-summary">${line('From',E(out?'Money Box · '+g.name:'Operational account'))}${line('To',E(out?'Operational account':'Money Box · '+g.name))}${line('Fee',M(0))}<details class="box-transfer-projection"><summary>Projected balances</summary>${line('Operational balance after',M(a.available+(out?1:-1)*Number(d.amount)))}${line('Money Box after',M(Number(g.allocated)+(out?-1:1)*Number(d.amount)))}</details></div>`+(short?`<p class="warning">The available money changed. Edit the amount before continuing.</p>`:'')+(!short&&out?L.moneyBoxWithdrawalApproval?.(d)||'':'')+error+`<div class="actions">${!short?B('Continue','L.continuePayment()'):''}${B('Edit amount','L.editPayment()','secondary')}${B('Cancel transfer','L.leavePayment()','text-btn')}</div><p class="tiny muted">Projected figures · Nothing moved yet</p></section>`;
};
function guard(d){
 if(L.state.closed){L.go('closeAccount');return false;}
 if(L.state.locked){L.go('signin',{returnTo:'paymentReview'});return false;}
 if(!L.state.onboarded){L.go('welcome');return false;}
 if(!d||!box(d.boxId)){L.go('goals');return false;}
 if(d.submittedTxId){L.go('paymentResult',{id:d.submittedTxId});return false;}
 return true;
}
const quote=d=>{const a=L.accountBalances(),g=box(d.boxId);return JSON.stringify([d.id,d.boxId,d.boxDirection,Number(d.amount),Number(d.fee),d.destination,a.operationalNumber,a.savingsNumber,a.available,a.savingsAvailable,g?.allocated,L.moneyBoxAvailable(d.boxId)]);};
const continuePayment=L.continuePayment;
L.continuePayment=()=>{
 const d=draft();if(!isWithdrawal(d))return continuePayment();if(!guard(d))return;
 if(L.moneyInput(d.amount,.01,5000)===null||Number(d.amount)>L.moneyBoxAvailable(d.boxId))return L.error('The available money in this box changed. Edit the amount.');
 d.boxQuote=quote(d);L.save();L.go('authorize');
};
const authorize=L.views.authorize;
L.views.authorize=()=>{
 const d=draft();if(!isBox(d))return authorize();if(d.submittedTxId)return L.views.paymentResult();
 const out=d.boxDirection==='out',controls=L.testMode?`<details class="notice small"><summary>Tester controls</summary><label class="field" for="payment-outcome"><span>Transfer result</span><select id="payment-outcome" class="input"><option>Completed</option><option>Pending</option><option>Failed</option></select></label><p>No live transfer is sent.</p></details>`:'';
 return L.header('Confirm transfer','Choose PIN or biometric approval.')+`<div class="hero"><div class="avatar">${L.icon('lock',28)}</div><div class="balance-main">${L.balanceNumber(d.amount)}</div><p>${out?'From':'To'} <strong>${E(d.name)}</strong></p><p class="small muted">${out?'To your operational account':'Into your Lumo savings account'}</p></div><form class="form" onsubmit="event.preventDefault();L.authorizePayment()"><label class="field" for="payment-pin"><span>Your 6-digit Lumo PIN</span><input class="input" id="payment-pin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="off" required aria-describedby="error" placeholder="••••••"></label>${error}${controls}<div class="actions"><button type="submit" class="primary">Transfer ${M(d.amount)}</button>${B('Back to review',"L.go('paymentReview')",'text-btn')}</div></form><p class="tiny muted">Sample money · No live transfer</p>`;
};
// Current quotes are checked before opening a biometric demo and again by
// the existing executor. The receipt cannot authorise another box or amount.
L.moneyBoxAuthorizationCurrent=d=>!isWithdrawal(d)?L.paymentAuthorizationCurrent?.(d):L.route==='authorize'&&guard(d)&&L.moneyInput(d.amount,.01,5000)!==null&&Number(d.amount)<=L.moneyBoxAvailable(d.boxId)&&d.boxQuote===quote(d);
const authorizePayment=L.authorizePayment;
function authorizeWithdrawal(proof){
 const d=draft();if(!guard(d))return;if(L.route!=='authorize')return L.go('paymentReview');
 if(!L.biometricPayment?.consume(proof,d)){
  const pin=L.value('payment-pin'),field=document.getElementById('payment-pin');if(!/^\d{6}$/.test(pin))return L.error('Enter your 6-digit Lumo PIN.','payment-pin');
  const result=L.authPolicy?.verify(pin,{purpose:'Transfer back from a Money Box'});
  if(field)field.value='';
  if(!result)return L.error('Secure approval is unavailable. Reopen Lumo before trying again.','payment-pin');
  if(!result.ok){if(result.locked){L.go('signin',{returnTo:'paymentReview'});L.toast(result.message);return;}return L.error(result.message,'payment-pin');}
 }
 if(L.moneyInput(d.amount,.01,5000)===null||Number(d.amount)>L.moneyBoxAvailable(d.boxId)||d.boxQuote!==quote(d)){L.go('paymentReview');L.toast('Your account or Money Box changed. Review the current figures.');return;}
 const outcome=L.testMode?L.value('payment-outcome'):'Completed',status=outcome==='Pending'?'pending':outcome==='Failed'?'failed':'success';
 const result=L.transferMoneyBox({id:d.boxId,direction:'out',amount:Number(d.amount),draftId:d.id,status,name:d.name});result.paymentDraft={...d};d.submittedTxId=result.id;L.save();L.go('paymentResult',{id:result.id});
}
L.authorizePayment=proof=>{
 if(!isWithdrawal(draft()))return authorizePayment(proof);
 try{return L.persistence?.transaction?L.persistence.transaction(()=>authorizeWithdrawal(proof),{financial:true,label:'Transfer back from a Money Box'}):authorizeWithdrawal(proof);}
 catch(error){const d=draft();if(d&&!d.submittedTxId){delete d.boxQuote;L.go('paymentReview');L.error(error.message||'Your transfer could not be saved. Review it again.');return false;}throw error;}
};

const result=L.views.paymentResult,receipt=L.views.txDetail;
const status=t=>({success:'Completed',pending:'Transfer pending',failed:'Not completed',reversed:'Reversed'}[t.status]||t.status);
const movement=t=>t.boxDirection==='out'?'Money Box → operational account':'Operational account → Money Box';
const statusCopy=t=>t.status==='pending'?`The amount is reserved in ${t.boxDirection==='out'?'this Money Box':'your operational account'} while the transfer is checked. It has not arrived yet. Please don’t repeat it.`:t.status==='failed'?'No money moved. Any reservation has been released.':t.status==='reversed'?'This movement was reversed. See the linked record in Activity.':'Transferred between your accounts. This is savings movement, not spending.';
L.views.paymentResult=()=>{
 const t=L.state.txs.find(t=>t.id===(L.params.id||draft()?.submittedTxId));if(!internal(t))return result();
 const a=L.accountBalances(),g=box(t.boxId),title=t.status==='success'?(t.boxDirection==='out'?'Back in your operational account.':'Your Money Box is funded.'):t.status==='pending'?'Transfer being checked.':t.status==='failed'?'Transfer not completed.':'Transfer reversed.';
 return L.header('Transfer result')+`<div class="hero"><div class="success-mark">${L.icon(t.status==='success'?'check':t.status==='pending'?'clock':t.status==='failed'?'close':'receipt',36)}</div><h1>${title}</h1><p>${M(t.amount)} · ${E(g?.name||t.name)}</p></div><p class="small muted" role="status">${statusCopy(t)}</p><div class="receipt">${line('Status',E(status(t)))}${line('Operational balance available',M(a.available))}${line('Money in this box',M(g?.allocated||0))}</div><div class="actions">${B('Done','L.finishPayment()')}${B(t.status==='pending'?'Check transfer':'View receipt',`L.go('txDetail',{id:${J(t.id)}})`,'secondary')}</div>`;
};
L.views.txDetail=()=>{
 const t=L.state.txs.find(t=>t.id===L.params.id);if(!internal(t))return receipt();const g=box(t.boxId);
 return L.header(t.status==='pending'?'Transfer status':'Transfer receipt')+`<div class="hero"><span class="pill">${E(status(t))}</span><div class="balance-main">${L.balanceNumber(t.amount)}</div><p>${E(g?.name||t.name)}</p></div><p class="small muted">${statusCopy(t)}</p><div class="receipt">${line('Movement',E(movement(t)))}${line('Reference',E(t.id))}${line('Date',E(new Date(t.date).toLocaleString('en-GB')))}${line('Amount',M(t.amount))}${line('Fee',M(0))}${line('Method','Between Lumo accounts')}${t.lastChecked?line('Last checked',E(new Date(t.lastChecked).toLocaleTimeString('en-GB'))):''}</div><div class="actions">${t.status==='pending'?B('Check status',`L.refreshPayment(${J(t.id)})`):B('Save receipt',`L.downloadReceipt(${J(t.id)})`)}${t.status==='failed'?B('Review a new attempt',`L.retryMoneyBoxTransfer(${J(t.id)})`,'secondary'):''}${B('Get help',`L.go('supportCase',{txId:${J(t.id)},reference:${J(t.id)}})`,'secondary')}${B('Back to activity',"L.go('activity')",'text-btn')}</div>${L.testMode&&t.status==='pending'?`<details class="notice small"><summary>Tester controls</summary><p>Only a confirmed result moves money. Checking does not invent a result.</p>${B('Confirm completed',`L.settlePayment(${J(t.id)},'success')`,'secondary')}${B('Confirm not completed',`L.settlePayment(${J(t.id)},'failed')`,'secondary')}</details>`:''}<p class="tiny muted">Sample money · No live transfer</p>`;
};
const downloadReceipt=L.downloadReceipt;
L.downloadReceipt=id=>{
 const t=L.state.txs.find(t=>t.id===id);if(!internal(t))return downloadReceipt(id);
 if(L.receiptDownload)return L.receiptDownload(id);
 const a=L.accountBalances(),g=box(t.boxId);
 L.download('Lumo_Transfer_Receipt_'+t.id+'.txt',`LUMO SIMULATED INTERNAL TRANSFER\nSample money. No live transfer.\n\nReference: ${t.id}\nStatus: ${status(t)}\nDate: ${new Date(t.date).toLocaleString('en-GB')}\nMoney Box: ${g?.name||t.name}\nMovement: ${movement(t)}\nOperational account: ${a.operationalNumber}\nSavings account: ${a.savingsNumber}\nAmount: ${M(t.amount)}\nFee: ${M(0)}\n\n${statusCopy(t)}\n`);
};
L.retryMoneyBoxTransfer=id=>{const t=L.state.txs.find(t=>t.id===id),g=box(t?.boxId);if(!internal(t)||t.status!=='failed'||!g)return;L.state.paymentDraft=newDraft(g,t.boxDirection,t.amount);L.save();L.go(t.boxDirection==='out'?'releaseGoal':'allocate',{id:g.id});};
L.views.makeRoom=()=>L.header('Make room for your budget','Choose what to change before you pay.')+`<p class="small muted">Your budget uses your operational account. Transferring savings back adds available money to that account.</p>`+L.state.goals.filter(g=>Number(g.allocated)>0&&!g.archived).map(g=>L.row(g.name,M(L.moneyBoxAvailable(g.id))+' available to transfer back','target',`L.startMoneyBoxTransfer(${J(g.id)},'out')`)).join('')+L.row('Review budget','Change a cost if your plans changed','plan',"L.go('essentials')")+L.row('Add money','Fund your operational account','plus',"L.openFunding('paymentReview')")+B('Back',L.state.paymentDraft&&!L.state.paymentDraft.submittedTxId?"L.go('paymentReview')":"L.go('plan')",'secondary');

document.addEventListener('input',event=>{
 if(!['allocate','releaseGoal'].includes(L.route)||!['allocation','release'].includes(event.target?.id))return;
 const d=draft();if(!isBox(d)||d.submittedTxId)return;d.amount=event.target.value;
 const amount=L.moneyInput(d.amount,.01,5000),node=document.getElementById('money-box-projection');if(!node||amount===null)return;
 const a=L.accountBalances(),out=d.boxDirection==='out';
 if(out)node.textContent=amount>L.moneyBoxAvailable(d.boxId)?'This amount is more than is available in this box.':`Projected operational balance: ${M(a.available+amount)}. Nothing moved yet.`;
 else {const p=L.planImpactSummary?.({...d,amount});node.textContent=amount>a.available?'This amount is more than your available operational balance.':p?.conclusion||p?.headline||`Projected operational balance: ${M(a.available-amount)}. Nothing moved yet.`;}
});
})();
