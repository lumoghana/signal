import test from 'node:test';
import assert from 'node:assert/strict';
import {registerOfflineShell,updateOfflineBanner} from '../dist/js/offline-shell.js';
import {renderActivityEntries} from '../dist/js/activity-view.js';
import {renderPaymentsHub,bindPaymentsHub} from '../dist/js/payments-hub.js';
import {PAYMENT_SERVICES} from '../dist/js/payment-catalog.js';
import {renderAccountRecipient,bindAccountRecipient} from '../dist/js/payment-recipient.js';
import {renderPayments} from '../dist/js/payments.js';

function offlineTarget(){
 const listeners=new Map();
 return {location:{protocol:'https:'},addEventListener(event,fn){listeners.set(event,fn)},removeEventListener(event){listeners.delete(event)},emit(event){listeners.get(event)?.()}};
}
function bannerHost(){
 const children=[];
 return {children,ownerDocument:{createElement(){return {attrs:{},setAttribute(name,value){this.attrs[name]=value}}}},querySelector(){return children[0]||null},prepend(child){children.unshift(child)}};
}

test('restored connected provider routes show availability before collecting bank, phone or bill details',()=>{
 const ctx={connected:true,state:{settings:{}},draft:{payment:{rail:'momo',recipientForms:{momo:{number:'0245550100'}}}},$:()=>({}),$$(selector){return []}};
 for(const rail of ['momo','bank']){
  ctx.draft.payment.rail=rail;
  const html=renderAccountRecipient(ctx,{page:'recipient'});assert.match(html,/provider is not connected/);assert.doesNotMatch(html,/name="recipientNumber"|recipient-lookup-form/);
  let lookedUp=false;bindAccountRecipient(ctx,{page:'recipient'},{createLookup(){lookedUp=true}})();assert.equal(lookedUp,false);
 }
 const html=renderPayments(ctx,{section:'pay',page:'service',id:'airtime'});assert.match(html,/provider is not connected/);assert.doesNotMatch(html,/service-payment-form|name="service-phone"/);
});

test('offline shared copy requires confirmation and follows a later switch to the sample',async()=>{
 let connected=true;const target=offlineTarget(),navigator={onLine:false},updates=[];
 const result=await registerOfflineShell({target,navigator,connected:()=>connected,onChange:value=>updates.push(value)});
 assert.match(updates.at(-1).message,/Shared payments and account changes need a connection/);
 assert.doesNotMatch(updates.at(-1).message,/changes can save/);
 connected=false;target.emit('offline');assert.match(updates.at(-1).message,/Demo changes can save on this device/);
 navigator.onLine=true;target.emit('online');assert.deepEqual(updates.at(-1),{offline:false,message:''});result.cleanup();
});

test('an existing accessible offline banner updates mode without duplication or a success claim',()=>{
 const host=bannerHost(),banner=updateOfflineBanner(host,{offline:true,connected:true});
 assert.equal(banner.attrs.role,'status');assert.equal(banner.attrs['aria-live'],'polite');assert.equal(banner.hidden,false);
 assert.match(banner.textContent,/Reconnect to check the latest result before trying again/);
 assert.equal(updateOfflineBanner(host,{offline:true,connected:false}),banner);assert.equal(host.children.length,1);
 assert.match(banner.textContent,/Demo changes can save/);
 updateOfflineBanner(host,{offline:false,connected:true});assert.equal(banner.hidden,true);
});

const activityContext=filters=>({state:{transactions:[]},draft:{...(filters?{activityFilters:{query:'',direction:'all',status:'all',category:'',from:'',to:'',...filters}}:{})}});
test('fresh Activity explains where the first record will appear instead of suggesting missing filters',()=>{
 const ctx=activityContext(),before=structuredClone(ctx.state),html=renderActivityEntries(ctx);
 assert.match(html,/Your activity starts here/);assert.match(html,/details and status will appear here/);
 assert.doesNotMatch(html,/Try another date/);assert.deepEqual(ctx.state,before);
});

