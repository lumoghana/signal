import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceUpdatePayload,servicePublicMessage,privateCaseContact} from '../admin-portal/operational-model.js';
const contact='11111111-1111-4111-8111-111111111111';
test('returning to automatic preserves the separately configured outage notice',()=>{
 const service={id:'momo_send',version:7,publicMessage:'A specific network is under maintenance.'};
 assert.equal(servicePublicMessage(service),service.publicMessage);
 const payload=serviceUpdatePayload(service,'automatic',' Healthy again ','A hidden default notice');
 assert.deepEqual(payload,{id:'momo_send',mode:'automatic',reason:'Healthy again',expectedVersion:7});assert.equal('message'in payload,false);
 assert.equal(serviceUpdatePayload(service,'manual_off','Problem confirmed',' Notice ').message,'Notice');
 assert.throws(()=>serviceUpdatePayload({...service,version:undefined},'automatic','reason','notice'),/Refresh/);
});
test('a private payment complaint selects one audience and requires a complete record ID',()=>{
 assert.deepEqual(privateCaseContact('consumer',contact,{required:true}),{customerId:contact,merchantId:null});
 assert.deepEqual(privateCaseContact('merchant',contact,{required:true}),{customerId:null,merchantId:contact});
 assert.throws(()=>privateCaseContact('','',{required:true}),/Choose/);
 assert.throws(()=>privateCaseContact('consumer','unverified-label',{required:true}),/record ID/);
 assert.deepEqual(privateCaseContact('',''),{customerId:null,merchantId:null});
});
