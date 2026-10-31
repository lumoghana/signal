/* Independent checks for guidance boundaries, native retained parents and drafts. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const root=path.resolve(__dirname,'..');
const modules=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..')).filter(f=>f!=='page-guidance.js');
const source=fs.readFileSync(path.join(root,'dist/page-guidance.js'),'utf8');
const fixtures=fs.readFileSync(path.join(root,'tests/manual-layout/overflow-seed.js'),'utf8');
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const settle=h=>{h.flushHistory();h.flush();};
const view=h=>h.document.getElementById('view');
const guide=h=>view(h).querySelector('.page-guidance');
const money=L=>JSON.stringify({balance:L.state.balance,goals:L.state.goals,txs:L.state.txs,essentials:L.state.essentials,paymentDraft:L.state.paymentDraft,accounts:L.state.accounts,virtualCards:L.state.virtualCards});
function harness(){
 const h=createHarness({testing:true,clock:true,modules});h.originalDecorator=h.L.decorateView;
 vm.runInContext(source,h.context,{filename:'page-guidance.js'});h.guidedDecorator=h.L.decorateView;
 vm.runInContext(fixtures,h.context,{filename:'overflow-seed.js'});
 h.seed=route=>{const c=h.context.__overflowCases.find(c=>c.route===route&&c.variant==='standard');assert(c,'Retained isolated fixture '+route);const result=h.context.__overflowSeed(c);settle(h);assert.deepEqual(Array.from(result.errors),[],route+' fixture');assert.deepEqual(h.errors,[],route+' renderer');return result;};
 return h;
}
const protectedRoutes=['paymentReview','authorize','pause','allocationReview','releaseReview','accountReview','privacyNotice','accountTerms','pin','confirmPin','boxProtectionInvite','boxProtectionChange','groupMoneyMandate','groupMoneyInvitationMandate','virtualCardAuthorize','pending','txDetail','requestConfirm'];
{
 const h=harness();
 for(const route of protectedRoutes)check(route+' retains required text, financial draft and illustrations',()=>{
  h.L.decorateView=h.originalDecorator;h.seed(route);
  const text=view(h).textContent,before=money(h.L),art=view(h).querySelectorAll('[data-art]').length;
  h.L.decorateView=h.guidedDecorator;h.L.render();settle(h);
  assert.equal(view(h).textContent,text);assert.equal(money(h.L),before);assert.equal(view(h).querySelectorAll('[data-art]').length,art);assert.equal(guide(h),null);assert.deepEqual(h.errors,[]);
 });
}
check('return through an unguided parent collapses the next task visit',()=>{
 const h=harness();h.seed('goals');assert(guide(h).hasAttribute('open'));h.L.go('home');settle(h);h.L.go('goals');settle(h);assert(!guide(h).hasAttribute('open'));assert.deepEqual(h.errors,[]);
});
check('same-route refresh preserves a deliberate reopen and reload defaults to collapsed',()=>{
 const h=harness();h.seed('goals');h.L.pageGuidance.dismiss('goals');guide(h).querySelector('summary').click();assert(guide(h).hasAttribute('open'));h.L.render();settle(h);assert(guide(h).hasAttribute('open'));
 const saved=JSON.parse(JSON.stringify(h.L.state)),next=createHarness({testing:true,clock:true,modules});next.L.state=saved;vm.runInContext(source,next.context,{filename:'page-guidance.js'});next.L.route='goals';next.L.params={};next.L.render();settle(next);assert(!guide(next).hasAttribute('open'));assert.deepEqual(h.errors,[]);assert.deepEqual(next.errors,[]);
});
check('a fresh state and changed profile owner do not inherit a mounted closed guide',()=>{
 const h=harness();h.seed('goal');h.L.pageGuidance.dismiss('goal');h.L.state=JSON.parse(JSON.stringify(h.L.state));delete h.L.state.pageGuidance;h.L.render();settle(h);assert(guide(h).hasAttribute('open'),'Fresh state has its own first visit');h.L.pageGuidance.dismiss('goal');h.L.state.profile.account='ANOTHER-SAMPLE-OWNER';h.L.render();settle(h);assert(guide(h).hasAttribute('open'),'Changed owner has its own first visit');assert.deepEqual(h.errors,[]);
});
check('dismiss and reopen retain typed metadata, consent and exact saved-money state',()=>{
 const h=harness();h.seed('goalEdit');h.set('goalName','Name typed without saving');h.set('sh-kind','spend');h.set('sh-value',7);
 const name=h.document.getElementById('goalName'),consent=h.document.getElementById('sh-consent'),sample=view(h).querySelector('.sh-sample-note');assert(consent&&sample);assert.equal(consent.closest('.page-guidance'),null);assert.equal(sample.closest('.page-guidance'),null);consent.checked=true;consent.dispatchEvent(new h.Event('change'));name.focus();const before=money(h.L);
 h.L.pageGuidance.dismiss('goalEdit');assert.equal(h.document.getElementById('goalName')===name,true);assert.equal(name.value,'Name typed without saving');assert.equal(h.document.getElementById('sh-consent')===consent,true);assert(consent.checked);assert.equal(money(h.L),before);guide(h).querySelector('summary').click();assert.equal(h.document.getElementById('goalName')===name,true);assert.equal(name.value,'Name typed without saving');assert(consent.checked);assert.equal(money(h.L),before);assert.deepEqual(h.errors,[]);
});
check('Budget amount and period semantics remain inline and available',()=>{
 const h=harness();h.seed('essentialEdit');const meaning=h.document.getElementById('essential-total-help');assert(meaning?.textContent.includes('Total for the whole period'));assert(meaning.textContent.includes('Not per day'));assert.equal(meaning.closest('.page-guidance'),null);assert(view(h).textContent.includes('Still to cover'));assert.deepEqual(h.errors,[]);
});
for(const route of ['cardsHome','moneyStoryHome'])check(route+' closes first-use education before a retained parent is restored',()=>{
 const h=harness();h.seed(route);const retained=guide(h);assert(retained?.hasAttribute('open'));h.L.go('addMoney');settle(h);h.L.closeTask();settle(h);assert.equal(h.L.route,route);assert.equal(guide(h)===retained,true,'The unchanged native parent is retained');assert(!retained.hasAttribute('open'));assert.deepEqual(h.errors,[]);
});
console.log(passed+' independent page guidance safety checks passed.');
