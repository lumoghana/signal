// Baseline journey and ledger regression. task-sheet.test.cjs exercises the mounted task interface.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const dir=require('path').join(__dirname,'../dist/');
// Keep journey scoring independent of the wall clock; late-night rules have their own engine fixtures.
const fixedNow=globalThis.Date.parse('2026-10-19T12:00:00Z');
const Date=class extends globalThis.Date{constructor(...args){super(...(args.length?args:[fixedNow]));}static now(){return fixedNow;}};
const errors=[],store=new Map(),els=new Map();
const decode=s=>String(s||'').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
class El {constructor(id){this.id=id;this.value='';this.checked=false;this.hidden=false;this.textContent='';this.classList={add(){},remove(){},toggle(){}};this.style={};this.dataset={};}set innerHTML(x){this._html=x;if(this.id==='view'){for(const id of [...els.keys()])if(!['view','app','nav','toast'].includes(id))els.delete(id);for(const m of x.matchAll(/<(input|select|textarea|div|form|button)\b([^>]*\bid="([^"]+)"[^>]*)>([\s\S]*?)(?=<\/\1>|$)/g)){const e=new El(m[3]),attrs=m[2];if(m[1]==='input')e.value=decode(attrs.match(/\bvalue="([^"]*)"/)?.[1]||'');if(m[1]==='select'){const choices=[...m[4].matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)];const c=choices.find(c=>/\bselected\b/.test(c[1]))||choices[0];e.value=decode(c?.[1].match(/\bvalue="([^"]*)"/)?.[1]??c?.[2]??'');}e.checked=/\bchecked\b/.test(attrs);els.set(e.id,e);}for(const m of x.matchAll(/<input\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const e=new El(m[2]);e.value=decode(m[1].match(/\bvalue="([^"]*)"/)?.[1]||'');e.checked=/\bchecked\b/.test(m[1]);els.set(e.id,e);}for(const m of x.matchAll(/<select\b([^>]*\bid="([^"]+)"[^>]*)>([\s\S]*?)<\/select>/g)){const e=new El(m[2]);const choices=[...m[3].matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)];const c=choices.find(c=>/\bselected\b/.test(c[1]))||choices[0];e.value=decode(c?.[1].match(/\bvalue="([^"]*)"/)?.[1]??c?.[2]??'');els.set(e.id,e);}}}get innerHTML(){return this._html||'';}querySelectorAll(){return [];}querySelector(){return null;}setAttribute(){}scrollIntoView(){}scrollTo(){}dispatchEvent(){}appendChild(){}click(){}remove(){} }
for(const id of ['view','app','nav','toast'])els.set(id,new El(id));
const doc={getElementById:id=>els.get(id)||null,hidden:true,documentElement:new El('html'),addEventListener(){},querySelector:()=>null,body:new El('body'),createElement:tag=>new El(tag),querySelectorAll:()=>[]};
const ctx={window:null,document:doc,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},navigator:{clipboard:{writeText:async()=>{}}},location:{origin:'https://test.example',pathname:'/',search:'?testing=1',hash:''},confirm:()=>true,console:{error:e=>errors.push(String(e)),log:console.log},setTimeout:()=>0,clearTimeout:()=>{},URLSearchParams,URL:{createObjectURL:()=>'',revokeObjectURL(){}},Blob,Event:class{},Date,Math};ctx.matchMedia=()=>({matches:true,addEventListener(){}});ctx.window=ctx;ctx.scrollTo=()=>{};ctx.addEventListener=()=>{};vm.createContext(ctx);
for(const file of ['core.js','onboarding.js','pause-engine.js','plan-impact.js','mobile-network.js','payments.js','account.js','plan-setup.js','pause.js','motion.js','illustrations.js','app.js','compact.js','focus.js','chat-coach.js','plan-benefit.js','decision-system.js','clarity-art.js','clarity-pause.js','expressive-art.js','bold-system.js','campus-art.js','pause-hero.js','payment-balance.js','pause-interaction.js','ambassador.js'])vm.runInContext(fs.readFileSync(dir+file,'utf8'),ctx,{filename:file});
const L=ctx.L;
for(const route of ['home','plan','chat','more','balances','story','allowance','essentials','goal','goals','makeRoom','missions','notifications','testing','feedback'])if(!L.views[route])L.views[route]=()=>'<p>Root stub</p>';
const set=(id,v,checked)=>{const x=els.get(id);assert(x,'Missing field '+id+' on '+L.route);x.value=String(v);if(checked!==undefined)x.checked=checked;};
const render=(route,params={})=>{L.route=route;L.params=params;L.render();};
const clickCode=()=>{for(const m of els.get('view').innerHTML.matchAll(/\b(?:onclick|onchange|onsubmit|oninput)="([^"]*)"/g)){const js=decode(m[1]);try{new vm.Script(js);}catch(e){errors.push('Inline syntax '+L.route+': '+e.message+' / '+js);}}};

const html=()=>els.get('view').innerHTML;
const snap=()=>JSON.stringify({balance:L.state.balance,txs:L.state.txs,essentials:L.state.essentials,goals:L.state.goals,draft:L.state.paymentDraft});
const payment=(amount,method='lumo')=>{L.startSend(method);if(method==='lumo')L.pickPerson('abena');else{L.sampleRecipient();L.checkRecipient();}set('payment-amount',amount);L.preparePayment();assert.equal(L.route,'paymentReview');};
const check=msg=>console.log('PASS '+msg);

const authorize=(outcome='Completed')=>{if(L.route==='pause')L.resumeFromPause();assert.equal(L.route,'authorize');set('payment-pin','123456');set('payment-outcome',outcome);L.authorizePayment();};
L.reset();L.onboarding.start();set('phoneNumber','0241230123');L.onboarding.sendCode('signup');set('verificationCode','123456');L.onboarding.verifyCode();assert.equal(L.route,'identity');set('identityPrivacy','',true);L.onboarding.beginIdentity();set('identityOutcome','approved');L.onboarding.identityCheck();L.onboarding.next();set('campusName','University of Ghana');set('campusEmail','kwame@example.com');L.onboarding.checkCampus();set('newPin','123456');L.onboarding.pinNext();set('confirmPin','123456');L.onboarding.pinConfirm();set('accountAgree','',true);set('productMessages','',false);set('accountOutcome','ready');L.onboarding.createAccount();assert.equal(L.route,'home');assert.equal(L.state.balance,0);check('illustrated signup completes with zero money');
L.explore();payment(50);L.continuePayment();assert.equal(L.route,'authorize');assert(!html().includes('PAUSE MOMENT'));authorize();assert.equal(L.state.balance,870);check('ordinary payment stays fast and debits once');
L.explore();payment(500);L.continuePayment();assert.equal(L.route,'pause');assert.equal(L.pauseEngine.evaluate(L.state.paymentDraft).score,7);assert.equal(L.pauseEngine.evaluate(L.state.paymentDraft).selected.code,'plan_goals');assert(!html().includes('also'));assert(!html().includes('unpaid essentials'));assert.equal(L.state.pauseEvents.filter(e=>e.action==='shown').length,1);L.render();L.replayPause();assert.equal(L.state.pauseEvents.filter(e=>e.action==='shown').length,1);assert.equal(L.state.balance,920);L.resumeFromPause();assert.equal(L.route,'authorize');assert.equal(L.state.pauseEvents.filter(e=>e.action==='continue_payment').length,1);authorize('Pending');const held=L.state.txs[0];assert.equal(L.state.balance,920);assert.equal(L.balances().held,500);L.authorizePayment();assert.equal(L.state.txs.filter(t=>t.draftId===held.draftId).length,1);L.settlePayment(held.id,'success');L.settlePayment(held.id,'success');assert.equal(L.state.balance,420);check('score7 shows one insight; exposure and continue logged once; pending completion remains single-debit');
L.explore();for(let i=0;i<3;i++)L.state.txs.push({id:'repeat'+i,type:'out',status:'success',amount:20,fee:0,date:new Date(Date.now()-(i+1)*3600000).toISOString(),method:'Lumo transfer',destination:'@abena.a'});payment(10);L.continuePayment();assert.equal(L.route,'pause');assert(html().includes('Abena 3 times'));assert(!html().includes('earlier today'));check('small repeated transfer pauses with only the highest-priority insight');
L.explore();payment(500);L.continuePayment();L.pauseAction('edit_amount');assert.equal(L.route,'send');assert.equal(L.state.paymentDraft.name,'Abena Asante');set('payment-amount',50);L.preparePayment();L.continuePayment();assert.equal(L.route,'authorize');assert.equal(L.state.pauseEvents.filter(e=>e.action==='edit_amount').length,1);assert.equal(L.state.balance,920);check('editing logs choice, keeps recipient and rescans the amount');
L.explore();payment(500);L.continuePayment();L.pauseAction('cancel_payment');assert.equal(L.route,'pay');assert.equal(L.state.paymentDraft,null);assert.equal(L.state.pauseEvents.filter(e=>e.action==='cancel_payment').length,1);assert.equal(L.state.pauseEvents.filter(e=>e.action==='delay_payment').length,0);assert.equal(L.state.balance,920);check('cancel leaves money untouched and records the action');
L.explore();payment(500);L.continuePayment();const kept=L.state.paymentDraft.id;L.pauseAction('delay_payment');assert.equal(L.route,'home');assert.equal(L.state.paymentDraft.id,kept);assert.equal(L.state.pauseEvents.filter(e=>e.action==='delay_payment').length,1);check('delay retains draft and logs once');
L.explore();payment(500);L.continuePayment();L.resumeFromPause();L.state.paymentDraft.fee=3;set('payment-pin','123456');L.authorizePayment();assert.equal(L.route,'paymentReview');assert.equal(L.state.balance,920);check('changed fees require fresh review before authorisation');
L.explore();payment(1000);L.continuePayment();assert.equal(L.route,'paymentReview');assert.equal(L.state.balance,920);check('funding rules remain separate from a non-blocking Pause');
L.explore();payment(85);const snapshot=JSON.stringify({balance:L.state.balance,txs:L.state.txs,draft:L.state.paymentDraft,goals:L.state.goals});for(const scenario of ['low','repeat','large','busy','normal']){L.go('pauseDemo',{scenario});L.replayPause();assert.equal(JSON.stringify({balance:L.state.balance,txs:L.state.txs,draft:L.state.paymentDraft,goals:L.state.goals}),snapshot);clickCode();}check('all five engine examples are isolated from account data');
let coverage=0;for(const route of Object.keys(L.views)){render(route,{id:'none',kind:route==='bill'?'airtime':undefined});clickCode();const source=html(),plain=source.includes('payment-result-compact')||['chatCalculation','planExplanation','planEdit','samplePause'].includes(L.route);if(!plain)assert(source.includes('scene-art')||source.includes('welcome-illustration')||source.includes('data-art='),'Illustration missing '+route);const arts=[...source.matchAll(/data-art="([^"]+)"/g)].map(m=>m[1]);assert.equal(arts.length,plain?0:1,'Task-appropriate illustration count on '+route);coverage++;}assert.equal(errors.length,0,errors.join('\n'));check('all '+coverage+' routes render with task-appropriate artwork/status and valid controls');
console.log('ALL MVP ENGINE AND EXPERIENCE CHECKS PASS');

L.explore();render('pay');
assert.equal((html().match(/data-art=/g)||[]).length,1);
for(const action of ["L.startSend('lumo')","L.startSend('momo')","L.startSend('bank')","L.go('campusPay')","L.go('requests')",...['airtime','data','electricity','water','tv','internet'].map(k=>"L.startBill('"+k+"')"),"L.go('activity')"])assert(html().includes(action),'Missing payment option '+action);
check('Pay has one illustration and all twelve payment options stay connected');
payment(50);L.editPayment();
assert(html().includes('class="optional-fields"'));
assert(html().indexOf('id="payment-amount"')<html().indexOf('class="optional-fields"'));
assert(html().includes('id="payment-note"')&&html().includes('id="payment-essential"'));
check('optional payment details expand separately from the amount and review action');
L.explore();for(let i=0;i<8;i++)L.state.txs.push({id:'page-'+i,date:new Date(Date.now()-i*1000).toISOString(),name:'Paged payment '+i,type:i%2?'in':'out',amount:i+1,fee:0,status:'success',method:'Lumo transfer'});
render('activity');assert.equal((html().match(/class="row"/g)||[]).length,4);assert(html().includes('List pages'));
const first=html();L.turnPage(1);assert.notEqual(html(),first);assert.equal(L.params.page,1);
render('activity',{filter:'in',query:'Paged payment'});assert.equal((html().match(/class="row"/g)||[]).length,4);
check('long activity is paged and filters keep working');
L.explore();render('txDetail',{id:L.state.txs[0].id});assert(html().includes('Full payment details'));assert(html().includes('Reference')&&html().includes('Total'));
check('receipts keep the cost and reference visible with metadata expandable');
render('chat');assert(html().includes('chat-thread')&&html().includes('chat-entry'));
check('Chat keeps the full conversation, suggested questions and composer connected');

// Follow the destinations from Pay and inspect the actual rendered illustration.
L.explore();const destinationArt=[];
const oneArt=()=>{const found=[...html().matchAll(/data-art="([^"]+)"/g)].map(x=>x[1]);assert.equal(found.length,1);return found[0];};
render('pay');destinationArt.push(oneArt());
L.go('campusPay');assert.equal(oneArt(),'campus-pay-v25');destinationArt.push(oneArt());
L.pickMerchant('AK01');assert.equal(oneArt(),'campus-merchant-v25');
for(const method of ['lumo','momo','bank']){L.startSend(method);assert.equal(oneArt(),method==='lumo'?'campus-transfer-v25':method==='momo'?'campus-funding-v25':'campus-bank-v25');destinationArt.push(oneArt());}
for(const kind of ['airtime','data','electricity','water','tv','internet']){L.startBill(kind);assert.equal(oneArt(),'campus-'+kind+'-v25');destinationArt.push(oneArt());}
L.go('requests');assert.equal(oneArt(),'campus-request-v25');destinationArt.push(oneArt());
assert(destinationArt.every(name=>name.startsWith('campus-')));
check('Campus Pay, transfers, requests and bills use activity-matched textile scenes over a separate Legon setting');

L.explore();const youArt=[];
for(const [route,expected] of Object.entries({profile:'profile',accountInfo:'account',security:'security',privacy:'privacy',notificationPrefs:'notifications',help:'help',testing:'testing',feedback:'feedback'})){
 render(route);assert.equal(oneArt(),'campus-'+expected+'-v25');youArt.push(oneArt());clickCode();
}
assert(youArt.every(name=>name.startsWith('campus-')));
render('devices');assert.equal(oneArt(),'campus-devices-v25');
for(const route of ['profileEdit','profilePhone','changePin','dataExport','accountTerms','statements','supportCase','caseDetail','closeAccount']){render(route);oneArt();clickCode();}
assert.equal(errors.length,0,errors.join('\n'));
check('You destinations and nested pages reuse task-specific account and device scenes without competing illustrations');

L.explore();render('pay');const beforeTabs=snap(),beforeHistory=L.history.length;
const visiblePayPanels=()=>[...html().matchAll(/<section class="pay-tab-panel" id="pay-panel-([^"]+)"([^>]*)>/g)].filter(m=>!(/\bhidden\b/.test(m[2]))).map(m=>m[1]);
assert.equal(L.payTab(),'send');assert.deepEqual(visiblePayPanels(),['send']);
for(const tab of ['campus','bills','send']){
 L.setPayTab(tab);assert.equal(L.route,'pay');assert.equal(L.payTab(),tab);assert.deepEqual(visiblePayPanels(),[tab]);
 assert(html().includes(`id="pay-tab-${tab}" role="tab" aria-selected="true"`));oneArt();clickCode();
}
assert.equal(snap(),beforeTabs);assert.equal(L.history.length,beforeHistory);
L.setPayTab('campus');L.payTabKey({key:'ArrowRight',preventDefault(){}});assert.equal(L.payTab(),'bills');
L.payTabKey({key:'Home',preventDefault(){}});assert.equal(L.payTab(),'send');
L.setPayTab('campus');set('merchant-code','AK01');L.findMerchant();assert.equal(L.route,'send');assert.equal(L.state.paymentDraft.method,'campus');
L.back();assert.equal(L.route,'pay');assert.equal(L.payTab(),'campus');assert.deepEqual(visiblePayPanels(),['campus']);
const campusDraft=snap();L.setPayTab('bills');assert.equal(snap(),campusDraft);
assert.equal(errors.length,0,errors.join('\n'));
check('Pay tabs show one list, support keyboard selection and preserve the draft and return tab');

// Focused redesign: figures come from account data, never from decorative story examples.
L.explore();L.state.txs=[
 {id:'food',type:'out',status:'success',amount:40,fee:2,category:'Food',date:new Date().toISOString()},
 {id:'data',type:'out',status:'success',amount:20,fee:0,category:'Data',date:new Date().toISOString()},
 {id:'pending',type:'out',status:'pending',amount:300,fee:0,category:'Shopping',date:new Date().toISOString()},
 {id:'incoming',type:'in',status:'success',amount:1000,fee:0,category:'Allowance',date:new Date().toISOString()},
 {id:'old',type:'out',status:'success',amount:100,fee:0,category:'Old',date:new Date(Date.now()-40*86400000).toISOString()}
];
render('story',{days:7});let story=html();assert(story.includes('Food was your biggest category.'));assert(story.includes('GH₵42.00'));assert(story.includes('68%'));assert(!story.includes('Shopping'));assert(!story.includes('GH₵1,000.00'));clickCode();oneArt();
render('story',{days:90});assert(html().includes('Old was your biggest category.'));clickCode();
L.state.txs=[];render('story');assert(html().includes('Your story<br>starts here.'));assert(!html().includes('NaN'));oneArt();
L.explore();const beforeFocus=snap();render('home');assert(html().includes('Your money story'));assert(!html().includes('pauseDemo'));assert.equal(snap(),beforeFocus);oneArt();
L.startSend('lumo');L.state.paymentDraft.name='Ama Boateng';L.state.paymentDraft.destination='@ama.b';L.state.paymentDraft.checked=true;L.state.paymentDraft.amount=600;L.state.paymentDraft.fee=0;render('paymentReview');assert(html().includes('Total to pay'));assert(html().includes('GH₵600.00'));assert(!html().includes('Projected balance'));assert(!html().includes('decision-insight'));assert(html().includes('L.continuePayment()'));oneArt();
L.continuePayment();assert.equal(L.route,'pause');assert(html().includes('Edit amount'));assert(html().includes('Continue to PIN'));assert(html().indexOf('Continue to PIN')<html().search(/<details\b[^>]*class="pause-calculation"/));assert(html().includes(L.e(L.planImpactSummary(L.state.paymentDraft).headline)));oneArt();
assert.equal(errors.length,0,errors.join('\n'));
check('Focused screens preserve balances, truthful spending periods, one illustration and the qualifying Pause path');
