import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createDemoState,applyAction} from '../dist/js/model.js';
import {getLuxAnswer} from '../dist/js/lux-brain.js';
import {renderChat} from '../dist/js/chat.js';
import {renderWelcome} from '../dist/js/welcome-view.js';
import {renderExplore,renderExploreScene,renderExploreEnd} from '../dist/js/explore-view.js';
import {EXPLORE_SCENES} from '../dist/js/explore-model.js';
import {renderTour} from '../dist/js/tour.js';
import {renderPauseScreen} from '../dist/js/pause-view.js';
import {renderSetupTerms} from '../dist/js/setup-terms.js';
import {renderOnboarding} from '../dist/js/onboarding.js';
import {renderLearning,renderLearningEntry} from '../dist/js/learning-ui.js';
import {renderCampusGame,renderCampusGameEntry,bindCampusGame} from '../dist/js/learning-game-ui.js';
import {getCampusGame,getCampusRun,CAMPUS_MISSIONS} from '../dist/js/learning-game-model.js';
import {LEARNING_LESSONS} from '../dist/js/learning-content.js';
import {createApprovedService} from '../dist/js/approved-service.js';
import {assistantStatusCopy} from '../dist/js/assistant-branding.js';

const textAndLabels=html=>[html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' '),...[...html.matchAll(/\b(?:alt|aria-label|title)="([^"]*)"/g)].map(match=>match[1])].join(' ');
const branded=html=>{assert.doesNotMatch(textAndLabels(html),/\bLux\b/i);return html;};
const finance=s=>JSON.stringify({wallet:s.wallet,budget:s.budget,boxes:s.boxes,ious:s.ious,groups:s.groups,transactions:s.transactions});
const act=(s,type,payload={})=>{const result=applyAction(s,type,payload);assert.equal(result.ok,true,result.message);return result;};

test('welcome, all preview scenes, setup and Pause use Lumo while retaining approved mascot assets',()=>{
 const state=createDemoState(),before=finance(state),ctx={state,draft:{onboarding:{name:'Ama',phone:'',currentStep:'name'},tour:{}}};
 const views=[renderWelcome(),renderExplore(),...EXPLORE_SCENES.map((_,i)=>renderExploreScene(i)),renderExploreEnd(),...[0,1,2].map(step=>renderTour(ctx,{step})),renderPauseScreen({metric:15025,amount:50099,recipient:'Ama'}),renderSetupTerms(ctx),renderOnboarding(ctx,{step:'name'})];
 for(const html of views)branded(html);
 assert.match(views[0],/src="\/assets\/lux-pause-2d.webp"[^>]*alt="Lumo waves hello"/);
 assert.ok(views.some(html=>textAndLabels(html).includes('Ask Lumo')));assert.match(views.at(-1),/Hey\. I’m Lumo\./);assert.equal(finance(state),before);
});

test('current chat identity and legacy greeting inputs use Lumo without moving or exposing money',()=>{
 const state=createDemoState(),before=JSON.stringify(state);
 for(const question of ['Hello Lumo','Hello Lux','Who are you?']){const answer=getLuxAnswer(state,question);assert.doesNotMatch(JSON.stringify(answer.paragraphs),/\bLux\b|GH₵/);if(question==='Who are you?')assert.equal(answer.title,'I’m Lumo, your money buddy.');}
 const html=branded(renderChat({state,draft:{chat:{}}}));assert.match(html,/aria-label="Ask Lumo"/);assert.match(html,/Learn with Lumo/);assert.match(html,/lux-chat-2d.webp/);assert.equal(JSON.stringify(state),before);
});

