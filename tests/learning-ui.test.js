import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,createEmptyState,applyAction,getSummary} from '../dist/js/model.js';
import {getLearningLesson,getLearningPractice} from '../dist/js/learning-model.js';
import {renderLearning,bindLearning,renderLearningEntry} from '../dist/js/learning-ui.js';
import {cash} from '../dist/js/ui.js';
import {getCampusGame} from '../dist/js/learning-game-model.js';

const run=(state,type,payload={})=>{const result=applyAction(state,type,payload);assert.equal(result.ok,true,result.message);return result;};
const enrol=(state,personalised=false)=>run(state,'learningEnroll',{goal:'allowance',personalised});
function finance(state){return JSON.stringify({wallet:state.wallet,budget:state.budget,boxes:state.boxes,transactions:state.transactions,ious:state.ious,groups:state.groups});}
function harness(state,route={section:'learn',page:'library'},draft={}){
 const callbacks=new Map(),root={isConnected:true,addEventListener:(name,fn)=>callbacks.set(name,fn),removeEventListener:(name)=>callbacks.delete(name)},error={textContent:''};
 let current=route,refreshes=0;const actions=[],routes=[];
 const ctx={state,draft,get route(){return current;},$(q){return q==='.learning-page'?root:q==='[data-learning-error]'?error:null;},$$(){return[];},saveDraft(){},refresh(){refreshes++;},toast(){},go(next){current=next;routes.push(next);},act(type,payload){actions.push({type,payload});return applyAction(state,type,payload);},sheet(){},closeSheet(){}};
 const cleanup=bindLearning(ctx,route);
 const click=(dataset,disabled=false)=>callbacks.get('click')?.({target:{closest(){return {dataset,disabled};}}});
 return {ctx,root,error,actions,routes,click,cleanup,get refreshes(){return refreshes;},get route(){return current;},setRoute(next){current=next;}};
}

test('learning introduction is private, uses existing Lux and does not mutate money while rendering',()=>{
 const state=createDemoState(),before=finance(state),h=harness(state,{section:'learn',page:'home'}),html=renderLearning(h.ctx,h.route);
 assert.match(html,/lux-chat-2d.webp/);assert.match(html,/Think you know/);assert.match(html,/data-miq-action="start"/);assert.match(html,/data-miq-action="home"/);assert.match(html,/data-miq-action="library"/);assert.doesNotMatch(html,/Campus has plans/);assert.equal(finance(state),before);
 assert.match(renderLearningEntry(h.ctx),/data-action="open-learning"/);h.cleanup();
});

test('enrolment makes an explicit own-activity choice without creating a financial action',()=>{
 const state=createDemoState(),before=finance(state),h=harness(state,{section:'learn',page:'start'});
 h.click({learnAction:'choose-focus'});h.click({learnGoal:'saving'});h.click({learnAction:'start-next'});assert.match(renderLearning(h.ctx,h.route),/Use my Lumo activity/);
 h.click({learnMode:'actual'});h.click({learnAction:'enrol'});
 assert.equal(state.learning.enrolled,true);assert.equal(state.learning.personalised,true);assert.equal(state.learning.goal,'saving');assert.deepEqual(h.route,{section:'learn',page:'money-iq'});assert.equal(finance(state),before);assert.deepEqual(h.actions.map(a=>a.type),['learningEnroll']);h.cleanup();
});

test('account privacy override offers examples and never displays an unavailable actual-activity choice',()=>{
 const state=createDemoState();state.account.privacy.personalisation=false;
 const h=harness(state,{section:'learn',page:'start'},{learningUI:{startStep:'mode',goal:'allowance'}}),html=renderLearning(h.ctx,h.route);
 assert.doesNotMatch(html,/data-learn-mode="actual"/);assert.match(html,/Personalisation is off/);h.click({learnMode:'example'});h.click({learnAction:'enrol'});assert.equal(state.learning.personalised,false);h.cleanup();
});

