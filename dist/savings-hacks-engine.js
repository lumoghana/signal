/* Optional standing instructions for sample Money Box savings. This local
   preview checks confirmed events and due dates while it is open. It never
   authorises an ordinary payment or changes that payment's review draft. */
(()=>{
'use strict';
if(L.savingsHacks?.version===1)return;
const kinds=['manual','roundup','spend','fixed','income'],cadences=['daily','weekly','monthly'];
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const nowISO=()=>new Date().toISOString();
const minor=value=>{const n=Number(value),p=Math.round(n*100);return Number.isFinite(n)&&Number.isSafeInteger(p)?p:NaN;};
const cash=value=>value/100;
const activeBox=id=>(L.state.goals||[]).find(g=>g.id===id&&!g.archived);
const ready=()=>!!L.state.onboarded&&!L.state.closed&&!L.state.locked;
const online=()=>!(typeof navigator!=='undefined'&&navigator.onLine===false)&&!(typeof document!=='undefined'&&document.querySelector?.('meta[name="lumo-shell-offline"]'))&&!(typeof L.platform?.canMoveMoney==='function'&&L.platform.canMoveMoney()===false);
const txById=id=>(L.state.txs||[]).find(t=>t.id===id);
const persist=()=>{try{L.save();}catch(_){/* Accounting results must survive display/storage failures. */}};
const store=()=>{
 let s=L.state.savingHacks;
 if(!s||s.version!==1||typeof s!=='object')s=L.state.savingHacks={version:1,rulesByBox:{},handled:{},events:[]};
 if(!s.rulesByBox||typeof s.rulesByBox!=='object'||Array.isArray(s.rulesByBox))s.rulesByBox={};
 if(!s.handled||typeof s.handled!=='object'||Array.isArray(s.handled))s.handled={};
 if(!Array.isArray(s.events))s.events=[];
 return s;
};
const fingerprint=r=>JSON.stringify([r.id,r.boxId,r.revision,r.kind,Number(r.value),r.cadence,r.startDate,Number(r.monthlyCap),Number(r.minBalance)]);
const consented=r=>r?.consent?.accepted===true&&r.consent.revision===r.revision&&r.consent.fingerprint===fingerprint(r);
const failure=(field,message)=>({ok:false,field,message});
function dateAtNine(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return NaN;
 const n=Date.parse(value+'T09:00:00.000Z');
 return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n:NaN;
}
function validate(input={},options={}){
 const boxId=options.boxId??input.boxId??'',requireBox=options.requireBox!==false,kind=input.kind||'manual';
 if(requireBox&&!activeBox(boxId))return failure('sh-kind','Choose an active Money Box.');
 if(!kinds.includes(kind))return failure('sh-kind','Choose a Savings hack or keep this box manual.');
 if(kind==='manual')return {ok:true,config:{boxId,kind,value:0,cadence:'',startDate:'',monthlyCap:100,minBalance:50}};
 const value=L.moneyInput(input.value,.01,kind==='fixed'?5000:kind==='roundup'?10:100);
 if(value===null||kind==='roundup'&&![1,5,10].includes(value))return failure('sh-value',kind==='roundup'?'Choose a GH₵1, GH₵5 or GH₵10 roundup.':kind==='fixed'?'Enter GH₵0.01 to GH₵5,000.00, using up to two decimal places.':'Enter a percentage from 0.01 to 100, using up to two decimal places.');
 const monthlyCap=L.moneyInput(input.monthlyCap??100,.01,5000),minBalance=L.moneyInput(input.minBalance??50,0,1000000);
 if(monthlyCap===null)return failure('sh-cap','Enter a monthly limit from GH₵0.01 to GH₵5,000.00.');
 if(minBalance===null)return failure('sh-buffer','Enter an Everyday Money buffer of GH₵0 to GH₵1,000,000.00.');
 let cadence='',startDate='';
 if(kind==='fixed'){
  cadence=input.cadence;startDate=String(input.startDate||'');
  if(!cadences.includes(cadence))return failure('sh-cadence','Choose daily, weekly or monthly saving.');
  const start=dateAtNine(startDate),old=store().rulesByBox[boxId];
  const retained=old?.kind==='fixed'&&old.startDate===startDate&&!old.cancelledAt;
  if(!Number.isFinite(start)||start<=Date.now()&&!retained)return failure('sh-start','Choose a future first saving date. Saving is checked from 9 am Ghana time.');
 }
 if(kind==='roundup'){
  const other=Object.values(store().rulesByBox).find(r=>r.boxId!==boxId&&r.enabled&&r.kind==='roundup'&&!r.cancelledAt&&activeBox(r.boxId));
  if(other)return failure('sh-kind','Roundups already save into '+(activeBox(other.boxId)?.name||'another Money Box')+'. Pause that hack or choose another.');
 }
 return {ok:true,config:{boxId,kind,value,cadence,startDate,monthlyCap,minBalance}};
}
function nextAfter(r,time){
 const start=dateAtNine(r.startDate);if(!Number.isFinite(start))return null;
 if(start>time)return new Date(start).toISOString();
 if(r.cadence!=='monthly'){
  const period=(r.cadence==='weekly'?7:1)*86400000;
  return new Date(start+(Math.floor((time-start)/period)+1)*period).toISOString();
 }
 const anchor=new Date(start),at=new Date(time),day=anchor.getUTCDate();
 let months=Math.max(0,(at.getUTCFullYear()-anchor.getUTCFullYear())*12+at.getUTCMonth()-anchor.getUTCMonth());
 const occurrence=n=>{const first=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+n,1,9));const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();return Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(day,last),9);};
 let next=occurrence(months);if(next<=time)next=occurrence(++months);
 return new Date(next).toISOString();
}
function configure(input={}){
 if(!ready())return failure('sh-kind','Sign in to an open demo account to change a Savings hack.');
 const checked=validate(input);if(!checked.ok)return checked;
 const c=checked.config;
 if(c.kind!=='manual'&&input.consent!==true)return failure('sh-consent','Confirm this automatic saving instruction before turning it on.');
 const s=store(),old=s.rulesByBox[c.boxId],at=nowISO();
 const rule={...c,id:old?.id||L.id('SHR'),revision:Number(old?.revision||0)+1,enabled:c.kind!=='manual',createdAt:old?.createdAt||at,updatedAt:at,excludedTxIds:(L.state.txs||[]).map(t=>t.id),consent:null};
 if(rule.enabled)rule.consent={accepted:true,at,revision:rule.revision,fingerprint:fingerprint(rule)};
 if(rule.kind==='fixed')rule.nextRunAt=dateAtNine(rule.startDate)>Date.now()?new Date(dateAtNine(rule.startDate)).toISOString():nextAfter(rule,Date.now());
 if(Number(activeBox(c.boxId)?.target)>0&&minor(activeBox(c.boxId).allocated)>=minor(activeBox(c.boxId).target)){rule.enabled=false;rule.stoppedReason='target';}
 s.rulesByBox[c.boxId]=rule;persist();return {ok:true,rule:clone(rule)};
}
const get=boxId=>clone(store().rulesByBox[boxId]||null);
function pause(boxId){
 if(!ready())return failure('sh-kind','Sign in to an open demo account to change a Savings hack.');
 const r=store().rulesByBox[boxId];if(!r)return failure('sh-kind','This Money Box has no Savings hack.');
 if(r.cancelledAt)return failure('sh-kind','This hack was cancelled. Add a new Savings hack to use this box again.');
 r.enabled=false;r.stoppedReason='paused';r.updatedAt=nowISO();persist();return {ok:true,rule:clone(r)};
}
function cancel(boxId){
 if(!ready())return failure('sh-kind','Sign in to an open demo account to change a Savings hack.');
 const r=store().rulesByBox[boxId];if(!r)return {ok:true,rule:null};
 if(!r.cancelledAt){
  r.enabled=false;r.stoppedReason='cancelled';r.cancelledAt=nowISO();r.updatedAt=r.cancelledAt;r.consent=null;delete r.nextRunAt;
  store().events.push({id:L.id('SHE'),key:'cancel:'+r.revision,ruleId:r.id,revision:r.revision,boxId:r.boxId,kind:r.kind,sourceTxId:'',requestedAmount:0,amount:0,status:'cancelled',reason:'cancelled',date:r.cancelledAt,sample:true});
  persist();
 }
 return {ok:true,rule:clone(r)};
}
function resume(boxId,input={}){
 const r=store().rulesByBox[boxId];
 if(!r||r.kind==='manual')return failure('sh-kind','Add a Savings hack first.');
 if(r.cancelledAt)return failure('sh-kind','This hack was cancelled. Add a new Savings hack to use this box again.');
 return configure({...r,consent:input.consent===true});
}
function describe(r){
 if(!r||r.kind==='manual'||r.cancelledAt)return 'Save manually';
 if(r.kind==='roundup')return 'Round spending up to the next GH₵'+r.value;
 if(r.kind==='spend')return 'Save '+r.value+'% of what you spend';
 if(r.kind==='income')return 'Save '+r.value+'% when money arrives';
 return 'Save GH₵'+Number(r.value).toFixed(2)+' '+r.cadence;
}
function quote(r,eventAmount){
 if(!r||r.kind==='manual')return 0;
 const amount=minor(eventAmount),value=minor(r.value);if(!Number.isSafeInteger(value)||value<=0)return 0;
 if(r.kind==='fixed')return cash(value);
 if(!Number.isSafeInteger(amount)||amount<=0)return 0;
 if(r.kind==='roundup')return cash((value-amount%value)%value);
 if(['spend','income'].includes(r.kind))return cash(Math.round(amount*value/10000));
 return 0;
}
const history=boxId=>clone(store().events.filter(e=>!boxId||e.boxId===boxId).slice().reverse());
function eligible(t){
 if(!t||t.status!=='success'||!['out','in'].includes(t.type)||!Number.isSafeInteger(minor(t.amount))||minor(t.amount)<=0)return false;
 if(t.internalTransfer||t.type==='internal'||L.isInternalTransfer?.(t)||t.boxId||t.boxDirection||t.migration||t.virtualCardTransfer||t.cardDirection||t.cardCreation||t.originalId||t.refundOf||t.reversalId||t.reversedFrom||t.sharedExpenseRepayment)return false;
 if(/refund|reversal/i.test(String(t.category||'')+' '+String(t.method||''))||/^(?:reverse|refund):/i.test(String(t.draftId||'')))return false;
 const d=L.state.paymentDraft,owned=d&&d.id===t.draftId;
 if(owned&&['box','virtualCard','virtualCardCreate'].includes(d.method))return false;
 if(/virtual card (?:top.up|fund|creation)/i.test(String(t.method||'')))return false;
 if(t.type==='in'&&t.fundingAccount==='virtual-card')return false;
 return true;
}
const keyFor=(r,key)=>r.id+':'+r.revision+'|'+key;
const draftFor=(r,key)=>'SH:'+r.id+':'+r.revision+'|'+key;
function monthlySaved(boxId,at){
 const month=new Date(at).toISOString().slice(0,7);
 return (L.state.txs||[]).filter(t=>t.status==='success'&&t.internalTransfer&&t.boxDirection==='in'&&t.boxId===boxId&&(t.savingsHack===true||String(t.draftId||'').startsWith('SH:'))&&String(t.savingsHackAt||t.date||t.updatedAt||'').slice(0,7)===month).reduce((sum,t)=>sum+Math.max(0,minor(t.amount)||0),0);
}
function stopAtTarget(boxId){
 const g=activeBox(boxId),r=store().rulesByBox[boxId];
 if(r?.enabled&&Number(g?.target)>0&&minor(g.allocated)>=minor(g.target)){r.enabled=false;r.stoppedReason='target';r.updatedAt=nowISO();}
}
function execute(r,key,sourceTxId,requestedAmount,at){
 const s=store(),handledKey=keyFor(r,key);if(s.handled[handledKey])return null;
 const event={id:L.id('SHE'),key,ruleId:r.id,revision:r.revision,boxId:r.boxId,kind:r.kind,sourceTxId:sourceTxId||'',requestedAmount,amount:0,status:'skipped',reason:'transfer-unavailable',date:new Date(at).toISOString(),sample:true};
 s.handled[handledKey]={status:'processing',eventId:event.id};persist();
 const finish=(reason,tx)=>{
  if(tx){event.status='saved';event.amount=cash(minor(tx.amount));event.transferId=tx.id;event.reason='saved';tx.savingsHack=true;tx.savingsHackRuleId=r.id;tx.savingsHackRevision=r.revision;tx.savingsHackBoxId=r.boxId;tx.savingsHackEventKey=key;tx.savingsHackAt=event.date;tx.savingsHackSourceTxId=sourceTxId||'';}
  else event.reason=reason;
  s.handled[handledKey]={status:event.status,eventId:event.id,at:event.date,amount:event.amount,transferId:event.transferId||''};s.events.push(event);stopAtTarget(r.boxId);persist();return clone(event);
 };
 let wanted=minor(requestedAmount),amount=0;
 const draftId=draftFor(r,key);
 try{
  if(!ready())return finish('instruction-unavailable');
  const g=activeBox(r.boxId);if(!g)return finish('box-unavailable');
  if(!r.enabled||r.cancelledAt)return finish('instruction-unavailable');
  if(!consented(r)){r.enabled=false;r.stoppedReason='changed';return finish('instruction-changed');}
  const checked=validate(r);if(!checked.ok){r.enabled=false;r.stoppedReason='invalid';return finish('instruction-invalid');}
  if(!Number.isSafeInteger(wanted)||wanted<=0)return finish('no-change');
  const cap=minor(r.monthlyCap)-monthlySaved(r.boxId,at);
  const target=Number(g.target)>0?minor(g.target)-minor(g.allocated):Infinity;
  if(target<=0){r.enabled=false;r.stoppedReason='target';return finish('target-reached');}
  if(cap<=0)return finish('monthly-cap');
  amount=Math.min(wanted,cap,target);
  const b=L.balances(),a=L.accountBalances(),room=minor(b.room),gap=minor(b.gap),available=minor(a.available),floor=minor(r.minBalance);
  if(![room,gap,available,floor].every(Number.isSafeInteger))return finish('balance-unavailable');
  if(gap>0||amount>Math.max(0,Math.min(room,available-floor)))return finish('budget-or-buffer');
  const tx=L.transferMoneyBox({id:r.boxId,direction:'in',amount:cash(amount),draftId,status:'success',name:'Savings hack · '+String(g.name||'Money Box'),note:describe(r)+' · sample automatic saving'});
  if(!tx||tx.status!=='success'||!tx.internalTransfer||tx.boxId!==r.boxId||tx.boxDirection!=='in'||minor(tx.amount)!==amount)return finish('transfer-unavailable');
  return finish('saved',tx);
 }catch(_){
  // A later wrapper/storage error may follow a successful ledger posting.
  // Reconcile the deterministic internal transfer before reporting a skip.
  const posted=(L.state.txs||[]).find(t=>t.draftId===draftId&&t.status==='success'&&t.internalTransfer&&t.boxId===r.boxId&&t.boxDirection==='in'&&amount>0&&minor(t.amount)===amount);
  return finish(posted?'saved':'transfer-unavailable',posted);
 }
}
let running=false;
const ordered=()=>Object.values(store().rulesByBox).filter(r=>r.enabled&&!r.cancelledAt).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))||String(a.boxId).localeCompare(String(b.boxId)));
function processConfirmed(txId){
 if(running||!ready()||!online())return [];
 const output=[];running=true;
 try{
  const tx=txById(txId);if(!eligible(tx))return output;
  for(const r of ordered()){
   if((r.excludedTxIds||[]).includes(tx.id))continue;
   if(!(tx.type==='out'&&['spend','roundup'].includes(r.kind)||tx.type==='in'&&r.kind==='income'))continue;
   const result=execute(r,'tx:'+tx.id,tx.id,quote(r,tx.amount),Date.now());if(result)output.push(result);
  }
 }catch(_){/* An optional instruction can never fail the source payment. */}
 finally{running=false;}
 try{L.paymentBudgetResult?.reconcileSavings(txId,store().events.filter(e=>e.sourceTxId===txId));}catch(_){/* Optional receipt detail cannot fail the source payment. */}
 return output;
}
function processDue(now=Date.now()){
 const at=Number(now);if(running||!ready()||!online()||!Number.isFinite(at))return [];
 const output=[];running=true;
 try{
  for(const r of ordered()){
   if(r.kind!=='fixed')continue;
   const due=Date.parse(r.nextRunAt||new Date(dateAtNine(r.startDate)).toISOString());if(!Number.isFinite(due)||due>at)continue;
   const result=execute(r,'schedule:'+new Date(due).toISOString(),'',quote(r,0),at);if(result)output.push(result);
   r.nextRunAt=nextAfter(r,at);r.updatedAt=new Date(at).toISOString();persist();
  }
 }catch(_){/* A local date check must not interrupt the preview. */}
 finally{running=false;}
 return output;
}
const transact=(fn,options)=>L.persistence?.transaction?L.persistence.transaction(fn,options):fn();
const confirmed=processConfirmed,dueProcess=processDue;
processConfirmed=function(...args){if(running||!ready()||!online())return [];try{return transact(()=>confirmed(...args),{financial:true,label:'Complete automatic saving'});}catch(_){return [];}};
processDue=function(...args){
 if(running||!ready()||!online())return [];let output;
 try{output=transact(()=>dueProcess(...args),{financial:true,label:'Complete scheduled saving'});}catch(_){return [];}
 if(output.some(e=>e.status==='saved'))try{window.dispatchEvent(new CustomEvent('lumo:savings-hack-due',{detail:{trigger:'due',records:clone(output)}}));}catch(_){}
 return output;
};
const addTx=L.addTx;
L.addTx=function(...args){return transact(()=>{const tx=addTx.apply(this,args);try{if(tx?.status==='success')processConfirmed(tx.id);}catch(_){}return tx;},{financial:true,label:'Complete this payment and automatic saving'});};
const resolveTx=L.resolveTx;
L.resolveTx=function(...args){return transact(()=>{const tx=resolveTx.apply(this,args);try{if(tx?.status==='success')processConfirmed(tx.id);}catch(_){}return tx;},{financial:true,label:'Confirm this payment and automatic saving'});};
const transfer=L.transferMoneyBox;
L.transferMoneyBox=function(...args){return transact(()=>{const tx=transfer.apply(this,args);try{if(tx?.status==='success'){stopAtTarget(tx.boxId);persist();}}catch(_){}return tx;},{financial:true,label:'Complete this Money Box transfer'});};
if(typeof L.archiveGoal==='function'){
 const archive=L.archiveGoal;
 L.archiveGoal=function(id,...args){const result=archive.call(this,id,...args);try{const g=(L.state.goals||[]).find(g=>g.id===id),r=store().rulesByBox[id];if(g?.archived&&r&&!r.cancelledAt){r.enabled=false;r.stoppedReason='archived';r.updatedAt=nowISO();persist();}}catch(_){}return result;};
}
 function overview(at=Date.now()){
  if(!ready())return {available:false,active:0,rules:[]};
  const rules=Object.values(store().rulesByBox).filter(r=>r.kind!=='manual'&&!r.cancelledAt&&activeBox(r.boxId)).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))||String(a.boxId).localeCompare(String(b.boxId))).map(r=>({boxId:r.boxId,name:activeBox(r.boxId).name,enabled:!!r.enabled,status:r.enabled?'On':r.stoppedReason==='target'?'Target reached':'Paused',kind:r.kind,value:Number(r.value),description:describe(r),monthlyCap:Number(r.monthlyCap),minBalance:Number(r.minBalance),savedThisMonth:cash(monthlySaved(r.boxId,at)),nextRunAt:r.kind==='fixed'?r.nextRunAt||'':'',last:history(r.boxId).find(e=>e.status!=='cancelled')||null}));
  return {available:true,active:rules.filter(r=>r.enabled).length,total:rules.length,spendPercent:cash(rules.filter(r=>r.enabled&&r.kind==='spend').reduce((n,r)=>n+minor(r.value),0)),incomePercent:cash(rules.filter(r=>r.enabled&&r.kind==='income').reduce((n,r)=>n+minor(r.value),0)),rules};
 }
 const change=(fn,label)=>(...args)=>{try{return transact(()=>fn(...args),{label});}catch(error){return failure('sh-kind',error.message||'This instruction could not be saved. Try again after resolving the saved-progress warning.');}};
 L.savingsHacks=Object.freeze({version:1,validate,configure:change(configure,'Save your Savings hack'),get,describe,quote,pause:change(pause,'Pause your Savings hack'),resume:change(resume,'Resume your Savings hack'),cancel:change(cancel,'Cancel your Savings hack'),history,processConfirmed,processDue,overview});
const due=()=>{try{processDue();}catch(_){}};
if(typeof setInterval==='function')setInterval(due,60000);
if(typeof setTimeout==='function')setTimeout(due,0);
if(typeof document!=='undefined'&&typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')due();});
if(typeof window!=='undefined'&&typeof window.addEventListener==='function')window.addEventListener('pageshow',due);
})();
