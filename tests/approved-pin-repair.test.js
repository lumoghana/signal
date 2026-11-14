import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createApprovedService} from '../dist/js/approved-service.js';
import {openTestPinRepair,bindTestPinRepairEntry} from '../dist/js/account-ui.js';

const ownerA='11111111-1111-4111-8111-111111111111',ownerB='22222222-2222-4222-8222-222222222222';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};};
const response=value=>({ok:true,status:200,json:async()=>value});
const signed=owner=>({ok:true,session:{access_token:'token-'+owner,refresh_token:'refresh-'+owner,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:owner}},state:{owner,wallet:100},account:{handle:owner===ownerA?'first.test':'second.test'}});
const eligible={ok:true,eligible:true,repaired:false,testOnly:true};

test('test PIN repair uses direct owner-bound step-up and never journals its password or new PIN',async()=>{
  const storage=memory(),calls=[];
  const service=createApprovedService({storage,modeStorage:memory(),fetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push({body,headers:options.headers});return response(body.action==='login'?signed(ownerA):body.action==='pinRepairStatus'?eligible:{ok:true,state:{owner:ownerA,wallet:100},result:{ok:true,message:'Test PIN set.'}});}});
  await service.login('first.test','login-only-test-password');
  assert.equal((await service.pinRepairStatus()).eligible,true);
  const result=await service.repairTestPin('current-step-up-test-password','0246');
  assert.equal(result.ok,true);assert.deepEqual(calls[2].body,{action:'repairTestPin',currentPassword:'current-step-up-test-password',newPin:'0246'});
  assert.equal(calls[2].headers.Authorization,'Bearer token-'+ownerA);
  assert.equal(storage.values.has('lumo-approved-pending-v1'),false);
  assert.equal([...storage.values.values()].some(value=>/login-only-test-password|current-step-up-test-password|0246/.test(value)),false);
  const before=calls.length;
  for(const pin of ['246','02460',246,null])assert.equal((await service.repairTestPin('test-password',pin)).ok,false);
  assert.equal(calls.length,before);
});

test('a late repair response cannot replace a newer signed-in account',async()=>{
  const pending=deferred(),snapshots=[];
  const service=createApprovedService({storage:memory(),modeStorage:memory(),onSnapshot:state=>snapshots.push(state),fetch:async(url,options)=>{const body=JSON.parse(options.body);return body.action==='repairTestPin'?pending.promise:response(signed(body.handle==='first.test'?ownerA:ownerB));}});
  await service.login('first.test','test-password-a');const work=service.repairTestPin('test-password-a','0246');await tick();
  await service.login('second.test','test-password-b');pending.resolve(response({ok:true,state:{owner:ownerA,wallet:100},result:{ok:true}}));
  const result=await work;assert.equal(result.code,'ACCOUNT_CHANGED');assert.equal(service.user.id,ownerB);assert.equal(snapshots.at(-1).owner,ownerB);
});

function node(extra={}){return {value:'',hidden:false,disabled:false,isConnected:true,textContent:'',onclick:null,addEventListener(event,callback){this[event]=callback;},...extra};}
function formFixture({status=async()=>eligible,repair=async()=>({ok:true,result:{message:'Your test PIN is ready.'}}),verify=async()=>({ok:true})}={}){
  const calls=[],toasts=[],order=[],state={settings:{},wallet:100},draft={kept:'original'},shared={connected:true,signedIn:true,user:{id:ownerA},authVersion:1,
    pinRepairStatus:async()=>{calls.push({kind:'status'});return status();},
    repairTestPin:async(currentPassword,newPin)=>{calls.push({kind:'repair',currentPassword,newPin});return repair(currentPassword,newPin);},
    verifyPin:async pin=>{calls.push({kind:'verify',pin});return verify(pin);}};
  let current=null;
  const ctx={connected:true,shared,state,draft,route:{section:'life',page:'account-security'},toast:message=>toasts.push(message),refresh:()=>calls.push({kind:'refresh'}),
    act(){assert.fail('Repair must never apply a money action.');},actAsync(){assert.fail('Repair must never continue a money action.');},
    closeSheet(){const old=current;current=null;if(old){old.el.isConnected=false;old.options.onDispose?.();}},
    sheet(html,bind,options={}){
      ctx.closeSheet();const inputs={currentPassword:node(),newPin:node(),confirmPin:node()},form=node(),error=node(),submit=node(),cancel=node();
      const controls={'[data-test-pin-repair-form]':form,'[data-test-pin-repair-error]':error,'[data-test-pin-repair-submit]':submit,'[data-test-pin-repair-cancel]':cancel};
      const el=node({querySelector:selector=>selector.startsWith('[name=')?inputs[selector.slice(7,-2)]:controls[selector]});
      current={html,el,inputs,form,error,submit,cancel,options};order.push('repair-open');bind(el);
    }};
  return {ctx,shared,calls,toasts,order,state,draft,get current(){return current;},fill(password='step-up-test-password',pin='0246',confirm=pin){const f=current;f.inputs.currentPassword.value=password;f.inputs.newPin.value=pin;f.inputs.confirmPin.value=confirm;return f;},submit(){return current.form.onsubmit({preventDefault(){}});}};
}

