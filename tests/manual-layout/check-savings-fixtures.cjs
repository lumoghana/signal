/* Fixture setup sanity checks. Real layout geometry is checked in the browser. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHarness}=require('../helpers/task-sheet-dom.cjs');
const dist=path.resolve(__dirname,'../../dist');
const modules=[...fs.readFileSync(path.join(dist,'index.html'),'utf8').matchAll(/<script\b[^>]*\bsrc="\/([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>m[1]);
for(const file of ['savings-hacks-engine.js','savings-hacks-ui.js']){
 assert(fs.existsSync(path.join(dist,file)),file+' must exist before checking Savings hack fixtures.');
 if(!modules.includes(file))modules.push(file);
}
const h=createHarness({testing:true,modules}),{L,document,context}=h;
vm.runInContext(fs.readFileSync(path.join(__dirname,'overflow-seed.js'),'utf8'),context,{filename:'overflow-seed.js'});
const routes=new Set(['plan','goalEdit','goal','goals','boxProtectionInvite']);
const cases=context.__overflowCases.filter(c=>!c.variant.startsWith('guidance-')&&(routes.has(c.route)||c.variant.startsWith('hack-')));
assert.equal(cases.length,34,'The targeted sweep should retain 34 Savings hack/Plan cases.');
for(const c of cases){
 const r=context.__overflowSeed(c);h.flush();
 assert.deepEqual(Array.from(r.errors),[],c.name+' setup');
 assert.deepEqual(Array.from(h.errors),[],c.name+' renderer');
 assert(!/Let’s try that again/.test(document.getElementById('view').textContent),c.name+' rendered fallback');
 if(!c.variant.startsWith('hack-'))continue;
 assert.equal(r.actual,c.route,c.name+' mounted route');
 const x=r.savingsHack,v=c.variant;
 assert(x,c.name+' reports Savings hack setup facts');
 if(v.startsWith('hack-new-')){
  const kind=['manual','income','roundup','spend','fixed'].find(k=>v.includes('hack-new-'+k));
  assert.equal(x.selectedKind,kind,c.name+' selected kind');
  assert.equal(x.rule,null,c.name+' must not create an instruction before saving');
  assert.equal(x.goalCount,1,c.name+' must not create a Money Box before saving');
  assert.equal(x.saved,100,c.name+' must not move money during setup');
 }
 if(v==='hack-new-fixed-validation')assert(/GH₵|amount/i.test(x.validationMessage),'Invalid fixed amount remains visible');
 if(v==='hack-new-income-consent-error')assert(/allow|confirm/i.test(x.validationMessage),'Missing consent remains visible');
 if(v==='hack-new-income-protected')assert.equal(x.partnerFieldsVisible,true,'Protection partner fields are expanded');
 if(v==='hack-edit-paused'){assert.equal(x.selectedKind,'paused');assert.equal(x.rule.enabled,false);}
 if(v==='hack-paused')assert.equal(x.rule.enabled,false);
 if(v==='hack-edit-cancelled'){assert.equal(x.selectedKind,'manual');assert.equal(x.rule.cancelled,true);assert.equal(x.rule.enabled,false);}
 if(v==='hack-cancelled'){assert.equal(x.rule.cancelled,true);assert.equal(x.rule.enabled,false);}
 if(v==='hack-active-history'){assert.equal(x.historyCount,5);assert.equal(x.saved,200,'GH₵100 monthly cap respected');}
 if(v==='hack-active-list'){assert.equal(x.historyCount,1);assert.equal(x.saved,130);}
 if(v==='hack-target-reached'){assert.equal(x.rule.enabled,false);assert.equal(x.rule.stoppedReason,'target');assert.equal(x.saved,100);}
 if(v==='hack-budget-skipped'){assert.equal(x.historyCount,1);assert.equal(x.saved,100,'Budget shortfall must skip auto saving');}
 if(v==='hack-protection-invite')assert.equal(L.boxProtection.get('qa-box').status,'invited');
}
console.log(cases.length+' savings layout fixture setups passed; browser geometry is a separate check.');
