import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,createEmptyState,applyAction,getSummary} from '../dist/js/model.js';
import {renderHome,homeNotice} from '../dist/js/home-view.js';
import {renderLife} from '../dist/js/life.js';
import {renderActivityEntries} from '../dist/js/activity-view.js';
import {safeRoute,parentRoute,routeLabel} from '../dist/js/navigation.js';

const date = offset => new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
test('Home uses the independent plan horizon and does not call an ended plan a late allowance',()=>{
  const state=createDemoState();state.settings.hideBalance=false;
  state.budget.endDate=date(4);state.income.nextDate=date(15);
  const ctx={state,draft:{}};
  assert.equal(getSummary(state).guidanceDate,date(4));
  assert.equal(getSummary(state).daysLeft,4);
  assert.equal(homeNotice(state),null);
  assert.doesNotMatch(renderHome(ctx),/Allowance running late|Time to refresh your plan/);
  state.budget.endDate=date(-1);
  const ended=renderHome(ctx);
  assert.match(ended,/Time to refresh your plan/);
  assert.doesNotMatch(ended,/Allowance running late/);
  assert.equal(homeNotice(state).action,'budget');
  state.income.amount=10000;state.income.nextDate=date(-2);
  assert.equal(homeNotice(state).action,'story');
  assert.match(renderHome(ctx),/Allowance running late/);
});

test('unfunded Home keeps the next useful action honest and never invents money',()=>{
  const state=createEmptyState();state.onboardingDone=true;state.settings.hideBalance=false;
  const html=renderHome({state,draft:{}});
  assert.match(html,/Add money when you’re ready/);
  assert.equal(homeNotice(state).action,'fund');
  assert.match(html,/aria-label="Available to plan GH₵0\.00"/);
  assert.equal(getSummary(state).available,0);assert.equal(getSummary(state).spendable,0);
  assert.doesNotMatch(html,/data-action="root-tx:/);
});

test('the secondary Lux library is reachable and has a route back to the shared learning entry',()=>{
  const state=createDemoState(),route={section:'learn',page:'library'};
  assert.deepEqual(safeRoute(route,state,{}),route);
  assert.equal(routeLabel(route),'More with Lux');
  assert.deepEqual(parentRoute(route,state,{}),{section:'learn',page:'home'});
});

test('All your money shows outgoing held money separately and reconciles it without making it spendable',()=>{
  const state=createDemoState();state.settings.hideBalance=false;
  const before=getSummary(state),r=applyAction(state,'payment',{amount:10000,fee:0,recipient:'Kofi',rail:'lumo',category:'Other',status:'pending'});
  assert.equal(r.ok,true,r.message);
  const held=getSummary(state),html=renderLife({state,draft:{}},{section:'life',page:'overview'});
  assert.equal(held.total,before.total);
  assert.equal(held.available,before.available-10000);
  assert.equal(held.pendingPaymentHolds,10000);
  assert.match(html,/Payments awaiting confirmation/);
  assert.match(html,/Included here once; unavailable to spend/);
});

test('an outside IOU receipt is an explicit record in activity and never a new Home credit',()=>{
  const state=createDemoState();state.settings.hideBalance=false;
  state.transactions.unshift({id:'outside-record',type:'iou-manual-receipt',direction:'in',rail:'cash',status:'success',amount:5000,merchant:'Outside friend',at:new Date().toISOString(),manual:true});
  const ctx={state,draft:{}};
  assert.doesNotMatch(renderHome(ctx),/Outside friend/);
  const record=renderActivityEntries(ctx).split('data-action="root-tx:outside-record"')[1].split('</button>')[0];
  assert.match(record,/Outside repayment · Cash · Lumo unchanged/);
  assert.doesNotMatch(record,/feed-positive|\+GH₵/);
});
