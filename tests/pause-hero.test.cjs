/* Signature Pause guarantees through the shipped index and mounted task surface.
   These are DOM/interaction and Web Animations API checks, not visual layout QA. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let count=0;
const check=(name,run)=>{run();count++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
const hero=h=>view(h).querySelector('[data-pause-hero]');
const simple=h=>!!h.L.monoPause&&!!view(h).querySelector('.mono-pause-simple');
const comparison=h=>simple(h)?view(h).querySelector('.mono-pause-why'):hero(h);
const disclosure=h=>view(h).querySelector(simple(h)?'.mono-pause-why':'.pause-calculation');
function character(h){
 const root=hero(h),face=root.querySelector('.mono-pause-face');
 assert(face,'Lumo is the prominent Pause character');
 assert.equal(face.querySelector('img').getAttribute('src'),'/brand/lumo-avatar-icon-512.png');
 assert(face.hasAttribute('data-pause-ring'),'Native finite pulse belongs to the exact avatar');
 assert(root.querySelector('.mono-pause-hand'),'The approved raised-palm character expresses Pause');
 assert.equal(root.querySelector('.pause-money-stage'),null,'Competing banknote diagram is removed');
 assert(face.closest('[aria-hidden="true"]'),'Decorative character is excluded from screen-reader content');
 return face;
}
const financial=L=>JSON.stringify([L.state.balance,L.state.txs,L.state.essentials,L.state.goals,L.state.allowance]);
function fixture(options={}){
 const h=createHarness({clock:true,...options}),{L}=h;
 // The normal harness records frames but not cancellation. Wrap that API here
 // to check interruption without altering production or the shared test helper.
 const animate=h.context.Element.prototype.animate;
 h.context.Element.prototype.animate=function(frames,options){
  const result=animate.call(this,frames,options),entry=h.animations[h.animations.length-1],cancel=result.cancel;
  entry.cancelled=false;result.cancel=function(){entry.cancelled=true;return cancel?.call(this);};return result;
 };
 L.explore();L.ensureAccounts();Object.assign(L.state,{balance:500,txs:[],paymentDraft:null,
  essentials:[{id:'food',name:'Food',amount:250,paid:0},{id:'transport',name:'Transport',amount:100,paid:0}],
  goals:[{id:'laptop',name:'Laptop',target:3000,allocated:100,boxVersion:2}],allowance:{amount:0,date:''},chats:[]});
 assert.equal(L.state.accounts.version,2);assert.equal(L.accountBalances().savings,100);assert.equal(L.accountBalances().total,600);
 L.route='home';L.params={};L.history=[];L.render();h.flush();L.save();
 return h;
}
function click(h,action){
 const button=view(h).querySelectorAll('button').find(el=>el.getAttribute('onclick')===action);
 assert(button,'Missing action '+action+' on '+h.L.route);
 if(action==='L.resumeFromPause()')h.advance(3900);
 assert(!button.disabled,'Action remains reachable: '+action);button.click();if(action==='L.resumeFromPause()')h.advance(90);h.flush();return button;
}
function submit(h){const button=view(h).querySelector('button[type="submit"]');assert(button);button.click();h.flush();}
function entry(h,amount,essentialId=''){
 h.L.openPayTab('campus');h.flush();click(h,"L.pickMerchant('AK01')");
 h.set('payment-amount',amount);h.set('payment-essential',essentialId);h.flush();
 assert.equal(h.L.route,'send');return h.L.planImpactSummary(h.L.state.paymentDraft);
}
function review(h){submit(h);assert.equal(h.L.route,h.L.paymentNeedsPause(h.L.state.paymentDraft)?'pause':'paymentReview');}
function pause(h,amount=280,essentialId=''){entry(h,amount,essentialId);review(h);assert.equal(h.L.route,'pause');assert(hero(h));return hero(h);}
function heroAnimations(h,since=0){return h.animations.slice(since).filter(item=>item.element.closest?.('[data-pause-hero]'));}
function slips(h,since=0){return heroAnimations(h,since).filter(item=>item.element.hasAttribute('data-money-slip'));}
function noErrors(h){assert.deepEqual(h.errors,[]);}

check('GH₵280 Pause keeps its real conclusion and single essentials comparison',()=>{
 const h=fixture(),root=pause(h),text=view(h).textContent;
 assert(text.includes('Food and transport would be GH₵130.00 short.'));
 assert.equal(view(h).querySelectorAll('.pause-comparison-values').length,1);
 if(simple(h)){
  character(h);assert(!comparison(h).hasAttribute('open'),'Arithmetic is retained in closed See why');
  assert.equal(h.L.pauseComparison(h.L.planImpactSummary()).kind,'essentials');
 }else assert.equal(root.getAttribute('data-comparison-kind'),'essentials');
 assert(comparison(h).querySelector('.pause-comparison-before').textContent.includes('350.00'));
 assert(comparison(h).querySelector('.pause-comparison-after').textContent.includes('220.00'));
 assert(!text.includes('uncovered after essentials'),'Funded savings are not a second operational commitment');assert.equal(h.L.accountBalances().savings,100);
 assert(text.includes('Nothing sent yet.'));assert(text.toLowerCase().includes('projected'));
 assert.equal(h.L.state.balance,500);assert.equal(h.L.state.txs.length,0);
 assert(disclosure(h));noErrors(h);
});

check('Pause uses one finite decorative movement with no financial text tween',()=>{
 const h=fixture(),before=financial(h.L);pause(h);
 const root=hero(h),money=root.querySelectorAll('[data-money-slip]'),effects=heroAnimations(h);
 assert(money.length>0,'Native phase markers remain available');assert(effects.length>0,'Hero actually animates');
 assert(slips(h).length>0,'Native reveal phase runs in the working prototype');
 if(simple(h)){character(h);assert.equal(money.length,1);assert(money[0].hasAttribute('hidden'),'Clock sentinel is never a visible banknote');assert(effects.some(effect=>effect.element.classList.contains('mono-pause-face')),'The exact avatar receives the finite pulse');}
 for(const slip of money){assert(!/\d|GH₵/.test(slip.textContent),'Moving shapes carry no invented denomination');assert(slip.closest('[aria-hidden="true"]'),'Decorative money is excluded from screen-reader content');}
 for(const effect of effects){
  assert(effect.options.duration>0&&effect.options.duration<=3000,'Finite purposeful animation');
  assert((effect.options.duration||0)+(effect.options.delay||0)<=3000,'No prolonged wait or stagger');
  assert(effect.options.iterations===undefined||effect.options.iterations===1,'No repeating loop');
  assert(effect.frames.every(frame=>frame.textContent===undefined&&frame.innerHTML===undefined&&frame.value===undefined),'Motion cannot invent or tween money values');
 }
 assert.equal(financial(h.L),before);assert(h.L.pauseHeroRules);noErrors(h);
});

check('the native reveal boundary stays at 900ms without a global easing time warp',()=>{
 const h=fixture();pause(h);const movement=slips(h);assert.equal(movement.length,simple(h)?1:3);
 for(const effect of movement){const arrival=effect.frames.find(frame=>/translateX\(0\)/.test(frame.transform||''));assert(arrival&&Number.isFinite(arrival.offset),'Money has an explicit arrival boundary');const actual=(effect.options.delay||0)+effect.options.duration*arrival.offset;assert(Math.abs(actual-900)<.0001,'Every staggered note arrives at900ms');assert.equal(effect.options.easing,'linear','Global time progression must not bring the arrival frame forward');}
 if(simple(h)){
  const hold=view(h).querySelector('[data-pause-hold]'),insight=view(h).querySelector('.focus-pause-insight');
  assert.equal(insight.getAttribute('aria-hidden'),'true');h.advance(899);assert.equal(insight.getAttribute('aria-hidden'),'true');
  h.advance(1);assert.equal(insight.getAttribute('aria-hidden'),'false');assert.equal(hold.getAttribute('aria-disabled'),'true');
  h.advance(2999);assert.equal(hold.getAttribute('aria-disabled'),'true');h.advance(1);assert.notEqual(hold.getAttribute('aria-disabled'),'true');
 }
 noErrors(h);
});
check('The Pause character or legacy clarity lens does not hold notes or imply a recipient',()=>{
 const h=fixture(),root=pause(h);
 if(simple(h)){
  character(h);assert(root.querySelector('h1').textContent.includes('Food and transport'));
  const isolated=h.L.pauseComparisonMarkup(h.L.planImpactSummary());assert(isolated.includes('data-ring-role="clarity-lens"'));assert(isolated.includes('data-pause-symbol-kind="food-transport"'),'Isolated legacy renderer retains the relevant symbol');
 }else{
  assert.equal(root.querySelector('[data-ring-role]').getAttribute('data-ring-role'),'clarity-lens');
  assert.equal(root.querySelector('[data-pause-symbol]').getAttribute('data-pause-symbol-kind'),'food-transport');
 }
 assert.equal(root.querySelector('.pause-money-destination'),null,'There is no transfer destination in a proposed effect');
 for(const animation of slips(h)){
  const arrival=animation.frames.find(frame=>/translateX\(0\)/.test(frame.transform||''));
  assert.equal(arrival.opacity,0,'The notes dissolve at arrival, leaving the relevant cost in focus');
  assert.equal(animation.frames.at(-1).opacity,0,'Lumo never depicts keeping a stack of money');
 }
 noErrors(h);
});
for(const [name,kind]of [['Food','food'],['Transport','transport'],['Fees','planned-cost']])check('A '+name+' consequence uses only its relevant symbol',()=>{
 const h=fixture();h.L.state.essentials=[{id:'cost',name,amount:350,paid:0}];
 const root=pause(h);
 if(simple(h)){character(h);assert(root.querySelector('h1').textContent.includes(name));assert(h.L.pauseComparisonMarkup(h.L.planImpactSummary()).includes('data-pause-symbol-kind="'+kind+'"'),'The isolated legacy renderer retains its relevant symbol');}
 else assert.equal(root.querySelector('[data-pause-symbol]').getAttribute('data-pause-symbol-kind'),kind);noErrors(h);
});
check('Continue observes the minimum and brief hold, then opens separate PIN without debit',()=>{
 const h=fixture();pause(h);const before=financial(h.L),moving=heroAnimations(h);
 click(h,'L.resumeFromPause()');assert.equal(h.L.route,'authorize');
 assert.equal(financial(h.L),before);assert.equal(h.L.state.txs.length,0);
 assert.equal(hero(h),null);assert(moving.every(effect=>effect.cancelled),'Leaving Pause stops its animation');
 h.set('payment-pin','123456');submit(h);assert.equal(h.L.route,'paymentResult');
 assert.equal(h.L.state.balance,220);assert.equal(h.L.state.txs.length,1);assert.equal(h.L.state.txs[0].status,'success');assert.equal(h.L.accountBalances().savings,100);
 assert.equal(hero(h),null);noErrors(h);
});

check('Editing during motion keeps the draft and refreshes the consequence',()=>{
 const h=fixture();pause(h);const name=h.L.state.paymentDraft.name,before=financial(h.L),effects=heroAnimations(h);
 click(h,"L.pauseAction('edit_amount')");assert.equal(h.L.route,'send');
 assert.equal(h.document.getElementById('payment-amount').value,'280');assert.equal(h.L.state.paymentDraft.name,name);
 assert.equal(financial(h.L),before);assert(effects.every(effect=>effect.cancelled));
 h.set('payment-amount',80);assert(view(h).textContent.includes('GH₵70.00'));
 review(h);click(h,'L.continuePayment()');assert.equal(h.L.route,'authorize');assert.equal(hero(h),null);noErrors(h);
});

check('Task exit during Pause asks about the draft and cannot authorise or debit',()=>{
 const h=fixture();pause(h);const before=financial(h.L),effects=heroAnimations(h);
 // Test the native cancellation guard directly on Signal pages, whose header has Back rather than X.
 if(h.L.signalEdition)h.L.closeTask();else h.document.querySelector('.task-sheet-close').click();h.flush();
 assert.equal(h.L.route,'paymentCancel');assert.equal(financial(h.L),before);assert.equal(hero(h),null);
 assert(effects.every(effect=>effect.cancelled));click(h,'L.discardPayment()');
 assert.equal(h.L.state.paymentDraft,null);assert.equal(h.L.state.balance,500);assert.equal(h.L.state.txs.length,0);noErrors(h);
});

for(const [amount,available,room]of [[80,420,70],[140,360,10]])check('GH₵'+amount+' keeps the existing noninterrupting rule and calculation',()=>{
 const h=fixture(),impact=entry(h,amount);assert.equal(impact.after,available);assert.equal(impact.room,room);
 assert.equal(impact.engineDecision.triggered,false);review(h);assert.equal(hero(h),null);
 click(h,'L.continuePayment()');assert.equal(h.L.route,'authorize');assert.equal(hero(h),null);
 assert.equal(h.L.state.balance,500);h.set('payment-pin','123456');submit(h);
 assert.equal(h.L.state.balance,available);assert.equal(h.L.balances().room,room);assert.equal(h.L.accountBalances().savings,100);noErrors(h);
});

check('A linked GH₵80 planned cost is fulfilled once without an extra Pause',()=>{
 const h=fixture(),impact=entry(h,80,'food');assert.equal(impact.after,420);assert.equal(impact.essentialsAfter,270);assert.equal(impact.room,150);
 review(h);click(h,'L.continuePayment()');assert.equal(h.L.route,'authorize');assert.equal(hero(h),null);
 h.set('payment-pin','123456');submit(h);assert.equal(h.L.state.balance,420);assert.equal(h.L.balances().essentials,270);assert.equal(h.L.balances().room,150);
 assert.equal(h.L.state.txs.length,1);assert.equal(h.L.state.essentials[0].paid,80);assert.equal(h.L.accountBalances().savings,100);noErrors(h);
});

check('A covered behavioural Pause uses spending room instead of inventing a shortfall',()=>{
 const h=fixture();entry(h,80);const d=h.L.state.paymentDraft;
 h.L.state.txs=Array.from({length:3},(_,i)=>({id:'previous-'+i,type:'out',status:'success',amount:1,fee:0,date:new Date(Date.now()-60000*(i+1)).toISOString(),method:'campus',destination:d.destination,recipientKey:h.L.pauseEngine.recipientKey(d)}));
 const decision=h.L.pauseEngine.evaluate(d);assert(decision.triggered);assert.equal(decision.planImpact,null);
 review(h);assert.equal(h.L.route,'pause');const root=hero(h);assert(root);
 if(simple(h)){character(h);assert.equal(h.L.pauseComparison(h.L.planImpactSummary()).kind,'room');}
 else assert.equal(root.getAttribute('data-comparison-kind'),'room');
 assert(comparison(h).querySelector('.pause-comparison-before').textContent.includes('150.00'));assert(comparison(h).querySelector('.pause-comparison-after').textContent.includes('70.00'));
 assert.equal(h.L.state.balance,500);noErrors(h);
});

check('legacy goal comparison still renders explicit allocation coverage without touching funded savings',()=>{
 const h=fixture(),{L}=h,before=financial(L);
 // This renderer retains compatibility with old unsplit projection data. The
 // actual customer fixture above always uses two separately funded accounts.
 const legacy={...L.state,balance:600,accounts:undefined},d={id:'legacy-projection',method:'campus',name:'Sample purchase',destination:'AK01',amount:200,fee:0};
 const impact=L.planImpactSummary(d,legacy);L.route='pause';L.state.paymentDraft=d;
 view(h).innerHTML=L.pauseComparisonMarkup(impact);const root=hero(h);
 assert.equal(root.getAttribute('data-comparison-kind'),'goals');
 assert.equal(root.querySelector('[data-pause-symbol]').getAttribute('data-pause-symbol-kind'),'laptop');
 assert(root.querySelector('.pause-comparison-before').textContent.includes('100.00'));assert(root.querySelector('.pause-comparison-after').textContent.includes('50.00'));
 assert.equal(impact.headline,'Money set aside for Laptop would be GH₵50.00 short.');assert.equal(financial(L),before);assert.equal(L.accountBalances().savings,100);noErrors(h);
});

check('Replay is explicit and does not duplicate financial data or exposure events',()=>{
 const h=fixture();pause(h);const before=financial(h.L),shown=h.L.state.pauseEvents.filter(event=>event.action==='shown').length,at=h.animations.length;
 assert.equal(typeof h.L.replayPauseProjection,'function');h.L.replayPauseProjection();h.flush();
 assert(slips(h,at).length>0,'Explicit replay restarts the native phase');assert.equal(financial(h.L),before);
 if(simple(h)){assert(heroAnimations(h,at).some(effect=>effect.element.classList.contains('mono-pause-face')),'Explicit replay restarts the avatar pulse');assert.equal(view(h).querySelector('[data-pause-replay]'),null,'Replay does not add a competing visible control');}
 assert.equal(h.L.state.pauseEvents.filter(event=>event.action==='shown').length,shown);noErrors(h);
});

check('Unchanged rerender and disclosure do not replay the signature automatically',()=>{
 const h=fixture();pause(h);const at=h.animations.length,shown=h.L.state.pauseEvents.filter(event=>event.action==='shown').length;
 h.L.render();h.flush();assert(hero(h));assert.equal(slips(h,at).length,0,'Same decision does not demand attention repeatedly');
 if(simple(h))assert.equal(heroAnimations(h,at).filter(effect=>effect.element.classList.contains('mono-pause-face')).length,0,'The same decision does not restart its avatar pulse');
 const details=disclosure(h);details.setAttribute('open','');details.dispatchEvent(new h.Event('toggle'));h.flush();
 assert.equal(slips(h,at).length,0);assert.equal(h.L.state.pauseEvents.filter(event=>event.action==='shown').length,shown);noErrors(h);
});

check('Changed amount creates a fresh projection and honest exposure',()=>{
 const h=fixture();pause(h);click(h,"L.pauseAction('edit_amount')");h.set('payment-amount',300);const at=h.animations.length;review(h);
 assert.equal(h.L.route,'pause');assert(slips(h,at).length>0);
 if(simple(h))assert(heroAnimations(h,at).some(effect=>effect.element.classList.contains('mono-pause-face')),'A changed projection receives its own finite avatar pulse');
 assert(view(h).textContent.includes('Food and transport would be GH₵150.00 short.'));
 assert.equal(h.L.state.pauseEvents.filter(event=>event.action==='shown').length,2);assert.equal(h.L.state.balance,500);noErrors(h);
});

check('Reduced motion keeps the same facts and uses the same minimum before PIN',()=>{
 const h=fixture({reducedMotion:true});pause(h);const root=hero(h);
 assert.equal(root.getAttribute('data-motion-state'),'reduced');assert.equal(heroAnimations(h).length,0);
 if(simple(h))character(h);
 assert(comparison(h).querySelector('.pause-comparison-after').textContent.includes('220.00'));
 h.L.replayPauseProjection();assert.equal(heroAnimations(h).length,0);
 click(h,'L.resumeFromPause()');assert.equal(h.L.route,'authorize');assert.equal(h.L.state.balance,500);noErrors(h);
});

for(const interruption of ['hidden','preference'])check(interruption+' cancels current motion without altering the projected facts',()=>{
 const h=fixture();pause(h);const root=hero(h),before=financial(h.L),effects=heroAnimations(h);assert(effects.length);
 if(interruption==='hidden'){h.document.hidden=true;h.document.dispatchEvent(new h.Event('visibilitychange'));}
 else{h.media.matches=true;h.media.dispatchEvent(new h.Event('change'));}
 assert(effects.every(effect=>effect.cancelled),'All hero effects stop');assert.equal(financial(h.L),before);
 assert(comparison(h).querySelector('.pause-comparison-after').textContent.includes('220.00'));
 const at=h.animations.length;h.L.replayPauseProjection();assert.equal(heroAnimations(h,at).length,0);
 assert(['static','settled','reduced'].includes(root.getAttribute('data-motion-state')));noErrors(h);
});

check('The early visual sample stays separate from the live payment hero and account state',()=>{
 const h=fixture(),before=JSON.stringify(h.L.state);h.L.go('samplePause');h.flush();
 const intro=view(h).querySelector('.pause-intro[data-pause-intro]');assert(intro);assert.equal(hero(h),null);assert.match(intro.textContent,/sample|example/i);
 assert.equal(JSON.stringify(h.L.state),before);h.L.pauseIntro.replay();h.flush();assert.equal(JSON.stringify(h.L.state),before);
 assert.equal(h.L.state.paymentDraft,null);assert.equal(h.L.pauseIntro.commitmentImpact().shortfall,30);assert.match(intro.querySelector('[data-intro-shortfall]').textContent,/30\.00 short/);assert.match(intro.textContent,/next week’s food/i);noErrors(h);
});

for(const outcome of ['Pending','Failed'])check(outcome+' result never reuses the projected-money hero',()=>{
 const h=fixture({testing:true});pause(h);click(h,'L.resumeFromPause()');h.set('payment-pin','123456');h.set('payment-outcome',outcome);submit(h);
 assert.equal(h.L.route,'paymentResult');assert.equal(h.L.state.txs[0].status,outcome.toLowerCase());assert.equal(h.L.state.balance,500);assert.equal(hero(h),null);
 const at=h.animations.length;h.L.replayPauseProjection();assert.equal(heroAnimations(h,at).length,0);
 assert.equal(h.L.state.txs.length,1);noErrors(h);
});
console.log(count+' signature Pause checks passed.');
