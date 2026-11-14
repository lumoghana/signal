import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeSharedQr,encodeSharedQrLink,parseSharedQrLink,SHARED_CONSUMER_ORIGIN} from '../dist/js/approved-qr.js';
import {parseQrPayload} from '../dist/js/qr-decoder.js';
import {renderQrScreen,bindQrScreen} from '../dist/js/qr-screen.js';
import {renderPayments,readPaymentLink,openSharedMerchant} from '../dist/js/payments.js';
import {createEmptyState} from '../dist/js/model.js';
import {openMerchantCodeSheet} from '../dist/js/merchant-code.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('raw and tappable cross-channel personal codes carry the same amount-free identity',()=>{
 const identity={kind:'person',handle:'2.ama-test'},raw=encodeSharedQr(identity),link=encodeSharedQrLink(identity);
 assert.equal(new URL(link).origin,SHARED_CONSUMER_ORIGIN);assert.deepEqual(parseSharedQrLink(link),identity);
 assert.deepEqual(parseQrPayload(raw).payment,parseQrPayload(link,{origin:'https://preview.example.test'}).payment);
 assert.deepEqual(parseQrPayload(link).payment,{type:'person',handle:identity.handle,name:'@2.ama-test',amount:0,note:''});
 for(const invalid of [link+'&amount=5000',link+'&lumoCode='+encodeURIComponent(raw),link+'#fragment',link.replace(SHARED_CONSUMER_ORIGIN,'https://untrusted.example.test'),link.replace('/?','/other?'),link.replace('https://','https://user@')])assert.equal(parseQrPayload(invalid).ok,false,invalid);
 assert.throws(()=>encodeSharedQr({kind:'person',handle:identity.handle,amount:5000}));
});

test('shared My code and Collect explain amount-free receiving and do not display stale requested amounts or notes',()=>{
 const state=createEmptyState();state.profile.name='Ama';const ctx={state,connected:true,shared:{account:{handle:'ama.student'}},draft:{collect:{amount:5000,note:'Stale lunch note'}},qrCodeMarkup:()=>'<svg></svg>'};
 const code=renderQrScreen(ctx,{mode:'code'}),collect=renderPayments(ctx,{section:'pay',page:'collect'});
 for(const html of [code,collect]){assert.match(html,/personal code has no amount/);assert.doesNotMatch(html,/GH₵50\.00|Stale lunch note|Add an amount|Edit amount/);}
 assert.match(code,/Ask one person for an amount/);assert.match(collect,/@ama.student/);
});

class Element extends EventTarget{
 constructor(dataset={}){super();this.dataset=dataset;this.hidden=false;this.isConnected=true;this.disabled=false;this.textContent='';this.classList={toggle(){},remove(){}}}
 click(){this.dispatchEvent(new Event('click'))}
}
function scannerHarness(){
 const nodes=Object.fromEntries(['close','status','retry','frame','video','file','upload','person','merchant','edit','share','copy'].map(key=>['[data-qr-'+key+']',new Element()])),tabs=[new Element({qrMode:'scan'}),new Element({qrMode:'code'})],root=new Element(),doc=new Element();doc.hidden=false;
 root.querySelector=selector=>nodes[selector]||null;root.querySelectorAll=()=>tabs;
 let callbacks,finish,options;const scanner={active:false,start:async()=>{scanner.active=true;return true},stop:()=>{scanner.active=false},dispose(){}};
 const ctx={connected:true,state:{profile:{}},draft:{},$:()=>root,go(){},back(){},findQrPerson(){},openQrPayment(){},openQrMerchant(value,next){options=next;return new Promise(resolve=>{finish=resolve})}};
 const cleanup=bindQrScreen(ctx,{section:'pay',page:'scan',mode:'scan'},{document:doc,createScanner:value=>{callbacks=value;return scanner}});
 return {nodes,tabs,scanner,cleanup,get options(){return options},get callbacks(){return callbacks},finish:value=>finish(value)};
}
const merchantCode=encodeSharedQr({kind:'merchant',shopId:'11111111-1111-4111-8111-111111111111'});
test('a failed async merchant quote exposes camera retry without leaving Scan',async()=>{
 const h=scannerHarness();await tick();h.callbacks.onCode(merchantCode);assert.equal(h.scanner.active,false);
 h.finish({ok:false,message:'This payment request expired'});await tick();
 assert.equal(h.nodes['[data-qr-retry]'].hidden,false);assert.match(h.nodes['[data-qr-status]'].textContent,/expired/);h.cleanup();
});
test('changing QR mode invalidates an in-flight merchant quote, including its later error UI',async()=>{
 const h=scannerHarness();await tick();h.callbacks.onCode(merchantCode);assert.equal(h.options.isCurrent(),true);
 h.tabs[1].click();assert.equal(h.options.isCurrent(),false);const message=h.nodes['[data-qr-status]'].textContent;
 h.finish({ok:false,message:'Late expired result'});await tick();assert.equal(h.nodes['[data-qr-status]'].textContent,message);h.cleanup();
});

