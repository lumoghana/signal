/* Real mounted controls keep their place during same-page selection, while
   navigation, validation and the existing mandate controller stay in charge. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const index=fs.readFileSync(path.resolve(__dirname,'../dist/index.html'),'utf8');
const modules=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..')).filter(x=>x!=='mono-group-usability.js');
modules.splice(modules.indexOf('mono-brand.js')+1,0,'mono-group-usability.js');
const view=h=>h.document.getElementById('view');
const settle=h=>{h.flushHistory();h.flush();};
function fixture(){const h=createHarness({clock:true,deferHistory:true,modules});h.L.explore();settle(h);return h;}
const button=(h,action)=>view(h).querySelectorAll('button').find(node=>node.getAttribute('onclick')===action);
const click=(h,action)=>{const b=button(h,action);assert(b,'Mounted control '+action);b.focus();b.click();settle(h);};
const money=h=>JSON.stringify({accounts:h.L.state.accounts,balance:h.L.state.balance,txs:h.L.state.txs,essentials:h.L.state.essentials,goals:h.L.state.goals});
function collection(h){
 const L=h.L;L.gm.startCollection();settle(h);h.set('gm-title','Class trip');h.set('gm-target','1200');h.set('gm-deadline',new Date(Date.now()+86400000).toISOString().slice(0,10));L.gm.next();settle(h);h.set('gm-name-1','Abena');L.gm.addPerson();settle(h);h.set('gm-name-2','Kojo');L.gm.openApprovers();settle(h);
}
test('selecting a lower approver preserves its keyboard focus and view position without changing money',()=>{
 const h=fixture(),L=h.L,before=money(h);collection(h);
 const b=view(h).querySelectorAll('button').find(node=>node.getAttribute('aria-label')==='Kojo');assert(b);const action=b.getAttribute('onclick');b.focus();view(h).scrollTop=280;view(h).scrollLeft=3;view(h).querySelector('.gm-body').scrollTop=195;b.click();settle(h);
 assert.equal(L.route,'groupMoneyApprovers');assert.equal(h.document.activeElement,button(h,action));assert.equal(h.document.activeElement.getAttribute('aria-pressed'),'false');assert.equal(view(h).scrollTop,280);assert.equal(view(h).scrollLeft,3);assert.equal(view(h).querySelector('.gm-body').scrollTop,195);assert.equal(money(h),before);assert.deepEqual(h.errors,[]);
});
test('contact selection and changing its source retain the selected control and scroll',()=>{
 const h=fixture(),L=h.L;L.gm.startSplit();settle(h);h.set('gm-title','Lunch');h.set('gm-total','90');L.gm.next();settle(h);L.gm.openPeople('recent');settle(h);click(h,"L.gm.peopleTab('lumo')");
 const contact=view(h).querySelectorAll('button').find(node=>(node.getAttribute('onclick')||'').startsWith('L.gm.togglePerson('));assert(contact);const action=contact.getAttribute('onclick');contact.focus();view(h).scrollTop=240;contact.click();settle(h);assert.equal(h.document.activeElement,button(h,action));assert.equal(view(h).scrollTop,240);assert.equal(h.document.activeElement.getAttribute('aria-pressed'),'true');
 const tabAction="L.gm.peopleTab('recent')";button(h,tabAction).focus();view(h).scrollTop=90;button(h,tabAction).click();settle(h);assert.equal(h.document.activeElement,button(h,tabAction));assert.equal(view(h).scrollTop,90);assert.deepEqual(h.errors,[]);
});
test('split-mode state is announced and switching mode preserves focus and entered people',()=>{
 const h=fixture(),L=h.L;L.gm.startSplit();settle(h);h.set('gm-title','Project print');h.set('gm-total','90');L.gm.next();settle(h);h.set('gm-name-1','Abena');const action="L.gm.setMode('custom')";button(h,action).focus();view(h).scrollTop=180;button(h,action).click();settle(h);
 assert.equal(h.document.activeElement,button(h,action));assert.equal(view(h).scrollTop,180);assert.equal(button(h,action).getAttribute('aria-pressed'),'true');assert.equal(button(h,"L.gm.setMode('equal')").getAttribute('aria-pressed'),'false');assert.equal(h.document.getElementById('gm-name-1').value,'Abena');assert.equal(h.document.getElementById('gm-share-1').value,'45.00');assert.deepEqual(h.errors,[]);
});
test('adding a person retains the action but a disappearing final Add button keeps native focus',()=>{
 const h=fixture(),L=h.L;L.gm.startSplit();settle(h);h.set('gm-title','Class printing');h.set('gm-total','90');L.gm.next();settle(h);
 const action='L.gm.addPerson()';button(h,action).focus();view(h).scrollTop=210;button(h,action).click();settle(h);assert.equal(h.document.activeElement,button(h,action));assert.equal(view(h).scrollTop,210);assert(h.document.getElementById('gm-name-2'));
 while(L.state.groupMoney.draft.people.length<8){L.gm.addPerson();settle(h);}button(h,action).focus();view(h).scrollTop=450;button(h,action).click();settle(h);assert.equal(button(h,action),undefined);assert.notEqual(h.document.activeElement.getAttribute('onclick'),action);assert.deepEqual(h.errors,[]);
});
test('validation focus and actual Back navigation are never replaced by selection restoration',()=>{
 const h=fixture(),L=h.L;collection(h);
 for(const person of L.state.groupMoney.draft.people.filter(p=>p.id!=='self'))click(h,"L.gm.toggleApprover('"+person.id+"')");
 click(h,'L.gm.saveApprovers()');const error=h.document.getElementById('error');assert.match(error.textContent,/at least two/i);assert.equal(h.document.activeElement,error);
 // A later no-op selection also leaves the active validation message alone.
 view(h).scrollTop=33;L.gm.toggleApprover('unknown-person');settle(h);assert.equal(h.document.activeElement,error);assert.equal(view(h).scrollTop,33);
 const back=h.document.querySelector('.task-sheet-back');assert(back);back.click();settle(h);assert.equal(L.route,'groupMoneyPeople');assert.equal(h.history.state.route,'groupMoneyPeople');assert.deepEqual(h.errors,[]);
});
test('collection list filters expose their selected state without changing native navigation',()=>{
 const h=fixture(),L=h.L;
 for(const filter of ['all','split','collection']){
  L.go('groupMoneyList',{filter});settle(h);
  const filters=view(h).querySelector('.gm-tabs');assert(filters);
  for(const candidate of ['all','split','collection']){
   const b=filters.querySelectorAll('button').find(node=>node.getAttribute('onclick')==="L.go('groupMoneyList',{filter:'"+candidate+"'})");assert(b);assert.equal(b.getAttribute('aria-pressed'),String(filter===candidate));
  }
  assert.equal(L.route,'groupMoneyList');assert.equal(h.history.state.params.filter,filter);
 }
 assert.deepEqual(h.errors,[]);
});
test('re-selecting custom split mode keeps the amounts already entered',()=>{
 const h=fixture(),L=h.L;L.gm.startSplit();settle(h);h.set('gm-title','Lunch');h.set('gm-total','90');L.gm.next();settle(h);h.set('gm-name-1','Abena');click(h,"L.gm.setMode('custom')");h.set('gm-share-0','20');h.set('gm-share-1','70');L.gm.capture();const before=JSON.stringify(L.state.groupMoney.draft);click(h,"L.gm.setMode('custom')");assert.equal(h.document.getElementById('gm-share-0').value,'20');assert.equal(h.document.getElementById('gm-share-1').value,'70');assert.equal(JSON.stringify(L.state.groupMoney.draft),before);assert.deepEqual(h.errors,[]);
});
function unfinishedSplit(h){
 const L=h.L;L.gm.startSplit();settle(h);h.set('gm-title','Study group printing');h.set('gm-total','90');L.gm.next();settle(h);h.set('gm-name-1','Abena');L.gm.capture();L.closeTask();settle(h);L.newRequest();settle(h);return L.state.groupMoney.draft;
}
test('cancelling a switch preserves the unfinished split and the original requests route',()=>{
 const h=fixture(),L=h.L,draft=unfinishedSplit(h),before=signature(draft),personal=money(h);L.gm.startCollection();settle(h);assert.equal(L.route,'monoGroupDraftReplace');assert.match(view(h).textContent,/unfinished split/);assert.equal(L.state.groupMoney.draft,draft);click(h,'L.monoGroupUsability.keepDraft()');assert.equal(L.route,'groupMoneyHome');assert.equal(h.history.state.route,'groupMoneyHome');assert.equal(signature(draft),before);assert.equal(money(h),personal);assert.deepEqual(h.errors,[]);
});
test('confirming a switch waits for native Back and does not leave the choice in task history',()=>{
 const h=fixture(),L=h.L,draft=unfinishedSplit(h),personal=money(h);L.gm.startCollection();settle(h);const b=button(h,'L.monoGroupUsability.replaceDraft()');assert(b);b.click();L.monoGroupUsability.replaceDraft();assert.equal(L.state.groupMoney.draft,draft,'No replacement before native history returns');assert.equal(h.history.pending,1);settle(h);assert.equal(L.route,'groupMoneyCollection');assert.equal(h.history.state.route,'groupMoneyCollection');assert.equal(L.state.groupMoney.draft.type,'collection');assert.notEqual(L.state.groupMoney.draft,draft);assert.equal(money(h),personal);L.back();settle(h);assert.equal(L.route,'groupMoneyHome');assert.deepEqual(h.errors,[]);
});
test('untouched defaults do not prompt, and a stale decision cannot replace a changed or locked draft',()=>{
 const h=fixture(),L=h.L;L.gm.startSplit();settle(h);L.closeTask();settle(h);L.newRequest();settle(h);L.gm.startCollection();settle(h);assert.equal(L.route,'groupMoneyCollection');
 L.gm.startSplit();settle(h);h.set('gm-title','Lunch');L.gm.capture();L.closeTask();settle(h);L.newRequest();settle(h);const draft=L.state.groupMoney.draft;L.gm.startCollection();settle(h);assert.equal(L.route,'monoGroupDraftReplace');draft.title='Changed lunch';click(h,'L.monoGroupUsability.replaceDraft()');assert.equal(L.state.groupMoney.draft,draft);assert.equal(draft.title,'Changed lunch');assert.match(h.document.getElementById('error').textContent,/changed/);L.monoGroupUsability.keepDraft();settle(h);
 L.gm.startCollection();settle(h);L.state.locked=true;L.monoGroupUsability.replaceDraft();settle(h);assert.equal(L.state.groupMoney.draft,draft);assert.equal(draft.title,'Changed lunch');assert.deepEqual(h.errors,[]);
});
test('a different account or a navigation during a pending switch never starts the replacement later',()=>{
 const h=fixture(),L=h.L,draft=unfinishedSplit(h),account=L.state.profile.account;L.gm.startCollection();settle(h);L.state.profile.account='different-profile';L.monoGroupUsability.replaceDraft();settle(h);assert.equal(L.state.groupMoney.draft,draft);L.state.profile.account=account;L.monoGroupUsability.keepDraft();settle(h);
 L.gm.startCollection();settle(h);assert.equal(L.route,'monoGroupDraftReplace');button(h,'L.monoGroupUsability.replaceDraft()').click();L.go('help');settle(h);assert.equal(L.state.groupMoney.draft,draft);L.go('groupMoneyHome');settle(h);assert.equal(L.state.groupMoney.draft,draft);assert.deepEqual(h.errors,[]);
});
test('a last-second Keep choice cancels the queued replacement without traversing history twice',()=>{
 const h=fixture(),L=h.L,draft=unfinishedSplit(h);L.gm.startCollection();settle(h);button(h,'L.monoGroupUsability.replaceDraft()').click();L.monoGroupUsability.keepDraft();assert.equal(h.history.pending,1);settle(h);assert.equal(L.route,'groupMoneyHome');assert.equal(L.state.groupMoney.draft,draft);assert.deepEqual(h.errors,[]);
});
test('a selected payment that becomes ineligible cannot replace an unfinished collection',()=>{
 const h=fixture(),L=h.L;L.gm.startCollection();settle(h);h.set('gm-title','Class trip');h.set('gm-target','1200');L.gm.capture();L.closeTask();settle(h);L.newRequest();settle(h);const draft=L.state.groupMoney.draft,tx=L.state.txs.find(tx=>L.groupMoney.eligibleSource(tx));assert(tx);L.gm.startSplit(tx.id);settle(h);assert.equal(L.route,'monoGroupDraftReplace');tx.status='failed';click(h,'L.monoGroupUsability.replaceDraft()');assert.equal(L.state.groupMoney.draft,draft);assert.equal(draft.type,'collection');assert.match(h.document.getElementById('error').textContent,/changed/);assert.deepEqual(h.errors,[]);
});
function receiptSplit(h){
 const L=h.L,source=L.state.txs.find(tx=>L.groupMoney.eligibleSource(tx));assert(source);L.gm.startSplit(source.id);settle(h);assert(h.document.getElementById('gm-total').hasAttribute('readonly'));h.set('gm-title','Friday lunch with Abena');L.gm.next();settle(h);h.set('gm-name-1','Abena');click(h,"L.gm.setMode('custom')");const total=L.groupMoney.sourceAmount(source)/100;h.set('gm-share-0','10');h.set('gm-share-1',String(total-10));L.gm.capture();L.gm.next();settle(h);assert.equal(L.route,'groupMoneyReview');return {draft:L.state.groupMoney.draft,source};
}
test('reopening the same receipt split resumes its edited title, custom shares and review stage',()=>{
 const h=fixture(),L=h.L,{draft,source}=receiptSplit(h),saved=signature(draft),personal=money(h);L.closeTask();settle(h);L.newRequest();settle(h);L.gm.startSplit(source.id);settle(h);assert.equal(L.route,'groupMoneyReview');assert.equal(L.state.groupMoney.draft,draft);assert.equal(signature(draft),saved);assert.match(view(h).textContent,/Friday lunch with Abena/);assert.equal(L.groupMoney.cents(draft.total),L.groupMoney.sourceAmount(source));assert.equal(money(h),personal);
 L.closeTask();settle(h);L.newRequest();settle(h);source.status='failed';L.gm.startSplit(source.id);settle(h);assert.equal(L.route,'groupMoneyHome');assert.equal(signature(draft),saved);assert.deepEqual(h.errors,[]);
});
test('splitting another receipt asks before replacing an unfinished split and keeps native Back correct',()=>{
 const h=fixture(),L=h.L,{draft,source}=receiptSplit(h),saved=signature(draft),personal=money(h),other=L.state.txs.find(tx=>tx.id!==source.id&&L.groupMoney.eligibleSource(tx));assert(other);L.closeTask();settle(h);L.newRequest();settle(h);L.go('groupMoneySource');settle(h);L.gm.startSplit(other.id);settle(h);assert.equal(L.route,'monoGroupDraftReplace');assert.match(view(h).textContent,/another payment/);click(h,'L.monoGroupUsability.keepDraft()');assert.equal(L.route,'groupMoneySource');assert.equal(signature(draft),saved);
 L.gm.startSplit(other.id);settle(h);button(h,'L.monoGroupUsability.replaceDraft()').click();assert.equal(L.state.groupMoney.draft,draft);settle(h);assert.equal(L.route,'groupMoneySplit');assert.equal(L.state.groupMoney.draft.sourceTxId,other.id);assert.equal(L.groupMoney.cents(L.state.groupMoney.draft.total),L.groupMoney.sourceAmount(other));assert.equal(money(h),personal);L.back();settle(h);assert.equal(L.route,'groupMoneySource');assert.equal(h.history.state.route,'groupMoneySource');assert.deepEqual(h.errors,[]);
});
function customSplit(h){
 const L=h.L;L.gm.startSplit();settle(h);h.set('gm-title','Lunch');h.set('gm-total','90');L.gm.next();settle(h);h.set('gm-name-1','Abena');click(h,"L.gm.setMode('custom')");h.set('gm-share-0','20');h.set('gm-share-1','70');L.gm.capture();L.gm.edit('basics');settle(h);return L.state.groupMoney.draft;
}
test('editing only a custom split title keeps explicit shares through Back and Continue',()=>{
 const h=fixture(),L=h.L,draft=customSplit(h),personal=money(h);h.set('gm-title','Friday lunch');L.gm.next();settle(h);assert.equal(L.route,'groupMoneyPeople');assert.equal(draft.title,'Friday lunch');assert.equal(draft.mode,'custom');assert.equal(h.document.getElementById('gm-share-0').value,'20');assert.equal(h.document.getElementById('gm-share-1').value,'70');assert.deepEqual(Array.from(draft.people,p=>p.amount),['20','70']);L.gm.next();settle(h);assert.equal(L.route,'groupMoneyReview');assert.equal(money(h),personal);assert.deepEqual(h.errors,[]);
});
test('a changed total retains custom shares and the original review rejects their mismatch',()=>{
 const h=fixture(),L=h.L,draft=customSplit(h);h.set('gm-total','100');L.gm.next();settle(h);assert.equal(L.route,'groupMoneyPeople');assert.deepEqual(Array.from(draft.people,p=>p.amount),['20','70']);L.gm.next();settle(h);assert.equal(L.route,'groupMoneyPeople');assert.match(h.document.getElementById('error').textContent,/total|add|match|shares/i);assert.equal(h.document.activeElement,h.document.getElementById('error'));h.set('gm-share-1','80');L.gm.capture();L.gm.next();settle(h);assert.equal(L.route,'groupMoneyReview');assert.deepEqual(h.errors,[]);
});
test('invalid edited basics keep the original field error focus and custom amounts',()=>{
 const h=fixture(),L=h.L,draft=customSplit(h);h.set('gm-total','0');L.gm.next();settle(h);assert.equal(L.route,'groupMoneySplit');assert.equal(h.document.activeElement.id,'gm-total');assert.equal(h.document.getElementById('gm-total').getAttribute('aria-invalid'),'true');assert.deepEqual(Array.from(draft.people,p=>p.amount),['20','70']);assert.deepEqual(h.errors,[]);
});
const signature=value=>JSON.stringify(value);
