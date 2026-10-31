/* Route/handler integrity and real mounted-DOM return paths. This harness is
   deliberately not a layout engine; these checks do not establish phone fit. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const dist=path.resolve(__dirname,'../dist');
let checks=0;
const check=(name,run)=>{run();checks++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
const decode=value=>value.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
function fixture(){const h=createHarness();h.L.explore();h.L.openTab('home');h.flush();return h;}
function action(h,code){const button=view(h).querySelectorAll('button').find(el=>el.getAttribute('onclick')===code);assert(button,'Working '+code+' on '+h.L.route);button.click();h.flush();return button;}
function submitAction(h,code){const form=view(h).querySelectorAll('form').find(el=>el.getAttribute('onsubmit')==='event.preventDefault();'+code);assert(form,'Working native '+code+' on '+h.L.route);const buttons=form.querySelectorAll('button[type="submit"]');assert.equal(buttons.length,1,'One primary submit control');assert.equal(buttons[0].getAttribute('onclick'),null,'No duplicate click controller');h.submit(form);h.flush();return buttons[0];}
function label(h,text){const button=view(h).querySelectorAll('button').find(el=>el.textContent.trim()===text);assert(button,'Working '+text+' on '+h.L.route);button.click();h.flush();return button;}

check('every shipped view has callable handlers, existing literal route targets and local assets',()=>{
 const h=createHarness({testing:true}),{L}=h;L.explore();let routes=0,handlers=0,assets=0;
 for(const route of Object.keys(L.views)){
  L.route=route;L.params={id:'unavailable',kind:route==='bill'?'airtime':undefined};
  const html=L.views[route]();assert.equal(typeof html,'string',route+' produces markup');routes++;
  for(const match of html.matchAll(/\b(?:onclick|onsubmit|oninput|onchange)="([^"]+)"/g)){
   const code=decode(match[1]);handlers++;
   assert.doesNotThrow(()=>new vm.Script('(function(event){'+code+'})'),route+' inline handler syntax');
   for(const call of code.matchAll(/\b(L(?:\.[A-Za-z_$][\w$]*)+)\s*\(/g)){
    let callable=L;for(const segment of call[1].split('.').slice(1))callable=callable?.[segment];
    assert.equal(typeof callable,'function',route+' references '+call[1]);
   }
   for(const target of code.matchAll(/L\.(?:go|openTab)\('([^']+)'/g))assert.equal(typeof L.views[target[1]],'function',route+' links to '+target[1]);
  }
  for(const match of html.matchAll(/\b(?:href|src)="(\/[^"?#]+)(?:[?#][^"]*)?"/g)){
   assets++;assert(fs.existsSync(path.join(dist,match[1].slice(1))),route+' asset '+match[1]);
  }
 }
 const index=fs.readFileSync(path.join(dist,'index.html'),'utf8');
 for(const match of index.matchAll(/\b(?:href|src)="(\/[^"?#]+)(?:[?#][^"]*)?"/g))assert(fs.existsSync(path.join(dist,match[1].slice(1))),'Entry asset '+match[1]);
 assert.deepEqual(h.errors,[]);console.log('INVENTORY '+routes+' views, '+handlers+' handlers, '+assets+' rendered asset references');
});

check('payment → Help → saved report → return retains the merchant, amount and Pay parent',()=>{
 const h=fixture(),{L}=h;L.openTab('pay');action(h,"L.setPayTab('campus')");action(h,"L.pickMerchant('AK01')");h.set('payment-amount',80);
 const parent=h.document.getElementById('task-parent-view'),draft=L.state.paymentDraft.id,balance=L.state.balance;
 h.document.querySelector('.task-sheet-help').click();h.flush();
 action(h,"L.go('supportCase',{returnRoute:L.params.returnTo||L.params.returnRoute||L.params.from||'help',kind:L.params.context||'',returnParams:L.params.returnParams||{}})");
 h.set('caseDescription','I need help understanding this payment.');submitAction(h,'L.acct.submitCase()');assert.equal(L.route,'caseDetail');
 assert.equal(L.state.cases.length,1);assert.equal(L.state.cases[0].context.returnRoute,'send');label(h,'Return to your task');
 assert.equal(L.route,'send');assert.equal(L.state.paymentDraft.id,draft);assert.equal(h.document.getElementById('payment-amount').value,'80');
 assert.equal(L.taskSheet.parentRoute,'pay');assert(h.document.getElementById('task-parent-view')===parent);assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);
 assert.equal(L.state.balance,balance);assert.deepEqual(h.errors,[]);
});

check('a receipt restored as a full page keeps its reference through Help and return',()=>{
 const h=fixture(),{L}=h,id=L.state.txs[0].id;L.route='txDetail';L.params={id};L.history=[];L.render();h.flush();assert.equal(L.taskSheet.active,false);
 const reference=view(h).textContent;assert(reference.includes(id));
 const help=view(h).querySelectorAll('button').find(el=>el.getAttribute('aria-label')==='Get help');assert(help);help.click();h.flush();assert.equal(L.route,'help');
 label(h,'Return to your task');assert.equal(L.route,'txDetail');assert.equal(L.params.id,id);assert(view(h).textContent.includes(id));assert.deepEqual(h.errors,[]);
});

check('receipt support saves the transaction reference and returns to that same receipt',()=>{
 const h=fixture(),{L}=h,id=L.state.txs.find(t=>t.type==='out'&&!L.isInternalTransfer(t)).id;L.go('txDetail',{id});h.flush();const parent=h.document.getElementById('task-parent-view');
 label(h,'Get help with this payment');assert.equal(L.route,'supportCase');h.set('caseDescription','I would like to check this receipt.');submitAction(h,'L.acct.submitCase()');
 assert.equal(L.route,'caseDetail');const report=L.state.cases[0];assert.equal(report.context.reference,id);assert.equal(report.context.returnParams.id,id);
 label(h,'Return to your task');assert.equal(L.route,'txDetail');assert.equal(L.params.id,id);assert(view(h).textContent.includes(id));
 assert(h.document.getElementById('task-parent-view')===parent);assert.deepEqual(h.errors,[]);
});

console.log(checks+' link audit checks passed. Handler existence is separate from task-flow behavior and browser layout QA.');
