import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {lookupGuestPayer} from '../supabase/functions/lumo-approved/guest-payer-lookup.mjs';

const lookup=phone=>lookupGuestPayer(phone,{crypto:webcrypto});

test('canonical Ghana formats resolve to the same masked synthetic record',async()=>{
 const expected=await lookup('0241234567');
 for(const phone of ['+233 24 123 4567','233241234567','024 123 4567','(024) 123-4567'])assert.deepEqual(await lookup(phone),expected);
 assert.equal(expected.phone,'0241234567');
 assert.equal(expected.payer.phoneMasked,'••••••4567');
 assert.equal(JSON.stringify(expected.payer).includes('0241234567'),false);
});

test('directory fixtures model a ported network without inferring one from its prefix',async()=>{
 for(const phone of ['0241234567','0551234567']){
  const {payer}=await lookup(phone);
  assert.equal(payer.network,'telecel');
  assert.equal(payer.networkLabel,'Telecel Cash');
  assert.equal(payer.networkVerified,false);
 }
});

test('arbitrary valid numbers have stable records across independent calls',async()=>{
 const phone='0279876543';
 const first=await lookup(phone),second=await lookupGuestPayer('+233279876543',{crypto:webcrypto});
 assert.deepEqual(first,second);
 assert.ok(['mtn','telecel','airteltigo'].includes(first.payer.network));
 assert.equal(first.payer.registeredName,'Test customer 6543');
});

test('every returned identity explicitly describes unverified sandbox data',async()=>{
 const {payer}=await lookup('0501112233');
 assert.equal(payer.providerMode,'sandbox');
 assert.equal(payer.lookupSource,'sandbox-directory');
 assert.equal(payer.networkVerified,false);
 assert.equal(payer.nameVerified,false);
 assert.match(payer.registeredName,/^Test customer \d{4}$/);
 assert.equal(Object.hasOwn(payer,'phone'),false);
});

test('the lookup result cannot be selected with a caller-supplied network',async()=>{
 const expected=await lookup('0241234567');
 const actual=await lookupGuestPayer('0241234567',{crypto:webcrypto,network:'mtn',registeredName:'Forged live subscriber'});
 assert.deepEqual(actual,expected);
 await assert.rejects(lookup({phone:'0241234567',network:'mtn'}),{code:'INVALID_INPUT',noMutation:true});
});

for(const value of [undefined,null,241234567,{},'', ' ', '0312345678','024123456','02412345678','+234241234567','02412x4567','024/123/4567','0241234567\nignored','0241234567\n','\n0241234567','024\t1234567','(0241234567','024)1234567','((024))1234567','024()1234567','-0241234567','0241234567-','024--1234567','++233241234567'])test('rejects malformed phone '+JSON.stringify(value),async()=>{
 await assert.rejects(lookup(value),error=>error.code==='INVALID_INPUT'&&error.noMutation===true);
});

test('synthetic lookup does not contact a network service',async()=>{
 const prior=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('No network request is permitted');};
 try{await lookup('0265558877');assert.equal(calls,0);}finally{globalThis.fetch=prior;}
});

test('missing cryptographic runtime fails clearly without asserting a result',async()=>{
 await assert.rejects(lookupGuestPayer('0265558877',{crypto:{}}),{code:'LOOKUP_UNAVAILABLE',noMutation:true});
});
