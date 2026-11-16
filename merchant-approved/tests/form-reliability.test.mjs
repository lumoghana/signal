import test from 'node:test';
import assert from 'node:assert/strict';
import {createSignup} from '../dist/signup.js';
import {createOperations} from '../dist/operations.js';
import {createPeople} from '../dist/people.js';
import {createReporting} from '../dist/reporting.js';

class Storage{constructor(){this.data=new Map()}getItem(key){return this.data.get(key)??null}setItem(key,value){this.data.set(key,String(value))}removeItem(key){this.data.delete(key)}}
globalThis.FormData=class{constructor(form){this.entries=Object.entries(form.values||{})}*[Symbol.iterator](){yield* this.entries}getAll(key){return this.entries.filter(([name])=>name===key).map(([,value])=>value)}};
const form=(values={},dataset={})=>({values,dataset,elements:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value,checked:value==='on'}])),querySelector(){return null}});
const geo=()=>{const pending=[];Object.defineProperty(globalThis,'navigator',{value:{geolocation:{getCurrentPosition(success,failure){pending.push({success,failure})}}},configurable:true});return pending};
const position=(latitude,longitude)=>({coords:{latitude,longitude}});
const data=()=>({business:{id:'business-a',name:'Campus Kitchen'},shops:[{id:'a',name:'Night Market',area:'Night Market',code:'LUM100',lat:5.65,lng:-.19},{id:'b',name:'Pentagon',area:'Pentagon',code:'LUM101',lat:5.66,lng:-.18}],staff:[{id:'staff-a',authUserId:'user-a',name:'Kojo',shopIds:['a'],active:true}],shifts:[{id:'shift-a',shopId:'a',staffId:'staff-a',status:'open',startedAt:new Date().toISOString()}],transactions:[],refunds:[],closings:[],tickets:[{id:'case-a',subject:'First issue',message:'Please check',status:'open'},{id:'case-b',subject:'Other issue',message:'Please check',status:'open'}]});
const owner=()=>({businessId:'business-a',userId:'owner-a',id:'session-a',role:'owner',shopIds:['a','b']});
async function signupAtShop(){
 const storage=new Storage();globalThis.sessionStorage=storage;
 const signup=createSignup({onRender(){}});signup.handleClick('signup-begin',{});
 await signup.handleSubmit(form({phone:'0245550100'}));await signup.handleSubmit(form({otp:'123456'}));
 await signup.handleSubmit(form({username:'shop.owner',password:'TestPassword123',confirmation:'TestPassword123'}));
 await signup.handleSubmit(form({name:'Kitchen',ownerName:'Test Owner'}));signup.handleClick('signup-verify-id',{});signup.handleClick('signup-verify-face',{});await signup.handleSubmit(form());await signup.handleSubmit(form({bankProvider:'GCB',bankNumber:'1234567890'}));
 assert.match(signup.render(),/Your first shop/);return {signup,storage,read:()=>JSON.parse(storage.getItem('lumo-merchant-signup-draft-v1')).data};
}

