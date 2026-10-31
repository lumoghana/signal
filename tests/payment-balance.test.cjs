/* Current account money remains distinct from projections in actual shipped DOM.
   These are interaction/data checks, not rendered-phone geometry checks. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let checks=0;
const check=(name,run)=>{run();checks++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
function fixture(options={}){
 const h=createHarness(options),{L}=h;L.explore();
 Object.assign(L.state,{balance:600,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:200,paid:0},{id:'transport',name:'Transport',amount:150,paid:0}],goals:[{id:'laptop',name:'Laptop',target:3500,allocated:100}],allowance:{amount:0,date:''}});
 L.route='home';L.params={};L.history=[];L.render();h.flush();assert(L.paymentBalance,'Payment-balance module is loaded by the shipped index');return h;
}
function fact(h,expected){
 if(h.L.monoPause&&h.L.route==='pause'&&view(h).querySelector('.mono-pause-simple')){
  assert.equal(view(h).querySelectorAll('[data-payment-balance]').length,0,'Simplified Pause omits the repeated foreground balance');
  const why=view(h).querySelector('.mono-pause-why');assert(why,'Current account calculation remains available under See why');
  assert(!why.hasAttribute('open'),'The optional calculation starts closed');
  const row=why.querySelectorAll('dl>div').find(item=>item.querySelector('dt')?.textContent==='Available now');
  assert(row,'Current money retains its own Available now label');assert.equal(row.querySelector('dd').textContent,h.L.money(expected));
  assert.equal(row.querySelectorAll('[data-private-value],.money-mask').length,0,'The disclosed current balance is explicitly readable');
  assert.equal(row.hidden,false);return row;
 }
 const rows=view(h).querySelectorAll('[data-payment-balance]');assert.equal(rows.length,1,'One current balance row on '+h.L.route);
 const row=rows[0];assert.equal(row.querySelector('span').textContent,'Available balance');assert.equal(row.querySelector('[data-payment-available-value]').textContent,h.L.money(expected));
 assert.equal(row.querySelectorAll('[data-private-value],.money-mask').length,0,'Payment balance is explicitly visible');assert(!row.closest('details'),'Current balance is not inside an optional disclosure');assert.equal(row.hidden,false);return row;
}
function draft(h,amount=80){const {L}=h;L.go('campusPay');L.pickMerchant('AK01');h.set('payment-amount',amount);h.set('payment-essential','');L.preparePayment();h.flush();return L.state.paymentDraft;}
function click(h,action){const b=view(h).querySelectorAll('button').find(el=>el.getAttribute('onclick')===action);assert(b,'Working '+action);b.click();h.flush();}
const clean=h=>assert.deepEqual(h.errors,[]);

check('all 20 payment, funding, request and record routes display the authoritative current balance',()=>{
 const h=fixture(),{L}=h;const d=draft(h,280);L.keepPaymentLater();h.flush();assert(!L.taskSheet.active);
 for(const route of L.paymentBalance.routes){
  L.state.paymentDraft=JSON.parse(JSON.stringify(d));L.route=route;L.params={kind:'airtime',id:'missing'};L.history=[];L.render();h.flush();
  assert.equal(L.route,route);fact(h,600);assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,0);
 }
 clean(h);
});

check('hiding Home balance does not hide payment context or reveal the retained Home',()=>{
 const h=fixture(),{L}=h;L.hidePrivateMoney();const home=view(h);assert(home.querySelector('.money-mask'));
 L.openTab('pay');h.flush();fact(h,600);L.go('campusPay');h.flush();fact(h,600);L.pickMerchant('AK01');h.flush();fact(h,600);
 L.closeTask();h.flush();assert.equal(L.route,'paymentCancel');fact(h,600);L.discardPayment();h.flush();L.openTab('home');h.flush();assert(view(h).querySelector('.money-mask'));assert(!view(h).querySelector('[data-payment-balance]'));clean(h);
});

check('entry, Review and PIN retain GH₵600 until a successful GH₵80 payment confirms GH₵520',()=>{
 const h=fixture(),{L}=h;L.go('campusPay');fact(h,600);L.pickMerchant('AK01');fact(h,600);h.set('payment-amount',80);L.preparePayment();fact(h,600);click(h,'L.continuePayment()');assert.equal(L.route,'authorize');fact(h,600);
 h.set('payment-pin','123456');h.submit(view(h).querySelector('form'));h.flush();assert.equal(L.route,'paymentResult');fact(h,520);assert.equal(L.state.balance,520);assert.equal(L.state.txs.length,1);
 const id=L.state.txs[0].id;L.go('txDetail',{id});h.flush();fact(h,520);assert(view(h).textContent.includes(id));clean(h);
});

for(const outcome of ['Pending','Failed'])check(outcome+' results show actual available money, and a status refresh updates the same fact',()=>{
 const h=fixture({testing:true}),{L}=h;draft(h,80);click(h,'L.continuePayment()');h.set('payment-pin','123456');h.set('payment-outcome',outcome);h.submit(view(h).querySelector('form'));h.flush();assert.equal(L.route,'paymentResult');
 fact(h,outcome==='Pending'?520:600);assert.equal(L.state.balance,600);const tx=L.state.txs[0];assert.equal(tx.status,outcome.toLowerCase());
 if(outcome==='Pending'){L.resolveTx(tx.id,'failed');L.render();h.flush();fact(h,600);assert.equal(L.state.txs.length,1);}
 clean(h);
});

check('Pause labels the current GH₵600 separately from projected GH₵320',()=>{
 const h=fixture(),{L}=h;draft(h,280);assert.equal(L.route,'pause');fact(h,600);
 assert.equal(L.planImpactSummary(L.state.paymentDraft).after,320);assert(view(h).querySelector('.pause-comparison-after').textContent.includes('320.00'));assert.equal(L.state.balance,600);clean(h);
});

check('the top-up chooser has one balance fact and pending incoming funding is not spendable',()=>{
 const h=fixture(),{L}=h;L.openFunding('home');h.flush();fact(h,600);assert(!view(h).querySelector('.funding-balance'));
 L.state.fundingDraft={id:'fund',amount:100,network:'MTN MoMo',number:'0241230123',stage:'result',txId:'incoming'};
 L.state.txs=[{id:'incoming',type:'in',status:'pending',amount:100,fee:0,date:new Date().toISOString(),name:'Sample funding'}];
 L.go('momoAdd');h.flush();fact(h,600);L.resolveTx('incoming','success');L.render();h.flush();fact(h,700);assert.equal(L.state.balance,700);clean(h);
});

check('public, locked, closed, isolated sample and unrelated routes never gain a real-balance row',()=>{
 const h=fixture(),{L}=h;
 for(const patch of [{onboarded:false,locked:false,closed:false},{onboarded:true,locked:true,closed:false},{onboarded:true,locked:false,closed:true}]){
  Object.assign(L.state,patch);assert(!L.decorateView('<p>Unopened payment</p>','send').includes('data-payment-balance'));
 }
 Object.assign(L.state,{onboarded:true,locked:false,closed:false});
 for(const route of ['home','plan','chat','more','activity','samplePause'])assert(!L.decorateView('<p>Other screen</p>',route).includes('data-payment-balance'),route);
 clean(h);
});

console.log(checks+' current payment-balance checks passed.');
