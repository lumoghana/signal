import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createD1} from '../scripts/d1-adapter.mjs';
import {handleAPI} from '../server/api.js';
import {createOperations} from '../dist/operations.js';

globalThis.FormData=class{constructor(form){this.entries=Object.entries(form.values||{})}*[Symbol.iterator](){yield* this.entries}};
const form=(kind,values)=>({dataset:{operationsForm:kind},values,querySelector(){return null}});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const csv=reference=>'reference,amount,status\n'+reference+',10.00,paid';
const file=(name,read)=>({name,size:200,text:()=>read.promise});
async function fixture(){
 const DB=createD1();for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())await DB.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 const env={DB};
 const client=()=>{const cookies=new Map();return {async call(path,body){const headers={Origin:'https://operations.test','X-Lumo-Request':'1','cf-connecting-ip':crypto.randomUUID()};if(body!==undefined)headers['Content-Type']='application/json';headers.Cookie=[...cookies].map(([key,value])=>key+'='+value).join('; ');const response=await handleAPI(new Request('https://operations.test'+path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),env);for(const cookie of response.headers.getSetCookie()){const [key,...value]=cookie.split(';')[0].split('=');cookies.set(key,value.join('='))}const data=await response.json();assert.ok(response.ok,JSON.stringify(data));return data}}};
 const first=client(),second=client();
 const signup=tag=>({attemptId:crypto.randomUUID(),name:'Operations '+tag,ownerName:'Owner '+tag,phone:'0245550100',businessType:'sole-trader',destination:'Sandbox bank',verification:{phone:true,identity:true,face:true},shop:{name:'Shop '+tag,area:'Night Market',category:'Food',lat:5.65,lng:-.18},credentials:{username:'ops.context.'+tag,password:'OwnerTest1234'}});
 const a=await first.call('/api/signup',signup('a')),b=await second.call('/api/signup',signup('b'));
 let snapshot=a.state,session=a.session,active=first,hook=null,redraws=0;const calls=[];
 const ops=createOperations({getState:()=>snapshot,getSession:()=>session,onRender(){redraws++},act:async(type,payload)=>{const caller=active;calls.push({type,payload});const result=await caller.call('/api/action',{type,payload});if(hook)await hook(type,payload,result);if(active===caller)snapshot=result.state;return result.entity||result.state}});
 return {ops,a,b,first,second,calls,get snapshot(){return snapshot},get redraws(){return redraws},setHook(value){hook=value},switchToB(){snapshot=b.state;session=b.session;active=second},changeSession(){session={...session,id:'a-new-session',userId:'a-new-user'}},close(){DB.close()}};
}

test('statement-file completion cannot place merchant A rows or filename into merchant B',async()=>{
 const f=await fixture();try{
  f.ops.setTab('reconciliation');f.ops.render('operations');const read=deferred(),loading=f.ops.handleChange({name:'statementFile',files:[file('Private A.csv',read)]});
  f.switchToB();f.ops.render('operations');f.ops.setTab('reconciliation');await f.ops.handleChange({name:'statement',value:csv('B-ONLY')});const renders=f.redraws;
  read.resolve(csv('PRIVATE-A'));await loading;const html=f.ops.render('operations');assert.match(html,/B-ONLY/);assert.doesNotMatch(html,/PRIVATE-A|Private A\.csv|Statement loaded/);assert.equal(f.redraws,renders,'obsolete callbacks do not redraw the new workspace');
 }finally{f.close()}
});

test('newer statement selection wins and obsolete success or error cannot overwrite it',async()=>{
 const f=await fixture();try{
  f.ops.setTab('reconciliation');f.ops.render('operations');const old=deferred(),latest=deferred();
  const oldRead=f.ops.handleChange({name:'statementFile',files:[file('Old.csv',old)]}),newRead=f.ops.handleChange({name:'statementFile',files:[file('Latest.csv',latest)]});
  latest.resolve(csv('LATEST'));await newRead;old.resolve('invalid CSV');await oldRead;let html=f.ops.render('operations');assert.match(html,/Latest\.csv/);assert.match(html,/LATEST/);assert.doesNotMatch(html,/Old\.csv|Use a reference/);
  const staleError=deferred(),current=deferred();const first=f.ops.handleChange({name:'statementFile',files:[file('Ignored.csv',staleError)]}),second=f.ops.handleChange({name:'statementFile',files:[file('Current.csv',current)]});current.resolve(csv('CURRENT'));await second;staleError.reject(new Error('Private obsolete file error'));await first;html=f.ops.render('operations');assert.match(html,/CURRENT/);assert.doesNotMatch(html,/Private obsolete/);
 }finally{f.close()}
});

test('statement reads are invalidated by user/session changes, leaving, tab changes and manual edits',async()=>{
 const f=await fixture();try{
  for(const action of ['session','leave','page','tab','manual','cleared-selection']){
   f.ops.setTab('reconciliation');f.ops.render('operations');const read=deferred(),loading=f.ops.handleChange({name:'statementFile',files:[file('Stale '+action+'.csv',read)]});
   if(action==='session')f.changeSession();
   if(action==='leave')f.ops.leave();
   if(action==='page')f.ops.render('activation');
   if(action==='tab')f.ops.setTab('support');
   if(action==='manual')await f.ops.handleChange({name:'statement',value:csv('MANUAL')});
   if(action==='cleared-selection')await f.ops.handleChange({name:'statementFile',files:[]});
   read.resolve(csv('OBSOLETE-'+action));await loading;f.ops.setTab('reconciliation');const html=f.ops.render('operations');assert.doesNotMatch(html,/OBSOLETE-|Stale .*\.csv/);
   if(action==='manual')assert.match(html,/MANUAL/);
  }
 }finally{f.close()}
});

