/* Shared-money accounting against the shipped application. Group demo records
   must remain separate from a customer's real payment and balance model. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const index=fs.readFileSync(path.resolve(__dirname,'../dist/index.html'),'utf8');
const storageKey=fs.readFileSync(path.resolve(__dirname,'../dist/core.js'),'utf8').match(/\bconst key=['"]([^'"]+)['"]/)[1];
const modules=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
if(!modules.includes('group-money-engine.js'))modules.push('group-money-engine.js');
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const h=createHarness({clock:true,testing:false,modules}),{L}=h;L.explore();L.ensureAccounts?.();
 Object.assign(L.state,{balance:600,txs:[],requests:[],paymentDraft:null,essentials:[],goals:[],groupMoney:undefined});
 L.route='home';L.params={};L.history=[];L.save();h.flush();return {h,L,G:L.groupMoney};
}
const people=()=>[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena'},{id:'kojo',name:'Kojo'}];
const split=(f,change={})=>f.G.createSplit({title:'Project materials',total:'90.01',mode:'equal',people:people(),idempotencyKey:'split-once',...change});
const future=f=>new f.h.context.Date(f.h.context.Date.now()+86400000).toISOString().slice(0,10);
// These accounting fixtures start after each simulated member has agreed to
// the mandate. The consent gate itself is exercised in collection-mandate.
const acceptMembers=(f,item)=>{for(const p of item.people.filter(p=>!p.isOwner))assert(f.G.acceptMandate({itemId:item.id,personId:p.id,version:item.mandate.version,sample:true}).ok);};
const collection=(f,change={})=>{const r=f.G.createCollection({title:'Cape Coast trip',target:'1200',deadline:future(f),members:people().slice(1),idempotencyKey:'collect-once',acceptMandate:true,...change});if(r.ok)acceptMembers(f,r.item);return r;};
const ledger=f=>JSON.stringify({balance:f.L.state.balance,accounts:f.L.state.accounts,txs:f.L.state.txs,requests:f.L.state.requests,goals:f.L.state.goals,essentials:f.L.state.essentials});
const receive=(f,item,personId,amount,reference)=>f.G.recordSamplePayment({itemId:item.id,personId,amount,reference});
const clean=f=>assert.deepEqual(f.h.errors,[],'No rendering fallback');
const visible=f=>f.h.document.getElementById('view').textContent;
const click=(f,label)=>{const button=f.h.document.querySelectorAll('button').find(b=>b.textContent.trim()===label);assert(button,'Actual button '+label+' exists');button.click();f.h.flush();};

check('regular equal splits include the payer and allocate each pesewa exactly once',()=>{
 const f=fixture(),before=ledger(f),result=split(f);assert(result.ok,result.error);const g=result.item,s=f.G.summary(g);
 assert.equal(g.type,'split');assert.equal(g.totalCents,9001);assert.equal(g.people.length,3);
 assert.equal(g.people.reduce((n,p)=>n+p.amountCents,0),9001);
 assert.equal(g.people.find(p=>p.isOwner).amountCents,3001);
 assert(g.people.filter(p=>!p.isOwner).every(p=>p.amountCents===3000));
 assert.equal(s.dueCents,6000);assert.equal(s.receivedCents,0);assert.equal(ledger(f),before);
 const withoutOwner=split(f,{people:people().slice(1),idempotencyKey:'owner-auto'});assert(withoutOwner.ok,withoutOwner.error);assert.equal(withoutOwner.item.people.filter(p=>p.isOwner).length,1);clean(f);
});
check('custom splits require an exact total and do not invent cash or payment requests',()=>{
 const f=fixture(),before=ledger(f),custom=people().map((p,i)=>({...p,amount:['20.01','25','45'][i]}));
 let r=split(f,{mode:'custom',people:custom});assert(r.ok,r.error);assert.equal(r.item.people.reduce((n,p)=>n+p.amountCents,0),9001);assert.equal(ledger(f),before);
 for(const amount of ['44.99','45.001','-1','NaN','Infinity']){
  const p=copy(custom);p[2].amount=amount;r=split(f,{mode:'custom',people:p,idempotencyKey:'invalid-'+amount});assert.equal(r.ok,false,'reject '+amount);
 }
 assert.equal(f.G.list().length,1);assert.equal(ledger(f),before);clean(f);
});
check('invalid totals, repeated people and impersonating the payer are rejected',()=>{
 const f=fixture();
 for(const total of ['0','-1','0.001','NaN','Infinity','1e2','1000001'])assert.equal(split(f,{total,idempotencyKey:'bad-'+total}).ok,false,'reject '+total);
 const duplicateName=people();duplicateName[2].name='  ABENA  ';assert.equal(split(f,{people:duplicateName}).ok,false);
 const duplicateId=people();duplicateId[2].id='abena';assert.equal(split(f,{people:duplicateId}).ok,false);
 const selfAsFriend=people();selfAsFriend[2].name=f.L.state.profile.name;assert.equal(split(f,{people:selfAsFriend}).ok,false);
 const many=[people()[0],...Array.from({length:9},(_,i)=>({id:'friend-'+i,name:'Friend '+i}))];assert.equal(split(f,{people:many}).ok,false);
 assert.equal(f.G.list().length,0);clean(f);
});
check('double submission creates one item and a changed payload cannot reuse its reference',()=>{
 const f=fixture(),first=split(f),repeat=split(f);assert(first.ok);assert(repeat.ok);assert.equal(repeat.item.id,first.item.id);assert.equal(f.G.list().length,1);
 const changed=split(f,{total:'100'});assert.equal(changed.ok,false);assert.equal(f.G.get(first.item.id).totalCents,9001);clean(f);
});
check('confirmed source payments exclude fees and stale refunds pause further split receipts',()=>{
 const f=fixture(),t=f.L.addTx({draftId:'original',type:'out',status:'success',name:'Campus Print',amount:90.01,fee:1,category:'Study',method:'Campus Pay'});
 const r=split(f,{sourceTxId:t.id});assert(r.ok,r.error);const g=r.item;assert.equal(g.totalCents,9001);
 const before=ledger(f);assert(receive(f,g,'abena','10','source-receipt').ok);assert.equal(ledger(f),before,'sample receipt is not a bank credit');
 t.refunded=1;assert.equal(receive(f,g,'kojo','10','after-refund').ok,false);assert.equal(f.G.summary(g).receivedCents,1000);
 for(const status of ['pending','failed','reversed']){t.refunded=0;t.status=status;assert.equal(split(f,{sourceTxId:t.id,idempotencyKey:'bad-source-'+status}).ok,false);}
 clean(f);
});
check('sample split payments are partial, idempotent and cannot exceed or pay the payer share',()=>{
 const f=fixture(),g=split(f).item,before=ledger(f);
 let r=receive(f,g,'abena','10','sample-ref');assert(r.ok,r.error);assert.equal(f.G.summary(g).receivedCents,1000);assert.equal(f.G.summary(g).dueCents,5000);
 r=receive(f,g,'abena','10','sample-ref');assert(r.ok,r.error);assert.equal(f.G.summary(g).receivedCents,1000);
 assert.equal(receive(f,g,'abena','11','sample-ref').ok,false);
 assert.equal(receive(f,g,'kojo','10','sample-ref').ok,false);
 for(const amount of ['0','-1','20.01','1.001'])assert.equal(receive(f,g,'abena',amount,'invalid-'+amount).ok,false);
 assert.equal(receive(f,g,'self','1','owner-receipt').ok,false);assert.equal(receive(f,g,'stranger','1','stranger-receipt').ok,false);
 assert(receive(f,g,'abena','20','sample-ref-2').ok);assert(receive(f,g,'kojo','30','sample-ref-3').ok);
 assert.equal(f.G.summary(g).dueCents,0);assert.equal(f.G.summary(g).status,'settled');assert.equal(ledger(f),before);clean(f);
});
check('target collections count sample receipts separately and cannot exceed the target',()=>{
 const f=fixture(),before=ledger(f),r=collection(f,{target:'100'});assert(r.ok,r.error);const g=r.item;
 assert.equal(g.type,'collection');assert.equal(f.G.summary(g).remainingCents,10000);
 assert(receive(f,g,'abena','60','trip-1').ok);assert.equal(f.G.summary(g).remainingCents,4000);
 assert.equal(receive(f,g,'kojo','40.01','trip-over').ok,false);assert.equal(f.G.summary(g).receivedCents,6000);
 assert(receive(f,g,'kojo','40','trip-2').ok);assert.equal(f.G.summary(g).remainingCents,0);assert.equal(f.G.summary(g).progress,1);
 assert.equal(receive(f,g,'abena','1','trip-after-target').ok,false);assert.equal(ledger(f),before);clean(f);
});
check('collection deadlines and closed items reject late contributions',()=>{
 const f=fixture();assert.equal(collection(f,{deadline:'2020-01-01'}).ok,false);assert.equal(collection(f,{deadline:'not-a-date'}).ok,false);assert.equal(collection(f,{deadline:'2026-02-30'}).ok,false);
 const g=collection(f).item;f.h.advance(3*86400000);assert.equal(f.G.summary(g).canReceive,false);assert.equal(receive(f,g,'abena','10','late-trip').ok,false);
 const f2=fixture(),g2=collection(f2).item,before=ledger(f2);assert(f2.G.cancel(g2.id).ok);assert.equal(receive(f2,g2,'abena','10','closed-trip').ok,false);assert.equal(ledger(f2),before);clean(f2);
});
check('cancel and refund preserve contribution evidence and return each sample amount once',()=>{
 const f=fixture(),g=collection(f,{target:'100'}).item,before=ledger(f);assert(receive(f,g,'abena','30','refund-1').ok);assert(receive(f,g,'kojo','20','refund-2').ok);
 assert.equal(f.G.refund(g.id).ok,false,'an open collection cannot be silently refunded');assert(f.G.cancel(g.id).ok);assert(f.G.refund(g.id).ok);
 const saved=JSON.stringify(g);assert(f.G.refund(g.id).ok);assert.equal(JSON.stringify(g),saved,'repeated refund does not add records or money');
 const state=f.G.summary(g);assert.equal(state.receivedCents,0);assert.equal(state.grossReceivedCents,5000);assert.equal(state.refundedCents,5000);
 assert.equal(g.payments.length,2,'original contributions remain as evidence');assert.equal(g.refunds.length,2);assert.equal(new Set(g.refunds.map(r=>r.paymentId)).size,2);assert(g.refunds.every(r=>r.destination==='original-sample-source'));
 assert.equal(ledger(f),before);clean(f);
});
check('locked, closed and unonboarded accounts cannot mutate group records',()=>{
 for(const change of [{locked:true},{closed:true},{onboarded:false}]){
  const f=fixture(),g=collection(f).item,splitItem=split(f).item;Object.assign(f.L.state,change);const before=JSON.stringify(f.L.state.groupMoney),personal=ledger(f);
  assert.equal(collection(f,{idempotencyKey:'blocked-collection'}).ok,false);assert.equal(split(f,{idempotencyKey:'blocked-split'}).ok,false);
  assert.equal(receive(f,g,'abena','10','blocked-receipt').ok,false);assert.equal(f.G.cancel(g.id).ok,false);assert.equal(f.G.refund(g.id).ok,false);assert.equal(f.G.cancel(splitItem.id).ok,false);
  assert.equal(JSON.stringify(f.L.state.groupMoney),before);assert.equal(ledger(f),personal);clean(f);
 }
});
check('records persist under this edition and never leak to another profile identity',()=>{
 const f=fixture(),g=collection(f).item;assert(receive(f,g,'abena','10','persist-ref').ok);f.L.save();
 const saved=JSON.parse(f.h.store.get(storageKey));assert.equal(saved.groupMoney.items.length,1);assert.equal(saved.groupMoney.items[0].id,g.id);
 f.L.state.profile.account='different-account';assert.equal(f.G.list().length,0);assert.equal(f.G.get(g.id),null);assert.equal(receive(f,g,'abena','10','other-profile').ok,false);clean(f);
});
check('shared details disclose the same-device sample boundary without a bank protection promise',()=>{
 const f=fixture(),s=split(f).item,c=collection(f).item;
 for(const item of [s,c]){const text=f.G.shareText(item.id);assert.equal(typeof text,'string');assert.match(text,/sample|preview/i);assert.match(text,/no real|not.*payable|same.device/i);assert.doesNotMatch(text,/held with GCB|bank.guaranteed|insured funds/i);}
 clean(f);
});

check('shipped module order loads the engine and UI after the existing product adapters',()=>{
 assert(modules.includes('group-money-engine.js'));assert(modules.includes('group-money-ui.js'));
 assert(modules.indexOf('group-money-engine.js')>modules.indexOf('shared-expenses.js'));
 assert(modules.indexOf('group-money-ui.js')>modules.indexOf('group-money-engine.js'));
});
check('Request Money opens a clean chooser and preserves the individual request journey',()=>{
 const f=fixture();f.L.newRequest();f.h.flush();assert.equal(f.L.route,'groupMoneyHome');
 for(const text of ['One person','Split an expense','Collect together'])assert(visible(f).includes(text));
 click(f,'One personAsk someone for a specific amount');assert.equal(f.L.route,'requestCreate');assert(f.L.state.requestDraft);assert.equal(f.L.state.requests.length,0);clean(f);
});
check('the mounted manual split includes the payer, supports exact custom shares and creates once',()=>{
 const f=fixture(),before=ledger(f);f.L.gm.startSplit();f.h.flush();assert.equal(f.L.route,'groupMoneySplit');
 f.h.set('gm-title','Project materials');f.h.set('gm-total','90.01');f.L.gm.next();f.h.flush();assert.equal(f.L.route,'groupMoneyPeople');
 f.h.set('gm-name-1','Abena');f.L.gm.addPerson();f.h.flush();f.h.set('gm-name-2','Kojo');f.L.gm.setMode('custom');f.h.flush();
 f.h.set('gm-share-0','20.01');f.h.set('gm-share-1','25');f.h.set('gm-share-2','45');f.L.gm.next();f.h.flush();assert.equal(f.L.route,'groupMoneyReview');
 assert(visible(f).includes('GH₵90.01'));assert(visible(f).includes('GH₵20.01'));assert(visible(f).includes('No real money moves'));
 f.L.gm.edit('people');f.h.flush();assert.equal(f.h.document.getElementById('gm-share-0').value,'20.01');f.L.gm.next();f.h.flush();
 click(f,'Create split');const g=f.G.list()[0];assert.equal(f.L.route,'groupMoneyDetail');assert.equal(g.people.find(p=>p.isOwner).amountCents,2001);assert.equal(f.G.summary(g).dueCents,7000);
 f.L.gm.create();f.h.flush();assert.equal(f.G.list().length,1);assert.equal(ledger(f),before);clean(f);
});
check('split form errors retain the draft and changing people recomputes equal shares',()=>{
 const f=fixture();f.L.gm.startSplit();f.h.flush();f.h.set('gm-title','Dinner');f.h.set('gm-total','30.01');f.L.gm.next();f.h.flush();
 f.L.gm.next();f.h.flush();assert.equal(f.L.route,'groupMoneyPeople');assert(f.h.document.getElementById('error').textContent.includes('name'));
 f.h.set('gm-name-1','Abena');f.L.gm.addPerson();f.h.flush();f.h.set('gm-name-2','Kojo');f.L.gm.capture();
 assert.equal(f.L.state.groupMoney.draft.people[0].amount,'10.01');assert.equal(f.L.state.groupMoney.draft.people[1].amount,'10.00');
 f.L.gm.removePerson(1);f.h.flush();assert.equal(f.h.document.getElementById('gm-name-1').value,'Kojo');assert.equal(f.L.state.groupMoney.draft.people[0].amount,'15.01');
 assert.equal(f.G.list().length,0);clean(f);
});
check('a mounted collection tracks partial samples, caps the target, and refunds through confirmation',()=>{
 const f=fixture(),before=ledger(f);f.L.gm.startCollection();f.h.flush();f.h.set('gm-title','Cape Coast trip');f.h.set('gm-target','100');f.h.set('gm-deadline',future(f));f.L.gm.next();f.h.flush();
 f.h.set('gm-name-1','Abena');f.L.gm.next();f.h.flush();assert.equal(f.L.route,'groupMoneyReview');click(f,'Agree & create collection');
 const g=f.G.list()[0],friend=g.people.find(p=>!p.isOwner);assert.equal(f.G.summary(g).receivedCents,0);assert(visible(f).includes('Collection account balance'));acceptMembers(f,g);
 f.L.gm.showSample(g.id,friend.id);f.h.flush();assert(visible(f).includes('No one is contacted or charged'));f.h.set('gm-sample-amount','60');click(f,'Record sample payment');assert.equal(f.G.summary(g).receivedCents,6000);
 f.L.gm.showSample(g.id,friend.id);f.h.flush();f.h.set('gm-sample-amount','40.01');click(f,'Record sample payment');assert.equal(f.L.route,'groupMoneySample');assert.equal(f.G.summary(g).receivedCents,6000);assert(f.h.document.getElementById('error').textContent.includes('40.00'));
 f.L.go('groupMoneyRules',{id:g.id,action:'cancel'});f.h.flush();assert(visible(f).includes('New contributions will stop'));click(f,'Confirm cancellation');assert.equal(f.G.summary(g).status,'cancelled');
 f.L.go('groupMoneyRules',{id:g.id,action:'refund'});f.h.flush();assert(visible(f).includes('original sample sources'));click(f,'Record sample refunds');assert.equal(f.G.summary(g).status,'refunded');assert.equal(f.G.summary(g).refundedCents,6000);
 f.L.go('groupMoneyRules',{id:g.id});f.h.flush();assert(visible(f).includes('Sample payment'));assert(visible(f).includes('Sample refund'));assert.equal(ledger(f),before);clean(f);
});

check('saved groups preserve only people, include the payer once, and keep money records separate',()=>{
 const f=fixture(),item=split(f).item,before=ledger(f),result=f.G.saveTemplate({name:'Project team',people:item.people});assert(result.ok,result.error);
 const group=result.template;assert.equal(group.people.filter(p=>p.isOwner).length,1);assert.equal(group.people.length,3);
 assert(group.people.every(p=>!('amount' in p)&&!('amountCents' in p)&&!('payments' in p)));
 assert.equal(f.G.saveTemplate({name:' PROJECT TEAM ',people:people()}).ok,false);
 assert.equal(f.G.saveTemplate({name:'Duplicate people',people:[...people(),{id:'again',name:'ABENA'}]}).ok,false);
 f.L.save();const saved=JSON.parse(f.h.store.get(storageKey));assert.equal(saved.groupMoney.templates[0].id,group.id);assert.equal(ledger(f),before);
 assert(f.G.deleteTemplate(group.id).ok);assert.equal(f.G.templates().length,0);assert.equal(f.G.list()[0].id,item.id);assert.equal(ledger(f),before);clean(f);
});
check('saved groups and selected contacts remain owner-scoped and reject locked mutations',()=>{
 const f=fixture(),g=f.G.saveTemplate({name:'Friends',people:people()}).template;assert(f.G.rememberPeople([{id:'friend',name:'Adwoa',phone:'0240000000',email:'private@example.test',amountCents:9999}]).ok);
 const contact=f.L.state.groupMoney.contacts[0];assert.deepEqual(Object.keys(contact).sort(),['id','isOwner','name','ownerKey','selectedAt']);
 const before=JSON.stringify(f.L.state.groupMoney);f.L.state.locked=true;
 assert.equal(f.G.saveTemplate({name:'Blocked',people:people()}).ok,false);assert.equal(f.G.deleteTemplate(g.id).ok,false);assert.equal(f.G.rememberPeople([{name:'Esi'}]).ok,false);assert.equal(JSON.stringify(f.L.state.groupMoney),before);
 f.L.state.locked=false;f.L.state.profile.account='another-profile';assert.equal(f.G.templates().length,0);assert.equal(f.G.recentPeople().length,0);assert.equal(f.G.deleteTemplate(g.id).ok,false);clean(f);
});
check('recent people use group and explicit person-payment identities, never bank transfer descriptions',()=>{
 const f=fixture();split(f);f.L.state.requests=[{from:'self',to:'Abena',name:f.L.state.profile.name},{from:'esi',to:'self',name:'Esi Mensah'}];f.L.state.txs=[{type:'out',status:'success',name:'Kojo',method:'Lumo transfer',recipientKey:'lumo||@kojo.o'},{type:'out',status:'success',name:'Yaw Owusu',method:'Lumo transfer',recipientKey:'lumo||@yaw.o'},{type:'out',status:'success',name:'Unidentified transfer',method:'Lumo transfer'},{type:'in',status:'success',name:'Allowance from Mum',method:'Bank transfer'},{type:'out',status:'success',name:'Tuition payment',method:'Bank transfer'},{type:'out',status:'failed',name:'Failed person payment',method:'Lumo transfer',recipientKey:'lumo||@failed'},{type:'out',status:'success',name:'Campus Print',method:'Campus Pay'},{type:'out',status:'success',name:'Internal',method:'Lumo transfer',recipientKey:'lumo||@internal',internal:true}];
 const names=f.G.recentPeople().map(p=>p.name);assert.equal(names.filter(n=>n==='Abena').length,1);assert.equal(names.filter(n=>n==='Kojo').length,1);assert(names.includes('Esi Mensah'));assert(names.includes('Yaw Owusu'));
 for(const label of ['Allowance from Mum','Tuition payment','Unidentified transfer','Failed person payment','Campus Print','Internal','You'])assert(!names.includes(label),'Not a contact: '+label);
 f.L.gm.startCollection();f.h.flush();f.h.set('gm-title','Trip');f.h.set('gm-target','100');f.L.gm.next();f.h.flush();f.L.gm.openPeople('recent');f.h.flush();assert(visible(f).includes('Recent person'));assert(!visible(f).includes('Used in a previous group'));assert(!visible(f).includes('Allowance from Mum'));clean(f);
});
check('the people picker selects app contacts without touching a payment draft and cancellation preserves fields',()=>{
 const f=fixture(),before=ledger(f);f.L.state.paymentDraft={id:'keep-payment',amount:42};const payment=JSON.stringify(f.L.state.paymentDraft);
 f.L.gm.startSplit();f.h.flush();f.h.set('gm-title','Dinner');f.h.set('gm-total','30.01');f.L.gm.next();f.h.flush();f.h.set('gm-name-1','Esi');f.L.gm.openPeople('recent');f.h.flush();
 assert.equal(f.L.route,'groupMoneyContacts');f.L.gm.peopleTab('lumo');f.h.flush();assert(visible(f).includes('Abena Asante'));assert(visible(f).includes('Kojo Owusu'));assert(!visible(f).includes('Choose from phone'));
 f.L.gm.togglePerson('lumo-abena');f.h.flush();f.L.gm.addSelected();f.h.flush();assert.equal(f.L.route,'groupMoneyPeople');const d=f.L.state.groupMoney.draft;assert.equal(d.people.length,3);assert.equal(d.people[1].name,'Esi');assert.equal(d.people[2].name,'Abena Asante');assert.equal(d.people[0].amount,'10.01');
 f.L.gm.openPeople('lumo');f.h.flush();f.L.gm.togglePerson('lumo-kojo');f.h.flush();f.L.gm.backToPeople();f.h.flush();assert.equal(d.people.length,3);assert.equal(f.h.document.getElementById('gm-name-1').value,'Esi');assert.equal(JSON.stringify(f.L.state.paymentDraft),payment);assert.equal(ledger(f),before);clean(f);
});
check('using a saved group resets custom shares explicitly and rounds a fresh expense correctly',()=>{
 const f=fixture(),g=f.G.saveTemplate({name:'Study team',people:people()}).template;f.L.gm.startSplit();f.h.flush();f.h.set('gm-title','Printing');f.h.set('gm-total','10.01');f.L.gm.next();f.h.flush();f.h.set('gm-name-1','Esi');f.L.gm.setMode('custom');f.h.flush();f.h.set('gm-share-0','1');f.h.set('gm-share-1','9.01');
 f.L.gm.openPeople('groups');f.h.flush();assert(visible(f).includes('starts with equal shares'));f.L.gm.useGroup(g.id);f.h.flush();const d=f.L.state.groupMoney.draft;
 assert.equal(d.mode,'equal');assert.equal(d.people.filter(p=>p.isOwner).length,1);assert.equal(d.people.length,3);assert.equal(d.people[0].amount,'3.35');assert.equal(d.people[1].amount,'3.33');assert.equal(d.people[2].amount,'3.33');assert(visible(f).includes('Choose amounts to adjust them'));
 f.L.gm.next();f.h.flush();assert.equal(f.L.route,'groupMoneyReview');assert(visible(f).includes('GH₵10.01'));assert.equal(f.G.list().length,0);clean(f);
});
check('saving and removing a reusable group uses actual confirmation pages',()=>{
 const f=fixture();f.L.gm.startCollection();f.h.flush();f.h.set('gm-title','Trip');f.h.set('gm-target','100');f.L.gm.next();f.h.flush();f.h.set('gm-name-1','Abena');f.L.gm.openSaveGroup();f.h.flush();assert.equal(f.L.route,'groupMoneySaveGroup');f.h.set('gm-group-name','Weekend friends');click(f,'Save group');assert.equal(f.G.templates().length,1);assert.equal(f.L.route,'groupMoneyPeople');
 f.L.gm.openPeople('groups');f.h.flush();const g=f.G.templates()[0];f.L.go('groupMoneyRemoveGroup',{id:g.id});f.h.flush();assert(visible(f).includes('Existing splits, collections'));click(f,'Keep group');assert.equal(f.G.templates().length,1);f.L.go('groupMoneyRemoveGroup',{id:g.id});f.h.flush();click(f,'Remove group');assert.equal(f.G.templates().length,0);assert.equal(f.G.list().length,0);clean(f);
});

(async()=>{
 const asyncCheck=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 await asyncCheck('phone contacts request only selected names after an explicit action, with a safe fallback',async()=>{
  const f=fixture();let calls=0,requested,resolve;f.h.context.isSecureContext=true;f.h.context.top=f.h.context;f.h.context.navigator.contacts={select:(props,options)=>{calls++;requested={props:[...props],options};return new Promise(done=>{resolve=done;});}};
  f.L.gm.startSplit();f.h.flush();f.h.set('gm-title','Food');f.h.set('gm-total','30');f.L.gm.next();f.h.flush();f.L.gm.openPeople('recent');f.h.flush();assert.equal(calls,0,'render never reads the address book');assert(visible(f).includes('Choose from phone'));
  const pending=f.L.gm.pickDevice();assert.equal(calls,1);assert.deepEqual(requested.props,['name']);assert.equal(requested.options.multiple,true);resolve([{name:['Adwoa'],tel:['0240000000'],email:['private@example.test']}]);await pending;f.h.flush();assert.equal(f.L.state.groupMoney.contacts.length,0,'selection is reviewed before adding');assert(visible(f).includes('Adwoa'));click(f,'Add selected (1)');assert.equal(f.L.state.groupMoney.draft.people[1].name,'Adwoa');assert(!JSON.stringify(f.L.state.groupMoney).includes('0240000000'));assert(!JSON.stringify(f.L.state.groupMoney).includes('private@example.test'));clean(f);
 });
 await asyncCheck('late contact results cannot overwrite another draft, account, locked state or screen',async()=>{
  for(const change of ['draft','account','locked','route']){
   const f=fixture();let resolve;f.h.context.isSecureContext=true;f.h.context.top=f.h.context;f.h.context.navigator.contacts={select:()=>new Promise(done=>{resolve=done;})};
   f.L.gm.startSplit();f.h.flush();f.h.set('gm-title','Food');f.h.set('gm-total','30');f.L.gm.next();f.h.flush();f.L.gm.openPeople('recent');f.h.flush();const pending=f.L.gm.pickDevice();
   if(change==='draft'){f.L.state.groupMoney.draft=null;f.L.gm.startCollection();f.h.flush();}if(change==='account')f.L.state.profile.account='new-owner';if(change==='locked')f.L.state.locked=true;if(change==='route'){f.L.gm.backToPeople();f.h.flush();}
   const before=JSON.stringify(f.L.state.groupMoney);resolve([{name:['Late Person']}]);await pending;f.h.flush();assert.equal(JSON.stringify(f.L.state.groupMoney),before,change+' ignores stale contact selection');clean(f);
  }
 });
 console.log(passed+' group-money accounting and protection checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
