/* Savings standing instructions use the shipped ledgers and never authorise a
   normal payment. No real payment services or browser records are involved. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const dist=path.resolve(__dirname,'../dist');
const shipped=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..')).filter(f=>!/^savings-hacks-(?:engine|ui)\.js$/.test(f));
const modules=[...shipped,'savings-hacks-engine.js'];
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const json=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const h=createHarness({clock:true,testing:true,modules}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:1000,txs:[],virtualCards:[],paymentDraft:null,planSaved:true,goals:[{id:'laptop',name:'Laptop',allocated:0,target:3000,boxVersion:2},{id:'trip',name:'Trip',allocated:0,target:0,boxVersion:2}],essentials:[],allowance:{amount:0,date:''},savingHacks:{version:1,rulesByBox:{},handled:{},events:[]},savingPrompts:{version:1,rule:null,handled:{},milestones:{}},planHorizon:{mode:'date',date:'2099-01-07'}});
 L.route='plan';L.params={};L.history=[];L.save();h.flush();assert.deepEqual(h.errors,[]);return h;
}
const configure=(h,props={})=>{const r=h.L.savingsHacks.configure({boxId:'laptop',kind:'spend',value:5,consent:true,...props});assert.equal(r.ok,true,r.message);return r.rule;};
const pay=(h,props={})=>h.L.addTx({type:'out',name:'Merchant',amount:20,fee:0,status:'success',method:'Mobile Money',category:'Other',draftId:h.L.id('pay'),...props});
const receive=(h,props={})=>h.L.addTx({type:'in',name:'Family',amount:100,fee:0,status:'success',method:'Mobile Money top-up',category:'Income',draftId:h.L.id('receive'),...props});
const saved=h=>h.L.state.txs.filter(t=>t.internalTransfer&&t.boxDirection==='in'&&t.savingsHack);
const box=(h,id='laptop')=>h.L.state.goals.find(g=>g.id===id);
const last=h=>h.L.savingsHacks.history('laptop')[0];
const at=(h,time)=>h.advance(Date.parse(time)-h.context.Date.now());
check('configuration is optional, requires opt-in and moves no money or holds',()=>{
 const h=fixture(),{L}=h,before=json(L.accountBalances()),keys=[...h.store.keys()];
 assert.equal(L.savingsHacks.get('laptop'),null);assert.equal(L.savingsHacks.configure({boxId:'laptop',kind:'spend',value:5}).ok,false);
 const r=configure(h);assert.deepEqual(json(L.accountBalances()),before);assert.equal(L.state.txs.length,0);assert.deepEqual([...h.store.keys()],keys);
 r.value=99;assert.equal(L.savingsHacks.get('laptop').value,5);assert.equal(L.savingsHacks.get('laptop').consent.accepted,true);
});
check('invalid values dates box and limits are rejected and closed locked users cannot configure',()=>{
 const h=fixture(),{L}=h,api=L.savingsHacks;
 for(const props of [{kind:'unknown'},{value:.001},{value:101},{kind:'roundup',value:2},{monthlyCap:0},{monthlyCap:5001},{minBalance:-1},{boxId:'absent'},{kind:'fixed',value:10,cadence:'yearly',startDate:'2030-01-01'},{kind:'fixed',value:10,cadence:'daily',startDate:'2030-02-30'},{kind:'fixed',value:10,cadence:'daily',startDate:'2020-01-01'}])assert.equal(api.configure({boxId:'laptop',kind:'spend',value:5,consent:true,...props}).ok,false,JSON.stringify(props));
 assert.equal(api.validate({kind:'income',value:5},{requireBox:false}).ok,true);
 configure(h);
 for(const field of ['closed','locked','onboarded']){const was=L.state[field];L.state[field]=field==='onboarded'?false:true;assert.equal(api.configure({boxId:'laptop',kind:'spend',value:5,consent:true}).ok,false);assert.equal(api.pause('laptop').ok,false);assert.equal(api.cancel('laptop').ok,false);assert.equal(api.resume('laptop',{consent:true}).ok,false);assert.equal(api.get('laptop').enabled,true);L.state[field]=was;}
});
check('roundups calculate exact pesewas and exact multiples save zero',()=>{
 const h=fixture();configure(h,{kind:'roundup',value:5});
 assert.equal(h.L.savingsHacks.quote({kind:'roundup',value:5},23.4),1.6);assert.equal(h.L.savingsHacks.quote({kind:'roundup',value:5},25),0);
 pay(h,{amount:23.4});assert.equal(box(h).allocated,1.6);pay(h,{amount:25});assert.equal(box(h).allocated,1.6);assert.equal(last(h).reason,'no-change');assert.equal(saved(h).length,1);
});
check('only one active roundup destination is permitted without silently disabling another',()=>{
 const h=fixture();configure(h,{kind:'roundup',value:5});
 const input={boxId:'trip',kind:'roundup',value:1,consent:true};assert.equal(h.L.savingsHacks.validate(input).ok,false);assert.match(h.L.savingsHacks.configure(input).message,/Laptop/);
 h.L.savingsHacks.pause('laptop');configure(h,input);assert.equal(h.L.savingsHacks.resume('laptop',{consent:true}).ok,false);assert.equal(h.L.savingsHacks.get('trip').enabled,true);
});
check('spend uses the principal after posting and preserves the exact ordinary payment draft',()=>{
 const h=fixture();configure(h);const draft={id:'ordinary',method:'momo',amount:20,pinAttempts:1};h.L.state.paymentDraft=draft;
 const tx=pay(h,{draftId:draft.id,amount:20,fee:2});assert.equal(tx.type,'out');assert.equal(tx.amount,20);assert.equal(h.L.state.paymentDraft,draft);assert.equal(box(h).allocated,1);assert.equal(h.L.state.balance,977);assert.equal(saved(h)[0].savingsHackSourceTxId,tx.id);
});
check('income saving happens after cleared receipt and does not invent funding',()=>{
 const h=fixture();configure(h,{kind:'income',value:10});const tx=receive(h,{amount:100});assert.equal(h.L.state.balance,1090);assert.equal(box(h).allocated,10);assert.equal(last(h).sourceTxId,tx.id);assert.equal(h.L.accountBalances().total,1100);
});
check('pending and failed receipts do not save and pre-consent pending records never replay',()=>{
 const h=fixture(),old=receive(h,{status:'pending'});configure(h,{kind:'income',value:10});h.L.resolveTx(old.id,'success');assert.equal(box(h).allocated,0);
 receive(h,{status:'failed'});const t=receive(h,{status:'pending'});assert.equal(box(h).allocated,0);h.L.resolveTx(t.id,'success');assert.equal(box(h).allocated,10);h.L.resolveTx(t.id,'success');assert.equal(box(h).allocated,10);
});
check('duplicates and reloaded serialised state cannot debit the same event again',()=>{
 const h=fixture();configure(h);const t=pay(h);h.L.savingsHacks.processConfirmed(t.id);h.L.addTx({...t});assert.equal(saved(h).length,1);
 h.L.state=json(h.L.state);h.L.savingsHacks.processConfirmed(t.id);assert.equal(saved(h).length,1);assert.equal(box(h).allocated,1);
});
check('internal moves own card funding refunds reversals and repayment are excluded',()=>{
 const h=fixture();configure(h,{kind:'income',value:10});
 for(const props of [{category:'Refunds'},{method:'Payment reversal'},{originalId:'old'},{refundOf:'old'},{reversalId:'old'},{sharedExpenseRepayment:true}])receive(h,props);
 h.L.transferMoneyBox({id:'trip',amount:5,draftId:'ordinary-box'});assert.equal(box(h).allocated,0);assert.equal(h.L.savingsHacks.history('laptop').length,0);
});
check('direct and forwarded card purchases save once from Everyday Money while refunds do not',()=>{
 const h=fixture(),{L}=h;configure(h);const c=L.virtualCards.issue({name:'Online',draftId:'issue'});L.virtualCards.fund({cardId:c.id,amount:100,draftId:'fund'});
 const t=L.virtualCards.purchase({cardId:c.id,amount:40,draftId:'direct'});assert.equal(box(h).allocated,2);assert.equal(L.state.balance,898);assert.equal(L.virtualCards.balance(c.id).balance,60);
 L.addTx({cardId:c.id,fundingAccount:'virtual-card',type:'out',amount:20,status:'success',draftId:'forwarded'});assert.equal(box(h).allocated,3);assert.equal(saved(h).length,2);assert.equal(L.virtualCards.balance(c.id).balance,40);
 L.virtualCards.refund({originalId:t.id,draftId:'refund'});assert.equal(box(h).allocated,3);assert.equal(L.virtualCards.balance(c.id).balance,80);assert.equal(L.state.balance,897);
});
check('direct pending card resolution saves once and failed card purchases and topups save none',()=>{
 const h=fixture(),{L}=h;configure(h);const c=L.virtualCards.issue({draftId:'issue'});L.virtualCards.fund({cardId:c.id,amount:100,draftId:'fund',status:'pending'});L.virtualCards.resolve(L.state.txs[0].id,'success');assert.equal(box(h).allocated,0);
 const t=L.virtualCards.purchase({cardId:c.id,amount:40,draftId:'pending',status:'pending'});assert.equal(box(h).allocated,0);L.virtualCards.resolve(t.id,'success');L.virtualCards.resolve(t.id,'success');assert.equal(box(h).allocated,2);
 const failed=L.virtualCards.purchase({cardId:c.id,amount:20,draftId:'fail',status:'pending'});L.virtualCards.resolve(failed.id,'failed');assert.equal(box(h).allocated,2);assert.equal(L.virtualCards.balance(c.id).balance,60);
});
check('Budget obligations and pending operational holds protect spending money',()=>{
 const h=fixture();h.L.state.essentials=[{id:'food',name:'Food',amount:980,paid:0}];configure(h,{value:10});pay(h,{amount:20});assert.equal(box(h).allocated,0);assert.equal(last(h).reason,'budget-or-buffer');
 const q=fixture();configure(q,{value:100});pay(q,{amount:850,status:'pending'});pay(q,{amount:80});assert.equal(box(q).allocated,0);assert.equal(q.L.accountBalances().held,850);assert.equal(last(q).reason,'budget-or-buffer');
});
check('the chosen cash buffer is protected even with no saved Budget',()=>{
 const h=fixture();configure(h,{value:100,minBalance:950});pay(h,{amount:40});assert.equal(box(h).allocated,0);assert.equal(h.L.state.balance,960);assert.equal(last(h).reason,'budget-or-buffer');
});
check('monthly caps clamp to actual remaining saving and never queue later debt',()=>{
 const h=fixture();configure(h,{value:10,monthlyCap:1.5});pay(h,{amount:10});pay(h,{amount:10});pay(h,{amount:10});assert.equal(box(h).allocated,1.5);assert.equal(saved(h).length,2);assert.equal(saved(h)[1].amount,1);assert.equal(last(h).reason,'monthly-cap');assert.equal(last(h).amount,0);
 const q=fixture();configure(q,{value:10,monthlyCap:1});const source=pay(q,{amount:10}),transfer=saved(q)[0];assert.equal(transfer.savingsHackBoxId,'laptop');assert.equal(transfer.savingsHackEventKey,'tx:'+source.id);assert.equal(transfer.savingsHackAt,last(q).date);
 transfer.updatedAt='2099-01-01T00:00:00.000Z';pay(q,{amount:10});assert.equal(box(q).allocated,1,'A later receipt update cannot free the posting month’s cap');assert.equal(last(q).reason,'monthly-cap');
});
check('remaining target clamps the transfer and target completion requires explicit resumption',()=>{
 const h=fixture();box(h).target=1.5;configure(h,{value:10});pay(h,{amount:20});assert.equal(box(h).allocated,1.5);assert.equal(h.L.savingsHacks.get('laptop').stoppedReason,'target');
 box(h).target=10;pay(h,{amount:20});assert.equal(box(h).allocated,1.5);assert.equal(h.L.savingsHacks.resume('laptop').ok,false);assert.equal(h.L.savingsHacks.resume('laptop',{consent:true}).ok,true);pay(h,{amount:20});assert.equal(box(h).allocated,3.5);
});
check('multiple destination rules run deterministically and recheck available money',()=>{
 const h=fixture();h.L.state.balance=100;configure(h,{value:100});configure(h,{boxId:'trip',value:100});pay(h,{amount:20});assert.equal(box(h).allocated,20);assert.equal(box(h,'trip').allocated,0);assert.equal(h.L.state.balance,60);
 assert.equal(h.L.savingsHacks.history('trip')[0].reason,'budget-or-buffer');
});
check('pause resume and archive lifecycle never silently restart old instructions',()=>{
 const h=fixture();configure(h);h.L.savingsHacks.pause('laptop');const t=pay(h);assert.equal(box(h).allocated,0);h.L.savingsHacks.resume('laptop',{consent:true});h.L.savingsHacks.processConfirmed(t.id);assert.equal(box(h).allocated,0);
 h.L.archiveGoal('laptop');assert.equal(h.L.savingsHacks.get('laptop').stoppedReason,'archived');h.L.restoreMoneyBox('laptop');assert.equal(h.L.savingsHacks.get('laptop').enabled,false);
 h.L.savingsHacks.resume('laptop',{consent:true});box(h).allocated=1;h.L.archiveGoal('laptop');assert.equal(h.L.savingsHacks.get('laptop').enabled,true,'Failed funded archive preserves instruction');
 box(h).target=2;h.L.transferMoneyBox({id:'laptop',amount:1,draftId:'manual-target'});assert.equal(h.L.savingsHacks.get('laptop').stoppedReason,'target');
});
check('changed accepted configuration and invalid balances cannot execute',()=>{
 for(const field of ['value','monthlyCap']){const h=fixture();configure(h);h.L.state.savingHacks.rulesByBox.laptop[field]=8;pay(h);assert.equal(box(h).allocated,0);assert.equal(last(h).reason,'instruction-changed');}
 const h=fixture();configure(h);const original=h.L.balances;h.L.balances=()=>({...original(),room:NaN});pay(h);assert.equal(box(h).allocated,0);assert.equal(last(h).reason,'balance-unavailable');
});
check('saving errors preserve original payment and a post-ledger error still reports actual saving',()=>{
 const h=fixture();configure(h);h.L.transferMoneyBox=()=>{throw Error('Unavailable');};const tx=pay(h);assert.equal(tx.status,'success');assert.equal(h.L.state.balance,980);assert.equal(last(h).reason,'transfer-unavailable');
 const q=fixture();configure(q);const transfer=q.L.transferMoneyBox;q.L.transferMoneyBox=(input)=>{transfer(input);throw Error('After ledger');};const t=pay(q);assert.equal(t.status,'success');assert.equal(q.L.state.balance,979);assert.equal(last(q).status,'saved');assert.equal(last(q).amount,1);q.L.savingsHacks.processConfirmed(t.id);assert.equal(saved(q).length,1);
});
check('monthly dates preserve their original anchor and missed periods do not accumulate',()=>{
 const h=fixture();configure(h,{kind:'fixed',value:10,cadence:'monthly',startDate:'2030-01-31'});
 at(h,'2030-01-31T09:00:00Z');h.L.savingsHacks.processDue();assert.equal(box(h).allocated,10);assert.equal(h.L.savingsHacks.get('laptop').nextRunAt,'2030-02-28T09:00:00.000Z');
 at(h,'2030-03-01T09:00:00Z');h.L.savingsHacks.processDue();assert.equal(box(h).allocated,20);assert.equal(h.L.savingsHacks.get('laptop').nextRunAt,'2030-03-31T09:00:00.000Z');
 at(h,'2030-07-01T09:00:00Z');h.L.savingsHacks.processDue();assert.equal(box(h).allocated,30);assert.equal(h.L.savingsHacks.get('laptop').nextRunAt,'2030-07-31T09:00:00.000Z');h.L.savingsHacks.processDue();assert.equal(box(h).allocated,30);
});
check('daily and weekly schedules skip low funds without arrears and block locked accounts',()=>{
 for(const cadence of ['daily','weekly']){const h=fixture();configure(h,{kind:'fixed',value:10,cadence,startDate:'2030-01-01'});h.L.state.balance=50;at(h,'2030-02-01T09:00:00Z');h.L.savingsHacks.processDue();assert.equal(box(h).allocated,0);assert.equal(last(h).reason,'budget-or-buffer');h.L.state.balance=1000;h.L.savingsHacks.processDue();assert.equal(box(h).allocated,0);assert(Date.parse(h.L.savingsHacks.get('laptop').nextRunAt)>h.context.Date.now());}
 const h=fixture();configure(h,{kind:'fixed',value:10,cadence:'daily',startDate:'2030-01-01'});h.L.state.locked=true;at(h,'2030-02-01T09:00:00Z');assert.equal(h.L.savingsHacks.processDue().length,0);assert.equal(box(h).allocated,0);h.L.state.locked=false;h.L.savingsHacks.processDue();assert.equal(box(h).allocated,10);
});
check('history is cloned and choosing manual removes automated authority without unsaving',()=>{
 const h=fixture();configure(h);pay(h);const history=h.L.savingsHacks.history('laptop');history[0].amount=999;assert.equal(last(h).amount,1);configure(h,{kind:'manual',consent:false});pay(h);assert.equal(box(h).allocated,1);assert.equal(saved(h).length,1);assert.equal(h.L.savingsHacks.get('laptop').enabled,false);
});
check('due refresh event follows saved ledger and completed history and never fires on skipped batches',()=>{
 const h=fixture();configure(h,{kind:'fixed',value:10,cadence:'daily',startDate:'2030-01-01'});const draft={id:'still-editing',method:'momo',amount:20};h.L.state.paymentDraft=draft;const events=[];
 h.context.addEventListener('lumo:savings-hack-due',e=>{events.push(e);assert.equal(box(h).allocated,10);assert.equal(last(h).status,'saved');assert.equal(e.detail.records[0].transferId,last(h).transferId);});
 at(h,'2030-01-01T09:00:00Z');h.L.savingsHacks.processDue();assert.equal(events.length,1);assert.equal(h.L.state.paymentDraft,draft);h.L.state.balance=50;at(h,'2030-01-02T09:00:00Z');h.L.savingsHacks.processDue();assert.equal(events.length,1);
});
check('cancel removes the attachment authority preserves savings and audit and requires a new instruction',()=>{
 const h=fixture();const r=configure(h);const t=pay(h),before=h.L.state.balance,handled=JSON.stringify(h.L.state.savingHacks.handled);
 const result=h.L.savingsHacks.cancel('laptop');assert.equal(result.ok,true);assert.equal(result.rule.enabled,false);assert.equal(result.rule.stoppedReason,'cancelled');assert(result.rule.cancelledAt);assert.equal(result.rule.consent,null);assert.equal(h.L.state.balance,before);assert.equal(box(h).allocated,1);assert.equal(JSON.stringify(h.L.state.savingHacks.handled),handled);assert.equal(last(h).status,'cancelled');
 h.L.savingsHacks.cancel('laptop');assert.equal(h.L.savingsHacks.history('laptop').length,2);assert.equal(h.L.savingsHacks.resume('laptop',{consent:true}).ok,false);pay(h);assert.equal(box(h).allocated,1);
 const next=configure(h,{value:10});assert.equal(next.revision,r.revision+1);assert(!next.cancelledAt);h.L.savingsHacks.processConfirmed(t.id);assert.equal(box(h).allocated,1);pay(h);assert.equal(box(h).allocated,3);assert.equal(h.L.savingsHacks.history('laptop').filter(e=>e.status==='cancelled').length,1);
});
console.log(passed+' Savings hack engine checks passed.');
