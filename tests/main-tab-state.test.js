import test from 'node:test';
import assert from 'node:assert/strict';
import {MAIN_TABS,rememberMainTab,mainTabDestination,captureMainTabDisclosures,restoreMainTabDisclosures} from '../dist/js/main-tab-state.js';
const state=()=>({onboardingDone:true,account:{signedOut:false},wallet:200000,boxes:[{id:'box-one'}],transactions:[],_appliedActions:{}});
const draft=()=>({payment:{rail:'lumo',recipient:{id:'person-one',name:'Synthetic Friend'},amount:1500,idempotencyKey:'existing-payment-reference'},box:{name:'My target',target:45000},plan:{name:'Food',amount:12000}});
function disclosureView(items){const details=items.map(({id='',summary='',open=false,secret})=>({id,open,querySelector(selector){assert.equal(selector,':scope > summary');return summary?{textContent:summary}:null;},get value(){throw Error('Disclosure capture must never read a field value');},secret}));return{details,querySelectorAll(selector){assert.equal(selector,'details');return details;}};}

test('each of the five main tabs retains its own safe page and scroll across repeated switches',()=>{
 const s=state(),d=draft(),routes=[{section:'home',page:'home'},{section:'activity',page:'insights',month:'2026-11'},{section:'pay',page:'review'},{section:'boxes',page:'create',step:'target'},{section:'plan',page:'create',step:'amount'}];assert.deepEqual(MAIN_TABS,routes.map(r=>r.section));
 for(let i=0;i<50;i++)for(const [index,route] of routes.entries()){rememberMainTab(d,route,index*90+i);const result=mainTabDestination(route.section,s,d);assert.deepEqual(result,{route,scroll:index*90+i});}
 assert.equal(d.box.target,45000);assert.equal(d.plan.amount,12000);
});
test('tab restoration does not change an unfinished payment, edit backup or request reference',()=>{
 const s=state(),d=draft();d.payment.editBackup={recipient:{id:'original'},amount:7500};d.payment.submission={status:'unknown',attemptId:'unchanged-attempt'};const before=structuredClone(d.payment),reference=d.payment;rememberMainTab(d,{section:'pay',page:'amount',edit:true,backTo:{section:'pay',page:'review'}},137);const target=mainTabDestination('pay',s,d);assert.equal(target.route.page,'amount');assert.equal(target.scroll,137);assert.equal(d.payment,reference);assert.deepEqual(d.payment,before);
});
test('completed or removed drafts return to safe roots instead of finished forms',()=>{
 const s=state(),d=draft();rememberMainTab(d,{section:'pay',page:'review'},80);rememberMainTab(d,{section:'boxes',page:'create',step:'review'},150);rememberMainTab(d,{section:'plan',page:'create',step:'amount'},160);d.payment.completed=true;d.payment.transactionId='complete';d.box=null;d.plan.completed=true;assert.deepEqual(mainTabDestination('pay',s,d),{route:{section:'pay',page:'home'},scroll:0});assert.deepEqual(mainTabDestination('boxes',s,d),{route:{section:'boxes',page:'home'},scroll:0});assert.deepEqual(mainTabDestination('plan',s,d),{route:{section:'plan',page:'home'},scroll:0});
});
test('unknown tabs and mismatched cached sections cannot restore unrelated destinations or positions',()=>{
 const d=draft();d.mainTabs={pay:{route:{section:'boxes',page:'home'},scroll:500},home:{route:{section:'life',page:'account-security'},scroll:600}};assert.deepEqual(mainTabDestination('pay',state(),d),{route:{section:'pay',page:'home'},scroll:0});assert.deepEqual(mainTabDestination('unknown',state(),d),{route:{section:'home',page:'home'},scroll:0});
});
test('saved main routes whitelist navigation fields and omit credentials, codes and financial state',()=>{
 const d=draft();rememberMainTab(d,{section:'boxes',page:'create',step:'partner',pin:'1234',password:'private-password',code:'123456',camera:{stream:'not state'},amount:5000,state:{wallet:9000},backTo:{section:'boxes',page:'home',secret:'private'}},200);const encoded=JSON.stringify(d.mainTabs);for(const secret of ['1234','private-password','123456','camera','wallet','5000','secret'])assert.equal(encoded.includes(secret),false);assert.deepEqual(d.mainTabs.boxes.route,{section:'boxes',page:'create',step:'partner',backTo:{section:'boxes',page:'home'}});
});
test('camera and terminal payment pages resume at Payments while Pause returns to review',()=>{
 for(const page of ['scan','status','fund-status']){const d=draft();rememberMainTab(d,{section:'pay',page,id:'completed',mode:'scan'},400);assert.deepEqual(mainTabDestination('pay',state(),d),{route:{section:'pay',page:'home'},scroll:0});}
 const d=draft();rememberMainTab(d,{section:'pay',page:'pause'},99);assert.deepEqual(mainTabDestination('pay',state(),d),{route:{section:'pay',page:'review'},scroll:0});
});
test('signed-out and incomplete-onboarding states cannot restore an authenticated page',()=>{
 const d=draft();rememberMainTab(d,{section:'activity',page:'insights',month:'2026-11'},300);const signedOut=state();signedOut.account.signedOut=true;assert.deepEqual(mainTabDestination('activity',signedOut,d),{route:{section:'life',page:'account-access'},scroll:0});assert.deepEqual(mainTabDestination('activity',{...state(),onboardingDone:false},d),{route:{section:'welcome'},scroll:0});
});
test('a fresh account draft cannot inherit another draft’s saved main pages',()=>{
 const previous=draft();rememberMainTab(previous,{section:'boxes',page:'create',step:'partner'},620);const fresh=draft();assert.deepEqual(mainTabDestination('boxes',state(),fresh),{route:{section:'boxes',page:'home'},scroll:0});assert.equal(fresh.mainTabs,undefined);
});
test('disclosure capture stores only bounded static keys and openness without reading fields',()=>{
 const view=disclosureView([{id:'monthly-tools',summary:'Secret summary should not be stored',open:true,secret:'123456'},{summary:'Everyday bills',open:false},...Array.from({length:70},(_,i)=>({summary:'Tool '+i,open:i%2===0}))]);const records=captureMainTabDisclosures(view);assert.equal(records.length,64);assert.ok(records.every(r=>Object.keys(r).sort().join(',')==='key,open'));const raw=JSON.stringify(records);assert.equal(raw.includes('Secret summary'),false);assert.equal(raw.includes('123456'),false);assert.equal(raw.includes('Everyday bills'),false);assert.equal(records[0].key,'id:monthly-tools:0');
});
test('disclosures restore across stable IDs, whitespace changes and unrelated additions',()=>{
 const old=disclosureView([{id:'monthly-tools',summary:'Tools',open:true},{summary:'Everyday bills',open:true}]);const saved=captureMainTabDisclosures(old);const fresh=disclosureView([{summary:'A new section',open:false},{id:'monthly-tools',summary:'Renamed heading',open:false},{summary:'  Everyday\n bills  ',open:false}]);restoreMainTabDisclosures(fresh,saved);assert.deepEqual(fresh.details.map(d=>d.open),[false,true,true]);
});
test('repeated disclosure headings retain separate states and malformed records are ignored',()=>{
 const source=disclosureView([{summary:'More options',open:true},{summary:'More options',open:false}]),records=captureMainTabDisclosures(source),target=disclosureView([{summary:'More options',open:false},{summary:'More options',open:true},{summary:'Unrelated',open:true}]);assert.notEqual(records[0].key,records[1].key);restoreMainTabDisclosures(target,[...records,{...records[0],open:false},{key:'unknown:1',open:true},{key:records[1].key,open:'yes'},null]);assert.deepEqual(target.details.map(d=>d.open),[true,false,true]);
});
test('disclosures restore only for the unchanged safe page and empty records remain absent',()=>{
 const s=state(),d=draft(),records=captureMainTabDisclosures(disclosureView([{summary:'Everyday bills',open:true}]));rememberMainTab(d,{section:'pay',page:'home',hubTab:'bills'},100,records);assert.deepEqual(mainTabDestination('pay',s,d).disclosures,records);rememberMainTab(d,{section:'boxes',page:'detail',id:'missing-box'},500,records);assert.deepEqual(mainTabDestination('boxes',s,d),{route:{section:'boxes',page:'home'},scroll:0});rememberMainTab(d,{section:'pay',page:'scan'},600,records);assert.equal(mainTabDestination('pay',s,d).disclosures,undefined);rememberMainTab(d,{section:'home',page:'home'},0,[]);assert.deepEqual(mainTabDestination('home',s,d),{route:{section:'home',page:'home'},scroll:0});d.mainTabs.activity={route:{section:'boxes',page:'home'},scroll:500,disclosures:records};assert.deepEqual(mainTabDestination('activity',s,d),{route:{section:'activity',page:'home'},scroll:0});
});
