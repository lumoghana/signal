'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const root=path.resolve(__dirname,'../dist'),key=fs.readFileSync(path.join(root,'core.js'),'utf8').match(/const key='([^']+)'/)[1];
const clone=value=>JSON.parse(JSON.stringify(value));
const sequence=()=>[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script\b[^>]*\bsrc="\/([^"?]+)(?:\?[^" ]*)?"/g)].map(match=>match[1]);
function boot({shared=new Map(),control={},modules,locks,clock=false}={}){
 const h=createHarness({modules:[],clock});h.store=shared;h.control=control;h.context.navigator.onLine=true;if(locks)h.context.navigator.locks=locks;
 h.context.localStorage={getItem:k=>{if(control.readFail)throw Error('Storage unavailable');return shared.get(k)||null;},setItem:(k,v)=>{control.writeAttempts=(control.writeAttempts||0)+1;if(control.writeFail)throw Error('Quota exceeded');shared.set(k,String(v));},removeItem:k=>shared.delete(k)};
 for(const file of modules||sequence())vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),h.context,{filename:file});h.L=h.context.L;h.flush();return h;
}
function lived(options){const h=boot(options);h.L.explore();h.flush();assert.equal(h.L.persistence.status().blocked,false);return h;}
function outgoing(id,amount=10,status='success'){return {draftId:id,type:'out',name:'Durability sample',amount,fee:0,status,category:'Other'};}
const current=h=>JSON.parse(h.store.get(key));
const clean=h=>assert.deepEqual(h.errors,[]);

test('a stale shared-storage tab cannot erase a committed payment by navigating or paying',()=>{
 const a=lived(),shared=a.store,b=boot({shared});assert(a.L.persistence.reloadLatest());const before=a.L.state.balance;
 const tx=a.L.addTx(outgoing('durable-tab-a'));assert.equal(tx.status,'success');const committed=shared.get(key);assert.equal(current(a).balance,before-10);
 b.L.go('plan');b.flush();assert.equal(shared.get(key),committed);assert.equal(b.L.persistence.status().reason,'stale');assert.throws(()=>b.L.addTx(outgoing('durable-tab-b',20)),/saved-progress|other Lumo tab/i);assert.equal(shared.get(key),committed);
 assert(b.L.persistence.reloadLatest());b.L.render();b.flush();assert.equal(b.L.persistence.status().blocked,false);b.L.addTx(outgoing('durable-tab-b',20));assert.equal(current(b).balance,before-30);assert.equal(current(b).txs.filter(t=>/^durable-tab-/.test(t.draftId||'')).length,2);clean(a);clean(b);
});

test('storage events ignore foreign/unchanged values and block a newer same-account snapshot immediately',()=>{
 const h=lived(),saved=h.store.get(key);h.emit('storage',{key:'another-edition',newValue:'different'});assert.equal(h.L.persistence.status().blocked,false);h.emit('storage',{key,newValue:saved});assert.equal(h.L.persistence.status().blocked,false);const newer=clone(current(h));newer.balance++;const raw=JSON.stringify(newer);h.store.set(key,raw);h.emit('storage',{key,newValue:raw});assert.equal(h.L.persistence.status().reason,'stale');assert.equal(h.L.save(),false);assert.equal(h.store.get(key),raw);clean(h);
});

test('real quota rejection rolls back final addTx chain and retry commits the same draft only once',()=>{
 const h=lived(),before=clone(h.L.state),saved=h.store.get(key);h.control.writeFail=true;
 assert.throws(()=>h.L.addTx(outgoing('durable-quota')),/could not be saved|not committed/i);assert.deepEqual(clone(h.L.state),before);assert.equal(h.store.get(key),saved);assert.equal(h.L.persistence.status().saveFailed,true);assert.throws(()=>h.L.addTx(outgoing('durable-quota')),/saved-progress/i);
 h.control.writeFail=false;assert.equal(h.L.persistence.retrySave(),true);const tx=h.L.addTx(outgoing('durable-quota'));assert.equal(tx.status,'success');assert.equal(current(h).balance,before.balance-10);const revision=h.L.persistence.status().revision;h.L.addTx(outgoing('durable-quota'));assert.equal(current(h).txs.filter(t=>t.draftId==='durable-quota').length,1);assert.equal(current(h).balance,before.balance-10);assert.equal(h.L.persistence.status().revision,revision);clean(h);
});

