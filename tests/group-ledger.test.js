import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, createDemoState, applyAction, getSummary, loadState, saveState, STORAGE_KEY } from '../dist/js/model.js';
import { ensureGroupState, getGroupActor, activeGroupMember, canReadGroup, groupApprovers, groupSummary, groupMoneyEvents } from '../dist/js/group-ledger.js';
const run = (s, action, p = {}) => { const r = applyAction(s, action, p); assert.equal(r.ok, true, r.message); return r; };
const sample = () => { const s = createDemoState(); const {group:g} = run(s,'ensureProjectPrintingDemo'); return {s,g}; };
const actor = (s,g,memberId) => run(s,'setGroupParticipant',{groupId:g.id,memberId});
const payout = (s,g,overrides={}) => run(s,'requestPayout',{groupId:g.id,amount:9000,recipient:'Balme Library prints',rail:'lumo',destination:'BALME-PRINTS',note:'Print and bind project reports',...overrides}).payout;
const approve = (s,g,p) => { run(s,'reviewPayout',{groupId:g.id,payoutId:p.id,revision:p.revision}); return run(s,'approvePayout',{groupId:g.id,payoutId:p.id,revision:p.revision}); };
const ready = (s,g,p) => { approve(s,g,p);actor(s,g,'esi');approve(s,g,p);return p; };

 test('sample has exactly four confirmed parts and a pending fifth, without changing personal money',()=>{
  const s=createDemoState(), personal=JSON.stringify(getSummary(s)), before=JSON.stringify(s.transactions);
  const {group:g}=run(s,'ensureProjectPrintingDemo');
  assert.equal(g.name,'Project Printing');assert.equal(g.isSample,true);assert.equal(g.members.length,6);
  assert.equal(g.balance,12000);assert.equal(groupSummary(g).collected,12000);assert.equal(groupSummary(g).remaining,6000);
  assert.equal(g.contributions.filter(c=>c.status==='success').length,4);assert.equal(g.contributions.filter(c=>c.status==='pending').length,1);
  assert.equal(g.members.find(m=>m.id==='me').amount,0);assert.deepEqual(groupApprovers(g).map(m=>m.id),['me','esi','kofi']);
  assert.equal(JSON.stringify(getSummary(s)),personal);assert.equal(JSON.stringify(s.transactions),before);
  run(s,'ensureProjectPrintingDemo');assert.equal(s.groups.filter(g=>g.isSample).length,1);
});

test('pending sample confirms once and final personal part reaches target once',()=>{
 const {s,g}=sample(), wallet=s.wallet;
 run(s,'settleGroupContribution',{groupId:g.id,contributionId:'printing-senam',outcome:'success'});
 const events=groupMoneyEvents(g,s).length;
 assert.equal(g.balance,15000);assert.equal(groupSummary(g).remaining,3000);assert.equal(s.wallet,wallet);
 assert.equal(run(s,'settleGroupContribution',{groupId:g.id,contributionId:'printing-senam',outcome:'success'}).duplicate,true);
 assert.equal(groupMoneyEvents(g,s).length,events);assert.equal(g.balance,15000);
 const result=run(s,'contributeGroup',{groupId:g.id,amount:3000,idempotencyKey:'final-part'});
 assert.equal(g.balance,18000);assert.equal(s.wallet,wallet-3000);assert.equal(result.transaction.groupId,g.id);
 run(s,'contributeGroup',{groupId:g.id,amount:3000,idempotencyKey:'final-part'});
 assert.equal(g.balance,18000);assert.equal(groupSummary(g).collected,18000);assert.equal(g.members.find(m=>m.id==='me').amount,3000);
});

