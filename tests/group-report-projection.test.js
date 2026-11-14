import test from 'node:test';
import assert from 'node:assert/strict';
import {redactGroupReports,publicGroupReport} from '../dist/js/group-chat-model.js';
import {redactGroupReports as serverRedact} from '../backend/supabase/functions/lumo-approved/domain/group-chat-model.js';

test('public group projections omit every report while preserving shared money and conversation',()=>{
 const privateGroup={id:'group',balance:3000,contributions:[{id:'contribution',amount:3000}],chat:{messages:[{id:'message',text:'A shared update'}],reports:[{id:'report',messageId:'message',reporterId:'other-member',reason:'Private synthetic report'}]}};
 const projection=redactGroupReports(structuredClone(privateGroup));assert.deepEqual(projection.chat.reports,[]);assert.equal(projection.balance,3000);assert.deepEqual(projection.chat.messages,privateGroup.chat.messages);assert.equal(privateGroup.chat.reports.length,1,'public projection does not erase the stored private report');assert.deepEqual(serverRedact(structuredClone(privateGroup)),projection);
});

test('report acknowledgement cannot repeat report reason or reporter identity',()=>{
 assert.deepEqual(publicGroupReport({id:'report',messageId:'message',reporterId:'private-member',reason:'Private text',at:'2030-01-01',status:'stored-locally'}),{id:'report',messageId:'message',status:'saved'});assert.equal(publicGroupReport(null),null);
});