test('lesson feedback handles both wrong-question and completed-correct engine states and awards once',()=>{
 const state=createDemoState();enrol(state);const {sessionId}=run(state,'learningStartLesson',{lessonId:'planning-allowance'}),h=harness(state,{section:'learn',page:'lesson',id:'planning-allowance'},{learningUI:{lessonStory:{[sessionId]:false}}}),before=finance(state);
 h.click({learnAnswer:'lesson',option:'0'});assert.match(renderLearning(h.ctx,h.route),/Let’s look at it together/);assert.equal(state.learning.points,0);
 h.click({learnAnswer:'lesson',option:'1'});const html=renderLearning(h.ctx,h.route);assert.match(html,/Now the weekend has a number/);assert.match(html,/GH₵150/);assert.match(html,/Try a money moment/);assert.equal(state.learning.points,10);
 h.click({learnAnswer:'lesson',option:'1'});assert.equal(state.learning.points,10);assert.equal(finance(state),before);h.cleanup();
});

test('personalised practice starts with the actual mode shown selected, instead of silently using an example',()=>{
 const state=createDemoState();enrol(state,true);const h=harness(state,{section:'learn',page:'practice',id:'incoming-plan'}),html=renderLearning(h.ctx,h.route);
 assert.match(html,/data-practice-mode="actual" aria-pressed="true"/);h.click({learnAction:'practice-begin',practiceKind:'incoming-plan'});
 const session=state.learning.sessions.find(s=>s.id===h.route.id);assert.equal(session.mode,'actual');assert.equal(session.kind,'incoming-plan');h.cleanup();
});

