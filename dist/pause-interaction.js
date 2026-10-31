/* An intentional, visible Pause before separate PIN authorisation.
   Timing changes presentation and consent interaction, never account money. */
(()=>{
'use strict';
if(!window.L||L.pauseInteractionRules)return;
const rules=Object.freeze({minimum:3000,hold:90,reveal:900});
const preference=window.matchMedia?.('(prefers-reduced-motion: reduce)')||{matches:false};
const moments=new Map();let account=L.state,active=null,tick=null,press=null,suppressed=null;
const now=()=>window.performance?.now?.()??Date.now();
const liveRoot=()=>['pause','samplePause'].includes(L.route)?document.getElementById('view')?.querySelector?.('[data-pause-hero]')?.closest?.('.screen'):null;
const effectAttrs=' data-pause-effects aria-hidden="true" inert';
const stage=markup=>`<div class="pause-conclusion-stage"><p class="pause-arrival-intro" tabindex="-1">See what this payment changes.</p>${markup}<span class="sr-only" data-pause-announcement role="status" aria-live="polite" aria-atomic="true"></span></div>`;
function prepare(html,sample=false){
 if(!html.includes('data-pause-hero'))return html;
 if(sample)html=html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/,match=>stage(match.replace('<h1','<h1'+effectAttrs)));
 else html=html.replace(/<div class="focus-pause-insight"[^>]*>[\s\S]*?<\/div>/,match=>stage(match.replace('<div ','<div'+effectAttrs+' ')));
 html=html.replace(/<div class="pause-comparison-after"/,'<div class="pause-comparison-after"'+effectAttrs)
  .replace(/<p class="(pause-goal-impact|pause-linked-fulfilment|pause-existing-gap)"/g,'<p'+effectAttrs+' class="$1"')
  .replace('<details class="pause-calculation"','<details class="pause-calculation"'+effectAttrs);
 if(!sample){
  html=html.replace(/<button\b([^>]*onclick="L\.resumeFromPause\(\)"[^>]*)>/,'<button$1 data-pause-hold data-pause-ready="false" aria-disabled="true" aria-describedby="pause-timing-status" aria-keyshortcuts="Space Enter">');
  html=html.replace('<div class="pause-decisions">','<p id="pause-timing-status" class="pause-timing-status" role="status" aria-live="polite">The effect appears when the money reaches the ring.</p><div class="pause-decisions">');
 }
 return html;
}
const pause=L.views.pause,sample=L.views.samplePause;
L.views.pause=()=>prepare(pause());
L.views.samplePause=()=>prepare(sample(),true);
const elapsed=()=>active?active.entry.elapsed+(active.anchor===null?0:Math.max(0,now()-active.anchor)):0;
// The reading window starts when the consequence is actually available, rather
// than using up 900ms of it while the money is still approaching the lens.
const ready=()=>!!active&&active.entry.readStart!==null&&elapsed()-active.entry.readStart>=rules.minimum&&!document.hidden;
function suppress(button){suppressed={button,until:now()+600};}
function cancelPress(){
 if(!press)return;
 clearTimeout(press.timer);press.button.removeAttribute('data-hold-state');suppress(press.button);press=null;
}
function detach(){
 if(tick!==null){clearTimeout(tick);tick=null;}
 cancelPress();
 if(active){active.entry.elapsed=elapsed();active.anchor=null;}
 active=null;
}
function sync(){
 if(!active)return;
 // A fractional timer can arrive just before a boundary. Use one clock
 // snapshot for the decision and its next wake, so it cannot cross that
 // boundary between two reads and leave the consequence hidden forever.
 const {root,entry,button}=active,hasMotion=typeof root.querySelector('[data-money-slip]')?.animate==='function',spent=elapsed();
 const revealed=entry.revealed||preference.matches||!hasMotion||spent>=rules.reveal;
 if(revealed&&!entry.revealed){
  entry.revealed=true;entry.readStart=preference.matches||!hasMotion?spent:rules.reveal;
  const announcement=root.querySelector('[data-pause-announcement]');
  if(announcement)announcement.textContent=root.querySelector('[data-pause-effects] h1')?.textContent||root.querySelector('h1[data-pause-effects]')?.textContent||'';
 }
 root.setAttribute('data-effects-revealed',revealed?'true':'false');
 for(const effect of root.querySelectorAll('[data-pause-effects]')){effect.setAttribute('aria-hidden',revealed?'false':'true');effect.inert=!revealed;if(revealed)effect.removeAttribute('inert');else effect.setAttribute('inert','');}
 const intro=root.querySelector('.pause-arrival-intro'),focusOnIntro=document.activeElement===intro;if(intro){intro.hidden=revealed;intro.setAttribute('aria-hidden',revealed?'true':'false');}
 if(revealed&&focusOnIntro)root.querySelector('h1')?.focus?.({preventScroll:true});
 if(button){const canContinue=entry.readStart!==null&&spent-entry.readStart>=rules.minimum&&!document.hidden;button.setAttribute('aria-disabled',canContinue?'false':'true');button.setAttribute('data-pause-ready',canContinue?'true':'false');
  const status=root.querySelector('#pause-timing-status'),message=canContinue?'Press briefly to choose PIN or biometrics.':revealed?'3 seconds to review · edit or cancel anytime.':'The effect appears when the money reaches the ring.';if(status&&status.textContent!==message)status.textContent=message;
 }
 if(tick!==null){clearTimeout(tick);tick=null;}
 if(active.anchor!==null&&!document.hidden){
  const boundary=!revealed?rules.reveal:entry.readStart+rules.minimum;
  if(spent<boundary)tick=setTimeout(()=>{tick=null;sync();},Math.max(1,boundary-spent));
 }
}
function mount(){
 detach();const root=liveRoot();if(!root)return;
 if(account!==L.state){moments.clear();account=L.state;}
 const hero=root.querySelector('[data-pause-hero]'),key=hero.getAttribute('data-projection-key')||L.route;
 let entry=moments.get(key);if(!entry){entry={elapsed:0,revealed:false,readStart:null};moments.set(key,entry);if(moments.size>48)moments.delete(moments.keys().next().value);}
 const button=root.querySelector('[data-pause-hold]');active={root,entry,button,anchor:document.hidden?null:now(),committing:false};
 if(button&&!button.__pauseHoldBound){
  button.__pauseHoldBound=true;
  button.addEventListener('pointerdown',event=>{if(event.isPrimary===false||(event.button??0)!==0)return;event.preventDefault();suppress(button);button.focus?.({preventScroll:true});begin(button,'pointer',event.pointerId);try{button.setPointerCapture?.(event.pointerId);}catch{}});
  button.addEventListener('pointerup',event=>{event.preventDefault();suppress(button);release(button,'pointer',event.pointerId);try{button.releasePointerCapture?.(event.pointerId);}catch{}});
  button.addEventListener('pointercancel',()=>{suppress(button);cancelPress();});
  button.addEventListener('pointerleave',()=>{suppress(button);cancelPress();});
  button.addEventListener('lostpointercapture',cancelPress);
  button.addEventListener('pointermove',event=>{if(!press||press.button!==button||press.kind!=='pointer')return;const r=button.getBoundingClientRect();if(Number.isFinite(event.clientX)&&Number.isFinite(event.clientY)&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))cancelPress();});
  button.addEventListener('keydown',event=>{if(![' ','Spacebar','Enter'].includes(event.key))return;event.preventDefault();if(event.repeat)return;suppress(button);begin(button,'keyboard',event.key);});
  button.addEventListener('keyup',event=>{if(![' ','Spacebar','Enter'].includes(event.key))return;event.preventDefault();suppress(button);release(button,'keyboard',event.key);});
  button.addEventListener('blur',cancelPress);
 }
 sync();
 if(!root.contains(document.activeElement)){
  const heading=entry.revealed?root.querySelector('h1'):root.querySelector('.pause-arrival-intro');heading?.focus?.({preventScroll:true});
 }
}
const resume=L.resumeFromPause;
function commit(button){
 if(!active||active.button!==button||active.committing||!ready()||L.route!=='pause')return;
 active.committing=true;cancelPress();resume();
 // A changed fingerprint returns to Review through the existing payment rules.
 if(active)active.committing=false;
}
function begin(button,kind,id){
 cancelPress();if(!active||active.button!==button||!ready()||active.committing){sync();return;}
 press={button,kind,id,started:now(),timer:null};button.setAttribute('data-hold-state','holding');
 const current=press;press.timer=setTimeout(()=>{
  if(press!==current||!ready()||document.hidden)return;
  button.setAttribute('data-hold-state','complete');
  if(kind==='assistive')commit(button);
 },rules.hold);
}
function release(button,kind,id){
 const held=press&&press.button===button&&press.kind===kind&&press.id===id&&now()-press.started>=rules.hold;
 cancelPress();if(held)commit(button);
}
L.resumeFromPause=()=>{
 if(L.route!=='pause')return;
 const button=liveRoot()?.querySelector('[data-pause-hold]');
 // Preserve the original string-renderer fallback; the mounted customer UI
 // always has this control and enforces the same dwell and press for every input.
 if(!button)return resume();
 if(!active||active.button!==button)mount();
 if(!ready()){sync();return;}
 begin(button,'assistive');
};
const replay=L.replayPauseProjection;
L.replayPauseProjection=()=>{
 if(active&&liveRoot()===active.root){
  cancelPress();active.entry.elapsed=0;active.entry.revealed=false;active.entry.readStart=null;active.anchor=document.hidden?null:now();
  const announcement=active.root.querySelector('[data-pause-announcement]');if(announcement)announcement.textContent='';
  sync();
 }
 return replay?.();
};
const motion=L.motion;
L.motion=function(...args){detach();const result=motion?.apply(this,args);mount();return result;};
const navigate=L.beforeNavigate;
L.beforeNavigate=function(...args){detach();return navigate?.apply(this,args);};
// A cancelled or too-short pointer/key press must not turn its following native
// click into the single-activation assistive equivalent.
document.addEventListener?.('click',event=>{const button=event.target?.closest?.('[data-pause-hold]');if(button&&suppressed?.button===button&&now()<=suppressed.until){event.preventDefault();event.stopImmediatePropagation?.();}},true);
document.addEventListener?.('visibilitychange',()=>{
 if(!active)return;
 if(document.hidden){active.entry.elapsed=elapsed();active.anchor=null;cancelPress();if(tick!==null){clearTimeout(tick);tick=null;}sync();}
 else {active.anchor=now();sync();}
});
window.addEventListener?.('blur',cancelPress);
preference.addEventListener?.('change',()=>{cancelPress();sync();});
L.pauseInteractionRules=rules;
})();
