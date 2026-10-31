/* Personal IOUs, recorded holdings and a reviewed allowance bridge.
   Uses core persistence and the native payment ledger. All money is sample money. */
(()=>{
'use strict';
if(!window.L||L.moneyLife)return;
const DAY=86400000,clone=x=>JSON.parse(JSON.stringify(x)),now=()=>new Date().toISOString(),today=()=>now().slice(0,10);
const cents=value=>{if(String(value??'').trim()==='')return null;const n=Number(value),c=Math.round(n*100);return Number.isFinite(n)&&n>=0&&n<=1000000&&Number.isSafeInteger(c)&&Math.abs(n*100-c)<.00001?c:null;};
const minor=n=>Math.max(0,Math.round((Number(n)||0)*100)),cash=n=>n/100;
const text=(value,max=120)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
const dateOK=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''))&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const check=()=>{if(!allowed())throw Error('Sign in to your open sample account first.');};
const read=(s=L.state)=>s.moneyLife||{version:1,debts:[],sources:[],sourceHistory:[],recoveries:[]};
const store=()=>{if(!L.state.moneyLife)L.state.moneyLife={version:1,debts:[],sources:[],sourceHistory:[],recoveries:[]};const s=L.state.moneyLife;if(s.version!==1||!Array.isArray(s.debts)||!Array.isArray(s.sources)||!Array.isArray(s.recoveries))throw Error('Your saved money records need review.');return s;};
const atomic=(fn,financial=false)=>{check();return L.persistence.transaction(()=>{const result=fn();L.save();return clone(result??null);},{financial,label:financial?'Confirm this sample payment':'Save your money record'});};
const get=(id,s=L.state)=>read(s).debts.find(d=>d.id===id)||null;
const tx=(id,s=L.state)=>(s.txs||[]).find(t=>t.id===id);
const cost=(id,s=L.state)=>(s.essentials||[]).find(x=>x.id===id&&!x.deleted&&!x.archived);
const eventStatus=(event,s=L.state)=>event.voidedAt?'corrected':event.txId?(tx(event.txId,s)?.status||'unavailable'):'success';
function debtSummary(d,s=L.state){
 if(!d)return null;
 const events=(d.settlements||[]).map(v=>({...v,status:eventStatus(v,s)}));
 const paid=events.filter(v=>v.status==='success').reduce((n,v)=>n+minor(v.amount),0),pending=events.filter(v=>v.status==='pending').reduce((n,v)=>n+minor(v.amount),0);
 const remaining=Math.max(0,minor(d.amount)-paid),payable=Math.max(0,remaining-pending);
 const status=d.closedAt?'closed':remaining===0?'settled':pending?'pending':d.dueDate&&d.dueDate<today()?'overdue':paid?'partial':'open';
 return {...clone(d),paid:cash(paid),pending:cash(pending),remaining:cash(remaining),payable:d.closedAt?0:cash(payable),status,events};
}
const mark=d=>JSON.stringify([d?.revision,d?.amount,d?.direction,d?.person,d?.dueDate,d?.essentialId,d?.closedAt, (d?.settlements||[]).map(v=>[v.id,v.amount,v.txId,eventStatus(v)])]);
const requireDebt=(id,expected)=>{const d=get(id);if(!d)throw Error('This IOU is unavailable.');if(expected!==undefined&&expected!==d.revision)throw Error('This IOU changed. Reopen it and review the latest details.');return d;};
const editable=d=>{if(debtSummary(d).pending)throw Error('A repayment is being checked. Keep the same reference until its result is known.');};
const log=(d,type,detail={})=>{d.history.push({id:L.id('IOU-event'),type,at:now(),...clone(detail)});d.revision++;d.updatedAt=now();};
const invalidateRequests=d=>{for(const r of L.state.requests||[])if(r.iouId===d.id&&r.status==='waiting'&&!r.txId){r.status='cancelled';r.closedReason='IOU details changed';}};
function debtInput(input,old){
 const amount=cents(input.amount),direction=input.direction,person=text(input.person,60),dueDate=text(input.dueDate,10),essentialId=text(input.essentialId,100);
 if(!['owe','owed'].includes(direction)||!person)throw Error('Choose who owes whom and enter a name.');
 if(amount===null||amount<=0)throw Error('Enter an amount above zero, with up to two decimal places.');
 if(dueDate&&!dateOK(dueDate))throw Error('Choose a valid due date or leave it open.');
 if(old&&old.settlements.length&&(old.person!==person||old.direction!==direction))throw Error('Keep the person and direction once a repayment is recorded. Correct or close this IOU instead.');
 if(old&&amount<minor(debtSummary(old).paid)+minor(debtSummary(old).pending))throw Error('The total cannot be less than repayments already recorded.');
 if(essentialId&&(direction!=='owe'||!cost(essentialId)))throw Error('Choose a current Plan item for money you owe.');
 return {amount:cash(amount),direction,person,dueDate,note:text(input.note),essentialId,contactId:['abena','kojo','ama'].includes(input.contactId)?input.contactId:''};
}
function createDebt(input,key){return atomic(()=>{
 if(!text(key,100))throw Error('Reopen the IOU form and review it again.');
 const prior=store().debts.find(d=>d.creationKey===key);if(prior)return debtSummary(prior);
 const fields=debtInput(input),d={id:L.id('IOU'),creationKey:key,...fields,revision:1,createdAt:now(),updatedAt:now(),settlements:[],history:[]};
 d.history.push({id:L.id('IOU-event'),type:'created',at:now(),amount:d.amount});store().debts.unshift(d);return debtSummary(d);
});}
function updateDebt(id,input,revision){return atomic(()=>{const d=requireDebt(id,revision);editable(d);if(d.closedAt)throw Error('Reopen this IOU before editing.');const before=clone(d),fields=debtInput(input,d);Object.assign(d,fields);invalidateRequests(d);log(d,'details-corrected',{before:{amount:before.amount,dueDate:before.dueDate,note:before.note,essentialId:before.essentialId},after:fields});return debtSummary(d);});}
function manual(id,input,revision){return atomic(()=>{
 const d=requireDebt(id),prior=d.settlements.find(v=>v.key===input.key);if(prior)return debtSummary(d);
 requireDebt(id,revision);editable(d);const q=debtSummary(d),amount=cents(input.amount),date=input.date||today();
 if(d.closedAt||!q.payable)throw Error('This IOU is closed or settled.');
 if(amount===null||amount<=0||amount>minor(q.payable))throw Error('Use an amount above zero, up to the unpaid balance.');
 if(!['cash','momo','bank'].includes(input.channel))throw Error('Record only a payment made outside Lumo here.');
 if(!dateOK(date)||date>today())throw Error('Choose today or an earlier payment date.');
 if(!input.key)throw Error('Review this repayment again.');
 const reference=text(input.reference,100);
 if(reference&&read().debts.some(x=>x.settlements.some(v=>!v.voidedAt&&v.kind==='manual'&&v.reference===reference&&v.channel===input.channel)))throw Error('That payment reference is already recorded.');
 const event={id:L.id('IOU-payment'),key:input.key,kind:'manual',amount:cash(amount),channel:input.channel,reference,date,at:now()};
 d.settlements.push(event);invalidateRequests(d);log(d,'repayment-recorded',{eventId:event.id,amount:event.amount,channel:event.channel});return debtSummary(d);
});}
function correctManual(id,eventId,reason,revision){return atomic(()=>{const d=requireDebt(id,revision);editable(d);if(d.closedAt)throw Error('Reopen this IOU before correcting a record.');const event=d.settlements.find(v=>v.id===eventId);if(!event||event.kind!=='manual'||event.voidedAt)throw Error('Only an active payment recorded elsewhere can be corrected here.');if(!text(reason))throw Error('Add a short reason for the correction.');event.voidedAt=now();event.correction=text(reason);invalidateRequests(d);log(d,'repayment-corrected',{eventId,reason:text(reason)});return debtSummary(d);});}
function closeDebt(id,reason,revision){return atomic(()=>{const d=requireDebt(id,revision);editable(d);if(d.closedAt)return debtSummary(d);if(!text(reason))throw Error('Add a short reason for closing the IOU.');d.closedAt=now();d.closedReason=text(reason);invalidateRequests(d);log(d,'closed',{unpaid:debtSummary(d).remaining,reason:d.closedReason});return debtSummary(d);});}
function reopenDebt(id,revision){return atomic(()=>{const d=requireDebt(id,revision);if(!d.closedAt)throw Error('This IOU is already open.');delete d.closedAt;delete d.closedReason;log(d,'reopened');return debtSummary(d);});}
const confirmedIncoming=t=>t&&t.type==='in'&&t.status==='success'&&Number.isFinite(Number(t.amount))&&Number(t.amount)>0&&Number.isFinite(Date.parse(t.date))&&Date.parse(t.date)<=Date.now()&&!t.internalTransfer&&!t.originalId&&!t.refundOf&&!t.sharedExpenseRepayment&&!t.groupContribution&&t.fundingAccount!=='virtual-card'&&!['Refunds','Savings'].includes(t.category);
const eligibleCredit=t=>confirmedIncoming(t)&&!t.iouId&&!read().debts.some(d=>d.settlements.some(v=>v.txId===t.id));
function attach(d,t){
 if(d.settlements.some(v=>v.txId===t.id))return;
 if(t.iouId&&t.iouId!==d.id||read().debts.some(other=>other.id!==d.id&&other.settlements.some(v=>v.txId===t.id)))throw Error('This receipt is already linked to another IOU.');
 t.iouId=d.id;t.iouDirection=d.direction;
 d.settlements.push({id:L.id('IOU-payment'),kind:'lumo',txId:t.id,amount:Number(t.amount),date:t.date.slice(0,10),at:now()});
 invalidateRequests(d);log(d,'payment-linked',{txId:t.id,amount:Number(t.amount)});
}
function linkCredit(id,txId,revision){return atomic(()=>{const d=requireDebt(id,revision),t=tx(txId),q=debtSummary(d);if(d.closedAt||d.direction!=='owed'||!eligibleCredit(t)||minor(t.amount)>minor(q.payable))throw Error('Choose an unlinked confirmed incoming payment up to this IOU’s unpaid balance.');attach(d,t);return debtSummary(d);});}
function request(id,revision){return atomic(()=>{
 const d=requireDebt(id,revision),q=debtSummary(d);if(d.closedAt||d.direction!=='owed'||!q.payable)throw Error('Only an unpaid amount owed to you can be requested.');
 const prior=(L.state.requests||[]).find(r=>r.iouId===id&&r.status==='waiting'&&!r.txId&&Date.parse(r.expires)>Date.now());if(prior)return prior;
 if(q.payable>5000)throw Error('The unpaid balance is above the GH₵5,000 sample request limit. Record a partial repayment first.');
 const r={id:L.id('RQ'),from:'self',name:L.state.profile.name,handle:L.state.profile.handle||'you',to:d.person,amount:q.payable,note:'IOU repayment'+(d.note?' · '+d.note:''),status:'waiting',created:now(),expires:new Date(Date.now()+7*DAY).toISOString(),iouId:id};
 L.state.requests.unshift(r);log(d,'repayment-requested',{requestId:r.id,amount:r.amount});return r;
});}
function totals(s=L.state){let owe=0,owed=0,pending=0;for(const d of read(s).debts){const q=debtSummary(d,s);if(d.closedAt)continue;if(d.direction==='owe')owe+=minor(q.remaining);else owed+=minor(q.remaining);pending+=minor(q.pending);}return {owe:cash(owe),owed:cash(owed),pending:cash(pending)};}
function sourceInput(input,oldId){
 const kind=input.kind,name=text(input.name,48),amount=cents(input.amount),asOf=input.asOf;
 if(!['bank','momo','cash'].includes(kind)||!name)throw Error('Choose where the money is held and give it a name.');
 if(amount===null)throw Error('Enter a balance of zero or more, using up to two decimal places.');
 if(!dateOK(asOf)||asOf>today())throw Error('Use today or an earlier date for this recorded balance.');
 if(input.distinct!==true)throw Error('Confirm this is your own money and is not counted elsewhere.');
 if(/lumo|money\s*box|virtual\s*card|collection|group\s*pot/i.test(name))throw Error('Lumo, Money Boxes, cards and group pots already have their own treatment. Record only your other money here.');
 if(read().sources.some(x=>!x.removedAt&&x.id!==oldId&&x.kind===kind&&x.name.toLowerCase()===name.toLowerCase()))throw Error('That source is already listed. Update its balance instead.');
 return {kind,name,amount:cash(amount),asOf,updatedAt:now()};
}
function saveSource(input,id,revision,key){return atomic(()=>{const old=id?store().sources.find(x=>x.id===id):null;if(id&&(!old||old.removedAt||old.revision!==revision))throw Error('This balance changed. Reopen the source before updating it.');if(!id&&key){const prior=store().sources.find(x=>x.creationKey===key);if(prior)return prior;}const fields=sourceInput(input,id),before=old?clone(old):null;const entry=old||{id:L.id('money-source'),creationKey:key||L.id('source-draft'),createdAt:now(),revision:0};Object.assign(entry,fields,{revision:entry.revision+1});if(!old)store().sources.push(entry);store().sourceHistory.push({id:L.id('source-event'),sourceId:entry.id,at:now(),type:old?'updated':'added',before,after:clone(entry)});return entry;});}
function removeSource(id,revision){return atomic(()=>{const x=store().sources.find(v=>v.id===id);if(!x||x.removedAt||x.revision!==revision)throw Error('Reopen this source before removing it.');x.removedAt=now();x.revision++;store().sourceHistory.push({id:L.id('source-event'),sourceId:id,type:'removed',at:now(),amount:x.amount});return x;});}
function holdings(s=L.state){
 const a=L.accountBalances(s),cards=L.virtualCards?.totals(s)||{balance:0,held:0,available:0,count:0};
 const sources=read(s).sources.filter(x=>!x.removedAt).map(x=>({...clone(x),stale:!dateOK(x.asOf)||x.asOf<today()}));
 // The native account aggregate already includes separately funded cards.
 const recorded=sources.reduce((n,x)=>n+minor(x.amount),0),lumo=minor(a.total),held=minor(a.held)+minor(a.savingsHeld)+minor(cards.held);
 return {total:cash(lumo+recorded),lumo:cash(lumo),recorded:cash(recorded),held:cash(held),everyday:a.operational,available:a.available,savings:a.savings,cards:cards.balance,cardCount:cards.count,sources,stale:sources.filter(x=>x.stale).length,debts:totals(s),expectedIOUs:totals(s).owed,expected:Number(s.allowance?.amount)||0};
}
function recoveryMark(){return JSON.stringify([today(),L.accountBalances(),L.state.essentials,L.state.txs,L.state.allowance,L.state.planHorizon,read().debts,L.state.savingHacks]);}
function recoveryQuote(input){
 const reviewDate=input.reviewDate;if(!dateOK(reviewDate)||reviewDate<today()||Date.parse(reviewDate)-Date.parse(today())>31*DAY)throw Error('Choose a check-in from today up to 31 days ahead.');
 const position=L.pauseEngine.planPosition({amount:0,fee:0}),rows=position.essentials.filter(x=>cost(x.id)&&x.before>0).map(x=>{
  const choice=input.adjustments?.[x.id],amount=choice&&!choice.protected?cents(choice.amount):minor(x.before);
  if(amount===null||amount>minor(x.before))throw Error('Use a remaining cost between zero and its current amount.');
  return {id:x.id,name:x.name,date:x.date||'',before:x.before,after:cash(amount),protected:choice?.protected!==false};
 });
 const due=read().debts.map(d=>debtSummary(d)).filter(d=>d.direction==='owe'&&!d.closedAt&&d.payable>0&&(!d.dueDate||d.dueDate<=reviewDate));
 const linked=new Map();let extra=0;for(const d of due){if(d.essentialId&&rows.some(r=>r.id===d.essentialId))linked.set(d.essentialId,(linked.get(d.essentialId)||0)+minor(d.payable));else extra+=minor(d.payable);}
 for(const [id,amount]of linked){const row=rows.find(r=>r.id===id);extra+=Math.max(0,amount-minor(row.after));}
 const before=rows.reduce((n,x)=>n+minor(x.before),0),planned=rows.reduce((n,x)=>n+minor(x.after),0),available=minor(position.available),gap=Math.max(0,planned+extra-available),spare=Math.max(0,available-planned-extra),days=Math.max(1,Math.ceil((Date.parse(reviewDate)-Date.parse(today()))/DAY)+1);
 return {reviewDate,days,rows,dueDebts:due,available:cash(available),costs:cash(planned),debtExtra:cash(extra),needed:cash(planned+extra),gap:cash(gap),spare:cash(spare),daily:cash(Math.floor(spare/days)),reduction:cash(before-planned),pauseSavings:input.pauseSavings===true,activeHacks:L.savingsHacks?.overview?.().active||0,sourceMark:recoveryMark(),signature:JSON.stringify([reviewDate,input.adjustments||{},input.pauseSavings===true,recoveryMark()])};
}
function applyRecovery(input,signature,key){return atomic(()=>{
 const prior=store().recoveries.find(r=>r.key===key);if(prior)return prior;
 if(!key)throw Error('Review your recovery plan again.');const q=recoveryQuote(input);if(q.signature!==signature)throw Error('Your money, costs or IOUs changed. Review the updated recovery plan.');
 const changes=[];for(const row of q.rows){if(row.after===row.before)continue;const c=cost(row.id);changes.push({id:c.id,name:c.name,before:c.amount,after:cash(minor(c.amount)-minor(row.before)+minor(row.after))});c.amount=changes.at(-1).after;}
 const paused=[];if(q.pauseSavings)for(const r of L.savingsHacks.overview().rules.filter(x=>x.enabled)){const result=L.savingsHacks.pause(r.boxId);if(!result.ok)throw Error(result.error||'Your savings instruction could not be paused.');paused.push(r.boxId);}
 const plan={id:L.id('allowance-recovery'),key,status:'active',createdAt:now(),reviewDate:q.reviewDate,changes,pausedBoxes:paused,startingAvailable:q.available,startingGap:q.gap,reviewedCosts:q.costs,reviewedDebtExtra:q.debtExtra,previousHorizon:clone(L.state.planHorizon||null)};
 // A check-in is not a new promise of income. Allowance/date and Budget period
 // stay intact. Existing paid/pending coverage and Money Box balances stay intact.
 for(const old of store().recoveries)if(old.status==='active'||old.id===store().activeRecoveryId&&recoveryState(old).status==='active'){old.status='superseded';old.supersededAt=now();}
 store().recoveries.unshift(plan);store().activeRecoveryId=plan.id;return plan;
});}
const recoveryReceiptIds=r=>[...new Set([...(r.receiptIds||[]),r.creditId].filter(Boolean))];
function recoveryState(r){
 if(!r)return null;
 const reviewDate=r.reviewDate<today()?today():r.reviewDate,q=recoveryQuote({reviewDate,adjustments:{},pauseSavings:false});
 const receiptIds=recoveryReceiptIds(r),receipts=receiptIds.map(id=>tx(id)).filter(t=>confirmedIncoming(t)&&Date.parse(t.date)>=Date.parse(r.createdAt));
 const covered=q.gap===0,proof=receipts.length>0,needsReview=r.status==='completed'&&(!covered||!proof);
 return {...clone(r),status:needsReview?'active':r.status,needsReview,covered,currentGap:q.gap,received:cash(receipts.reduce((n,t)=>n+minor(t.amount),0)),confirmedReceiptIds:receipts.map(t=>t.id),receiptIds,receiptChanged:receipts.length!==receiptIds.length};
}
function recoveryCredits(id){
 const r=read().recoveries.find(x=>x.id===id);if(!r||read().activeRecoveryId!==id)return [];
 return (L.state.txs||[]).filter(t=>confirmedIncoming(t)&&Date.parse(t.date)>=Date.parse(r.createdAt)&&!read().recoveries.some(other=>recoveryReceiptIds(other).includes(t.id)));
}
function finishRecovery(id,creditId){return atomic(()=>{
 const r=store().recoveries.find(x=>x.id===id);
 if(!r||store().activeRecoveryId!==id||!['active','completed'].includes(r.status))throw Error('Open your active recovery plan first.');
 const current=recoveryState(r),ids=recoveryReceiptIds(r);
 if(current.status==='completed'&&ids.includes(creditId))return current;
 if(creditId){
  const t=tx(creditId);
  if(!confirmedIncoming(t)||Date.parse(t.date)<Date.parse(r.createdAt)||store().recoveries.some(other=>other.id!==id&&recoveryReceiptIds(other).includes(creditId)))throw Error('Choose a new confirmed incoming payment received after this plan started.');
  if(!ids.includes(t.id))ids.push(t.id);
 }else if(!current.confirmedReceiptIds.length)throw Error('Choose a confirmed incoming payment first.');
 r.receiptIds=ids;r.creditId=creditId||r.creditId;r.reviewedAt=now();
 r.status=current.currentGap>0?'active':'completed';
 if(r.status==='completed')r.completedAt=now();else delete r.completedAt;
 return recoveryState(r);
});}
// Retained records are readable after account closure, but never signed out or
// locked. The native export controller still owns PIN verification and delivery.
const canReadRecords=()=>!!L.state?.onboarded&&!L.state.locked;
function exportRecords(){
 if(!canReadRecords())throw Error('Sign in to read your saved records.');
 const omitted=/^(?:creationKey|key|ownerKey|pin|.*Pin|password|.*Password|otp|.*Otp|code|token|.*Token|ticket|.*Ticket|secret|credentials?|review|signature|sourceMark|fingerprint|.*Fingerprint|draft|.*Draft|draftId|idempotencyKey|dataUrl|fileBytes)$/i;
 const safe=value=>Array.isArray(value)?value.map(safe):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!omitted.test(key)).map(([key,v])=>[key,safe(v)])):value;
 const records=read();return safe({debts:records.debts.map(d=>debtSummary(d)),sources:records.sources,sourceHistory:records.sourceHistory||[],recoveries:records.recoveries});
}
function debtPaymentCheck(d,review=false){
 if(!d?.iouLink)return true;
 const record=requireDebt(d.iouLink.id),q=debtSummary(record);
 if(d.submittedTxId)return true;
 if(record.closedAt||record.direction!=='owe'||!['lumo','momo','bank'].includes(d.method)||d.requestId||d.bill||d.collectionPayout||d.collectionContribution)throw Error('This IOU is no longer available for repayment.');
 const amount=cents(d.amount);if(amount===null||amount<=0||amount>minor(q.payable))throw Error('The amount must fit this IOU’s unpaid, unreserved balance.');
 if(!d.checked||!d.name||!d.destination)throw Error('Check the recipient before reviewing this repayment.');
 const binding=JSON.stringify([record.id,mark(record),d.method,d.name,d.destination,d.provider||'',amount,minor(d.fee),d.essentialId||'']);
 if(review)d.iouLink.review=binding;else if(d.iouLink.review!==binding)throw Error('The IOU or payment changed. Edit the payment and review it again.');
 return true;
}
// Bind the debt to the exact native recipient, amount, fee and current record.
const prepare=L.preparePayment;L.preparePayment=function(...args){if(!L.state.paymentDraft?.iouLink)return prepare.apply(this,args);try{L.savePaymentFields();const d=L.state.paymentDraft;d.fee=L.paymentFee(d.method,d.amount);debtPaymentCheck(d,true);return prepare.apply(this,args);}catch(e){L.error(e.message);return false;}};
for(const name of ['continuePayment','resumeFromPause','openPause']){const original=L[name];L[name]=function(...args){if(!L.state.paymentDraft?.iouLink)return original.apply(this,args);try{debtPaymentCheck(L.state.paymentDraft);return original.apply(this,args);}catch(e){L.error(e.message);return false;}};}
const authCurrent=L.paymentAuthorizationCurrent;L.paymentAuthorizationCurrent=function(d){if(!d?.iouLink)return authCurrent.call(this,d);try{debtPaymentCheck(d);return authCurrent.call(this,d);}catch{return false;}};
const authorize=L.authorizePayment;L.authorizePayment=function(...args){if(!L.state.paymentDraft?.iouLink)return authorize.apply(this,args);try{debtPaymentCheck(L.state.paymentDraft);return L.persistence.transaction(()=>authorize.apply(this,args),{financial:true,label:'Repay this sample IOU'});}catch(e){L.go('paymentReview');L.error(e.message);return false;}};
const add=L.addTx;L.addTx=function(data){
 const d=L.state.paymentDraft,linked=d?.iouLink&&d.id===data.draftId;
 const requestRecord=data.requestId&&(L.state.requests||[]).find(r=>r.id===data.requestId&&r.iouId);
 if(!linked&&!requestRecord)return add.call(this,data);
 return L.persistence.transaction(()=>{
 let debt=linked?requireDebt(d.iouLink.id):requestRecord?requireDebt(requestRecord.iouId):null;
 if(linked&&!d.submittedTxId)debtPaymentCheck(d);
 if(linked&&(data.type!=='out'||minor(data.amount)!==minor(d.amount)||minor(data.fee)!==minor(d.fee)))throw Error('The repayment must match the exact reviewed payment.');
 if(requestRecord){const q=debtSummary(debt);if(data.type!=='in'||requestRecord.from!=='self'||requestRecord.status!=='waiting'||debt.closedAt||debt.direction!=='owed'||minor(data.amount)>minor(q.payable))throw Error('This IOU request changed. Review the unpaid balance before recording a receipt.');}
 const result=add.call(this,data);if(debt)attach(debt,result);L.save();return result;
},{financial:true,label:'Record this sample payment'});};
L.moneyLife=Object.freeze({version:1,cents,dateOK,today,allowed,canReadRecords,exportRecords,debts:()=>read().debts.map(d=>debtSummary(d)),get:id=>debtSummary(get(id)),mark:id=>mark(get(id)),createDebt,updateDebt,manual,correctManual,closeDebt,reopenDebt,totals,eligibleCredit,linkCredit,request,saveSource,removeSource,holdings,recoveryQuote,applyRecovery,finishRecovery,recoveryCredits,activeRecovery:()=>recoveryState(read().recoveries.find(r=>r.id===read().activeRecoveryId)||null),debtPaymentCheck});
})();
