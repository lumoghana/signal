/* Operational money and savings are separate ledgers. Money Boxes subdivide
   savings; internal movements never count as spending or received income. */
(()=>{
'use strict';
const minor=value=>{const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.round(n*100)):0;};
const cash=value=>value/100;
const signed=value=>{const n=Number(value);return Number.isFinite(n)?Math.round(n*100):0;};
const isInternal=t=>!!t?.internalTransfer||t?.type==='internal';
const operationalHold=(s,except='')=>(s.txs||[]).filter(t=>t.id!==except&&t.status==='pending'&&t.fundingAccount!=='virtual-card'&&(t.type==='out'||isInternal(t)&&(t.boxDirection==='in'||t.cardDirection==='in'))).reduce((sum,t)=>sum+minor(t.amount)+minor(t.fee),0);
const boxHold=(id,s,except='')=>(s.txs||[]).filter(t=>t.id!==except&&t.status==='pending'&&isInternal(t)&&t.boxId===id&&t.boxDirection==='out').reduce((sum,t)=>sum+minor(t.amount),0);
const savingsNumber=number=>{
 const digits=String(number||'9300123456').replace(/\D/g,'').slice(-10).padStart(10,'0');
 return String((Number(digits)+1)%10000000000).padStart(10,'0');
};
L.ensureAccounts=(s=L.state)=>{
 if(!s?.onboarded)return s?.accounts||null;
 s.profile=s.profile||{};s.goals=Array.isArray(s.goals)?s.goals:[];s.txs=Array.isArray(s.txs)?s.txs:[];
 if(s.accounts?.version!==2){
  const operational=String(s.profile.account||'9300123456');let savings=String(s.profile.savingsAccount||savingsNumber(operational));
  if(savings===operational)savings=savingsNumber(operational);
  const before=signed(s.balance),held=operationalHold(s);let capacity=Math.max(0,before-held),moved=0;
  for(const box of s.goals){
   const intended=minor(box.allocated),funded=Math.min(intended,capacity);capacity-=funded;moved+=funded;
   box.allocated=cash(funded);box.boxVersion=2;
   if(intended>funded)box.legacyUnfunded=cash(intended-funded);
   if(funded)s.txs.unshift({id:L.id('MBM'),draftId:'box-migration:'+String(box.id||s.txs.length),date:new Date().toISOString(),type:'internal',internalTransfer:true,boxId:box.id,boxDirection:'in',name:'Money Box · '+String(box.name||'Savings'),amount:cash(funded),fee:0,status:'success',category:'Savings',method:'Money Box transfer',migration:true,note:'Existing goal allocation moved into savings.'});
  }
  s.balance=cash(before-moved);
  s.accounts={version:2,operational:{number:operational,name:'Lumo operational account'},savings:{number:savings,name:'Lumo savings account'},createdAt:new Date().toISOString(),migration:{operationalBefore:cash(before),moved:cash(moved),unfunded:cash(s.goals.reduce((sum,g)=>sum+minor(g.legacyUnfunded),0))}};
  s.profile.account=operational;s.profile.savingsAccount=savings;
 }
 for(const box of s.goals)box.boxVersion=2;
 return s.accounts;
};
L.accountBalances=(s=L.state)=>{
 L.ensureAccounts(s);
 const boxes=(s.goals||[]).map(box=>{const balance=minor(box.allocated),held=boxHold(box.id,s);return {id:box.id,name:box.name,balance:cash(balance),held:cash(held),available:cash(Math.max(0,balance-held))};});
 const operational=signed(s.balance),held=operationalHold(s),savings=boxes.reduce((sum,box)=>sum+minor(box.balance),0),savingsHeld=boxes.reduce((sum,box)=>sum+minor(box.held),0);
 return {operational:cash(operational),held:cash(held),available:cash(Math.max(0,operational-held)),savings:cash(savings),savingsHeld:cash(savingsHeld),savingsAvailable:cash(Math.max(0,savings-savingsHeld)),total:cash(operational+savings),boxes,operationalNumber:s.accounts?.operational?.number||s.profile?.account||'',savingsNumber:s.accounts?.savings?.number||s.profile?.savingsAccount||''};
};
L.moneyBoxAvailable=(id,s=L.state)=>L.accountBalances(s).boxes.find(box=>box.id===id)?.available||0;
L.isInternalTransfer=isInternal;
const authorized=()=>{if(!L.state.onboarded||L.state.closed||L.state.locked)throw Error('Sign in to an open demo account before moving money');L.ensureAccounts();};
function apply(tx,except=''){
 const s=L.state,box=s.goals.find(g=>g.id===tx.boxId);if(!box)throw Error('Money Box unavailable');
 const amount=minor(tx.amount),operational=signed(s.balance),saved=minor(box.allocated);
 if(tx.boxDirection==='in'){
  if(amount>Math.max(0,operational-operationalHold(s,except)))throw Error('Not enough available operational money');
  s.balance=cash(operational-amount);box.allocated=cash(saved+amount);
 }else{
  if(amount>Math.max(0,saved-boxHold(box.id,s,except)))throw Error('Not enough available money in this Money Box');
  box.allocated=cash(saved-amount);s.balance=cash(operational+amount);
 }
}
L.transferMoneyBox=({id,direction='in',amount,draftId,status='success',name,note}={})=>{
 authorized();const s=L.state;
 if(draftId){const prior=s.txs.find(t=>isInternal(t)&&t.draftId===draftId);if(prior)return prior;}
 const box=s.goals.find(g=>g.id===id);if(!box)throw Error('Money Box unavailable');
 if(!['in','out'].includes(direction)||!['pending','success','failed'].includes(status))throw Error('Invalid Money Box movement');
 const value=L.moneyInput(amount,.01,5000);if(value===null)throw Error('Enter GH₵0.01 to GH₵5,000.00');
 const available=direction==='in'?L.accountBalances().available:L.moneyBoxAvailable(id);
 if(['pending','success'].includes(status)&&value>available+.001)throw Error(direction==='in'?'Not enough available operational money':'Not enough available money in this Money Box');
 const tx={id:L.id('MB'),draftId:draftId||L.id('box-draft'),date:new Date().toISOString(),type:'internal',internalTransfer:true,boxId:id,boxDirection:direction,name:name||((direction==='in'?'To ':'From ')+box.name),amount:value,fee:0,status,category:'Savings',method:'Money Box transfer',note:note||'',destination:direction==='in'?s.accounts.savings.number:s.accounts.operational.number};
 if(status==='success')apply(tx);
 s.txs.unshift(tx);L.save();return tx;
};
const addTx=L.addTx;
L.addTx=data=>{
 const d=L.state.paymentDraft,owned=d&&d.id===data.draftId&&d.method==='box';
 if(isInternal(data)||data.boxId||owned)return L.transferMoneyBox({id:data.boxId||d?.boxId,direction:data.boxDirection||d?.boxDirection||d?.direction||'in',amount:data.amount,draftId:data.draftId,status:data.status,name:data.name,note:data.note});
 return addTx(data);
};
const resolve=L.resolveTx;
L.resolveTx=(id,status)=>{
 const tx=L.state.txs.find(t=>t.id===id);if(!tx||!isInternal(tx))return resolve(id,status);
 if(tx.status!=='pending'||!['success','failed','reversed'].includes(status))return tx;
 if(status==='success')apply(tx,tx.id);
 tx.status=status;tx.updatedAt=new Date().toISOString();L.save();return tx;
};
L.reverseMoneyBoxTransfer=id=>{
 authorized();const tx=L.state.txs.find(t=>t.id===id);if(!isInternal(tx)||tx.status!=='success')return tx;
 const result=L.transferMoneyBox({id:tx.boxId,direction:tx.boxDirection==='in'?'out':'in',amount:tx.amount,draftId:'reverse:'+tx.id,name:'Returned · '+tx.name});
 tx.status='reversed';tx.reversalId=result.id;result.originalId=tx.id;L.save();return result;
};
const save=L.save;L.save=()=>{L.ensureAccounts();return save();};
const balances=L.balances;L.balances=()=>{L.ensureAccounts();const b=balances();if(L.state.accounts?.version===2){const a=L.accountBalances();return {...b,savings:a.savings,total:a.total,savingsHeld:a.savingsHeld,savingsAvailable:a.savingsAvailable};}return b;};
L.ensureAccounts();
})();
