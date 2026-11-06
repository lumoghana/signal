import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createLoginCredential,derivePasswordProof,validateLoginPassword,normalizeUsername,validUsername,validLoginCredential,passwordProofMatches} from '../dist/js/login-credentials.js';

const options={crypto:webcrypto};
test('password credentials use independent salts and accept only the exact password',async()=>{
 const text='Fictional campus password 73';
 const [one,two]=await Promise.all([createLoginCredential(text,options),createLoginCredential(text,options)]);
 assert.equal(validLoginCredential(one),true);assert.equal(one.iterations,210000);
 assert.notEqual(one.salt,two.salt);assert.notEqual(one.verifier,two.verifier);
 assert.equal(JSON.stringify(one).includes(text),false);
 assert.equal(passwordProofMatches(await derivePasswordProof(text,one,options),one),true);
 assert.equal(passwordProofMatches(await derivePasswordProof(text+'x',one,options),one),false);
 assert.equal(passwordProofMatches('1234',one),false);
});
test('a four digit transaction PIN cannot become a login password',async()=>{
 assert.match(validateLoginPassword('1234'),/10 characters/);
 await assert.rejects(createLoginCredential('1234',options),/10 characters/);
 assert.equal(validateLoginPassword('a sufficiently long password'),'');
 assert.match(validateLoginPassword(' '.repeat(15)),/spaces/);
 assert.equal(validUsername('Ama.Student'),true);assert.equal(normalizeUsername(' Ama.Student '),'ama.student');
 assert.equal(validUsername('ab'),false);assert.equal(validUsername('ama student'),false);assert.equal(validUsername('<script>'),false);
});
test('malformed KDF parameters and unsupported browsers fail closed',async()=>{
 const record={version:1,algorithm:'PBKDF2-SHA-256',iterations:210000,salt:'a'.repeat(32),verifier:'b'.repeat(64)};
 for(const wrong of [{...record,iterations:1},{...record,salt:'bad'},{...record,algorithm:'plain'},{...record,verifier:'1234'}]){
  assert.equal(validLoginCredential(wrong),false);assert.equal(passwordProofMatches('b'.repeat(64),wrong),false);
  await assert.rejects(derivePasswordProof('fictional password',wrong,options),/set up again/);
 }
 await assert.rejects(createLoginCredential('fictional password',{crypto:{}}),/supported browser/);
});
