/** Money IQ is a private learning experience. Financial records are read only. */
import {esc,icon} from './ui.js';
import {getMoneyIQ} from './money-iq-model.js';

const LANDING={section:'learn',page:'money-iq'};
const LIBRARY={section:'learn',page:'library'};
const returnRoute=ctx=>ctx.route.returnTo&&!(ctx.route.returnTo.section==='learn'&&['home','money-iq','library'].includes(ctx.route.returnTo.page))?ctx.route.returnTo:null;
const landingRoute=(ctx,id)=>({...LANDING,...(id?{id}:{}),...(returnRoute(ctx)?{returnTo:returnRoute(ctx)}:{})});
const LUX='/assets/lux-chat-2d.webp';
const ui=ctx=>(ctx.draft.moneyIQUI ||= {selected:{}});
const view=ctx=>getMoneyIQ(ctx.state,{sessionId:ctx.route.id});
const selectedKey=session=>`${session.id}:${session.question?.id||''}`;
const money=value=>`GH¢${((Number.isSafeInteger(value)?value:0)/100).toLocaleString('en-GH',{maximumFractionDigits:2})}`;
const button=(label,action,{disabled=false,arrow=false,mode='',secondary=false}={})=>`<button type="button" class="miq-button${secondary?' miq-secondary':''}" data-miq-action="${esc(action)}" ${mode?`data-mode="${esc(mode)}"`:''} ${disabled?'disabled':''}><span>${esc(label)}</span>${arrow?icon('arrow',21):''}</button>`;
const link=(label,action,mode='')=>`<button type="button" class="miq-link" data-miq-action="${esc(action)}" ${mode?`data-mode="${esc(mode)}"`:''}>${esc(label)}</button>`;
const error=()=>'<p class="miq-error" role="alert" data-miq-error></p>';