test('pending settlement quota failure preserves its reservation/reference for one safe retry',()=>{
 const h=lived(),before=h.L.state.balance,tx=h.L.addTx(outgoing('durable-pending',20,'pending')),saved=h.store.get(key);assert.equal(h.L.balances().held,20);h.control.writeFail=true;
 assert.throws(()=>h.L.resolveTx(tx.id,'success'),/could not be saved|not committed/i);assert.equal(h.L.state.txs.find(t=>t.id===tx.id).status,'pending');assert.equal(h.L.state.balance,before);assert.equal(h.store.get(key),saved);
 h.control.writeFail=false;assert(h.L.persistence.retrySave());h.L.resolveTx(tx.id,'success');h.L.resolveTx(tx.id,'success');assert.equal(current(h).balance,before-20);assert.equal(current(h).txs.filter(t=>t.id===tx.id).length,1);clean(h);
});

test('a swallowed nested failure still aborts the complete outer transaction',()=>{
 const h=lived(),before=clone(h.L.state),saved=h.store.get(key);
 assert.throws(()=>h.L.persistence.transaction(()=>{try{h.L.persistence.transaction(()=>{h.L.state.balance-=25;h.L.save();throw Error('Nested feature failed');},{financial:true});}catch{}h.L.state.lateFeature='must roll back';h.L.save();return {ok:true};},{financial:true}),/Nested feature failed/);
 assert.deepEqual(clone(h.L.state),before);assert.equal(h.store.get(key),saved);clean(h);
});

test('late feature work and errors are enclosed when the final boundary loads after the wrappers',()=>{
 const modules=require('./helpers/shipped-entry.cjs').scripts(path.resolve(root,'..')).filter(file=>file!=='persistence-recovery.js');const h=lived({modules});const before=clone(h.L.state),saved=h.store.get(key);const add=h.L.addTx;let fail=true;
 h.L.addTx=function(...args){const result=add.apply(this,args);h.L.state.lateFeature='new receipt fact';h.L.save();if(fail)throw Error('Late feature failed');return result;};
 vm.runInContext(fs.readFileSync(path.join(root,'persistence-recovery.js'),'utf8'),h.context,{filename:'persistence-recovery.js'});
 assert.throws(()=>h.L.addTx(outgoing('durable-late')),/Late feature failed/);assert.deepEqual(clone(h.L.state),before);assert.equal(h.store.get(key),saved);fail=false;h.L.addTx(outgoing('durable-late'));assert.equal(current(h).balance,before.balance-10);assert.equal(current(h).lateFeature,'new receipt fact');assert.equal(current(h).txs.filter(t=>t.draftId==='durable-late').length,1);clean(h);
});

test('offline boot guards work before platform runtime and a caught inner rejection cannot commit',()=>{
 const h=lived({modules:['core.js']}),before=clone(h.L.state),saved=h.store.get(key);h.context.navigator.onLine=false;
 assert.throws(()=>h.L.addTx(outgoing('offline-no-platform')),/Reconnect/);assert.throws(()=>h.L.persistence.transaction(()=>{try{h.L.persistence.transaction(()=>h.L.addTx(outgoing('offline-inner')),{financial:true});}catch{}h.L.state.mustNotSave=true;h.L.save();}),/Reconnect/);assert.deepEqual(clone(h.L.state),before);assert.equal(h.store.get(key),saved);
 h.context.navigator.onLine=true;const meta=h.document.createElement('meta');meta.setAttribute('name','lumo-shell-offline');meta.setAttribute('content','true');h.document.body.append(meta);assert.throws(()=>h.L.addTx(outgoing('cached-offline')),/Reconnect/);assert.equal(h.store.get(key),saved);clean(h);
});

test('corrupt saved JSON is preserved and exposed as unreadable instead of a fresh successful account',()=>{
 const shared=new Map([[key,'{broken saved sample']]),h=boot({shared,modules:['core.js']});assert.equal(h.L.persistence.status().reason,'unreadable');assert.equal(h.L.save(),false);assert.equal(shared.get(key),'{broken saved sample');h.context.confirm=()=>false;assert.equal(h.L.persistence.resetUnreadable(),false);assert.equal(shared.get(key),'{broken saved sample');clean(h);
});