test('saved assistant stock copy changes only in presentation while user words, merchant names and amounts remain exact',()=>{
 const state=createDemoState(),question='What did I spend at Lux Café and Ask Lux?',draft={chat:{input:'Hello Lux',pending:false,lessonIndex:0,messages:[
  {id:'user',role:'user',text:question},
  {id:'identity',role:'assistant',title:'I’m Lux, your Lumo money buddy.',paragraphs:['Lux here. What’s the money question today?','Lux here.'],followUps:['Ask Lux']},
  {id:'money',role:'assistant',title:'Here is the recorded payment.',paragraphs:['Your last payment was to Lux Café.','You paid Ask Lux today.'],stats:[{label:'Lux Café',value:'GH₵15.00'}],basis:['How Lux worked this out'],actions:[{label:'Learn with Lux',route:{section:'learn',page:'home'}}],sourceQuestion:question},
 ]}},before=JSON.stringify({state,draft});
 const html=renderChat({state,draft});assert.match(html,/I’m Lumo, your money buddy\./);assert.match(html,/Lumo here\. What’s the money question today\?/);assert.match(html,/<p>Lumo here\.<\/p>/);assert.match(html,/How Lumo worked this out/);assert.match(html,/Learn with Lumo/);
 assert.ok(html.includes(question));assert.ok(html.includes('Your last payment was to Lux Café.'));assert.ok(html.includes('You paid Ask Lux today.'));assert.ok(html.includes('<span>Lux Café</span><strong>GH₵15.00</strong>'));assert.ok(html.includes('Hello Lux</textarea>'));assert.equal(JSON.stringify({state,draft}),before);
});

test('learning stories, scene cast and campus controls use Lumo with the same lessons and financial state',()=>{
 const state=createDemoState();act(state,'learningEnroll',{goal:'allowance',personalised:false});const before=finance(state),ctx={state,draft:{},route:{section:'learn',page:'library'}};
 branded(renderLearningEntry(ctx));for(const page of ['home','library','progress','preferences','rewards'])branded(renderLearning(ctx,{section:'learn',page}));
 for(const lesson of LEARNING_LESSONS)branded(renderLearning(ctx,{section:'learn',page:'lesson',id:lesson.id}));
 for(const page of ['game','rewards'])branded(renderCampusGame(ctx,{section:'learn',page}));branded(renderCampusGameEntry(ctx));
 assert.equal(getCampusGame(state).rewards.find(r=>r.id==='classic').title,'Classic Lumo');assert.equal(getCampusGame(state).rewards.find(r=>r.id==='orbit-trail').title,'Lumo orbit');assert.equal(finance(state),before);
});

test('old earned campus rewards display current labels without changing saved IDs, stars, history or money',()=>{
 const state=createDemoState();act(state,'learningEnroll',{goal:'allowance',personalised:false});let last;
 for(const mission of CAMPUS_MISSIONS.slice(0,3)){last=act(state,'campusStart',{missionId:mission.id}).runId;for(let i=0;i<mission.turns.length;i++){let view=getCampusRun(state,last);act(state,'campusChoose',{runId:last,stepId:view.stepId,choiceId:view.turn.choices[0].id});view=getCampusRun(state,last);act(state,'campusContinue',{runId:last,stepId:view.stepId});}}
 const saved=state.learning.game.runs.find(run=>run.id===last),reward=saved.newRewards.find(r=>r.id==='orbit-trail');assert.ok(reward);reward.title='Lux orbit';const before=JSON.stringify(state),view=getCampusRun(state,last);
 assert.equal(view.newRewards.find(r=>r.id==='orbit-trail').title,'Lumo orbit');branded(renderCampusGame({state,draft:{},route:{section:'learn',page:'rewards'}}));assert.equal(JSON.stringify(state),before);
});

test('transport failure names Lumo while preserving the existing Lux API path and error code',async()=>{
 const values=new Map([['lumo-approved-session-v1',JSON.stringify({user:{id:'synthetic-owner'},access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600})]]),storage={getItem:key=>values.get(key)||null},calls=[];
 const service=createApprovedService({config:{url:'https://synthetic.invalid',publishableKey:'synthetic-public',luxUrl:'https://synthetic.invalid/api/lux',webSession:false},storage,modeStorage:{getItem:()=>null},fetch:async(url)=>{calls.push(url);throw Error('Synthetic offline transport');}});
 const result=await service.askLux('What is left?',{});assert.equal(result.ok,false);assert.equal(result.code,'LUX_UNAVAILABLE');assert.match(result.message,/connect to Lumo/);assert.deepEqual(calls,['https://synthetic.invalid/api/lux']);service.dispose();
});

