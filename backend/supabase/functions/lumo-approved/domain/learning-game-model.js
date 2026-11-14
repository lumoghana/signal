/** Browser-local campus game. Every amount is fictional; no personal money is read or changed. */
import {CAMPUS_MISSIONS,CAMPUS_REWARDS,MISSION_BY_ID} from './learning-game-content.js';
export {CAMPUS_MISSIONS,CAMPUS_REWARDS} from './learning-game-content.js';
export const GAME_ACTIONS=new Set(['campusStart','campusChoose','campusContinue','campusRewind','campusEquip']);
const clone=v=>JSON.parse(JSON.stringify(v));
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const amount=v=>Number.isSafeInteger(v)&&v>=0&&v<=100000000;
const identifier=v=>typeof v==='string'&&v.length>0&&v.length<250;
const now=o=>{const d=new Date(typeof o?.now==='function'?o.now():o?.now||Date.now());return Number.isFinite(d.getTime())?d.toISOString():new Date().toISOString();};
const uid=()=>`campus-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const success=(message,rest={})=>({ok:true,message,...rest}),fail=message=>({ok:false,message});
const blank=()=>({schema:1,runs:[],activeRunId:'',equipped:'classic',recoveryNotice:''});
const moneyValid=m=>object(m)&&['wallet','committed','cushion','expected'].every(k=>amount(m[k]));
const flagsValid=f=>object(f)&&Object.values(f).every(v=>typeof v==='boolean');
const outcomeValid=v=>object(v)&&typeof v.title==='string'&&typeof v.body==='string'&&['clear','helpful'].includes(v.tone);
const changesValid=a=>Array.isArray(a)&&a.every(x=>object(x)&&typeof x.label==='string'&&amount(x.before)&&amount(x.after));
const stepId=r=>`${r.id}:${r.turnIndex}:${r.revision}`;
const flex=m=>Math.max(0,m.wallet-m.committed-m.cushion),gap=m=>Math.max(0,m.committed+m.cushion-m.wallet);
const decorateMoney=m=>({...clone(m),flexible:flex(m),shortfall:gap(m)});
function validRun(r){
 const mission=MISSION_BY_ID.get(r?.missionId);
 return !!mission&&identifier(r.id)&&['choice','consequence','completed'].includes(r.status)&&Number.isInteger(r.turnIndex)&&r.turnIndex>=0&&r.turnIndex<mission.turns.length&&Number.isSafeInteger(r.revision)&&r.revision>=0&&moneyValid(r.money)&&flagsValid(r.flags)&&Array.isArray(r.history)&&r.history.length===(r.status==='completed'?mission.turns.length:r.turnIndex)&&r.history.every((h,i)=>object(h)&&h.turnIndex===i&&mission.turns[i]?.choices.some(c=>c.id===h.choiceId)&&typeof h.skill==='boolean')&&Array.isArray(r.receipts)&&r.receipts.every(v=>identifier(v))&&Number.isFinite(Date.parse(r.startedAt))&&(r.status!=='completed'||Number.isFinite(Date.parse(r.completedAt)))&&(r.status!=='consequence'||object(r.pending)&&r.pending.turnIndex===r.turnIndex&&moneyValid(r.pending.before)&&flagsValid(r.pending.flagsBefore)&&mission.turns[r.turnIndex].choices.some(c=>c.id===r.pending.choiceId)&&typeof r.pending.choiceLabel==='string'&&typeof r.pending.skill==='boolean'&&outcomeValid(r.pending.outcome)&&changesValid(r.pending.changes));
}
export function validGameState(s){const g=s.learning?.game;return g===undefined||object(g)&&g.schema===1&&Array.isArray(g.runs)&&g.runs.length<=180&&g.runs.every(validRun)&&new Set(g.runs.map(r=>r.id)).size===g.runs.length&&typeof g.activeRunId==='string'&&(!g.activeRunId||g.runs.some(r=>r.id===g.activeRunId))&&typeof g.equipped==='string'&&typeof g.recoveryNotice==='string';}
function gameOf(s){return validGameState(s)&&s.learning?.game?s.learning.game:blank();}
export function ensureGameState(s){
 if(!s.learning)return s;
 if(s.learning.game===undefined)s.learning.game=blank();
 else if(!validGameState(s)){s.learning.game=blank();s.learning.game.recoveryNotice='Your campus game save could not be opened. Your lessons, progress and money records are still here.';}
 const g=s.learning.game;if(!unlockedRewards(g).some(r=>r.id===g.equipped))g.equipped='classic';return s;
}
const score=r=>r.history.reduce((n,h)=>n+(h.skill?1:0),0)+(r.status==='consequence'&&r.pending?.skill?1:0);
function missionRecord(g,missionId){const runs=g.runs.filter(r=>r.missionId===missionId&&r.status==='completed');return {completed:runs.length>0,bestStars:runs.reduce((n,r)=>Math.max(n,score(r)),0),playCount:runs.length};}
const total=g=>CAMPUS_MISSIONS.reduce((n,m)=>n+missionRecord(g,m.id).bestStars,0);
function unlockedRewards(g){const stars=total(g);return [{id:'classic',title:'Classic Lux',emoji:'✦',threshold:0},...CAMPUS_REWARDS].filter(r=>r.threshold<=stars);}
const isUnlocked=(g,m)=>m.index===0||missionRecord(g,CAMPUS_MISSIONS[m.index-1]?.id).completed;
function resolveTurn(m,r){const turn=m.turns[r.turnIndex],variant=(turn.variants||[]).find(v=>r.flags[v.when]===true),view={...turn,...(variant||{})};view.choices=view.choices.map(choice=>({...choice,...((choice.variants||[]).find(v=>r.flags[v.when]===true)||{})}));return view;}
function resolveEnding(m,r,stars){const base=stars===3?m.ending.strong:m.ending.mixed,variant=(m.ending.variants||[]).find(v=>r.flags[v.when]===true);return {...base,...(variant||{})};}
function mapView(g){return CAMPUS_MISSIONS.map(m=>({id:m.id,index:m.index,title:m.title,kicker:m.kicker,emoji:m.emoji,description:m.description,topicId:m.topicId,...missionRecord(g,m.id),unlocked:isUnlocked(g,m)}));}
export function getCampusGame(s){
 const g=gameOf(s),missions=mapView(g),stars=total(g),next=missions.find(m=>m.unlocked&&!m.completed)||missions[missions.length-1];
 return {missions,totalStars:stars,maxStars:CAMPUS_MISSIONS.length*3,completedCount:missions.filter(m=>m.completed).length,nextMissionId:next?.id||'',activeRunId:g.runs.find(r=>r.id===g.activeRunId&&r.status!=='completed')?.id||'',rewards:[{id:'classic',title:'Classic Lux',emoji:'✦',threshold:0},...CAMPUS_REWARDS].map(r=>({...r,unlocked:r.threshold<=stars,equipped:g.equipped===r.id})),equipped:g.equipped,recoveryNotice:g.recoveryNotice,allCompleted:missions.every(m=>m.completed),sampleLabel:'Story money · no real payments'};
}
export function getCampusRun(s,runId){
 const g=gameOf(s),r=g.runs.find(r=>r.id===(runId||g.activeRunId));if(!r)return null;
 const m=MISSION_BY_ID.get(r.missionId),t=resolveTurn(m,r),stars=score(r),record=missionRecord(g,m.id),last=r.pending;
 const endingCopy=resolveEnding(m,r,stars);
 return {id:r.id,missionId:m.id,title:m.title,emoji:m.emoji,topicId:m.topicId,status:r.status,stepId:stepId(r),turnIndex:r.turnIndex,turnCount:m.turns.length,turn:{id:t.id,kicker:t.kicker,title:t.title,body:t.body,lux:t.lux,choices:t.choices.map(c=>({id:c.id,label:c.label,detail:c.detail,emoji:c.emoji}))},money:decorateMoney(r.money),lastOutcome:last?{...clone(last.outcome),skill:last.skill,skillLabel:m.skills[r.turnIndex],choiceLabel:last.choiceLabel,changes:clone(last.changes)}:null,stars,bestStars:record.bestStars,starGain:r.starGain||0,improvedStars:r.starGain||0,ending:r.status==='completed'?{...endingCopy,routeLabel:'Try this in my life',skills:m.skills.map((label,i)=>({label,earned:r.history[i]?.skill===true})),branch:clone(r.flags),storyMoney:decorateMoney(r.money)}:null,nextMissionId:CAMPUS_MISSIONS[m.index+1]?.id||'',newRewards:clone(r.newRewards||[]),equipped:g.equipped,sampleLabel:'Story money · no real payments'};
}
function applyEffect(before,flags,choice){
 const effect=(choice.effectVariants||[]).find(v=>flags[v.when]===true)?.effect||choice.effect||{},m=clone(before),f={...flags};
 for(const k of ['spend','commit','release','receive'])if(effect[k]!==undefined&&!amount(effect[k]))return null;
 if(effect.expected!==undefined&&(!Number.isSafeInteger(effect.expected)||Math.abs(effect.expected)>100000000))return null;
 if((effect.spend||0)>m.wallet||(effect.release||0)>m.committed+(effect.commit||0))return null;
 m.wallet+=(effect.receive||0)-(effect.spend||0);m.committed+=(effect.commit||0)-(effect.release||0);m.expected+=effect.expected||0;
 if(!moneyValid(m)||choice.skill&&gap(m)>gap(before))return null;
 Object.assign(f,effect.flags||{});return {money:m,flags:f};
}
function receipt(r,type,token,choiceId=''){return `${type}|${token}|${choiceId}`;}
function remember(r,key){r.receipts.push(key);if(r.receipts.length>120)r.receipts.splice(0,r.receipts.length-120);}
function prune(g){
 if(g.runs.length<160)return;
 const keep=new Set(CAMPUS_MISSIONS.map(m=>g.runs.filter(r=>r.missionId===m.id&&r.status==='completed').sort((a,b)=>score(b)-score(a))[0]?.id).filter(Boolean));
 for(const r of g.runs.filter(r=>r.status!=='completed'))keep.add(r.id);
 g.runs=g.runs.filter((r,i)=>keep.has(r.id)||i>=g.runs.length-120);
}
export function handleCampusGameAction(s,type,p={},o={}){
 if(!GAME_ACTIONS.has(type))return null;
 if(!s.learning?.enrolled)return fail('Open Learn with Lux and choose your focus first.');
 if(s.account?.signedOut||s.account?.status==='closed')return fail('Return to your active Lumo account before playing.');
 ensureGameState(s);const g=s.learning.game;
 if(type==='campusEquip'){
  if(!unlockedRewards(g).some(r=>r.id===p.rewardId))return fail('That look is still waiting on a campus milestone.');
  const duplicate=g.equipped===p.rewardId;g.equipped=p.rewardId;return success('Lux is ready for the next run.',{duplicate,rewardId:p.rewardId});
 }
 if(type==='campusStart'){
  const m=MISSION_BY_ID.get(p.missionId);if(!m)return fail('Choose a campus mission from your map.');
  if(!isUnlocked(g,m))return fail('Finish the previous campus mission to open this chapter.');
  const active=[...g.runs].reverse().find(r=>r.missionId===m.id&&r.status!=='completed');
  if(active){g.activeRunId=active.id;return success('Your run is right where you left it.',{runId:active.id,stepId:stepId(active),duplicate:true});}
  const completed=[...g.runs].reverse().find(r=>r.missionId===m.id&&r.status==='completed');
  if(completed&&!p.replay){g.activeRunId=completed.id;return success('Your last campus ending is here.',{runId:completed.id,stepId:stepId(completed),duplicate:true,completed:true});}
  const r={id:uid(),missionId:m.id,status:'choice',turnIndex:0,revision:0,money:clone(m.initial),flags:{},history:[],pending:null,receipts:[],startedAt:now(o),starGain:0,newRewards:[]};g.runs.push(r);g.activeRunId=r.id;prune(g);return success('Your campus run starts here.',{runId:r.id,stepId:stepId(r)});
 }
 const r=g.runs.find(r=>r.id===p.runId);if(!r)return fail('Open this campus run again before making a move.');
 const key=receipt(r,type,p.stepId,p.choiceId||'');
 if(r.receipts.includes(key))return success('That move is already saved.',{duplicate:true,runId:r.id,stepId:stepId(r),completed:r.status==='completed'});
 if(p.stepId!==stepId(r))return fail('That moment has moved on. Continue from the current scene.');
 if(r.status==='completed')return fail('This run has finished. Replay the mission to try another route.');
 const m=MISSION_BY_ID.get(r.missionId),turn=resolveTurn(m,r);
 if(type==='campusChoose'){
  if(r.status!=='choice')return fail('See what this choice means before making another move.');
  const choice=turn.choices.find(c=>c.id===p.choiceId);if(!choice)return fail('Choose one of the moves in this scene.');
  const before=clone(r.money),flagsBefore={...r.flags},change=applyEffect(before,r.flags,choice),skill=!!change&&choice.skill===true;
  const outcome=change?clone((choice.outcomeVariants||[]).find(v=>r.flags[v.when]===true)||choice.outcome):{title:'This move needs a different plan.',body:'The story money does not cover that move alongside what is already protected. Rewind to try another route, or keep this lesson for the next moment.',tone:'helpful'};
  if(change){r.money=change.money;r.flags=change.flags;}
  const labels={wallet:'Story wallet',committed:'Planned costs',cushion:'Cushion',expected:'Expected money'};
  r.pending={turnIndex:r.turnIndex,choiceId:choice.id,choiceLabel:choice.label,skill,before,flagsBefore,outcome,changes:Object.keys(labels).filter(k=>before[k]!==r.money[k]).map(k=>({label:labels[k],before:before[k],after:r.money[k]}))};r.status='consequence';remember(r,key);return success(outcome.title,{runId:r.id,stepId:stepId(r),skill});
 }
 if(type==='campusRewind'){
  if(r.status!=='consequence'||!r.pending)return fail('Make a move first, then rewind if you want to explore another route.');
  r.money=clone(r.pending.before);r.flags={...r.pending.flagsBefore};r.pending=null;r.status='choice';r.revision++;remember(r,key);return success('Same moment. A fresh route.',{runId:r.id,stepId:stepId(r)});
 }
 if(type==='campusContinue'){
  if(r.status!=='consequence'||!r.pending)return fail('Make a move and see its outcome before continuing.');
  const previous=missionRecord(g,m.id).bestStars,unlockedBefore=new Set(unlockedRewards(g).map(x=>x.id));
  r.history.push({turnIndex:r.turnIndex,choiceId:r.pending.choiceId,skill:r.pending.skill});remember(r,key);
  if(r.turnIndex===m.turns.length-1){
   r.status='completed';r.completedAt=now(o);r.starGain=Math.max(0,score(r)-previous);r.newRewards=unlockedRewards(g).filter(x=>!unlockedBefore.has(x.id)).map(x=>({...x,unlocked:true,equipped:g.equipped===x.id}));
   return success('Campus chapter complete.',{runId:r.id,stepId:stepId(r),completed:true,stars:score(r),starGain:r.starGain,newRewards:clone(r.newRewards)});
  }
  r.turnIndex++;r.revision++;r.pending=null;r.status='choice';const enter=m.turns[r.turnIndex].enter;if(enter){const entered=applyEffect(r.money,r.flags,{effect:enter,skill:false});if(entered){r.money=entered.money;r.flags=entered.flags;}}return success('Here comes the next moment.',{runId:r.id,stepId:stepId(r)});
 }
 return fail('That campus move is not available here.');
}