test('quota recovery covers active task, keeps unfinished details private and restores focus',()=>{
 const h=lived();h.L.go('feedback');h.flush();const field=h.document.getElementById('feedbackText');assert(field);field.value='My unfinished feedback';field.focus();h.L.state.paymentDraft={id:'not-submitted',name:'Sample recipient',amount:12,fee:1,note:'Lunch',pin:'987654',authToken:'not-exported'};assert(h.L.save());const before=clone(h.L.state);h.control.writeFail=true;assert.throws(()=>h.L.addTx(outgoing('quota-ui')),/could not be saved|not committed/i);h.L.persistenceRecovery.sync();const overlay=h.document.getElementById('persistence-recovery');assert(overlay);assert.equal(h.document.getElementById('app').inert,true);assert.equal(h.document.activeElement,overlay);
 h.L.persistenceRecovery.details();const details=h.document.getElementById('persistence-copy-details').value;assert.match(details,/Sample recipient/);assert(!details.includes('987654'));assert(!details.includes('not-exported'));assert.equal(h.document.getElementById('feedbackText'),field);assert.equal(field.value,'My unfinished feedback');assert.deepEqual(clone(h.L.state),before);
 const controls=overlay.querySelectorAll('button:not(:disabled),textarea');controls[0].focus();const middleTab=new h.Event('keydown',{key:'Tab'});controls[0].dispatchEvent(middleTab);assert.equal(middleTab.defaultPrevented,false,'A retained native task cannot prevent ordinary Tab between recovery controls');controls.at(-1).focus();h.key('Tab');assert.equal(h.document.activeElement,controls[0]);h.key('Tab',{shiftKey:true});assert.equal(h.document.activeElement,controls.at(-1));const route=h.L.route;h.key('Escape');assert.equal(h.L.route,route);assert.equal(h.document.getElementById('persistence-recovery'),overlay);
 h.control.writeFail=false;h.L.persistenceRecovery.retry(overlay.querySelector('button'));assert.equal(h.document.getElementById('persistence-recovery'),null);assert.equal(h.document.getElementById('app').inert,false);assert.equal(h.document.activeElement,field);assert.equal(field.value,'My unfinished feedback');clean(h);
});

test('stale recovery provides latest-progress action while preserving the newer saved snapshot',()=>{
 const a=lived(),b=boot({shared:a.store});assert(a.L.persistence.reloadLatest());a.L.addTx(outgoing('stale-recovery'));const saved=a.store.get(key);assert.equal(b.L.persistence.ensureCurrent(),false);b.L.persistenceRecovery.sync();const overlay=b.document.getElementById('persistence-recovery');assert(overlay);assert.match(overlay.textContent,/Newer progress is saved/);assert.match(overlay.textContent,/Load latest progress/);assert.equal(b.document.getElementById('app').inert,true);assert.equal(a.store.get(key),saved);assert(b.L.persistence.reloadLatest());b.L.persistenceRecovery.sync();assert.equal(b.document.getElementById('persistence-recovery'),null);assert.equal(b.document.getElementById('app').inert,false);assert(b.L.state.txs.some(tx=>tx.draftId==='stale-recovery'));clean(a);clean(b);
});

test('recovery keeps the underlying QR task when Escape is pressed',()=>{
 const h=lived();h.L.qr.open({mode:'code'});h.flush();assert.equal(h.L.qr.isOpen(),true);const route=h.L.route,params=clone(h.L.params);h.control.writeFail=true;assert.throws(()=>h.L.addTx(outgoing('quota-qr')),/could not be saved|not committed/i);h.L.persistenceRecovery.sync();const overlay=h.document.getElementById('persistence-recovery');assert(overlay);h.key('Escape');assert.equal(h.L.route,route);assert.deepEqual(clone(h.L.params),params);assert.equal(h.L.qr.isOpen(),true);assert.equal(h.document.getElementById('persistence-recovery'),overlay);assert.equal(h.document.getElementById('app').inert,true);clean(h);
});

test('Web Locks grants one writer, releases on pagehide and allows a closed owner to hand off',async()=>{
 const held=new Map();const locks={request(name,options,callback){assert.equal(options.ifAvailable,true);return Promise.resolve().then(async()=>{if(held.has(name))return callback(null);const lock={name};held.set(name,lock);try{return await callback(lock);}finally{if(held.get(name)===lock)held.delete(name);}});}};
 const shared=new Map(),a=boot({shared,modules:['core.js'],locks});assert.equal(await a.L.persistence.requestWriter(),true);a.flush();assert.equal(a.L.persistence.status().writerMode,'writer');const b=boot({shared,modules:['core.js'],locks});assert.equal(await b.L.persistence.requestWriter(),false);assert.equal(b.L.persistence.status().reason,'another-tab');assert.equal(b.L.save(),false);a.emit('pagehide');await new Promise(resolve=>setImmediate(resolve));assert.equal(held.size,0);assert.equal(await b.L.persistence.requestWriter(),true);b.flush();assert.equal(b.L.persistence.status().writerMode,'writer');assert.equal(b.L.persistence.status().blocked,false);assert.equal(a.L.save(),false);b.emit('pagehide');await new Promise(resolve=>setImmediate(resolve));assert.equal(held.size,0);clean(a);clean(b);
});
