import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState } from '../dist/js/model.js';
import { parentRoute, safeRoute, chatReturnRoute, routeKey } from '../dist/js/navigation.js';
import { canOpenChatBySwipe } from '../dist/js/chat-gestures.js';
const step = value => ({section:'boxes',page:'create',step:value});

test('Money Box review returns through the optional partner step without losing the goal draft',()=>{
  const state=createDemoState(), draft={box:{name:'Study laptop',target:500000,deadline:'2027-02-01',partnerEnabled:true,partnerName:'Esi',partnerPhone:'0241112222'}};
  const before=JSON.stringify({state,draft});
  assert.deepEqual(parentRoute(step('review'),state,draft),step('partner'));
  assert.deepEqual(parentRoute(step('partner'),state,draft),step('date'));
  assert.deepEqual(safeRoute(step('partner'),state,draft),step('partner'));
  assert.notEqual(routeKey(step('partner')),routeKey(step('review')));
  assert.equal(JSON.stringify({state,draft}),before);
});

test('editing the partner from review returns directly to review while a saved older draft still resumes',()=>{
  const state=createDemoState(), draft={box:{name:'Fees',target:20000,deadline:'2027-01-01'}};
  assert.deepEqual(parentRoute({...step('partner'),edit:true},state,draft),step('review'));
  assert.deepEqual(safeRoute(step('review'),state,draft),step('review'));
  assert.equal(draft.box.partnerEnabled,undefined,'Opening an older draft does not silently enroll a partner.');
  assert.deepEqual(safeRoute(step('partner'),state,{}),{section:'boxes',page:'home'});
});

test('private Ask Lumo preserves a partner setup draft and returns to its exact step',()=>{
  const state=createDemoState(), draft={box:{name:'Laptop',target:400000,partnerEnabled:true,partnerName:'Esi',partnerPhone:'0241112222'}};
  const before=JSON.stringify(draft), route={section:'chat',page:'home',returnTo:step('partner')};
  assert.deepEqual(chatReturnRoute(route,state,draft),step('partner'));
  assert.equal(canOpenChatBySwipe(step('partner')),false,'A form swipe cannot interrupt partner entry.');
  assert.equal(JSON.stringify(draft),before);
});
