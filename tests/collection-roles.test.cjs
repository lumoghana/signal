/* Named collection mandates and the invited customer's own role.
   All records and other people's actions are explicit same-device samples. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const index=fs.readFileSync(path.resolve(__dirname,'../dist/index.html'),'utf8');
const modules=[...index.matchAll(/<script\b[^>]*\bsrc="\/([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>m[1]);
const storageKey=fs.readFileSync(path.resolve(__dirname,'../dist/core.js'),'utf8').match(/\bconst key=['"]([^'"]+)['"]/)[1];
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const h=createHarness({clock:true,testing:false,modules}),{L}=h;L.explore();L.ensureAccounts?.();
 Object.assign(L.state,{balance:600,txs:[],requests:[],paymentDraft:null,essentials:[],goals:[],groupMoney:undefined});
 L.route='home';L.params={};L.history=[];L.save();h.flush();return {h,L,G:L.groupMoney};
}
const people=()=>[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena'},{id:'kojo',name:'Kojo'},{id:'esi',name:'Esi'}];
const personal=f=>JSON.stringify({balance:f.L.state.balance,accounts:f.L.state.accounts,txs:f.L.state.txs,requests:f.L.state.requests,goals:f.L.state.goals,essentials:f.L.state.essentials,paymentDraft:f.L.state.paymentDraft});
const future=f=>new f.h.context.Date(f.h.context.Date.now()+14*86400000).toISOString().slice(0,10);
const input=(f,changes={})=>({title:'Class trip',target:'1200',deadline:future(f),members:people(),mandateApproval:'named',mandateApproverIds:['abena','kojo','esi'],mandateRequiredApprovals:2,acceptMandate:true,idempotencyKey:'named-once',...changes});
const create=(f,changes={})=>{const r=f.G.createCollection(input(f,changes));assert(r.ok,r.error);return r.item;};
const acceptMembers=(f,g)=>{for(const p of g.people.filter(p=>p.id!=='self')){const r=f.G.acceptMandate({itemId:g.id,personId:p.id,version:g.mandate.version,sample:true});assert(r.ok,r.error);}return g;};
const fund=(f,g)=>{acceptMembers(f,g);const r=f.G.recordSamplePayment({itemId:g.id,personId:'abena',amount:'600',reference:'fund-named'});assert(r.ok,r.error);return g;};
const propose=(f,g,changes={})=>{const r=f.G.createProposal({itemId:g.id,recipient:'Trip supplier',purpose:'Transport booking',amount:'150',idempotencyKey:'named-payment',...changes});assert(r.ok,r.error);return r.proposal;};
const vote=(f,g,p,id='self',changes={})=>f.G.approveProposal({itemId:g.id,proposalId:p.id,personId:id,version:g.mandate.version,...(id!=='self'?{sample:true}:{}),...changes});
const invitation=(f,scenario='approver',changes={})=>{const r=f.G.createSampleInvitation({scenario,idempotencyKey:'invitation-'+scenario,...changes});assert(r.ok,r.error);assert(r.invitation?.id);return r.invitation;};
const join=(f,i,s=f.G.invitationSummary(i.id))=>f.G.acceptInvitation({invitationId:i.id,version:s.mandate.version,fingerprint:s.fingerprint});
const joined=(f,scenario='approver')=>{const i=invitation(f,scenario),r=join(f,i);assert(r.ok,r.error);return {i,item:r.item};};
const clean=f=>assert.deepEqual(f.h.errors,[],'No shipped rendering fallback');
const visible=f=>f.h.document.getElementById('view').textContent;
const buttons=f=>f.h.document.getElementById('view').querySelectorAll('button').map(b=>b.textContent.trim());
const click=(f,label)=>{const b=f.h.document.getElementById('view').querySelectorAll('button').find(b=>b.textContent.trim()===label);assert(b,'Actual button '+label+' exists');b.click();f.h.flush();};
const clickAria=(f,label)=>{const b=f.h.document.getElementById('view').querySelectorAll('button').find(b=>b.getAttribute('aria-label')===label);assert(b,'Actual button labelled '+label+' exists');b.click();f.h.flush();};
const clickStarting=(f,label)=>{const b=f.h.document.getElementById('view').querySelectorAll('button').find(b=>b.textContent.trim().startsWith(label));assert(b,'Actual button beginning '+label+' exists');b.click();f.h.flush();};
const namedDraft=f=>{
 f.L.gm.startCollection();f.h.flush();f.h.set('gm-title','Class trip');f.h.set('gm-target','1200');f.h.set('gm-deadline',future(f));f.L.gm.next();f.h.flush();
 f.h.set('gm-name-1','Abena');f.L.gm.addPerson();f.h.flush();f.h.set('gm-name-2','Kojo');click(f,'Choose approvers');
 assert.equal(f.L.route,'groupMoneyApprovers');clickAria(f,'You');f.h.set('gm-required-approvals','2');click(f,'Use these approvers');
 assert.equal(f.L.route,'groupMoneyPeople');click(f,'Review collection');assert.equal(f.L.route,'groupMoneyReview');return f.L.state.groupMoney.draft;
};
const incomingJourney=(f,role)=>{
 f.L.newRequest();f.h.flush();click(f,'Invitations');assert.equal(f.L.route,'groupMoneyInvitations');click(f,'Try an invitation');assert.equal(f.L.route,'groupMoneySampleInvitations');
 assert.match(visible(f),/sample|same.device/i);assert.match(visible(f),/no one is contacted|not.*live|does not.*send/i);
 clickStarting(f,role==='approver'?'Join as an approver':'Join as a contributor');assert.equal(f.L.route,'groupMoneyInvitation');return f.G.invitations()[0];
};

check('named mandates require at least two distinct selected members and a valid approval count',()=>{
 const f=fixture(),before=personal(f),base=input(f);
 for(const change of [
  {mandateApproverIds:[]},{mandateApproverIds:['self']},{mandateApproverIds:['abena','abena']},
  {mandateApproverIds:['abena','unknown']},{mandateApproverIds:'abena,kojo'},
  {mandateRequiredApprovals:0},{mandateRequiredApprovals:1},{mandateRequiredApprovals:4},
  {mandateRequiredApprovals:2.5},{mandateRequiredApprovals:'2'},
 ])assert.equal(f.G.previewCollection({...base,...change}).ok,false,JSON.stringify(change));
 const p=f.G.previewCollection(base);assert(p.ok,p.error);assert.equal(p.item.mandate.version,2);assert.equal(p.item.mandate.requiredApprovals,2);
 assert.deepEqual(clone(p.item.mandate.approverIds),['abena','kojo','esi']);assert.equal(f.G.list().length,0);assert.equal(personal(f),before);clean(f);
});

check('the creator can be excluded from approval while retaining organiser duties',()=>{
 const f=fixture(),g=fund(f,create(f)),p=propose(f,g),before=personal(f),a=f.G.access(g.id),m=f.G.mandateSummary(g);
 assert.equal(a.isOrganiser,true);assert.equal(a.isApprover,false);assert.equal(a.canApprove,false);assert.equal(a.canPropose,true);assert.equal(a.canExecute,true);
 assert.equal(m.approverCount,3);assert.deepEqual(clone(m.approverIds),['abena','kojo','esi']);assert.equal(m.people.find(p=>p.id==='self').isApprover,false);
 assert.equal(vote(f,g,p).ok,false,'being creator does not grant an approval vote');assert.equal(p.approvals.length,0);
 assert(vote(f,g,p,'abena').ok);assert.equal(f.G.executeSampleProposal({itemId:g.id,proposalId:p.id}).ok,false);
 assert(vote(f,g,p,'kojo').ok);assert.equal(f.G.proposalSummary(g.id,p.id).approvalCount,2);const quote=f.G.preparePayout({itemId:g.id,proposalId:p.id});assert(quote.ok,quote.error);assert(f.G.executeSampleProposal({itemId:g.id,proposalId:p.id,reviewToken:quote.quote.token,pin:f.L.state.profile.pin,outcome:'Completed'}).ok);
 assert.equal(f.G.summary(g).balanceCents,45000);assert.equal(personal(f),before);clean(f);
});

check('a named creator has one vote and only named people count toward the required approvals',()=>{
 const f=fixture(),g=fund(f,create(f,{mandateApproverIds:['self','abena','kojo'],mandateRequiredApprovals:3})),p=propose(f,g);
 assert.equal(f.G.access(g).canApprove,true);assert.equal(vote(f,g,p,'esi').ok,false);assert(vote(f,g,p).ok);assert(vote(f,g,p).ok);assert.equal(f.G.proposalSummary(g.id,p.id).approvalCount,1);
 assert(vote(f,g,p,'abena').ok);assert.equal(f.G.proposalSummary(g.id,p.id).availableToExecute,false);assert(vote(f,g,p,'kojo').ok);assert.equal(f.G.proposalSummary(g.id,p.id).availableToExecute,true);
 clean(f);
});

check('existing version-one mandates preserve their original binding and acceptance evidence',()=>{
 const f=fixture(),g=acceptMembers(f,create(f,{mandateApproval:'majority'}));
 assert.equal(g.mandate.version,1);assert.deepEqual(Object.keys(g.mandate).sort(),['approval','memberIds','requiredApprovals','version']);
 const oldBinding=JSON.stringify([g.mandate.version,g.mandate.approval,g.mandate.memberIds,g.mandate.requiredApprovals,g.title,g.targetCents,g.deadline,g.description,g.people.map(p=>[p.id,p.name,!!p.isOwner])]);
 assert.equal(g.mandateFingerprint,oldBinding);const evidence=JSON.stringify(g.mandateAcceptances);f.L.state.groupMoney=clone(f.L.state.groupMoney);
 assert.equal(f.G.mandateSummary(g.id).valid,true);assert.equal(f.G.mandateSummary(g.id).allAccepted,true);assert.equal(JSON.stringify(f.G.get(g.id).mandateAcceptances),evidence);
 assert(f.G.recordSamplePayment({itemId:g.id,personId:'abena',amount:'20',reference:'old-v1-receipt'}).ok);clean(f);
});

check('selected approvers and the exact mandate cannot change underneath earlier consent or votes',()=>{
 for(const change of ['approvers','required','members']){
  const f=fixture(),g=fund(f,create(f)),p=propose(f,g),before=personal(f);assert(vote(f,g,p,'abena').ok);assert(vote(f,g,p,'kojo').ok);
  if(change==='approvers')g.mandate.approverIds=['self','abena','kojo'];
  if(change==='required')g.mandate.requiredApprovals=3;
  if(change==='members')g.people.splice(g.people.findIndex(p=>p.id==='esi'),1);
  assert.equal(f.G.mandateSummary(g).valid,false);assert.equal(f.G.summary(g).canReceive,false);assert.equal(f.G.proposalSummary(g.id,p.id).valid,false);
  assert.equal(f.G.executeSampleProposal({itemId:g.id,proposalId:p.id}).ok,false);assert.equal(vote(f,g,p,'esi').ok,false);assert.equal(personal(f),before);clean(f);
 }
});

check('saved groups keep only people and never carry approval powers into another collection',()=>{
 const f=fixture(),g=create(f),m=f.G.mandateSummary(g),r=f.G.saveTemplate({name:'Trip friends',people:m.people});assert(r.ok,r.error);
 for(const p of r.template.people)for(const key of ['isApprover','role','accepted','requiredApprovals','mandate'])assert(!Object.hasOwn(p,key),key+' is not saved with people');
 const next=f.G.previewCollection(input(f,{members:r.template.people,mandateApproval:'majority'}));assert(next.ok,next.error);assert.equal(next.item.mandate.version,1);assert.equal(next.item.mandate.approval,'majority');clean(f);
});

check('sample incoming invitations show the exact role and mandate before joining and stay outside pots',()=>{
 for(const scenario of ['approver','contributor']){
  const f=fixture(),before=personal(f),i=invitation(f,scenario),s=f.G.invitationSummary(i.id);assert.equal(s.role,scenario);assert.equal(s.status,'pending');assert.equal(s.valid,true);assert.equal(s.canAccept,true);
  assert(s.organiserName);assert(s.title);assert(s.expiresAt);assert(s.fingerprint);assert.equal(s.mandate.version,2);assert.equal(s.mandate.requiredApprovals,2);assert.equal(s.mandate.approverCount,2);
  assert.equal(s.mandate.people.find(p=>p.id==='self').isApprover,scenario==='approver');assert.equal(f.G.list().length,0);assert.equal(f.G.get(i.collectionId),null);
  const raw=f.L.state.groupMoney.invitations.find(x=>x.id===i.id);assert(raw.collection?.id);assert.equal(f.G.get(raw.collection.id),null);
  assert.equal(f.G.approveProposal({itemId:raw.collection.id,proposalId:'not-yet-joined',personId:'self',version:2}).ok,false);
  assert.match(s.mandate.rules.join(' '),/approve|approval/i);assert.equal(personal(f),before);clean(f);
 }
});

check('accepting an approver invitation joins as the local customer without inheriting organiser powers',()=>{
 const f=fixture(),before=personal(f),{i,item:g}=joined(f,'approver'),a=f.G.access(g.id),m=f.G.mandateSummary(g),p=g.proposals[0];
 assert.equal(g.people.find(p=>p.id==='self').isOwner,false);assert.equal(g.people.find(p=>p.id==='host').isOwner,true);assert.notEqual(g.ownerName,f.L.state.profile.name);
 assert.equal(a.isOrganiser,false);assert.equal(a.isApprover,true);assert.equal(a.canView,true);assert.equal(a.canContribute,true);assert.equal(a.canApprove,true);assert.equal(a.canPropose,false);assert.equal(a.canExecute,false);assert.equal(a.canCancel,false);
 assert.equal(m.allAccepted,true);assert.equal(g.mandateAcceptances.find(x=>x.personId==='self').sample,false);assert(g.mandateAcceptances.filter(x=>x.personId!=='self').every(x=>x.sample===true));
 assert.equal(f.G.summary(g).grossReceivedCents,60000);assert.equal(f.G.summary(g).balanceCents,60000);assert(p);assert.equal(f.G.proposalSummary(g.id,p.id).approvalCount,1);
 assert(vote(f,g,p).ok);assert.equal(f.G.proposalSummary(g.id,p.id).approvalCount,2);assert.equal(f.G.executeSampleProposal({itemId:g.id,proposalId:p.id}).ok,false,'approvers cannot impersonate the organiser to pay');
 const after=JSON.stringify(f.L.state.groupMoney),repeated=join(f,i);assert(repeated.ok,repeated.error);assert.equal(repeated.item.id,g.id);assert.equal(JSON.stringify(f.L.state.groupMoney),after);assert.equal(f.G.list().length,1);assert.equal(personal(f),before);clean(f);
});

check('joined contributors can view activity but cannot vote manage or record an unscoped own receipt through APIs',()=>{
 const f=fixture(),before=personal(f),{item:g}=joined(f,'contributor'),a=f.G.access(g.id),p=g.proposals[0];
 assert.equal(a.isContributor,true);assert.equal(a.isApprover,false);assert.equal(a.isOrganiser,false);assert.equal(a.canView,true);assert.equal(a.canContribute,true);assert.equal(a.canApprove,false);
 const beforeDenied=JSON.stringify(g);
 for(const args of [{personId:'self'},{personId:'host',sample:true},{personId:'kojo',sample:true}])assert.equal(vote(f,g,p,args.personId,args).ok,false,'no approval delegation '+args.personId);
 assert.equal(f.G.createProposal({itemId:g.id,recipient:'Someone',purpose:'Bypass',amount:'1',idempotencyKey:'forbidden-propose'}).ok,false);
 assert.equal(f.G.executeSampleProposal({itemId:g.id,proposalId:p.id}).ok,false);assert.equal(f.G.cancel(g.id).ok,false);assert.equal(f.G.refund(g.id).ok,false);
 assert.equal(f.G.acceptMandate({itemId:g.id,personId:'host',version:2,sample:true}).ok,false);
 assert.equal(f.G.recordSamplePayment({itemId:g.id,personId:'host',amount:'1',reference:'spoof-source'}).ok,false);assert.equal(JSON.stringify(g),beforeDenied);
 const own=f.G.recordSamplePayment({itemId:g.id,personId:'self',amount:'25',reference:'my-contribution'});assert.equal(own.ok,false,'own money requires the reviewed payment and authorisation flow');assert.equal(f.G.summary(g).grossReceivedCents,60000);assert.equal(f.G.summary(g).people.find(p=>p.id==='self').receivedCents,0);assert.equal(JSON.stringify(g),beforeDenied);
 assert.equal(personal(f),before);clean(f);
});

check('joined approvers cannot simulate someone else accepting contributing or voting',()=>{
 const f=fixture(),{item:g}=joined(f),p=g.proposals[0],before=JSON.stringify(g),personalBefore=personal(f);
 assert.equal(vote(f,g,p,'host',{sample:true}).ok,false);assert.equal(vote(f,g,p,'kojo',{sample:true}).ok,false);
 assert.equal(f.G.acceptMandate({itemId:g.id,personId:'host',version:2,sample:true}).ok,false);
 assert.equal(f.G.recordSamplePayment({itemId:g.id,personId:'host',amount:'1',reference:'other-contribution'}).ok,false);
 assert.equal(JSON.stringify(g),before);assert.equal(personal(f),personalBefore);clean(f);
});

check('invitation consent binds the reviewed version and exact collection snapshot',()=>{
 for(const change of ['fingerprint','version','title','approvers','top-title']){
  const f=fixture(),i=invitation(f),s=f.G.invitationSummary(i.id),raw=f.L.state.groupMoney.invitations.find(x=>x.id===i.id),beforePersonal=personal(f);
  const args={invitationId:i.id,version:s.mandate.version,fingerprint:s.fingerprint};
  if(change==='fingerprint')args.fingerprint+='stale';
  if(change==='version')args.version++;
  if(change==='title')raw.collection.title='Changed trip';
  if(change==='approvers')raw.collection.mandate.approverIds=['self','kojo'];
  if(change==='top-title')raw.title='Changed invitation';
  const before=JSON.stringify(f.L.state.groupMoney);assert.equal(f.G.acceptInvitation(args).ok,false,change);assert.equal(f.G.list().length,0);assert.equal(JSON.stringify(f.L.state.groupMoney),before);assert.equal(personal(f),beforePersonal);clean(f);
 }
});

check('declined expired and closed invitations retain their status and cannot open or fund a pot',()=>{
 for(const scenario of ['declined','expired','closed']){
  const f=fixture(),i=invitation(f,scenario==='declined'?'contributor':scenario),s=f.G.invitationSummary(i.id),beforePersonal=personal(f);
  if(scenario==='declined'){const r=f.G.declineInvitation({invitationId:i.id});assert(r.ok,r.error);}
  const current=f.G.invitationSummary(i.id);assert.equal(current.canAccept,false);assert.equal(current.status,scenario);assert.equal(f.G.list().length,0);
  const before=JSON.stringify(f.L.state.groupMoney);assert.equal(join(f,i,s).ok,false);assert.equal(JSON.stringify(f.L.state.groupMoney),before);assert.equal(f.G.get(i.collectionId),null);assert.equal(personal(f),beforePersonal);clean(f);
 }
 const f=fixture(),i=invitation(f),s=f.G.invitationSummary(i.id);f.h.advance(8*86400000);assert.equal(f.G.invitationSummary(i.id).canAccept,false);assert.equal(join(f,i,s).ok,false);clean(f);
});

check('invitation retries are idempotent and cannot reuse one reference for a different role',()=>{
 const f=fixture(),i=invitation(f,'approver',{idempotencyKey:'incoming-once'}),before=JSON.stringify(f.L.state.groupMoney);
 assert.equal(invitation(f,'approver',{idempotencyKey:'incoming-once'}).id,i.id);assert.equal(JSON.stringify(f.L.state.groupMoney),before);
 assert.equal(f.G.createSampleInvitation({scenario:'contributor',idempotencyKey:'incoming-once'}).ok,false);assert.equal(f.G.invitations().length,1);clean(f);
});

check('locked closed unsigned and different-profile callers cannot mutate invitations or joined roles',()=>{
 for(const change of [{locked:true},{closed:true},{onboarded:false},{otherProfile:true}]){
  const f=fixture(),i=invitation(f),s=f.G.invitationSummary(i.id),j=joined(f,'contributor').item,beforePersonal=personal(f);
  if(change.otherProfile)f.L.state.profile.account='other-person-account';else Object.assign(f.L.state,change);
  const before=JSON.stringify(f.L.state.groupMoney);if(!change.otherProfile)assert.equal(f.G.createSampleInvitation({scenario:'contributor',idempotencyKey:'blocked-new'}).ok,false);
  assert.equal(join(f,i,s).ok,false);assert.equal(f.G.declineInvitation({invitationId:i.id}).ok,false);assert.equal(f.G.invitations().length,0);assert.equal(f.G.invitation(i.id),null);assert.equal(f.G.get(j.id),null);
  assert.equal(JSON.stringify(f.L.state.groupMoney),before);assert.equal(personal(f),beforePersonal);clean(f);
 }
});

check('accepted roles and sample activity persist through the existing edition storage without personal changes',()=>{
 const f=fixture(),before=personal(f),{i,item:g}=joined(f,'contributor');f.L.save();const saved=JSON.parse(f.h.store.get(storageKey));
 assert(saved.groupMoney.invitations.some(x=>x.id===i.id&&x.status==='accepted'));assert(saved.groupMoney.items.some(x=>x.id===g.id));
 f.L.state.groupMoney=clone(saved.groupMoney);assert.equal(f.G.access(g.id).isContributor,true);assert.equal(f.G.mandateSummary(g.id).allAccepted,true);assert.equal(f.G.summary(g.id).grossReceivedCents,60000);assert.equal(personal(f),before);clean(f);
});

check('the shipped named-approver setup shows the chosen people and requires explicit creator consent',()=>{
 const f=fixture(),before=personal(f),d=namedDraft(f);assert.equal(d.mandateApproval,'named');assert.equal(d.mandateApproverIds.length,2);assert(!d.mandateApproverIds.includes('self'));
 assert.match(visible(f),/Abena/);assert.match(visible(f),/Kojo/);assert.match(visible(f),/2 of 2/);assert.equal(f.G.list().length,0);
 click(f,'View full mandate');assert.equal(f.L.route,'groupMoneyMandate');assert.match(visible(f),/Named approvers/);assert.match(visible(f),/Abena.*Kojo/);assert.match(visible(f),/Silence is not approval/);
 click(f,'Back to review');click(f,'Agree & create collection');const g=f.G.list()[0];assert.equal(g.mandate.version,2);assert.deepEqual(clone(g.mandate.approverIds),clone(d.mandateApproverIds));
 assert.equal(f.G.access(g.id).isOrganiser,true);assert.equal(f.G.access(g.id).canApprove,false);assert.equal(f.G.mandateSummary(g).acceptedCount,1);assert.equal(personal(f),before);clean(f);
});

check('editing the roster after named-mandate review cannot silently create a different agreement',()=>{
 const f=fixture(),d=namedDraft(f),before=personal(f);d.people.push({id:'esi',name:'Esi',amount:''});f.L.gm.create();f.h.flush();
 assert.equal(f.G.list().length,0);assert.match(f.h.document.getElementById('error').textContent,/changed|review/i);assert.equal(personal(f),before);clean(f);
});

check('an invited approver reads the mandate joins and approves only their own vote in the shipped journey',()=>{
 const f=fixture(),before=personal(f),i=incomingJourney(f,'approver');assert.match(visible(f),/Your role\s*:?\s*Approver/);assert.match(visible(f),/Abena Asante/);assert.match(visible(f),/GH₵1,200.00/);assert.equal(f.G.list().length,0);
 click(f,'View full mandate');assert.equal(f.L.route,'groupMoneyInvitationMandate');assert.match(visible(f),/Named approvers/);assert.match(visible(f),/Silence is not approval/);click(f,'Back to invitation');
 click(f,'Accept & join');assert.equal(f.L.route,'groupMoneyDetail');const g=f.G.list()[0],p=g.proposals[0];assert.equal(f.G.invitationSummary(i.id).status,'accepted');assert.equal(f.G.access(g.id).isApprover,true);
 assert.match(visible(f),/Approver/);assert.match(visible(f),/GH₵600.00/);assert.match(visible(f),/GH₵1,200.00/);assert(!buttons(f).includes('Try member view'));
 click(f,'Payments & approvals');assert(!buttons(f).includes('Pay from collection'));clickStarting(f,'Ama Boateng');assert.equal(f.L.route,'groupMoneyProposalDetail');assert.match(visible(f),/GH₵150.00/);assert.equal(f.G.proposalSummary(g.id,p.id).approvalCount,1);
 click(f,'Approve & submit payment');assert.equal(f.G.proposalSummary(g.id,p.id).approvalCount,2);assert.equal(f.G.proposalSummary(g.id,p.id).status,'processing');assert.match(visible(f),/Payment is processing/);assert(!buttons(f).includes('Record sample payment'));assert(!buttons(f).includes('Try member view'));assert.equal(g.disbursements.length,1);assert.equal(p.requesterAuthorisation.method,'sample-organiser');assert(buttons(f).includes('Check sample status'));
 assert.equal(personal(f),before);clean(f);
});

check('an invited contributor joins authorises money from their own account and has no approval controls',()=>{
 const f=fixture(),before=personal(f),i=incomingJourney(f,'contributor');assert.match(visible(f),/Your role\s*:?\s*Contributor/);assert.match(visible(f),/Contribute and follow|contribute.*follow/i);
 click(f,'View full mandate');assert.match(visible(f),/Named approvers: Abena Asante, Kojo Owusu/);click(f,'Back to invitation');click(f,'Accept & join');const g=f.G.list()[0],p=g.proposals[0];
 assert.equal(f.G.invitationSummary(i.id).status,'accepted');assert.match(visible(f),/Contributor/);assert.match(visible(f),/GH₵600.00/);
 click(f,'Payments & approvals');assert(!buttons(f).includes('Pay from collection'));clickStarting(f,'Ama Boateng');assert.match(visible(f),/Contributor view/);
 for(const label of ['Approve payout','Record sample payment','Try member view'])assert(!buttons(f).includes(label),label+' is not available to contributors');
 const approvals=p.approvals.length;f.L.gm.approveOwn(g.id,p.id);f.h.flush();assert.equal(p.approvals.length,approvals,'direct handler cannot grant a contributor a vote');
 click(f,'Back to payouts');click(f,'Back to collection');assert.equal(personal(f),before);click(f,'Contribute');assert.equal(f.L.route,'send');
 assert.equal(f.h.document.getElementById('gm-sample-person'),null,'The customer cannot choose another payer');
 f.h.set('payment-amount','25');const entry=f.h.document.getElementById('view').querySelector('form');assert(entry);f.h.submit(entry);f.h.flush();assert.equal(f.L.route,'paymentReview');
 assert.equal(f.L.state.balance,600);assert.equal(f.L.state.txs.length,0);assert.equal(f.G.summary(g).grossReceivedCents,60000,'Review creates no pot credit');
 assert.match(visible(f),/Everyday money/);assert.match(visible(f),/GH₵575.00/);f.L.continuePayment();f.h.flush();
 if(f.L.route==='pause'){f.h.advance(3900);const hold=f.h.document.getElementById('view').querySelector('[data-pause-hold]');assert(hold);hold.click();f.h.advance(90);f.h.flush();}
 assert.equal(f.L.route,'authorize');f.h.set('payment-pin','123456');const authorisation=f.h.document.getElementById('view').querySelector('form');assert(authorisation);f.h.submit(authorisation);f.h.flush();assert.equal(f.L.route,'paymentResult');
 assert.equal(f.L.state.balance,575);assert.equal(f.L.accountBalances().available,575);assert.equal(f.L.accountBalances().savings,0);assert.equal(f.L.state.txs.length,1);assert.equal(f.L.state.txs[0].type,'out');assert.equal(f.L.state.txs[0].status,'success');assert.equal(f.L.state.txs[0].amount,25);
 assert.equal(f.G.summary(g).grossReceivedCents,62500);assert.equal(f.G.summary(g).people.find(x=>x.id==='self').receivedCents,2500);assert.match(visible(f),/Contribution made/);
 click(f,'Back to collection');assert.equal(f.L.route,'groupMoneyDetail');assert.equal(f.L.state.paymentDraft,null);click(f,'See all');for(const label of ['Cancel collection','Try sample refunds'])assert(!buttons(f).includes(label));assert.match(visible(f),/Abena Asante/);assert.equal(f.L.state.balance,575);assert.equal(f.L.state.txs.length,1);assert.deepEqual(clone(f.L.state.goals),[]);assert.deepEqual(clone(f.L.state.essentials),[]);assert.deepEqual(clone(f.L.state.requests),[]);clean(f);
});

check('declining an invitation requires confirmation and preserves a readable history without joining',()=>{
 const f=fixture(),before=personal(f),i=incomingJourney(f,'contributor');click(f,'Decline invitation');assert.equal(f.L.route,'groupMoneyInvitationDecline');assert.match(visible(f),/No contribution is made/);
 click(f,'Keep invitation');assert.equal(f.G.invitationSummary(i.id).status,'pending');assert.equal(f.L.route,'groupMoneyInvitation');
 click(f,'Decline invitation');click(f,'Decline invitation');assert.equal(f.G.invitationSummary(i.id).status,'declined');assert.equal(f.G.list().length,0);assert(!buttons(f).includes('Accept & join'));assert.match(visible(f),/declined/i);
 click(f,'Back to invitations');assert.match(visible(f),/Declined/);assert.equal(personal(f),before);clean(f);
});

check('expired closed and changed invitations render without a join action',()=>{
 for(const state of ['expired','closed','changed']){
  const f=fixture(),i=invitation(f,state==='changed'?'approver':state);if(state==='changed')f.L.state.groupMoney.invitations.find(v=>v.id===i.id).collection.title='Altered title';
  f.L.gm.openInvitation(i.id);f.h.flush();assert.equal(f.L.route,'groupMoneyInvitation');assert(!buttons(f).includes('Accept & join'));assert.match(visible(f),state==='expired'?/expired/i:state==='closed'?/closed/i:/unavailable/i);assert.equal(f.G.list().length,0);clean(f);
 }
});

check('the invitation controller rejects stale reviewed details and actions from a different route',()=>{
 const f=fixture(),i=invitation(f),before=personal(f);f.L.gm.openInvitation(i.id);f.h.flush();assert(buttons(f).includes('Accept & join'));
 f.L.go('home');f.h.flush();f.L.gm.acceptInvitation(i.id);f.h.flush();assert.equal(f.G.list().length,0);assert.equal(f.G.invitationSummary(i.id).status,'pending');
 f.L.gm.openInvitation(i.id);f.h.flush();f.L.state.groupMoney.invitations.find(v=>v.id===i.id).collection.title='A different plan';f.L.gm.acceptInvitation(i.id);f.h.flush();
 assert.equal(f.G.list().length,0);assert.match(f.h.document.getElementById('error').textContent,/changed|current|mandate/i);assert.equal(personal(f),before);clean(f);
});

console.log(passed+' named collection and invited-member checks passed.');
