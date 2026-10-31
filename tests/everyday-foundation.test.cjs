const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let n=0;const check=(name,run)=>{run();n++;console.log('PASS '+name);};
const now=Date.parse('2026-10-23T12:00:00Z');
function fixture(){
 const h=createHarness({clock:true}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,txs:[],paymentDraft:null,chats:[],essentials:[{id:'food',name:'Food',amount:350,paid:0}],goals:[{id:'laptop',name:'Laptop',allocated:100,target:3000,boxVersion:2}]});
 L.route='home';L.params={};L.history=[];L.render();h.flush();return h;
}
const draft=extra=>({id:'current',method:'campus',destination:'AK01',name:'Akua’s Kitchen',checked:true,amount:20,fee:0,essentialId:'food',...extra});
const visits=()=>[12,48,72].map((hours,i)=>({id:'visit-'+i,type:'out',status:'success',method:'Campus Pay',destination:'AK01',amount:20,fee:0,category:'Food',date:new Date(now-hours*3600000).toISOString()}));
check('covered known Budget-linked routine purchases keep repeat facts without an interrupting Pause',()=>{
 const {L}=fixture();L.state.txs=visits();const before=JSON.stringify(L.state),q=L.pauseEngine.evaluate(draft(),L.state,now);
 assert.equal(q.routineCovered,true);assert.equal(q.triggered,false);assert.equal(q.score,0);assert.equal(q.informationalSignals.length,2);assert.equal(JSON.stringify(L.state),before);
});
check('unlinked and unverified repeated payments retain the existing behavioral gate',()=>{
 const {L}=fixture();L.state.txs=visits();for(const change of [{essentialId:''},{checked:false}]){const q=L.pauseEngine.evaluate(draft(change),L.state,now);assert.equal(q.routineCovered,false);assert.equal(q.triggered,true);assert.equal(q.score,5);}
});
check('an exhausted Budget source is not treated as a covered routine payment',()=>{
 const {L}=fixture();L.state.txs=visits();L.state.essentials[0].paid=350;const q=L.pauseEngine.evaluate(draft(),L.state,now);assert.equal(q.routineCovered,false);assert.equal(q.triggered,true);
});
check('a real Budget shortfall and low balance still interrupt despite a linked routine source',()=>{
 const {L}=fixture();L.state.txs=visits();L.state.balance=360;let q=L.pauseEngine.evaluate(draft({fee:20}),L.state,now);assert(q.planImpact);assert(q.triggered);L.state.balance=60;L.state.essentials=[];q=L.pauseEngine.evaluate(draft({essentialId:''}),L.state,now);assert(q.triggered);assert.equal(q.selected.code,'low_balance');
});
check('large-share and large-payment thresholds remain active for a covered known source',()=>{
 const {L}=fixture();L.state.balance=1000;L.state.essentials[0].amount=800;const q=L.pauseEngine.evaluate(draft({amount:600}),L.state,now);assert.equal(q.score,7);assert(q.triggered);assert.equal(q.selected.code,'large_share');
});
check('registered detail destinations keep an accessible surface and native return',()=>{
 const h=fixture(),{L}=h;L.views.foundationDetail=()=>L.header('One detail','Useful context.')+L.btn('Done','L.closeTask()');assert.equal(L.taskSheet.register('foundationDetail',{family:'records',treatment:'detail',label:'One detail'}),true);
 const parent=h.document.getElementById('view');L.go('foundationDetail');h.flush();assert(L.taskSheet.active);assert.equal(L.taskSheet.treatment,'detail');assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);assert.equal(h.document.getElementById('task-sheet-title').textContent,'One detail');L.closeTask();h.flush();assert.equal(L.route,'home');assert.equal(h.document.getElementById('view'),parent);assert.deepEqual(h.errors,[]);
});
check('task extensions cannot override a registered payment route or use an invalid treatment',()=>{
 const {L}=fixture();assert.equal(L.taskSheet.register('authorize',{family:'records',treatment:'detail'}),false);assert.throws(()=>L.taskSheet.register('bad route',{family:'records',treatment:'detail'}));assert.throws(()=>L.taskSheet.register('newTask',{family:'records',treatment:'invisible'}));assert.equal(L.pauseInteractionRules.minimum,3000);assert.equal(L.pauseInteractionRules.hold,90);
});
console.log(n+' everyday foundation checks passed.');