test('new groups disclose invitations and cannot read, pay or approve before acceptance',()=>{
 const s=createDemoState(), {group:g}=run(s,'createGroup',{name:'Lab report',target:10000,members:[{id:'me',name:'Ama',role:'approver'},{id:'esi',name:'Esi',role:'approver'}],mandate:{approvers:['me','esi'],threshold:2}});
 actor(s,g,'esi');assert.equal(getGroupActor(g),'esi');assert.equal(activeGroupMember(g),null);assert.equal(canReadGroup(g),false);
 const before=JSON.stringify(s);
 assert.equal(applyAction(s,'contributeGroup',{groupId:g.id,amount:100}).ok,false);
 assert.equal(applyAction(s,'requestPayout',{groupId:g.id,amount:100,recipient:'Printer'}).ok,false);
 assert.equal(applyAction(s,'acceptGroupInvite',{groupId:g.id}).ok,false);assert.equal(JSON.stringify(s),before);
 run(s,'acceptGroupInvite',{groupId:g.id,acceptHistory:true});assert.equal(canReadGroup(g),true);assert.equal(groupApprovers(g).length,2);assert.ok(g.members[1].historyConsentAt);
});

test('only creators can invite and change roles, invitation never supplies group money',()=>{
 const {s,g}=sample(), before=g.balance;
 actor(s,g,'kwame');assert.equal(applyAction(s,'inviteGroupMember',{groupId:g.id,name:'Adjoa'}).ok,false);
 actor(s,g,'me');const {member}=run(s,'inviteGroupMember',{groupId:g.id,name:'Adjoa',phone:'024 111 2222',role:'contributor'});
 assert.equal(member.status,'invited');assert.equal(member.amount,0);assert.equal(g.balance,before);
 assert.equal(applyAction(s,'inviteGroupMember',{groupId:g.id,name:'Other',phone:'+233241112222'}).ok,false);
 actor(s,g,member.id);assert.equal(applyAction(s,'acceptGroupInvite',{groupId:g.id,acceptHistory:true,memberId:'esi'}).ok,false);run(s,'acceptGroupInvite',{groupId:g.id,acceptHistory:true});assert.equal(member.status,'active');
 actor(s,g,'me');run(s,'removeGroupMember',{groupId:g.id,memberId:member.id});
 actor(s,g,member.id);assert.equal(canReadGroup(g),false);assert.equal(applyAction(s,'contributeGroup',{groupId:g.id,amount:3000}).ok,false);
});

test('pending personal funds are held once, failure returns them once, retry does not duplicate records',()=>{
 const {s,g}=sample(), wallet=s.wallet;
 const {contribution:c}=run(s,'contributeGroup',{groupId:g.id,amount:3000,status:'pending'});
 assert.equal(s.wallet,wallet-3000);assert.equal(g.balance,12000);assert.equal(c.walletDebited,true);
 run(s,'settleGroupContribution',{groupId:g.id,contributionId:c.id,outcome:'failed'});assert.equal(s.wallet,wallet);assert.equal(g.balance,12000);
 run(s,'settleGroupContribution',{groupId:g.id,contributionId:c.id,outcome:'failed'});assert.equal(s.wallet,wallet);
 run(s,'retryGroupContribution',{groupId:g.id,contributionId:c.id});assert.equal(s.wallet,wallet-3000);
 run(s,'settleGroupContribution',{groupId:g.id,contributionId:c.id,outcome:'success'});assert.equal(g.balance,15000);assert.equal(s.wallet,wallet-3000);
 assert.equal(s.transactions.filter(t=>t.contributionId===c.id).length,1);
 run(s,'settleGroupContribution',{groupId:g.id,contributionId:c.id,outcome:'reversed'});assert.equal(g.balance,12000);assert.equal(s.wallet,wallet);assert.equal(c.status,'reversed');
 run(s,'settleGroupContribution',{groupId:g.id,contributionId:c.id,outcome:'reversed'});assert.equal(s.wallet,wallet);
});

