import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, applyAction } from '../dist/js/model.js';
import { accountFundingPhone, normalizeFundingPhone } from '../dist/js/funding-phone.js';

test('registered phone formatting normalizes without accepting a substitute or default', () => {
  for (const value of ['024 000 0000', '+233 24 000 0000', '233240000000', '(024)000-0000']) {
    assert.equal(normalizeFundingPhone(value), '0240000000');
  }
  for (const value of ['', undefined, '024000000', 'hello', '+44240000000', '0110000000']) assert.equal(normalizeFundingPhone(value), '');
  assert.equal(accountFundingPhone({profile:{}}), '');
});

test('a direct MoMo request must match the registered account number and never credits before confirmation', () => {
  const s=createDemoState(), wallet=s.wallet;
  const before=structuredClone(s);
  const rejected=applyAction(s,'startFundingAttempt',{amount:5000,rail:'momo',number:'0551111111',idempotencyKey:'foreign'});
  assert.equal(rejected.ok,false);assert.match(rejected.message,/registered Lumo number/);assert.deepEqual(s,before);
  const request=applyAction(s,'startFundingAttempt',{amount:5000,rail:'momo',number:'+233 24 000 0000',idempotencyKey:'own'});
  assert.equal(request.ok,true);assert.equal(request.funding.number,'0240000000');assert.equal(request.funding.status,'pending');assert.equal(s.wallet,wallet);
  const replay=applyAction(s,'startFundingAttempt',{amount:5000,rail:'momo',number:'+233 24 000 0000',idempotencyKey:'own'});
  assert.equal(replay.duplicate,true);assert.equal(s.fundingAttempts.length,1);assert.equal(s.wallet,wallet);
});

test('missing or invalid registered phone blocks MoMo without inventing a wallet', () => {
  for (const phone of ['', 'invalid']) {
    const s=createDemoState();s.profile.phone=phone;
    const count=s.fundingAttempts.length,wallet=s.wallet;
    assert.equal(applyAction(s,'startFundingAttempt',{amount:1000,rail:'momo',number:'0240000000'}).ok,false);
    assert.equal(s.fundingAttempts.length,count);assert.equal(s.wallet,wallet);
    const bank=applyAction(s,'startFundingAttempt',{amount:1000,rail:'bank',number:'0240000000'});
    assert.equal(bank.ok,true);assert.equal(bank.funding.number,'');assert.equal(s.wallet,wallet);
  }
});

test('a retry keeps its historical reference but binds the new request to the current registered number', () => {
  const s=createDemoState();
  const first=applyAction(s,'startFundingAttempt',{amount:1000,rail:'momo',number:'0240000000'});
  applyAction(s,'resolveFundingAttempt',{id:first.id,status:'expired'});
  s.profile.phone='+233 55 111 1111';
  const retry=applyAction(s,'retryFundingAttempt',{id:first.id});
  assert.equal(retry.ok,true);assert.equal(retry.funding.number,'0551111111');assert.equal(retry.funding.retryOf,first.id);
  assert.notEqual(retry.funding.reference,first.funding.reference);
  assert.equal(s.fundingAttempts.find(f=>f.id===first.id).number,'0240000000');
  assert.equal(s.fundingAttempts.find(f=>f.id===first.id).status,'expired');
  applyAction(s,'resolveFundingAttempt',{id:retry.id,status:'failed'});s.profile.phone='';
  const count=s.fundingAttempts.length;
  assert.equal(applyAction(s,'retryFundingAttempt',{id:retry.id}).ok,false);assert.equal(s.fundingAttempts.length,count);
});