test('repair form accepts matching leading-zero PIN, clears all three fields before sending, and never pays',async()=>{
  const pending=deferred(),f=formFixture({repair:()=>pending.promise});assert.equal(await openTestPinRepair(f.ctx),true);
  const form=f.fill(),originalDraft=JSON.stringify(f.draft);const work=f.submit();
  assert.equal(form.submit.disabled,true);assert.deepEqual(Object.values(form.inputs).map(input=>input.value),['','','']);
  assert.deepEqual(f.calls.filter(call=>call.kind==='repair'),[{kind:'repair',currentPassword:'step-up-test-password',newPin:'0246'}]);
  await f.submit();assert.equal(f.calls.filter(call=>call.kind==='repair').length,1);
  pending.resolve({ok:true,result:{message:'Your test PIN is ready.'}});await work;
  assert.equal(f.current,null);assert.deepEqual(f.toasts,['Your test PIN is ready.']);assert.equal(f.calls.filter(call=>call.kind==='refresh').length,1);assert.equal(JSON.stringify(f.draft),originalDraft);assert.equal(f.state.wallet,100);
});

test('mismatched and malformed repair PINs never reach the service and all submitted fields clear',async()=>{
  for(const pin of ['246','02460','24ab']){
    const f=formFixture();await openTestPinRepair(f.ctx);const form=f.fill('step-up-test-password',pin);await f.submit();
    assert.equal(f.calls.some(call=>call.kind==='repair'),false);assert.match(form.error.textContent,/four-digit/);assert.deepEqual(Object.values(form.inputs).map(input=>input.value),['','','']);
  }
  const f=formFixture();await openTestPinRepair(f.ctx);const form=f.fill('step-up-test-password','0246','0247');await f.submit();assert.equal(f.calls.some(call=>call.kind==='repair'),false);assert.match(form.error.textContent,/do not match/);
});

test('rejected password stays rejected without retaining credentials or claiming repair success',async()=>{
  const f=formFixture({repair:async()=>({ok:false,code:'CREDENTIALS_INCORRECT',message:'Your password could not be verified.'})});await openTestPinRepair(f.ctx);const form=f.fill();await f.submit();
  assert.equal(f.current,form);assert.equal(form.submit.disabled,false);assert.match(form.error.textContent,/could not be verified/);assert.deepEqual(f.toasts,[]);assert.deepEqual(Object.values(form.inputs).map(input=>input.value),['','','']);
});

test('closing or replacing the repair sheet clears its fields immediately',async()=>{
  const f=formFixture();await openTestPinRepair(f.ctx);const form=f.fill();f.ctx.closeSheet();assert.deepEqual(Object.values(form.inputs).map(input=>input.value),['','','']);
  await openTestPinRepair(f.ctx);const next=f.fill();f.ctx.sheet('replacement',()=>{});assert.deepEqual(Object.values(next.inputs).map(input=>input.value),['','','']);assert.equal(f.calls.some(call=>call.kind==='repair'),false);
});

test('identity changes before submission prevent repair and clear stale fields',async()=>{
  const f=formFixture();await openTestPinRepair(f.ctx);const form=f.fill();f.shared.user={id:ownerB};f.shared.authVersion++;
  await f.submit();assert.equal(f.calls.some(call=>call.kind==='repair'),false);assert.deepEqual(Object.values(form.inputs).map(input=>input.value),['','','']);assert.deepEqual(f.toasts,[]);
});

