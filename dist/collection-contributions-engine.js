/* Collection funding uses the existing Everyday-payment review, Pause and
   PIN/biometric authorisation. Sample receipts for other people stay separate. */
(()=>{
'use strict';
if(!window.L||!L.groupMoney||L.collectionContributions)return;
const G=L.groupMoney,now=()=>new Date().toISOString(),cash=n=>Math.round(n)/100;
const isContribution=d=>d?.method==='collection';
const account=()=>String(L.state.profile?.account||L.state.profile?.handle||L.state.profile?.phone||'');
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const fail=error=>({ok:false,error});
const tx=id=>(L.state.txs||[]).find(t=>t.id===id);
const cents=v=>{const n=G.cents(v);return Number.isSafeInteger(n)&&n>0&&n<=500000?n:null;};
let reviews=new WeakMap(),authorising=null,refunding=null,atomicDepth=0;
function atomic(fn){
 if(L.persistence?.transaction)return L.persistence.transaction(fn,{financial:true,label:'Save collection contribution'});
 if(atomicDepth)return fn();
 const before=JSON.parse(JSON.stringify(L.state)),save=L.save;
 atomicDepth++;L.save=()=>true;
 try{
  const result=fn();L.save=save;
  if(save.call(L)===false)throw Error('Your contribution could not be saved. Review it again before paying.');
  return result;
 }catch(error){L.state=before;reviews=new WeakMap();throw error;}
  finally{L.save=save;atomicDepth--;}
}
const pending=(id,except='')=>(L.state.txs||[]).filter(t=>t.id!==except&&t.collectionContribution===true&&t.collectionId===id&&t.status==='pending').reduce((n,t)=>{const amount=G.cents(t.amount);return n+(Number.isSafeInteger(amount)&&amount>0?amount:Number.MAX_SAFE_INTEGER);},0);
function destination(item){
 const m=G.mandateSummary(item),a=G.access(item);
 return JSON.stringify([account(),item?.ownerKey,item?.id,item?.title,item?.collectionAccount?.reference,item?.targetCents,item?.deadline,item?.mandateFingerprint,m?.version,m?.memberCount,m?.approverIds,m?.requiredApprovals,item?.people,item?.mandateAcceptances,a.localPersonId]);
}
function facts(d,{settling=false,except=''}={}){
 if(!allowed())return fail('Sign in to your open account before contributing.');
 if(!isContribution(d))return fail('Open a collection contribution first.');
 const item=G.get(d.collectionId),m=G.mandateSummary(item),a=G.access(item),s=item&&G.summary(item);
 if(!item||item.type!=='collection'||!m?.valid||!a.canView)return fail('This collection or its mandate is unavailable.');
 if(d.collectionPersonId!==a.localPersonId||d.collectionAccountOwner!==account())return fail('You can contribute only as yourself from your own account.');
 if(!m.allAccepted)return fail('Every member must accept the mandate before contributing.');
 if(['cancelled','refunded'].includes(item.status)||!settling&&!s.canReceive)return fail('This collection is not accepting contributions.');
 if(d.name!==item.title||d.destination!==item.collectionAccount?.reference||d.provider!=='Collection account'||d.fee!==0||d.essentialId)return fail('The contribution details changed. Open the collection and review a new payment.');
 const amount=cents(d.amount),remaining=Math.max(0,s.remainingCents-pending(item.id,except)),available=Math.round(L.balances().available*100);
 const out={itemId:item.id,personId:a.localPersonId,title:item.title,reference:item.collectionAccount.reference,amountCents:amount||0,feeCents:0,totalCents:amount||0,remainingCents:remaining,availableCents:available,balanceAfterCents:available-(amount||0),collectionBalanceCents:s.balanceCents,mandateVersion:m.version,binding:destination(item)};
 if(amount===null)return {...out,...fail('Enter GH₵0.01 to GH₵5,000.00, using no more than two decimal places.')};
 if(amount>remaining)return {...out,...fail('Enter no more than '+L.money(cash(remaining))+' towards this collection’s remaining target.')};
 if(!settling&&amount>available)return {...out,...fail('There is not enough available Everyday money for this contribution.')};
 return {ok:true,...out};
}
const quote=d=>facts(d||L.state.paymentDraft);
const scope=(d,q)=>JSON.stringify([q.binding,q.amountCents,q.remainingCents,q.availableCents,d.id,d.name,d.destination,d.provider,d.category,d.essentialId,d.collectionPersonId,d.collectionAccountOwner,d.note]);
function review(d=L.state.paymentDraft){
 const q=quote(d);
 if(q.ok&&!document.hidden&&['paymentReview','pause'].includes(L.route))reviews.set(d,{state:L.state,scope:scope(d,q),expires:Date.now()+5*60*1000});
 return q;
}
function current(d=L.state.paymentDraft){
 const q=quote(d),r=d&&reviews.get(d);
 return !!q.ok&&!!r&&r.state===L.state&&r.expires>Date.now()&&r.scope===scope(d,q);
}
function start(itemId,amount='',{replaceDraft}={}){
 if(!allowed())return fail('Sign in before contributing.');
 const item=G.get(itemId),a=G.access(item),m=G.mandateSummary(item),s=item&&G.summary(item);
 if(!item||item.type!=='collection'||!m?.valid||!a.canContribute||!s.canReceive)return fail(!m?.allAccepted?'Every member must accept the mandate before contributing.':'This collection is not accepting contributions.');
 const old=L.state.paymentDraft;
 if(old&&!old.submittedTxId&&(!isContribution(old)||old.collectionId!==itemId)&&replaceDraft!==old)return fail('Choose whether to keep or replace your saved payment before starting this contribution.');
 if(isContribution(old)&&old.collectionId===itemId&&!old.submittedTxId){if(amount!==''){old.amount=amount;reviews.delete(old);}return {ok:true,draft:old};}
 const d={id:L.id('collection-pay'),method:'collection',paymentEntryKey:'collection:'+item.id,name:item.title,destination:item.collectionAccount.reference,provider:'Collection account',amount,fee:0,category:'Transfers',essentialId:'',note:'Collection contribution',checked:true,pinAttempts:0,collectionId:item.id,collectionPersonId:a.localPersonId,collectionAccountOwner:account()};
 L.state.paymentDraft=d;L.save();return {ok:true,draft:d};
}
function recover(message){
 const d=L.state.paymentDraft;if(d){reviews.delete(d);delete d.reviewFingerprint;delete d.pauseAcceptedSignature;}
 const field=document.getElementById('payment-pin');if(field)field.value='';
 L.go('paymentReview');L.error(message||'Your contribution changed. Read the latest review before authorising.');
}
const predict=L.predictCategory;
if(predict)L.predictCategory=function(d,...args){return isContribution(d)?{category:'Transfers',source:'collection',confidence:'confirmed'}:predict.call(this,d,...args);};
const prepare=L.preparePayment;
L.preparePayment=function(...args){
 const d=L.state.paymentDraft;if(!isContribution(d))return prepare.apply(this,args);
 const value=document.getElementById('payment-amount')?.value;if(value!==undefined)d.amount=value;
 const q=quote(d);if(!q.ok)return L.error(q.error,'payment-amount');
 reviews.delete(d);return prepare.apply(this,args);
};
// The shared route selector sends valid consequential payments to Pause.
// An invalid collection must instead show its review recovery and reason.
const needsPause=L.paymentNeedsPause;
L.paymentNeedsPause=function(d,...args){return isContribution(d)&&!quote(d).ok?false:needsPause.call(this,d,...args);};
const next=L.continuePayment;
L.continuePayment=function(...args){
 const d=L.state.paymentDraft;if(!isContribution(d))return next.apply(this,args);
 if(L.route!=='paymentReview'||!current(d))return recover(quote(d).error);
 return next.apply(this,args);
};
const authCurrent=L.paymentAuthorizationCurrent;
L.paymentAuthorizationCurrent=function(d,...args){return !isContribution(d)?authCurrent.call(this,d,...args):current(d)&&authCurrent.call(this,d,...args);};
const authorize=L.authorizePayment;
L.authorizePayment=function(...args){
 const d=L.state.paymentDraft;if(!isContribution(d))return authorize.apply(this,args);
 if(L.persistence?.ensureCurrent?.()===false||L.platform?.requireOnline?.('Authorise this contribution')===false)return false;
 if(d.submittedTxId){L.go('paymentResult',{id:d.submittedTxId});return;}
 if(L.route!=='authorize'||!current(d))return recover(quote(d).error);
 const enteredPIN=document.getElementById('payment-pin');
 try{authorising=d;return atomic(()=>authorize.apply(this,args));}
 catch(error){recover(error.message);}
 finally{authorising=null;if(enteredPIN)enteredPIN.value='';const field=document.getElementById('payment-pin');if(field)field.value='';}
};
const fingerprint=t=>JSON.stringify([t.id,t.draftId,t.name,t.destination,t.provider,t.method,t.collectionId,t.collectionPersonId,t.collectionAccountOwner,t.collectionName,t.collectionReference,t.collectionBinding,t.amount,t.fee,t.type]);
function validTx(t){return !!t&&t.collectionContribution===true&&t.type==='out'&&t.collectionAccountOwner===account()&&cents(t.amount)!==null&&t.fee===0&&t.collectionFingerprint===fingerprint(t);}
function credit(item,t){
 const prior=(item.payments||[]).find(p=>p.personalTxId===t.id||p.reference===t.id);
 if(prior){if(prior.personalTxId!==t.id||prior.reference!==t.id||prior.personId!==t.collectionPersonId||prior.amountCents!==cents(t.amount)||prior.status!=='confirmed'||prior.source!=='everyday-account'||prior.contributionFingerprint!==t.collectionFingerprint||t.collectionPaymentId&&t.collectionPaymentId!==prior.id)throw Error('This payment reference already belongs to different contribution details.');t.collectionPaymentId=prior.id;return prior;}
 if(t.collectionPaymentId)throw Error('The original collection receipt is unavailable. Keep this payment reference for support.');
 const p={id:L.id('GP'),reference:t.id,personId:t.collectionPersonId,amountCents:cents(t.amount),status:'confirmed',sample:true,source:'everyday-account',personalTxId:t.id,contributionFingerprint:t.collectionFingerprint,date:now()};
 item.payments.push(p);item.activity.push({id:L.id('GA'),type:'sample-payment',paymentId:p.id,date:p.date,personalTxId:t.id});t.collectionPaymentId=p.id;
 item.status=G.summary(item).status;t.collectionBalanceAfterCents=G.summary(item).balanceCents;return p;
}
const addTx=L.addTx;
L.addTx=function(data,...args){
 const d=L.state.paymentDraft,own=isContribution(d)&&data?.draftId===d.id;
 if(data?.collectionRefund||data?.originalId&&tx(data.originalId)?.collectionContribution){if(!refunding||data.draftId!==refunding.key)throw Error('Collection contributions are returned only through the group’s recorded refunds.');return addTx.call(this,data,...args);}
 if(!own&&!data?.collectionContribution)return addTx.call(this,data,...args);
 if(!own||authorising!==d||!current(d))throw Error('Review and authorise your contribution with PIN or biometrics first.');
 const q=quote(d);if(!q.ok)throw Error(q.error);
 if(data.type!=='out'||cents(data.amount)!==q.amountCents||data.fee!==0)throw Error('The payment no longer matches the reviewed contribution.');
 const prior=(L.state.txs||[]).find(t=>t.draftId===d.id);
 if(prior){if(!validTx(prior)||prior.collectionId!==q.itemId||prior.collectionPersonId!==q.personId||cents(prior.amount)!==q.amountCents||prior.collectionBinding!==q.binding)throw Error('This contribution reference already belongs to different details.');reviews.delete(d);return prior;}
 const item=G.get(q.itemId),record={...data,category:'Transfers',method:'Collection contribution',destination:q.reference,provider:'Collection account',collectionContribution:true,collectionId:q.itemId,collectionPersonId:q.personId,collectionAccountOwner:account(),collectionName:q.title,collectionReference:q.reference,collectionBinding:q.binding};
 const result=addTx.call(this,record,...args);result.collectionFingerprint=fingerprint(result);if(!validTx(result))throw Error('The contribution ledger did not match the authorised payment.');
 if(result.status==='success')credit(item,result);reviews.delete(d);return result;
};
const resolve=L.resolveTx;
L.resolveTx=function(id,status,...args){
 const t=tx(id);if(!t?.collectionContribution)return resolve.call(this,id,status,...args);
 if(L.persistence?.ensureCurrent?.()===false||L.platform?.requireOnline?.('Check this contribution')===false)throw Error('Reconnect and load the latest records before confirming this contribution.');
 if(!allowed())throw Error('Sign in to your open account before checking a contribution.');
 if(!validTx(t))throw Error('This contribution’s payment details changed. Contact support with its reference.');
 if(t.status!=='pending'||!['success','failed','reversed'].includes(status))return t;
 return atomic(()=>{
  const item=G.get(t.collectionId);
  if(status==='success'){
   const q=facts({method:'collection',collectionId:t.collectionId,collectionPersonId:t.collectionPersonId,collectionAccountOwner:t.collectionAccountOwner,name:t.collectionName,destination:t.collectionReference,provider:'Collection account',amount:t.amount,fee:0,essentialId:''},{settling:true,except:t.id});
   if(!q.ok||q.binding!==t.collectionBinding)throw Error(q.error||'The accepted collection destination changed. Keep this payment pending for support.');
   const balances=L.accountBalances();if(Math.round(balances.operational*100)<Math.round(balances.held*100))throw Error('Reserved Everyday money is unavailable. Keep this payment pending for support.');
  }
  const result=resolve.call(this,id,status,...args);if(result.status==='success')credit(item,result);return result;
 });
};
const sample=G.recordSamplePayment;
G.recordSamplePayment=function(input){
 const item=G.get(input?.itemId);
 if(item?.type==='collection'){
  const a=G.access(item);if(input.personId===a.localPersonId)return fail('Use Contribute to review and authorise money from your own Everyday account.');
  const amount=G.cents(input.amount),s=G.summary(item);if(amount!==null&&s&&amount>Math.max(0,s.remainingCents-pending(item.id)))return fail('Pending contributions reserve part of this target. Enter no more than '+L.money(cash(Math.max(0,s.remainingCents-pending(item.id))))+'.');
 }
 return sample.apply(this,arguments);
};
const cancel=G.cancel;
G.cancel=function(id){if(pending(id))return fail('A member contribution is processing. Check its result before cancelling the collection.');return cancel.apply(this,arguments);};
const groupRefund=G.refund;
G.refund=function(id){
 const item=G.get(id);if(!allowed())return fail('Sign in to your open account before refunding a collection.');
 if(pending(id))return fail('A member contribution is processing. Check its result before refunding.');
 const linked=(item?.payments||[]).filter(p=>p.personalTxId);
 for(const p of linked){const t=tx(p.personalTxId);if(!validTx(t)||t.collectionId!==item.id||t.collectionPaymentId!==p.id||!['success','reversed'].includes(t.status)||p.status!=='confirmed'||p.source!=='everyday-account'||p.reference!==t.id||p.contributionFingerprint!==t.collectionFingerprint||p.personId!==t.collectionPersonId||p.amountCents!==cents(t.amount))return fail('An original contribution source needs support before refunds can be recorded.');}
 try{return atomic(()=>{
  const result=groupRefund.apply(this,arguments);if(!result.ok)return result;
  for(const r of result.item.refunds||[]){
   const p=linked.find(p=>p.id===r.paymentId);if(!p)continue;
   const original=tx(p.personalTxId),key='collection-refund:'+r.id,existing=(L.state.txs||[]).find(t=>t.draftId===key);
   if(r.personalRefundTxId){if(!existing||existing.id!==r.personalRefundTxId||!existing.collectionRefund||existing.collectionId!==id||existing.originalId!==original.id||Math.round(existing.amount*100)!==r.amountCents||existing.status!=='success')throw Error('This refund needs its original payment reference.');continue;}
   if(!Number.isSafeInteger(r.amountCents)||r.amountCents<=0)throw Error('The group refund amount is unavailable.');
   const already=(L.state.txs||[]).filter(t=>t.collectionRefund&&t.originalId===original.id&&t.status==='success').reduce((n,t)=>n+Math.round(t.amount*100),0);
   if(already+r.amountCents>p.amountCents)throw Error('The group refund exceeds the original contribution.');
   refunding={key};const posted=L.addTx({draftId:key,type:'in',name:'Collection refund · '+result.item.title,amount:cash(r.amountCents),fee:0,status:'success',category:'Refunds',method:'Collection refund',collectionRefund:true,collectionId:id,originalId:original.id,note:'Unspent contribution returned from '+result.item.title});refunding=null;
   r.personalRefundTxId=posted.id;r.destination='original-everyday-account';original.refunded=cash(already+r.amountCents);if(already+r.amountCents===p.amountCents)original.status='reversed';
  }
  return result;
 });}catch(error){return fail(error.message);}finally{refunding=null;}
};
const refund=L.refundPayment;
L.refundPayment=function(id,...args){if(tx(id)?.collectionContribution)return L.error('Contributions are returned through the collection’s cancellation and refund rules.');return refund.call(this,id,...args);};
function receipt(input){const t=typeof input==='string'?tx(input):input;if(!t?.collectionContribution)return null;const item=G.get(t.collectionId);return {item,tx:t,payment:(item?.payments||[]).find(p=>p.personalTxId===t.id)||null,personId:t.collectionPersonId};}
const before=L.beforeNavigate;
L.beforeNavigate=function(route,...args){if(isContribution(L.state.paymentDraft)){if(route!=='authorize'){const field=document.getElementById('payment-pin');if(field)field.value='';}if(!['send','paymentReview','pause','authorize','paymentResult','txDetail'].includes(route))reviews.delete(L.state.paymentDraft);}return before?.call(this,route,...args);};
function retire(){reviews=new WeakMap();const field=document.getElementById('payment-pin');if(field&&isContribution(L.state.paymentDraft))field.value='';}
document.addEventListener('visibilitychange',()=>{if(document.hidden)retire();});window.addEventListener('pagehide',retire);window.addEventListener('blur',retire);
L.collectionContributions=Object.freeze({version:1,isContribution,start,quote,validate:quote,review,current,receipt,pendingCents:pending});
})();
