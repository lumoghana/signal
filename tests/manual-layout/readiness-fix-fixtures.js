/* Source-owned local QA only. Loaded after overflow-seed in an isolated memory
   iframe. These scenarios use current controllers; no production authority. */
(()=>{
'use strict';
const date=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const field=(id,value)=>{const el=document.getElementById(id);if(!el)throw Error('Readiness fixture missing field '+id);el.value=String(value);return el;};
const go=(route,params={})=>{L.save();L.go(route,params);L.render();};
const requireOK=result=>{if(result?.ok===false)throw Error(result.error||result.message||'Readiness preparation failed');return result;};
const invite=role=>{L.state.groupMoney=undefined;const G=L.groupMoney,r=requireOK(G.createSampleInvitation({scenario:role,idempotencyKey:'readiness-invite-'+role})),s=G.invitationSummary(r.invitation.id);return requireOK(G.acceptInvitation({invitationId:s.id,version:s.mandate.version,fingerprint:s.fingerprint})).item;};
const organiser=()=>{L.state.groupMoney=undefined;const G=L.groupMoney,r=requireOK(G.createCollection({title:'Class dinner and final year celebration',target:'1200',deadline:date(14),members:[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena Asante'},{id:'kojo',name:'Kojo Mensah'}],mandateApproval:'named',mandateApproverIds:['self','abena','kojo'],mandateRequiredApprovals:2,acceptMandate:true,idempotencyKey:'readiness-organiser'}));for(const p of r.item.people.filter(x=>!x.isOwner))requireOK(G.acceptMandate({itemId:r.item.id,personId:p.id,version:2,sample:true}));requireOK(G.recordSamplePayment({itemId:r.item.id,personId:'abena',amount:'600',reference:'READINESS-FUND'}));return r.item;};
const card=()=>{L.state.paymentDraft=null;const t=L.virtualCards.createFunded({name:'Online study materials and subscriptions',amount:100,draftId:'readiness-card',status:'success'});return L.virtualCards.get(t.cardId);};
const cardReview=(action,pin=false)=>{const c=card();L.virtualCardUI.manage(c.id);if(action==='return')field('vc-return-amount','40');L.virtualCardUI.requestLifecycle(action,c.id);if(pin)L.virtualCardUI.reviewLifecycle();};
const closed=(locked=false)=>{L.state.closed=true;L.state.locked=locked;L.state.closure={id:'READINESS-CLOSED',status:'Closed',date:'29 Oct 2026'};};
const chat=(question)=>{L.state.paymentDraft=null;L.openTab('chat');field('chatText',question);L.askChat();};
const specs=[
 {id:'save-failed',route:'home',name:'Persistence · failed durable save',prepare(){go('home');window.__readinessStorage.failWrites(true);L.state.paymentDraft.note='Unfinished lunch and course materials';L.save();window.__readinessRequiresReload=true;}},
 {id:'save-failed-copy',route:'home',name:'Persistence · copy unsaved payment details',prepare(){go('home');window.__readinessStorage.failWrites(true);L.state.paymentDraft.note='Lunch, course printing and project materials for our final year field trip';L.save();L.persistenceRecovery.details();window.__readinessRequiresReload=true;}},
 {id:'stale',route:'home',name:'Persistence · newer progress in another tab',prepare(){go('home');window.__readinessStorage.makeStale();L.persistence.ensureCurrent();L.render();window.__readinessRequiresReload=true;}},
 {id:'stale-copy',route:'home',name:'Persistence · copy details before replacing progress',prepare(){go('home');window.__readinessStorage.makeStale();L.persistence.ensureCurrent();L.render();L.persistenceRecovery.details();window.__readinessRequiresReload=true;}},
 {id:'storage-unavailable',route:'home',name:'Persistence · saved progress unavailable',prepare(){go('home');window.__readinessStorage.failReads(true);L.persistence.ensureCurrent();L.render();window.__readinessRequiresReload=true;}},
 {id:'closed-records',route:'accountInfo',name:'Closed account · authenticated records',prepare(){closed();go('accountInfo');}},
 {id:'closed-locked',route:'signin',name:'Closed account · sign-in before records',prepare(){closed(true);go('signin',{returnTo:'accountInfo'});}},
 {id:'locked-help',route:'help',name:'Locked account · public help',prepare(){L.state.locked=true;go('help');}},
 {id:'locked-note',route:'supportCase',name:'Locked account · unsent public note',prepare(){L.state.locked=true;go('supportCase',{reference:'QA-TX'});field('publicReportDescription','I need help returning to my account. No PIN or verification code is included.');}},
 {id:'external-recovery',route:'recoveryStatus',name:'Recovery · existing account outside this browser',prepare(){L.state.onboarded=false;L.state.locked=false;L.state.setup.identityStatus='linked';L.onboarding.recoveryStart('external');L.state.setup.recovery.status='approved';go('recoveryStatus');}},
 {id:'hacks-overview',route:'savingsHackOverview',name:'Savings hacks · aggregate active and paused rules',prepare(){L.state.goals.push({id:'readiness-trip',name:'Trip with my course mates',allocated:50,target:500,date:date(45),boxVersion:2});for(const [boxId,kind,value]of [['qa-box','spend',5],['readiness-trip','income',10]])requireOK(L.savingsHacks.configure({boxId,kind,value,cadence:'weekly',startDate:date(1),monthlyCap:100,minBalance:50,consent:true}));requireOK(L.savingsHacks.pause('readiness-trip'));go('savingsHackOverview');}},
 {id:'goal-dated',route:'goal',name:'Money Box · dated required saving pace',prepare(){L.state.goals[0].date=date(21);go('goal',{id:'qa-box'});}},
 {id:'goal-overdue',route:'goal',name:'Money Box · overdue target without forecast',prepare(){L.state.goals[0].date=date(-2);go('goal',{id:'qa-box'});}},
 {id:'named-cost-entry',route:'essentialEdit',name:'Budget · add a separate named obligation',prepare(){go('essentialEdit',{obligationCategory:'food'});field('essObligationName','Weekly lunch during laboratory practicals');field('essAmount','75');field('essDate',date(7));}},
 {id:'named-costs',route:'budgetCategory',name:'Budget · named costs inside a category',prepare(){L.state.essentials.push({id:'readiness-lunch',name:'Weekly lunch during laboratory practicals',budgetCategory:'food',namedObligation:true,amount:75,paid:0,externalPaid:0,coverageVersion:1,date:date(7)});go('budgetCategory',{id:'food'});}},
 {id:'card-manage',route:'virtualCardManage',name:'Card · return, replace and close actions',prepare(){const c=card();L.virtualCardUI.manage(c.id);}},
 ...['return','close','replace'].flatMap(action=>[false,true].map(pin=>({id:'card-'+action+(pin?'-pin':'-review'),route:'virtualCardAuthorize',name:'Card · '+action+' · '+(pin?'PIN after review':'review before PIN'),prepare(){cardReview(action,pin);}}))),
 {id:'card-history',route:'virtualCards',name:'Cards · archived closed card history',prepare(){const c=card();L.virtualCards.close({cardId:c.id,draftId:'readiness-close'});go('virtualCards');const history=document.querySelector('.vc-history');if(history)history.open=true;}},
 {id:'collection-lifecycle',route:'groupMoneyLifecycle',name:'Collection · fixed mandate and lifecycle options',prepare(){const item=organiser();go('groupMoneyLifecycle',{id:item.id});}},
 {id:'collection-refunds',route:'groupMoneyLifecycle',name:'Collection · cancellation and unspent refunds',prepare(){const item=organiser();requireOK(L.groupMoney.cancel(item.id));go('groupMoneyLifecycle',{id:item.id});}},
 {id:'member-lifecycle',route:'groupMoneyLifecycle',name:'Contributor · no unilateral lifecycle power',prepare(){const item=invite('contributor');go('groupMoneyLifecycle',{id:item.id});}},
 {id:'invite-final-vote',route:'groupMoneyProposalDetail',name:'Invitation · final approver submits payment',prepare(){const item=invite('approver');go('groupMoneyProposalDetail',{id:item.id,proposalId:item.proposals[0].id});}},
 {id:'invite-processing',route:'groupMoneyProposalDetail',name:'Invitation · automatic submission processing',prepare(){const item=invite('approver'),p=item.proposals[0];go('groupMoneyProposalDetail',{id:item.id,proposalId:p.id});L.gm.approveOwn(item.id,p.id);L.render();}},
 {id:'chat-earlier',route:'chat',name:'Ask Lumo · changed facts and explicit recheck',prepare(){chat('What did I spend in the last 7 days?');L.state.txs.push({id:'READINESS-NEW-TX',draftId:'readiness-new-tx',type:'out',status:'success',name:'Campus lunch',amount:30,fee:0,category:'Food',method:'Lumo',date:new Date().toISOString()});go('chat');}},
 {id:'chat-history',route:'hibiscusChatHistory',name:'Ask Lumo · searchable bounded older history',prepare(){L.state.chats=Array.from({length:65},(_,i)=>({q:i===2?'Find my final year field trip question':'What did I spend today? '+i,...L.chatAnswer('What did I spend today?')}));go('hibiscusChatHistory');}}
];
window.__deepScenarioGroups=window.__deepScenarioGroups||{};
window.__deepScenarioGroups.readiness=specs.flatMap(s=>['first','returning'].map(experience=>({id:s.id+'-'+experience,route:s.route,name:s.name+' · '+experience,prepare(){s.prepare();if(experience==='returning')L.render();}}))); 
if(!window.L||!window.__overflowSeed)return;
const previous=window.__overflowSeed;
const entries=specs.flatMap(s=>['first','returning'].map(experience=>({route:s.route,variant:'readiness-'+s.id+'-'+experience,name:s.name+' · '+experience})));
window.__overflowCases.push(...entries);
window.__overflowSeed=function(c){
 if(!c.variant?.startsWith('readiness-'))return previous(c);
 const mode=c.variant.endsWith('-returning')?'returning':'first',id=c.variant.slice('readiness-'.length).replace(/-(?:first|returning)$/,''),spec=specs.find(s=>s.id===id);
 if(!spec)return {requested:c.route,variant:c.variant,errors:['Unknown readiness fixture '+id]};
 const result=previous({route:'home',variant:'deep-first',name:c.name});result.requested=c.route;result.variant=c.variant;
 try{
  if(id.startsWith('save-')||id.startsWith('stale')||id==='storage-unavailable'){if(window.__readinessStorage?.kind!=='isolated-memory')throw Error('Persistence fixtures require the explicit isolated memory bootstrap');}
  spec.prepare();if(mode==='returning')L.render();
  result.readiness={id,experience:mode,returningMethod:'Second native render of the same prepared context; no invented authorization',persistence:L.persistence?.status?.(),isolatedStorage:window.__readinessStorage?.kind||null};
  result.actual=L.route;result.renderedView=window.__auditViewCalls?.at(-1)||L.route;result.renderedViews=[...(window.__auditViewCalls||[])];result.fallback=L.route!==c.route;result.sheet=!!L.taskSheet?.active;result.seededMoney={operational:L.accountBalances().available,savings:L.accountBalances().savings,room:L.balances().room,essentials:L.balances().essentials};
 }catch(error){result.errors.push(String(error.stack||error));}
 document.body.dataset.auditRoute=c.route;document.body.dataset.auditVariant=c.variant;return result;
};
})();