test('invalid new CSV reports its error without replacing the existing valid draft',async()=>{
 const f=await fixture();try{
  f.ops.setTab('reconciliation');f.ops.render('operations');await f.ops.handleChange({name:'statement',value:csv('KEEP-VALID')});const read=deferred(),loading=f.ops.handleChange({name:'statementFile',files:[file('Bad.csv',read)]});read.resolve('broken');await loading;
  const html=f.ops.render('operations');assert.match(html,/KEEP-VALID/);assert.match(html,/header and at least one statement row/);assert.doesNotMatch(html,/value="Bad\.csv"/);
 }finally{f.close()}
});

test('saving shop details and closing rules preserves the other form draft through real API updates',async()=>{
 const f=await fixture();try{
  const id=f.a.state.shops[0].id;f.ops.render('shop-operations');
  await f.ops.handleChange({name:'hours',value:'8 am – midnight'});await f.ops.handleChange({name:'landmark',value:'Beside the library'});await f.ops.handleChange({name:'cutoff',value:'03:00'});await f.ops.handleChange({name:'closeMode',value:'automatic'});
  await f.ops.handleSubmit(form('closing',{shopId:id,cutoff:'03:00',closeMode:'automatic'}));let html=f.ops.render('shop-operations');assert.match(html,/8 am – midnight/);assert.match(html,/Beside the library/);assert.equal(f.snapshot.shops[0].cutoff,'03:00');assert.notEqual(f.snapshot.shops[0].hours,'8 am – midnight');
  await f.ops.handleChange({name:'cutoff',value:'04:00'});await f.ops.handleChange({name:'closeMode',value:'manual'});
  await f.ops.handleSubmit(form('shop',{shopId:id,hours:'8 am – midnight',landmark:'Beside the library',lat:'5.65',lng:'-.18'}));html=f.ops.render('shop-operations');assert.equal(f.snapshot.shops[0].hours,'8 am – midnight');assert.equal(f.snapshot.shops[0].cutoff,'03:00');assert.match(html,/value="04:00"/);assert.match(html,/<option value="manual" selected>/);
 }finally{f.close()}
});

test('edits typed while a shop save is in flight survive that older save response',async()=>{
 const f=await fixture();try{
  const id=f.a.state.shops[0].id,held=deferred(),started=deferred();f.ops.render('shop-operations');await f.ops.handleChange({name:'hours',value:'Submitted hours'});
  f.setHook(async()=>{started.resolve();await held.promise});const saving=f.ops.handleSubmit(form('shop',{shopId:id,hours:'Submitted hours',landmark:'Old landmark',lat:'5.65',lng:'-.18'}));await started.promise;
  await f.ops.handleChange({name:'hours',value:'New unsaved hours'});await f.ops.handleChange({name:'landmark',value:'New unsaved landmark'});held.resolve();await saving;assert.equal(f.snapshot.shops[0].hours,'Submitted hours');const html=f.ops.render('shop-operations');assert.match(html,/New unsaved hours/);assert.match(html,/New unsaved landmark/);
 }finally{f.close()}
});

test('late save completion cannot clear another account location or release its active save',async()=>{
 const f=await fixture(),oldNavigator=globalThis.navigator;
 try{
  const firstHeld=deferred(),secondHeld=deferred(),firstStarted=deferred(),secondStarted=deferred();let count=0;
  f.setHook(async()=>{count++;if(count===1){firstStarted.resolve();await firstHeld.promise}else if(count===2){secondStarted.resolve();await secondHeld.promise}});
  f.ops.render('shop-operations');const aId=f.a.state.shops[0].id,firstSaving=f.ops.handleSubmit(form('shop',{shopId:aId,hours:'Saved A',landmark:'A',lat:'5.65',lng:'-.18'}));await firstStarted.promise;
  f.switchToB();f.ops.render('shop-operations');let captured;Object.defineProperty(globalThis,'navigator',{value:{geolocation:{getCurrentPosition(success){captured=success}}},configurable:true});await f.ops.handleClick('ops-capture-location');captured({coords:{latitude:5.699,longitude:-.177}});
  const bId=f.b.state.shops[0].id;await f.ops.handleChange({name:'hours',value:'Private B draft'});const secondSaving=f.ops.handleSubmit(form('closing',{shopId:bId,cutoff:'04:00',closeMode:'manual'}));await secondStarted.promise;
  firstHeld.resolve();await firstSaving;let html=f.ops.render('shop-operations');assert.match(html,/Private B draft/);assert.match(html,/name="lat" value="5.699"/);assert.doesNotMatch(html,/Shop details saved/);
  await f.ops.handleSubmit(form('closing',{shopId:bId,cutoff:'05:00',closeMode:'automatic'}));assert.equal(f.calls.length,2,'obsolete A completion must not unlock a currently pending B save');secondHeld.resolve();await secondSaving;
 }finally{Object.defineProperty(globalThis,'navigator',{value:oldNavigator,configurable:true});f.close()}
});
