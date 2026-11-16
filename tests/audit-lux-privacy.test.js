import test from 'node:test';
import assert from 'node:assert/strict';
import {safeLuxInput,handleLux} from '../api/lux.mjs';
import {isPrivateLuxQuestion,luxQuestionContext} from '../dist/js/lux-brain.js';
import {createEmptyState} from '../dist/js/model.js';

const phrases=['My password is SyntheticReviewA9','My passcode was GreenBirdQ8','My PIN is four-seven-two-one','My recovery key is exampleOnlyQ8','I use ExampleTreeQ8 as my password','My access token: exampleOnlyQ8'];
test('ordinary credential disclosure phrases are blocked before any provider call',async()=>{
 for(const question of phrases){
  let providerCalls=0;const result=await handleLux({authorization:'Bearer synthetic.synthetic.synthetic',body:{question}},{credential:'synthetic-provider',limiter:new Map(),fetcher:async url=>{if(url.includes('ai-gateway'))providerCalls++;return Response.json({ok:true,account:{userId:'synthetic-user'},state:createEmptyState(),sandbox:true,currency:'GHS'});}});
  assert.equal(isPrivateLuxQuestion(question),true,question);assert.equal(result.body.reason,'PRIVATE_INPUT',question);assert.equal(providerCalls,0);
 }
});
test('safe password questions stay eligible while prior disclosure text and derived slots are removed',()=>{
 assert.equal(isPrivateLuxQuestion('How do I change my password?'),false);
 const question='What about my food?',privatePlan={task:'spending',subject:'My password is SyntheticReviewA9'};
 const input=safeLuxInput({question,context:{questions:[phrases[0],'How much did I spend?'],previous:privatePlan}});
 assert.equal(input.sensitive,false);assert.deepEqual(input.context.questions,['How much did I spend?']);assert.equal(input.context.previous,null);
 const context=luxQuestionContext([{role:'user',text:phrases[0]},{role:'user',text:'How much did I spend?'},{role:'assistant',luxPlan:privatePlan}]);
 assert.deepEqual(context.questions,['How much did I spend?']);assert.equal(context.previous,null);
});
