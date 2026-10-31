/* First-use value preview through the shipped customer UI. This harness checks
   routing, preservation and isolation, not rendered illustration geometry. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
// Match the final DOMContentLoaded paint after every shipped adapter is loaded.
function fixture(){const h=createHarness();h.L.render();h.flush();return h;}
function click(h,label){const button=view(h).querySelectorAll('button').find(el=>el.textContent.trim()===label);assert(button,'Missing '+label+' on '+h.L.route);button.click();h.flush();}
const clean=h=>assert.deepEqual(h.errors,[]);
check('Get started demonstrates a labelled, isolated Pause before asking for a phone number',()=>{
 const h=fixture(),{L}=h;assert.equal(L.route,'welcome');const before=JSON.stringify(L.state);
 assert(view(h).querySelector('.mono-welcome'));assert.match(view(h).querySelector('h1').textContent,/Your money\.Room to live\./);
 assert.equal(view(h).querySelector('.actual-wordmark').getAttribute('src'),L.signalEdition?'/assets/signal/signal-wordmark.webp':'/brand/Lumo-Wordmark-Black.svg');
 click(h,'Get started');assert.equal(L.route,'samplePause');assert.equal(L.params.intent,'signup');assert.equal(JSON.stringify(L.state),before);
 const intro=view(h).querySelector('.pause-intro[data-pause-intro]');assert(intro);const text=intro.textContent;assert.match(text,/sample|example/i);assert.match(intro.querySelector('[data-intro-amount]').textContent,/GH[₵¢]\s*280(?:\.00)?(?![\d.])/);assert.match(text,/next week’s food/i);assert.match(intro.querySelector('[data-intro-shortfall]').textContent,/30\.00 short/i);
 assert(!view(h).querySelector('#phoneNumber'));assert(!view(h).querySelector('#payment-pin'));assert(!view(h).querySelector('[data-pause-hold]'));
 click(h,'Start sign-up');assert.equal(L.route,'phone');assert.equal(L.state.balance,0);assert.equal(L.state.txs.length,0);assert.equal(L.state.onboarded,false);clean(h);
});
check('Students can skip the example from Welcome or its own surface without any financial changes',()=>{
 for(const inExample of [false,true]){const h=fixture(),before=JSON.stringify([h.L.state.balance,h.L.state.txs,h.L.state.essentials,h.L.state.goals]);if(inExample){click(h,'Get started');click(h,'Skip example');}else click(h,'Skip example and sign up');assert.equal(h.L.route,'phone');assert.equal(JSON.stringify([h.L.state.balance,h.L.state.txs,h.L.state.essentials,h.L.state.goals]),before);clean(h);}
});
check('Returning to Welcome preserves a saved signup and resumes it directly',()=>{
 const h=fixture(),{L}=h;L.state.setup.phone='0241230123';L.state.setup.drafts={campusName:'University of Cape Coast',campusEmail:'ama@example.com'};L.go('welcome');h.flush();const before=JSON.stringify(L.state.setup);
 click(h,'Continue my setup');assert.equal(L.route,'phone');assert.equal(L.params.purpose,'resume');assert.equal(JSON.stringify(L.state.setup),before);assert.equal(h.document.getElementById('phoneNumber').value,'241230123');clean(h);
});
check('Sample back and existing-account sign-in remain direct and do not reset data',()=>{
 const h=fixture(),{L}=h,before=JSON.stringify(L.state);click(h,'Get started');click(h,'Back to the start');assert.equal(L.route,'welcome');assert.equal(JSON.stringify(L.state),before);click(h,'I already have Lumo');assert.equal(L.route,'signin');assert.equal(JSON.stringify(L.state),before);clean(h);
});
check('A saved signup can view the optional sample without losing its unfinished fields',()=>{
 const h=fixture(),{L}=h;L.state.setup.phone='0241230123';L.state.setup.drafts={campusEmail:'kwame@example.com'};L.go('welcome');h.flush();const before=JSON.stringify(L.state);click(h,'See a sample Pause');assert.equal(L.route,'samplePause');assert(!L.params.intent);assert(!view(h).querySelector('.sample-pause-skip'));click(h,'Back to the start');assert.equal(L.route,'welcome');assert.equal(JSON.stringify(L.state),before);click(h,'Continue my setup');assert.equal(L.route,'phone');assert.equal(L.params.purpose,'resume');clean(h);
});
check('Getting started can preview a sample without replacing the saved signup before explicit confirmation',()=>{
 const h=fixture(),{L}=h;L.state.setup.phone='0241230123';L.state.setup.drafts={campusEmail:'saved@example.com'};L.go('welcome');h.flush();const before=JSON.stringify(L.state);
 click(h,'Explore a sample account');assert.equal(L.route,'ambassadorSample');assert.equal(JSON.stringify(L.state),before);
 assert(view(h).querySelectorAll('button').some(button=>button.textContent.trim()==='Load sample account'));
 click(h,'Go back');assert.equal(L.route,'ambassadorWelcome');assert.equal(JSON.stringify(L.state),before);clean(h);
});
console.log(passed+' value-first Welcome checks passed.');
