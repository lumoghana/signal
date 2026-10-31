/* Financial authority tests: no UI assumptions and no live bank integration. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dist=path.join(__dirname,'../dist');let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function harness(saved){
 let stored=saved?JSON.stringify(saved):null;const context={console,Date,Math,URLSearchParams,setTimeout:()=>0,clearTimeout(){},location:{search:''},document:{getElementById:()=>null,addEventListener(){}},localStorage:{getItem:()=>stored,setItem:(_,value)=>stored=value},addEventListener(){}};context.window=context;context.globalThis=context;vm.createContext(context);
 for(const file of ['core.js','two-account-engine.js','pause-engine.js','plan-impact.js'])vm.runInContext(fs.readFileSync(path.join(dist,file),'utf8'),context,{filename:file});
 context.L.render=()=>{};context.L.toast=()=>{};return {L:context.L,stored:()=>JSON.parse(stored)};
}
function fixture({balance=600,allocated=100,essentials=350,txs=[],goals}={}){
 const h=harness(),s=h.L.state;Object.assign(s,{onboarded:true,locked:false,balance,txs,essentials:essentials?[{id:'food',name:'Food and transport',amount:essentials,paid:0}]:[],goals:goals||[{id:'laptop',name:'Laptop',target:3500,allocated}],profile:{...s.profile,pin:'123456',phone:'0241230123'}});delete s.accounts;h.L.ensureAccounts();return h;
}
const totals=L=>L.accountBalances();
check('two distinct account numbers appear only after successful account creation',()=>{
 const {L}=harness();assert.equal(L.ensureAccounts(),null);assert.equal(L.state.accounts,undefined);L.state.onboarded=true;L.ensureAccounts();assert.equal(L.state.accounts.version,2);assert.equal(L.state.accounts.operational.number,'9300123456');assert.equal(L.state.accounts.savings.number,'9300123457');assert.equal(L.state.profile.savingsAccount,'9300123457');assert.equal(totals(L).total,0);
});
check('legacy allocations become real savings without changing total money or the budget room',()=>{
 const {L}=fixture();assert.equal(totals(L).operational,500);assert.equal(totals(L).savings,100);assert.equal(totals(L).total,600);assert.equal(L.balances().room,150);assert.equal(L.balances().allocated,0);assert.equal(L.state.goals[0].allocated,100);assert.equal(L.state.goals[0].target,3500);assert.equal(L.state.txs.length,1);assert.equal(L.state.txs[0].type,'internal');assert.equal(L.state.txs[0].migration,true);assert.equal(L.state.txs.filter(t=>t.type==='out'||t.type==='in').length,0);
});
check('migration is idempotent across saves and reloads',()=>{
 const {L,stored}=fixture();L.save();L.ensureAccounts();L.save();const first=JSON.stringify(L.state),next=harness(stored());next.L.save();assert.equal(JSON.stringify(next.L.state),first);assert.equal(totals(next.L).total,600);assert.equal(next.L.state.txs.length,1);
});
check('oversubscribed legacy allocations preserve pending payments and record unfunded intent',()=>{
 const {L}=fixture({balance:100,txs:[{id:'pending',type:'out',status:'pending',amount:30,fee:0}],goals:[{id:'one',name:'Laptop',allocated:80,target:200},{id:'two',name:'Travel',allocated:90,target:500}]});
 assert.equal(totals(L).operational,30);assert.equal(totals(L).available,0);assert.equal(totals(L).savings,70);assert.equal(totals(L).total,100);assert.equal(L.state.goals[0].allocated,70);assert.equal(L.state.goals[0].legacyUnfunded,10);assert.equal(L.state.goals[1].allocated,0);assert.equal(L.state.goals[1].legacyUnfunded,90);assert.equal(L.state.accounts.migration.unfunded,100);
});
check('migration preserves an existing negative operational balance rather than erasing it',()=>{
 const {L}=fixture({balance:-20});assert.equal(L.state.balance,-20);assert.equal(totals(L).operational,-20);assert.equal(totals(L).total,-20);assert.equal(L.state.goals[0].allocated,0);assert.equal(L.state.goals[0].legacyUnfunded,100);
});
check('funding a box moves the same money between accounts once and never counts as a budget payment',()=>{
 const {L}=fixture({allocated:0});const t=L.transferMoneyBox({id:'laptop',direction:'in',amount:100,draftId:'fund-one'});assert.equal(t.type,'internal');assert.equal(t.internalTransfer,true);assert.equal(t.method,'Money Box transfer');assert.equal(totals(L).operational,500);assert.equal(totals(L).savings,100);assert.equal(totals(L).total,600);assert.equal(L.balances().room,150);assert.equal(L.state.essentials[0].paid,0);assert.equal(L.transferMoneyBox({id:'laptop',direction:'in',amount:100,draftId:'fund-one'}),t);assert.equal(totals(L).total,600);assert.equal(L.state.txs.length,1);
});
check('withdrawals can return savings when operational money is zero',()=>{
 const {L}=fixture({balance:100,allocated:100,essentials:0});const d={method:'box',boxId:'laptop',boxDirection:'out',amount:80,fee:0};assert.equal(L.pauseEngine.evaluate(d).triggered,false);assert.equal(L.planImpactSummary(d).after,80);assert.equal(L.planImpactSummary(d).canPay,true);L.transferMoneyBox({id:'laptop',direction:'out',amount:80,draftId:'withdraw-one'});assert.equal(totals(L).operational,80);assert.equal(totals(L).savings,20);assert.equal(totals(L).total,100);
});
check('a pending box deposit reserves operational money without prematurely crediting savings',()=>{
 const {L}=fixture({allocated:0});const t=L.transferMoneyBox({id:'laptop',direction:'in',amount:100,draftId:'pending-fund',status:'pending'});assert.equal(totals(L).operational,600);assert.equal(totals(L).available,500);assert.equal(totals(L).savings,0);assert.equal(L.balances().held,100);assert.equal(L.balances().room,150);L.resolveTx(t.id,'success');L.resolveTx(t.id,'success');assert.equal(totals(L).operational,500);assert.equal(totals(L).savings,100);assert.equal(totals(L).total,600);
});
check('a failed pending box deposit releases its reserve without changing either actual balance',()=>{
 const {L}=fixture({allocated:0});const t=L.transferMoneyBox({id:'laptop',direction:'in',amount:100,draftId:'failed-fund',status:'pending'});L.resolveTx(t.id,'failed');assert.equal(totals(L).operational,600);assert.equal(totals(L).available,600);assert.equal(totals(L).savings,0);assert.equal(totals(L).total,600);
});
check('pending withdrawals reserve only their box and failed ones release that reserve',()=>{
 const {L}=fixture({balance:100,allocated:100,essentials:0});const t=L.transferMoneyBox({id:'laptop',direction:'out',amount:80,draftId:'pending-out',status:'pending'});assert.equal(L.moneyBoxAvailable('laptop'),20);assert.equal(totals(L).savings,100);assert.equal(totals(L).savingsHeld,80);assert.equal(totals(L).available,0);assert.throws(()=>L.transferMoneyBox({id:'laptop',direction:'out',amount:30,draftId:'overdraw'}),/Not enough/);L.resolveTx(t.id,'failed');assert.equal(L.moneyBoxAvailable('laptop'),100);assert.equal(totals(L).total,100);
});
check('successful pending withdrawals credit operational money exactly once',()=>{
 const {L}=fixture({balance:100,allocated:100,essentials:0});const t=L.transferMoneyBox({id:'laptop',direction:'out',amount:80,draftId:'pending-out',status:'pending'});L.resolveTx(t.id,'success');L.resolveTx(t.id,'success');assert.equal(totals(L).operational,80);assert.equal(totals(L).savings,20);assert.equal(totals(L).total,100);assert.equal(L.moneyBoxAvailable('laptop'),20);
});
check('external payments can never silently spend savings',()=>{
 const {L}=fixture({allocated:500,essentials:0});assert.equal(L.balances().available,100);assert.throws(()=>L.addTx({type:'out',status:'success',amount:101,fee:0}),/Not enough/);L.addTx({type:'out',status:'success',amount:80,fee:0});assert.equal(totals(L).operational,20);assert.equal(totals(L).savings,500);assert.equal(totals(L).total,520);
});
check('a linked budget payment fulfils its cost once without deducting Money Boxes again',()=>{
 const {L}=fixture();const d={amount:80,fee:0,essentialId:'food'};assert.equal(L.planImpactSummary(d).room,150);assert.equal(L.planImpactSummary(d).essentialCovered,80);L.addTx({type:'out',status:'success',amount:80,fee:0,essentialId:'food',draftId:'planned'});assert.equal(L.state.essentials[0].paid,80);assert.equal(L.balances().essentials,270);assert.equal(L.balances().room,150);assert.equal(totals(L).savings,100);assert.equal(totals(L).operational,420);
});
check('Pause reports the operational budget shortfall while savings remain separate',()=>{
 const {L}=fixture();const d={method:'lumo',name:'Abena',destination:'@abena',amount:280,fee:0},p=L.planImpactSummary(d);assert.equal(p.available,500);assert.equal(p.after,220);assert.equal(p.essentialGap,130);assert.equal(p.goalGap,0);assert.equal(p.allocated,0);assert.equal(p.totalGap,130);assert.equal(p.engineDecision.triggered,true);assert(p.headline.includes('GH₵130.00 short'));assert(p.commitmentExplanation.includes('not deducted again'));assert.equal(totals(L).savings,100);
});
check('funding a box uses the same budget Pause projection before any money moves',()=>{
 const {L}=fixture();const d={id:'draft-box',method:'box',boxId:'laptop',boxDirection:'in',amount:280,fee:0};const p=L.planImpactSummary(d);assert.equal(p.after,220);assert.equal(p.essentialGap,130);assert.equal(p.engineDecision.triggered,true);assert.equal(totals(L).operational,500);L.state.paymentDraft=d;const t=L.addTx({draftId:d.id,type:'out',amount:280,fee:0,status:'success',name:'Laptop'});assert.equal(t.type,'internal');assert.equal(totals(L).operational,220);assert.equal(totals(L).savings,380);assert.equal(totals(L).total,600);assert.equal(L.state.essentials[0].paid,0);
});
check('a reversed internal movement returns money through a separate idempotent matching entry',()=>{
 const {L}=fixture({allocated:0});const t=L.transferMoneyBox({id:'laptop',amount:100,draftId:'to-reverse'});const result=L.reverseMoneyBoxTransfer(t.id);assert.equal(t.status,'reversed');assert.equal(result.originalId,t.id);assert.equal(totals(L).operational,600);assert.equal(totals(L).savings,0);assert.equal(totals(L).total,600);L.reverseMoneyBoxTransfer(t.id);assert.equal(totals(L).total,600);
});
check('invalid, locked and closed movements cannot change money',()=>{
 const {L}=fixture({allocated:0});for(const amount of [0,-1,NaN,1.001,5001])assert.throws(()=>L.transferMoneyBox({id:'laptop',amount}));assert.throws(()=>L.transferMoneyBox({id:'missing',amount:1}));L.state.locked=true;assert.throws(()=>L.transferMoneyBox({id:'laptop',amount:1}));L.state.locked=false;L.state.closed=true;assert.throws(()=>L.transferMoneyBox({id:'laptop',amount:1}));assert.equal(totals(L).total,600);
});
check('unmigrated financial fixtures keep the documented legacy arithmetic until migration',()=>{
 const {L}=harness(),s={balance:600,essentials:[{id:'food',name:'Food and transport',amount:350,paid:0}],goals:[{id:'laptop',name:'Laptop',allocated:100}],txs:[]};const p=L.planImpactSummary({amount:280,fee:0},s);assert.equal(p.after,320);assert.equal(p.essentialGap,30);assert.equal(p.goalGap,100);assert.equal(p.totalGap,130);assert.equal(s.accounts,undefined);
});
console.log(passed+' two-account financial authority checks passed.');