test('other simulated contributors never debit or credit the customer wallet',()=>{
 const {s,g}=sample(), wallet=s.wallet, tx=s.transactions.length;
 actor(s,g,'kwame');const {contribution:c}=run(s,'contributeGroup',{groupId:g.id,amount:3000});assert.equal(g.balance,15000);assert.equal(c.simulatedExternal,true);assert.equal(s.wallet,wallet);assert.equal(s.transactions.length,tx);
 run(s,'settleGroupContribution',{groupId:g.id,contributionId:c.id,outcome:'reversed'});assert.equal(g.balance,12000);assert.equal(s.wallet,wallet);
});

test('membership changes keep historical contributions, revoke access and clear open approvals',()=>{
 const {s,g}=sample(), p=payout(s,g);ready(s,g,p);assert.equal(p.status,'approved');
 actor(s,g,'me');const before=g.balance, history=JSON.stringify(g.contributions);
 run(s,'removeGroupMember',{groupId:g.id,memberId:'esi'});
 assert.equal(g.balance,before);assert.equal(JSON.stringify(g.contributions),history);assert.equal(p.status,'pending');assert.deepEqual(p.approvals,[]);
 actor(s,g,'esi');assert.equal(canReadGroup(g),false);assert.equal(applyAction(s,'approvePayout',{groupId:g.id,payoutId:p.id}).ok,false);
 actor(s,g,'me');assert.equal(applyAction(s,'removeGroupMember',{groupId:g.id,memberId:'kofi'}).ok,false);assert.equal(g.members.find(m=>m.id==='kofi').status,'active');
});

test('approval requires current designated identity and cannot be spoofed or duplicated',()=>{
 const {s,g}=sample(), p=payout(s,g), before=JSON.stringify(s);
 assert.equal(applyAction(s,'approvePayout',{groupId:g.id,payoutId:p.id,approverId:'esi'}).ok,false);assert.equal(JSON.stringify(s),before);
 approve(s,g,p);assert.equal(applyAction(s,'approvePayout',{groupId:g.id,payoutId:p.id}).ok,false);
 actor(s,g,'kwame');assert.equal(applyAction(s,'approvePayout',{groupId:g.id,payoutId:p.id}).ok,false);
 assert.equal(applyAction(s,'executePayout',{groupId:g.id,payoutId:p.id}).ok,false);
 actor(s,g,'esi');approve(s,g,p);assert.equal(p.status,'approved');assert.deepEqual(p.approvals,['me','esi']);
});

test('editing amount, recipient or purpose invalidates approvals and rejects stale revisions',()=>{
 const {s,g}=sample(), p=payout(s,g);ready(s,g,p);const revision=p.revision;
 run(s,'editPayout',{groupId:g.id,payoutId:p.id,amount:8000,recipient:'Campus prints',note:'Revised project count',revision});
 assert.equal(p.amount,8000);assert.equal(p.recipient,'Campus prints');assert.equal(p.status,'pending');assert.deepEqual(p.approvals,[]);assert.equal(p.revision,revision+1);
 assert.equal(applyAction(s,'approvePayout',{groupId:g.id,payoutId:p.id,revision}).ok,false);
 assert.equal(applyAction(s,'executePayout',{groupId:g.id,payoutId:p.id}).ok,false);
});

test('tampered payout details cannot use approvals for different payment details',()=>{
 const {s,g}=sample(), p=payout(s,g);ready(s,g,p);const balance=g.balance;p.recipient='Someone else';
 assert.equal(applyAction(s,'executePayout',{groupId:g.id,payoutId:p.id}).ok,false);assert.equal(g.balance,balance);assert.equal(p.status,'approved');
});

