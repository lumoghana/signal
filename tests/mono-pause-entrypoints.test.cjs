/* Follow the shipped entry buttons into the branded examples and real Pause.
   Static example data stays isolated; phone geometry is checked in a browser. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const view=h=>h.document.getElementById('view');
const settle=h=>{h.flushHistory();h.flush();};
const saved=h=>JSON.stringify(h.L.state);
const clean=h=>assert.deepEqual(h.errors,[]);
function fixture(options={}){const h=createHarness({clock:true,deferHistory:true,...options});h.L.render();settle(h);return h;}
function click(h,label){
 const b=view(h).querySelectorAll('button').find(b=>b.textContent.trim()===label);assert(b,'Visible '+label+' on '+h.L.route);assert(!b.disabled);assert.notEqual(b.getAttribute('aria-disabled'),'true');b.click();settle(h);return b;
}
function identity(h){
 const root=view(h).querySelector('.mono-pause-simple'),moment=root?.querySelector('.mono-pause-moment');assert(root&&moment);
 const image=moment.querySelector('.mono-pause-face img');assert(image);assert.equal(image.getAttribute('src'),'/brand/lumo-avatar-icon-512.png');assert(moment.querySelector('.mono-pause-character'));assert(moment.querySelector('.mono-pause-hand'),'The original 2D avatar has its native flat raised hand');assert.equal(moment.querySelector('.signal-pause-label').textContent,'Pause.');
 assert.equal(moment.querySelector('.mono-pause-character').getAttribute('aria-hidden'),'true');assert.equal(root.querySelectorAll('h1').length,1);
 const html=root.innerHTML;assert(html.indexOf('mono-pause-character')<html.indexOf('<h1'));assert(html.indexOf('<h1')<html.indexOf('mono-pause-payment'));
 return {root,moment,image};
}
function example(h){
 const {root}=identity(h);assert.equal(h.L.route,'samplePause');assert(root.matches('.pause-intro[data-pause-intro]'));
 assert.equal(root.querySelector('h1').textContent,'These shoes leave next week’s food GH₵30.00 short.');assert(root.querySelector('[data-intro-shortfall]'));
 assert(root.querySelector('[data-intro-amount]').textContent.includes('280.00'));assert.equal(root.querySelector('[data-pause-hero]'),null);assert.equal(root.querySelector('[data-pause-hold]'),null);assert.equal(root.querySelector('#payment-pin'),null);
 assert.equal(root.querySelector('[data-pause-intro-animation]'),null);assert.equal(h.L.taskSheet.active,false);assert.match(root.textContent,/Example story\. Nothing moves\./);return root;
}

test('the default Welcome Get started button reaches the new Lumo example and signup works immediately',()=>{
 const h=fixture(),before=saved(h);assert.equal(h.L.route,'welcome');click(h,'Get started');example(h);assert.equal(saved(h),before);assert.equal(h.L.params.intent,'signup');
 click(h,'Start sign-up');assert.equal(h.L.route,'phone');assert.equal(h.L.params.purpose,'signup');assert(h.document.getElementById('phoneNumber'));assert.equal(h.L.state.onboarded,false);assert.equal(h.L.state.txs.length,0);clean(h);
});

test('Skip example is immediate while See why exposes the real Budget calculation',()=>{
 const h=fixture();click(h,'Get started');const root=example(h),why=root.querySelector('.mono-pause-why'),before=saved(h),p=h.L.pauseIntro.commitmentImpact();
 assert(why&&!why.hasAttribute('open'));why.querySelector('summary').click();settle(h);assert(why.hasAttribute('open'));assert.equal(saved(h),before);
 for(const value of ['600.00','280.00','320.00','350.00','30.00'])assert(why.textContent.includes(value),value);
 assert.match(why.querySelector('[data-intro-summary]').textContent,/saved Budget/);assert.match(why.textContent,/Money Boxes stays unchanged/);assert.equal(p.planned-p.after,p.shortfall);assert.equal(p.moneyBoxesChanged,false);
 click(h,'Skip example');assert.equal(h.L.route,'phone');assert.equal(h.L.state.txs.length,0);clean(h);
});

test('a returning user opens the same example without exposing or changing their saved money or payment draft',()=>{
 const h=fixture(),L=h.L;L.explore();L.go('welcome');settle(h);L.state.paymentDraft={id:'keep-real-draft',method:'lumo',name:'Private recipient',destination:'@private',amount:47.32,fee:0,note:'Private payment note'};L.state.profile.displayName='Private display';L.state.balance=1234.56;L.save();const before=saved(h);
 click(h,'See a sample Pause');const root=example(h);for(const secret of ['Private recipient','Private payment note','Private display','1,234.56','@private'])assert(!root.textContent.includes(secret),secret);
 assert.equal(saved(h),before);assert.equal(root.querySelector('.sample-pause-skip'),null);click(h,'Back to Lumo');assert.equal(L.route,'home');assert.equal(L.state.paymentDraft.id,'keep-real-draft');assert.equal(saved(h),before);clean(h);
});

test('the ambassador sample entry uses the same avatar and returns to the ambassador start',()=>{
 const h=fixture();h.L.go('ambassadorWelcome');settle(h);const before=saved(h);click(h,'See a sample Pause');example(h);assert.equal(h.L.params.returnTo,'ambassadorWelcome');assert.equal(saved(h),before);
 click(h,'Back to the start');assert.equal(h.L.route,'ambassadorWelcome');assert.equal(saved(h),before);clean(h);
});

test('all tester scenarios use the same Lumo presentation and preserve their own isolated rule facts',()=>{
 const h=fixture({testing:true}),L=h.L;L.explore();L.state.paymentDraft={id:'retained-private-draft',method:'lumo',name:'Private recipient',amount:91,fee:0};L.save();const before=saved(h);
 L.go('pauseDemo',{scenario:'low'});settle(h);
 const scenarios=[['low','Low balance',/GH₵30\.00/,/10 \/ 5/],['repeat','Repeat transfers',/Ama 3 times/,/5 \/ 5/],['large','Large share',/more than half/,/7 \/ 5/],['busy','Busy day',/GH₵225\.00 today/,/5 \/ 5/],['normal','Everyday payment',/goes straight to authorisation/,/0 \/ 5/]];
 for(const [key,label,title,rule]of scenarios){
  if(key!=='low'){const why=view(h).querySelector('.mono-pause-why');why.querySelector('summary').click();settle(h);click(h,label);}
  assert.equal(L.params.scenario,key);const {root}=identity(h),why=root.querySelector('.mono-pause-why');assert(root.classList.contains('mono-pause-tester'));assert.match(root.querySelector('h1').textContent,title);
  assert(why&&!why.hasAttribute('open'));assert.match(why.textContent,rule);assert.equal(root.querySelector('[data-pause-hold]'),null);assert.equal(root.querySelector('#payment-pin'),null);assert(!root.textContent.includes('Private recipient'));assert.equal(saved(h),before);
 }
 click(h,'Back to Home');assert.equal(L.route,'home');assert.equal(saved(h),before);clean(h);
});

test('tester-only scenarios remain unavailable in the ordinary app',()=>{
 const h=fixture(),L=h.L;L.explore();const before=saved(h);L.go('pauseDemo',{scenario:'low'});settle(h);
 assert.equal(L.testMode,false);assert.equal(view(h).querySelector('.mono-pause-tester'),null);assert.equal(view(h).querySelector('.pause-demo-chips'),null);assert.equal(saved(h),before);clean(h);
});

test('the real payment Pause shares the exact example avatar while retaining its separate decision and authorisation gate',()=>{
 const h=fixture({reducedMotion:true});click(h,'Get started');const publicAsset=identity(h).image.getAttribute('src');example(h);assert.equal(h.L.pauseIntro.replay(),false);
 const L=h.L;L.explore();L.ensureAccounts();Object.assign(L.state,{balance:600,txs:[],goals:[],essentials:[{id:'food',name:'Food',amount:400,paid:0}],paymentDraft:null});L.openPayTab('campus');L.pickMerchant('AK01');h.set('payment-amount',280);h.set('payment-essential','');L.preparePayment();settle(h);if(L.route==='paymentReview'){L.continuePayment();settle(h);}
 assert.equal(L.route,'pause');const {root,image}=identity(h);assert.equal(image.getAttribute('src'),publicAsset);assert.match(root.querySelector('h1').textContent,/Food.*GH₵80\.00 short/);assert(!root.textContent.includes('These shoes'));
 assert(root.querySelector('[data-pause-hero]'));assert(root.querySelector('[data-pause-hold]'));assert.equal(root.querySelector('[data-pause-hold]').getAttribute('aria-disabled'),'true');assert.equal(root.querySelector('#payment-pin'),null);assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,0);clean(h);
});
