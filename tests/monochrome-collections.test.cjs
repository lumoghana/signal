/* The edition's orientation reads existing mandate/role facts. It never
   creates authority, records approvals or changes account balances. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const shipped=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
const modules=shipped.includes('mono-collections.js')?shipped:shipped.flatMap(name=>name==='mono-design.js'?[name,'mono-collections.js']:[name]);
const settle=f=>{f.h.flushHistory();f.h.flush();};
function fixture(){const h=createHarness({clock:true,modules}),L=h.L;L.explore();L.ensureAccounts?.();Object.assign(L.state,{groupMoney:undefined,paymentDraft:null});L.route='home';L.params={};L.history=[];L.save();h.flush();return {h,L,G:L.groupMoney};}
const view=f=>f.h.document.getElementById('view'),text=f=>view(f).textContent;
const clean=f=>assert.deepEqual(f.h.errors,[]);
const personal=f=>JSON.stringify({accounts:f.L.state.accounts,balance:f.L.state.balance,txs:f.L.state.txs,essentials:f.L.state.essentials,goals:f.L.state.goals,paymentDraft:f.L.state.paymentDraft});
const buttons=f=>view(f).querySelectorAll('button').map(b=>b.textContent.trim());
const go=(f,route,params)=>{f.L.go(route,params);settle(f);};
const future=f=>new f.h.context.Date(f.h.context.Date.now()+14*86400000).toISOString().slice(0,10);
const people=()=>[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena'},{id:'kojo',name:'Kojo'},{id:'esi',name:'Esi'}];
function collection(f,changes={}){const r=f.G.createCollection({title:'Class trip',target:'1200',deadline:future(f),members:people(),mandateApproval:'named',mandateApproverIds:['abena','kojo','esi'],mandateRequiredApprovals:2,acceptMandate:true,idempotencyKey:f.L.id('COL'),...changes});assert(r.ok,r.error);return r.item;}
function fund(f,g){for(const person of g.people.filter(p=>p.id!=='self'))assert(f.G.acceptMandate({itemId:g.id,personId:person.id,version:g.mandate.version,sample:true}).ok);const r=f.G.recordSamplePayment({itemId:g.id,personId:'abena',amount:'600',reference:f.L.id('FUND')});assert(r.ok,r.error);return g;}
function invited(f,role){const r=f.G.createSampleInvitation({scenario:role,idempotencyKey:f.L.id('INV')});assert(r.ok,r.error);f.L.gm.openInvitation(r.invitation.id);settle(f);return r.invitation;}
function join(f,i){f.L.gm.acceptInvitation(i.id);settle(f);return f.G.get(f.G.invitationSummary(i.id).collectionId);}
function overview(f){if(f.L.route==='groupMoneyProposalDetail'){assert.equal(view(f).querySelector('.mono-collection-context'),null,'Payout stages and mandate are not repeated in a second panel');const n=view(f).querySelector('.gm-mandate-summary');assert(n);return n;}const n=view(f).querySelector('.mono-collection-context');assert(n,'One compact context is present');assert.equal(view(f).querySelectorAll('.mono-collection-context').length,1);return n;}

test('collection setup keeps one accessible three-step orientation through details, approvers and review',()=>{
 const f=fixture(),before=personal(f);f.L.gm.startCollection();settle(f);
 const current=()=>view(f).querySelector('.mono-collection-steps [aria-current="step"]');
 assert.equal(view(f).querySelectorAll('.mono-collection-steps li').length,3);assert.equal(current().textContent,'1Details');assert.equal(view(f).querySelector('.gm-step'),null);assert(!text(f).includes('1 of 3'));
 f.h.set('gm-title','Class trip');f.h.set('gm-target','1200');f.h.set('gm-deadline',future(f));f.L.gm.next();settle(f);assert.equal(current().textContent,'2People & rules');
 f.h.set('gm-name-1','Abena');f.L.gm.openApprovers();settle(f);assert.equal(f.L.route,'groupMoneyApprovers');assert.equal(current().textContent,'2People & rules');assert(f.h.document.getElementById('gm-required-approvals'));
 f.L.gm.saveApprovers();settle(f);f.L.gm.next();settle(f);assert.equal(f.L.route,'groupMoneyReview');assert.equal(current().textContent,'3Review');assert(buttons(f).includes('Agree & create collection'));assert.match(text(f),/By creating this collection, you accept its mandate/);
 f.L.gm.create();settle(f);assert.equal(f.L.route,'groupMoneyDetail');assert.equal(view(f).querySelector('.mono-collection-steps'),null);assert(overview(f));assert.equal(personal(f),before);clean(f);
});

test('setup progress does not appear on expense splits or another account’s collection draft',()=>{
 const f=fixture();f.L.gm.startSplit();settle(f);assert.equal(view(f).querySelector('.mono-collection-steps'),null);
 f.L.state.groupMoney.draft=null;f.L.gm.startCollection();settle(f);f.L.state.groupMoney.draft.account='another-account';f.L.render();settle(f);assert.equal(view(f).querySelector('.mono-collection-steps'),null);clean(f);
});

test('organiser context uses the exact named threshold without granting the organiser a vote',()=>{
 const f=fixture(),g=collection(f),before=personal(f);go(f,'groupMoneyDetail',{id:g.id});let o=overview(f);
 assert.match(o.textContent,/Organiser/);assert.doesNotMatch(o.textContent,/Organiser · approver/);assert.match(o.textContent,/2 of 3 named approvers/);assert.match(o.textContent,/Waiting for 3 members to accept/);
 assert.equal(view(f).querySelector('.gm-role-summary'),null);assert.equal(view(f).querySelectorAll('.gm-mandate-card').length,1);assert.match(view(f).querySelector('.gm-mandate-card').textContent,/1 of 4 members accepted/);
 assert.equal(f.G.access(g).canApprove,false);assert(!buttons(f).includes('Approve payout'));fund(f,g);go(f,'groupMoneyPayments',{id:g.id});o=overview(f);assert.match(o.textContent,/Request a payout for the group to approve/);assert(buttons(f).includes('Pay from collection'));
 const records=JSON.stringify(g);for(let n=0;n<3;n++){f.L.render();settle(f);}assert.equal(JSON.stringify(g),records,'Repeating presentation creates no mandate, vote or payment records');assert.equal(personal(f),before);clean(f);
});

for(const role of ['approver','contributor'])test('invited '+role+' keeps its exact role, mandate and permitted next action',()=>{
 const f=fixture(),before=personal(f),i=invited(f,role);let o=overview(f);
 assert.match(o.textContent,new RegExp('Your role: '+(role==='approver'?'Approver':'Contributor')));assert.match(o.textContent,/2 of 2 named approvers/);assert.match(o.textContent,/Read the mandate, then accept or decline/);
 assert.equal(view(f).querySelectorAll('.gm-invitation-role').length,1);assert.equal(view(f).querySelectorAll('.gm-invitation-mandate').length,1);assert(buttons(f).includes('View full mandate'));assert(buttons(f).includes('Accept & join'));
 const g=join(f,i);o=overview(f);assert.match(o.textContent,new RegExp(role==='approver'?'Approver':'Contributor'));assert.equal(f.G.access(g).isOrganiser,false);assert.equal(f.G.access(g).canApprove,role==='approver');
 const p=g.proposals[0];go(f,'groupMoneyProposalDetail',{id:g.id,proposalId:p.id});o=overview(f);assert.match(o.textContent,/1 of 2 approvals/);assert.equal(f.G.mandateSummary(g).version,2);assert.match(o.textContent,/2 of 2 named approvers/);
 if(role==='approver'){assert.match(text(f),/Every approval applies to these exact details/);assert(buttons(f).includes('Approve & submit payment'));f.L.gm.approveOwn(g.id,p.id);settle(f);o=overview(f);assert.match(text(f),/Payment is processing/);assert.equal(f.G.proposalSummary(g.id,p.id).approvalCount,2);}
 else {assert.match(o.textContent,/2 of 2 named approvers/);assert(!buttons(f).includes('Approve payout'));assert.match(text(f),/Contributor view/);}
 assert(!buttons(f).includes('Record sample payment'));assert(!buttons(f).includes('Try member view'));assert.equal(g.disbursements.length,role==='approver'?1:0);assert.equal(personal(f),before);clean(f);
});

test('closed and tampered collection states cannot receive a positive payment instruction',()=>{
 const f=fixture(),g=fund(f,collection(f));g.status='cancelled';go(f,'groupMoneyDetail',{id:g.id});assert.match(overview(f).textContent,/history and sample refunds/);assert(!buttons(f).includes('Try a sample contribution'));
 g.status='collecting';g.mandate.requiredApprovals=1;f.L.render();settle(f);assert.match(overview(f).textContent,/Mandate needs review/);assert.match(overview(f).textContent,/Review the saved mandate/);assert.doesNotMatch(overview(f).textContent,/Propose a payment|Record.*payment|1 of 3/);clean(f);
});

test('legacy collections retain history guidance and no invented approval threshold',()=>{
 const f=fixture(),g=collection(f);delete g.mandate;go(f,'groupMoneyDetail',{id:g.id});const o=overview(f);assert.match(o.textContent,/No agreed mandate/);assert.match(o.textContent,/Review this earlier collection’s activity/);assert.doesNotMatch(o.textContent,/\d of \d/);clean(f);
});

test('expired, closed and changed invitations retain their blockers and have no join instruction',()=>{
 for(const state of ['expired','closed','changed']){
  const f=fixture(),i=invited(f,state==='changed'?'approver':state);if(state==='changed'){f.L.state.groupMoney.invitations.find(x=>x.id===i.id).collection.title='Altered title';f.L.render();settle(f);}
  const o=overview(f);assert(!buttons(f).includes('Accept & join'));assert.doesNotMatch(o.textContent,/then accept or decline/);assert.match(o.textContent,state==='expired'?/expired/:state==='closed'?/closed/:/No membership or payment authority/);assert.equal(f.G.list().length,0);clean(f);
 }
});

test('signed-out, locked and closed accounts receive no collection context or setup data',()=>{
 for(const state of ['onboarded','locked','closed']){const f=fixture(),g=collection(f);go(f,'groupMoneyDetail',{id:g.id});assert(overview(f));f.L.state[state]=state==='onboarded'?false:true;f.L.render();settle(f);assert.equal(view(f).querySelector('.mono-collection-context'),null);assert.equal(view(f).querySelector('.mono-collection-steps'),null);clean(f);}
});
