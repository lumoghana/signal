/* First/returning fixture sanity. Browser geometry is a separate check. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHarness}=require('../helpers/task-sheet-dom.cjs');
const dist=path.resolve(__dirname,'../../dist');
const modules=[...fs.readFileSync(path.join(dist,'index.html'),'utf8').matchAll(/<script\b[^>]*\bsrc="\/([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>m[1]);
for(const file of ['savings-hacks-engine.js','savings-hacks-ui.js','page-guidance.js']){
 assert(fs.existsSync(path.join(dist,file)),file+' must exist before checking guidance fixtures.');
 if(!modules.includes(file))modules.push(file);
}
const h=createHarness({testing:true,modules}),{L,document,context}=h;
vm.runInContext(fs.readFileSync(path.join(__dirname,'overflow-seed.js'),'utf8'),context,{filename:'overflow-seed.js'});
const cases=context.__overflowCases.filter(c=>c.variant.startsWith('guidance-'));
assert.equal(cases.length,30,'15 first/returning route pairs are targeted.');
const records=new Map();
const outside=node=>node.nodeType===3?node.textContent||node.text||'':node.matches?.('.page-guidance,script,style,noscript')?'':Array.from(node.childNodes||[]).map(outside).join(' ');
const normalize=text=>String(text).replace(/\s+/g,' ').trim();
let firstGuides=0;
for(const c of cases){
 const r=context.__overflowSeed(c);h.flushHistory();h.flush();
 const view=document.getElementById('view'),guides=view.querySelectorAll('details.page-guidance');
 assert.deepEqual(Array.from(r.errors),[],c.name+' setup');
 assert.deepEqual(Array.from(h.errors),[],c.name+' renderer');
 assert.equal(L.route,c.route,c.name+' must measure the requested mounted route');
 assert(!/Let’s try that again/.test(view.textContent),c.name+' must not measure fallback UI');
 for(const guide of guides){
  assert.equal(guide.hasAttribute('open'),c.variant==='guidance-first',c.name+' open state');
  assert.equal(guide.querySelector('input,select,textarea'),null,c.name+' cannot absorb a form control');
  assert.equal(guide.getAttribute('data-guidance-route'),c.route,c.name+' guidance route');
  assert.equal(L.state.pageGuidance.seen[c.route],true,c.name+' visit recorded');
 }
 if(c.variant==='guidance-first')firstGuides+=guides.length;
 const text=normalize(outside(view));
 if(['paymentReview','authorize'].includes(c.route)){
  assert.equal(guides.length,0,c.name+' no education wrapper on payment confirmation');
  assert(/Akua/.test(text)&&/GH₵80\.00/.test(text),c.name+' recipient and payment amount stay outside guidance');
  assert(view.querySelector('[data-payment-balance]'),c.name+' current available balance remains visible');
 }
 if(c.route==='paymentReview')assert(/Fee/.test(text)&&/GH₵0\.00/.test(text)&&/Total to pay/.test(text)&&/Nothing sent yet/.test(text),c.name+' fees, total and authorisation meaning stay visible');
 if(c.route==='authorize'){
  const pin=document.getElementById('payment-pin');assert(pin,c.name+' PIN field');assert.equal(pin.closest('.page-guidance'),null,c.name+' PIN outside guidance');assert(/Your 6-digit Lumo PIN/.test(text)&&/Pay GH₵80\.00/.test(text),c.name+' authorisation and exact pay action remain');
 }
 if(c.route==='essentialEdit'){
  const amount=document.getElementById('essAmount'),meaning=document.getElementById('essential-total-help');assert(amount&&meaning,c.name+' amount and whole-period meaning');assert.equal(amount.closest('.page-guidance'),null);assert.equal(meaning.closest('.page-guidance'),null);assert(/Not per day/.test(meaning.textContent));
 }
 const snapshot={guideCount:guides.length,text,controlIds:view.querySelectorAll('input[id],select[id],textarea[id]').filter(e=>!e.closest('.page-guidance')).map(e=>e.id).sort(),actionLabels:view.querySelectorAll('button').filter(e=>!e.closest('.page-guidance')).map(e=>normalize(e.getAttribute('aria-label')||e.textContent)).filter(Boolean),money:JSON.parse(JSON.stringify(r.seededMoney))};
 if(c.variant==='guidance-first')records.set(c.route,snapshot);else assert.deepEqual(snapshot,records.get(c.route),c.name+' task data and actions are identical after returning');
}
assert(firstGuides>=8,'The first-use cases must exercise real mapped education, alongside intentionally untouched critical pages.');
console.log(cases.length+' guidance layout fixture setups passed ('+firstGuides+' first-use guides); browser geometry is a separate check.');
