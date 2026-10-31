/* Help follows the decision into Chat. It carries a read-only explanation,
   never an authorisation, partner secret or replacement payment draft. */
(()=>{
'use strict';
if(!window.L||L.contextualChat)return;
const E=L.e,M=L.money,B=L.btn;
const parents=new Set(['home','pay','plan','chat','more']);
const supported=new Set(['pause','balances','planExplanation','goal','releaseGoal','paymentReview','boxProtectionInvite','boxProtectionChange','boxProtectionSupport']);
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const clone=x=>JSON.parse(JSON.stringify(x||{}));
const box=id=>(L.state.goals||[]).find(g=>g.id===id&&!g.archived);
const protectedBox=id=>{try{return L.boxProtection?.get(id)?.status||'off';}catch{return 'off';}};
let context=null,handoff=null;
const valid=()=>{if(context?.account!==L.state){context=null;handoff=null;}return allowed()?context:null;};
const paymentMark=d=>JSON.stringify([d?.id,d?.method,d?.name,d?.destination,d?.provider,Number(d?.amount),Number(d?.fee||0),d?.essentialId||'',d?.boxId||'',d?.boxDirection||'',d?.submittedTxId||'']);
const financialMark=()=>JSON.stringify([L.state.balance,(L.state.essentials||[]).map(x=>[x.id,x.name,x.budgetCategory,x.amount,x.paid,x.externalPaid,!!x.archived,!!x.deleted]),(L.state.goals||[]).map(g=>[g.id,g.allocated,!!g.archived]),(L.state.txs||[]).map(t=>[t.id,t.status,t.type,t.amount,t.fee,t.essentialId]),L.state.planHorizon]);
const returnLabel=c=>c.kind==='payment'?'Return to payment':c.kind==='box'?'Return to Money Box':'Return to breakdown';
function source(){
 if(!allowed()||!supported.has(L.route))return null;
 const d=L.state.paymentDraft;
 if(L.route==='pause')return d&&!d.submittedTxId?{kind:'payment',draftId:d.id}:null;
 if(['balances','planExplanation'].includes(L.route))return {kind:'balance'};
 const id=L.route==='paymentReview'?d?.boxId:L.params.id||L.state.moneyBoxProtectionFlow?.boxId||d?.boxId;
 const g=box(id),protection=protectedBox(id);
 if(!g||protection==='off')return null;
 if(L.route==='paymentReview'&&!(d?.method==='box'&&d.boxDirection==='out'&&d.boxId===id&&!d.submittedTxId))return null;
 if(L.route==='releaseGoal'&&!(d?.method==='box'&&d.boxDirection==='out'&&d.boxId===id&&!d.submittedTxId))return null;
 return {kind:'box',boxId:id,...(d?.method==='box'&&d.boxId===id&&!d.submittedTxId&&['releaseGoal','paymentReview'].includes(L.route)?{draftId:d.id}:{})};
}
function answer(c=valid()){
 if(!c)return null;
 const base={intent:'contextualHelp',context:{days:30,category:''},contextualHelpToken:c.id,action:returnLabel(c),route:'contextualChatReturn',secondaryAction:'Stay in Chat',secondaryRoute:'contextualChatDismiss'};
 const make=(headline,support,calculation)=>({...base,contextualHelpMark:financialMark(),headline,support,text:[headline,support].filter(Boolean).join(' '),...(calculation?{calculation}:{})});
 if(c.kind==='payment'){
  const d=L.state.paymentDraft;
  if(!d||d.id!==c.draftId)return make('That payment has changed.','Open the current payment from Pay. This explanation cannot restore an older draft.');
  if(d.submittedTxId){const t=(L.state.txs||[]).find(x=>x.id===d.submittedTxId);return make(t?.status==='success'?'That payment is now confirmed.':t?.status==='pending'?'That payment is now pending.':'That payment now has a result.','Return to the result to check its current status. Do not submit it again.');}
  const p=L.planImpactSummary(d);
  const selected=(L.state.essentials||[]).find(x=>x.id===d.essentialId),source=selected?`${M(p.essentialCovered)} would fulfil your ${selected.name} Budget item.`:'This is checked as extra spending outside your saved Budget.';
  const headline=p.headline||'Here is what this payment would change.';
  return make(headline,`Considering ${M(Number(d.amount)+Number(d.fee||0))} to ${d.name}. ${source} Nothing has been sent.`,{rows:[['Available Everyday money',M(p.available)],['Payment, including fee',M(Number(d.amount)+Number(d.fee||0))],['Projected Everyday balance',M(p.after)],['Budget costs still to cover afterward',M(p.essentialsAfter)],['Projected left after Budget',M(p.room)],...(p.totalGap?[['Projected Budget shortfall',M(p.totalGap)]]:[])],notes:['This explains the same projection as the Pause. Only saved Budget costs are included. Money Boxes are held separately in savings. Return to the payment to edit, defer or continue to separate authorisation.']});
 }
 if(c.kind==='box'){
  const g=box(c.boxId);if(!g)return make('This Money Box is no longer available.','Open Money Boxes to choose a current box. No money has moved through this conversation.');
  const status=protectedBox(g.id),headline=status==='active'?'Your partner helps protect transfers back.':status==='invited'?'Protection starts after your partner accepts.':'This Money Box is currently unprotected.';
  const support=status==='active'?'A transfer back needs fresh partner approval, then your own PIN or biometric approval. If your partner cannot be reached, verified Lumo support is the fallback. Chat cannot approve or unlock it.':status==='invited'?'An invitation is not approval. Until it is accepted, the box stays unprotected. Chat cannot accept an invitation or authorise a transfer.':'Money in this box remains in savings. Your own authorisation is required before it can move back to Everyday money.';
  return make(headline,support,{rows:[['Money Box',g.name],['Money in this box',M(g.allocated)],['Available to transfer back',M(L.moneyBoxAvailable(g.id))],['Protection',status==='active'?'Partner protected':status==='invited'?'Invitation awaiting acceptance':'Off']],notes:['The accountability partner cannot access your money. Codes and partner contact details are not shared with Chat. This is a prototype explanation; no SMS or call is sent.']});
 }
 const b=L.balances(),s=L.accountBalances(),has=L.budgetStateSummary?.().hasBudget;
 const headline=has?`${M(b.room)} is left outside your saved Budget costs.`:`${M(b.available)} is available in Everyday money.`;
 const support=has?`${M(b.available)} available minus ${M(b.essentials)} still needed for your Budget. Money Boxes are already in savings and are not deducted again.`:'Save the costs this money needs to cover before using a spending-room figure. Money Boxes are held separately in savings.';
 return make(headline,support,{rows:[['Available Everyday money',M(b.available)],['Budget costs still to cover',M(b.essentials)],['Left after Budget',M(b.room)],['Money Box savings',M(s.savings)]],notes:['Left after Budget is part of the same Everyday balance, not a separate account or a guarantee. Expected money is excluded until it arrives. Only saved costs are included.']});
}
function retire(c){
 if(!c||c.account!==L.state)return;
 for(const r of L.state.chats||[])if(r.contextualHelpToken===c.id){delete r.action;delete r.route;delete r.secondaryAction;delete r.secondaryRoute;}
}
function reconcile(route,params){
 if(!handoff||route!=='chat'||!context||handoff!==context.id||context.account!==L.state)return false;
 const state=window.history?.state;
 if(L.taskSheet?.active||!state?.lumo||state.route!=='chat'||state.taskSheet)return false;
 handoff=null;
 if(L.route!=='chat'){L.beforeNavigate?.('chat',state.params||{});L.route='chat';L.params=clone(state.params);L.history=clone(state.stack||[]);}
 L.render();return true;
}
function open(){
 const from=source();if(!from)return false;
 L.savePaymentFields?.();L.captureFormDraft?.();
 if(L.budgetGuide?.active())L.budgetGuide.pause();
 retire(valid());
 const params={};if(L.params.id)params.id=L.params.id;
 const parentRoute=L.taskSheet?.parentRoute||[...(L.history||[])].reverse().find(x=>parents.has(x.route))?.route||(from.kind==='payment'?'pay':from.kind==='box'?'plan':'home');
 context={...from,id:L.id('HC'),account:L.state,route:L.route,params,parentRoute,parentScroll:document.getElementById('task-parent-view')?.scrollTop||0,paymentMark:from.draftId?paymentMark(L.state.paymentDraft):null,financialMark:financialMark()};
 const reply=answer(context);context.financialMark=financialMark();context.paymentMark=from.draftId?paymentMark(L.state.paymentDraft):null;
 const question=from.kind==='payment'?'Help me understand this payment':from.kind==='box'?'Help me understand this Money Box':'Help me understand this breakdown';
 (L.state.chats||=[]).push({q:question,...reply});L.save();
 const fromTask=!!L.taskSheet?.active;handoff=fromTask?context.id:null;
 // go deliberately finishes this task without cancelling its unsubmitted
 // payment. The second request acknowledges native history's settled entry.
 L.go('chat',{days:30,category:''});if(fromTask)L.go('chat',{days:30,category:''});
 return true;
}
function dismiss(token){const c=valid();if(!c||token&&token!==c.id||L.route!=='chat')return false;retire(c);context=null;handoff=null;L.save();L.render();return true;}
function returnToTask(token){
 const c=valid();if(!c||token&&token!==c.id||L.route!=='chat')return false;
 const d=L.state.paymentDraft;
 if(c.draftId&&(!d||d.id!==c.draftId)){L.toast('That payment changed. Open the current payment from Pay.');dismiss(c.id);return false;}
 if(c.boxId&&!box(c.boxId)){L.toast('That Money Box is no longer available.');dismiss(c.id);return false;}
 let route=c.route,params=clone(c.params);
 if(c.draftId&&d.submittedTxId){route='paymentResult';params={id:d.submittedTxId};}
 else if(c.draftId&&(c.paymentMark!==paymentMark(d)||c.financialMark!==financialMark())){
  route='paymentReview';params={};
  for(const key of ['reviewFingerprint','pauseAcceptedSignature','pauseOffer','pauseExposureSignature','boxQuote'])delete d[key];
  L.toast('Your payment or money changed. Review the current figures.');
 }
 retire(c);context=null;handoff=null;L.save();
 if(c.parentRoute!=='chat'){L.openTab(c.parentRoute);const parent=document.getElementById('view');if(parent)parent.scrollTop=c.parentScroll;}
 L.go(route,params);return true;
}
for(const route of supported){
 const view=L.views[route];if(typeof view!=='function')continue;
 L.views[route]=function(...args){const html=view.apply(this,args);if(!source())return html;const entry=B(`${L.icon('chat',16)}<span>Help me understand this</span>`,'L.contextualChat.open()','text-btn contextual-chat-entry');
  if(route==='pause'){
   const calculation=/<details\b[^>]*class="[^"]*\bpause-calculation\b[^"]*"[^>]*>[\s\S]*?<\/details>/;
   if(calculation.test(html))return html.replace(calculation,match=>`<div class="contextual-pause-tools" data-pause-effects aria-hidden="true" inert>${match}${entry}</div>`);
  }
  if(html.includes('<div id="error"'))return html.replace('<div id="error"',entry+'<div id="error"');
  if(html.includes('<div class="actions'))return html.replace('<div class="actions',entry+'<div class="actions');
  return html+entry;
 };
}
const chat=L.views.chat;
L.views.chat=function(...args){let html=chat.apply(this,args);const c=valid();if(!c)return html;
 const button=B(`${L.icon('arrowLeft',20)}<span>${E(returnLabel(c))}</span>`,'L.contextualChat.returnToTask()','chat-banking-back contextual-chat-return').replace('<button ',`<button data-context-return aria-label="${E(returnLabel(c))}" `);
 return html.replace(/<button\b[^>]*class="chat-banking-back"[^>]*>[\s\S]*?<\/button>/,button);
};
const openAnswer=L.chatOpenAnswer;
L.chatOpenAnswer=function(index,secondary=false){
 const r=L.state.chats?.[index],route=secondary?r?.secondaryRoute:r?.route;
 if(route==='contextualChatReturn')return returnToTask(r.contextualHelpToken);
 if(route==='contextualChatDismiss')return dismiss(r.contextualHelpToken);
 return openAnswer.apply(this,arguments);
};
const previousAnswer=L.chatAnswer;
L.chatAnswer=function(question,...args){
 const c=valid(),q=String(question||'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim(),last=(L.state.chats||[]).at(-1);
 if(c&&L.route==='chat'&&(/^(?:help me understand|explain) (?:this|this payment|this breakdown|this money box)$/.test(q)||last?.contextualHelpToken===c.id&&/^(?:why|why is that|what does that mean|how did you work that out|can you explain)$/.test(q)))return answer(c);
 return previousAnswer.call(this,question,...args);
};
const status=L.chatSnapshotStatusExtra;
L.chatSnapshotStatusExtra=function(r){const old=status?.apply(this,arguments);if(old)return old;return r.contextualHelpToken&&r.contextualHelpMark!==financialMark()?'Earlier explanation. Your money or Budget has changed.':'';};
const go=L.go;
L.go=function(route,params,...args){if(reconcile(route,params))return;return go.call(this,route,params,...args);};
const close=L.closeBankingChat;
L.closeBankingChat=function(...args){return valid()&&L.route==='chat'?returnToTask():close?.apply(this,args);};
// A reload cannot retain the closure that owns a return action. Historical
// explanations remain readable, without reviving a closed task from storage.
for(const r of L.state.chats||[])if(r.contextualHelpToken){delete r.action;delete r.route;delete r.secondaryAction;delete r.secondaryRoute;}
L.contextualChat={open,returnToTask,dismiss,current:()=>{const c=valid();return c?{id:c.id,kind:c.kind,returnLabel:returnLabel(c),parentRoute:c.parentRoute}:null;}};
})();
