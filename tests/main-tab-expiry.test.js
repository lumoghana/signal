import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {MAIN_TABS,MAIN_TAB_RESUME_MS,isMainTabCheckpointFresh,rememberMainTab,mainTabDestination} from '../dist/js/main-tab-state.js';
import {createEmptyState} from '../dist/js/model.js';
import {safeRoute,routeKey,parentRoute} from '../dist/js/navigation.js';
import {createRouter} from '../dist/js/router.js';
import {renderPayments,bindPayments,cancelRecipientEditOnExit} from '../dist/js/payments.js';

const app=fs.readFileSync(new URL('../dist/js/app.js',import.meta.url),'utf8');
const between=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));
function fixture(){
 const state=createEmptyState();state.onboardingDone=true;state.wallet=100000;
 const payment={rail:'lumo',recipient:{id:'synthetic-person',handle:'test.friend',name:'Test Friend'},amount:1500,category:'Other',idempotencyKey:'original-reviewed-request',lastRoute:{section:'pay',page:'review'}};
 return{state,draft:{payment,box:{name:'Laptop',target:45000},plan:{items:[],item:{name:'Food',amount:12000}}}};
}
test('automatic page restoration ends exactly at five seconds and never discards drafts',()=>{
 assert.equal(MAIN_TAB_RESUME_MS,5000);
 for(const elapsed of [0,1,4999,5000,5001,86400000]){
  const {state,draft}=fixture(),before=structuredClone(draft),payment=draft.payment;
  rememberMainTab(draft,{section:'pay',page:'review'},155,[{key:'id:options:0',open:true}],10000);
  const target=mainTabDestination('pay',state,draft,{now:10000+elapsed});
  assert.equal(target.route.page,elapsed<5000?'review':'home');
  assert.equal(target.scroll,elapsed<5000?155:0);
  assert.equal(!!target.disclosures,elapsed<5000);
  assert.equal(draft.payment,payment);assert.deepEqual(draft.payment,before.payment);
  assert.deepEqual(draft.box,before.box);assert.deepEqual(draft.plan,before.plan);
  if(elapsed>=5000)assert.match(renderPayments({state,draft},target.route),/Continue saved payment/);
 }
});
test('legacy, invalid and future timestamps cannot revive an old review page',()=>{
 for(const leftAt of [undefined,null,'10000',NaN,Infinity,10001,-Infinity]){
  const {state,draft}=fixture();draft.mainTabs={pay:{route:{section:'pay',page:'review'},scroll:99,leftAt}};
  assert.equal(isMainTabCheckpointFresh(draft.mainTabs.pay,10000),false);
  assert.deepEqual(mainTabDestination('pay',state,draft,{now:10000}),{route:{section:'pay',page:'home'},scroll:0});
 }
});
test('tapping the active tab always opens its root even within the resume window',()=>{
 for(const section of MAIN_TABS){
  const {state,draft}=fixture(),route=section==='pay'?{section,page:'review'}:section==='boxes'||section==='plan'?{section,page:'create',step:'name'}:section==='activity'?{section,page:'insights'}:{section,page:'home'};
  rememberMainTab(draft,route,350,undefined,10000);
  assert.deepEqual(mainTabDestination(section,state,draft,{now:10001,currentRoute:route}),{route:{section,page:'home'},scroll:0});
 }
});

