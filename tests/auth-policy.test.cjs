'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const root=path.resolve(__dirname,'../dist'),key=fs.readFileSync(path.join(root,'core.js'),'utf8').match(/const key='([^']+)'/)[1];
function boot({shared=new Map(),control={},date}={}){
 const h=createHarness({modules:[],clock:true});h.store=shared;h.control=control;if(date)h.context.Date=date;h.context.navigator.onLine=true;
 h.context.localStorage={getItem:k=>shared.get(k)||null,setItem:(k,v)=>{if(control.writeFail)throw Error('Quota exceeded');shared.set(k,String(v));},removeItem:k=>shared.delete(k)};
 for(const file of ['core.js','auth-policy.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),h.context,{filename:file});h.L=h.context.L;h.L.views.home=()=>'<h1>Home</h1>';h.L.views.help=()=>'<h1>Help</h1>';h.L.views.welcome=()=>'<h1>Welcome</h1>';h.L.views.signin=()=>'<h1>Sign in</h1>';return h;
}
function account(){const h=boot();h.L.state.onboarded=true;h.L.state.profile.pin='123456';h.L.state.profile.phone='0241230123';h.L.state.balance=100;assert(h.L.save());return h;}
const verify=(h,pin='654321',options={})=>h.L.authPolicy.verify(pin,options);

test('all account purposes share five saved attempts and a persistent sixty-second cooldown',()=>{
 const h=account();for(let i=1;i<=5;i++){const result=verify(h,'654321',{purpose:i<3?'account:dataExport':i<5?'payment':'signin',allowLocked:true});assert.equal(result.ok,false);assert.equal(result.remaining,5-i);assert.equal(result.failures,i);}
 const locked=h.L.authPolicy.status();assert.equal(locked.coolingDown,true);assert.equal(locked.seconds,60);assert.equal(h.L.state.locked,true);const saved=JSON.parse(h.store.get(key));assert.equal(saved.credentialPolicy.failures,5);assert.equal(saved.credentialPolicy.blockedUntil,locked.blockedUntil);h.L.go('help');h.L.go('welcome');assert.equal(h.L.authPolicy.status().blockedUntil,locked.blockedUntil);
 const again=boot({shared:h.store,date:h.context.Date});assert.equal(again.L.authPolicy.status().coolingDown,true);assert.equal(verify(again,'123456',{allowLocked:true,purpose:'signin'}).ok,false);h.advance(60001);const result=verify(again,'123456',{allowLocked:true,purpose:'signin'});assert.equal(result.ok,true);assert.equal(result.failures,0);assert.equal(result.coolingDown,false);assert.equal(again.L.state.locked,true,'The sign-in controller, not a bare PIN check, unlocks account access');assert.equal(JSON.parse(h.store.get(key)).credentialPolicy.failures,0);assert.deepEqual(h.errors,[]);assert.deepEqual(again.errors,[]);
});

test('cooldown neither resets on a valid PIN nor extends when attempts repeat before expiry',()=>{
 const h=account();for(let i=0;i<5;i++)verify(h);const until=h.L.authPolicy.status().blockedUntil;h.advance(30000);assert.equal(verify(h,'123456',{allowLocked:true}).ok,false);assert.equal(verify(h,'654321',{allowLocked:true}).ok,false);assert.equal(h.L.authPolicy.status().blockedUntil,until);assert.equal(h.L.authPolicy.status().seconds,30);assert.equal(h.L.authPolicy.status().failures,5);
});

test('malformed credentials never approve or count as complete six-digit PIN guesses',()=>{
 const h=account();for(const value of ['','1','12345','1234567','abcdef',null]){const result=verify(h,value);assert.equal(result.ok,false);assert.equal(result.remaining,5);}assert.equal(h.L.authPolicy.status().failures,0);assert.equal(verify(h,'123456',{purpose:'statement'}).ok,true);
});

test('correct PIN resets the saved shared failure count but cannot unlock a locked session by default',()=>{
 const h=account();verify(h);verify(h);assert.equal(h.L.authPolicy.status().failures,2);const result=verify(h,'123456',{purpose:'account:changePin'});assert.equal(result.ok,true);assert.equal(result.purpose,'account:changePin');assert.equal(JSON.parse(h.store.get(key)).credentialPolicy.failures,0);h.L.state.locked=true;h.L.save();assert.equal(verify(h,'123456').ok,false);assert.equal(verify(h,'123456',{allowLocked:true,purpose:'signin'}).ok,true);assert.equal(h.L.state.locked,true);
});

test('a quota failure blocks approval and preserves attempts until explicit saving recovery',()=>{
 const h=account();h.control.writeFail=true;const failed=verify(h);assert.equal(failed.ok,false);assert.match(failed.message,/could not save/);assert.equal(h.L.persistence.status().saveFailed,true);assert.equal(verify(h,'123456').ok,false);h.control.writeFail=false;assert(h.L.persistence.retrySave());assert.equal(JSON.parse(h.store.get(key)).credentialPolicy.failures,1);assert.equal(verify(h,'123456').ok,true);assert.equal(JSON.parse(h.store.get(key)).credentialPolicy.failures,0);
});

test('a stale account snapshot cannot approve or reset the saved credential policy',()=>{
 const a=account(),b=boot({shared:a.store,date:a.context.Date});verify(a);const saved=a.store.get(key);const result=verify(b,'123456');assert.equal(result.ok,false);assert.match(result.message,/latest saved progress/);assert.equal(b.L.authPolicy.reset(),false);assert.equal(a.store.get(key),saved);
});
