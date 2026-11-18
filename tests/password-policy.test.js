import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newPasswordError} from '../dist/js/password-policy.js';
import {createPasswordPolicy} from '../backend/supabase/functions/lumo-approved/password-policy.mjs';
test('original-secret policy blocks known common, repeated and account-based values while accepting unrelated passphrases',()=>{
 for(const value of ['Password12345','aaaaaaaaaaaa','123123123123','qwertyuiop','abcdabcdabcd','P@ssw0rd123','     '])assert.ok(newPasswordError(value),value);
 assert.ok(newPasswordError('Jessica2026!',{handle:'jessica'}));
 assert.equal(newPasswordError('quiet canoe violet orchard'), '');
 assert.equal(newPasswordError('Δύο λουλούδια στο νερό'), '');
 assert.ok(newPasswordError('a'.repeat(129)));
});
test('production breach screening fails closed on absent, failed and malformed checker and rejects exposed secrets before credential derivation',async()=>{
 const strong='quiet canoe violet orchard';
 for(const checkBreach of [undefined,async()=>{throw Error('offline');},async()=>({}),async()=>({checked:true,breached:'no'})])await assert.rejects(createPasswordPolicy({mode:'production',checkBreach})(strong),e=>e.code==='PASSWORD_POLICY_UNAVAILABLE');
 await assert.rejects(createPasswordPolicy({mode:'production',checkBreach:async()=>({checked:true,breached:true})})(strong),e=>e.code==='PASSWORD_REJECTED');
 assert.equal((await createPasswordPolicy({mode:'production',checkBreach:async()=>({checked:true,breached:false})})(strong)).breachChecked,true);
 let called=false;await assert.rejects(createPasswordPolicy({mode:'production',checkBreach:async()=>{called=true;return {checked:true,breached:false};}})('Password12345'));assert.equal(called,false);
});
test('pilot screening is explicit and browser/backend policy copies remain byte-identical',async()=>{
 assert.equal((await createPasswordPolicy()('quiet canoe violet orchard')).breachChecked,false);
 assert.equal(await readFile(new URL('../dist/js/password-policy.js',import.meta.url),'utf8'),await readFile(new URL('../backend/supabase/functions/lumo-approved/domain/password-policy.js',import.meta.url),'utf8'));
});
test('local versioned digest denylist screens the original secret before Auth derivation',async()=>{
 for(const value of ['Tr0ub4dor&3','correct horse battery staple','CorrectHorseBatteryStaple'])await assert.rejects(createPasswordPolicy()(value),e=>e.code==='PASSWORD_REJECTED');
});