test('a connected manual merchant quote remains editable after rejection and cannot complete after dismissal',async()=>{
 const form=new Element();form.elements={merchantCode:{value:'LUM100001'}};const error={hidden:true,textContent:''},button={disabled:false};
 form.querySelector=selector=>selector==='[data-merchant-error]'?error:selector==='[type="submit"]'?button:null;
 let options,finish,quoteOptions,closed=0;
 const ctx={connected:true,sheet(html,bind,next){options=next;bind({querySelector:selector=>selector==='form'?form:{focus(){}}})},closeSheet(){closed++},openQrMerchant(value,next){quoteOptions=next;return new Promise(resolve=>{finish=resolve})}};
 openMerchantCodeSheet(ctx);form.dispatchEvent(new Event('submit',{cancelable:true}));await tick();
 assert.equal(button.disabled,true);assert.equal(closed,0);assert.equal(quoteOptions.isCurrent(),true);
 finish({ok:false,message:'Check this shop code'});await tick();assert.equal(button.disabled,false);assert.equal(error.hidden,false);assert.match(error.textContent,/shop code/);assert.equal(closed,0);
 form.dispatchEvent(new Event('submit',{cancelable:true}));await tick();options.onDispose();options.onClose();
 assert.equal(quoteOptions.isCurrent(),false);finish({ok:true});await tick();assert.equal(closed,0);
});

test('manual merchant lookup transfers freshness to its replacement choice without losing saved work',async()=>{
 const form=new Element();form.elements={merchantCode:{value:'LUM100001'}};const button={disabled:false},error={hidden:true,textContent:''};form.querySelector=selector=>selector==='[type="submit"]'?button:selector==='[data-merchant-error]'?error:null;
 const saved={rail:'lumo',recipient:{name:'Saved person'},amount:1000,idempotencyKey:'saved-key'},controls=new Map(),routes=[];let active=null;
 const ctx={connected:true,state:createEmptyState(),draft:{payment:saved},route:{section:'pay',page:'home'},shared:{authVersion:1,quote:async()=>({ok:true,shop:{id:'11111111-1111-4111-8111-111111111111',name:'Merchant counter',code:'LUM100001'}})},toast(){},saveDraft(){},refresh(){},go(value){routes.push(value);ctx.route=value},closeSheet(){active?.options.onDispose?.();if(active?.form)active.form.isConnected=false;active=null},sheet(html,bind,options){ctx.closeSheet();active={options,form:html.includes('qr-merchant-form')?form:null};bind({querySelector(selector){if(selector==='form')return form;if(selector==='input')return {focus(){}};if(!controls.has(selector))controls.set(selector,{});return controls.get(selector)}})}};
 ctx.openQrMerchant=(value,options)=>openSharedMerchant(ctx,value,options);
 openMerchantCodeSheet(ctx);form.dispatchEvent(new Event('submit',{cancelable:true}));await tick();await tick();
 assert.equal(form.isConnected,false);assert.equal(ctx.draft.payment,saved);assert.equal(routes.length,0);
 controls.get('[data-action="merchant-use-payment"]').onclick();
 assert.equal(ctx.draft.payment.rail,'merchant');assert.equal(ctx.draft.payment.shopName,'Merchant counter');assert.equal(routes.at(-1).page,'amount');
});

test('an authenticated incoming merchant link fetches the bound quote and ignores an untrusted amount hint',async()=>{
 const previousWindow=globalThis.window,previousHistory=globalThis.history;
 try{
  globalThis.window={location:new URL(SHARED_CONSUMER_ORIGIN+'/?pay=11111111-1111-4111-8111-111111111111&request=22222222-2222-4222-8222-222222222222&amount=999999')};
  globalThis.history={state:{route:'preserved'},replaceState(value,unused,path){this.state=value;window.location=new URL(path,window.location)}};
  const quotes=[],routes=[],ctx={state:createEmptyState(),draft:{},connected:true,route:{section:'pay',page:'home'},shared:{signedIn:true,authVersion:1,quote:async value=>{quotes.push(value);return {ok:true,shop:{id:value.shopId,name:'Quoted counter',code:'LUM100001'},request:{id:value.requestId,amount:2500}}}},toast(){},saveDraft(){},go(value){routes.push(value);ctx.route=value}};
  const route=readPaymentLink(ctx);assert.equal(route.page,'home');await tick();
  assert.equal(quotes.length,1);assert.equal(quotes[0].requestId,'22222222-2222-4222-8222-222222222222');assert.equal(quotes[0].amount,undefined);
  assert.equal(ctx.draft.payment.amount,2500);assert.equal(routes.at(-1).page,'review');assert.equal(history.state.route,'preserved');
 }finally{globalThis.window=previousWindow;globalThis.history=previousHistory;}
});