function toolbar(ctx){
 const off=ctx.draft.campusMotionOff===true;
 return `<header class="miq-header"><button type="button" class="miq-brand" data-miq-action="return" aria-label="${ctx.route.id?'Back to Money IQ':returnRoute(ctx)?.section==='chat'?'Back to Ask Lux':'Go Home'}">${icon('back',17)}<span class="miq-wordmark">lumo.</span></button><div class="miq-header-actions"><button type="button" class="miq-motion" data-miq-action="motion" aria-pressed="${!off}" aria-label="${off?'Turn animations on':'Pause animations'}" title="${off?'Turn animations on':'Pause animations'}">${icon('repeat',18)}</button><button type="button" class="miq-home" data-miq-action="home">${icon('home',21)}<span>Home</span></button></div></header>`;
}
function source({mode='example',period}={}){
 return `<div class="miq-source-row"><span class="miq-source-pill">${mode==='actual'?'Recorded Lumo activity':'Sample week'}</span>${period?.label?`<span class="miq-period">${esc(period.label)} · UTC</span>`:''}</div>`;
}
function lux({kind='welcome',line=''}={}){
 return `<div class="miq-lux-stage miq-lux-${esc(kind)}" aria-hidden="true">${line?`<span class="miq-lux-bubble"><small class="miq-lux-speaker">Lux:</small> ${esc(line)}</span>`:''}<span class="miq-lux-art"><img src="${LUX}" alt="" width="210" height="210"></span>${kind==='welcome'?`<span class="miq-receipt miq-receipt-one">${icon('receipt',27)}</span><span class="miq-receipt miq-receipt-two">${icon('receipt',23)}</span>`:kind==='question'?`<span class="miq-data-icon">${icon('phone',46)}<i></i></span>`:`<span class="miq-spark miq-spark-one">${icon('spark',20)}</span><span class="miq-spark miq-spark-two">${icon('spark',15)}</span>`}</div>`;
}
function frame(ctx,body,kind='entry'){
 const content=body.replaceAll('<div class="miq-main ','<div tabindex="0" aria-label="Money IQ content" class="miq-main ');
 return `<section class="page miq-page miq-${esc(kind)} ${ctx.draft.campusMotionOff?'miq-motion-off':''}" aria-label="Money IQ">${toolbar(ctx)}${content}</section>`;
}
function footer(body){return `<footer class="miq-footer">${error()}${body}</footer>`;}
function progress(session){
 return `<div class="miq-progress" role="progressbar" aria-label="Money IQ progress" aria-valuemin="0" aria-valuemax="${session.total}" aria-valuenow="${session.status==='completed'?session.total:session.index}" aria-valuetext="Question ${session.number} of ${session.total}"><div aria-hidden="true">${Array.from({length:session.total},(_,i)=>`<span class="${i<=session.index?'miq-filled':''}"></span>`).join('')}</div><span>${session.number} of ${session.total}</span></div>`;
}
function howThisWorks({alternates='' }={}){
 return `<details class="miq-details"><summary>Your round, your way ${icon('chevron',14)}</summary>${alternates}<p>Five spending clues and campus money moments. Points recognise taking part, never the size of your balance or whether you guess right.</p><p>This prototype uses activity stored on this device. Sample weeks are fictional. Your money stays put.</p>${link('Learning preferences','preferences')}${link('More with Lux · Stories and Campus Run','library')}</details>`;
}
function entry(ctx,data){
 const active=data.activeSessionId;
 const completed=data.completedThisWeek;
 const resumeId=active||(completed?data.lastSessionId:'');
 const resumeSession=resumeId?getMoneyIQ(ctx.state,{sessionId:resumeId}).session:null;
 const primary=active?'Pick up my week':completed&&data.lastSessionId?'See my week':data.actualAvailable?'Play my week':'Play a student week';
 const action=active||completed&&data.lastSessionId?'resume':'start';
 const mode=data.actualAvailable?'actual':'example';
 const sourceMode=resumeSession?.mode||(data.actualAvailable?'actual':'example');
 const sourcePeriod=resumeSession?.period||data.period;
 const alternate=sourceMode==='example'&&data.actualAvailable?link('Play my recorded week','start','actual'):sourceMode==='actual'?link('Try a student example','sample'):'';
 const alternates=(completed?link('Play a fresh round · No extra weekly points','replay',sourceMode):alternate)+(!data.personalised?link('Use my recorded activity','preferences'):'');
 return frame(ctx,`${source({mode:sourceMode,period:sourcePeriod})}<div class="miq-main miq-entry-main"><p class="miq-eyebrow">Money IQ</p><h1>Think you know<br>your week?</h1><p class="miq-intro">5 quick guesses. A few surprises.</p>${data.recoveryNotice?`<p class="miq-recovery-note" role="status">${esc(data.recoveryNotice)}</p>`:''}${lux({line:'Let’s find out.'})}<p class="miq-context">${resumeSession?'Your saved week is right where you left it.':data.actualAvailable?'Your recorded Lumo spending.':esc(data.availabilityReason||'A student week, ready to play. Same points.')}</p>${howThisWorks({alternates})}</div>${footer(`${button(primary,action,{arrow:true,mode})}<p class="miq-fine">Private to you · About a minute</p>`)}`);
}
function question(ctx,data,session){
 const q=session.question;
 const saved=ui(ctx).selected?.[selectedKey(session)];
 const chosen=Number.isInteger(saved)&&saved>=0&&saved<q.options.length?saved:null;
 return frame(ctx,`${source(session)}${progress(session)}<div class="miq-main miq-question-main"><p class="miq-eyebrow">${q.kind==='practice'?'Campus money moment':'Your week, one clue at a time'}</p><h1>${esc(q.prompt)}</h1><p class="miq-intro">${esc(q.subtext||'Go with your first guess.')}</p>${lux({kind:'question'})}<div class="miq-options" role="group" aria-label="Choose your guess">${q.options.map((option,i)=>`<button type="button" id="miq-choice-${i}" class="miq-option ${chosen===i?'miq-selected':''}" data-miq-choice="${i}" aria-pressed="${chosen===i}"><span>${esc(option)}</span><i aria-hidden="true">${icon('check',21)}</i></button>`).join('')}</div></div>${footer(`${button('Reveal','reveal',{disabled:chosen===null})}<p class="miq-fine">${session.mode==='example'?'Fictional student activity. Same learning, same points.':esc(session.sourceLabel||'A snapshot of your confirmed Lumo activity.')}</p>`)}`,'question');
}
function comparison(info){
 if(!info||!Number.isSafeInteger(info.previous)||!Number.isSafeInteger(info.current))return '';
 const max=Math.max(info.previous,info.current,1);
 return `<div class="miq-comparison" aria-label="Spending comparison">${[['previous',info.previous,info.previousLabel||'Last week'],['current',info.current,info.currentLabel||'This week']].map(([key,amount,label])=>`<div class="miq-comparison-row ${key==='current'?'miq-comparison-current':''}"><span>${esc(label)}</span><span class="miq-comparison-track" aria-hidden="true"><i style="width:${Math.max(0,Math.min(100,amount/max*100))}%"></i></span><strong>${money(amount)}</strong></div>`).join('')}</div>`;
}
function insightCard(info,{recap=false}={}){
 return `<article class="miq-insight-card ${recap?'miq-recap-card':''}">${info.eyebrow?`<p class="miq-eyebrow">${esc(info.eyebrow)}</p>`:''}${info.value?`<strong class="miq-reveal-value">${esc(info.value)}</strong>`:''}${info.title&&!recap?`<h2>${esc(info.title)}</h2>`:''}${info.body?`<p class="miq-insight-body">${esc(info.body)}</p>`:''}${comparison(info.comparison)}${info.lesson?`<div class="miq-lesson"><span>${recap?'One thing to try':'Lux’s take'}</span><p>${esc(info.lesson)}</p></div>`:''}</article>`;
}
function reveal(ctx,data,session){
 const info=session.reveal||{};
 const last=session.number===session.total;
 return frame(ctx,`${source(session)}${progress(session)}<div class="miq-main miq-reveal-main" aria-live="polite"><p class="miq-eyebrow">The reveal</p><h1>${session.question?.kind==='practice'?'One to keep.':'Here’s the picture.'}</h1>${lux({kind:'reveal'})}${insightCard(info)}</div>${footer(`${button(last?'Decode my week':'Next clue',last?'complete':'next',{arrow:true})}<p class="miq-fine">${last?'Your five moments, ready to bring together.':'No marks. Just a little more money clarity.'}</p>`)}`,'reveal');
}
function completed(ctx,data,session){
 const info=session.recap||{};
 const points=Math.max(0,session.pointsEarned||0);
 const route=info.route;
 const routeLabel=session.mode==='example'?'See my Lumo activity':info.routeLabel||route?.label||'See my spending';
 const reward=points?`+${points} XP for showing up`:data.pointsAvailable===0?'Week saved · Weekly points already counted':'Your learning is saved.';
 return frame(ctx,`${source(session)}<div class="miq-main miq-complete-main"><span class="miq-complete-pill">${icon('check',17)} Week complete</span><h1>Your week, decoded.</h1>${lux({kind:'complete'})}${insightCard(info,{recap:true})}<p class="miq-reward">${icon('spark',19)}<span>${esc(reward)}</span></p></div>${footer(`${button(routeLabel,'activity',{arrow:true})}${link('Back to Money IQ','landing')}<p class="miq-fine">${session.mode==='example'?'Sample answers stay in this story. Your activity opens separately.':'This snapshot is private. Your balance is unchanged.'}</p>`)}`,'complete');
}
function stale(ctx,data,session){
 return frame(ctx,`${source(session)}<div class="miq-main miq-stale-main"><p class="miq-eyebrow">A fresh picture</p><h1>Your money<br>moved on.</h1>${lux({kind:'question'})}<p class="miq-intro">${esc(session.staleMessage||session.message||session.staleReason||'A recorded result changed. Let’s use your latest confirmed activity so the clues stay accurate.')}</p></div>${footer(`${button('Start with the latest picture','restart',{arrow:true,mode:session.mode})}${link('Try a student example','sample')}`)}`,'stale');
}
export function renderMoneyIQ(ctx,route=ctx.route){
 const data=getMoneyIQ(ctx.state,{sessionId:route.id});
 const session=route.id?data.session:null;
 if(!session)return entry(ctx,data);
 if(session.status==='stale')return stale(ctx,data,session);
 if(session.status==='completed')return completed(ctx,data,session);
 if(session.status==='reveal')return reveal(ctx,data,session);
 if(session.question)return question(ctx,data,session);
 return entry(ctx,data);
}
export function bindMoneyIQ(ctx,route=ctx.route){
 const root=ctx.$('.miq-page');if(!root)return ()=>{};
 let disposed=false;
 const setError=message=>{const el=root.querySelector('[data-miq-error]');if(el){el.textContent=message;el.scrollIntoView({block:'nearest',behavior:'smooth'});}else ctx.toast(message);};
 const perform=(type,payload,{open=false}={})=>{
  const result=ctx.act(type,payload);
  if(!result?.ok){setError(result?.message||'That moment could not be saved. Try again.');return null;}
  if(open&&result.sessionId){ctx.go(landingRoute(ctx,result.sessionId),{replace:true});}else if(!disposed){ctx.refresh({scroll:0});const heading=ctx.$('.miq-page h1');if(heading?.focus){heading.tabIndex=-1;heading.focus({preventScroll:true});}}
  return result;
 };
 const onClick=event=>{
  const choice=event.target.closest('[data-miq-choice]');
  if(choice&&root.contains(choice)){
   const session=view(ctx).session;if(!session||session.status!=='question')return;
   const option=Number(choice.dataset.miqChoice);if(!Number.isInteger(option)||option<0||option>=session.question.options.length)return;
   (ui(ctx).selected ||= {})[selectedKey(session)]=option;ctx.saveDraft?.();
   root.querySelectorAll('[data-miq-choice]').forEach(b=>{const on=Number(b.dataset.miqChoice)===option;b.classList.toggle('miq-selected',on);b.setAttribute('aria-pressed',String(on));});
   const reveal=root.querySelector('[data-miq-action="reveal"]');if(reveal)reveal.disabled=false;
   return;
  }
  const control=event.target.closest('[data-miq-action]');if(!control||!root.contains(control)||control.disabled)return;
  const action=control.dataset.miqAction;
  if(action==='home'){ctx.go({section:'home',page:'home'},{root:true});return;}
  if(action==='return'){ctx.go(route.id?landingRoute(ctx):returnRoute(ctx)||{section:'home',page:'home'},{replace:true});return;}
  if(action==='library'||action==='learn'){ctx.go(LIBRARY);return;}
  if(action==='landing'){ctx.go(landingRoute(ctx),{replace:true});return;}
  if(action==='preferences'){ctx.go({section:'learn',page:'preferences',returnTo:landingRoute(ctx)});return;}
  if(action==='motion'){ctx.draft.campusMotionOff=!ctx.draft.campusMotionOff;ctx.saveDraft?.();ctx.refresh();return;}
  const data=view(ctx),session=data.session;
  if(action==='resume'){const id=data.activeSessionId||data.lastSessionId;if(id)ctx.go(landingRoute(ctx,id),{replace:true});return;}
  if(action==='start'||action==='sample'||action==='restart'||action==='replay'){
   perform('moneyIQStart',{mode:action==='sample'?'example':control.dataset.mode||'example',...(['restart','replay'].includes(action)?{replay:true}:{})},{open:true});return;
  }
  if(!session){setError('Pick up your Money IQ week to continue.');return;}
  if(action==='reveal'){
   const option=ui(ctx).selected?.[selectedKey(session)];if(!Number.isInteger(option)){setError('Pick your first guess.');return;}
   perform('moneyIQAnswer',{sessionId:session.id,questionId:session.question.id,option});return;
  }
  if(action==='next'){perform('moneyIQNext',{sessionId:session.id,questionId:session.question?.id});return;}
  if(action==='complete'){perform('moneyIQComplete',{sessionId:session.id});return;}
  if(action==='activity'){
   const proposed=session.recap?.route;
   const target=proposed?.route||proposed;
   const destination=session.mode==='actual'&&target?.section?target:{section:'activity',page:'home'};
   ctx.draft.activityQuery='';
   ctx.draft.activityFilters={query:'',direction:'all',status:'all',category:'',from:'',to:'',...(destination.filters||{}),...(destination.filter==='out'?{direction:'out'}:{})};
   ctx.saveDraft?.();
   ctx.go({...destination,returnTo:{...LANDING,id:session.id}});return;
  }
 };
 root.addEventListener('click',onClick);
 const saved=ui(ctx).selected||{};
 if(Object.keys(saved).length>100){ui(ctx).selected=Object.fromEntries(Object.entries(saved).slice(-50));ctx.saveDraft?.();}
 return ()=>{disposed=true;root.removeEventListener('click',onClick);};
}
