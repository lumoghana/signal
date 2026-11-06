/** Browser-local payment demonstrations. Integer pesewas; no provider is connected. */
export const PAYMENT_PARITY_SCHEMA = 1;
export const paymentFee = rail => rail === 'momo' ? 50 : rail === 'bank' ? 100 : 0;
const clean = (v, n=120) => typeof v === 'string' ? v.trim().replace(/\s+/g,' ').slice(0,n) : '';
const positive = n => Number.isSafeInteger(n) && n > 0 && n <= 1000000000;
const nonnegative = n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000000;
const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const now = () => new Date().toISOString();
const fail = message => ({ok:false,message});
const ok = (message, fields={}) => ({ok:true,message,...fields});
const copy = v => JSON.parse(JSON.stringify(v));
function tx(s, fields) {const value={id:uid('tx'),type:'payment',direction:'out',status:'success',at:now(),rail:'internal',category:'Other',emoji:'↗',note:'',...fields};s.transactions.unshift(value);return value;}
function receiveFunds(s,h,fields){
  if(h.applyCore){const result=h.applyCore('fund',{amount:fields.amount,source:fields.merchant,rail:fields.rail,note:fields.note});if(!result.ok)return result;Object.assign(result.transaction,fields);return result;}
  const transaction=tx(s,fields);s.wallet+=fields.amount;return ok('Money received.',{id:transaction.id,transaction});
}
function note(record, type, details={}) {record.history ||= [];record.history.push({id:uid('event'),type,at:now(),...details});}
function syncLegacyCard(s) {s.virtualCard=s.virtualCards.find(c=>c&&c.status!=='closed') || null;}
const legacyCard=c=>c?{id:c.id,last4:c.last4,status:c.status,createdAt:c.createdAt}:null;
const cardFields=['id','last4','name','status','balance','limit','createdAt','history','replaces','closedAt'];
export function validatePaymentParityState(s){return !s.virtualCards || Array.isArray(s.virtualCards)&&s.virtualCards.every(c=>c&&typeof c==='object'&&typeof c.id==='string'&&c.id.length<=100&&['active','frozen','closed'].includes(c.status)&&/^\d{4}$/.test(c.last4)&&nonnegative(c.balance)&&positive(c.limit)&&typeof c.name==='string'&&c.name.length<=40&&Number.isFinite(Date.parse(c.createdAt))&&Array.isArray(c.history)&&Object.keys(c).every(k=>cardFields.includes(k)))&&new Set(s.virtualCards.map(c=>c.id)).size===s.virtualCards.length;}
export function ensurePaymentParityState(s) {
  if (!Array.isArray(s.virtualCards)) s.virtualCards=s.virtualCard ? [{...s.virtualCard,name:s.virtualCard.name||'Everyday online',balance:s.virtualCard.balance||0,limit:s.virtualCard.limit||200000,history:s.virtualCard.history||[]}] : [];
  if(s.virtualCard && !s.virtualCards.some(c=>c.id===s.virtualCard.id)) s.virtualCards.unshift({...s.virtualCard,name:s.virtualCard.name||'Everyday online',balance:s.virtualCard.balance||0,limit:s.virtualCard.limit||200000,history:s.virtualCard.history||[]});
  for(let i=0;i<s.virtualCards.length;i++){const raw=s.virtualCards[i];if(!raw||typeof raw!=='object')continue;const c=Object.fromEntries(cardFields.filter(k=>Object.hasOwn(raw,k)).map(k=>[k,raw[k]]));if(c.balance===undefined)c.balance=0;if(c.limit===undefined)c.limit=200000;c.name ||= 'Everyday online';c.history ||= [];s.virtualCards[i]=c;}
  s.moneyRequests ||= [];s.expenseSplits ||= [];s.fundingAttempts ||= [];s.paymentParityApplied ||= {};
  syncLegacyCard(s);return s;
}
function card(s,p){return s.virtualCards.find(c=>c.id===(p.cardId||p.id)) || (!p.cardId&&!p.id?s.virtualCard:null);}
function requestStatus(r) {if(r.status==='open'&&new Date(r.expiresAt).getTime()<=Date.now())return 'expired';return r.status;}
export function getRequestStatus(r){return requestStatus(r);}
export function getCardTotal(s){ensurePaymentParityState(s);return s.virtualCards.reduce((sum,c)=>sum+(c.status==='closed'?0:c.balance),0);}
export function splitOutstanding(split){return split.members.reduce((sum,m)=>sum+Math.max(0,m.amount-(m.paid||0)),0);}
const managed=new Set(['createDemoVirtualCard','setDemoVirtualCardFrozen','cardFund','cardReturn','cardPurchase','cardResolvePurchase','cardRefund','cardRename','cardLimit','cardClose','cardReplace','createMoneyRequest','simulateIncomingRequest','cancelMoneyRequest','declineMoneyRequest','reportMoneyRequest','confirmRequestedMoney','createExpenseSplit','settleSplitShare','cancelExpenseSplit','startFundingAttempt','resolveFundingAttempt','checkFundingAttempt','retryFundingAttempt','checkPaymentOutcome','simulatePaymentOutcome','checkServiceDelivery','simulateServiceDelivery']);
export function handlePaymentParityAction(s,type,p={},helpers={}) {
  if(!managed.has(type))return null;ensurePaymentParityState(s);if(!validatePaymentParityState(s))return fail('Saved card balances need recovery before money can move. Keep this tab open.');
  const key=clean(p.idempotencyKey,200),signature=JSON.stringify({type,p:{...p,idempotencyKey:undefined}});
  if(key&&s.paymentParityApplied[key]){const last=s.paymentParityApplied[key];return last.signature===signature?{...copy(last.result),duplicate:true}:fail('That reference belongs to a different action.');}
  const result=perform(s,type,p,helpers);
  if(result.ok&&key)s.paymentParityApplied[key]={signature,result:copy(result)};
  return result;
}
// Card funding is a transfer. Only actual purchases use a spending category.
function cardBudgetImpact(s, c, p, helpers) {
  const category = clean(p.category, 40) || 'Personal';
  const evaluation = helpers.evaluatePayment?.({ ...s, wallet: s.wallet + c.balance }, { ...p, fee: 0, category, rail: 'card' });
  return { category, budgetPeriodId: s.budget?.periodId, budgetItemId: evaluation?.budgetItemId || null, budgetAllocation: evaluation?.budgetAllocation || 0 };
}
function releaseCardBudget(s, purchase, amount, helpers) {
  const period = purchase.budgetPeriodId === s.budget?.periodId ? s.budget : (s.budgetHistory || []).find(period => period.periodId === purchase.budgetPeriodId);
  const item = period?.items?.find(item => item.id === purchase.budgetItemId);
  const released = Math.min(amount, purchase.budgetSpentAmount || 0);
  if (helpers.adjustTransactionBudgetSpend) helpers.adjustTransactionBudgetSpend(s, purchase, -released);
  else if (item && released) item.spent = Math.max(0, (item.spent || 0) - released);
  if (period && period !== s.budget) period.totalSpent = period.items.reduce((sum, item) => sum + (item.spent || 0), 0);
  purchase.budgetSpentAmount = Math.max(0, (purchase.budgetSpentAmount || 0) - released);
}
function perform(s,type,p,h){
  if(type==='createDemoVirtualCard'){
    if(s.virtualCard&&p.additional!==true)return ok('Your demo virtual card is already here.',{id:s.virtualCard.id,card:s.virtualCard,virtualCard:legacyCard(s.virtualCard),duplicate:true});
    if(s.virtualCards.filter(c=>c.status!=='closed').length>=2)return fail('Two cards is the demo limit. Close one before creating another.');
    const c={id:uid('card'),last4:s.virtualCards.length?'5252':'4242',name:clean(p.name,40)||'Everyday online',status:'active',balance:0,limit:200000,createdAt:now(),history:[]};s.virtualCards.push(c);note(c,'created');syncLegacyCard(s);return ok('Demo card ready.',{id:c.id,card:c,virtualCard:legacyCard(c)});
  }
  if(type.startsWith('card')||type==='setDemoVirtualCardFrozen'){
    const c=card(s,p);if(!c||(c.status==='closed'&&type!=='cardRefund'))return fail('Choose an open demo card.');
    if(type==='setDemoVirtualCardFrozen'){if(typeof p.frozen!=='boolean')return fail('Choose freeze or unfreeze.');c.status=p.frozen?'frozen':'active';note(c,c.status);syncLegacyCard(s);return ok(p.frozen?'Card frozen.':'Card active.',{card:c,virtualCard:legacyCard(c)});}
    if(type==='cardRename'){if(!clean(p.name,40))return fail('Give this card a name.');c.name=clean(p.name,40);note(c,'renamed');return ok('Name updated.');}
    if(type==='cardLimit'){if(!positive(p.limit))return fail('Choose a limit above zero.');c.limit=p.limit;note(c,'limit-changed',{amount:p.limit});return ok('Purchase limit updated.');}
    if(type==='cardFund'||type==='cardReturn'){
      if(!positive(p.amount))return fail('Use an amount above zero.');
      if(type==='cardFund'&&p.amount>s.wallet)return fail('Your Everyday balance cannot cover that.');
      if(type==='cardReturn'&&p.amount>c.balance)return fail('That is more than the unspent card balance.');
      const funding=type==='cardFund';s.wallet+=funding?-p.amount:p.amount;c.balance+=funding?p.amount:-p.amount;
      const t=tx(s,{type:'card-transfer',cardId:c.id,amount:p.amount,direction:funding?'out':'in',merchant:c.name,category:'Card transfer',note:funding?'Moved from Everyday to card':'Returned from card to Everyday',emoji:'💳'});note(c,funding?'funded':'returned',{amount:p.amount,transactionId:t.id});return ok(funding?'Card topped up.':'Money back in Everyday.',{id:t.id,transaction:t});
    }
    if(type==='cardPurchase'){
      if(c.status!=='active')return fail('Unfreeze this card before a purchase.');if(!positive(p.amount)||p.amount>c.balance)return fail('Use an amount within your card balance.');if(p.amount>c.limit)return fail('That is above this card’s purchase limit.');if(!clean(p.merchant,60))return fail('Name the demo merchant.');
      const status=p.status||'success';if(!['success','pending','failed'].includes(status))return fail('Choose a valid purchase outcome.');
      const impact = cardBudgetImpact(s, c, p, h);
      if(status!=='failed')c.balance-=p.amount;
      const t=tx(s,{type:'card-purchase',amount:p.amount,merchant:clean(p.merchant,60),rail:'card',cardId:c.id,...impact,budgetAllocation:status==='failed'?0:impact.budgetAllocation,budgetSpentAmount:status!=='failed'&&impact.budgetItemId?p.amount:0,status,held:status==='pending',refunded:0,emoji:'💳'});
      const item = s.budget?.items.find(item => item.id === t.budgetItemId); if (item && t.budgetSpentAmount) item.spent += t.budgetSpentAmount; note(c,`purchase-${status}`,{amount:p.amount,transactionId:t.id});return ok(status==='pending'?'Purchase awaiting confirmation.':status==='failed'?'Purchase declined. Nothing was taken.':'Purchase confirmed.',{id:t.id,transaction:t});
    }
    if(type==='cardResolvePurchase'){
      const t=s.transactions.find(x=>x.id===p.transactionId&&x.cardId===c.id&&x.type==='card-purchase');if(!t||t.status!=='pending')return fail('This purchase is no longer pending.');if(!['success','failed'].includes(p.status))return fail('Choose confirmed or declined.');t.status=p.status;t.held=false;t.resolvedAt=now();if(p.status==='failed'){c.balance+=t.amount;releaseCardBudget(s,t,t.amount,h);}note(c,`purchase-${p.status}`,{amount:t.amount,transactionId:t.id});return ok(p.status==='success'?'Purchase confirmed.':'Held money returned to the card.');
    }
    if(type==='cardRefund'){
      const t=s.transactions.find(x=>x.id===p.transactionId&&x.cardId===c.id&&x.type==='card-purchase');if(!t||t.status!=='success')return fail('Choose a confirmed purchase.');const amount=p.amount??t.amount-(t.refunded||0);if(!positive(amount)||amount>t.amount-(t.refunded||0))return fail('This refund exceeds the remaining purchase amount.');t.refunded=(t.refunded||0)+amount;releaseCardBudget(s,t,amount,h);let destination=c;const seen=new Set();while(destination.status==='closed'&&!seen.has(destination.id)){seen.add(destination.id);const next=s.virtualCards.find(x=>x.replaces===destination.id);if(!next)break;destination=next;}if(destination.status==='closed')s.wallet+=amount;else destination.balance+=amount;const refund=tx(s,{type:'card-refund',amount,direction:'in',merchant:t.merchant,rail:'card',cardId:c.id,parentPaymentId:t.id,refundDestination:destination.status==='closed'?'Everyday':destination.id,category:t.category,emoji:'↙'});note(c,'refunded',{amount,transactionId:refund.id});return ok(destination.status==='closed'?'Closed-card refund returned to Everyday.':'Refund returned to the active card.',{id:refund.id,transaction:refund});
    }
    if(type==='cardClose'||type==='cardReplace'){
      if(s.transactions.some(t=>t.cardId===c.id&&t.status==='pending'))return fail('Wait for pending purchases to finish first.');
      if(type==='cardClose'&&c.balance)return fail('Return this card’s balance before closing it.');
      const balance=c.balance;c.balance=0;c.status='closed';c.closedAt=now();note(c,type==='cardReplace'?'replaced':'closed');
      if(type==='cardReplace'){const replacement={id:uid('card'),last4:String(6000+s.virtualCards.length),name:c.name,status:'active',balance,limit:c.limit,createdAt:now(),replaces:c.id,history:[]};note(replacement,'replacement',{previousCardId:c.id,amount:balance});s.virtualCards.push(replacement);syncLegacyCard(s);return ok('Replacement ready. Unspent money moved with it.',{id:replacement.id});}syncLegacyCard(s);return ok('Card closed. Its history stays here.');
    }
  }
  if(type==='createMoneyRequest'||type==='simulateIncomingRequest'){
    const name=clean(p.name,60);if(!name||!positive(p.amount))return fail('Add a person and an amount above zero.');
    const r={id:uid('request'),direction:type==='simulateIncomingRequest'?'incoming':'outgoing',name,amount:p.amount,note:clean(p.note,140),createdAt:now(),expiresAt:new Date(Date.now()+7*86400000).toISOString(),status:'open',history:[],simulation:true};s.moneyRequests.unshift(r);note(r,'created');return ok('Request saved. It is expected money until confirmed.',{id:r.id,request:r});
  }
  if(['cancelMoneyRequest','declineMoneyRequest','reportMoneyRequest','confirmRequestedMoney'].includes(type)){
    const r=s.moneyRequests.find(r=>r.id===(p.requestId||p.id));if(!r)return fail('Request not found.');
    if(type==='reportMoneyRequest'){r.reportedAt=now();note(r,'reported');return ok('Report saved for this demo. No message was sent.');}
    if(requestStatus(r)!=='open')return fail('This request is no longer open.');
    if(type==='cancelMoneyRequest'){if(r.direction!=='outgoing')return fail('Only your outgoing requests can be cancelled.');r.status='cancelled';note(r,'cancelled');return ok('Request cancelled.');}
    if(type==='declineMoneyRequest'){if(r.direction!=='incoming')return fail('Only incoming requests can be declined.');r.status='declined';note(r,'declined');return ok('Request declined.');}
    if(r.direction!=='outgoing')return fail('An incoming request must be paid through payment review.');
    const received=receiveFunds(s,h,{type:'income',direction:'in',amount:r.amount,merchant:r.name,requestId:r.id,rail:'lumo',category:'Money received',note:r.note||'Confirmed requested money',emoji:'↙'});if(!received.ok)return received;const t=received.transaction;r.status='paid';r.paymentId=t.id;note(r,'paid',{transactionId:t.id});return ok('Money received once. Your balance is updated.',{id:t.id,transaction:t});
  }
  if(type==='createExpenseSplit'){
    const original=p.transactionId?s.transactions.find(t=>t.id===p.transactionId&&t.type==='payment'&&t.status==='success'&&t.direction==='out'):null;
    if(p.transactionId&&!original)return fail('Choose a confirmed paid expense.');const amount=original?original.amount:p.amount;
    if(!positive(amount))return fail('Use a paid expense amount above zero.');
    if(original&&s.expenseSplits.some(x=>x.transactionId===original.id&&x.status!=='cancelled'))return fail('This payment already has a split. Open that split instead.');
    const members=Array.isArray(p.members)?p.members.map((m,i)=>({id:clean(m.id,100)||uid('share'),name:clean(m.name,60),amount:m.amount,paid:0,isMe:m.isMe===true})):[];
    if(members.length<2||members.length>9||members.some(m=>!m.name)||new Set(members.map(m=>m.name.toLowerCase())).size!==members.length||members.filter(m=>m.isMe).length!==1)return fail('Add yourself and 1–8 different people.');
    if(p.mode!=='custom'){const base=Math.floor(amount/members.length),remainder=amount%members.length;members.forEach((m,i)=>m.amount=base+(i<remainder?1:0));}
    if(members.some(m=>!positive(m.amount))||members.reduce((sum,m)=>sum+m.amount,0)!==amount)return fail('Every share must be above zero and add up to the expense.');
    members.forEach(m=>{if(m.isMe)m.paid=m.amount;});const split={id:uid('split'),amount,purpose:clean(p.purpose,100)||original?.merchant||'Shared expense',transactionId:original?.id||null,mode:p.mode==='custom'?'custom':'equal',members,createdAt:now(),status:'open',history:[]};s.expenseSplits.unshift(split);note(split,'created');return ok('Split ready. Unpaid shares are expected money only.',{id:split.id,split});
  }
  if(type==='settleSplitShare'||type==='cancelExpenseSplit'){
    const split=s.expenseSplits.find(x=>x.id===(p.splitId||p.id));if(!split||split.status!=='open')return fail('This split is no longer open.');
    if(type==='cancelExpenseSplit'){split.status='cancelled';note(split,'cancelled');return ok('Outstanding requests cancelled. Confirmed payments stay recorded.');}
    const member=split.members.find(m=>m.id===p.memberId&&!m.isMe);if(!member)return fail('Choose an unpaid member.');const amount=p.amount??member.amount-member.paid;if(!positive(amount)||amount>member.amount-member.paid)return fail('Use an amount within their outstanding share.');
    const method=p.method||'lumo';if(!['lumo','cash','other'].includes(method))return fail('Choose how this share was received.');
    const fields={type:method==='lumo'?'income':'split-manual-receipt',direction:'in',amount,merchant:member.name,rail:method,splitId:split.id,memberId:member.id,category:'Expense repayment',note:split.purpose,emoji:'↙',manual:method!=='lumo'};const received=method==='lumo'?receiveFunds(s,h,fields):ok('Recorded.',{transaction:tx(s,fields)});if(!received.ok)return received;const t=received.transaction;member.paid+=amount;note(split,'share-received',{memberId:member.id,transactionId:t.id,amount,method});if(!splitOutstanding(split))split.status='settled';return ok(method==='lumo'?'Confirmed share added to Everyday.':'Recorded as received outside Lumo. Everyday is unchanged.',{id:t.id,transaction:t});
  }
  if(type==='startFundingAttempt'){
    if(!positive(p.amount)||!['momo','bank'].includes(p.rail))return fail('Choose mobile money or bank and a valid amount.');
    if(p.rail==='momo'&&!/^0\d{9}$/.test(clean(p.number).replace(/\s/g,'')))return fail('Use your 10-digit Ghanaian mobile number.');
    const f={id:uid('funding'),reference:uid('fund'),amount:p.amount,rail:p.rail,number:p.rail==='momo'?clean(p.number).replace(/\s/g,''):'',source:clean(p.source,60)||(p.rail==='bank'?'Bank transfer':'Mobile money'),status:'pending',createdAt:now(),history:[]};s.fundingAttempts.unshift(f);note(f,'requested');return ok('Waiting for confirmation. Nothing has been credited.',{id:f.id,funding:f});
  }
  if(['resolveFundingAttempt','checkFundingAttempt','retryFundingAttempt'].includes(type)){
    const f=s.fundingAttempts.find(f=>f.id===(p.fundingId||p.id));if(!f)return fail('Funding reference not found.');
    if(type==='checkFundingAttempt'){f.lastCheckedAt=now();return ok(f.status==='pending'?'Still awaiting confirmation. Your balance is unchanged.':`This funding is ${f.status}.`,{id:f.id,funding:f});}
    if(type==='retryFundingAttempt'){if(!['failed','expired'].includes(f.status))return fail('Only declined or expired funding can be tried again.');const retry={...copy(f),id:uid('funding'),reference:uid('fund'),status:'pending',createdAt:now(),history:[],retryOf:f.id};s.fundingAttempts.unshift(retry);note(retry,'retry-requested');return ok('New attempt started. The previous reference stays recorded.',{id:retry.id,funding:retry});}
    if(f.status!=='pending')return ok('This reference already has its final result.',{id:f.id,funding:f,duplicate:true});if(!['success','failed','expired'].includes(p.status))return fail('Choose confirmed, declined or expired.');
    f.status=p.status;f.resolvedAt=now();note(f,p.status);if(p.status==='success'){
      const received=receiveFunds(s,h,{type:'income',amount:f.amount,direction:'in',merchant:f.source,rail:f.rail,category:'Money added',note:`Confirmed funding ${f.reference}`,fundingId:f.id,reference:f.reference,emoji:'↙'});if(!received.ok){f.status='pending';return received;}const t=received.transaction;f.transactionId=t.id;return ok('Money confirmed and added once.',{id:f.id,transaction:t,funding:f});
    }return ok(p.status==='failed'?'Funding declined. Nothing was credited.':'Funding expired. Nothing was credited.',{id:f.id,funding:f});
  }
  if(type==='checkPaymentOutcome'){
    const t=s.transactions.find(t=>t.id===(p.transactionId||p.id));if(!t)return fail('Payment not found.');t.lastCheckedAt=now();return ok(t.status==='pending'?'Still waiting for the final result. The amount remains held.':`Payment is ${t.status}.`,{id:t.id,transaction:t});
  }
  if(type==='simulatePaymentOutcome'){
    const t=s.transactions.find(t=>t.id===(p.transactionId||p.id)&&t.type==='payment');if(!t)return fail('Payment not found.');if(!h.applyCore)return fail('Payment confirmation is unavailable.');
    if(p.status==='reversed'){if(t.status!=='success')return fail('Only a completed payment can be reversed.');return h.applyCore('reversePayment',{id:t.id});}
    if(t.status!=='pending'||!['success','failed'].includes(p.status))return fail('Choose an outcome for a pending payment.');return h.applyCore('resolvePayment',{id:t.id,status:p.status});
  }
  if(type==='checkServiceDelivery'||type==='simulateServiceDelivery'){
    const t=s.transactions.find(t=>t.id===(p.transactionId||p.id)&&t.serviceId);if(!t||t.status!=='success')return fail('Delivery is tracked after payment confirmation.');t.delivery ||= {status:'pending',history:[]};
    if(type==='checkServiceDelivery'){t.delivery.lastCheckedAt=now();return ok(`Delivery is ${t.delivery.status}. Checking does not change the result.`,{id:t.id});}
    if(t.delivery.status==='delivered')return ok('Already delivered. No second delivery was created.',{duplicate:true,id:t.id});if(!['delivered','failed','pending'].includes(p.status))return fail('Choose a delivery outcome.');
    if(t.delivery.status===p.status)return ok(`Delivery remains ${p.status}.`,{duplicate:true,id:t.id});t.delivery.status=p.status;t.delivery.updatedAt=now();note(t.delivery,p.status);
    if(p.status==='delivered'&&t.serviceId==='electricity')t.delivery.token='1234 5678 9012 3456 7890';return ok(p.status==='delivered'?'Demo service delivered.':p.status==='failed'?'Delivery failed. The payment stays recorded; request support or simulate a reversal.':'Delivery is awaiting the provider.',{id:t.id});
  }
  return fail('This action is unavailable.');
}
/** Derive request and product states from the confirmed personal ledger, never a chat claim. */
export function syncPaymentParityAfterAction(s,type,p,result) {
  if(!result?.ok)return;ensurePaymentParityState(s);
  const t=result.transaction||s.transactions.find(t=>t.id===(result.id||p.transactionId||p.id));
  if(t&&type==='payment'&&p.requestId){const r=s.moneyRequests.find(r=>r.id===p.requestId&&r.direction==='incoming');if(r){t.requestId=r.id;r.paymentId=t.id;note(r,'payment-attempt',{transactionId:t.id});}}
  if(t?.serviceId&&t.status==='success'&&!t.delivery)t.delivery={status:'pending',history:[{id:uid('event'),type:'awaiting-provider',at:now()}]};
  for(const split of s.expenseSplits.filter(x=>x.transactionId&&x.status!=='cancelled'&&x.status!=='refund-review')){const original=s.transactions.find(t=>t.id===split.transactionId);if(original?.status==='reversed'){split.status='refund-review';note(split,'original-payment-reversed',{transactionId:original.id});}}
  for(const r of s.moneyRequests.filter(r=>r.direction==='incoming'&&r.paymentId)){
    const payment=s.transactions.find(t=>t.id===r.paymentId);if(!payment)continue;
    const status=payment.status==='success'?'paid':payment.status==='pending'?'pending':requestStatus({...r,status:'open'});
    if(r.status!==status){r.status=status;note(r,`payment-${payment.status}`,{transactionId:payment.id});}
  }
}

export function validatePaymentParityPayment(s,p){
 if(!p.requestId)return null;ensurePaymentParityState(s);const r=s.moneyRequests.find(r=>r.id===p.requestId&&r.direction==='incoming');
 if(!r||requestStatus(r)!=='open')return fail('This request is no longer open. Check Requests before paying.');
 if(p.amount!==r.amount)return fail('This request has a fixed amount. Start a separate payment to send a different amount.');
 if((typeof p.recipient==='object'?p.recipient?.name:p.recipient)!==r.name)return fail('The recipient no longer matches this request.');return null;
}
