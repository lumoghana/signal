import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,applyAction} from '../dist/js/model.js';
import {renderContextLearning} from '../dist/js/learning-entry.js';
const run=(s,type,p={})=>{const r=applyAction(s,type,p);assert.equal(r.ok,true,r.message);return r;};
test('optional learning never adds a prompt to payment authorisation, Home or human group chat',()=>{
 const state=createDemoState();run(state,'learningEnroll',{goal:'allowance',personalised:true});
 for(const route of [{section:'home',page:'home'},{section:'pay',page:'pause'},{section:'pay',page:'review'},{section:'pay',page:'amount'},{section:'pay',page:'scan'},{section:'life',page:'group-chat'}])assert.equal(renderContextLearning({state,draft:{},route}),'');
});
test('relevant learning entries are amount-free, respect privacy and do not change a money record',()=>{
 const state=createDemoState();run(state,'learningEnroll',{goal:'allowance',personalised:true});const ctx={state,draft:{},route:{section:'plan',page:'home'}},before=JSON.stringify(state);
 const html=renderContextLearning(ctx);assert.match(html,/Learn with Lux/);assert.doesNotMatch(html,/GH[₵¢]|2,480|1,280/);assert.equal(JSON.stringify(state),before);
 state.account.privacy.personalisation=false;assert.equal(renderContextLearning(ctx),'');
});
test('return to practice requires a retained authorised session, including after opting out',()=>{
 const state=createDemoState();run(state,'learningEnroll',{goal:'allowance',personalised:true});const {sessionId}=run(state,'learningStartPractice',{kind:'incoming-plan',mode:'actual'});
 const ctx={state,draft:{learningReturnTo:{section:'learn',page:'practice',id:sessionId}},route:{section:'plan',page:'home'}};
 assert.match(renderContextLearning(ctx),/data-learning-return/);run(state,'learningPreferences',{personalised:false});assert.equal(renderContextLearning(ctx),'');
 ctx.draft.learningReturnTo.id='missing-session';assert.equal(renderContextLearning(ctx),'');
});
