import test from 'node:test';
import assert from 'node:assert/strict';
import {openSupportNotifications} from '../dist/js/support-notifications.js';
const owner='11111111-1111-4111-8111-111111111111',caseId='22222222-2222-4222-8222-222222222222',notificationId='33333333-3333-4333-8333-333333333333';
const detail={id:caseId,reference:'CS-SYNTHETIC',statusLabel:'In review',updates:[{statusLabel:'Reply',body:'<img src=x onerror=alert(1)>',createdAt:'2026-11-15T00:00:00Z'}]};
const deferred=()=>{let resolve;return{promise:new Promise(r=>{resolve=r;}),resolve:value=>resolve(value)};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(overrides={}){
 const sheets=[],toasts=[],reads=[];let current=null;
 const shared={signedIn:true,user:{id:owner},authVersion:0,recoveryScope:'synthetic'};
 const inbox={signedIn:true,snapshot:{notifications:[],unreadCount:0,total:0,page:1,loading:false},async refresh(){},subscribe(){return()=>{};},async readCase(...args){reads.push(args);return{ok:true,case:detail};},...overrides};
 const ctx={connected:true,shared,toast:message=>toasts.push(message),closeSheet(){if(current){current.isConnected=false;current.dispose?.();}},sheet(html,bind,options={}){ctx.closeSheet();const buttons=new Map();current={html,innerHTML:html,isConnected:true,dispose:options.onDispose,querySelector(selector){if(!buttons.has(selector))buttons.set(selector,{onclick:null});return buttons.get(selector);},querySelectorAll(){return[];}};sheets.push(current);bind(current);}};
 return{ctx,shared,inbox,sheets,toasts,reads};
}
test('the central support notification opens its exact case and safely escapes reply text',async()=>{const f=harness();await openSupportNotifications(f.ctx,f.inbox,{caseId,notificationId});assert.deepEqual(f.reads,[[caseId,notificationId]]);assert.equal(f.sheets.length,1);assert.ok(f.sheets[0].html.includes('CS-SYNTHETIC'));assert.ok(f.sheets[0].html.includes('&lt;img'));assert.equal(f.sheets[0].html.includes('<img'),false);});
test('changing accounts during the initial support refresh cannot open a late sheet',async()=>{const pending=deferred(),f=harness({refresh:()=>pending.promise});const opened=openSupportNotifications(f.ctx,f.inbox,{caseId});f.shared.authVersion++;f.shared.user={id:caseId};pending.resolve();await opened;assert.equal(f.sheets.length,0);assert.equal(f.reads.length,0);});
test('changing session scope during a central support case read cannot open that detail',async()=>{const pending=deferred(),f=harness({readCase:()=>pending.promise});const opened=openSupportNotifications(f.ctx,f.inbox,{caseId});await tick();f.shared.recoveryScope=null;pending.resolve({ok:true,case:detail});await opened;assert.equal(f.sheets.length,0);});
test('an open support detail clears if its refresh returns after sign-out',async()=>{const pending=deferred();let calls=0;const f=harness({readCase:()=>++calls===1?Promise.resolve({ok:true,case:detail}):pending.promise});await openSupportNotifications(f.ctx,f.inbox,{caseId});const sheet=f.sheets[0],refresh=sheet.querySelector('[data-support-case-refresh]').onclick();f.shared.signedIn=false;pending.resolve({ok:true,case:detail});await refresh;assert.equal(sheet.innerHTML,'');assert.equal(sheet.isConnected,false);assert.equal(f.sheets.length,1);});

test('a support case opens the exact original consumer report for reply with both references labelled',async()=>{
 const localId='case-original-synthetic',mapped={...detail,source:{type:'consumer_support',id:localId},sourceReference:'LUM-00001'},f=harness({readCase:async()=>({ok:true,case:mapped})}),routes=[];
 f.ctx.state={account:{supportCases:[{id:localId,reference:'LUM-00001'}]}};f.ctx.go=route=>routes.push(route);
 await openSupportNotifications(f.ctx,f.inbox,{caseId});const sheet=f.sheets[0];assert.match(sheet.html,/Lumo support case/);assert.match(sheet.html,/Your app report: LUM-00001/);assert.match(sheet.html,/Reply to Lumo/);
 sheet.querySelector('[data-support-reply]').onclick();assert.deepEqual(routes,[{section:'life',page:'account-support-detail',id:localId,supportReference:'CS-SYNTHETIC',returnTo:{section:'life',page:'account-support'}}]);
});

test('a mismatched support source cannot open another report and a delayed reply tap cannot survive sign-out',async()=>{
 const localId='case-original-synthetic',routes=[];const f=harness({readCase:async()=>({ok:true,case:{...detail,source:{type:'merchant_ticket',id:localId}}})});f.ctx.state={account:{supportCases:[{id:localId}]}};f.ctx.go=route=>routes.push(route);
 await openSupportNotifications(f.ctx,f.inbox,{caseId});assert.doesNotMatch(f.sheets[0].html,/data-support-reply/);
 f.inbox.readCase=async()=>({ok:true,case:{...detail,source:{type:'consumer_support',id:localId}}});await openSupportNotifications(f.ctx,f.inbox,{caseId});const sheet=f.sheets.at(-1);f.shared.signedIn=false;sheet.querySelector('[data-support-reply]').onclick();assert.deepEqual(routes,[]);assert.equal(sheet.innerHTML,'');
});