test('signup manual area choice supersedes late GPS success and error',async()=>{
 const pending=geo(),{signup,read}=await signupAtShop();signup.handleClick('signup-locate',{closest(){return null}});assert.equal(pending.length,1);
 signup.handleChange({name:'area',value:'Pentagon'});pending[0].success(position(5.6509,-.1878));pending[0].failure();
 assert.equal(read().area,'Pentagon');assert.equal(read().lat,5.6535);assert.equal(read().lng,-.1845);assert.equal(read().locationSource,'area');assert.doesNotMatch(signup.render(),/We could not get your location/);
});
test('signup ignores GPS after navigation or leaving signup and rejects invalid coordinates',async()=>{
 const pending=geo(),{signup,read}=await signupAtShop();signup.handleClick('signup-locate',{closest(){return null}});signup.handleClick('signup-back',{closest(){return null}});pending[0].success(position(9,9));assert.equal(read().lat,5.6509);
 signup.handleClick('signup-edit',{dataset:{step:'shop'},closest(){return null}});signup.handleClick('signup-locate',{closest(){return null}});signup.setActive(false);pending[1].success(position(8,8));assert.equal(read().lat,5.6509);
 signup.setActive(true);signup.handleClick('signup-locate',{closest(){return null}});pending[2].success(position(1000,-500));assert.equal(read().lat,5.6509);assert.match(signup.render(),/could not get your location/);
});
test('signup prevents a second pending GPS capture',async()=>{
 const pending=geo(),{signup,read}=await signupAtShop();signup.handleClick('signup-locate',{closest(){return null}});signup.handleClick('signup-locate',{closest(){return null}});assert.equal(pending.length,1);pending[0].success(position(5.67,-.17));assert.equal(read().lat,5.67);
});
test('operations stale GPS cannot overwrite another shop capture or current business',async()=>{
 const pending=geo();let snapshot=data(),session=owner();const ops=createOperations({getState:()=>snapshot,getSession:()=>session,getShopId:()=> 'a'});ops.render('shop-operations');await ops.handleClick('ops-capture-location');
 await ops.handleChange({name:'operationsShop',value:'b'});await ops.handleClick('ops-capture-location');pending[1].success(position(5.67,-.17));pending[0].success(position(5.65,-.19));
 let html=ops.render('shop-operations');assert.match(html,/name="lat" value="5.67"/);assert.match(html,/name="lng" value="-0.17"/);
 await ops.handleClick('ops-capture-location');session={...session,userId:'other-owner',id:'session-b'};pending[2].success(position(4,4));html=ops.render('shop-operations');assert.doesNotMatch(html,/name="lat" value="4"/);
});
test('operations capture is single-flight and navigation cancels callbacks',async()=>{
 const pending=geo(),snapshot=data(),ops=createOperations({getState:()=>snapshot,getSession:owner,getShopId:()=> 'a'});ops.render('shop-operations');await ops.handleClick('ops-capture-location');await ops.handleClick('ops-capture-location');assert.equal(pending.length,1);assert.match(ops.render('shop-operations'),/data-action="ops-capture-location" disabled/);
 ops.leave();pending[0].success(position(6,6));assert.doesNotMatch(ops.render('shop-operations'),/name="lat" value="6"/);
 await ops.handleClick('ops-capture-location');ops.render('activation');pending[1].failure();assert.doesNotMatch(ops.render('shop-operations'),/We could not get/);
});
test('case response and status survive live refresh but clear on save and case/context change',async()=>{
 let snapshot=data(),session=owner();const actions=[];const ops=createOperations({getState:()=>snapshot,getSession:()=>session,act:async(type,payload)=>{actions.push({type,payload});return true}});ops.setTab('support');ops.render('operations');await ops.handleClick('ops-ticket',{dataset:{id:'case-a'}});
 await ops.handleChange({name:'response',value:'Checked receipt <safe>'});await ops.handleChange({name:'status',value:'investigating'});snapshot.transactions.push({id:'new',status:'paid'});let html=ops.render('operations');assert.match(html,/Checked receipt &lt;safe&gt;/);assert.match(html,/value="investigating" selected/);
 await ops.handleSubmit(form({id:'case-a',response:'Checked receipt <safe>',status:'investigating'},{operationsForm:'ticket'}));assert.equal(actions[0].payload.response,'Checked receipt <safe>');assert.doesNotMatch(ops.render('operations'),/Checked receipt &lt;safe&gt;/);
 await ops.handleChange({name:'response',value:'Private draft'});await ops.handleClick('ops-ticket',{dataset:{id:'case-b'}});assert.doesNotMatch(ops.render('operations'),/Private draft/);
 await ops.handleChange({name:'response',value:'New private draft'});session={...session,userId:'other-owner'};assert.doesNotMatch(ops.render('operations'),/New private draft/);
});
test('shift handover survives receipt refresh, clears after successful close and never crosses users',async()=>{
 let session={businessId:'business-a',userId:'user-a',role:'manager',shopIds:['a']};const snapshot=data(),ops=createOperations({getState:()=>snapshot,getSession:()=>session,getShopId:()=> 'a',act:async()=>true});ops.render('shop-operations');await ops.handleChange({name:'note',value:'Restock rice before evening'});snapshot.transactions.push({id:'incoming',status:'paid'});assert.match(ops.render('shop-operations'),/Restock rice before evening/);
 await ops.handleSubmit(form({id:'shift-a',note:'Restock rice before evening'},{operationsForm:'shift'}));assert.doesNotMatch(ops.render('shop-operations'),/Restock rice before evening/);await ops.handleChange({name:'note',value:'Private shift draft'});session={...session,userId:'user-b'};assert.doesNotMatch(ops.render('shop-operations'),/Private shift draft/);
});
test('ownership transfer inputs survive refresh only in memory and clear on cancel or account change',async()=>{
 let session=owner();const snapshot=data(),users=[{id:'owner-a',role:'owner',active:true,name:'Owner'},{id:'target',role:'manager',active:true,name:'Ama',shopIds:['a']}],storage=new Storage();globalThis.sessionStorage=storage;globalThis.localStorage=storage;
 const people=createPeople({auth:{isShared:true,listUsers:()=>users,listInvitations:()=>[]},getState:()=>snapshot,getSession:()=>session});people.render();await people.handleClick('people-user',{dataset:{id:'target'}});await people.handleClick('people-ask-transfer',{dataset:{id:'target'}});people.render();
 people.handleChange({name:'currentPassword',value:'OnlyInMemory123'});people.handleChange({name:'confirmation',value:'TRANSFER'});people.handleChange({name:'acceptResponsibility',checked:true});snapshot.transactions.push({id:'incoming',status:'paid'});let html=people.render();assert.match(html,/value="OnlyInMemory123"/);assert.match(html,/name="confirmation"[^>]*value="TRANSFER"/);assert.match(html,/name="acceptResponsibility" required checked/);assert.equal(storage.data.size,0);
 await people.handleClick('people-cancel-confirm',{});await people.handleClick('people-ask-transfer',{dataset:{id:'target'}});assert.doesNotMatch(people.render(),/OnlyInMemory123/);
 people.handleChange({name:'currentPassword',value:'SecondSecret123'});session={...session,userId:'new-owner'};assert.doesNotMatch(people.render(),/SecondSecret123/);
});
test('report filters reset across business and account contexts including exports',()=>{
 let snapshot=data(),context='business-a:owner-a',exported;const stamp=new Date().toISOString();snapshot.transactions=[{id:'t1',reference:'R1',shopId:'a',staffId:'staff-a',status:'paid',amount:1000,createdAt:stamp,confirmedAt:stamp}];
 const reporting=createReporting({getState:()=>snapshot,getContextKey:()=>context,onExport:rows=>{exported=rows}});reporting.handleChange({dataset:{reporting:'activity'},name:'shopId',value:'a'});assert.equal(reporting.getFilters().shopId,'a');snapshot={...data(),business:{id:'business-b'},shops:[{id:'c',name:'New shop'}],transactions:[{id:'t2',reference:'R2',shopId:'c',status:'paid',amount:2000,createdAt:stamp,confirmedAt:stamp}]};context='business-b:owner-b';assert.equal(reporting.getFilters().shopId,'all');assert.equal(reporting.getFilteredPayments().length,1);reporting.handleClick('reporting-export-activity');assert.equal(exported.length,2);assert.equal(exported[1][0],'R2');
 reporting.handleChange({dataset:{reporting:'activity'},name:'search',value:'hidden filter'});context='business-b:other-owner';assert.equal(reporting.getFilters().search,'');
});
test('report normalizes deleted shop, staff and shift filters within a business',()=>{
 const snapshot=data();const reporting=createReporting({getState:()=>snapshot});for(const [name,value] of [['shopId','a'],['staffId','staff-a'],['shiftId','shift-a']])reporting.handleChange({dataset:{reporting:'activity'},name,value});snapshot.shops=[];snapshot.staff=[];snapshot.shifts=[];const filters=reporting.getFilters();assert.equal(filters.shopId,'all');assert.equal(filters.staffId,'all');assert.equal(filters.shiftId,'all');
});
