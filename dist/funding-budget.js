/* Confirmed money arrives in the operational account before optional budgeting.
   The bank guide and every credit in this preview are explicitly simulated. */
(()=>{
'use strict';
const E=L.e,M=L.money,B=L.btn;
const transaction=id=>(L.state.txs||[]).find(t=>t.id===id);
const hasBudget=()=>(L.state.essentials||[]).some(cost=>Number(cost.amount)>0);
const account=()=>{
 L.ensureAccounts?.();
 return {name:L.state.profile.name,number:L.accountBalances?.().operationalNumber||L.state.profile.account};
};
const currentFunding=()=>transaction(L.route==='bankAdd'?L.state.bankFunding?.txId:L.route==='momoAdd'?L.state.fundingDraft?.txId:null);
const confirmed=t=>t?.type==='in'&&t.status==='success'&&!t.internal&&!L.isInternalTransfer?.(t);
const paymentReturn=()=>L.state.fundingReturn==='paymentReview';
const eligible=t=>confirmed(t)&&!paymentReturn()&&!t.budgetPromptHandled&&!(L.state.budgetPrompt?.txId===t.id&&L.state.budgetPrompt.done);
const nextLabel=t=>eligible(t)?hasBudget()?'Review budget':'Set up budget':paymentReturn()?'Return to payment':'Done';
const row=(label,value)=>`<div class="summary-line"><span>${E(label)}</span><strong>${E(value)}</strong></div>`;
const error='<div id="error" role="alert" aria-live="polite"></div>';

L.beginFirstFunding=()=>{
 if(!L.state.onboarded)return L.go('welcome');
 L.ensureAccounts?.();
 L.state.onboardingFunding={startedAt:new Date().toISOString(),done:false};
 L.state.fundingReturn='home';
 L.save();L.go('addMoney');
};
const closePrompt=()=>{
 const prompt=L.state.budgetPrompt;
 if(prompt){prompt.done=true;const t=transaction(prompt.txId);if(t)t.budgetPromptHandled=true;}
 if(L.state.onboardingFunding)L.state.onboardingFunding.done=true;
 L.state.fundingReturn=null;L.save();
};
const offerBudget=t=>{
 if(!eligible(t))return false;
 L.state.budgetPrompt={txId:t.id,done:false,hasBudget:hasBudget()};
 if(L.state.onboardingFunding)L.state.onboardingFunding.done=true;
 L.state.fundingReturn=null;L.save();L.go('budgetAfterFunding');return true;
};
const firstFundingResult=()=>{
 const t=currentFunding();
 // Only confirmed credit can advance the first-funding journey. A wallet
 // approval, a bank debit or a status check is never evidence of incoming money.
 if(L.state.onboardingFunding&&!L.state.onboardingFunding.done&&eligible(t))offerBudget(t);
};
const done=L.fundingDone;
L.fundingDone=function(){if(offerBudget(currentFunding()))return;return done?.apply(this,arguments);};
for(const key of ['requestMomoFunding','fundingOutcome']){
 const action=L[key];
 L[key]=function(...args){const run=()=>{const result=action?.apply(this,args);firstFundingResult();return result;};try{return L.persistence?.transaction?L.persistence.transaction(run,{financial:true,label:'Confirm incoming sample money'}):run();}catch(error){L.render();L.error(error.message||'The incoming money could not be saved. Keep the same reference.');return false;}};
}
const momoView=L.views.momoAdd;
L.views.momoAdd=()=>{
 const html=momoView(),t=transaction(L.state.fundingDraft?.txId);
 if(!confirmed(t))return html;
 return html.replace(/(<button\b[^>]*onclick="L\.fundingDone\(\)"[^>]*>)[\s\S]*?(<\/button>)/,(_,open,close)=>open+E(nextLabel(t))+close);
};
L.views.budgetAfterFunding=()=>{
 const prompt=L.state.budgetPrompt,t=transaction(prompt?.txId);
 if(!confirmed(t))return `<section>${L.header('Add money first','Your balance updates only after money arrives.')}<div class="actions">${B('Add money',"L.go('addMoney')")}${B('Back to Home',"L.openTab('home')",'text-btn')}</div></section>`;
 const existing=hasBudget();
 return `<section class="funding-budget-prompt" data-illustrated-screen="budgetAfterFunding">
 ${L.header(existing?'Money added. Review your budget?':'Money added. Give it a budget.')}
 <div class="notice"><span class="avatar" aria-hidden="true">${L.icon('check',26)}</span><strong>${M(t.amount)} added to your operational account.</strong><p class="small">Confirmed sample money · no live transfer.</p></div>
 <p>${existing?'Your saved budget stays in place. Check whether it still covers what you need.':'A budget tells Lumo what this money needs to cover, like food, transport and data.'}</p>
 <p class="small muted">${existing?'Adding money doesn’t restart your budget or change your costs.':'Then Lumo shows what’s left and helps you see what a payment would change. Creating a budget doesn’t move or lock your money.'}</p>
 <div class="actions">${B(existing?'Review budget':L.state.planDraft?'Continue budget':'Build my budget','L.beginFundedBudget()')}${B('Do later','L.deferFundedBudget()','secondary')}</div>
 </section>`;
};
L.beginFundedBudget=()=>{
 const t=transaction(L.state.budgetPrompt?.txId);if(!confirmed(t))return;
 const existing=hasBudget();closePrompt();
 if(existing)return L.go('planEdit');
 if(L.buildPlanFromBenefit)return L.buildPlanFromBenefit();
 return L.go('firstEssentials');
};
L.deferFundedBudget=()=>{closePrompt();L.openTab('home');};
const beforeNavigate=L.beforeNavigate;
L.beforeNavigate=function(route,...args){
 if(L.route==='budgetAfterFunding'&&route!=='budgetAfterFunding')closePrompt();
 return beforeNavigate?.call(this,route,...args);
};

L.startBankFunding=()=>{
 L.ensureAccounts?.();
 const previous=L.state.bankFunding,t=transaction(previous?.txId);
 // Reopening an unfinished instruction sheet preserves its sample amount.
 // A completed transfer starts a new draft; its reference can never be reused.
 if(!previous||t&&t.status!=='pending')L.state.bankFunding={id:L.id('BF'),...(t?.status==='failed'?{amount:previous.amount??t.amount}:{})};
 L.save();L.go('bankAdd');
};
L.bankDetailsText=()=>{const a=account();return 'Sample Lumo receiving details. Do not send real money.\nBank: GCB Bank (sample)\nAccount name: '+a.name+'\nOperational account number: '+a.number;};
L.copyBankDetails=()=>L.copy(L.bankDetailsText());
L.copyOperationalNumber=()=>L.copy(String(account().number));
L.bankSent=()=>L.toast('An outgoing bank transfer is not confirmed Lumo credit. Wait until it appears in your incoming activity.');
L.simulateBankReceipt=()=>{
 if(!L.state.onboarded||L.state.locked||L.state.closed)return L.go('signin');
 const f=L.state.bankFunding||(L.state.bankFunding={id:L.id('BF')});
 if(f.txId){L.go('bankAdd');firstFundingResult();return;}
 const raw=L.value('bank-test-amount'),amount=Number(raw);
 f.amount=raw;L.save();
 if(!raw||!Number.isFinite(amount)||amount<0.01||amount>5000||Math.abs(amount*100-Math.round(amount*100))>0.000001)return L.error('Enter GH₵0.01 to GH₵5,000.00, using no more than 2 decimal places.','bank-test-amount');
 const a=account();
 const t=L.addTx({draftId:f.id,type:'in',name:'Bank transfer received',amount:Math.round(amount*100)/100,fee:0,status:'success',category:'Top ups',method:'GIP incoming',destination:a.number,note:'Simulated confirmed incoming bank credit. No bank transfer was made.'});
 f.txId=t.id;L.save();L.go('bankAdd');firstFundingResult();
};
// Retain the tester entry point while exposing the same explicit simulation
// to ordinary prototype visitors. Both use one idempotent ledger operation.
const simulateBankReceipt=L.simulateBankReceipt;
L.simulateBankReceipt=function(...args){try{return L.persistence?.transaction?L.persistence.transaction(()=>simulateBankReceipt.apply(this,args),{financial:true,label:'Confirm incoming bank money'}):simulateBankReceipt.apply(this,args);}catch(error){L.render();L.error(error.message||'The incoming transfer could not be saved. Keep the same reference.');return false;}};
L.testBankCredit=L.simulateBankReceipt;
document.addEventListener('input',event=>{
 if(L.route!=='bankAdd'||event.target?.id!=='bank-test-amount'||document.getElementById('bank-test-amount')!==event.target||L.state.bankFunding?.txId)return;
 L.state.bankFunding.amount=String(event.target.value||'');L.save();
});
L.views.bankAdd=()=>{
 const a=account(),f=L.state.bankFunding||(L.state.bankFunding={id:L.id('BF')}),t=transaction(f.txId);
 if(t){
  const success=confirmed(t),pending=t.status==='pending';
  const receiptAction=pending?`L.refreshPayment('${E(t.id)}')`:`L.go('txDetail',{id:'${E(t.id)}'})`;
  return `<section class="bank-funding-result">${L.header(success?'Money added.':pending?'Waiting for the transfer.':'Transfer not completed.')}
  <div class="notice"><span class="avatar" aria-hidden="true">${L.icon(success?'check':pending?'clock':'close',26)}</span><strong>${M(t.amount)}${success?' received':pending?' not received yet':' was not added'}.</strong><p class="small">${success?'Confirmed sample money.':pending?'Your balance changes only when incoming money is confirmed.':'Your balance has not been credited.'}</p></div>
  <div class="receipt">${row('Account','Operational · '+a.number)}${row('Reference',t.id)}${row('Status',success?'Completed':pending?'Pending':'Not completed')}</div>
  <div class="actions">${B(nextLabel(t),'L.fundingDone()')}${B(pending?'Check status':'View receipt',receiptAction,'secondary')}${!success&&!pending?B('Try another sample transfer','L.startBankFunding()','text-btn'):''}</div><p class="preview-boundary">Sample money. No live bank transfer.</p></section>`;
 }
 return `<section class="bank-funding-guide" data-illustrated-screen="bankAdd">${L.header('Add from your bank','Use GIP in your existing bank app.')}
 <p class="preview-boundary"><strong>Sample account. Do not send real money.</strong></p>
 <div class="receipt">${row('Receiving bank','GCB Bank (sample)')}${row('Account name',a.name)}${row('Operational account',a.number)}</div>
 <div class="grid2">${B('Copy account number','L.copyOperationalNumber()','secondary')}${B('Copy all details','L.copyBankDetails()','secondary')}</div>
 <details class="optional-fields" open><summary>How to send with GIP</summary><ol class="small"><li>Open your bank app and choose <strong>Transfers</strong>.</li><li>Select <strong>Other bank</strong>, <strong>GIP</strong> or <strong>InstantPay</strong>.</li><li>Choose <strong>GCB Bank</strong> and enter your Lumo operational account number.</li><li>Check the beneficiary name and enter the amount.</li><li>Authorise the transfer in your bank app.</li><li>Wait for the incoming transfer to be confirmed in Lumo.</li></ol><p class="tiny muted">Labels vary between bank apps. A bank debit or “I sent it” does not confirm receipt.</p></details>
 <details class="optional-fields"${L.state.onboardingFunding&&!L.state.onboardingFunding.done?' open':''}><summary>Try a sample bank transfer</summary><p class="small muted">For this prototype only. This adds sample money without contacting a bank.</p><form class="form" onsubmit="event.preventDefault();L.simulateBankReceipt()"><label class="field" for="bank-test-amount"><span>Sample amount</span><div class="inline payment-amount-row"><span class="payment-currency" aria-hidden="true">GH₵</span><input id="bank-test-amount" class="input amount-input" type="number" inputmode="decimal" min="0.01" max="5000" step="0.01" required aria-label="Sample amount in Ghana cedis" aria-describedby="error" value="${E(f.amount??'')}" placeholder="0.00"></div></label>${error}<button type="submit" class="primary">Simulate received money</button></form></details>
 <div class="actions">${B('Check incoming activity',"L.go('activity',{filter:'in'})",'text-btn')}${B(paymentReturn()?'Return to payment':'Done','L.fundingDone()','secondary')}</div>
 </section>`;
};
})();
