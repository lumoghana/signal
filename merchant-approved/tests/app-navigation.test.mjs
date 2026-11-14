import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppNavigation} from '../dist/app-navigation.js';

function harness(){
 const listeners=new Map(),states=[null],events={addEventListener(type,fn){listeners.set(type,fn)},removeEventListener(type){listeners.delete(type)}};
 let at=0,queued=null,context='sample:merchant:owner',restored=[];
 const history={get state(){return states[at]},pushState(value){states.splice(at+1);states.push(structuredClone(value));at++},replaceState(value){states[at]=structuredClone(value)},back(){queued=at-1},forward(){queued=at+1}};
 const nav=createAppNavigation({history,eventTarget:events,getContext:()=>context,onRestore:value=>{restored.push(value)}});
 function flush(){if(queued===null)return;at=Math.max(0,Math.min(states.length-1,queued));queued=null;listeners.get('popstate')?.({state:history.state})}
 return {nav,history,states,restored,flush,back(){history.back();flush()},forward(){history.forward();flush()},context(value){context=value},listeners,get index(){return at}};
}

test('Back and Forward restore Collect, Administration and child pages',()=>{
 const h=harness();h.nav.reset({page:'checkout',shopId:'shop-a'});h.nav.syncPage({page:'administration',shopId:'shop-a'});h.nav.syncPage({page:'reports',shopId:'shop-a'});
 h.back();assert.deepEqual(h.restored.at(-1),{page:'administration',shopId:'shop-a',modal:null});
 h.back();assert.equal(h.restored.at(-1).page,'checkout');h.forward();assert.equal(h.restored.at(-1).page,'administration');
});

test('Back closes a QR before leaving its collection page',()=>{
 const h=harness();h.nav.reset({page:'checkout',shopId:'shop-a'});h.nav.openModal({kind:'request-detail',id:'request-one'});
 let fallback=false;assert.equal(h.nav.backOrDismiss(()=>{fallback=true}),true);h.flush();
 assert.equal(fallback,false);assert.deepEqual(h.restored.at(-1),{page:'checkout',shopId:'shop-a',modal:null});
 h.forward();assert.deepEqual(h.restored.at(-1).modal,{kind:'request-detail',id:'request-one'});
});

test('request state updates replace the same modal layer rather than stacking dialogs',()=>{
 const h=harness();h.nav.reset({page:'checkout',shopId:'shop-a'});h.nav.openModal({kind:'request-detail',id:'request-one'});h.nav.openModal({kind:'transaction',id:'payment-one'});
 assert.equal(h.states.length,2);h.back();assert.equal(h.restored.at(-1).modal,null);
});

test('Back and Forward restore Appearance without storing device or business data in history',()=>{
 const h=harness();h.nav.reset({page:'administration',shopId:'shop-a'});h.nav.openModal({kind:'appearance-settings',preference:'light'});
 h.back();assert.deepEqual(h.restored.at(-1),{page:'administration',shopId:'shop-a',modal:null});
 h.forward();assert.deepEqual(h.restored.at(-1),{page:'administration',shopId:'shop-a',modal:{kind:'appearance-settings'}});
 assert.ok(!JSON.stringify(h.states).includes('preference'));
});

test('page navigation from a modal replaces its layer and Back returns to prior page',()=>{
 const h=harness();h.nav.reset({page:'administration',shopId:'shop-a'});h.nav.openModal({kind:'approvals'});h.nav.syncPage({page:'activity',shopId:'shop-a'});
 assert.equal(h.states.length,2);h.back();assert.equal(h.restored.at(-1).page,'administration');assert.equal(h.restored.at(-1).modal,null);
});

test('history stores only safe route data, never credentials or payment drafts',()=>{
 const h=harness();h.nav.reset({page:'checkout',shopId:'shop-a',password:'secret'});h.nav.openModal({kind:'request-detail',id:'request-one',password:'secret',amount:9900,payment:{payer:'Private name'},stepUpProof:'private-proof'});
 const serialized=JSON.stringify(h.states);for(const privateValue of ['password','secret','amount','payer','Private name','stepUpProof','private-proof'])assert.ok(!serialized.includes(privateValue));
 assert.deepEqual(h.history.state.lumoMerchantNavigation.modal,{kind:'request-detail',id:'request-one'});
});

test('sensitive or incomplete overlays get a back layer without restorable form state',()=>{
 const h=harness();h.nav.reset({page:'checkout',shopId:'shop-a'});h.nav.openModal({kind:'student-review',payment:{amount:5000,payer:'Private payer'}});
 assert.equal(h.history.state.lumoMerchantNavigation.layer,'modal');assert.equal(h.history.state.lumoMerchantNavigation.modal,null);
 h.back();assert.equal(h.restored.at(-1).modal,null);
});

test('previous account history cannot restore an owner route under another account',()=>{
 const h=harness();h.nav.reset({page:'administration',shopId:'shop-a'});h.nav.syncPage({page:'settlements',shopId:'shop-a'});h.context('registered:merchant:cashier');h.nav.reset({page:'checkout',shopId:'shop-a'});
 h.back();assert.equal(h.restored.length,0);assert.equal(h.history.state.lumoMerchantNavigation.context,'registered:merchant:cashier');assert.equal(h.history.state.lumoMerchantNavigation.page,'checkout');
});

test('a queued dialog Back cannot override a newer page navigation',()=>{
 const h=harness();h.nav.reset({page:'checkout',shopId:'shop-a'});h.nav.openModal({kind:'request-detail',id:'request-one'});h.nav.backOrDismiss();h.nav.syncPage({page:'administration',shopId:'shop-a'});h.flush();
 assert.equal(h.restored.length,0);assert.equal(h.history.state.lumoMerchantNavigation.page,'administration');assert.equal(h.history.state.lumoMerchantNavigation.layer,'page');
 h.back();assert.equal(h.restored.at(-1).page,'checkout');
});

test('a queued Back cannot restore previous-account content after reset',()=>{
 const h=harness();h.nav.reset({page:'administration',shopId:'shop-a'});h.nav.openModal({kind:'approvals'});h.nav.backOrDismiss();h.context('registered:other:cashier');h.nav.reset({page:'checkout',shopId:'shop-b'});h.flush();
 assert.equal(h.restored.length,0);assert.equal(h.history.state.lumoMerchantNavigation.page,'checkout');assert.equal(h.history.state.lumoMerchantNavigation.shopId,'shop-b');
});

test('repeated user-close requests issue one Back operation',()=>{
 const h=harness();h.nav.reset({page:'checkout',shopId:'shop-a'});h.nav.openModal({kind:'privacy'});h.nav.backOrDismiss();h.nav.backOrDismiss();h.flush();assert.equal(h.index,0);assert.equal(h.restored.length,1);
});

test('unchanged page refreshes do not create history entries',()=>{
 const h=harness();h.nav.reset({page:'checkout',shopId:'shop-a'});for(let i=0;i<6;i++)h.nav.syncPage({page:'checkout',shopId:'shop-a'});assert.equal(h.states.length,1);
});

test('unsupported history falls back to closing safely and destroy removes the listener',()=>{
 let closed=false;const nav=createAppNavigation({history:{},eventTarget:{},getContext:()=>''});nav.syncPage({page:'checkout'});nav.openModal({kind:'privacy'});assert.equal(nav.backOrDismiss(()=>{closed=true}),false);assert.equal(closed,true);
 const h=harness();h.nav.destroy();assert.equal(h.listeners.size,0);
});
