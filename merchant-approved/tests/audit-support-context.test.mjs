import test from 'node:test';
import assert from 'node:assert/strict';
import {rateLimit,scopedBusiness} from '../server/network.js';
import {counterScope} from '../server/counter.js';
import {createBusiness} from '../dist/domain.js';
import {harness} from './cashier-fixture.mjs';
function fixture(){
 const business=createBusiness({name:'Test Kitchen',ownerName:'Owner',phone:'0240000000',businessType:'sole-trader',destination:'Test',verification:{identity:true,face:true},shop:{name:'Counter shop',area:'Legon',category:'Food',lat:5.65,lng:-.18}});
 const shopId=business.shops[0].id,user={id:'cashier-user',businessId:business.business.id,role:'cashier',shopIds:[shopId]},counter={id:'counter-one',shopId};
 return {business,shopId,user,counter};
}
test('hourly rate-limit guidance reflects the remaining window',()=>{
 const network={rateLimits:{signup:{count:8,startedAt:Date.now(),windowMs:3600000}}};
 assert.throws(()=>rateLimit(network,'signup',8,3600000),error=>error.code==='RATE_LIMITED'&&/60 minutes/.test(error.message));
});
test('cashier help projection strips internal fields and counter catch-up remains explicitly bounded',()=>{
 const {business,shopId,user,counter}=fixture(),now=new Date().toISOString();
 business.transactions=Array.from({length:25},(_,index)=>({id:'payment-'+index,shopId,amount:100,status:'paid',createdAt:now,confirmedAt:now,reference:'REF-'+index,requestId:null}));
 business.tickets=[{id:'mine',shopId,createdByUserId:user.id,createdByStaffId:'access-'+user.id,counterId:counter.id,message:'Phone issue',internalNotes:'PRIVATE OWNER NOTE',responses:[{message:'Checking',internalNotes:'PRIVATE RESPONSE NOTE'}]},{id:'owner-case',shopId,message:'PRIVATE OWNER CASE'}];
 const scoped=scopedBusiness(business,user);assert.equal(scoped.tickets.length,1);assert.doesNotMatch(JSON.stringify(scoped.tickets),/PRIVATE/);
 const projected=counterScope({businesses:{[business.business.id]:business}},{user,counter},scoped);
 assert.equal(projected.shopQRReceipts.length,20);assert.deepEqual(projected.shopReceiptWindow,{hours:24,perChannelLimit:20,mayBeTruncated:true});assert.equal(projected.tickets[0].id,'mine');
});


test('imported ticket metadata cannot claim a verified live cashier or counter identity',async()=>{
 const h=harness();try{
  const owner=h.client(),password='OwnerImportTest12345';
  const saved=await owner.call('/api/signup',{attemptId:'help-import-signup',name:'Test Kitchen',ownerName:'Owner',phone:'0240000000',businessType:'sole-trader',destination:'Test',verification:{identity:true,face:true},shop:{name:'Shop',area:'Legon',category:'Food',lat:5.65,lng:-.18},credentials:{username:'help.import.owner',password}});assert.equal(saved.status,201);
  const {business,shopId}=fixture();business.tickets=[{id:'old-ticket',shopId,subject:'Old case',message:'Historical report',status:'open',createdAt:new Date().toISOString(),createdByUserId:saved.data.user.id,createdByStaffId:'access-'+saved.data.user.id,createdByName:'Claimed actor',createdByRole:'cashier',counterId:'current-counter'}];
  const result=await owner.call('/api/migrate',{confirmImport:true,currentPassword:password,snapshot:business,attemptId:'help-import'});assert.equal(result.status,200,JSON.stringify(result.data));
  const ticket=result.data.state.tickets[0];assert.equal(ticket.createdByUserId,null);assert.equal(ticket.counterId,null);assert.equal(ticket.createdByRole,'imported');assert.notEqual(ticket.createdByStaffId,'access-'+saved.data.user.id);
 }finally{h.close()}
});
