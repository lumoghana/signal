import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../dist/js/app.js',import.meta.url),'utf8');
function actualFunction(start,end){
  const from=source.indexOf(start),to=source.indexOf(end,from);
  if(from<0||to<0)throw Error('The actual application PIN functions could not be located.');
  return source.slice(from,to);
}
const pinSource=actualFunction('function pinAuth(', '\nfunction celebrate(');
const actionSource=actualFunction('async function actAsync(', '\nfunction canonicalRoot(');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function harness({connected=true,storedPin='0246',verify=async pin=>({ok:pin==='0246',message:'That transaction PIN does not match.'}),action=async()=>({ok:true})}={}){
  const keys=new Map(),timers=[],calls=[],verified=[],messages=[],error={textContent:''};
  const dots=Array.from({length:4},()=>({classList:{toggle(){}}}));
  for(const value of ['0','1','2','3','4','5','6','7','8','9','clear','delete'])keys.set(value,{dataset:{key:value},addEventListener(type,fn){this[type]=fn;}});
  const el={isConnected:true,querySelector:selector=>selector==='#pin-error'?error:null,querySelectorAll:selector=>selector==='[data-key]'?[...keys.values()]:dots};
  let html='',closed=0,success=0;
  const shared={connected,verifyPin:async pin=>{verified.push(pin);return verify(pin);},action:async(type,payload,options)=>{calls.push({type,payload,options});return action(type,payload,options);}};
  const context=vm.createContext({
    state:{settings:{pin:storedPin}},shared,draft:{},authorizationPin:'',overlayCleanup:null,
    sheet(markup,bind){html=markup;el.isConnected=true;bind(el);},
    closeSheet(){closed++;el.isConnected=false;context.overlayCleanup?.();},
    esc:value=>String(value),icon:()=>'',toast:message=>messages.push(message),
    setTimeout(callback){timers.push(callback);return timers.length;},
    document:{addEventListener(){},removeEventListener(){}},
    act(type,payload){calls.push({type,payload});return {ok:true};},
    auth(){throw Error('An accepted PIN must not open a second PIN prompt.');},persistSession(){},
    reviewedPayment:{rail:'lumo',amount:100,recipient:{handle:'test-recipient'},idempotencyKey:'reviewed-pin-payment'},
    accepted(pin){success++;return context.actAsync('payment',context.reviewedPayment);},
  });
  vm.runInContext(pinSource+'\n'+actionSource+'\nthis.openPin=()=>pinAuth({onSuccess:accepted});',context);
  async function enter(pin){for(const digit of pin)keys.get(digit).click();const timer=timers.shift();if(timer)await timer();await flush();}
  return {context,shared,el,verified,calls,messages,error,enter,open:()=>context.openPin(),get html(){return html;},get closed(){return closed;},get success(){return success;}};
}

test('the actual connected PIN sheet verifies and forwards the chosen leading-zero PIN to the payment',async()=>{
  const h=harness({storedPin:'1234'});h.open();await h.enter('0246');
  assert.deepEqual(h.verified,['0246']);assert.equal(h.success,1);assert.equal(h.closed,1);
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].type,'payment');assert.equal(h.calls[0].options.pin,'0246');
  assert.equal(h.calls[0].payload.pin,undefined);assert.equal(h.calls[0].payload.amount,100);assert.equal(h.context.authorizationPin,'');
  assert.doesNotMatch(h.html,/Initial demo PIN/);
});

test('a rejected connected PIN does not authorize and the same keypad can accept a corrected PIN',async()=>{
  const h=harness();h.open();await h.enter('1234');
  assert.equal(h.calls.length,0);assert.equal(h.success,0);assert.equal(h.closed,0);assert.match(h.error.textContent,/does not match/);
  await h.enter('0246');assert.deepEqual(h.verified,['1234','0246']);assert.equal(h.calls.length,1);assert.equal(h.calls[0].options.pin,'0246');
});

test('closing the original PIN sheet while verification is pending does not authorize its late reply',async()=>{
  let finish;const pending=new Promise(resolve=>{finish=resolve;});const h=harness({verify:()=>pending});h.open();
  const work=h.enter('0246');await flush();h.el.isConnected=false;finish({ok:true});await work;
  assert.equal(h.calls.length,0);assert.equal(h.success,0);assert.equal(h.context.authorizationPin,'');
});

test('the original sample PIN sheet accepts its created custom PIN and rejects the old default',async()=>{
  const h=harness({connected:false});h.open();await h.enter('1234');assert.equal(h.success,0);assert.equal(h.calls.length,0);
  await h.enter('0246');assert.equal(h.success,1);assert.equal(h.calls.length,1);assert.deepEqual(h.verified,[]);
  assert.doesNotMatch(h.html,/Initial demo PIN/);
});

test('the sample default hint appears only when the sample actually uses that default',()=>{
  const h=harness({connected:false,storedPin:'1234'});h.open();assert.match(h.html,/Initial demo PIN/);
});