test('empty filtered views retain the no-match explanation even for a new account',()=>{
 for(const filter of [{query:'lunch'},{direction:'in'},{status:'pending'},{category:'Food'},{from:'2026-11-01'},{to:'2026-11-13'},{asOf:'2026-11-13T10:00:00Z'}]){
  const html=renderActivityEntries(activityContext(filter));assert.match(html,/No moves in this view/);assert.doesNotMatch(html,/Your activity starts here/);
 }
 const ctx=activityContext({query:'missing'});ctx.state.transactions=[{id:'one',merchant:'Campus lunch',amount:1000,direction:'out',status:'success',at:'2026-11-13T12:00:00Z'}];
 assert.match(renderActivityEntries(ctx),/No moves in this view/);
 ctx.draft.activityFilters.query='lunch';assert.match(renderActivityEntries(ctx),/Campus lunch/);
});

function hubHarness(connected,payment){
 const listeners=new Map(),routes=[],starts=[],messages=[];
 let resumed=0;
 const root={isConnected:true,addEventListener(type,fn){listeners.set(type,fn)},removeEventListener(type){listeners.delete(type)}};
 const ctx={connected,state:{wallet:12345,settings:{hideBalance:false}},draft:payment?{payment}: {},$:()=>root,go:route=>routes.push(route),startPayment:(...values)=>starts.push(values),resumePayment:()=>resumed++,toast:message=>messages.push(message)};
 const cleanup=bindPaymentsHub(ctx);
 return {ctx,routes,starts,messages,cleanup,get resumed(){return resumed},click(dataset){listeners.get('click')?.({target:{closest:()=>({dataset,disabled:false})}})}};
}

test('connected unavailable rails and bills explain availability before collecting payment details',()=>{
 const h=hubHarness(true),before=structuredClone(h.ctx.state);
 const send=renderPaymentsHub(h.ctx),bills=renderPaymentsHub(h.ctx,{hubTab:'bills'});
 for(const rail of ['momo','bank']){
  assert.match(send,new RegExp('data-hub-action="'+rail+'"[^>]*aria-disabled="true"'));
  h.click({hubAction:rail});
 }
 for(const service of PAYMENT_SERVICES.filter(service=>service.type!=='campus')){
  assert.match(bills,new RegExp('data-service-id="'+service.id+'"[^>]*aria-disabled="true"'));
  h.click({hubAction:'service',serviceId:service.id});
 }
 assert.match(send,/Not connected in this test/);assert.match(bills,/Not connected in this test/);
 assert.equal(h.routes.length,0);assert.equal(h.starts.length,0);assert.equal(h.resumed,0);assert.equal(h.messages.length,2+PAYMENT_SERVICES.filter(service=>service.type!=='campus').length);
 assert.deepEqual(h.ctx.state,before);
 h.click({hubAction:'lumo'});assert.deepEqual(h.starts,[[null,'lumo']]);
 h.click({hubAction:'scan'});assert.equal(h.routes.at(-1).page,'scan');h.cleanup();
});

test('an unavailable saved provider payment stays intact and cannot bypass the entry gate',()=>{
 for(const provider of [{rail:'momo'},{rail:'bank'},{rail:'airtime',serviceId:'airtime'}]){
  const payment={...provider,amount:3000,recipient:{name:'Saved recipient'},idempotencyKey:'saved-provider-reference'},h=hubHarness(true,payment),before=structuredClone(payment);
  assert.match(renderPaymentsHub(h.ctx),/Saved payment · Provider not connected/);h.click({hubAction:'resume'});
  assert.equal(h.resumed,0);assert.equal(h.messages.length,1);assert.equal(h.ctx.draft.payment,payment);assert.deepEqual(payment,before);h.cleanup();
 }
});

test('sample catalogues keep working and the shared availability gate requires literal true',()=>{
 for(const connected of [undefined,false,'true',1]){
  const h=hubHarness(connected);assert.doesNotMatch(renderPaymentsHub(h.ctx),/Not connected in this test/);
  h.click({hubAction:'momo'});h.click({hubAction:'bank'});h.click({hubAction:'service',serviceId:'airtime'});
  assert.deepEqual(h.starts,[[null,'momo'],[null,'bank']]);assert.equal(h.routes.at(-1).id,'airtime');assert.equal(h.messages.length,0);h.cleanup();
 }
});
