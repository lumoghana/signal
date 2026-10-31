/* Independent student-session regressions: promises, navigation and exports. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const settle=h=>{h.flushHistory();h.flush();};
function fixture(){
 const h=createHarness({clock:true,deferHistory:true}),L=h.L;L.explore();
 Object.assign(L.state,{balance:1000,goals:[],chats:[],allowance:{amount:0,date:'',source:'Family'},essentials:[{id:'food',name:'Food',amount:200,paid:0,externalPaid:0,coverageVersion:1}],planSaved:true,paymentDraft:null});
 L.state.planHorizon={mode:'date',date:new h.context.Date(h.context.Date.now()+10*86400000).toISOString().slice(0,10)};
 L.state.txs=[1,2,3].map(n=>({id:'t'+n,type:'out',status:'success',amount:20,fee:0,name:'Campus meal',category:'Food',date:new h.context.Date(h.context.Date.now()-n*86400000).toISOString()}));
 L.openTab('home');settle(h);return h;
}
const funds=L=>JSON.stringify({balance:L.state.balance,accounts:L.state.accounts,txs:L.state.txs,essentials:L.state.essentials,goals:L.state.goals});

test('Home spending context opens a usable daily guide from Budget dates without requiring an allowance date',()=>{
 const h=fixture(),{L}=h,before=funds(L);assert.equal(L.monoConversation.current().question,'What can I spend each day?');
 assert.equal(L.monoConversation.open(),true);settle(h);const reply=L.state.chats.at(-1);
 assert.equal(L.route,'chat');assert.match(reply.headline,/GH₵72\.72 a day/);assert.match(reply.support,/GH₵800\.00.*11 days/);
 assert.equal(reply.route,'spendingOutlook');assert(!/expect your next allowance|at this pace/.test(reply.text));
 assert.match(reply.calculation.notes.join(' '),/not a prediction/);assert.equal(funds(L),before);assert.deepEqual(h.errors,[]);
});

test('seven-day chart explains partial calendar days beside the visible graph while preserving its total',()=>{
 const h=fixture(),{L}=h;L.go('moneyStoryHome');settle(h);
 const root=h.document.getElementById('view'),note=root.querySelector('.mono-story-window-note');assert(note);assert(!note.closest('details'));
 assert.match(note.textContent,/First day and today may be partial/);assert.equal(root.querySelector('[data-chart-total]').getAttribute('data-chart-total'),'60');
 L.go('homeMoneyStory',{days:30});settle(h);assert.equal(h.document.getElementById('view').querySelector('.mono-story-window-note'),null);assert.deepEqual(h.errors,[]);
});

test('both personal-code QR entries use current accessible close names and return through native history',()=>{
 const h=fixture(),{L}=h;L.qr.open({mode:'code',autoCamera:false});settle(h);
 assert.equal(h.document.getElementById('task-sheet-title').textContent,'QR payments');
 assert.equal(h.document.querySelector('.task-sheet-layer[data-task-route="campusPay"]>.task-sheet-backdrop').getAttribute('aria-label'),'Close QR');
 assert.equal(h.document.querySelector('.qr-hub-close').getAttribute('aria-label'),'Close QR');
 L.qr.close();settle(h);assert.equal(L.route,'home');assert.equal(h.history.state.route,'home');
 L.go('myQr');settle(h);assert.equal(h.document.querySelector('.task-sheet-layer[data-task-route="myQr"]>.task-sheet-backdrop').getAttribute('aria-label'),'Close QR');
 assert.deepEqual(h.errors,[]);
});

test('ambassador guide names the shipped Menu path and opens a camera-free sample merchant',()=>{
 const h=fixture(),{L}=h;L.go('ambassadorGuide');settle(h);const root=h.document.getElementById('view');
 assert.match(root.textContent,/Menu → Help & support → Share feedback/);assert(!root.textContent.includes('Use You →'));
 assert.match(root.textContent,/Enter merchant code.*AK01/);const sample=[...root.querySelectorAll('button')].find(b=>b.textContent==='Open sample merchant');assert(sample);sample.click();settle(h);
 assert.equal(L.route,'campusPay');assert.equal(L.params.qrSample,true);assert.match(h.document.getElementById('view').textContent,/Read sample QR/);assert.deepEqual(h.errors,[]);
});

test('authenticated data export includes displayed choices and committed planning context without draft or PIN secrets',()=>{
 const h=fixture(),{L}=h,downloads=[];L.state.profile.pin='654321';L.state.prefs.payment=false;L.state.allowance={amount:400,date:'2099-02-01',source:'Family'};
 L.state.budgetPeriodRecord={start:'2026-10-01',costIds:['food'],createdAt:'2026-10-01T10:00:00Z',source:'created'};
 L.state.paymentDraft={pin:'DO-NOT-EXPORT-PAYMENT-PIN'};L.state.setup.draftPin='DO-NOT-EXPORT-SETUP-PIN';L.state.formDrafts={secret:'DO-NOT-EXPORT-FORM'};
 L.download=(name,content)=>downloads.push({name,data:JSON.parse(content)});L.go('dataExport');settle(h);
 assert.match(h.document.getElementById('view').textContent,/Chat, group records.*Unfinished drafts, PINs, verification codes/);
 h.set('authPin','111111');L.acct.downloadData();assert.equal(downloads.length,0);
 h.set('authPin','654321');const before=funds(L);L.acct.downloadData();assert.equal(downloads.length,1);const data=downloads[0].data;
 assert.equal(data.preferences.moneyUpdates,false);assert.equal(data.planning.expectedMoney.amount,400);assert.equal(data.planning.period.date,L.state.planHorizon.date);assert.equal(data.planning.periodRecord.start,'2026-10-01');
 assert.equal(data.profile.pin,undefined);assert(!/654321|DO-NOT-EXPORT/.test(JSON.stringify(data)));assert.equal(h.document.getElementById('authPin').value,'');assert.equal(funds(L),before);assert.deepEqual(h.errors,[]);
});