test('own practice respects hidden balances until an exercise-only reveal, leaving the global preference intact',()=>{
 const state=createDemoState();enrol(state,true);const {sessionId}=run(state,'learningStartPractice',{kind:'incoming-plan',mode:'actual'}),h=harness(state,{section:'learn',page:'practice',id:sessionId}),before=finance(state),flex=cash(getSummary(state).spendable);
 let html=renderLearning(h.ctx,h.route);assert.match(html,/Show amounts for this exercise/);assert.doesNotMatch(html,/data-learn-answer="practice"/);assert.doesNotMatch(html,new RegExp(flex.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 h.click({learnAction:'practice-reveal'});html=renderLearning(h.ctx,h.route);assert.doesNotMatch(html,/data-learn-answer="practice"/);assert.ok(html.includes(flex));h.click({learnAction:'practice-choice'});html=renderLearning(h.ctx,h.route);assert.match(html,/data-learn-answer="practice"/);assert.equal(state.settings.hideBalance,true);assert.equal(finance(state),before);h.cleanup();
});

test('completing example practice needs a question and reflection, with no repeated reward or money movement',()=>{
 const state=createEmptyState();enrol(state);const {sessionId}=run(state,'learningStartPractice',{kind:'weekly-review',mode:'example'}),h=harness(state,{section:'learn',page:'practice',id:sessionId}),before=finance(state);
 h.click({learnAction:'practice-complete'});assert.match(h.error.textContent,/Choose the reflection/);assert.equal(state.learning.points,0);
 h.click({learnAnswer:'practice',option:String(getLearningPractice(state,sessionId,{summary:getSummary(state)}).options.indexOf(cash(15000)))});h.click({learningReflection:'example-reviewed'});h.click({learnAction:'practice-complete'});assert.equal(getLearningPractice(state,sessionId,{summary:getSummary(state)}).status,'completed');assert.equal(state.learning.points,20);
 h.click({learnAction:'practice-complete'});assert.equal(state.learning.points,20);assert.equal(finance(state),before);assert.match(renderLearning(h.ctx,h.route),/You showed up/);h.cleanup();
});

test('a changed balance refreshes an actual question instead of marking an old answer wrong',()=>{
 const state=createDemoState();enrol(state,true);const {sessionId}=run(state,'learningStartPractice',{kind:'incoming-plan',mode:'actual'}),h=harness(state,{section:'learn',page:'practice',id:sessionId});state.wallet-=100;
 h.click({learnAnswer:'practice',option:'1'});assert.match(h.error.textContent,/changed/);assert.equal(state.learning.points,0);assert.match(renderLearning(h.ctx,h.route),/Your money<br>has moved on/);assert.match(renderLearning(h.ctx,h.route),/Refresh my exercise/);h.cleanup();
});

test('an incorrect practice choice shows a useful explanation and permits another choice',()=>{
 const state=createEmptyState();enrol(state);const {sessionId}=run(state,'learningStartPractice',{kind:'incoming-plan',mode:'example'}),h=harness(state,{section:'learn',page:'practice',id:sessionId}),v=getLearningPractice(state,sessionId,{summary:getSummary(state)}),correct=v.options.indexOf(cash(15000));
 h.click({learnAction:'practice-choice'});h.click({learnAnswer:'practice',option:String((correct+1)%v.options.length)});
 const html=renderLearning(h.ctx,h.route);assert.match(html,/Let’s look at it together/);assert.match(html,/GH₵150.00 is flexible/);assert.match(html,/Try another move/);assert.equal(state.learning.points,0);
 h.click({learnAnswer:'practice',option:String(correct)});assert.equal(getLearningPractice(state,sessionId,{summary:getSummary(state)}).status,'answered');h.cleanup();
});

test('a completed plan review returns current figures with a clear acknowledgement of the change',()=>{
 const state=createDemoState();enrol(state,true);state.settings.hideBalance=false;
 const {sessionId}=run(state,'learningStartPractice',{kind:'incoming-plan',mode:'actual'});const v=getLearningPractice(state,sessionId,{summary:getSummary(state)});run(state,'learningAnswerPractice',{sessionId,option:v.options.indexOf(cash(getSummary(state).spendable))});
 const items=state.budget.items.map(i=>({...i,amount:i.amount+100}));run(state,'createBudget',{items,buffer:state.buffer});
 const h=harness(state,{section:'learn',page:'practice',id:sessionId});let html=renderLearning(h.ctx,h.route);assert.match(html,/Plan updated/);assert.match(html,/Make the next/);h.click({learnAction:'practice-picture'});html=renderLearning(h.ctx,h.route);assert.match(html,/These figures show your latest recorded money/);assert.ok(html.includes(cash(getSummary(state).spendable)));h.cleanup();
});

test('reviewing a financial plan preserves an explicit learning return route and performs no financial action',()=>{
 const state=createDemoState();enrol(state,true);const {sessionId}=run(state,'learningStartPractice',{kind:'incoming-plan',mode:'actual'});run(state,'learningAnswerPractice',{sessionId,option:getLearningPractice(state,sessionId,{summary:getSummary(state)}).options.indexOf(cash(getSummary(state).spendable))});
 const h=harness(state,{section:'learn',page:'practice',id:sessionId}),before=finance(state);h.click({learningRoute:'0'});
 assert.equal(h.route.section,'plan');assert.deepEqual(h.route.returnTo,{section:'learn',page:'practice',id:sessionId});assert.deepEqual(h.ctx.draft.learningReturnTo,h.route.returnTo);assert.equal(h.actions.length,0);assert.equal(finance(state),before);h.cleanup();
});

test('disposed or detached learning controls cannot submit answers or enrol a student',()=>{
 for(const detached of [false,true]){const state=createDemoState(),h=harness(state,{section:'learn',page:'start'},{learningUI:{goal:'allowance',mode:'example'}});if(detached)h.root.isConnected=false;else h.cleanup();h.click({learnAction:'enrol'});assert.equal(state.learning.enrolled,false);assert.equal(h.actions.length,0);h.cleanup();}
});

test('secondary learning library separates story discovery from personal practice while keeping progress compact',()=>{
 const state=createDemoState();enrol(state,true);const before=finance(state),h=harness(state);
 let html=renderLearning(h.ctx,h.route);assert.doesNotMatch(html,/learning-mini-progress/);assert.match(html,/campus-game-entry/);assert.match(html,/data-learning-tab="play" aria-pressed="true"/);h.click({learningTab:'stories'});html=renderLearning(h.ctx,h.route);assert.match(html,/learning-mini-progress/);assert.match(html,/Step into the story/);assert.doesNotMatch(html,/class="learning-score"/);assert.doesNotMatch(html,/learning-topic"><summary/);assert.doesNotMatch(html,/data-learn-practice="incoming-plan"/);
 h.click({learningTab:'money'});html=renderLearning(h.ctx,h.route);assert.match(html,/data-learn-practice="incoming-plan"/);assert.match(html,/data-learn-practice="weekly-review"/);assert.doesNotMatch(html,/class="learning-feature /);
 h.click({learningTab:'stories'});h.click({learningTopic:'saving'});html=renderLearning(h.ctx,h.route);assert.match(html,/data-learning-topic="saving" aria-pressed="true"/);assert.match(html,/data-learn-lesson="saving-purpose"/);assert.equal(state.learning.points,0);assert.equal(finance(state),before);h.cleanup();
});

test('story replies reveal on tap and making a move transforms the scene into a takeaway',()=>{
 const state=createDemoState();enrol(state);const {sessionId}=run(state,'learningStartLesson',{lessonId:'planning-allowance'}),h=harness(state,{section:'learn',page:'lesson',id:'planning-allowance'},{learningUI:{lessonStory:{[sessionId]:true}}});
 let html=renderLearning(h.ctx,h.route);assert.match(html,/Hear Lux’s take/);assert.doesNotMatch(html,/Of course it does/);h.click({learnStoryChat:'planning-allowance'});html=renderLearning(h.ctx,h.route);assert.match(html,/Of course it does/);assert.equal(state.learning.points,0);assert.equal(h.actions.length,0);
 h.click({learnAction:'lesson-begin'});html=renderLearning(h.ctx,h.route);assert.match(html,/learning-money-tickets/);assert.doesNotMatch(html,/learning-option-letter/);h.click({learnAnswer:'lesson',option:'1'});html=renderLearning(h.ctx,h.route);assert.match(html,/learning-celebration/);assert.match(html,/Now the weekend has a number/);assert.doesNotMatch(html,/data-learn-answer=/);assert.equal(state.learning.points,10);h.cleanup();
});

test('practice shows one decision stage at a time and navigation alone never earns credit',()=>{
 const state=createEmptyState();enrol(state);const {sessionId}=run(state,'learningStartPractice',{kind:'incoming-plan',mode:'example'}),h=harness(state,{section:'learn',page:'practice',id:sessionId}),before=finance(state);
 let html=renderLearning(h.ctx,h.route);assert.match(html,/First, the<br>money picture/);assert.doesNotMatch(html,/data-learn-answer=/);assert.doesNotMatch(html,/data-learning-reflection=/);
 h.click({learnAction:'practice-choice'});html=renderLearning(h.ctx,h.route);assert.match(html,/data-learn-answer="practice"/);assert.doesNotMatch(html,/data-learning-reflection=/);assert.equal(state.learning.points,0);
 const v=getLearningPractice(state,sessionId,{summary:getSummary(state)});h.click({learnAnswer:'practice',option:String(v.options.indexOf(cash(15000)))});html=renderLearning(h.ctx,h.route);assert.match(html,/data-learning-reflection=/);assert.doesNotMatch(html,/data-learn-answer=/);assert.doesNotMatch(html,/learning-money-picture/);assert.equal(state.learning.points,0);
 h.click({learnAction:'practice-picture'});h.click({learnAction:'practice-choice'});assert.equal(state.learning.points,0);assert.equal(finance(state),before);h.cleanup();
});

test('delayed review uses the new situation without the original story payoff',()=>{
 const state=createDemoState();enrol(state);const first=run(state,'learningStartLesson',{lessonId:'planning-allowance'});run(state,'learningAnswer',{sessionId:first.sessionId,option:1});state.learning.lessonProgress['planning-allowance'].completedAt=new Date(Date.now()-8*86400000).toISOString();
 const review=run(state,'learningStartLesson',{lessonId:'planning-allowance',review:true}),h=harness(state,{section:'learn',page:'review',id:'planning-allowance'},{learningUI:{lessonStory:{[review.sessionId]:true}}});
 let html=renderLearning(h.ctx,h.route);assert.match(html,/New situation, same useful idea/);assert.doesNotMatch(html,/The group chat has ideas/);assert.doesNotMatch(html,/Make room for the weekend/);
 h.click({learnAction:'lesson-begin'});h.click({learnAnswer:'lesson',option:'0'});html=renderLearning(h.ctx,h.route);assert.match(html,/An idea worth keeping/);assert.doesNotMatch(html,/Now the weekend has a number/);h.cleanup();
});

test('a missing essentials plan prompts planning rather than presenting the wallet as room to spend',()=>{
 const state=createDemoState();enrol(state,true);state.budget={...state.budget,created:false,items:[]};state.settings.hideBalance=false;
 const {sessionId}=run(state,'learningStartPractice',{kind:'incoming-plan',mode:'actual'}),h=harness(state,{section:'learn',page:'practice',id:sessionId});
 let html=renderLearning(h.ctx,h.route);assert.doesNotMatch(html,/class="picture-flex"/);h.click({learnAction:'practice-choice'});html=renderLearning(h.ctx,h.route);assert.match(html,/Give the essentials<br>a place first/);assert.doesNotMatch(html,/Pick the room/);assert.doesNotMatch(html,/learning-money-tickets/);h.cleanup();
});

test('quick play starts a story-money run without opting into personal activity or moving money',()=>{
 const state=createDemoState();state.account.privacy.personalisation=false;
 const before=finance(state),h=harness(state,{section:'learn',page:'start'});
 h.click({learnAction:'quick-play'});
 assert.equal(state.learning.enrolled,true);assert.equal(state.learning.personalised,false);
 assert.equal(state.learning.points,0);assert.equal(state.learning.activities.length,0);
 assert.equal(h.route.page,'play');assert.equal(h.route.id,state.learning.game.activeRunId);
 assert.equal(finance(state),before);assert.deepEqual(h.actions.map(a=>a.type),['learningEnroll','campusStart']);h.cleanup();
});

test('learning motion can be paused and resumed without a money action or progress change',()=>{
 const state=createDemoState();enrol(state,true);
 const h=harness(state,{section:'learn',page:'lesson',id:'planning-allowance'}),before=JSON.stringify(state);
 assert.match(renderLearning(h.ctx,h.route),/data-learn-action="toggle-motion"/);
 h.click({learnAction:'toggle-motion'});assert.equal(h.ctx.draft.campusMotionOff,true);
 h.click({learnAction:'toggle-motion'});assert.equal(h.ctx.draft.campusMotionOff,false);
 assert.equal(h.actions.length,0);assert.equal(JSON.stringify(state),before);h.cleanup();
});

test('a game-to-real-life bridge keeps its return through lesson, practice and Plan entry',()=>{
 const state=createDemoState();enrol(state,true);
 const game=run(state,'campusStart',{missionId:getCampusGame(state).nextMissionId}),origin={section:'learn',page:'play',id:game.runId};
 const lessonHarness=harness(state,{section:'learn',page:'lesson',id:'planning-allowance',returnTo:origin});
 lessonHarness.click({learnAction:'lesson-begin'});assert.deepEqual(lessonHarness.route.returnTo,origin);
 lessonHarness.click({learnAnswer:'lesson',option:'1'});lessonHarness.click({learnAction:'lesson-practice'});assert.deepEqual(lessonHarness.route.returnTo,origin);lessonHarness.cleanup();
 const practiceHarness=harness(state,{section:'learn',page:'practice',id:'incoming-plan',returnTo:origin});
 practiceHarness.click({learnAction:'practice-begin',practiceKind:'incoming-plan'});assert.deepEqual(practiceHarness.route.returnTo,origin);
 const view=getLearningPractice(state,practiceHarness.route.id,{summary:getSummary(state)});
 practiceHarness.click({learnAnswer:'practice',option:String(view.options.indexOf(cash(getSummary(state).spendable)))});
 practiceHarness.click({learningRoute:'0'});assert.equal(practiceHarness.route.section,'plan');assert.deepEqual(practiceHarness.route.returnTo.returnTo,origin);practiceHarness.cleanup();
});