function appHarness(initialRoute={section:'pay',page:'review'}){
 const {state,draft}=fixture(),entries=[null],queue=[],renders=[];let cursor=0,now=10000;
 const history={get state(){return entries[cursor]},pushState(value){entries.splice(cursor+1);entries.push(structuredClone(value));cursor++},replaceState(value){entries[cursor]=structuredClone(value)},go(delta){queue.push(cursor+delta)}};
 const context=vm.createContext({state,draft,route:initialRoute,pendingPageNavigation:false,captureCurrent:null,shared:{connected:false},Date:{now:()=>now},MAIN_TABS,mainTabDestination:(...args)=>mainTabDestination(...args.slice(0,3),{...args[3],now}),isMainTabCheckpointFresh:saved=>isMainTabCheckpointFresh(saved,now),cancelRecipientEditOnExit,prepareDestination:r=>r,closeSheet(){},captureBeforeLeave(leftAt=now){rememberMainTab(draft,context.route,150,undefined,leftAt)}});
 const router=createRouter({initialRoute,history,normalize:r=>safeRoute(r,state,draft),key:routeKey,parent:r=>parentRoute(r,state,draft),rootFor:r=>({section:r.section,page:'home'}),onNavigate(next){context.route=next;context.pendingPageNavigation=false;renders.push(next)}});context.router=router;router.initialise();
 vm.runInContext(between('function go(next,options={})','function back()')+'\nlet mainTabBackgroundedAt=null;\n'+between('function suspendMainTabPage()','function prepareDestination(next)'),context);
 const flush=()=>{for(let count=0;queue.length;count++){assert.ok(count<30);cursor=queue.shift();router.receive(history.state)}};
 return{state,draft,context,router,renders,advance(ms){now+=ms},tab(section){context.switchMainTab(section);flush()},hide(){context.suspendMainTabPage();flush()},show(){context.resumeMainTabPage();flush()}};
}
test('the real app tab handler exits receipt and review and prevents stale history from trapping Pay',()=>{
 for(const page of ['review','transaction']){
  const h=appHarness({section:'pay',page,id:page==='transaction'?'synthetic-receipt':undefined}),before=structuredClone(h.draft.payment);
  h.tab('pay');assert.equal(h.router.current.page,'home');assert.equal(h.router.current.section,'pay');
  assert.deepEqual(h.draft.payment,before);assert.match(renderPayments({state:h.state,draft:h.draft},h.router.current),/Continue saved payment/);
 }
});
test('the real app tab handler resumes a quick return, then opens Continue after expiry',()=>{
 const h=appHarness(),payment=h.draft.payment;h.tab('activity');h.advance(4999);h.tab('pay');assert.equal(h.router.current.page,'review');
 h.tab('activity');h.advance(5000);h.tab('pay');assert.equal(h.router.current.page,'home');assert.equal(h.draft.payment,payment);assert.equal(payment.idempotencyKey,'original-reviewed-request');
 h.tab('pay');assert.equal(h.router.current.page,'home');
});
test('time spent on a visible form does not expire it; five seconds in background does',()=>{
 const h=appHarness();h.advance(60000);h.show();assert.equal(h.router.current.page,'review');
 h.hide();h.advance(4999);h.show();assert.equal(h.router.current.page,'review');
 h.hide();h.advance(3000);h.hide();h.advance(2000);h.show();assert.equal(h.router.current.page,'home');
 assert.equal(h.draft.payment.idempotencyKey,'original-reviewed-request');
});
test('expiry preserves a submitting or unknown payment and its original payload without making a call',()=>{
 for(const submissionState of ['submitting','unknown']){
  const h=appHarness();Object.assign(h.draft.payment,{submissionState,submissionOwnerId:'test-owner',submissionAttemptId:'original-attempt',submittedPayload:{rail:'lumo',amount:1500,idempotencyKey:'original-reviewed-request'}});
  const original=structuredClone(h.draft.payment);h.tab('activity');h.advance(5000);h.tab('pay');
  assert.equal(h.router.current.page,'home');assert.deepEqual(h.draft.payment,original);assert.equal(h.state.wallet,100000);assert.equal(h.state.transactions.length,0);
  const html=renderPayments({state:h.state,draft:h.draft,connected:true,shared:{user:{id:'test-owner'}}},{section:'pay',page:'review'});
  assert.match(html,/Check original payment/);assert.match(html,/data-action="pay-unknown-leave" aria-label="Back to Payments">Close/);
 }
});
test('cold reload restores only a matching fresh page and drops expired navigation history',()=>{
 const restore=between('  const savedRoute=safeRoute(session.route,state,draft);','}if(shared.connected){const recovery=');
 for(const [elapsed,page] of [[4999,'review'],[5000,'home'],[60000,'home']]){
  const {state,draft}=fixture();rememberMainTab(draft,{section:'pay',page:'review'},90,undefined,10000);
  const session={route:{section:'pay',page:'review'},navigation:{generation:'synthetic-history'}};
  const c=vm.createContext({session,state,draft,route:null,savedNavigation:null,MAIN_TABS,safeRoute,routeKey,mainTabDestination:(tab,s,d)=>mainTabDestination(tab,s,d,{now:10000+elapsed}),isMainTabCheckpointFresh:saved=>isMainTabCheckpointFresh(saved,10000+elapsed)});
  vm.runInContext(restore,c);assert.equal(c.route.page,page);assert.equal(c.savedNavigation===session.navigation,elapsed<5000);
 }
});
test('receipt Done and review Cancel return to Payments while retaining a pending draft',()=>{
 for(const [page,action] of [['transaction','pay-back-to-payments'],['review','pay-cancel']]){
  const {state,draft}=fixture(),handlers=new Map(),destinations=[];
  state.transactions.push({id:'synthetic-receipt',type:'payment',merchant:'Test Friend',amount:1500,status:'success',direction:'out',rail:'lumo',at:'2026-11-15T10:00:00Z',reference:'LM-'+ 'a'.repeat(80)});
  const route={section:'pay',page,...(page==='transaction'?{id:'synthetic-receipt'}:{})},ctx={state,draft,route,$:()=>null,$$:selector=>[{addEventListener(_event,fn){handlers.set(selector,fn)}}],setCapture(){},saveDraft(){},toast(){},go:r=>destinations.push(r),act(){throw Error('Navigation must not move money')}};
  const html=renderPayments(ctx,route),before=structuredClone(draft.payment);
  if(page==='transaction'){assert.match(html,/class="row payment-reference-row"/);assert.match(html,/aria-label="Back to Payments">Done/);assert.ok(html.includes('LM-'+ 'a'.repeat(80)));}
  else assert.match(html,/data-action="pay-cancel">Cancel/);
  bindPayments(ctx,route);const handler=handlers.get(`[data-action="${action}"]`);assert.ok(handler);handler();
  assert.equal(destinations.at(-1).section,'pay');assert.equal(destinations.at(-1).page,'home');assert.deepEqual(draft.payment,before);assert.equal(state.wallet,100000);
 }
});

