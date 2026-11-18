import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecoveryPassword} from '../../admin-portal/password-recovery.js';
const admin={minLength:12,maxLength:72,maxBytes:72,lettersAndNumbers:false};
test('actual admin recovery accepts a long unrelated passphrase and rejects a predictable original secret',()=>{
 const phrase='quiet canoe violet orchard';assert.equal(validateRecoveryPassword(phrase,phrase,admin),'');
 assert.match(validateRecoveryPassword('administrator','administrator',admin),/less predictable/);
 assert.match(validateRecoveryPassword(phrase,phrase+'different',admin),/do not match/);
});
test('actual admin recovery enforces its server byte ceiling before sending a multibyte password',()=>{
 const phrase='quiet canoe orchard '+'🧭'.repeat(14);assert.ok(phrase.length<72);assert.ok(new TextEncoder().encode(phrase).length>72);
 assert.match(validateRecoveryPassword(phrase,phrase,admin),/72 bytes/);
});
