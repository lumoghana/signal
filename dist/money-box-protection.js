/* Local prototype only. Partner messages, codes and support decisions are
   simulations. A production service must own these checks and code delivery. */
(()=>{
'use strict';
const TTL=5*60*1000,INVITE_TTL=10*60*1000,RESEND=30*1000,MAX_ATTEMPTS=5;
const grants=new Map();
const now=()=>Date.now(),copy=x=>x?JSON.parse(JSON.stringify(x)):null;
const box=id=>L.state.goals?.find(g=>g.id===id);
const minor=n=>Math.round(Number(n)*100);
const normalizePhone=value=>{let n=String(value||'').replace(/[^\d+]/g,'');if(n.startsWith('+233'))n='0'+n.slice(4);else if(n.startsWith('233'))n='0'+n.slice(3);return /^0[235]\d{8}$/.test(n)?n:'';};
const state=()=>{const s=L.state;if(!s.moneyBoxProtection||s.moneyBoxProtection.version!==1)s.moneyBoxProtection={version:1,boxes:{},challenges:[],cases:[]};return s.moneyBoxProtection;};
const record=id=>state().boxes[id]||{status:'off',phone:'',revision:0};
const checkSession=()=>{if(!L.state.onboarded||L.state.closed||L.state.locked)throw Error('Sign in to an open demo account first.');};
const requireBox=id=>{checkSession();const g=box(id);if(!g||g.archived)throw Error('This Money Box is unavailable.');return g;};
const phone=value=>{const n=normalizePhone(value);if(!n)throw Error('Enter a valid Ghana mobile number for your partner.');if(n===normalizePhone(L.state.profile?.phone))throw Error('Choose someone else as your accountability partner.');return n;};
let lastCode='';
const code=()=>{let n=String(100000+Math.floor(Math.random()*900000));if(n===lastCode)n=String(100000+(Number(n)-100000+1)%900000);lastCode=n;return n;};
const challenge=id=>state().challenges.find(c=>c.id===id);
const current=c=>{const p=c&&record(c.boxId);return !!c&&!!box(c.boxId)&&p.status==='active'&&c.revision===p.revision&&c.phone===p.phone;};
const available=c=>current(c)&&c.status==='approved'&&c.expiresAt>now()&&(c.approvedBy==='verified-support'||c.phone!==normalizePhone(L.state.profile?.phone));
const matches=(c,d)=>current(c)&&c.kind==='withdrawal'&&c.draftId===d?.id&&c.boxId===d?.boxId&&c.amountMinor===minor(d?.amount)&&d?.method==='box'&&d?.boxDirection==='out';
const findDraft=d=>state().challenges.slice().reverse().find(c=>matches(c,d)&&!['superseded','consumed'].includes(c.status))||null;
const invalidate=id=>{for(const c of state().challenges)if(c.boxId===id&&!['consumed','superseded'].includes(c.status))c.status='superseded';for(const [key,g]of grants)if(g.boxId===id)grants.delete(key);};
const validChange=c=>available(c)&&c.kind==='change';
const api={
 normalizePhone,
 get:id=>copy(record(id)),
 getChallenge:id=>copy(challenge(id)),
 getSupport:id=>copy(state().cases.find(c=>c.id===id)),
 challengeForDraft:d=>copy(findDraft(d)),
 beginInvite(id,{phone:value,approvalId}={}){
  requireBox(id);const n=phone(value),p=record(id),approved=challenge(approvalId);
  if(p.status==='active'&&(!validChange(approved)||approved.boxId!==id||approved.remove||approved.newPhone!==n))throw Error('Your current partner or verified Lumo support must approve changing protection.');
  const prior=p.invitation;if(prior?.status==='pending'&&prior.phone===n&&prior.expiresAt>now())return copy(prior);
  const invitation={id:L.id('partner-invite'),boxId:id,phone:n,code:code(),status:'pending',createdAt:now(),expiresAt:now()+INVITE_TTL,attempts:0,baseRevision:p.revision||0};
  const next={...p,invitation};if(p.status!=='active')next.status='invited';
  if(p.status==='active'){approved.status='consumed';approved.consumedAt=now();invitation.approvedChangeId=approved.id;}
  state().boxes[id]=next;L.save();return copy(invitation);
 },
 resendInvitation(id){
  requireBox(id);const p=record(id),prior=p.invitation;if(!prior||prior.status==='accepted')throw Error('There is no pending invitation to resend.');
  phone(prior.phone);
  if(prior.baseRevision!==(p.revision||0))throw Error('Protection changed. Request approval again.');
  if(prior.status==='pending'&&prior.expiresAt>now()&&prior.createdAt+RESEND>now())throw Error('Wait a moment before sending another sample invitation.');
  if(p.status==='active'){
   const approved=challenge(prior.approvedChangeId);
   if(!current(approved)||approved.status!=='consumed'||approved.kind!=='change'||approved.remove||approved.newPhone!==prior.phone)throw Error('Your current partner must approve this replacement invitation.');
  }
  const invitation={...prior,id:L.id('partner-invite'),code:code(),status:'pending',createdAt:now(),expiresAt:now()+INVITE_TTL,attempts:0};
  p.invitation=invitation;if(p.status!=='active')p.status='invited';L.save();return copy(invitation);
 },
 acceptInvitation(id,value){
  checkSession();const p=Object.values(state().boxes).find(p=>p.invitation?.id===id),i=p?.invitation;if(!i)throw Error('This invitation is unavailable.');requireBox(i.boxId);
  if(i.status!=='pending')throw Error('Request a new partner invitation.');
  if(i.expiresAt<=now()){i.status='expired';L.save();throw Error('This invitation expired. Send a new sample invitation.');}
  if(i.baseRevision!==(p.revision||0))throw Error('Protection changed. Send a new invitation.');
  phone(i.phone);
  if(String(value||'').trim()!==i.code){i.attempts++;if(i.attempts>=MAX_ATTEMPTS)i.status='locked';L.save();throw Error(i.status==='locked'?'Too many incorrect codes. Send a new invitation.':'That invitation code doesn’t match.');}
  const next={status:'active',phone:i.phone,revision:(p.revision||0)+1,acceptedAt:now(),invitation:{...i,status:'accepted'}};
  state().boxes[i.boxId]=next;invalidate(i.boxId);L.save();return copy(next);
 },
 cancelInvitation(id){
  requireBox(id);const p=record(id);if(p.invitation?.status==='pending')p.invitation.status='cancelled';if(p.status==='invited')p.status='off';state().boxes[id]=p;L.save();return copy(p);
 },
 requestApproval({boxId,kind='withdrawal',draftId,amount,newPhone,remove=false}={}){
  requireBox(boxId);const p=record(boxId);if(p.status!=='active')throw Error('This Money Box has no active partner protection.');
  if(!['withdrawal','change'].includes(kind))throw Error('Choose a valid approval request.');
  const amountMinor=kind==='withdrawal'?minor(amount):0;
  if(kind==='withdrawal'&&(!draftId||L.moneyInput(amount,.01,5000)===null))throw Error('Enter the withdrawal amount before requesting a code.');
  const target=kind==='change'&&!remove?phone(newPhone):'';
  if(kind==='change'&&!remove&&target===p.phone)throw Error('Choose a different partner number.');
  const prior=state().challenges.slice().reverse().find(c=>c.boxId===boxId&&c.kind===kind&&(kind==='change'||c.draftId===draftId)&&!['consumed','superseded'].includes(c.status));
  if(prior&&prior.status==='pending'&&prior.expiresAt>now()&&prior.createdAt+RESEND>now()&&prior.amountMinor===amountMinor&&prior.newPhone===target&&prior.remove===!!remove)throw Error('Wait a moment before requesting another sample code.');
  for(const c of state().challenges)if(c.boxId===boxId&&c.kind===kind&&(kind==='change'||c.draftId===draftId)&&c.status!=='consumed')c.status='superseded';
  const c={id:L.id('box-approval'),boxId,kind,draftId:kind==='withdrawal'?draftId:'',amount:amountMinor/100,amountMinor,newPhone:target,remove:!!remove,phone:p.phone,revision:p.revision,code:code(),status:'pending',attempts:0,createdAt:now(),expiresAt:now()+TTL};
  state().challenges.push(c);L.save();return copy(c);
 },
 sampleMessage(id){
  const c=challenge(id);if(c){const g=box(c.boxId),action=c.kind==='withdrawal'?`transfer ${L.money(c.amountMinor/100)} from “${g?.name||'Money Box'}” to the owner’s everyday account`:c.remove?`remove partner protection from “${g?.name||'Money Box'}”`:`change the partner for “${g?.name||'Money Box'}” to ${c.newPhone}`;return `SIMULATED PARTNER MESSAGE · No SMS sent\nThe owner requests approval to ${action}. Code: ${c.code}. Valid for 5 minutes and this request only. Share it only if you agree. This gives you no access to the account or funds.`;}
  const p=Object.values(state().boxes).find(p=>p.invitation?.id===id),i=p?.invitation;if(!i)return '';
  return `SIMULATED PARTNER INVITATION · No SMS sent\nYou are invited to help protect “${box(i.boxId)?.name||'Money Box'}”. Future withdrawals or protection changes will need your approval. Acceptance code: ${i.code}. Valid for 10 minutes. You cannot access this account or move its funds.`;
 },
 approve(id,value){
  checkSession();const c=challenge(id);if(!current(c))throw Error('This request changed. Request a new partner code.');
  if(c.phone===normalizePhone(L.state.profile?.phone))throw Error('Your own number now matches this partner. Use verified Lumo support to replace the partner.');
  if(c.status==='approved'&&c.expiresAt>now())return copy(c);
  if(c.status!=='pending')throw Error('Request a new partner code or contact Lumo support.');
  if(c.expiresAt<=now()){c.status='expired';L.save();throw Error('This code expired. Request a new sample code.');}
  if(String(value||'').trim()!==c.code){c.attempts++;if(c.attempts>=MAX_ATTEMPTS)c.status='locked';L.save();throw Error(c.status==='locked'?'Too many incorrect codes. Request a new code or contact Lumo support.':'That partner code doesn’t match.');}
  c.status='approved';c.approvedAt=now();c.approvedBy='partner';L.save();return copy(c);
 },
 validWithdrawal(d){const c=findDraft(d);return !!c&&available(c);},
 authorizeWithdrawal(d,pin,proof){
  requireBox(d?.boxId);if(record(d.boxId).status!=='active')return true;
  const c=findDraft(d);if(!c||!available(c))throw Error('A fresh partner approval is needed for this transfer.');
  if(!L.biometricPayment?.valid(proof,d)){
   const result=L.authPolicy?.verify(pin,{purpose:'Authorise protected Money Box transfer'});
   if(!result?.ok){grants.delete(d.id);throw Error(result?.message||'Secure approval is unavailable. Reopen Lumo before trying again.');}
  }
  grants.set(d.id,{boxId:d.boxId,amountMinor:minor(d.amount),challengeId:c.id,revision:c.revision,expiresAt:Math.min(c.expiresAt,now()+60*1000)});return true;
 },
 revokeAuthorization:draftId=>grants.delete(draftId),
 applyChange(id){
  checkSession();const c=challenge(id);if(!validChange(c))throw Error('A fresh partner or verified support approval is needed.');
  if(!c.remove)return api.beginInvite(c.boxId,{phone:c.newPhone,approvalId:c.id});
  const p=record(c.boxId);c.status='consumed';c.consumedAt=now();state().boxes[c.boxId]={status:'off',phone:'',revision:p.revision+1,removedAt:now()};invalidate(c.boxId);L.save();return copy(record(c.boxId));
 },
 requestSupport(id){
  checkSession();const c=challenge(id);if(!current(c)||['consumed','superseded'].includes(c.status))throw Error('Review your request before contacting support.');
  const existing=state().cases.find(s=>s.challengeId===id&&s.status==='pending');if(existing)return copy(existing);
  const s={id:L.id('box-support'),challengeId:id,boxId:c.boxId,status:'pending',createdAt:now(),identityVerified:false,simulation:true};state().cases.push(s);L.save();return copy(s);
 },
 simulateSupportDecision(id,status,identityConfirmed=false){
  checkSession();const s=state().cases.find(s=>s.id===id),c=s&&challenge(s.challengeId);
  if(!s||s.status!=='pending')throw Error('This support request has already been decided or is unavailable.');
  if(!['approved','rejected'].includes(status))throw Error('Choose a sample support decision.');
  if(status==='approved'&&!identityConfirmed)throw Error('Complete the simulated identity check before sample support approval.');
  if(!current(c)||['consumed','superseded'].includes(c.status))throw Error('This request changed. Start a new approval request.');
  s.status=status;s.decidedAt=now();s.identityVerified=!!identityConfirmed;
  if(status==='approved'){c.status='approved';c.approvedBy='verified-support';c.supportCaseId=s.id;c.approvedAt=now();c.expiresAt=now()+TTL;}
  L.save();return copy(s);
 }
};
// Code failures and expiry are saved outcomes, not successful approvals. Keep
// those counters durable while rolling all protection facts back if saving
// fails. The grant is memory-only and must never survive a failed approval.
for(const name of ['beginInvite','resendInvitation','acceptInvitation','cancelInvitation','requestApproval','approve','authorizeWithdrawal','applyChange','requestSupport','simulateSupportDecision']){
 const perform=api[name];
 api[name]=function(...args){
  let result,failure;const before=new Map(grants);
  const run=()=>{try{result=perform.apply(this,args);}catch(error){failure=error;}};
  try{if(L.persistence?.transaction)L.persistence.transaction(run,{financial:false,label:'Save Money Box protection'});else run();}
  catch(error){grants.clear();for(const [id,grant]of before)grants.set(id,grant);throw error;}
  if(failure)throw failure;return result;
 };
}
L.boxProtection=api;
const transfer=L.transferMoneyBox;
const protectedTransfer=data=>{
 checkSession();const prior=data?.draftId&&L.state.txs.find(t=>L.isInternalTransfer(t)&&t.draftId===data.draftId);if(prior)return prior;
 if(data?.direction!=='out'||record(data.id).status!=='active')return transfer(data);
 const d={id:data.draftId,method:'box',boxDirection:'out',boxId:data.id,amount:data.amount},c=findDraft(d),g=grants.get(data.draftId);
 if(!c||!available(c)||!g||g.challengeId!==c.id||g.boxId!==data.id||g.amountMinor!==minor(data.amount)||g.revision!==record(data.id).revision||g.expiresAt<=now())throw Error('Partner approval and your own Lumo PIN are required for this protected transfer.');
 const result=transfer(data);
 c.status='consumed';c.consumedAt=now();c.transactionId=result.id;grants.delete(data.draftId);
 result.protectionApproval={id:c.id,revision:c.revision,approvedBy:c.approvedBy,approvedAt:c.approvedAt,submittedAt:now()};L.save();return result;
};
L.transferMoneyBox=data=>{
 const before=new Map(grants);
 try{return L.persistence?.transaction?L.persistence.transaction(()=>protectedTransfer(data),{financial:true,label:'Transfer Money Box funds'}):protectedTransfer(data);}
 catch(error){grants.clear();for(const [id,grant]of before)grants.set(id,grant);throw error;}
};
})();
