import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState} from '../dist/js/model.js';
import {safeRoute,parentRoute,routeKey,chatReturnRoute} from '../dist/js/navigation.js';
import {canOpenChatBySwipe} from '../dist/js/chat-gestures.js';
test('learning routes keep one-question tasks distinct and always offer Home or the correct parent',()=>{
 const state=createDemoState();
 for(const page of ['home','start','lesson','practice','progress','preferences','review']){
  const r={section:'learn',page,...(['lesson','practice','review'].includes(page)?{id:'planning-foundation'}:{})};
  assert.deepEqual(safeRoute(r,state,{}),r);assert.deepEqual(parentRoute(r,state,{}),['home','start'].includes(page)?{section:'home',page:'home'}:{section:'learn',page:'home'});
  assert.equal(canOpenChatBySwipe(r),false,'A swipe cannot discard a learning answer.');
 }
 assert.notEqual(routeKey({section:'learn',page:'lesson',id:'planning-foundation'}),routeKey({section:'learn',page:'lesson',id:'safety-foundation'}));
});
test('learning returns to the invoking money journey and private Ask Lumo retains its own return route',()=>{
 const state=createDemoState(),origin={section:'pay',page:'transaction',id:'tx-demo-1'};
 assert.deepEqual(parentRoute({section:'learn',page:'lesson',id:'planning-foundation',returnTo:origin},state,{}),origin);
 assert.deepEqual(chatReturnRoute({section:'chat',page:'home',returnTo:{section:'learn',page:'home'}},state,{}),{section:'learn',page:'home'});
 state.account.signedOut=true;
 assert.deepEqual(safeRoute({section:'learn',page:'progress'},state,{}),{section:'life',page:'account-access'});
});
