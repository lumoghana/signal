/* One optional partner approval, in the existing Money Box sheet. Every
   message, invitation and support decision here is a local simulation. */
(()=>{
'use strict';
const E=L.e,M=L.money,B=L.btn,J=JSON.stringify;
const P=()=>L.boxProtection;
const box=id=>L.state.goals.find(g=>g.id===id);
const draft=()=>L.state.paymentDraft;
const out=d=>d?.method==='box'&&d.boxDirection==='out';
const errors='<div id="error" role="alert"></div>';
const mask=phone=>{const n=String(phone||'').replace(/\D/g,'');return n?'••• '+n.slice(-4):'your partner';};
const flow=()=>L.state.moneyBoxProtectionFlow||{};
const protection=id=>P()?.get(id)||{status:'off',phone:''};
const active=id=>protection(id).status==='active';
const hasInvitation=p=>p.invitation&&['pending','expired','locked'].includes(p.invitation.status);
const sim='<p class="preview-boundary protection-simulation">Prototype simulation · No SMS or call is sent.</p>';
const codeField=id=>`<label class="field" for="${id}"><span>Partner approval code</span><input class="input" id="${id}" type="text" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="off" placeholder="6-digit code" aria-describedby="error"></label>`;
const tryAction=fn=>{
 let result,failure;const route=L.route,params={...L.params};
 const run=()=>{try{result=fn();}catch(error){failure=error;}};
 try{if(L.persistence?.transaction)L.persistence.transaction(run,{financial:false,label:'Save Money Box protection'});else run();}
 catch(error){failure=error;P()?.revokeAuthorization?.(draft()?.id);L.go(route,params);for(const field of document.querySelectorAll('input[type="password"],input[id$="verification-code"]'))field.value='';}
 if(failure){L.error(failure.message||'Please check and try again.');return false;}return result;
};
const finish=id=>{L.clearFormDraft?.('goalEdit',{id});delete L.state.moneyBoxProtectionFlow;L.save();L.go('goal',{id});};
const matching=(c,d)=>c&&c.kind==='withdrawal'&&c.boxId===d.boxId&&c.draftId===d.id&&Number(c.amountMinor)===Math.round(Number(d.amount)*100);
function currentChallenge(d,create=false){
 if(!out(d)||!active(d.boxId)||d.submittedTxId)return null;
 let c=P().challengeForDraft(d)||P().getChallenge(d.boxApprovalId);
 if(matching(c,d))return c;
 if(!create)return null;
 const createRequest=()=>{c=P().requestApproval({boxId:d.boxId,kind:'withdrawal',draftId:d.id,amount:Number(d.amount)});d.boxApprovalId=c.id;L.save();return c;};
 return L.persistence?.transaction?L.persistence.transaction(createRequest,{financial:false,label:'Save partner approval request'}):createRequest();
}
const sampleMessage=id=>`<details class="protection-sample-message"><summary>View sample partner message</summary><p class="small muted">In the live service, only your partner would receive this.</p><pre>${E(P().sampleMessage(id))}</pre></details>`;
const challengeStatus=c=>{
 if(c.expiresAt<=Date.now()||c.status==='expired')return '<p class="warning" role="status">This code expired. Request a new sample code.</p>';
 if(c.status==='approved')return '<p class="box-protection-status" role="status">'+L.icon('check',18)+(c.approvedBy==='verified-support'?' Verified sample support approval received.':' Partner approval received.')+'</p>';
 if(c.status==='locked')return '<p class="warning" role="status">Too many incorrect codes. Request a new sample code or contact support.</p>';
 return `<p class="small muted">Enter your partner’s code for this ${c.kind==='change'?'change':'transfer'}.</p>`;
};
L.moneyBoxProtectionFields=g=>{
 const p=g.id?protection(g.id):{status:'off'},pending=hasInvitation(p),edit=flow().boxId===g.id&&!flow().applied?flow().choice:undefined,enabled=edit?edit.enabled:p.status==='active'||p.status==='invited'||!!pending,phone=edit?.phone||(pending?p.invitation.phone:p.phone);
 return `<section class="box-protection-fields" aria-label="Optional Money Box protection"><label class="protection-toggle" for="goalProtect"><input id="goalProtect" type="checkbox" ${enabled?'checked':''} onchange="L.toggleMoneyBoxProtectionFields()"><span><strong>Protect this Money Box</strong><small>Optional · ask someone you trust to help you keep it saved.</small></span></label><div id="goalPartnerFields" ${enabled?'':'hidden'}><label class="field" for="goalPartner"><span>Accountability partner’s phone</span><input class="input" id="goalPartner" type="tel" inputmode="tel" autocomplete="off" value="${E(phone||'')}" placeholder="0241234567" aria-describedby="goalPartnerHint"></label><p class="small muted" id="goalPartnerHint">They approve each transfer back with a fresh code. They cannot access your money. Verified Lumo support is the fallback.</p>${p.status==='active'?'<p class="small muted">Changing your partner or switching protection off also needs approval.</p>':''}</div></section>`;
};
L.toggleMoneyBoxProtectionFields=()=>{const field=document.getElementById('goalPartnerFields'),toggle=document.getElementById('goalProtect');if(field&&toggle){field.hidden=!toggle.checked;toggle.checked?field.removeAttribute('hidden'):field.setAttribute('hidden','');}};
const restoreFormDraft=L.restoreFormDraft;
L.restoreFormDraft=()=>{const result=restoreFormDraft();if(L.route==='goalEdit')L.toggleMoneyBoxProtectionFields();return result;};
L.captureMoneyBoxProtection=g=>{
 const toggle=document.getElementById('goalProtect');if(!toggle)return undefined;
 const enabled=!!toggle.checked,phone=P().normalizePhone(L.value('goalPartner'));
 if(enabled&&!phone){L.error('Enter your partner’s valid Ghana phone number.','goalPartner');return false;}
 if(enabled&&phone===P().normalizePhone(L.state.profile.phone)){L.error('Use your partner’s phone number, different from your own.','goalPartner');return false;}
 return {enabled,phone};
};
L.finishMoneyBoxProtectionSave=(g,choice)=>{
 if(!choice)return false;
 try {
  const p=protection(g.id),params={id:g.id};
  if(p.status==='active'){
   if(choice.enabled&&choice.phone===p.phone){if(hasInvitation(p))P().cancelInvitation(g.id);if(flow().boxId===g.id)delete L.state.moneyBoxProtectionFlow;L.save();return false;}
   if(choice.enabled&&hasInvitation(p)&&p.invitation.phone===choice.phone){L.state.moneyBoxProtectionFlow={boxId:g.id,choice,returnRoute:'goal',returnParams:params};L.save();L.finishForm('boxProtectionInvite',params);return true;}
   const c=P().requestApproval({boxId:g.id,kind:'change',newPhone:choice.enabled?choice.phone:undefined,remove:!choice.enabled});
   L.state.moneyBoxProtectionFlow={boxId:g.id,challengeId:c.id,choice,returnRoute:'goal',returnParams:params};L.save();L.finishForm('boxProtectionChange',params);return true;
  }
  if(!choice.enabled){if(p.invitation?.id)P().cancelInvitation?.(g.id);if(flow().boxId===g.id)delete L.state.moneyBoxProtectionFlow;L.save();return false;}
  if(!hasInvitation(p)||p.invitation?.phone!==choice.phone||p.invitation?.status!=='pending'||p.invitation?.expiresAt<=Date.now())P().beginInvite(g.id,{phone:choice.phone});
  L.state.moneyBoxProtectionFlow={boxId:g.id,choice,returnRoute:'goal',returnParams:params};L.save();L.finishForm('boxProtectionInvite',params);return true;
 } catch(e) {L.error(e.message||'Please check and try again.');return true;}
};
L.moneyBoxProtectionStatus=(g,compact=false)=>{
 const p=protection(g.id),pending=hasInvitation(p),a=p.status==='active';
 if(!a&&!pending&&p.status!=='invited')return '';
 const text=a?`Partner protected · ${mask(p.phone)}`:'Partner invitation awaiting acceptance';
 return compact?`<span class="box-protection-status">${L.icon(a?'lock':'clock',16)} ${E(text)}</span>`:`<section class="box-protection-status">${L.icon(a?'lock':'clock',18)}<span>${E(text)}${!a?'<small>Until accepted, this box stays unprotected.</small>':''}</span>${pending||p.status==='invited'?B('View invitation',`L.openMoneyBoxInvitation(${J(g.id)})`,'text-btn'):''}</section>`;
};
L.openMoneyBoxInvitation=id=>tryAction(()=>{L.state.moneyBoxProtectionFlow={boxId:id,returnRoute:'goal',returnParams:{id}};L.save();L.go('boxProtectionInvite',{id});});
L.views.boxProtectionInvite=()=>{
 const id=L.params.id||flow().boxId,g=box(id),p=protection(id),i=p.invitation;
 if(!g)return L.header('Money Box unavailable')+B('Back to Money Boxes',"L.go('goals')");
 if(p.status==='active'&&!hasInvitation(p))return L.header('Money Box protected')+`<div class="success-mark">${L.icon('lock',32)}</div><h2>${E(g.name)}</h2><p>Each transfer back now needs a fresh partner code, then your PIN or biometric approval.</p><p class="small muted">Partner: ${E(mask(p.phone))}. Protection changes also need approval.</p>`+B('Done',`L.finishMoneyBoxProtection(${J(id)})`)+sim;
 if(!i||!hasInvitation(p))return L.header('No invitation pending')+B('Back to Money Box',`L.finishMoneyBoxProtection(${J(id)})`,'secondary');
 return L.header('Partner invitation','Your partner chooses whether to accept.')+`<p><strong>${E(g.name)}</strong> · ${E(mask(i.phone))}</p><p class="small muted">${p.status==='active'?'Your current partner stays in place until the new partner accepts.':'Until accepted, this box stays unprotected.'}</p><details class="protection-sample-message"><summary>View sample invitation</summary><p class="small muted">Simulate your partner accepting this invitation. No real message is sent.</p><pre>${E(P().sampleMessage(i.id))}</pre></details><label class="field" for="invitation-verification-code"><span>Sample acceptance code</span><input class="input" id="invitation-verification-code" type="text" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="off" placeholder="6-digit code" aria-describedby="error"></label>${errors}<div class="actions">${B('Accept sample invitation','L.acceptMoneyBoxInvitation()')}${B('New sample invitation','L.resendMoneyBoxInvitation()','secondary')}${B('Finish later',`L.finishMoneyBoxProtection(${J(id)})`,'text-btn')}${B('Cancel invitation','L.cancelMoneyBoxInvitation()','text-btn')}</div>`+sim;
};
L.finishMoneyBoxProtection=id=>tryAction(()=>finish(id));
L.acceptMoneyBoxInvitation=()=>tryAction(()=>{const id=L.params.id||flow().boxId,i=protection(id).invitation;if(!i)throw Error('There is no pending invitation.');P().acceptInvitation(i.id,L.value('invitation-verification-code'));if(flow().boxId===id)flow().applied=true;L.save();L.render();});
L.cancelMoneyBoxInvitation=()=>tryAction(()=>{const id=L.params.id||flow().boxId;P().cancelInvitation(id);finish(id);L.toast(active(id)?'Invitation cancelled. Your current partner stays in place.':'Invitation cancelled. This box is unprotected.');});
L.resendMoneyBoxInvitation=()=>tryAction(()=>{const id=L.params.id||flow().boxId;P().resendInvitation(id);L.render();});
L.moneyBoxWithdrawalApproval=d=>{
 if(!active(d.boxId))return '';
 let c;try{c=currentChallenge(d,true);}catch(e){return `<p class="warning">${E(e.message)}</p>`;}
 const valid=P().validWithdrawal(d);
 return `<section class="partner-code-panel" aria-label="Partner approval"><div class="protection-scope">${L.icon('lock',20)}<strong>Partner approval</strong><span>${E(mask(protection(d.boxId).phone))}</span></div>${challengeStatus(c)}${valid?'':codeField('partner-verification-code')}${sampleMessage(c.id)}<div class="inline">${B('New sample code','L.refreshMoneyBoxApproval()','text-btn')}${B('Can’t reach your partner?','L.openMoneyBoxProtectionSupport()','text-btn')}</div><p class="tiny muted">Your own authorisation is still required. Sample code · No SMS sent.</p></section>`;
};
L.refreshMoneyBoxApproval=()=>tryAction(()=>{const d=draft();if(!out(d)||d.submittedTxId)return;const c=P().requestApproval({boxId:d.boxId,kind:'withdrawal',draftId:d.id,amount:Number(d.amount)});d.boxApprovalId=c.id;L.save();L.render();});
const continuePayment=L.continuePayment;
L.continuePayment=()=>{
 const d=draft();if(!out(d)||!active(d.boxId)||d.submittedTxId)return continuePayment();
 if(!P().validWithdrawal(d)){const c=tryAction(()=>currentChallenge(d,true));if(!c)return;if(tryAction(()=>P().approve(c.id,L.value('partner-verification-code')))===false)return;}
 if(!P().validWithdrawal(d))return L.error('Partner approval is needed for this amount.');
 return continuePayment();
};
const authorizePayment=L.authorizePayment;
L.authorizePayment=proof=>{
 const d=draft();if(!out(d)||!active(d.boxId)||d.submittedTxId)return authorizePayment(proof);
 if(!P().validWithdrawal(d)){L.go('paymentReview');L.error('Partner approval expired or the transfer changed. Request a fresh code.');return;}
 // Partner approval is independent of the student's PIN or biometric demo.
 // Proof is checked here without consuming it; the transfer executor uses it once.
 const pin=L.value('payment-pin');
 if(tryAction(()=>P().authorizeWithdrawal(d,pin,proof))===false){
  const field=document.getElementById('payment-pin');if(field)field.value='';
  const status=L.authPolicy?.status();if(status?.locked){L.go('signin',{returnTo:'paymentReview'});L.toast(status.message||'Sign in again before approving this transfer.');}
  return;
 }
 return authorizePayment(proof);
};
L.views.boxProtectionChange=()=>{
 const f=flow(),g=box(f.boxId||L.params.id),c=P().getChallenge(f.challengeId);
 if(!g||!c)return L.header('No protection change pending')+B('Back to Money Boxes',"L.go('goals')");
 if(f.applied){const on=active(g.id);return L.header(on?'Protection updated':'Protection switched off')+`<div class="success-mark">${L.icon(on?'lock':'check',32)}</div><p>${on?E(g.name)+' is protected by your partner, '+E(mask(protection(g.id).phone))+'. Transfers back need a fresh approval code and your PIN or biometric approval.':E(g.name)+' stays in your savings account. Future transfers back need your Lumo PIN.'}</p>`+B('Done',`L.finishMoneyBoxProtection(${J(g.id)})`)+sim;}
 return L.header('Approve protection change')+`<p><strong>${E(g.name)}</strong></p><p>${c.remove?'Switch off partner protection.':'Change accountability partner to '+E(mask(c.newPhone))+'.'}</p><p class="small muted">Your current partner must approve this change. Protection stays in place until approval is complete.</p>${challengeStatus(c)}${codeField('protection-verification-code')}${sampleMessage(c.id)}${errors}<div class="actions">${B('Confirm change','L.confirmMoneyBoxProtectionChange()')}${B('Can’t reach your partner?','L.openMoneyBoxProtectionSupport()','secondary')}${B('Keep current protection',`L.finishMoneyBoxProtection(${J(g.id)})`,'text-btn')}</div>`+sim;
};
L.confirmMoneyBoxProtectionChange=()=>tryAction(()=>{
 const f=flow(),c=P().getChallenge(f.challengeId);if(!c)throw Error('Start this change again.');
 if(c.status!=='approved')P().approve(c.id,L.value('protection-verification-code'));
 P().applyChange(c.id);const p=protection(f.boxId);f.applied=true;L.save();
 L.go(hasInvitation(p)?'boxProtectionInvite':'boxProtectionChange',{id:f.boxId});
});
L.openMoneyBoxProtectionSupport=()=>tryAction(()=>{
 const f=flow(),d=draft(),withdrawal=['paymentReview','authorize'].includes(L.route)&&out(d),c=withdrawal?currentChallenge(d,true):P().getChallenge(f.challengeId);
 if(!c)throw Error('Start a partner approval request first.');
 const s=P().requestSupport(c.id);L.state.moneyBoxProtectionFlow={...f,boxId:c.boxId,challengeId:c.id,supportId:s.id,returnRoute:withdrawal?'paymentReview':'boxProtectionChange',returnParams:withdrawal?{}:{id:c.boxId}};L.save();L.go('boxProtectionSupport',{id:c.boxId});
});
L.views.boxProtectionSupport=()=>{
 const f=flow(),s=P().getSupport(f.supportId),c=P().getChallenge(f.challengeId),g=box(f.boxId);
 if(!s||!c)return L.header('No support request pending')+B('Back to Money Boxes',"L.go('goals')");
 const approved=s.status==='approved',rejected=s.status==='rejected';
 return L.header('Lumo support fallback')+`<p><strong>${E(g?.name||'Money Box')}</strong> · ${c.kind==='withdrawal'?M(c.amountMinor/100)+' transfer back':'Protection change'}</p><div class="protection-support notice" role="status"><strong>${approved?'Sample request approved':rejected?'Sample request declined':'Awaiting verification'}</strong><p class="small">${approved?c.kind==='withdrawal'?'Only this transfer is approved. Your PIN or biometric approval is still required to move money.':'Only this protection change is approved. Return to the request to confirm it.':rejected?'Protection stays in place. No money moved.':'Your Money Box remains protected. Opening this request does not unlock funds.'}</p><p class="tiny muted">Reference ${E(s.id)} · Saved on this device, not sent to a call centre.</p></div>`+(approved||rejected?'':`<details class="protection-simulation"><summary>Try the support simulation</summary><p class="small muted">In a live service, call Lumo support for an identity check. No real call or verification happens here.</p><label class="protection-toggle" for="protection-identity"><input type="checkbox" id="protection-identity"><span>Simulate a completed identity check</span></label><div class="actions">${B('Simulate support approval',"L.decideMoneyBoxProtectionSupport('approved')",'secondary')}${B('Simulate decline',"L.decideMoneyBoxProtectionSupport('rejected')",'text-btn')}</div></details>`)+errors+`<div class="actions">${B(approved?'Return to request':'Back to request','L.returnFromMoneyBoxSupport()',approved?'primary':'secondary')}</div>`+sim;
};
L.decideMoneyBoxProtectionSupport=status=>tryAction(()=>{P().simulateSupportDecision(flow().supportId,status,!!document.getElementById('protection-identity')?.checked);L.render();});
L.returnFromMoneyBoxSupport=()=>{const f=flow();L.go(f.returnRoute||'goal',f.returnParams||{id:f.boxId});};
})();