test('consumer SVG visible metadata uses the current name without renaming asset paths',()=>{
 const walk=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(new URL(entry.name+'/',directory)):entry.name.endsWith('.svg')?[new URL(entry.name,directory)]:[]);
 for(const path of walk(new URL('../dist/assets/',import.meta.url)))branded(readFileSync(path,'utf8'));
});

test('old backend status wording maps only the three exact stock messages',()=>{
 const stock=[['Open Learn with Lux and choose your focus first.','Open Learn with Lumo and choose your focus first.'],['Lux is ready for the next run.','Lumo is ready for the next run.'],['Try it with Lux.','Try it with Lumo.']];
 for(const [old,current]of stock)assert.equal(assistantStatusCopy(old),current);
 for(const original of ['Lux Café is ready for the next run.','You paid Ask Lux today.','Try it with Lux Bakery.','GH₵15.00 to Lux'])assert.equal(assistantStatusCopy(original),original);
});

test('the actual toast writer displays old backend status copy as Lumo without altering the original response',()=>{
 const source=readFileSync(new URL('../dist/js/app.js',import.meta.url),'utf8'),fn=source.match(/^function toast\(message\)\{.*$/m)?.[0];assert.ok(fn);
 const element={textContent:'',classList:{add(){},remove(){}}},context={document:{querySelector:()=>element},toastTimer:null,clearTimeout(){},setTimeout:()=>1,assistantStatusCopy};runInNewContext(fn,context);
 const result={ok:true,message:'Lux is ready for the next run.',rewardId:'orbit-trail'},before=JSON.stringify(result);context.toast(result.message);assert.equal(element.textContent,'Lumo is ready for the next run.');assert.equal(JSON.stringify(result),before);
 context.toast('Try it with Lux.');assert.equal(element.textContent,'Try it with Lumo.');context.toast('Paid Lux Café GH₵15.00.');assert.equal(element.textContent,'Paid Lux Café GH₵15.00.');
});

test('actual campus binding handles the existing backend enrolment error as display copy only',async()=>{
 const state=createDemoState();act(state,'learningEnroll',{goal:'allowance',personalised:false});const before=JSON.stringify(state),error={textContent:''},listeners=new Map(),calls=[],oldResult={ok:false,message:'Open Learn with Lux and choose your focus first.'};
 const root={isConnected:true,querySelector:q=>q==='[data-campus-error]'?error:null,querySelectorAll:()=>[],setAttribute(){},getAttribute:()=>null,addEventListener:(name,handler)=>listeners.set(name,handler),removeEventListener:name=>listeners.delete(name)};
 const ctx={state,draft:{},route:{section:'learn',page:'game'},$:q=>q==='.campus-game-page'?root:q==='[data-campus-error]'?error:null,saveDraft(){},refresh(){throw Error('A failed old-backend action cannot navigate or refresh as success');},go(){throw Error('A failed old-backend action cannot create a run');},actAsync:async(type,payload)=>{calls.push({type,payload});return oldResult;},toast(){throw Error('The available error node must receive this failure');}};
 const cleanup=bindCampusGame(ctx,ctx.route);try{await listeners.get('click')({target:{closest:()=>({disabled:false,dataset:{campusAction:'start',missionId:CAMPUS_MISSIONS[0].id}})}});assert.equal(error.textContent,'Open Learn with Lumo and choose your focus first.');assert.equal(calls.length,1);assert.equal(calls[0].type,'campusStart');assert.equal(oldResult.message,'Open Learn with Lux and choose your focus first.');assert.equal(JSON.stringify(state),before);}finally{cleanup();}
});