function continueHarness(draft,state){
 const handlers=new Map();let click;
 const root={isConnected:true,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(_event,fn){click=fn}};
 const ctx={state,draft,route:{section:'pay',page:'home'},$:selector=>selector==='.payments-hub'?root:null,$$:selector=>[{addEventListener(_event,fn){handlers.set(selector,fn)}}],setCapture(){},saveDraft(){},toast(){},closeSheet(){},go(route){ctx.route=route},act(){throw Error('Continue must not move money')}};
 bindPayments(ctx,ctx.route);click({target:{closest:()=>({dataset:{hubAction:'resume'}})}});
 return{ctx,handlers,bind(){bindPayments(ctx,ctx.route)}};
}
test('Continue after tab expiry resumes an unaccepted amount edit and Cancel edit restores its original review',()=>{
 const {state,draft}=fixture(),original=structuredClone(draft.payment);
 draft.paymentEditBackup=structuredClone(original);draft.payment.amount=4200;draft.payment.amountText='42.00';draft.payment.lastRoute={section:'pay',page:'amount',edit:true,backTo:{section:'pay',page:'review'}};
 rememberMainTab(draft,draft.payment.lastRoute,130,undefined,10000);
 assert.equal(mainTabDestination('pay',state,draft,{now:15000}).route.page,'home');
 const h=continueHarness(draft,state);assert.equal(h.ctx.route.page,'amount');assert.equal(h.ctx.route.edit,true);assert.equal(draft.payment.amount,4200);assert.deepEqual(draft.paymentEditBackup,original);
 h.bind();h.handlers.get('[data-action="pay-cancel-edit"]')();
 assert.equal(h.ctx.route.page,'review');assert.deepEqual(draft.payment,original);assert.equal(draft.paymentEditBackup,undefined);assert.equal(state.wallet,100000);
});
test('Continue restores a matching orphaned backup and never applies a different payment backup',()=>{
 for(const matching of [true,false]){
  const {state,draft}=fixture();draft.paymentEditBackup={...structuredClone(draft.payment),amount:750,idempotencyKey:matching?draft.payment.idempotencyKey:'different-payment'};
  const h=continueHarness(draft,state);assert.equal(h.ctx.route.page,'review');assert.equal(draft.payment.amount,matching?750:1500);assert.equal(draft.payment.idempotencyKey,'original-reviewed-request');assert.equal(draft.paymentEditBackup,undefined);assert.equal(state.wallet,100000);
 }
});
