/* Virtual cards are simulated, separately funded GHS balances. Issuance and
   top-ups do not count as spending. Only a card purchase debits a card; an
   accepted issuer event never debits Everyday Money for that purchase again.
   No PAN, CVV, token or other usable card credential is stored in this demo. */
(()=>{
'use strict';
if(!window.L||L.virtualCards)return;
const LIMIT=2,MAX=5000;
const now=()=>new Date().toISOString();
const minor=value=>Math.round(Number(value)*100);
const cash=value=>value/100;
const validStatuses=new Set(['pending','success','failed']);
const allowed=()=>{
 if(L.platform?.requireOnline?.('Use a virtual card')===false)throw Error('Reconnect to use your virtual card. No money moved.');
 if(!L.state.onboarded||L.state.locked||L.state.closed)throw Error('Sign in to an open demo account before using a virtual card.');
 L.ensureAccounts?.();
};
const records=(s=L.state)=>Array.isArray(s.virtualCards)?s.virtualCards:[];
const ensure=()=>{
 if(L.state.virtualCards===undefined)L.state.virtualCards=[];
 if(!Array.isArray(L.state.virtualCards))throw Error('Your saved card records need review. No money moved.');
 return L.state.virtualCards;
};
const lookup=(id,s=L.state)=>records(s).find(card=>card.id===id)||null;
const txById=(id,s=L.state)=>(s.txs||[]).find(tx=>tx.id===id)||null;
const frozenCopy=value=>value?Object.freeze({...value}):null;
const visible=card=>card&&!['failed','closed','replaced'].includes(card.status);
const isCardTx=tx=>!!tx&&(tx.virtualCardTransfer===true||tx.fundingAccount==='virtual-card');
const money=value=>{
 const amount=L.moneyInput(value,.01,MAX);
 if(amount===null)throw Error('Enter GH₵0.01 to GH₵5,000.00, with no more than two decimal places.');
 return amount;
};
const validateStatus=status=>{if(!validStatuses.has(status))throw Error('Choose a valid simulated card result.');};
const getCard=(id,{spendable=false}={})=>{
 const card=lookup(id);
 if(!card||!['active','frozen'].includes(card.status))throw Error('This virtual card is not available yet.');
 if(spendable&&card.status==='frozen')throw Error('This card is frozen. Unfreeze it before adding money or making a new purchase.');
 if(!Number.isFinite(Number(card.balance))||Number(card.balance)<0)throw Error('This card balance needs review. No money moved.');
 return card;
};
const pendingPurchases=(id,s=L.state,except='')=>(s.txs||[]).filter(tx=>tx.id!==except&&tx.fundingAccount==='virtual-card'&&tx.cardId===id&&tx.type==='out'&&tx.status==='pending');
const cardHold=(id,s=L.state,except='')=>[...pendingPurchases(id,s,except),...(s.txs||[]).filter(tx=>tx.id!==except&&tx.virtualCardTransfer&&tx.cardDirection==='out'&&tx.cardId===id&&tx.status==='pending')].reduce((sum,tx)=>sum+minor(tx.amount)+minor(tx.fee||0),0);
const pendingFunding=(id,s=L.state)=>(s.txs||[]).filter(tx=>tx.virtualCardTransfer&&tx.cardDirection==='in'&&(!id||tx.cardId===id)&&tx.status==='pending').reduce((sum,tx)=>sum+minor(tx.amount),0);
// This mirrors the shared operational hold definition for the execution-time
// recheck. Root's account and Pause authorities expose the same pending facts.
const operationalHeld=(s=L.state,except='')=>(s.txs||[]).filter(tx=>tx.id!==except&&tx.status==='pending'&&tx.fundingAccount!=='virtual-card'&&(tx.type==='out'||tx.internalTransfer&&(tx.boxDirection==='in'||tx.cardDirection==='in'))).reduce((sum,tx)=>sum+minor(tx.amount)+minor(tx.fee||0),0);
const usableOperational=(s=L.state,except='')=>Math.max(0,minor(s.balance||0)-operationalHeld(s,except));
const findDuplicate=(draftId)=>draftId?(L.state.txs||[]).find(tx=>isCardTx(tx)&&tx.draftId===draftId):null;
const draftKey=value=>String(value||L.id('card-draft')).slice(0,160);
const save=()=>{L.save();L.dailyInsights?.sync?.();};
const cardBalance=(id,s=L.state)=>{
 const card=lookup(id,s),balance=card?Math.max(0,minor(card.balance||0)):0,held=cardHold(id,s);
 return Object.freeze({balance:cash(balance),held:cash(held),available:cash(Math.max(0,balance-held)),pendingFunding:cash(pendingFunding(id,s))});
};
const totals=(s=L.state)=>{
 const cards=records(s).filter(visible),balance=cards.reduce((sum,card)=>sum+Math.max(0,minor(card.balance||0)),0),held=cards.reduce((sum,card)=>sum+cardHold(card.id,s),0);
 return Object.freeze({balance:cash(balance),held:cash(held),available:cash(Math.max(0,balance-held)),pendingFunding:cash(pendingFunding('',s)),count:cards.length,slotsLeft:Math.max(0,LIMIT-cards.length)});
};
const cleanName=(name,fallback='Virtual card')=>String(name??'').trim().replace(/\s+/g,' ').slice(0,32)||fallback;
const acceptedCard=card=>card&&['active','frozen'].includes(card.status);
const makeTx=(details)=>({id:L.id('VC'),date:now(),fee:0,category:'Other',simulated:true,...details});
function apply(tx,except=''){
 // A new card stays unusable until its first funding succeeds. Only this
 // accepted creation event can promote an issuing card into an active one.
 const historicalRefund=tx.type==='in'&&tx.fundingAccount==='virtual-card';
 const card=tx.cardCreation||historicalRefund?lookup(tx.cardId):getCard(tx.cardId);
 if(!card)throw Error('The original card record is unavailable. No money moved.');
 if(tx.cardCreation&&(!card||card.status!=='issuing'||card.creationTxId!==tx.id||Number(card.balance)!==0))throw Error('This card creation can no longer be completed.');
 const amount=minor(tx.amount),balance=minor(card.balance),fee=minor(tx.fee||0);
 if(tx.virtualCardTransfer){
  if(tx.cardDirection==='out'){
   if(amount>Math.max(0,balance-cardHold(card.id,L.state,except)))throw Error('Not enough unheld money on this card.');
   card.balance=cash(balance-amount);L.state.balance=cash(minor(L.state.balance)+amount);
  }else{
   if(tx.cardDirection!=='in')throw Error('Choose a valid card transfer direction.');
   if(amount+fee>usableOperational(L.state,except))throw Error('Not enough available Everyday Money.');
   L.state.balance=cash(minor(L.state.balance)-amount-fee);card.balance=cash(balance+amount);
  }
  if(tx.cardCreation)card.status='active';
 }else if(tx.type==='out'){
  if(amount+fee>Math.max(0,balance-cardHold(card.id,L.state,except)))throw Error('Not enough available money on this card.');
  card.balance=cash(balance-amount-fee);
 }else if(tx.type==='in'){
  const original=txById(tx.originalId);
  if(!original||original.fundingAccount!=='virtual-card'||original.type!=='out'||original.cardId!==card.id||original.status!=='success'||minor(original.amount)!==amount)throw Error('This sample purchase can no longer be refunded.');
  if(['closed','replaced'].includes(card.status)){L.state.balance=cash(minor(L.state.balance)+amount);tx.refundAccount='operational';tx.destination='Everyday Money · original card closed';}
  else card.balance=cash(balance+amount);original.refunded=cash(amount);original.status='reversed';original.updatedAt=now();original.refundId=tx.id;
 }else throw Error('Invalid virtual card event.');
 card.revision=Number(card.revision||0)+1;card.updatedAt=now();
}
function issue({name='',draftId,status='success'}={}){
 allowed();validateStatus(status);const cards=ensure(),key=draftKey(draftId),prior=cards.find(card=>card.draftId===key);
 if(prior)return frozenCopy(prior);
 if(cards.filter(visible).length>=LIMIT)throw Error('You can have a maximum of two virtual cards. Frozen and issuing cards count towards this limit.');
 const sequence=cards.length+1,card={id:L.id('card'),draftId:key,name:cleanName(name,'Virtual card '+(cards.filter(visible).length+1)),last4:String(1000+sequence).slice(-4).padStart(4,'0'),currency:'GHS',balance:0,limit:MAX,status:status==='pending'?'issuing':status==='failed'?'failed':'active',revision:1,createdAt:now(),simulated:true};
 cards.push(card);save();return frozenCopy(card);
}
function resolveIssue(id,status){
 allowed();const card=lookup(id);if(!card||card.status!=='issuing')return frozenCopy(card);
 if(!['success','failed'].includes(status))return frozenCopy(card);
 if(card.creationTxId){
  const tx=txById(card.creationTxId);
  if(!tx?.cardCreation)throw Error('The first funding record is unavailable. No money moved.');
  resolve(tx.id,status);return frozenCopy(card);
 }
 card.status=status==='success'?'active':'failed';card.revision=Number(card.revision||0)+1;card.updatedAt=now();save();return frozenCopy(card);
}
function createFunded({name='',amount,draftId,status='success'}={}){
 allowed();validateStatus(status);
 const value=money(amount),key=draftKey(draftId),prior=findDuplicate(key);
 if(prior){if(!prior.cardCreation)throw Error('This reference belongs to another card action.');return prior;}
 const cards=records();
 if(cards.some(card=>card.draftId===key))throw Error('This creation reference has already been used.');
 if(cards.filter(visible).length>=LIMIT)throw Error('You can have a maximum of two virtual cards. Frozen and issuing cards count towards this limit.');
 if(!Number.isFinite(Number(L.state.balance))||Number(L.state.balance)<0)throw Error('Your Everyday Money balance needs review. No money moved.');
 if(minor(value)>usableOperational())throw Error('Not enough available Everyday Money for the first top-up.');
 // Validate every input before adding either record. Failed simulated requests
 // keep a recoverable attempt but never leave an active empty card behind.
 const sequence=cards.length+1,card={id:L.id('card'),draftId:key,name:cleanName(name,'Virtual card '+(cards.filter(visible).length+1)),last4:String(1000+sequence).slice(-4).padStart(4,'0'),currency:'GHS',balance:0,limit:MAX,status:status==='failed'?'failed':'issuing',revision:1,createdAt:now(),simulated:true,initialFundingAmount:value};
 const tx=makeTx({draftId:key,type:'internal',internalTransfer:true,virtualCardTransfer:true,cardCreation:true,cardId:card.id,cardDirection:'in',name:card.name,amount:value,status,category:'Transfers',method:'Virtual card creation and top-up',note:'First funding from Everyday Money. Not spending.',destination:'Demo card · '+card.last4});
 card.creationTxId=tx.id;
 ensure().push(card);
 if(status==='success')apply(tx);
 L.state.txs.unshift(tx);save();return tx;
}
function fund({cardId,amount,draftId,status='success',name,note}={}){
 allowed();validateStatus(status);const prior=findDuplicate(draftId);if(prior)return prior;
 const card=getCard(cardId,{spendable:true}),value=money(amount);
 if(['pending','success'].includes(status)&&minor(value)>usableOperational())throw Error('Not enough available Everyday Money.');
 const tx=makeTx({draftId:draftKey(draftId),type:'internal',internalTransfer:true,virtualCardTransfer:true,cardId:card.id,cardDirection:'in',name:String(name||'To '+card.name).slice(0,96),amount:value,status,category:'Transfers',method:'Virtual card top-up',note:String(note||'Moved from Everyday Money. Not spending.').slice(0,120),destination:'Demo card · '+card.last4});
 if(status==='success')apply(tx);L.state.txs.unshift(tx);save();return tx;
}
function purchase({cardId,name='Sample online purchase',amount,category='Other',essentialId='',draftId,status='success'}={}){
 allowed();validateStatus(status);const prior=findDuplicate(draftId);if(prior)return prior;
 const card=getCard(cardId,{spendable:true}),value=money(amount),limit=L.moneyInput(card.limit,.01,MAX);
 if(limit===null||value>limit+.001)throw Error('This purchase exceeds the card’s online payment limit.');
 if(['pending','success'].includes(status)&&minor(value)>Math.max(0,minor(card.balance)-cardHold(card.id)))throw Error('Not enough available money on this card.');
 const essential=essentialId?(L.state.essentials||[]).find(item=>item.id===essentialId&&!item.deleted&&!item.archived):null;
 if(essentialId&&!essential)throw Error('Choose a Budget item that is still available.');
 // The student's explicit Budget purpose has the same precedence here as in
 // Campus Pay. Merchant metadata cannot classify one cost while fulfilling
 // a different saved item. The shared predictor owns the seven-category labels.
 const chosen=essential?L.predictCategory?.({method:'virtualCardPurchase',essentialId:essential.id,name,category}):null;
 const fixed=essential?L.budgetCategories?.resolve(essential):null;
 const purpose=essential?chosen?.category||fixed?.name||String(essential.name||'Other'):String(category||'Other').trim().slice(0,40)||'Other';
 const categoryMeta=essential?{...chosen,category:purpose,source:'budget-source',confidence:'confirmed',purpose:essential.name,budgetLineId:essential.id,...(fixed?{budgetCategory:fixed.id}:{}),version:1}:{category:purpose,source:'simulated-card-merchant',confidence:purpose==='Other'?'unknown':'high',version:1};
 const tx=makeTx({draftId:draftKey(draftId),type:'out',fundingAccount:'virtual-card',cardId:card.id,name:String(name||'Sample online purchase').trim().slice(0,96),amount:value,status,category:purpose,categoryMeta,method:'Virtual card',destination:'Demo card · '+card.last4,...(essential?{essentialId:essential.id,budgetSource:{type:'budget-line',id:essential.id,name:essential.name}}:{})});
 if(status==='success')apply(tx);L.state.txs.unshift(tx);save();
 if(status==='success')try{L.savingsHacks?.processConfirmed?.(tx.id);}catch(_){}
 return tx;
}
function refund({originalId,amount,draftId,status='success'}={}){
 allowed();validateStatus(status);const prior=findDuplicate(draftId);if(prior)return prior;
 const original=txById(originalId);
 if(!original||original.fundingAccount!=='virtual-card'||original.type!=='out'||original.status!=='success')throw Error('Choose a completed virtual card purchase to refund.');
 const originalCard=lookup(original.cardId);if(!originalCard||!['active','frozen','closed','replaced'].includes(originalCard.status))throw Error('The original card is not available for refund review.');const value=money(amount===undefined?original.amount:amount);
 if(minor(value)!==minor(original.amount))throw Error('This prototype refunds a sample purchase in full.');
 const previous=(L.state.txs||[]).find(tx=>tx.fundingAccount==='virtual-card'&&tx.type==='in'&&tx.originalId===original.id&&['pending','success'].includes(tx.status));
 if(previous)return previous;
 const tx=makeTx({draftId:draftKey(draftId),type:'in',fundingAccount:'virtual-card',cardId:original.cardId,originalId:original.id,name:'Refund · '+original.name,amount:value,status,category:original.category,method:'Virtual card refund',destination:'Demo card · '+lookup(original.cardId).last4});
 if(status==='success')apply(tx);L.state.txs.unshift(tx);save();return tx;
}
function resolve(id,status){
 allowed();const tx=txById(id);
 if(!isCardTx(tx)||tx.status!=='pending'||!['success','failed','reversed'].includes(status))return tx;
 // Accepted events can settle after freezing; freezing blocks new requests.
 if(status==='success')apply(tx,tx.id);
 if(tx.cardCreation&&status!=='success'){
  const card=lookup(tx.cardId);if(card){card.status='failed';card.revision=Number(card.revision||0)+1;card.updatedAt=now();}
 }
 tx.status=status;tx.updatedAt=now();save();
 if(status==='success')try{L.savingsHacks?.processConfirmed?.(tx.id);}catch(_){}
 return tx;
}
// Card lifecycle writes are one saved unit. A failed browser save restores
// both balances, records and slot availability; retry uses the same reference.
let atomicDepth=0;
function atomic(fn){
 if(L.persistence?.transaction)return L.persistence.transaction(fn,{financial:true,label:'Save card activity'});
 if(atomicDepth)return fn();
 const before=JSON.parse(JSON.stringify(L.state)),saveOriginal=L.save,toastOriginal=L.toast;let failed=false;
 atomicDepth++;L.save=()=>true;
 try{const result=fn();L.save=saveOriginal;L.toast=function(message,...args){if(String(message).includes('Your browser could not save progress'))failed=true;return toastOriginal?.call(this,message,...args);};if(saveOriginal.call(L)===false||failed)throw Error('This card action could not be saved. No money moved. Review it again.');return result;}
 catch(error){L.state=before;throw error;}
 finally{L.save=saveOriginal;L.toast=toastOriginal;atomicDepth--;}
}
function lifecycle(id){
 const card=lookup(id),pending=(L.state.txs||[]).filter(t=>t.cardId===id&&t.status==='pending');
 return Object.freeze({pending:pending.length,canClose:!!card&&['active','frozen'].includes(card.status)&&!pending.length,canReturn:!!card&&['active','frozen'].includes(card.status)&&cardBalance(id).available>0,available:cardBalance(id).available});
}
function returnFunds({cardId,amount,draftId,status='success'}={}){
 allowed();validateStatus(status);const key=draftKey(draftId),prior=findDuplicate(key);
 if(prior){if(prior.cardDirection!=='out'||prior.cardId!==cardId||minor(prior.amount)!==minor(amount))throw Error('This reference belongs to another card action.');return prior;}
 const card=getCard(cardId),value=L.moneyInput(amount,.01,cardBalance(cardId).available);
 if(value===null)throw Error('Choose an amount within the unheld money on this card.');
 if(minor(value)>minor(cardBalance(card.id).available))throw Error('Only unheld card money can return to Everyday Money.');
 return atomic(()=>{
  const tx=makeTx({draftId:key,type:'internal',internalTransfer:true,virtualCardTransfer:true,cardId:card.id,cardDirection:'out',name:'From '+card.name,amount:value,status,category:'Transfers',method:'Virtual card return',note:'Returned to Everyday Money. Not income.',destination:'Everyday Money'});
  if(status==='success')apply(tx);L.state.txs.unshift(tx);save();return tx;
 });
}
function endCard({cardId,draftId,replace=false}={}){
 allowed();const key=draftKey(draftId),old=lookup(cardId);
 if(!old)throw Error('This card is unavailable.');
 if(old.closedByDraftId===key){if(!!old.replacementCardId!==!!replace)throw Error('This reference belongs to another card action.');return Object.freeze({card:frozenCopy(old),replacement:frozenCopy(lookup(old.replacementCardId)),tx:txById(old.returnTxId)});}
 getCard(cardId);if(!lifecycle(cardId).canClose)throw Error('Wait for pending card activity to finish before closing or replacing this card.');
 if(records().some(c=>c.closedByDraftId===key))throw Error('This reference belongs to another card action.');
 return atomic(()=>{
  const amount=cardBalance(cardId).available,tx=amount>0?returnFunds({cardId,amount,draftId:key+':return'}):null;
  old.status=replace?'replaced':'closed';old.closedByDraftId=key;old.closedAt=now();old.returnTxId=tx?.id||'';old.revision=Number(old.revision||0)+1;
  const replacement=replace?issue({name:old.name,draftId:key+':replacement'}):null;
  if(replacement){old.replacementCardId=replacement.id;lookup(replacement.id).replacesCardId=old.id;lookup(replacement.id).limit=old.limit;}
  save();return Object.freeze({card:frozenCopy(old),replacement,tx});
 });
}
function close(options){return endCard({...options,replace:false});}
function replace(options){return endCard({...options,replace:true});}
function rename(id,name){allowed();const card=getCard(id);card.name=cleanName(name,card.name);card.revision=Number(card.revision||0)+1;card.updatedAt=now();save();return frozenCopy(card);}
function freeze(id,value=true){allowed();const card=getCard(id);card.status=value?'frozen':'active';card.revision=Number(card.revision||0)+1;card.updatedAt=now();save();return frozenCopy(card);}
function setLimit(id,amount){allowed();const card=getCard(id),value=money(amount);card.limit=value;card.revision=Number(card.revision||0)+1;card.updatedAt=now();save();return frozenCopy(card);}
const addTx=L.addTx;
L.addTx=function(data){
 const d=L.state.paymentDraft,owned=d?.method==='virtualCard'&&d.id===data?.draftId;
 if(d?.method==='virtualCardCreate'&&d.id===data?.draftId)return atomic(()=>createFunded({name:d.cardName||d.name,amount:data.amount,draftId:data.draftId,status:data.status||'success'}));
 if(data?.virtualCardTransfer&&data?.cardDirection==='out')return atomic(()=>returnFunds(data));
 if(owned||data?.virtualCardTransfer)return atomic(()=>fund({cardId:data?.cardId||d?.cardId,amount:data?.amount,draftId:data?.draftId,status:data?.status||'success',name:data?.name,note:data?.note}));
 if(data?.fundingAccount==='virtual-card')return atomic(()=>data.type==='in'?refund(data):purchase(data));
 return addTx.apply(this,arguments);
};
const resolveTx=L.resolveTx;
L.resolveTx=function(id,status){return isCardTx(txById(id))?atomic(()=>resolve(id,status)):resolveTx.apply(this,arguments);};
L.virtualCards=Object.freeze({version:2,maxCards:LIMIT,maxAmount:MAX,list:(s=L.state)=>Object.freeze(records(s).filter(visible).map(frozenCopy)),get:(id,s=L.state)=>frozenCopy(lookup(id,s)),balance:cardBalance,balances:cardBalance,totals,isCardTx,issue:(...args)=>atomic(()=>issue(...args)),createFunded:(...args)=>atomic(()=>createFunded(...args)),resolveIssue:(...args)=>atomic(()=>resolveIssue(...args)),fund:(...args)=>atomic(()=>fund(...args)),purchase:(...args)=>atomic(()=>purchase(...args)),refund:(...args)=>atomic(()=>refund(...args)),resolve:(...args)=>atomic(()=>resolve(...args)),rename:(...args)=>atomic(()=>rename(...args)),freeze:(...args)=>atomic(()=>freeze(...args)),setLimit:(...args)=>atomic(()=>setLimit(...args)),returnFunds,close,replace,lifecycle,history:(s=L.state)=>Object.freeze(records(s).filter(card=>['closed','replaced'].includes(card.status)).map(frozenCopy))});
})();