test('approval completion still requires processing, failure and explicit confirmed settlement',()=>{
 const {s,g}=sample(), wallet=s.wallet, p=payout(s,g);ready(s,g,p);
 run(s,'executePayout',{groupId:g.id,payoutId:p.id});assert.equal(p.status,'processing');assert.equal(g.balance,12000);assert.equal(groupSummary(g).reserved,9000);
 assert.equal(applyAction(s,'executePayout',{groupId:g.id,payoutId:p.id}).ok,false);
 actor(s,g,'me');assert.equal(applyAction(s,'removeGroupMember',{groupId:g.id,memberId:'esi'}).ok,false);assert.equal(applyAction(s,'editPayout',{groupId:g.id,payoutId:p.id,amount:100}).ok,false);
 run(s,'settleGroupPayout',{groupId:g.id,payoutId:p.id,outcome:'failed'});assert.equal(g.balance,12000);assert.equal(groupSummary(g).reserved,0);
 assert.equal(applyAction(s,'settleGroupPayout',{groupId:g.id,payoutId:p.id,outcome:'success'}).ok,false);
 run(s,'retryGroupPayout',{groupId:g.id,payoutId:p.id});assert.equal(p.status,'approved');run(s,'executePayout',{groupId:g.id,payoutId:p.id});
 run(s,'settleGroupPayout',{groupId:g.id,payoutId:p.id,outcome:'success'});assert.equal(g.balance,3000);assert.equal(s.wallet,wallet);assert.equal(groupSummary(g).collected,12000);
 const events=groupMoneyEvents(g,s).length;run(s,'settleGroupPayout',{groupId:g.id,payoutId:p.id,outcome:'success'});assert.equal(g.balance,3000);assert.equal(groupMoneyEvents(g,s).length,events);
});

test('reservations include processing payouts and protect against overcommitment and reversal',()=>{
 const {s,g}=sample(), p=payout(s,g,{amount:11000});ready(s,g,p);run(s,'executePayout',{groupId:g.id,payoutId:p.id});
 assert.equal(applyAction(s,'requestPayout',{groupId:g.id,amount:2000,recipient:'Printer'}).ok,false);
 actor(s,g,'me');assert.equal(applyAction(s,'settleGroupContribution',{groupId:g.id,contributionId:'printing-esi',outcome:'reversed'}).ok,false);
 assert.equal(g.balance,12000);assert.equal(groupSummary(g).available,1000);
});

test('events are deterministic per transition and never include unrelated private money',()=>{
 const {s,g}=sample(), first=groupMoneyEvents(g,s);assert.equal(new Set(first.map(e=>e.id)).size,first.length);
 s.wallet=1;s.ious[0].name='Private debt';s.budget.items[0].name='Private medicine';
 assert.deepEqual(groupMoneyEvents(g,s),first);assert.doesNotMatch(JSON.stringify(first),/Private debt|Private medicine|Allowance from Mum/);
 run(s,'settleGroupContribution',{groupId:g.id,contributionId:'printing-senam',outcome:'success'});
 const second=groupMoneyEvents(g,s);assert.equal(second.length,first.length+1);assert.deepEqual(second.slice(0,first.length),first);
});

test('legacy migration keeps existing balances, imports personal provenance and subtracts it from opening totals',()=>{
 const s=createDemoState(), g=s.groups[0];delete g.schema;delete g.contributions;
 g.balance+=5000;g.members[0].amount+=5000;s.wallet-=5000;
 const tx={id:'old-personal-contribution',groupId:g.id,type:'contribution',amount:5000,status:'success',at:'2026-10-31T10:00:00Z'};s.transactions.unshift(tx);
 const wallet=s.wallet,balance=g.balance;ensureGroupState(s);
 assert.equal(g.balance,balance);assert.equal(s.wallet,wallet);assert.equal(groupSummary(g).collected,95000);
 const imported=g.contributions.find(c=>c.transactionId===tx.id);assert.equal(imported.amount,5000);assert.equal(imported.walletDebited,true);
 assert.equal(g.contributions.filter(c=>c.memberId==='me').reduce((n,c)=>n+c.amount,0),30000);
 const state=JSON.stringify(s);ensureGroupState(s);assert.equal(JSON.stringify(s),state);
 run(s,'settleGroupContribution',{groupId:g.id,contributionId:imported.id,outcome:'reversed'});assert.equal(s.wallet,wallet+5000);assert.equal(g.balance,balance-5000);assert.equal(tx.status,'reversed');
});

