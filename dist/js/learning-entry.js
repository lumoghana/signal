import {esc,icon} from './ui.js';
import {getSummary} from './model.js';
import {getLearningNudge} from './learning-model.js';

const allowed={pay:new Set(['status','transaction','fund-status','funding-detail']),plan:new Set(['home']),boxes:new Set(['detail']),life:new Set(['iou-detail','recovery']),activity:new Set(['upcoming'])};
const generic={planning:['Give this money a purpose.','A short practice with Lux can help you review what this money needs to cover.'],expected:['Money promised. Money received.','Practise keeping the two clear when you plan.'],saving:['A goal that fits your life.','Explore a saving habit at your own pace.'],safety:['A little confidence before the next payment.','Try a short recipient and payment-safety scenario.'],recovery:['A plan can change with you.','Practise adjusting your essentials when life changes.'],upcoming:['A little ahead of the next cost.','Work backwards from a deadline with Lux.']};

export function learningContextForRoute(route={}){
 if(!allowed[route.section]?.has(route.page||'home'))return null;
 return route.section==='plan'?'planning':route.section==='boxes'?'saving':route.section==='activity'?'upcoming':route.section==='life'?(route.page==='recovery'?'recovery':'expected'):['fund-status','funding-detail'].includes(route.page)?'planning':'safety';
}
function eligible(ctx){return !!ctx.state.onboardingDone&&!ctx.state.account?.signedOut&&ctx.state.account?.status!=='closed'&&learningContextForRoute(ctx.route);}
export function renderContextLearning(ctx){
 const topic=eligible(ctx);if(!topic)return '';
 const returnTo=ctx.draft.learningReturnTo;
 const session=ctx.state.learning?.sessions?.find(s=>s.id===returnTo?.id&&s.type==='practice');
 const allowedReturn=session&&(session.mode!=='actual'||ctx.state.learning.personalised&&ctx.state.account?.privacy?.personalisation!==false);
 if(returnTo?.section==='learn'&&allowedReturn)return `<aside class="learning-return"><span>${icon('spark',18)}</span><div><strong>Pick up with Lux.</strong><small>Your money moment is right where you left it.</small></div><button type="button" data-learning-return>Return ${icon('arrow',16)}</button></aside>`;
 if(!ctx.state.learning?.enrolled||!ctx.state.learning.personalised||ctx.state.account?.privacy?.personalisation===false||ctx.state.settings.notifications===false)return '';
 const nudge=getLearningNudge(ctx.state,{summary:getSummary(ctx.state),topic});if(!nudge)return '';
 const [title,body]=generic[topic]||generic.planning;
 return `<aside class="learning-context" aria-label="Optional learning"><img src="/assets/lux-chat-2d.webp" width="38" height="38" alt=""><div><small>Learn with Lux · Optional</small><strong>${esc(title)}</strong><p>${esc(body)}</p><button type="button" data-learning-context>Explore this with Lux ${icon('arrow',15)}</button></div><button type="button" class="icon-button" data-learning-dismiss aria-label="Dismiss learning suggestion">${icon('close',15)}</button></aside>`;
}
export function bindContextLearning(ctx){
 ctx.$('[data-learning-return]')?.addEventListener('click',()=>{const next=ctx.draft.learningReturnTo;delete ctx.draft.learningReturnTo;ctx.saveDraft?.();ctx.go(next?.section==='learn'?next:{section:'learn',page:'home'});});
 ctx.$('[data-learning-context]')?.addEventListener('click',()=>{
  const topic=learningContextForRoute(ctx.route),nudge=getLearningNudge(ctx.state,{summary:getSummary(ctx.state),topic});
  if(!nudge){ctx.go({section:'learn',page:'home',returnTo:{...ctx.route}});return;}
  const next=nudge.route|| (nudge.practiceKind?{section:'learn',page:'practice',id:nudge.practiceKind}:nudge.lessonId?{section:'learn',page:'lesson',id:nudge.lessonId}:{section:'learn',page:'home'});
  ctx.go({...next,returnTo:{...ctx.route}});
 });
 ctx.$('[data-learning-dismiss]')?.addEventListener('click',()=>{const nudge=getLearningNudge(ctx.state,{summary:getSummary(ctx.state),topic:learningContextForRoute(ctx.route)});if(nudge?.eventId){const result=ctx.act('learningDismissNudge',{eventId:nudge.eventId});if(!result.ok){ctx.toast(result.message);return;}}ctx.refresh();});
}
