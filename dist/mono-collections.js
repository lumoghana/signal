/* Monochrome collection orientation. Reads the existing collection controller;
   it does not create records, grant roles, accept rules or move sample funds. */
(()=>{
'use strict';
if(!window.L||L.monoCollections)return;
const E=L.e;
const allowed=()=>L.state.onboarded&&!L.state.locked&&!L.state.closed;
const owner=()=>String(L.state.profile?.account||L.state.profile?.handle||L.state.profile?.phone||L.state.profile?.name);
const setupSteps=new Map([['groupMoneyCollection',1],['groupMoneyPeople',2],['groupMoneyApprovers',2],['groupMoneyContacts',2],['groupMoneySaveGroup',2],['groupMoneyRemoveGroup',2],['groupMoneyReview',3]]);
const progress=step=>`<ol class="mono-collection-steps" aria-label="Collection setup">${['Details','People & rules','Review'].map((label,index)=>`<li${index+1===step?' aria-current="step"':''}${index+1<step?' class="is-complete"':''}><span aria-hidden="true">${index+1}</span><strong>${E(label)}</strong></li>`).join('')}</ol>`;
function divBlock(html,marker){
 const start=html.indexOf(marker);if(start<0)return '';
 const tags=/<\/?div\b[^>]*>/g;tags.lastIndex=start;let depth=0,match;
 while((match=tags.exec(html))){depth+=match[0].startsWith('</')?-1:1;if(depth===0)return html.slice(start,tags.lastIndex);}
 return '';
}
const addToBody=(html,content)=>html.replace('<div class="gm-body">','<div class="gm-body">'+content);
const role=a=>a.isOrganiser?(a.isApprover?'Organiser · approver':'Organiser'):a.isApprover?'Approver':'Contributor';
const rule=m=>!m||m.legacy?'No agreed mandate':!m.valid?'Mandate needs review':`${m.requiredApprovals} of ${m.approverCount} ${m.approval==='named'?'named approvers':'members'}`;
const nextLine=text=>`<p class="mono-collection-next"><strong>Next</strong><span>${E(text)}</span></p>`;
const facts=(a,m)=>`<dl class="mono-collection-facts"><div><dt>Your role</dt><dd>${E(m.valid||m.legacy?role(a):'Member')}</dd></div><div><dt>Payment rule</dt><dd>${E(rule(m))}</dd></div></dl>`;
const context=(a,m,next,extra='')=>`<section class="mono-collection-context" aria-label="Collection at a glance">${facts(a,m)}${extra}${nextLine(next)}</section>`;
function collectionNext(G,item,f,m,a){
 if(m.legacy)return 'Review this earlier collection’s activity.';
 if(!m.valid)return 'Review the saved mandate before continuing.';
 const proposals=(item.proposals||[]).map(p=>G.proposalSummary(item.id,p.id)).filter(Boolean);
 if(proposals.some(p=>p.status==='processing'))return a.canExecute?'Check the processing payout. Its money remains reserved.':'Follow the processing payout and its confirmation.';
 if(['cancelled','refunded'].includes(f.status))return 'View the collection’s history and sample refunds.';
 if(!m.allAccepted){const remaining=m.memberCount-m.acceptedCount;return `Waiting for ${remaining} ${remaining===1?'member':'members'} to accept the mandate.`;}
 const needsOwnApproval=proposals.some(p=>p.status==='pending'&&a.canApprove&&!p.approvedPersonIds.includes(a.localPersonId)&&!(p.declinedPersonIds||[]).includes(a.localPersonId));
 if(needsOwnApproval)return 'Review the payment awaiting your approval.';
 const ready=proposals.find(p=>p.status==='ready');
 if(ready)return a.canExecute&&ready.availableToExecute?'Release the approved payout with your PIN.':'Waiting for the organiser to release the approved payout.';
 if(proposals.some(p=>p.status==='failed'&&p.canRetry))return 'Review the failed payout before retrying with the same reference.';
 if(proposals.some(p=>p.status==='pending'))return 'Follow the proposal’s remaining approvals.';
 if(a.canPropose&&f.availableCents>0)return 'Request a payout for the group to approve.';
 if(f.canReceive&&a.canContribute)return a.isOrganiser?'Collect contributions towards the target.':'Contribute or follow the collection activity.';
 return 'View the collection’s balance and activity.';
}
function proposalNext(item,m,a,s){
 if(!m.valid||!s.valid)return 'These details need review. Approval and payment are unavailable.';
 if(s.status==='paid')return 'View the payment receipt and named approvers.';
 if(s.status==='processing')return a.canExecute?'Check the sample status. This payout’s money stays reserved.':'Follow the payout while it awaits confirmation.';
 if(s.status==='failed')return s.canRetry&&a.canExecute?'Review a retry with the same payment reference.':'View the failed payout and its activity.';
 if(s.status==='declined')return 'The required approvals cannot be reached. The decisions remain in activity.';
 if(s.status==='expired')return 'This proposal expired. Its decisions remain in the history.';
 if(s.status==='cancelled')return 'This proposal is closed. Its decisions remain in the history.';
 if(!m.allAccepted)return 'Every member must accept the mandate before spending.';
 if(s.status==='ready')return s.availableToExecute&&a.canExecute?'Release the approved payout with your PIN.':'Waiting for the organiser to release the approved payout.';
 if((s.declinedPersonIds||[]).includes(a.localPersonId))return 'Your decline is recorded. Follow the remaining decisions.';
 if(a.canApprove&&!s.approvedPersonIds.includes(a.localPersonId))return 'Review these exact details before approving.';
 return a.isApprover?'Your approval is recorded. Follow the remaining decisions.':'Follow the named approvers’ decisions.';
}
function invitationNext(s,html){
 if(html.includes('This invitation changed while you were reviewing it.'))return 'Review the latest invitation before deciding.';
 if(!s.valid||!s.mandate?.valid)return 'No membership or payment authority has been granted.';
 return {pending:'Read the mandate, then accept or decline.',accepted:'Open the collection to follow its balance and activity.',declined:'You have not joined this collection.',expired:'This invitation has expired.',closed:'This collection is closed to joining.'}[s.status]||'Return to your invitations.';
}
const decorate=L.decorateView;
L.decorateView=function(html,route){
 let result=decorate?decorate.call(this,html,route):html;
 if(!allowed()||!result.includes('class="gm-page"')||result.includes('class="mono-collection-context"'))return result;
 const G=L.groupMoney;if(!G)return result;
 // The shared payout surface now owns its three stages and exact mandate.
 // Do not repeat that status in an additional edition context panel.
 if(route==='groupMoneyProposalDetail'&&result.includes('class="gm-payout-steps"'))return result;
 const draft=L.state.groupMoney?.draft,step=setupSteps.get(route);
 if(step&&draft?.type==='collection'&&draft.account===owner()){
  result=result.replace(/(<p\b[^>]*>)\d of 3 · /,'$1').replace(/<div class="gm-step">[\s\S]*?<\/div>/,'');
  return addToBody(result,progress(step));
 }
 if(route==='groupMoneyInvitation'){
  const invitation=G.invitationSummary?.(L.params.id);if(!invitation)return result;
  const roleBlock=divBlock(result,'<div class="gm-invitation-role">'),mandateBlock=divBlock(result,'<div class="gm-invitation-mandate">');
  if(!roleBlock)return result;
  const grouped=`<section class="mono-collection-context mono-collection-invitation" aria-label="Invitation at a glance">${roleBlock}${mandateBlock}${nextLine(invitationNext(invitation,result))}</section>`;
  result=result.replace(roleBlock,grouped);if(mandateBlock){const second=result.indexOf(mandateBlock,result.indexOf(grouped)+grouped.length);if(second>=0)result=result.slice(0,second)+result.slice(second+mandateBlock.length);}
  return result;
 }
 if(!['groupMoneyDetail','groupMoneyPayments','groupMoneyProposalDetail'].includes(route))return result;
 const item=G.get(L.params.id);if(item?.type!=='collection')return result;
 const a=G.access?.(item),m=G.mandateSummary?.(item),f=G.summary(item);if(!a?.canView||!m||!f)return result;
 if(route==='groupMoneyProposalDetail'){
  const s=G.proposalSummary(item.id,L.params.proposalId),original=divBlock(result,'<div class="gm-mandate-summary">');if(!s||!original)return result;
  return result.replace(original,context(a,m,proposalNext(item,m,a,s),original));
 }
 if(route==='groupMoneyDetail'){
  const originalRole=divBlock(result,'<div class="gm-role-summary">');if(originalRole)result=result.replace(originalRole,'');
  // The mandate stays a direct link. Its approval rule now lives once in the
  // overview; the link points to the full rules and member acceptances.
  if(m.valid&&m.allAccepted)result=result.replace(/(<button\b[^>]*class="gm-mandate-card"[^>]*><span><strong>Mandate<\/strong><small>)[\s\S]*?(<\/small>)/,'$1Rules, roles & member acceptance$2');
 }
 if(route==='groupMoneyPayments')result=result.replace('<p class="gm-note">You can review and approve proposals under the mandate.</p>','').replace('<p class="gm-note">You can follow every proposal. The named approvers decide on payments.</p>','');
 const hero=divBlock(result,'<div class="gm-hero">'),overview=context(a,m,collectionNext(G,item,f,m,a));
 return hero?result.replace(hero,hero+overview):addToBody(result,overview);
};
L.monoCollections=Object.freeze({version:1});
})();