test('late eligibility and repair replies cannot open or close a newer account interface',async()=>{
  const status=deferred(),first=formFixture({status:()=>status.promise});const opening=openTestPinRepair(first.ctx);first.shared.authVersion++;first.shared.user={id:ownerB};status.resolve(eligible);assert.equal(await opening,false);assert.equal(first.current,null);
  const repair=deferred(),second=formFixture({repair:()=>repair.promise});await openTestPinRepair(second.ctx);const old=second.fill(),work=second.submit();second.shared.authVersion++;second.shared.user={id:ownerB};second.ctx.sheet('new account interface',()=>{});const replacement=second.current;repair.resolve({ok:true});await work;
  assert.equal(second.current,replacement);assert.deepEqual(second.toasts,[]);assert.deepEqual(Object.values(old.inputs).map(input=>input.value),['','','']);
});

test('cancelled pending repair ignores a late success and never resumes a transaction',async()=>{
  const pending=deferred(),f=formFixture({repair:()=>pending.promise});await openTestPinRepair(f.ctx);const form=f.fill(),work=f.submit();form.cancel.onclick();assert.equal(f.current,null);pending.resolve({ok:true});await work;assert.deepEqual(f.toasts,[]);
});

test('an unknown repair is confirmed only by repaired status and verifying the chosen new PIN',async()=>{
  let reads=0;const f=formFixture({status:async()=>++reads===1?eligible:{ok:true,eligible:false,repaired:true,testOnly:true},repair:async()=>({ok:false,unknown:true})});
  await openTestPinRepair(f.ctx);f.fill();await f.submit();assert.equal(f.current,null);assert.equal(f.calls.filter(call=>call.kind==='repair').length,1);assert.deepEqual(f.calls.filter(call=>call.kind==='verify'),[{kind:'verify',pin:'0246'}]);assert.match(f.toasts[0],/Review your payment again/);
  let otherReads=0;const unavailable=formFixture({status:async()=>++otherReads===1?eligible:{ok:true,eligible:true,repaired:false,testOnly:true},repair:async()=>({ok:false,unknown:true})});await openTestPinRepair(unavailable.ctx);const form=unavailable.fill();await unavailable.submit();assert.equal(unavailable.calls.filter(call=>call.kind==='repair').length,1);assert.equal(unavailable.calls.some(call=>call.kind==='verify'),false);assert.deepEqual(unavailable.toasts,[]);assert.match(form.error.textContent,/could not confirm/);
});

test('repair entry remains hidden until this exact account is eligible and disposal rejects a late reply',async()=>{
  const pending=deferred(),f=formFixture({status:()=>pending.promise}),button=node();const entry=bindTestPinRepairEntry(f.ctx,[button]);assert.equal(button.hidden,true);entry.dispose();pending.resolve(eligible);await tick();assert.equal(button.hidden,true);assert.equal(button.onclick,null);
  const other=formFixture({status:async()=>({ok:true,eligible:false,testOnly:true})}),otherButton=node();bindTestPinRepairEntry(other.ctx,[otherButton]);await tick();assert.equal(otherButton.hidden,true);
});

test('security keeps a durable confirmation only for a server-confirmed repair belonging to the current test account',async()=>{
  const f=formFixture({status:async()=>({ok:true,eligible:false,repaired:true,testOnly:true})}),button=node(),status=node();
  const entry=bindTestPinRepairEntry(f.ctx,[button],{statusElements:[status]});assert.equal(status.hidden,true);await tick();
  assert.equal(button.hidden,true);assert.equal(status.hidden,false);assert.equal(status.textContent,'Your test transaction PIN is set.');
  f.shared.authVersion++;f.shared.user={id:ownerB};entry.refresh();assert.equal(status.hidden,true);assert.equal(status.textContent,'');
  const pending=deferred(),other=formFixture({status:()=>pending.promise}),otherStatus=node();
  bindTestPinRepairEntry(other.ctx,[node()],{statusElements:[otherStatus]});other.shared.authVersion++;other.shared.user={id:ownerB};pending.resolve({ok:true,eligible:false,repaired:true,testOnly:true});await tick();assert.equal(otherStatus.hidden,true);assert.equal(otherStatus.textContent,'');
  const unconfirmed=formFixture({status:async()=>({ok:true,repaired:true,testOnly:false})}),unconfirmedStatus=node();bindTestPinRepairEntry(unconfirmed.ctx,[node()],{statusElements:[unconfirmedStatus]});await tick();assert.equal(unconfirmedStatus.hidden,true);
});

