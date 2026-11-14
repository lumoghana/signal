import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusinessPlan} from '../dist/business-plan.js';
import {businessPlanProjection} from '../dist/business-plan-model.js';

const originalFormData=globalThis.FormData;
class Fields {constructor(form){this.values=form.values;}[Symbol.iterator](){return this.values[Symbol.iterator]();}getAll(key){return this.values.filter(entry=>entry[0]===key).map(entry=>entry[1]);}}
const form=(kind,values)=>({dataset:{planForm:kind},values:Object.entries(values)});
const element=(action,extra={})=>({dataset:{action:'plan-'+action,...extra}});
const base=()=>({business:{id:'business-a',name:'Campus shop'},shops:[{id:'shop-a',name:'Night Market'},{id:'shop-b',name:'Pentagon'}],openingBalance:100000,transactions:[],refunds:[],settlements:[],businessPlan:{revision:0,stockReserve:{amount:30000},expenses:[{id:'expense-private',title:'Restock packaging',amount:10000,shopId:'shop-a',status:'planned',category:'expense'}],managerShopIds:['shop-a']}});
function controller({api=async()=>{},user={id:'session-a',userId:'owner-a',businessId:'business-a',role:'owner',shopIds:['shop-a','shop-b']},sample=false}={}){
 let raw=base(),current=user,draws=0;let state={...raw,...businessPlanProjection(raw,{...user,id:user.userId})};
 const module=createBusinessPlan({getState:()=>state,getSession:()=>current,isSample:()=>sample,onChange:()=>draws++,api:(path,options)=>api(path,options,{setState(value){state=value;},state,current})});
 return {module,getState:()=>state,getDraws:()=>draws,setUser(value,snapshot){current=value;state=snapshot;}};
}

test('owner sees the shared after-plan estimate and explicit non-payment explanations',()=>{
 const f=controller(),html=f.module.render();assert.match(html,/GH₵600\.00/);assert.match(html,/Available after payment holds/);assert.match(html,/Planning estimate · all shops/);assert.match(html,/does not reserve, spend or move money/);assert.match(html,/Manager planning access/);
 const sample=controller({sample:true});assert.match(sample.module.render(),/Sign in to plan with your shared merchant funds/);assert.doesNotMatch(sample.module.render(),/GH₵600\.00/);
});

test('manager rendering has only enabled shop commitments and no owner financial controls',()=>{
 const f=controller({user:{id:'manager-session',userId:'manager-a',businessId:'business-a',role:'manager',shopIds:['shop-a']}}),html=f.module.render();
 assert.match(html,/GH₵100\.00/);assert.match(html,/Night Market/);assert.doesNotMatch(html,/Available after payment holds|Save stock reserve|Manager planning access|Pentagon/);
});

test('an interrupted planning request retries the original details and reference',async()=>{
 globalThis.FormData=Fields;const requests=[];let fail=true;
 try{
  const f=controller({api:async(path,options)=>{requests.push(structuredClone(options.body));if(fail)throw new TypeError('Response interrupted');return {};}});
  f.module.render();await f.module.handleSubmit(form('reserve',{reserveAmount:'400.00'}));assert.match(f.module.render(),/saved planning request still needs an outcome/);
  fail=false;await f.module.handleClick(element('retry'));assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);assert.equal(requests[0].payload.amount,40000);assert.match(f.module.render(),/No money moved/);
 }finally{globalThis.FormData=originalFormData;}
});

test('account switches clear protected expense drafts and discard late notices',async()=>{
 globalThis.FormData=Fields;let finish;const response=new Promise(resolve=>finish=resolve);
 try{
  const f=controller({api:async()=>response});f.module.render();await f.module.handleClick(element('edit',{id:'expense-private'}));assert.match(f.module.render(),/value="Restock packaging"/);
  const saving=f.module.handleSubmit(form('expense',{title:'Restock packaging',amount:'100.00',shopId:'shop-a',category:'expense',status:'planned',dueDate:''}));
  f.setUser({id:'session-b',userId:'owner-b',businessId:'business-b',role:'owner',shopIds:[]},{business:{id:'business-b'},shops:[],openingBalance:0,transactions:[],refunds:[],settlements:[],businessPlan:{expenses:[]},businessPlanAccess:{canView:true,canEdit:true,allowedShopIds:[]}});
  assert.doesNotMatch(f.module.render(),/Restock packaging/);finish({});await saving;assert.doesNotMatch(f.module.render(),/Restock packaging|Business plan saved/);
 }finally{globalThis.FormData=originalFormData;}
});

test('expense forms send integer pesewas and distinguish already-paid external records',async()=>{
 globalThis.FormData=Fields;let saved;
 try{
  const f=controller({api:async(path,options)=>{saved=options.body;return {};}});f.module.render();await f.module.handleClick(element('add'));
  await f.module.handleSubmit(form('expense',{title:'Cash purchase',amount:'12.34',shopId:'shop-a',category:'stock',status:'recorded',funding:'external',dueDate:''}));
  assert.equal(saved.operation,'upsertExpense');assert.equal(saved.payload.amount,1234);assert.equal(saved.payload.funding,'external');assert.equal(saved.payload.status,'recorded');assert.equal(saved.payload.ledgerReference,null);
 }finally{globalThis.FormData=originalFormData;}
});
