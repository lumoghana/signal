/* Presentation of one engine result. This module never saves or sends money. */
(()=>{
'use strict';
const E=L.e,M=L.money;
const validAmount=raw=>{const amount=Number(raw);return String(raw??'').trim()!==''&&Number.isFinite(amount)&&amount>0&&amount<=5000&&Math.abs(amount*100-Math.round(amount*100))<=.000001;};
// Entry previews are brief. Pause owns the named consequence, explanation and choices.
L.entryConsequenceText=impact=>!impact.valid||!impact.canPay?impact.headline:!impact.hasPlan?'Add a budget for a fuller check.':impact.essentialGap?`${M(impact.essentialGap)} short for your budget`:impact.goalGap?`${M(impact.goalGap)} of goal money uncovered`:`${M(impact.room)} left after budget`;
L.entryConsequence=impact=>`<div class="entry-consequence" data-projection data-decision-state="${E(impact.consequenceTone)}">${L.clarityRing()}<div><span class="entry-consequence-label">${L.state.paymentDraft?.method==='box'?'If you move this to savings':'If you pay this'}</span><p class="entry-consequence-copy">${E(L.entryConsequenceText(impact))}</p></div></div>`;
// Preview a quote without changing the saved draft, its review fingerprint or funds.
L.paymentProjection=()=>{
 const d=L.state.paymentDraft;if(!d||d.submittedTxId)return null;
 const input=document.getElementById('payment-amount'),link=document.getElementById('payment-essential');
 const raw=input?input.value:String(d.amount||''),amount=Number(raw);
 if(!validAmount(raw))return null;
 return L.planImpactSummary({...d,amount,fee:L.paymentFee(d.method,amount),essentialId:link?link.value:d.essentialId});
};
L.refreshPaymentProjection=()=>{
 if(!['send','bill'].includes(L.route))return;
 const el=document.getElementById('payment-projection');if(!el)return;
 const impact=L.paymentProjection();
 el.innerHTML=impact?L.entryConsequence(impact):'<p class="projection-placeholder">Enter an amount to see its effect.</p>';
 L.motionProjection?.(el);
};
const decorate=L.decorateView;
L.decorateView=(html,route)=>{
 if(['send','bill'].includes(route)&&html.includes('data-payment-entry')&&!L.state.paymentDraft?.submittedTxId){
  const d=L.state.paymentDraft,amount=Number(d?.amount),valid=validAmount(d?.amount);
  const initial=valid?L.entryConsequence(L.planImpactSummary({...d,fee:L.paymentFee(d.method,amount)})):'<p class="projection-placeholder">Enter an amount to see its effect.</p>';
  const projection=`<div id="payment-projection" class="payment-projection" role="status" aria-live="polite" aria-atomic="true">${initial}</div>`;
  // Review sits immediately after the live preview. The optional note follows it.
  const at=html.indexOf('<button type="submit" class="primary">');
  if(at>=0)html=html.slice(0,at)+projection+html.slice(at);
 }
 return decorate?decorate(html,route):html;
};
document.addEventListener('input',event=>{if(event.target?.id==='payment-amount')L.refreshPaymentProjection();});
document.addEventListener('change',event=>{if(event.target?.id==='payment-essential')L.refreshPaymentProjection();});
window.addEventListener('pageshow',()=>L.refreshPaymentProjection());
// Core restores unfinished input values during render. Recompute from those fields
// afterward so returning from Help cannot leave a stale consequence beside them.
const render=L.render;
L.render=function(...args){const value=render.apply(this,args);if(['send','bill'].includes(L.route))L.refreshPaymentProjection();return value;};
// A result is a fact, and its visual state follows the actual transaction.
const result=L.views.paymentResult;
L.views.paymentResult=()=>{
 const id=L.params.id||L.state.paymentDraft?.submittedTxId,t=L.state.txs.find(x=>x.id===id);if(!t)return result();
 const confirmed=t.status==='success',pending=t.status==='pending';
 const state=confirmed?(t.delivery==='pending'?'delivery-pending':t.delivery==='failed'?'delivery-failed':'confirmed'):pending?'pending':t.status==='reversed'?'reversed':'failed';
 const title={confirmed:'Payment confirmed.',pending:'Payment is pending.',failed:'Payment not completed.',reversed:'Your money is back.','delivery-pending':'Paid. Delivery is pending.','delivery-failed':'Paid. Delivery needs help.'}[state];
 const explanation={confirmed:'',pending:t.type==='in'?'This money will be available when receipt is confirmed. Check this reference for updates.':'This amount is reserved while we check. You can leave safely. Please don’t pay again.',failed:'You haven’t been charged. Your money is available again.',reversed:'The confirmed refund is back in your balance.','delivery-pending':'Your payment is confirmed. Delivery is still being checked. Please don’t buy it again.','delivery-failed':'Your payment completed, but delivery failed. Get help using this reference.'}[state];
 const needsCheck=pending||confirmed&&t.delivery==='pending',needsHelp=t.status==='success'&&t.delivery==='failed',canRetry=t.status==='failed'&&L.canRetryPayment?.(t.id);
 const icon=state==='confirmed'?'check':state==='pending'||state==='delivery-pending'?'clock':state==='failed'||state==='delivery-failed'?'close':'arrowDown';
 return `<section class="payment-result-compact" data-illustrated-screen="paymentResult" data-payment-state="${state}" data-result-id="${E(t.id)}"><div class="result-mark success-mark" aria-hidden="true">${L.icon(icon,32)}</div><h1>${title}</h1><p class="result-context"><strong>${M(t.amount)}</strong> ${t.type==='in'?'from':'to'} <strong>${E(t.name)}</strong></p>${explanation?`<p class="result-explanation">${explanation}</p>`:''}<p class="result-reference"><span>Reference</span><strong>${E(t.id)}</strong></p><div id="error" role="alert"></div><div class="actions result-actions">${needsCheck?L.btn('Check status',`L.openPaymentRecovery('${E(t.id)}')`):canRetry?L.btn('Review a new attempt',`L.retryPayment('${E(t.id)}')`):needsHelp?L.btn('Get delivery help',`L.go('supportCase',{txId:'${E(t.id)}',reference:'${E(t.id)}'})`):L.btn('Done','L.finishPayment()')}${needsCheck||needsHelp||canRetry?L.btn('Done','L.finishPayment()','secondary'):L.btn('View receipt',`L.go('txDetail',{id:'${E(t.id)}'})`,'text-btn')}</div><p class="preview-boundary">Simulated result · No live payment</p></section>`;
};
})();
