import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDemoState} from '../dist/js/model.js';
import {renderPayments,bindPayments,isCompletedPayment} from '../dist/js/payments.js';

const route={section:'pay',page:'status',id:'confirmed-payment'};
function setup(extra={}){const state=createDemoState();const tx={id:route.id,type:'payment',direction:'out',status:'success',merchant:'Kofi Mensah',amount:3500,rail:'lumo',...extra};state.transactions.unshift(tx);return {state,draft:{lastPayment:tx,payment:{completed:true,idempotencyKey:'original'}},route};}

test('only confirmed outgoing payments with completed service delivery get the celebration',()=>{
  assert.equal(isCompletedPayment(setup().draft.lastPayment),true);
  for(const extra of [{status:'pending'},{status:'failed'},{status:'reversed'},{status:'unknown'},{type:'funding'},{direction:'in'},{type:'iou-manual-receipt'},{serviceId:'data'},{serviceId:'data',delivery:{status:'pending'}},{serviceId:'data',delivery:{status:'failed'}}])assert.equal(isCompletedPayment(setup(extra).draft.lastPayment),false,JSON.stringify(extra));
  assert.equal(isCompletedPayment(setup({serviceId:'data',delivery:{status:'delivered'}}).draft.lastPayment),true);
});

test('completed payment renders a full-screen, uncluttered result without changing money or receipts',()=>{
  const ctx=setup(),before=JSON.stringify(ctx.state),html=renderPayments(ctx,route);
  assert.match(html,/payment-success-screen/);assert.match(html,/Sent\. Sorted\./);assert.match(html,/GH₵35\.00/);assert.match(html,/Kofi Mensah/);assert.match(html,/data-action="pay-home"/);assert.match(html,/data-action="pay-detail"/);
  assert.doesNotMatch(html,/Back to Payments|Return to [Pp]ayments|class="page|Reversal simulation|data-action="pay-simulate/);assert.equal(JSON.stringify(ctx.state),before);
});

test('Done clears the completed draft and finishes at Home; receipt retains result return route',()=>{
  const ctx=setup(),handlers={},routes=[];let saves=0;ctx.$$=selector=>{const name=selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];return name?[{addEventListener:(_,fn)=>handlers[name]=fn}]:[];};ctx.$=()=>null;ctx.setCapture=()=>{};ctx.saveDraft=()=>saves++;ctx.finish=r=>routes.push(r);ctx.go=r=>routes.push(r);bindPayments(ctx,route);
  const before=JSON.stringify(ctx.state);handlers['pay-detail']();assert.equal(routes.at(-1).page,'transaction');assert.deepEqual(routes.at(-1).returnTo,route);assert.deepEqual(routes.at(-1).backTo,route);
  handlers['pay-home']();assert.equal(ctx.draft.payment,null);assert.ok(saves>0);assert.deepEqual(routes.at(-1),{section:'home',page:'home'});assert.equal(JSON.stringify(ctx.state),before);
});

test('pending, failed, reversed and delivery problems keep their financial meanings and recovery',()=>{
  for(const [extra,pattern] of [[{status:'pending'},/pay-check-status/],[{status:'failed'},/pay-retry/],[{status:'reversed'},/Money returned/],[{serviceId:'data',delivery:{status:'failed'}},/Don’t pay again/]]){const html=renderPayments(setup(extra),route);assert.doesNotMatch(html,/payment-success-screen/);assert.match(html,pattern);assert.doesNotMatch(html,/Back to Payments/);}
});

test('receipt display escapes names and supports long values; full-screen motion is finite and optional',()=>{
  const ctx=setup({merchant:'<img src=x onerror=alert(1)>',amount:12345678900}),html=renderPayments(ctx,route);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);assert.match(html,/123,456,789\.00/);
  const css=readFileSync(new URL('../dist/payment-success.css',import.meta.url),'utf8');assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/overflow-y:auto/);assert.match(css,/safe-area-inset-bottom/);assert.doesNotMatch(css,/infinite/);
});
