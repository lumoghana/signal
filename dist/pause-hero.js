/* Lumo's signature Pause: a proposed spend comes into focus through the ring.
   This layer owns presentation only. The engine, review and PIN still own payments. */
(()=>{
'use strict';
if(!window.L||L.pauseHeroRules)return;
const E=L.e,preference=window.matchMedia?.('(prefers-reduced-motion: reduce)')||{matches:false};
const rules=Object.freeze({reveal:900,hold:1200,resolve:900,total:3000,stagger:120,ease:'cubic-bezier(.22,.72,.2,1)'});
const revealEnd=rules.reveal/rules.total,holdEnd=(rules.reveal+rules.hold)/rules.total;
const seen=new Set(),jobs=new Set();let account=L.state,playing=null;
const allowed=()=>['pause','samplePause'].includes(L.route);
const reduced=()=>!!preference.matches;
const scene=()=>allowed()?document.getElementById('view')?.querySelector?.('[data-pause-hero]'):null;
const syncControls=root=>{const replay=root?.querySelector?.('[data-pause-replay]');if(replay)replay.hidden=reduced();};
const settle=(root=playing,state=reduced()?'reduced':'settled')=>{root?.setAttribute?.('data-motion-state',state);syncControls(root);};
const stop=()=>{for(const job of jobs){try{job.cancel();}catch{}}jobs.clear();settle();playing=null;};
const animate=(element,frames,options={})=>{
 if(!element||reduced()||document.hidden||typeof element.animate!=='function')return null;
 try{const job=element.animate(frames,{duration:rules.total,easing:'linear',iterations:1,...options});jobs.add(job);return job;}catch{return null;}
};
const symbol=(c,p)=>{
 const names=(p.essentials||[]).filter(x=>x.after>0).map(x=>String(x.name||'').toLowerCase());
 const food=x=>`<g transform="translate(${x} 32)"><circle cx="0" cy="12" r="10"/><path d="M-15 2v8m-3-8v8m6-8v8m-3 0v14m29-22v22m0-22c-5 3-5 10 0 10"/></g>`;
 const transport=x=>`<g transform="translate(${x} 29)"><rect width="17" height="27" rx="4"/><path d="M0 6h17M0 15h17m-13 5h1m7 0h1M3 27v3m11-3v3"/></g>`;
 if(c.kind==='essentials'&&names.length&&names.every(x=>['food','transport'].includes(x))){
  const both=names.includes('food')&&names.includes('transport');
  return {kind:both?'food-transport':names[0],path:both?food(143)+transport(169):names[0]==='food'?food(160):transport(151.5)};
 }
 if(c.kind==='essentials')return {kind:'planned-cost',path:'<rect x="143" y="23" width="34" height="43" rx="5"/><path d="m149 34 3 3 5-6m5 4h8m-21 12 3 3 5-6m5 4h8m-21 10h21"/>'};
 if(c.kind==='goals'&&/laptop|computer/i.test(p.goalName||''))return {kind:'laptop',path:'<rect x="139" y="27" width="42" height="28" rx="3"/><path d="m139 55-6 7h54l-6-7m-27 7h12"/>'};
 if(c.kind==='goals')return {kind:'goal',path:'<path d="M148 65V24m0 2c10-9 17 9 28 0v23c-11 9-18-9-28 0m-7 16h15"/>'};
 return {kind:c.kind==='room'?'spending-room':'account',path:'<path d="m139 29 34-8v11h-34"/><rect x="136" y="32" width="47" height="31" rx="6"/><path d="M169 42h16v12h-16a6 6 0 0 1 0-12Z"/><circle cx="172" cy="48" r="1"/>'};
};
const drawing=(c,p)=>{const context=symbol(c,p);return `<svg class="pause-money-stage" data-ring-role="clarity-lens" viewBox="0 0 320 88" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
 <path class="pause-money-path" d="M66 44h54" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 5"/>
 <g class="pause-money-wallet" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m23 28 33-8v11H23"/><rect x="18" y="30" width="47" height="32" rx="7"/><path d="M51 40h16v13H51a6 6 0 0 1 0-13Z"/><circle cx="54" cy="46.5" r="1"/></g>
 <circle data-pause-ring class="pause-money-ring" cx="160" cy="44" r="34" fill="none" stroke="currentColor" stroke-width="7"/>
 <g data-pause-symbol data-pause-symbol-kind="${context.kind}" class="pause-lens-symbol" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${context.path}</g>
 ${[-1,0,1].map((tilt,i)=>`<g data-money-slip data-slip-angle="${tilt*7}" class="pause-money-slip" style="--slip-angle:${tilt*7}deg" transform="rotate(${tilt*7} 160 44)"><rect x="133" y="29" width="54" height="30" rx="5"/><path d="M140 34h5m30 0h5m-40 20h5m30 0h5"/><ellipse cx="160" cy="44" rx="7" ry="9"/><path d="M157 44h6"/></g>`).join('')}
 </svg>`;};
const comparison=L.pauseComparisonMarkup;
L.pauseComparisonMarkup=impact=>{
 const html=comparison(impact);if(!allowed()||!impact.valid||!impact.canPay)return html;
 const c=L.pauseComparison(impact),d=L.state.paymentDraft;
 const key=JSON.stringify([L.route,L.route==='pause'?d?.id:'example',impact.amount,impact.fee,impact.available,impact.essentialCovered,impact.essentialsBefore,impact.essentialsAfter,impact.allocated,c.kind,c.before,c.after,impact.essentialGap,impact.goalGap,impact.bucketLabel,impact.goalName,impact.engineDecision?.selected?.code]);
 const banner=`<div class="pause-hero-toolbar"><div class="pause-hero-intro"><h2>${E(c.label)}</h2><span class="pause-hero-boundary">Preview · nothing sent</span></div><button type="button" class="pause-hero-replay" data-pause-replay onclick="L.replayPauseProjection()" aria-label="Replay projected money movement"${reduced()?' hidden':''}>${L.icon('refresh',16)}<span>Replay</span></button></div>`;
 return html.replace('class="pause-comparison"',`class="pause-comparison pause-hero" data-pause-hero data-projection-key="${E(key)}" data-motion-state="${reduced()?'reduced':'static'}"`)
  .replace(/<div class="pause-comparison-heading">[\s\S]*?<\/div>/,banner+drawing(c,impact))
  .replace('After payment · projected','After · projected');
};
const play=(root,{replay=false}={})=>{
 stop();if(!root)return;
 syncControls(root);
 if(reduced()||document.hidden){settle(root);return;}
 if(account!==L.state){seen.clear();account=L.state;}
 const key=root.getAttribute('data-projection-key')||'';
 if(!replay&&seen.has(key)){settle(root);return;}
 seen.add(key);if(seen.size>48)seen.delete(seen.values().next().value);
 playing=root;root.setAttribute('data-motion-state','playing');
 [...root.querySelectorAll('[data-money-slip]')].forEach((slip,index)=>{
  // Proposed spending reaches the lens and dissolves into its consequence.
  // Nothing is shown arriving at a recipient or being held by Lumo.
  const angle=Number(slip.getAttribute('data-slip-angle'))||0,delay=index*rules.stagger,duration=rules.total-delay;
  const arrive=(rules.reveal-delay)/duration;
  animate(slip,[
   {opacity:0,transform:'translateX(-105px) rotate(-12deg) scale(.78)',easing:rules.ease},
   {opacity:1,transform:'translateX(-82px) rotate(-8deg) scale(.9)',offset:.12,easing:rules.ease},
   {opacity:0,transform:'translateX(0) rotate(0deg) scale(1.06)',offset:arrive},
   {opacity:0,transform:`translateX(0) rotate(${angle}deg) scale(1)`}
  ],{delay,duration});
 });
 const ring=animate(root.querySelector('[data-pause-ring]'),[
  {transform:'scale(.84)',opacity:.6,easing:rules.ease},{transform:'scale(1.07)',opacity:1,offset:revealEnd},
  {transform:'scale(1.07)',opacity:1,offset:holdEnd,easing:rules.ease},{transform:'scale(1)',opacity:1}
 ]);
 animate(root.querySelector('.pause-comparison-after'),[
  {boxShadow:'inset 0 -2px 0 rgba(181,233,106,0)',easing:rules.ease},
  {boxShadow:'inset 0 -2px 0 rgba(181,233,106,1)',offset:revealEnd},
  {boxShadow:'inset 0 -2px 0 rgba(181,233,106,1)',offset:holdEnd,easing:rules.ease},
  {boxShadow:'inset 0 -2px 0 rgba(181,233,106,0)',easing:rules.ease}
 ]);
 if(!jobs.size){settle(root);playing=null;return;}
 ring?.finished?.then?.(()=>{if(playing===root){settle(root);jobs.clear();playing=null;}},()=>{});
};
L.pauseHeroRules=rules;
L.replayPauseProjection=()=>{
 if(L.route==='pause'&&L.state.paymentDraft?.submittedTxId)return;
 play(scene(),{replay:true});
};
const motion=L.motion;
L.motion=function(...args){stop();const result=motion?.apply(this,args);const root=scene();if(root)play(root);return result;};
const navigate=L.beforeNavigate;
L.beforeNavigate=function(...args){stop();return navigate?.apply(this,args);};
const preferenceChanged=()=>{stop();settle(scene());};
preference.addEventListener?.('change',preferenceChanged);
document.addEventListener?.('visibilitychange',()=>{if(document.hidden){stop();settle(scene());}});
})();