const appSource=await readFile(new URL('../dist/js/app.js',import.meta.url),'utf8');
test('opening repair from the actual failed PIN sheet cancels the original transaction before replacement',async()=>{
  const f=formFixture(),repairButton=node(),pinError=node(),buttons=new Map(),timers=[],order=[];
  for(const key of ['0','1','2','3','4','5','6','7','8','9','clear','delete'])buttons.set(key,node({dataset:{key}}));
  const pinEl=node({querySelector:selector=>selector==='[data-pin-repair]'?repairButton:pinError,querySelectorAll:selector=>selector==='[data-key]'?[...buttons.values()]:Array.from({length:4},()=>({classList:{toggle(){}}}))});
  f.ctx.route={section:'pay',page:'review'};f.shared.verifyPin=async()=>({ok:false,message:'Check your PIN.'});
  const originalSheet=f.ctx.sheet;let pinOptions,approvals=0,cancels=0;
  const closePin=()=>{if(pinEl.isConnected){pinEl.isConnected=false;pinOptions?.onDispose?.();order.push('pin-closed');}};
  const context=vm.createContext({state:f.state,shared:f.shared,ctx:f.ctx,authorizationPin:'',overlayCleanup:null,
    bindTestPinRepairEntry,sheet(html,bind,options){pinOptions=options;bind(pinEl);},closeSheet:closePin,
    esc:value=>String(value),icon:()=>'',toast(){},setTimeout(callback){timers.push(callback);},document:{addEventListener(){},removeEventListener(){}},
    approved(){approvals++;},cancelled(){cancels++;order.push('cancelled');}});
  f.ctx.sheet=(...args)=>{order.push('repair-open');originalSheet(...args);};
  const start=appSource.indexOf('function pinAuth('),end=appSource.indexOf('\nfunction celebrate(',start);vm.runInContext(appSource.slice(start,end)+'\npinAuth({onSuccess:approved,onCancel:cancelled});',context);
  await tick();assert.equal(repairButton.hidden,true);
  for(const digit of '1234')buttons.get(digit).click();await timers.shift()();assert.equal(repairButton.hidden,false);
  repairButton.onclick();await tick();assert.equal(cancels,1);assert.equal(approvals,0);assert.deepEqual(order,['pin-closed','cancelled','repair-open']);assert.ok(f.current);
});

function actualSheetFixture(){
  let active=null;
  const makeElement=()=>node({focus(){},querySelector:()=>node(),querySelectorAll:()=>[]});
  const overlays={querySelector:selector=>selector==='.sheet'?active:makeElement()};
  Object.defineProperty(overlays,'innerHTML',{set(value){if(active)active.isConnected=false;active=value?makeElement():null;}});
  const previous=node({focus(){}});
  const context=vm.createContext({view:{},shell:{},overlays,overlayMeta:null,overlayCleanup:null,pendingPageNavigation:false,pendingModalPop:false,router:null,
    document:{activeElement:previous,addEventListener(){},removeEventListener(){}},window:{history:{state:null}},queueMicrotask(){},suppressSharedControls(){},esc:value=>String(value),icon:()=>''});
  const start=appSource.indexOf('function setInert('),end=appSource.indexOf('\nfunction auth(',start);
  vm.runInContext(appSource.slice(start,end),context);
  return context;
}

test('the actual sheet helper disposes secrets once on replacement and repeated close',()=>{
  const ctx=actualSheetFixture(),events=[],oldField={value:'transient-secret'},newField={value:'next-secret'};
  ctx.sheet('first',()=>{},{onDispose(){events.push('old-disposed');oldField.value='';}});
  ctx.sheet('second',()=>events.push('new-bound'),{onDispose(){events.push('new-disposed');newField.value='';}});
  assert.deepEqual(events,['old-disposed','new-bound']);assert.equal(oldField.value,'');
  ctx.closeSheet();ctx.closeSheet();assert.deepEqual(events,['old-disposed','new-bound','new-disposed']);assert.equal(newField.value,'');
});

test('a nested close from disposal cannot invoke the actual sheet cleanup twice',()=>{
  const ctx=actualSheetFixture();let disposed=0;
  ctx.sheet('first',()=>{},{onDispose(){disposed++;ctx.closeSheet();}});
  ctx.sheet('replacement',()=>{});assert.equal(disposed,1);assert.ok(ctx.overlayMeta);ctx.closeSheet();assert.equal(disposed,1);
});
