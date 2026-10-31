/* Mounted Home behavior through the shipped index. These checks cover control
   scope and state, not rendered phone geometry or a live account connection. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let checks=0;
const check=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
const outlet=h=>h.document.getElementById('view');
const fields=['available','room','savings'];
const eye=h=>h.document.getElementById('balance-eye');
const clean=h=>assert.deepEqual(h.errors,[]);
const moneySnapshot=L=>JSON.stringify({balance:L.state.balance,accounts:L.state.accounts,txs:L.state.txs,budget:L.state.essentials,boxes:L.state.goals});
function fixture({budget=true,...options}={}){
 const h=createHarness({clock:true,...options}),{L}=h,flush=h.flush;
 h.flush=()=>{flush();h.advance(16);};
 L.state.onboarded=true;L.state.profile.pin='123456';L.state.profile.phone='0241230123';
 L.state.profile.campus='University of Ghana';L.state.essentials=budget?[{id:'food',name:'Food and transport',amount:350,paid:0}]:[];
 L.state.goals=[{id:'laptop',name:'Laptop',allocated:0,target:3500,boxVersion:2}];L.state.planSaved=budget;L.save();
 L.addTx({draftId:'home-first-credit',type:'in',name:'Confirmed sample funding',amount:600,fee:0,status:'success'});
 L.transferMoneyBox({id:'laptop',direction:'in',amount:100,draftId:'home-first-box',status:'success'});
 L.route='home';L.params={};L.history=[];L.render();h.flush();clean(h);return h;
}
function field(root,key){const node=root.querySelector(`[data-private-value="${key}"]`);assert(node,'Private '+key+' amount is mounted');return node;}
function assertMasked(root,keys=fields){
 for(const key of keys){const node=field(root,key);assert(node.querySelector('.money-mask'));assert.equal(node.textContent,'•••••');assert(!/\d/.test(node.innerHTML),'Masked amount markup contains no digits');}
}
function assertVisible(root,values={available:500,room:150,savings:100}){
 for(const [key,value]of Object.entries(values)){const node=field(root,key),short=!!node.closest('.signal-home');assert.equal(node.querySelector('.money-mask'),null);assert.equal(node.textContent,(short?'₵':'GH₵')+Number(value).toLocaleString('en-GH',{minimumFractionDigits:short&&Number.isInteger(Number(value))?0:2,maximumFractionDigits:2}));}
}
function clickAction(h,action){const button=outlet(h).querySelectorAll('button').find(el=>el.getAttribute('onclick')===action);assert(button,'Working action '+action+' on '+h.L.route);button.focus();button.click();h.flush();return button;}
function campusFromHome(h){const trigger=h.document.getElementById('lumo-scan-qr');assert(trigger&&!trigger.hidden);trigger.focus();trigger.click();h.flush();assert.equal(h.L.route,'campusPay');assert.equal(h.L.params.qrScan,true);h.L.qr.codeEntry();h.flush();return trigger;}
function closeSheet(h){const close=h.document.querySelector(h.L.signalEdition?'.task-sheet-back':'.task-sheet-close');assert(close);close.click();h.flush();h.flushHistory();h.flush();assert.equal(h.L.route,'home');assert.equal(h.L.taskSheet.active,false);}

check('one privacy button sits inside the balance card and controls its amounts and separate savings',()=>{
 const h=fixture(),home=outlet(h),control=eye(h);
 assert.equal(home.querySelectorAll('#balance-eye').length,1);assert.equal(home.querySelectorAll('.account-operational').length,1);assert.equal(home.querySelectorAll('.account-savings').length,1);
 assert(control.closest('.account-operational'));assert(control.closest('.everyday-account-heading'));
 assert(home.querySelector('.account-savings'));assert.equal(home.querySelector('.home-money-story'),null);
 assert.equal(home.querySelector('.accounts-welcome #balance-eye'),null);
 assert.equal(control.getAttribute('aria-label'),'Hide balances');assert.equal(control.getAttribute('aria-pressed'),'true');
 assert.deepEqual(control.getAttribute('aria-controls').split(/\s+/),['overview-room','overview-balance','overview-savings',...(h.L.signalEdition?['signal-planned-costs']:[])]);clean(h);
});
check('the budget conclusion owns the main amount format while available balance is supporting text',()=>{
 const h=fixture(),home=outlet(h),room=field(home,'room'),available=field(home,'available');
 assert.equal(room.getAttribute('data-money-format'),'balance');assert.equal(available.getAttribute('data-money-format'),'text');
 assert(room.closest('.everyday-primary-money'));assert(available.closest(h.L.signalEdition?'.signal-balance-breakdown':'.everyday-available-context'));assert.equal(home.querySelectorAll('#overview-room').length,1);
 assertVisible(home);assert.equal(h.L.balances().room,150);clean(h);
});
check('a newly opened customer account shows all overview figures without a discovery tap',()=>{
 const h=fixture();assertVisible(outlet(h));assert.equal(eye(h).getAttribute('aria-pressed'),'true');assert.equal(eye(h).textContent.replace(/\s+/g,' ').trim(),'Hide');clean(h);
});
check('the shared control hides and reveals all three values together without changing money',()=>{
 const h=fixture(),home=outlet(h),before=moneySnapshot(h.L),control=eye(h);control.click();h.flush();
 assertMasked(home);assert.equal(control.getAttribute('aria-label'),'Show balances');assert.equal(control.getAttribute('aria-pressed'),'false');assert.equal(control.textContent.replace(/\s+/g,' ').trim(),'Show');
 control.click();h.flush();assertVisible(home);assert.equal(control.getAttribute('aria-label'),'Hide balances');assert.equal(control.textContent.replace(/\s+/g,' ').trim(),'Hide');assert.equal(moneySnapshot(h.L),before);clean(h);
});
check('without a Budget the actual available balance is the main amount and privacy has no missing target',()=>{
 const h=fixture({budget:false}),home=outlet(h),control=eye(h);assert.equal(field(home,'available').getAttribute('data-money-format'),'balance');assert.equal(home.querySelector('[data-private-value="room"]'),null);
 assert.equal(control.getAttribute('aria-controls').includes('overview-room'),false);assert.equal(home.querySelector('.account-budget-invite'),null);assert(h.document.getElementById('nav').querySelectorAll('button').some(b=>b.getAttribute('onclick')==="L.openMonoMenu()"));
 control.click();h.flush();assertMasked(home,['available','savings']);control.click();h.flush();assertVisible(home,{available:500,savings:100});clean(h);
});
check('opening and dismissing Campus Pay retains the masked Home amounts, header and user position',()=>{
 const h=fixture(),{L}=h,parent=outlet(h),tree=parent.firstChild,control=eye(h);control.click();h.flush();parent.scrollTop=61;const before=moneySnapshot(L),trigger=campusFromHome(h);
 assert.equal(L.taskSheet.parentRoute,'home');assert(h.document.getElementById('task-parent-view')===parent);assert(parent.firstChild===tree);assert(parent.inert);assertMasked(parent);assert(parent.querySelector('.balance-eye')===control,'Inactive parent retains its eye while IDs are isolated from the sheet');
 closeSheet(h);assert(outlet(h)===parent);assert(parent.firstChild===tree);assert.equal(parent.scrollTop,61);assert(h.document.activeElement===trigger||parent.contains(h.document.activeElement));assert(eye(h)===control);assert.equal(control.getAttribute('aria-label'),'Show balances');assertMasked(parent);assert.equal(moneySnapshot(L),before);clean(h);
});
check('backgrounding during a sheet masks every retained overview amount before Home returns',()=>{
 const h=fixture(),parent=outlet(h),before=moneySnapshot(h.L);assertVisible(parent);campusFromHome(h);h.emit('pagehide');assertMasked(parent);closeSheet(h);
 assertMasked(outlet(h));assert.equal(eye(h).getAttribute('aria-label'),'Show balances');assert.equal(eye(h).textContent.replace(/\s+/g,' ').trim(),'Show');assert.equal(moneySnapshot(h.L),before);clean(h);
});
check('a restored browser page stays masked until an explicit privacy action',()=>{
 const h=fixture(),before=moneySnapshot(h.L);h.emit('pageshow',{persisted:true});h.flush();assertMasked(outlet(h));assert.equal(eye(h).getAttribute('aria-pressed'),'false');
 eye(h).click();h.flush();assertVisible(outlet(h));assert.equal(moneySnapshot(h.L),before);clean(h);
});
check('locked access cannot reveal existing overview markup or bypass the sign-in screen',()=>{
 const h=fixture(),{L}=h,parent=outlet(h),before=moneySnapshot(L);L.state.locked=true;L.showPrivateMoney();assertMasked(parent);L.toggleBalancePrivacy();assertMasked(parent);
 L.go('home');h.flush();assert.equal(L.route,'signin');assert.equal(outlet(h).querySelector('[data-private-value]'),null);assert.equal(h.document.getElementById('balance-eye'),null);assert.equal(moneySnapshot(L),before);clean(h);
});
check('refreshed figures remain accurate after an authorised transfer while the privacy choice is retained',()=>{
 const h=fixture(),{L}=h;eye(h).click();h.flush();L.transferMoneyBox({id:'laptop',direction:'out',amount:80,draftId:'confirmed-return',status:'success'});L.render();h.flush();assertMasked(outlet(h));
 eye(h).click();h.flush();assertVisible(outlet(h),{available:580,room:230,savings:20});assert.equal(L.accountBalances().total,600);clean(h);
});
check('Home keeps Add money, Transfer and Request in one action group',()=>{
 const h=fixture(),home=outlet(h),actions=home.querySelector('.everyday-home-actions'),funding=actions.querySelectorAll('button').find(b=>b.getAttribute('onclick')==="L.openFunding('home')");
 assert(funding.closest('.everyday-home-actions'));assert.equal(home.querySelectorAll('button').filter(b=>b.getAttribute('onclick')==="L.openFunding('home')").length,1);assert.equal(funding.getAttribute('onclick'),"L.openFunding('home')");
 assert.equal(actions.querySelectorAll('button').length,3);assert.deepEqual(actions.querySelectorAll('button').map(b=>b.getAttribute('onclick')),["L.openFunding('home')","L.openTab('pay')",'L.newRequest()']);
 assert.equal(home.querySelectorAll('button').filter(b=>b.getAttribute('onclick')==="L.go('campusPay')").length,0);assert(h.document.getElementById('lumo-scan-qr'));clean(h);
});
check('Money Boxes opens the existing savings task and returns without moving money or unmasking balances',()=>{
 const h=fixture(),{L}=h,parent=outlet(h),tree=parent.firstChild,before=moneySnapshot(L);eye(h).click();h.flush();
 const trigger=clickAction(h,"L.go('goals')");assert.equal(L.route,'goals');assert.equal(L.taskSheet.parentRoute,'home');assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);
 closeSheet(h);assert(outlet(h)===parent);const returned=parent.querySelectorAll('button').find(b=>b.getAttribute('onclick')==="L.go('goals')");assert(h.document.activeElement===returned);assertMasked(parent);assert.equal(moneySnapshot(L),before);clean(h);
});
console.log(checks+' Home hierarchy and shared privacy checks passed. Rendered position and text scale require browser QA.');