test('legacy paid payouts are retained and never executed again during migration',()=>{
 const s=createDemoState(),g=s.groups[0];delete g.contributions;g.balance=70000;g.payouts=[{id:'old-payout',amount:20000,recipient:'Guesthouse',rail:'bank',status:'success',approvals:['me','senam'],requiredApprovals:2,at:'2026-10-30T10:00:00Z'}];
 ensureGroupState(s);assert.equal(g.balance,70000);assert.equal(groupSummary(g).collected,90000);assert.equal(g.payouts[0].status,'success');assert.equal(groupSummary(g).reserved,0);
 assert.equal(applyAction(s,'executePayout',{groupId:g.id,payoutId:'old-payout'}).ok,false);
});

test('local save and reload retain group state without losing personal ledger',()=>{
 const original=globalThis.localStorage,storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 try{const {s,g}=sample();run(s,'settleGroupContribution',{groupId:g.id,contributionId:'printing-senam',outcome:'success'});saveState(s);assert.ok(storage.has(STORAGE_KEY));const loaded=loadState();const restored=loaded.groups.find(x=>x.id===g.id);assert.equal(restored.balance,15000);assert.equal(loaded.wallet,s.wallet);assert.deepEqual(restored.contributions,g.contributions);assert.equal(restored.schema,2);}finally{globalThis.localStorage=original;}
});

test('cached keys are actor-bound and removed or invited people cannot replay group results',()=>{
 const {s,g}=sample();const{payout:p}=run(s,'requestPayout',{groupId:g.id,amount:3000,recipient:'Printer',idempotencyKey:'request-once'});
 actor(s,g,'kwame');assert.equal(applyAction(s,'requestPayout',{groupId:g.id,amount:3000,recipient:'Printer',idempotencyKey:'request-once'}).ok,false);
 actor(s,g,'me');approve(s,g,p);run(s,'removeGroupMember',{groupId:g.id,memberId:'kwame'});actor(s,g,'kwame');
 const result=applyAction(s,'requestPayout',{groupId:g.id,amount:3000,recipient:'Printer',idempotencyKey:'request-once'});assert.equal(result.ok,false);assert.equal(result.group,undefined);assert.equal(result.payout,undefined);
});


test('role changes do not resurrect reservations from failed payouts after funds were reused',()=>{
 const {s,g}=sample(), old=payout(s,g,{amount:9000});ready(s,g,old);
 run(s,'executePayout',{groupId:g.id,payoutId:old.id});
 run(s,'settleGroupPayout',{groupId:g.id,payoutId:old.id,outcome:'failed'});
 actor(s,g,'me');const newer=payout(s,g,{amount:11000,recipient:'Campus printer'});
 assert.equal(groupSummary(g).reserved,11000);const wallet=s.wallet;
 run(s,'setGroupMemberRole',{groupId:g.id,memberId:'esi',role:'contributor'});
 assert.equal(old.status,'failed');assert.deepEqual(old.approvals,[]);assert.equal(newer.status,'pending');
 assert.equal(groupSummary(g).reserved,11000);assert.equal(groupSummary(g).available,1000);assert.equal(s.wallet,wallet);
 assert.equal(applyAction(s,'retryGroupPayout',{groupId:g.id,payoutId:old.id}).ok,false);
 const before=JSON.stringify(s);
 assert.equal(applyAction(s,'editPayout',{groupId:g.id,payoutId:old.id,amount:2000}).ok,false);assert.equal(JSON.stringify(s),before);
 run(s,'editPayout',{groupId:g.id,payoutId:old.id,amount:1000});
 assert.equal(old.status,'pending');assert.equal(groupSummary(g).reserved,12000);assert.equal(groupSummary(g).available,0);
});
