/* TEMPORARY LOCAL QA. Memory-only profile and seeded sample states. Remove before packaging. */
(()=>{'use strict';
const epoch=Date.now(),date=n=>new Date(epoch+n*86400000).toISOString().slice(0,10);
const routes=Object.keys(L.views).sort();
// Registered views can return another current renderer without changing L.route.
// Record that delegation so an old route never silently counts as its own page.
if(!window.__auditViewTraceInstalled){window.__auditViewTraceInstalled=true;for(const [route,render]of Object.entries(L.views)){L.views[route]=function(...args){if(Array.isArray(window.__auditViewCalls))window.__auditViewCalls.push(route);return render.apply(this,args);};}}

let entrypointPriorTestMode=null,pauseEntrypointFacts=null;
const long='Kwame Ofori Boadu Mensah Asante Boateng';
const guidanceRoutes=['goals','goal','goalEdit','balances','moneyStoryHome','planEdit','addMoney','sendOptions','requests','cardsHome','profile','security','paymentReview','authorize','essentialEdit'];
const extra=[
 ['monoMenu','expanded'],
 ['pauseLog','tester-log'],
 ['collectionPayoutRail','rail-payout-chooser'],
 ...['lumo-entry','momo-entry','bank-entry','lumo-recipient','momo-recipient','bank-recipient'].map(v=>['send','rail-payout-'+v]),
 ...['lumo-review','momo-review','bank-review','long-proof-review','retry-review'].map(v=>['paymentReview','rail-payout-'+v]),
 ...['lumo-authorize','momo-authorize','bank-authorize','lumo-biometric','retry-authorize'].map(v=>['authorize','rail-payout-'+v]),
 ...['awaiting','partial','processing','paid','failed'].map(v=>['groupMoneyProposalDetail','rail-payout-'+v]),
 ['groupMoneyMember','rail-payout-member-review'],['groupMoneyProposalDecline','rail-payout-decline'],['groupMoneyPayoutWithdraw','rail-payout-withdrawal'],['paymentCancel','rail-payout-cancel'],
 ...['single-cost','mixed-costs','preexisting-shortfall','ended-budget','no-budget','fee','long-names','box-transfer','collection','single-cost-why-open','mixed-costs-options-open'].map(v=>['pause','pause-simple-'+v]),
 ...['signup','optional','ambassador','returning','why-open'].map(v=>['samplePause','pause-entry-'+v]),
 ...['low','large','busy'].map(v=>['pauseDemo','pause-entry-'+v]),
 ...[
  ['groupMoneyDetail','organiser-ready'],['groupMoneyDetail','organiser-waiting'],
  ['groupMoneyDetail','contributor-ready'],['groupMoneyDetail','approver-ready'],
  ['send','entry'],['send','entry-long-title'],['send','entry-insufficient'],
  ['paymentReview','review'],['pause','pause'],['authorize','pin'],['authorize','biometric'],
  ['paymentResult','confirmed'],['paymentResult','pending'],['paymentResult','failed'],
  ['txDetail','receipt'],['txDetail','pending-receipt']
 ].map(([route,state])=>[route,'contribution-'+state]),
 ['groupMoneyApprovers','long-people'],
 ...['ready','processing','paid','failed','declined','long-evidence','file'].map(v=>['groupMoneyProposalDetail','payout-'+v]),
 ['groupMoneyDetail','payout-processing'],['groupMoneyDetail','payout-paid'],['groupMoneyPayoutRelease','payout-long-evidence'],
 ['home','multiple-boxes'],['home','long-values'],['home','long-values-hidden'],['home','budget-heavy-values'],['home','budget-heavy-values-hidden'],['home','empty'],['plan','expanded'],['plan','long-values'],['plan','seven-categories'],['plan','empty'],['chat','conversation'],['chat','long-conversation'],['chat','expanded-tools'],['chat','conversation-expanded'],['chat','long-conversation-expanded'],['myQr','long-values'],
 ...['send','paymentReview','authorize','paymentResult','txDetail','profile','accountInfo','goal','goals','balances'].map(r=>[r,'long-values']),
 ...['groupMoneyCollection','groupMoneyPeople','groupMoneyApprovers','groupMoneyReview','groupMoneyDetail','groupMoneyMandate','groupMoneyMember','groupMoneyPayments','groupMoneyProposal','groupMoneyProposalReview','groupMoneyProposalDetail'].map(r=>[r,'named-collection']),
 ...['groupMoneyInvitation','groupMoneyInvitationMandate','groupMoneyInvitationDecline','groupMoneyDetail','groupMoneyProposalDetail'].flatMap(r=>[[r,'invited-approver'],[r,'invited-contributor']]),
 ...['groupMoneySplit','groupMoneyPeople','groupMoneyReview','groupMoneyDetail'].map(r=>[r,'expense-split']),
 ...['virtualCards','virtualCard','virtualCardManage','virtualCardDemo'].map(r=>[r,'funded-card']),
 ...['hack-new-manual','hack-new-income','hack-new-roundup','hack-new-spend','hack-new-fixed','hack-edit-income','hack-edit-roundup','hack-edit-spend','hack-edit-fixed','hack-new-spend-expanded','hack-new-fixed-validation','hack-new-income-consent-error','hack-new-income-protected','hack-edit-paused','hack-edit-income-long-name','hack-edit-cancelled'].map(v=>['goalEdit',v]),
 ...['hack-active-history','hack-paused','hack-target-reached','hack-budget-skipped','hack-cancelled'].map(v=>['goal',v]),
 ['goals','hack-active-list'],['boxProtectionInvite','hack-protection-invite'],
 ...guidanceRoutes.flatMap(r=>['guidance-first','guidance-returning'].map(v=>[r,v]))
];
const cases=routes.map(route=>({route,variant:'standard',name:route+' · standard'})).concat(extra.map(([route,variant])=>({route,variant,name:route+' · '+variant})));
function base(){
 if(typeof entrypointPriorTestMode==='boolean'){L.testMode=entrypointPriorTestMode;entrypointPriorTestMode=null;}pauseEntrypointFacts=null;
 L.qr?.stop?.();L.go('home');L.explore();L.ensureAccounts?.();L.guard=()=>{};
 Object.assign(L.state,{balance:600,txs:[],chats:[],requests:[],cases:[],paymentDraft:null,essentials:[{id:'qa-food',name:'Food',amount:250,paid:0,externalPaid:0,coverageVersion:1},{id:'qa-transport',name:'Transport',amount:100,paid:0,externalPaid:0,coverageVersion:1}],goals:[{id:'qa-box',name:'Laptop',allocated:100,target:3500,date:date(14),boxVersion:2}],planSaved:true,planDraft:null,planHorizon:{mode:'date',date:date(14)},allowance:{amount:600,date:date(14),source:'Family'},groupMoney:undefined,virtualCards:[],virtualCardDrafts:undefined,budgetCycle:null,budgetPeriodRecord:null,budgetGuideSession:null,savingHacks:undefined,savingsHackSetup:undefined,moneyBoxDraft:undefined,moneyBoxProtection:undefined,moneyBoxProtectionFlow:undefined,pageGuidance:undefined});
 L.clearFormDraft?.('goalEdit',{});L.clearFormDraft?.('goalEdit',{id:'qa-box'});
 Object.assign(L.state.profile,{name:'Kwame Mensah',displayName:'Kwame Mensah',phone:'0241230123',pin:'123456',campus:'University of Ghana',email:'kwame@example.test',address:'Hall 2, Legon'});
 Object.assign(L.state.setup,{phoneConfirmed:true,phone:'0241230123',otpPhone:'0241230123',otpPurpose:'signup',otpExpires:epoch+300000,otpWait:epoch+30000,identityStatus:'approved',identityAcknowledged:true,identityDetailsReviewed:true,campusStatus:'approved',securitySaved:true,verifiedName:'Kwame Mensah',verifiedIdentity:{name:'Kwame Mensah',dateOfBirth:'2004-03-12',ghanaCard:'GHA-000000000-0'},applicationRef:'APP-SAMPLE-20261026-001',applicationStatus:'pending',interest:{campus:'Ashesi University',email:'student@example.test'},recovery:{status:'pending',kind:'pin',reference:'REC-SAMPLE-001'}});
 L.state.txs=[{id:'QA-TX',draftId:'QA-DRAFT-SUBMITTED',date:new Date().toISOString(),type:'out',name:'Akua’s Kitchen',destination:'AK01',amount:80,fee:0,status:'success',category:'Food',method:'Campus Pay',note:'Lunch on campus'}];
 L.state.requests=[{id:'QA-REQUEST',from:'abena',name:'Abena Asante',handle:'@abena.a',to:'self',amount:45,note:'Our lunch at Akua’s',status:'waiting',created:new Date().toISOString(),expires:new Date(epoch+14*86400000).toISOString(),demoReceived:true}];
 L.state.cases=[{id:'QA-CASE',type:'Payment support',description:'Please help me understand this payment and its current status.',status:'Saved on device',created:'26 Oct 2026, 12:00',context:{reference:'QA-TX',returnRoute:'txDetail',returnParams:{id:'QA-TX'}},messages:[{from:'You',text:'The amount is still pending. Please check this same reference.',date:'26 Oct 2026, 12:05'}],next:'Not sent to support',demo:true}];
 L.state.paymentDraft={id:'QA-DRAFT',method:'campus',name:'Akua’s Kitchen',provider:'Campus Pay',destination:'AK01',merchantId:'AK01',amount:80,fee:0,essentialId:'',note:'Lunch',checked:true,pinAttempts:0};
 L.state.requestDraft={id:'QA-NEW-REQUEST',amount:45,note:'Our share of lunch',to:'Abena Asante',stage:'form'};
 L.state.bankFunding={id:'QA-BANK-FUNDING',amount:'600',stage:'entry',returnTo:'home'};L.state.fundingDraft={id:'QA-FUNDING',amount:'600',stage:'entry',provider:'MTN',owned:true};
 L.state.statement={id:'STMT-SAMPLE-001',from:'2026-10-01',to:'2026-10-26',status:'Ready',created:'26 Oct 2026, 12:00'};L.state.dataExport={id:'DATA-SAMPLE-001',status:'Ready',created:'26 Oct 2026, 12:00'};
 L.state.merchant={approved:true,name:'Akua’s Kitchen',application:{id:'BIZ-SAMPLE-001',status:'Demo approved'},destination:{institution:'Sample bank',name:'Akua’s Kitchen',number:'•••• 4721',verified:true},roleTerms:true,collections:[{id:'QA-SALE',amount:80,fee:0,status:'Waiting for customer',created:'26 Oct 2026, 12:00',createdAt:epoch,expires:epoch+900000,payer:'Sample customer'}],settlements:[{id:'QA-SET',gross:80,fees:0,adjustments:0,net:80,status:'Queued',created:'26 Oct 2026, 12:00',destination:{institution:'Sample bank',name:'Akua’s Kitchen',number:'•••• 4721'},sales:['QA-SALE'],attempts:1}],adjustments:[]};
 L.route='home';L.params={};L.history=[];L.render();
}
function group(c,p){
 const G=L.groupMoney,variant=c.variant;G.list();
 const people=[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena Asante'},{id:'kojo',name:'Kojo Mensah'},{id:'esi',name:'Esi Boateng'}];
 if(variant==='long-people')people.push(...['Yaw Owusu','Ama Osei','Kofi Arthur','Nana Adjei','Akosua Asante'].map((name,i)=>({id:'qa-member-'+i,name})));
 const split=variant==='expense-split'||c.route==='groupMoneySplit'||c.route==='groupMoneySource';
 if(variant.startsWith('invited-')||c.route.startsWith('groupMoneyInvitation')){
  const r=G.createSampleInvitation({scenario:variant==='invited-contributor'?'contributor':'approver',idempotencyKey:'qa-invite'});if(!r.ok)throw Error(r.error);p.id=r.invitation.id;
  if(['groupMoneyDetail','groupMoneyProposalDetail'].includes(c.route)){const s=G.invitationSummary(p.id),joined=G.acceptInvitation({invitationId:p.id,version:s.mandate.version,fingerprint:s.fingerprint});if(!joined.ok)throw Error(joined.error);p.id=joined.item.id;p.proposalId=joined.item.proposals?.[0]?.id;}
  return;
 }
 if(split)L.gm.startSplit();else L.gm.startCollection();
 const d=L.state.groupMoney.draft;Object.assign(d,{title:split?'Food and transport after our university field trip':'Final year field trip transport and refreshments',total:'480',target:'1200',deadline:date(14),people:people.map((x,i)=>({...x,amount:'120'})),stage:'people',mandateApproval:'named',mandateApproverIds:['self','abena','kojo'],mandateRequiredApprovals:2});
 if(c.route==='groupMoneyContacts')d.picker={tab:'lumo',selected:[],device:[]};
 if(c.route==='groupMoneyReview'){const pr=split?G.previewSplit({title:d.title,total:d.total,mode:'equal',people:d.people}):G.previewCollection({title:d.title,target:d.target,deadline:d.deadline,members:d.people,mandateApproval:'named',mandateApproverIds:d.mandateApproverIds,mandateRequiredApprovals:2});d.review=JSON.stringify(pr.item);d.stage='review';}
 const result=split?G.createSplit({title:d.title,total:d.total,mode:'equal',people:d.people,idempotencyKey:'qa-split'}):G.createCollection({title:d.title,target:d.target,deadline:d.deadline,members:d.people,mandateApproval:'named',mandateApproverIds:d.mandateApproverIds,mandateRequiredApprovals:2,acceptMandate:true,idempotencyKey:'qa-collection'});if(!result.ok)throw Error(result.error);const g=result.item;p.id=g.id;p.personId='abena';
 if(!split){for(const member of g.people.filter(x=>x.id!=='self'))G.acceptMandate({itemId:g.id,personId:member.id,version:g.mandate.version,sample:true});G.recordSamplePayment({itemId:g.id,personId:'abena',amount:'600',reference:'qa-funding'});const r=G.createProposal({itemId:g.id,recipient:'University field trip transport supplier',purpose:'Reserve transport for the class field trip',amount:'150',idempotencyKey:'qa-proposal'});if(r.ok)p.proposalId=r.proposal.id;
 // These registered compatibility screens reopen an existing saved legacy
 // draft. New requests use the separate current rail context below.
 if(['groupMoneyProposal','groupMoneyProposalReview'].includes(c.route)){const pd=L.state.groupMoney.proposalDraft={account:String(L.state.profile?.account||L.state.profile?.handle||L.state.profile?.phone||L.state.profile?.name),itemId:g.id,key:'qa-legacy-proposal-draft',recipient:'University field trip transport supplier',purpose:'Reserve transport for the class field trip',amount:'150',supportingReference:''};pd.review=JSON.stringify([pd.recipient,pd.purpose,pd.amount,pd.supportingReference||'',pd.attachment||null]);}
 }
 if(!split&&p.proposalId){
  const proposal=G.proposal(g.id,p.proposalId),releaseRoute=c.route==='groupMoneyPayoutRelease';
  const vote=personId=>{const r=G.approveProposal({itemId:g.id,proposalId:proposal.id,personId,version:g.mandate.version,fingerprint:proposal.fingerprint,sample:personId!=='self'});if(!r.ok)throw Error(r.error);};
  if(variant==='payout-declined'){
   for(const personId of ['self','abena']){const r=G.declineProposal({itemId:g.id,proposalId:proposal.id,personId,version:g.mandate.version,fingerprint:proposal.fingerprint,sample:personId!=='self'});if(!r.ok)throw Error(r.error);}
  }else if(releaseRoute||['payout-ready','payout-processing','payout-paid','payout-failed','payout-long-evidence','payout-file'].includes(variant)){
   if(variant==='payout-long-evidence'||variant==='payout-file'){
    const old=G.cancelProposal({itemId:g.id,proposalId:proposal.id,fingerprint:proposal.fingerprint});if(!old.ok)throw Error(old.error);
    const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0WUAAAAASUVORK5CYII=',file=variant==='payout-file'?{name:'sample-receipt.png',type:'image/png',size:Math.floor(png.length*3/4)-(png.endsWith('==')?2:png.endsWith('=')?1:0),dataUrl:'data:image/png;base64,'+png}:null;
    const r=G.createProposal({itemId:g.id,recipient:'University transport supplier for our final year field trip and course visit',purpose:'Deposit for minibus transport, campus pickup and return after the field trip, with supporting invoice and itinerary for the class members.',amount:'150',supportingReference:'INV-'+('1234567890'.repeat(22)),...(file?{attachment:file}:{}),idempotencyKey:'qa-long-payout'});if(!r.ok)throw Error(r.error);p.proposalId=r.proposal.id;
   }
   const current=G.proposal(g.id,p.proposalId);for(const personId of ['self','abena']){const r=G.approveProposal({itemId:g.id,proposalId:current.id,personId,version:g.mandate.version,fingerprint:current.fingerprint,sample:personId!=='self'});if(!r.ok)throw Error(r.error);}
   if(['payout-processing','payout-paid','payout-failed'].includes(variant)){
    const q=G.preparePayout({itemId:g.id,proposalId:current.id});if(!q.ok)throw Error(q.error);
    const r=G.executeSampleProposal({itemId:g.id,proposalId:current.id,reviewToken:q.quote.token,pin:L.state.profile.pin,outcome:variant==='payout-paid'?'Completed':variant==='payout-failed'?'Failed':'Pending'});if(!r.ok)throw Error(r.error);
   }
  }
 }
 if(c.route==='groupMoneySample')L.gm.showSample(g.id,'abena');
 if(c.route==='groupMoneyRemoveGroup'){const t=G.saveTemplate({name:'Class field trip friends',people:d.people});if(t.ok)p.id=t.template.id;d.picker={tab:'groups',selected:[],device:[]};}
}
function savings(c,p){
 const v=c.variant,H=L.savingsHacks;if(!v.startsWith('hack-'))return;
 if(!H||!L.savingsHackUI)throw Error('Savings hack modules must be loaded before layout fixtures.');
 if(v.startsWith('hack-new-')){delete p.id;L.state.moneyBoxDraft={name:'Final year laptop and course materials',target:3500,date:date(60)};return;}
 let kind=['roundup','spend','fixed'].find(k=>v.includes(k))||'income';
 const configured=H.configure({boxId:'qa-box',kind,value:kind==='roundup'||kind==='spend'?5:10,cadence:'weekly',startDate:date(1),monthlyCap:100,minBalance:50,consent:true});
 if(!configured.ok)throw Error(configured.message||configured.error||'Savings hack setup failed.');
 if(v.includes('long-name'))L.state.goals[0].name='Laptop, books and research equipment for my final university project';
 if(v==='hack-edit-paused'||v==='hack-paused')H.pause('qa-box');
 if(v==='hack-edit-cancelled'||v==='hack-cancelled')H.cancel('qa-box');
 if(v==='hack-budget-skipped')L.state.essentials[0].amount=10000;
 if(v==='hack-target-reached'){L.state.goals[0].target=100;H.configure({...H.get('qa-box'),consent:true});}
 if(['hack-active-history','hack-active-list','hack-budget-skipped','hack-target-reached'].includes(v)){
  const n=v==='hack-active-history'?5:1;
  for(let i=0;i<n;i++)L.addTx({id:'QA-HACK-IN-'+i,draftId:'qa-hack-income-'+i,type:'in',status:'success',amount:300,fee:0,name:'Family allowance for study and transport',method:'Sample mobile money',date:new Date().toISOString()});
 }
 if(v==='hack-protection-invite'){
  const invite=L.boxProtection.beginInvite('qa-box',{phone:'0551234567'});if(invite?.ok===false)throw Error(invite.error||invite.message||'Protection invitation failed.');
  L.state.moneyBoxProtectionFlow={boxId:'qa-box'};p.id='qa-box';
 }
}
function sharedFixture(c,p){
 if(!['sharedSplit','sharedSplitReview','sharedGroup','sharedReceive'].includes(c.route))return;
 // Reopen an unfinished split retained from the earlier release. Ordinary
 // receipt entries now open the current Collect journey.
 L.state.sharedExpenses=L.state.sharedExpenses||{groups:[],draft:null,receiptDraft:null};
 const total=L.sharedExpenses.netCents(L.state.txs.find(t=>t.id==='QA-TX')),each=Math.floor(total/3),draft={id:L.id('SG'),txId:'QA-TX',totalCents:total,title:'Lunch together',mode:'equal',ownerAmount:((each+total-each*3)/100).toFixed(2),friends:[{id:L.id('SS'),name:'',amount:(each/100).toFixed(2)},{id:L.id('SS'),name:'',amount:(each/100).toFixed(2)}],stage:'form'};
 L.state.sharedExpenses.draft=draft;L.go('sharedSplit',{id:draft.id,txId:draft.txId});
 for(const [index,name]of ['Abena Asante','Kojo Mensah'].entries()){const field=document.getElementById('shared-name-'+index);if(!field)throw Error('Shared cost friend fixture missing');field.value=name;}
 L.captureSharedSplit();const d=L.state.sharedExpenses.draft;
 if(c.route==='sharedSplit'){p.id=d.id;p.txId=d.txId;return;}
 L.reviewSharedExpense();if(d.stage!=='review')throw Error('Shared cost review fixture failed');
 if(c.route==='sharedSplitReview'){p.id=d.id;p.txId=d.txId;return;}
 L.createSharedExpense();const g=L.state.sharedExpenses.groups.find(x=>x.id===d.createdGroupId);if(!g)throw Error('Shared cost group fixture failed');p.id=g.id;
 if(c.route==='sharedReceive'){L.prepareSharedReceipt(g.id,g.shares[0].id);p.shareId=g.shares[0].id;p.reference=L.state.sharedExpenses.receiptDraft.reference;}
}
function savingsFields(c){
 const v=c.variant;if(!v.startsWith('hack-'))return;
 const input=(id,value)=>{const el=document.getElementById(id);if(!el)throw Error('Missing Savings hack fixture field '+id);el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return el;};
 if(v.startsWith('hack-new-')){
  const kind=['manual','income','roundup','spend','fixed'].find(k=>v.includes('hack-new-'+k));
  input('sh-kind',kind);
  if(kind!=='manual'){
   input('sh-value',v==='hack-new-fixed-validation'?0:kind==='roundup'||kind==='spend'?5:10);
   if(kind==='fixed'){input('sh-cadence','weekly');input('sh-start',date(1));}
   input('sh-cap',100);input('sh-buffer',50);
  }
  if(v==='hack-new-income-protected'){
   const protect=document.getElementById('goalProtect');if(!protect)throw Error('Missing Money Box protection choice');protect.checked=true;protect.dispatchEvent(new Event('change',{bubbles:true}));L.toggleMoneyBoxProtectionFields?.();input('goalPartner','0551234567');
  }
  if(v==='hack-new-fixed-validation'){document.getElementById('sh-consent').checked=true;L.saveGoal();}
  if(v==='hack-new-income-consent-error')L.saveGoal();
 }
 if(v.includes('expanded')||v==='hack-active-history')document.querySelectorAll('details').forEach(x=>x.open=true);
}
function contributionContext(c,p){
 const C=L.collectionContributions,G=L.groupMoney,v=c.variant.slice('contribution-'.length);
 if(!C||!L.openCollectionContribution)throw Error('Contribution engine and UI must be loaded before layout fixtures.');
 L.state.paymentDraft=null;L.testMode=true;
 let item;
 if(v.startsWith('organiser-')||v==='entry-long-title'||v==='entry-insufficient'){
  const r=G.createCollection({title:v==='entry-long-title'?'Final year field trip transport and course materials':'Class field trip',target:'2000',deadline:date(14),members:[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena Asante'},{id:'kojo',name:'Kojo Mensah'}],mandateApproval:'named',mandateApproverIds:['self','abena'],mandateRequiredApprovals:2,acceptMandate:true,idempotencyKey:'qa-own-contribution-pot'});
  if(!r.ok)throw Error(r.error);item=r.item;
  if(v!=='organiser-waiting'){
   for(const person of item.people.filter(person=>person.id!=='self')){const accepted=G.acceptMandate({itemId:item.id,personId:person.id,version:item.mandate.version,sample:true});if(!accepted.ok)throw Error(accepted.error);}
   const funded=G.recordSamplePayment({itemId:item.id,personId:'abena',amount:'600',reference:'qa-other-member-funding'});if(!funded.ok)throw Error(funded.error);
  }
 }else{
  const r=G.createSampleInvitation({scenario:v==='approver-ready'?'approver':'contributor',idempotencyKey:'qa-contribution-invite'});if(!r.ok)throw Error(r.error);
  const invite=G.invitationSummary(r.invitation.id),joined=G.acceptInvitation({invitationId:r.invitation.id,version:invite.mandate.version,fingerprint:invite.fingerprint});if(!joined.ok)throw Error(joined.error);item=joined.item;
 }
 p.id=item.id;
 if(c.route==='groupMoneyDetail'){L.gm.open(item.id);return;}
 if(v==='pause')L.state.balance=400;
 const amount=v==='pause'?'280':v==='entry-insufficient'?'650':'50';
 L.openCollectionContribution(item.id,amount);
 if(L.route!=='send')throw Error('Contribution entry fixture opened '+L.route);
 const field=document.getElementById('payment-amount');if(!field)throw Error('Missing contribution amount field');field.value=amount;
 if(c.route==='send'){
  if(v==='entry-insufficient')L.preparePayment();
  return;
 }
 L.preparePayment();if(c.route==='pause'&&L.route==='pause')return;if(L.route!=='paymentReview')throw Error('Contribution review fixture opened '+L.route);
 if(c.route==='paymentReview')return;
 L.continuePayment();
 if(c.route==='pause'){if(L.route!=='pause')throw Error('Contribution Pause fixture opened '+L.route);return;}
 if(L.route!=='authorize')throw Error('Contribution authorisation fixture opened '+L.route);
 if(c.route==='authorize'){
  if(v==='biometric'&&!L.biometricPayment.open())throw Error('Contribution biometric fixture could not open');
  return;
 }
 const outcome=v==='pending'||v==='pending-receipt'?'Pending':v==='failed'?'Failed':'Completed';
 const control=document.getElementById('payment-outcome');if(!control)throw Error('Missing contribution sample result control');control.value=outcome;
 const pin=document.getElementById('payment-pin');if(!pin)throw Error('Missing contribution PIN field');pin.value='123456';L.authorizePayment();
 const id=L.state.paymentDraft?.submittedTxId;if(!id||L.route!=='paymentResult')throw Error('Contribution submission fixture opened '+L.route);
 if(c.route==='txDetail')L.go('txDetail',{id});
}
function pauseEntrypointContext(c,p){
 const kind=c.variant.slice('pause-entry-'.length),tester=c.route==='pauseDemo';
 entrypointPriorTestMode=L.testMode;L.testMode=tester;
 L.state.onboarded=tester||kind==='returning';L.state.locked=false;
 if(tester)p.scenario=kind;
 else {p.returnTo=kind==='ambassador'?'ambassadorWelcome':'welcome';if(kind==='signup')p.intent='signup';}
 const account=()=>JSON.stringify([L.state.balance,L.state.accounts,L.state.profile,L.state.essentials,L.state.goals,L.state.txs,L.state.paymentDraft]);
 const before=account();L.go(c.route,p);
 if(L.route!==c.route)throw Error('Pause entry-point fixture expected '+c.route+' but opened '+L.route);
 if(!document.querySelector('.mono-pause-example'))throw Error('Avatar Pause entry-point adapter is not loaded');
 if(document.querySelector('[data-pause-hero],[data-pause-hold]'))throw Error('A sample Pause entry point gained payment timing or approval controls');
 pauseEntrypointFacts={kind,route:L.route,onboarded:L.state.onboarded,testing:L.testMode,params:{...L.params},accountUnchanged:before===account(),transactionCount:L.state.txs.length,avatar:!!document.querySelector('.mono-pause-face img'),pausePose:!!document.querySelector('.mono-pause-hand')};
 if(!pauseEntrypointFacts.accountUnchanged)throw Error('Sample Pause entry point changed account data');
}
function simplePauseContext(c,p){
 const variant=c.variant.slice('pause-simple-'.length),kind=variant.replace(/-(why|options)-open$/,'');
 const cost=(id,name,amount)=>({id,name,amount,paid:0,externalPaid:0,coverageVersion:1});
 L.state.paymentDraft=null;L.state.txs=[];L.state.balance=600;
 L.state.essentials=[cost('qa-food','Food',400)];
 L.state.planHorizon={mode:'date',date:date(7)};L.state.allowance={amount:600,date:date(7),source:'Family'};
 let amount='280';
 if(kind==='mixed-costs')L.state.essentials=[cost('qa-food','Food',250),cost('qa-transport','Transport',200)];
 if(kind==='ended-budget')L.state.planHorizon={mode:'date',date:'2020-10-01'};
 if(kind==='preexisting-shortfall'){L.state.essentials=[cost('qa-food','Food',700)];amount='120';}
 if(kind==='no-budget'){L.state.balance=160;L.state.essentials=[];L.state.planSaved=false;L.state.planHorizon={mode:'none'};L.state.allowance={amount:0,date:''};amount='120';}
 if(kind==='long-names')L.state.essentials=[cost('qa-food','Course materials, fieldwork and laboratory requirements for the final semester',400)];
 if(kind==='collection'){
  contributionContext({...c,variant:'contribution-pause'},p);
 }else if(kind==='box-transfer'){
  L.state.balance=400;L.startMoneyBoxTransfer('qa-box','in');
  const field=document.getElementById('allocation');if(!field)throw Error('Money Box Pause amount fixture missing');field.value=amount;
  L.reviewAllocation();if(L.route==='paymentReview')L.continuePayment();
 }else{
  if(kind==='fee'){
   L.startSend('bank');const number=document.getElementById('recipient-number'),provider=document.getElementById('recipient-provider');
   if(!number||!provider)throw Error('Bank Pause recipient fields missing');number.value='102345678901';provider.value='GCB Bank';
   if(!L.checkRecipient())throw Error('Bank Pause recipient check failed');
  }else{
   L.openPayTab('campus');L.pickMerchant('AK01');
   if(kind==='long-names')L.state.paymentDraft.name='University final year research team, fieldwork and laboratory materials coordinator';
  }
  const field=document.getElementById('payment-amount');if(!field)throw Error('Pause payment amount fixture missing');field.value=amount;
  const link=document.getElementById('payment-essential');if(link)link.value='';
  L.preparePayment();if(L.route==='paymentReview')L.continuePayment();
 }
 if(L.route!=='pause'||!L.pauseEngine.evaluate(L.state.paymentDraft).triggered)throw Error('Native Pause fixture opened '+L.route+' for '+kind);
 if(!document.querySelector('.mono-pause-simple'))throw Error('Monochrome simplified Pause adapter is not loaded');
 Object.assign(p,L.params);
}
function railPayoutContext(c,p){
 const G=L.groupMoney,v=c.route==='collectionPayoutRail'?'chooser':c.variant.slice('rail-payout-'.length);
 if(!L.collectionPayoutRails)throw Error('Current payout rail module is not loaded.');
 L.state.paymentDraft=null;L.state.balance=1;L.state.txs=[];L.state.goals=[];L.state.essentials=[];L.state.planSaved=false;
 const people=[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena Asante'},{id:'kojo',name:'Kojo Mensah'},{id:'esi',name:'Esi Boateng'}];
 const made=G.createCollection({title:v==='long-proof-review'?'Final year educational trip and graduation celebration':'Class trip',target:'1200',deadline:date(14),members:people,mandateApproval:'named',mandateApproverIds:['self','abena','kojo'],mandateRequiredApprovals:2,acceptMandate:true,idempotencyKey:'qa-current-rail-pot'});if(!made.ok)throw Error(made.error);const item=made.item;p.id=item.id;
 for(const person of people.slice(1)){const accepted=G.acceptMandate({itemId:item.id,personId:person.id,version:item.mandate.version,sample:true});if(!accepted.ok)throw Error(accepted.error);}
 const funded=G.recordSamplePayment({itemId:item.id,personId:'abena',amount:'600',reference:'qa-current-rail-funds'});if(!funded.ok)throw Error(funded.error);
 const field=(id,value)=>{const el=document.getElementById(id);if(!el)throw Error('Current rail field missing '+id+' on '+L.route);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
 L.gm.startProposal(item.id);if(L.route!=='collectionPayoutRail')throw Error('Payout chooser opened '+L.route);if(v==='chooser')return;
 const method=v.startsWith('momo-')?'momo':v.startsWith('bank-')?'bank':'lumo';L.collectionPayoutRails.choose(method);if(L.route!=='send')throw Error('Payout entry opened '+L.route);
 if(v.endsWith('-entry'))return;
 if(method==='lumo')L.pickPerson('abena');
 else {field('recipient-number',method==='bank'?'102345678901':'0241234567');if(method==='bank')field('recipient-provider','GCB Bank');if(method==='momo')L.mobileNetwork.check(L.state.paymentDraft,'0241234567');if(!L.checkRecipient())throw Error('Native sample recipient check failed.');}
 if(v.endsWith('-recipient'))return;
 field('payment-amount','150');field('payment-note',v==='long-proof-review'?'Transport deposit for the final year educational trip to the University of Ghana and graduation celebration':'Minibus deposit');
 if(v==='long-proof-review'){field('gm-proposal-supportingReference','Invoice INV-2026-CLASS-TRIP-TRANSPORT-001 / final year educational trip and graduation celebration');L.state.paymentDraft.attachment={name:'Transport invoice for the final year educational trip and graduation celebration.png',type:'image/png',size:12,dataUrl:'data:image/png;base64,iVBORw0KGgoAAQID'};}
 if(v==='cancel'){L.leavePayment();if(L.route!=='paymentCancel')throw Error('Payout cancel opened '+L.route);return;}
 L.reviewTransactionDetails();if(L.route!=='paymentReview')throw Error('Current payout review opened '+L.route+' '+document.getElementById('error')?.textContent);
 if(v.endsWith('-review')&&!['member-review','retry-review'].includes(v))return;
 L.continuePayment();if(L.route!=='authorize')throw Error('Payout authorisation opened '+L.route);
 if(v.endsWith('-authorize')&&v!=='retry-authorize')return;
 if(v==='lumo-biometric'){if(!L.biometricPayment.open())throw Error('Payout biometric prompt did not open');return;}
 field('payment-pin','123456');L.authorizePayment();if(L.route!=='groupMoneyProposalDetail')throw Error('Authorised payout opened '+L.route+' '+document.getElementById('error')?.textContent);
 const proposal=G.proposal(item.id,L.params.proposalId);if(!proposal||proposal.approvals.length||item.disbursements.length)throw Error('Request fixture needs zero decisions and no submission.');p.proposalId=proposal.id;
 if(v==='awaiting')return;
 if(v==='decline'){L.gm.openDecline(item.id,proposal.id,'self');if(L.route!=='groupMoneyProposalDecline')throw Error('Current payout decline opened '+L.route);return;}
 if(v==='withdrawal'){L.gm.openWithdrawal(item.id,proposal.id);if(L.route!=='groupMoneyPayoutWithdraw')throw Error('Current payout withdrawal opened '+L.route);return;}
 const vote=personId=>{const result=G.approveProposal({itemId:item.id,proposalId:proposal.id,personId,version:proposal.mandateVersion,fingerprint:proposal.fingerprint,sample:personId!=='self'});if(!result.ok)throw Error(result.error);};
 vote('self');L.render();if(v==='partial')return;
 if(v==='member-review'){L.gm.openMember(item.id,'abena',proposal.id);if(L.route!=='groupMoneyMember')throw Error('Current member review opened '+L.route);return;}
 vote('abena');L.render();const status=G.proposalSummary(item.id,proposal.id);if(status.status!=='processing')throw Error('Required final approval did not submit the payout.');if(v==='processing')return;
 const settled=G.settleSamplePayout({itemId:item.id,proposalId:proposal.id,reference:status.reference,attemptId:status.attemptId,outcome:v==='failed'||v.startsWith('retry-')?'Failed':'Completed',sample:true});if(!settled.ok)throw Error(settled.error);L.render();
 if(v.startsWith('retry-')){L.gm.executeProposal(item.id,proposal.id);if(L.route!=='paymentReview')throw Error('Payout retry opened '+L.route);if(v==='retry-authorize')L.continuePayment();}
}
function reviewContext(c,p){
 if(c.route==='collectionPayoutRail'||c.variant.startsWith('rail-payout-')){railPayoutContext(c,p);return true;}
 if(c.route==='monoMenu'){L.openMonoMenu();if(L.route!=='monoMenu'||!L.taskSheet?.active||!document.querySelector('.task-sheet-layer[data-task-route="monoMenu"] .mono-menu'))throw Error('Sidebar fixture did not mount the native drawer.');return true;}
 if(c.route==='pauseLog'&&c.variant==='tester-log'){entrypointPriorTestMode=L.testMode;L.testMode=true;const d=L.state.paymentDraft;d.amount=280;L.state.balance=400;L.pauseEngine.present(d);L.pauseEngine.respond('edit_amount',d);L.go('pauseLog');if(L.route!=='pauseLog')throw Error('Tester Pause log opened '+L.route);return true;}
 if(c.variant.startsWith('pause-entry-')){pauseEntrypointContext(c,p);return true;}
 if(c.variant.startsWith('pause-simple-')){simplePauseContext(c,p);return true;}
 if(c.variant.startsWith('contribution-')){contributionContext(c,p);return true;}
 if(['groupMoneyPayoutRelease','groupMoneyProposalDecline','groupMoneyPayoutWithdraw'].includes(c.route)){
  L.go('groupMoneyProposalDetail',{id:p.id,proposalId:p.proposalId});
  if(c.route==='groupMoneyPayoutRelease')L.gm.executeProposal(p.id,p.proposalId);
  else if(c.route==='groupMoneyProposalDecline')L.gm.openDecline(p.id,p.proposalId,'self');
  else L.gm.openWithdrawal(p.id,p.proposalId);
  if(L.route!==c.route)throw Error('Payout fixture expected '+c.route+' but opened '+L.route);return true;
 }

 const route=c.route;
 if(route==='monoGroupDraftReplace'){
  L.newRequest();L.gm.startSplit();
  document.getElementById('gm-title').value='Study group printing';document.getElementById('gm-total').value='90';L.gm.capture();
  L.closeTask();L.newRequest();L.gm.startCollection();
  if(L.route!==route)throw Error('Draft replacement fixture opened '+L.route);return true;
 }
 if(c.variant.startsWith('deep-')&&route==='categoryMatch'){
  const first=L.state.txs.find(t=>t.id==='QA-TX');first.category='Uncategorised';
  L.state.txs.push({...first,id:'QA-TX-MATCH-2',draftId:'QA-MATCH-DRAFT-2',date:new Date(epoch-86400000).toISOString()});
  L.openTab('chat');const field=document.getElementById('chatText');if(!field)throw Error('Category matching chat fixture missing');field.value='That GH₵80 to Akua’s Kitchen was lunch';L.askChat();
  const index=L.state.chats.length-1,reply=L.state.chats[index];if(reply?.intent!=='category-correction'||reply.categoryTxIds?.length!==2)throw Error('Expected two real category candidates');L.chatOpenAnswer(index);if(L.route!==route)throw Error('Category match fixture opened '+L.route);return true;
 }
 if(c.variant.startsWith('deep-')&&route==='dailyAccountNotice'){
  L.state.notifications=[{title:'Check your account details',body:'Review your saved details before your next bank transfer.',type:'security',read:false}];L.go('notifications');L.openSavedAccountNotice(0);if(L.route!==route)throw Error('Saved notice fixture opened '+L.route);return true;
 }
 if(['chatBankingChoice','chatBankingReplace','chatCalendarPayments'].includes(route)){L.openBankingChat();const field=document.getElementById('chatText');if(!field)throw Error('Chat entry fixture missing');field.value=route==='chatBankingChoice'?'Send GH₵20':route==='chatBankingReplace'?'Pay Akua GH₵30 from Food':'Show my payments to Akua';L.askChat();L.chatOpenAnswer(L.state.chats.length-1);if(L.route!==route)throw Error('Chat fixture expected '+route+' but opened '+L.route);return true;}
 if(route==='actionConfirm'){L.go('profileEdit');L.confirmProfileDiscard();return true;}
 if(route==='budgetEstimate'){L.go('essentialEdit',{id:'qa-food'});L.openBudgetEstimate();const a=document.getElementById('estimate-rate'),n=document.getElementById('estimate-count');if(a)a.value='15';if(n)n.value='7';L.refreshBudgetEstimate();return true;}
 if(['budgetCycle','budgetCycleReview'].includes(route)){L.openBudgetCycle();if(route==='budgetCycleReview')L.reviewBudgetCycle();return true;}
 if(route==='budgetDelete'){L.budgetOverview.requestDelete({scope:'item',id:'qa-food'});return true;}
 if(route==='budgetHistory'){L.state.onboardedAt=new Date(epoch-35*86400000).toISOString();for(let i=0;i<4;i++)L.state.txs.push({id:'QA-HISTORY-'+i,draftId:'qa-history-'+i,date:new Date(epoch-(6+i*7)*86400000).toISOString(),type:'out',name:i%2?'Campus transport':'Food and groceries',amount:i%2?25:50,fee:0,status:'success',category:i%2?'Transport':'Food',method:'Sample past payment'});L.budgetHistory.open();return true;}
 if(['budgetPeriodReview','budgetReviewDates','budgetReviewNext'].includes(route)){L.state.planHorizon={mode:'date',date:date(-1)};L.state.budgetPeriodRecord={start:date(-7),costIds:L.state.essentials.map(x=>x.id),createdAt:new Date(epoch-7*86400000).toISOString(),source:'created'};L.state.txs[0].date=new Date(epoch-3*86400000).toISOString();L.budgetPeriodReview.open();if(route==='budgetReviewDates')L.budgetPeriodReview.dates();if(route==='budgetReviewNext')L.budgetPeriodReview.next('keep');return true;}
 if(['budgetAfterFunding','incomePlan'].includes(route)){const t=L.addTx({id:'QA-INCOME',draftId:'QA-INCOME-DRAFT',date:new Date().toISOString(),type:'in',name:'Family allowance',amount:300,fee:0,status:'success',category:'Allowance',method:'Sample bank transfer'});if(route==='incomePlan')L.openIncomePlan(t.id);else{L.state.budgetPrompt={txId:t.id,done:false,hasBudget:true};L.go('budgetAfterFunding');}return true;}
 if(['virtualCardAuthorize','virtualCardDetails'].includes(route)){L.go('virtualCard',{id:p.id});L.virtualCardUI.requestReveal(p.id);if(route==='virtualCardDetails'){const pin=document.getElementById('vc-pin');if(!pin)throw Error('Card approval fixture missing');pin.value='123456';L.virtualCardUI.approve();}return true;}
 return false;
}
window.__overflowSeed=function(c){
 const result={requested:c.route,variant:c.variant,errors:[]};window.__auditErrors=[];window.__auditViewCalls=[];
 try{base();const p={};
 const map={goal:{id:'qa-box'},goalEdit:{id:'qa-box'},savingMilestones:{id:'qa-box'},boxProtectionInvite:{id:'qa-box'},boxProtectionChange:{id:'qa-box'},boxProtectionSupport:{id:'qa-box'},allocate:{id:'qa-box'},allocationReview:{id:'qa-box'},releaseGoal:{id:'qa-box'},releaseReview:{id:'qa-box'},essentialEdit:{id:'qa-food'},storyTx:{id:'QA-TX'},txDetail:{id:'QA-TX'},paymentResult:{id:'QA-TX'},paymentRecovery:{id:'QA-TX'},requestDetail:{id:'QA-REQUEST'},requestConfirm:{id:'QA-REQUEST',action:'declined'},caseDetail:{id:'QA-CASE'},merchantCollection:{id:'QA-SALE'},merchantPayer:{id:'QA-SALE'},settlementDetail:{id:'QA-SET'},bill:{kind:'airtime'},categoryEdit:{id:'QA-TX'},chatCalculation:{index:0},supportCase:{reference:'QA-TX',txId:'QA-TX',returnRoute:'txDetail',returnParams:{id:'QA-TX'}}};Object.assign(p,map[c.route]||{});
 if(c.variant.startsWith('long-values')){L.state.profile.name=long;L.state.profile.displayName=long;L.state.profile.campus='Kwame Nkrumah University of Science and Technology';L.state.profile.email='kwame.ofori.boadu.mensah.asante.boateng@example.university.test';L.state.balance=999999.99;L.state.goals[0].name='Laptop, books and research equipment for my final university project';L.state.goals[0].allocated=999999.99;L.state.goals[0].target=1000000;L.state.paymentDraft.name=long;L.state.paymentDraft.destination='123456789012345678901234567890';L.state.paymentDraft.amount=5000;L.state.txs[0].name=long;L.state.txs[0].amount=5000;}
 // A small primary room amount can coexist with a wide account balance.
 // This exercises support-row layout independently of the primary value.
 if(c.variant.startsWith('budget-heavy-values')){L.state.balance=10000;L.state.essentials=[{id:'qa-food',name:'Food',amount:6000,paid:0,externalPaid:0,coverageVersion:1},{id:'qa-transport',name:'Transport',amount:3600,paid:0,externalPaid:0,coverageVersion:1}];L.state.goals[0].allocated=999999.99;L.state.goals[0].target=1000000;}
 if(c.variant==='multiple-boxes'){L.state.goals.push(...[{id:'qa-emergency',name:'Emergency buffer',allocated:50,target:500,date:date(30),boxVersion:2},{id:'qa-trip',name:'Weekend trip',allocated:25,target:200,date:date(45),boxVersion:2},{id:'qa-books',name:'Books',allocated:75,target:75,boxVersion:2}]);}
 if(c.variant==='empty'){L.state.essentials=[];L.state.goals=[];L.state.balance=0;L.state.planSaved=false;L.state.txs=[];}
 if(c.variant==='seven-categories')L.state.essentials=L.budgetCategories.list.map((x,i)=>({id:'qa-'+x.id,name:x.name,budgetCategory:x.id,amount:100+i*10,paid:0,externalPaid:0,coverageVersion:1}));
 if(c.route.startsWith('groupMoney')&&!c.variant.startsWith('contribution-')&&!c.variant.startsWith('rail-payout-'))group(c,p);
 savings(c,p);
 if(c.route==='budgetCategory'){const g=L.budgetOverview.summary().groups[0];if(!g)throw Error('Budget category fixture missing');p.id=g.id;}
 if(c.route==='boxProtectionInvite'&&!c.variant.startsWith('hack-')){L.boxProtection.beginInvite('qa-box',{phone:'0551234567'});L.state.moneyBoxProtectionFlow={boxId:'qa-box'};}
 if(['boxProtectionChange','boxProtectionSupport'].includes(c.route)){const P=L.boxProtection;P.beginInvite('qa-box',{phone:'0551234567'});const invite=P.get('qa-box').invitation;P.acceptInvitation(invite.id,invite.code);const challenge=P.requestApproval({boxId:'qa-box',kind:'change',newPhone:'0557654321'});L.state.moneyBoxProtectionFlow={boxId:'qa-box',challengeId:challenge.id,choice:{enabled:true,phone:'0557654321'},returnRoute:'goal',returnParams:{id:'qa-box'}};if(c.route==='boxProtectionSupport'){const support=P.requestSupport(challenge.id);L.state.moneyBoxProtectionFlow.supportId=support.id;L.state.moneyBoxProtectionFlow.returnRoute='boxProtectionChange';}}
 sharedFixture(c,p);
 if(c.route.startsWith('virtualCard')&&!['virtualCardCreate'].includes(c.route)){const tx=L.virtualCards.createFunded({name:'Online study and subscription card',amount:100,draftId:'qa-card',status:'success'});p.id=tx.cardId;}
 if(['allocate','releaseGoal','allocationReview','releaseReview'].includes(c.route))L.state.paymentDraft={id:'QA-BOX-DRAFT',method:'box',boxId:'qa-box',boxDirection:c.route.startsWith('alloc')?'in':'out',name:L.state.goals[0].name,provider:'Lumo Savings',destination:L.accountBalances().savingsNumber,amount:80,fee:0,checked:true,essentialId:'',note:'',pinAttempts:0};
 if(c.route==='paymentResult')L.state.paymentDraft.submittedTxId='QA-TX';
 if(c.route==='paymentRecovery')L.state.txs[0].status='failed';
 if(c.route==='pause'){L.state.paymentDraft.amount=280;L.state.balance=400;L.pauseEngine.present(L.state.paymentDraft);}
 if(c.route==='campusPay'){p.qrScan=true;p.qrMode='scan';}
 if(c.route==='chat'||c.route==='chatCalculation'){const questions=c.variant.startsWith('long-conversation')?Array.from({length:7},(_,i)=>i%2?'Can I spend GH₵80?':'What did I spend today?'):c.variant.startsWith('conversation')||c.route==='chatCalculation'?['What did I spend today?','Can I spend GH₵80?']:[];L.state.chats=questions.map(q=>({q,...L.chatAnswer(q)}));}
 // Welcome has meaningful account states beyond generic education re-entry.
 // These gallery-only modes do not alter the retained 295-case matrix.
 if(c.route==='welcome'&&c.variant==='deep-first')L.reset();
 if(c.route==='welcome'&&c.variant==='deep-returning')L.state.locked=true;
 L.save();L.route='home';L.params={};L.history=[];L.render();
 window.__auditViewCalls=[];
 if(reviewContext(c,p))Object.assign(p,L.params);else if(['home','plan','pay','more','chat'].includes(c.route))L.openTab(c.route);else L.go(c.route,p);
 result.initialActual=L.route;
 // Follow the shipped entry routing. An alias is measured as the actual
 // reachable surface; forcing an older template can invent an invalid shell.
 if(L.route!==c.route)result.alias={requested:c.route,actual:L.route};
 if(c.variant==='deep-returning'){L.go('home');if(['home','plan','pay','more','chat'].includes(c.route))L.openTab(c.route);else L.go(c.route,p);}
 if(c.variant.startsWith('guidance-')){
  if(!L.pageGuidance)throw Error('Page guidance module must be loaded before guidance layout fixtures.');
  if(c.variant==='guidance-returning'){L.go('home');if(['home','plan','pay','more','chat'].includes(c.route))L.openTab(c.route);else L.go(c.route,p);}
 }
 savingsFields(c);
 if(c.variant.includes('expanded')||c.variant==='seven-categories'||c.variant.startsWith('long-values'))document.querySelectorAll('details').forEach(x=>x.open=true);
 if(c.variant.startsWith('pause-entry-')){
  if(c.variant==='pause-entry-why-open'){const why=document.querySelector('.mono-pause-why');if(!why)throw Error('Sample Pause See why is missing');why.open=true;}
  result.pauseEntrypoint={...pauseEntrypointFacts,whyOpen:!!document.querySelector('.mono-pause-why')?.open};
 }
 if(c.variant.startsWith('pause-simple-')){
  const selector=c.variant.endsWith('-why-open')?'.mono-pause-why':c.variant.endsWith('-options-open')?'.mono-pause-options':null;
  if(selector){const disclosure=document.querySelector(selector);if(!disclosure)throw Error('Pause disclosure fixture missing '+selector);disclosure.open=true;}
  const d=L.state.paymentDraft,q=L.pauseEngine.evaluate(d),impact=L.planImpactSummary(d);
  result.pause={kind:c.variant,method:d.method,amount:Number(d.amount),fee:Number(d.fee||0),triggered:q.triggered,selected:q.selected?.code,shortfall:impact.totalGap,existingShortfall:impact.totalGapBefore,additionalShortfall:impact.extraGap,available:L.accountBalances().available,transactionCount:L.state.txs.length,whyOpen:!!document.querySelector('.mono-pause-why')?.open,optionsOpen:!!document.querySelector('.mono-pause-options')?.open};
 }
 if(c.variant.endsWith('-hidden'))L.hidePrivateMoney?.();else L.showPrivateMoney?.();
 result.seededMoney={operational:L.accountBalances().available,savings:L.accountBalances().savings,room:L.balances().room,essentials:L.balances().essentials};
 if(c.variant.startsWith('contribution-')){const d=L.state.paymentDraft,id=d?.collectionId||L.params.id,item=L.groupMoney.get(id),summary=item&&L.groupMoney.summary(item);result.collectionContribution={role:item?L.groupMoney.access(item).isOrganiser?'organiser':L.groupMoney.access(item).isApprover?'approver':'contributor':null,personalBalance:L.state.balance,available:L.balances().available,groupBalanceCents:summary?.balanceCents,pendingTargetCents:item?L.collectionContributions.pendingCents(item.id):null,transactionStatus:d?.submittedTxId?L.state.txs.find(t=>t.id===d.submittedTxId)?.status:null};}
 if(c.variant.startsWith('hack-')){const rule=L.savingsHacks.get('qa-box'),partner=document.getElementById('goalPartnerFields');result.savingsHack={selectedKind:document.getElementById('sh-kind')?.value||null,rule:rule?{kind:rule.kind,enabled:rule.enabled,stoppedReason:rule.stoppedReason||null,cancelled:!!rule.cancelledAt}:null,goalCount:L.state.goals.length,saved:L.state.goals.find(g=>g.id==='qa-box')?.allocated,historyCount:L.savingsHacks.history('qa-box').length,validationMessage:document.getElementById('error')?.textContent||'',partnerFieldsVisible:partner?!partner.hidden:null};}
 if(c.variant.startsWith('guidance-')){const guides=[...document.querySelectorAll('#view details.page-guidance')];result.pageGuidance={mode:c.variant==='guidance-first'?'first':'returning',route:L.route,guideCount:guides.length,expanded:guides.filter(g=>g.open||g.hasAttribute('open')).length,owner:L.state.pageGuidance?.owner||'',seen:!!L.state.pageGuidance?.seen?.[c.route],dismissed:!!L.state.pageGuidance?.dismissed?.[c.route]};}
 result.renderedViews=[...window.__auditViewCalls];result.renderedView=result.renderedViews.at(-1)||L.route;
 if(c.route==='monoMenu'&&L.route==='monoMenu'&&result.renderedView==='more')result.expectedDelegation='Native sidebar composes the shared Menu template; the monoMenu task layer is mounted.';
 if(['pauseDemo','pauseLog'].includes(c.route)&&!L.testMode&&L.route==='pay')result.expectedDelegation='Ordinary visitors are guarded from tester-only routes; explicit tester variants are separately audited.';
 if(['allocationReview','releaseReview'].includes(c.route)&&L.route==='paymentReview')result.expectedDelegation='Native Money Box review is owned by the paymentReview route.';
 result.actual=L.route;result.sheet=!!L.taskSheet?.active;result.fallback=L.route!==c.route;
 }catch(e){result.errors.push(String(e.stack||e));}
 document.documentElement.dataset.auditReady='true';document.body.dataset.auditRoute=c.route;document.body.dataset.auditVariant=c.variant;
 return result;
};
window.__overflowCases=cases;window.__overflowReady=true;
})();
