/* Monochrome's moment with Lumo. This final presentation adapter keeps the
   native quote, reveal clock, choice handlers and separate authorisation. */
(()=>{
'use strict';
if(!window.L||L.monoPause)return;
const E=L.e,M=L.money;
// Read one complete existing element, including nested elements of its type.
// Keeping native controls intact preserves their reviewed payment bindings.
function element(html,name){
 const tags=/<([a-z][\w:-]*)\b([^>]*)>/gi;let match;
 while((match=tags.exec(html))){
  const classes=match[2].match(/\bclass="([^"]*)"/)?.[1]?.split(/\s+/)||[];
  if(!classes.includes(name))continue;
  const start=match.index,inside=tags.lastIndex,tag=match[1];
  const nested=new RegExp('<(/?)'+tag+'\\b[^>]*>','gi');nested.lastIndex=inside;let depth=1,end;
  while((end=nested.exec(html))){depth+=end[1]?-1:1;if(!depth)return {outer:html.slice(start,nested.lastIndex),inner:html.slice(inside,end.index),start,end:nested.lastIndex};}
  return null;
 }
 return null;
}
function headline(d,impact=L.planImpactSummary(d),decision=impact?.engineDecision){
 if(!impact?.valid||!impact.canPay)return impact?.headline||'';
 if(impact.totalGap>0){
  if(impact.totalGapBefore>0&&impact.extraGap>0)return `This adds ${M(impact.extraGap)} to your ${L.state.accounts?.version===2?'budget':'plan'} shortfall.`;
  if(impact.totalGapBefore>0)return `Your ${L.state.accounts?.version===2?'budget':'plan'} would still be ${M(impact.totalGap)} short.`;
  return impact.headline;
 }
 if(decision?.selected?.code==='low_balance')return `You’d have ${M(Math.max(0,impact.after))} left.`;
 return decision?.selected?.message||impact.headline;
}
const character=`<div class="mono-pause-character" aria-hidden="true"><span class="mono-pause-face" data-pause-ring><img src="/brand/lumo-avatar-icon-512.png" alt="" width="512" height="512" decoding="async"></span><svg class="mono-pause-hand" viewBox="0 0 64 88" xmlns="http://www.w3.org/2000/svg" focusable="false"><path fill="currentColor" stroke="#161616" stroke-width="2.5" stroke-linejoin="round" d="M21 77c-4-5-8-10-11-16L3 47c-2-5 4-9 7-5l9 11V22c0-7 9-7 9 0v21V12c0-7 10-7 10 0v31V17c0-7 10-7 10 0v28V28c0-7 10-7 10 0v31c0 7-4 13-8 18v7H21Z"/><path d="M20 53c9-3 18 0 21 8" fill="none" stroke="#161616" stroke-width="2.5" stroke-linecap="round"/></svg><span class="mono-pause-clock" data-money-slip hidden></span></div>`;
function samplePresentation(original){
 const p=L.pauseIntro?.commitmentImpact?.(),intro=element(original,'pause-intro');
 if(!p||!intro)return original;
 const top=element(original,'pause-intro-topline')?.outer||'';
 let actions=element(original,'pause-intro-actions')?.outer||'';
 const boundary=element(actions,'pause-intro-boundary')?.outer;if(boundary)actions=actions.replace(boundary,'');
 const rows=[['Available before',M(p.available)],['Shoes today',M(p.amount)],['Available after',M(p.after)],['Next week’s food',M(p.planned)],['Food shortfall',M(p.shortfall)]];
 const explanation=`<p data-intro-summary>In this example, buying shoes today leaves less for next week’s food. Lumo compares the payment with a saved Budget before you decide. Money already in Money Boxes stays unchanged. This is a Budget gap, not a prediction about future income or a goal date.</p>`;
 const why=`<details class="mono-pause-why"><summary>See why</summary><div class="pause-calculation-body">${explanation}<dl>${rows.map(([label,value])=>`<div><dt>${E(label)}</dt><dd>${E(value)}</dd></div>`).join('')}</dl></div></details>`;
 const result=`<section class="pause-intro pause-intro-commitment mono-pause-simple mono-pause-example" data-pause-intro data-illustrated-screen="samplePause">${top}<div class="mono-pause-moment">${character}<div class="focus-pause-insight"><h1>These shoes leave next week’s food <strong data-intro-shortfall>${E(M(p.shortfall))} short.</strong></h1></div></div><div class="mono-pause-payment"><p class="mono-pause-payment-line"><strong data-intro-amount>${E(M(p.amount))}</strong><span>for shoes today</span></p><small class="mono-pause-example-boundary">Example story. Nothing moves.</small></div>${actions}${why}</section>`;
 return original.slice(0,intro.start)+result+original.slice(intro.end);
}
function testerPresentation(original){
 const insight=element(original,'pause-single-insight'),recipient=element(original,'pause-recipient'),actions=element(original,'actions');
 if(!insight||!recipient||!actions)return original;
 const title=insight.inner.replace(/<h2\b/g,'<h1').replace(/<\/h2>/g,'</h1>');
 const name=recipient.inner.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/)?.[1]||'';
 const amount=recipient.inner.match(/<small\b[^>]*>([\s\S]*?)<\/small>/)?.[1]||'';
 const top=element(original,'topline')?.outer||'';
 const chips=element(original,'pause-demo-chips')?.outer||'';
 const rule=element(original,'engine-demo-details')?.inner.replace(/^\s*<summary\b[^>]*>[\s\S]*?<\/summary>/,'')||'';
 return `<section class="mono-pause-simple mono-pause-example mono-pause-tester" data-illustrated-screen="pauseDemo">${top}<div class="mono-pause-moment">${character}<div class="focus-pause-insight">${title}</div></div><div class="mono-pause-payment"><p class="mono-pause-payment-line"><strong>${amount}</strong><span>to ${name}</span></p><small class="mono-pause-example-boundary">Sample scenario. Nothing moves.</small></div>${actions.outer}<details class="mono-pause-why"><summary>See why</summary>${chips}<div class="pause-calculation-body">${rule}</div></details></section>`;
}
const decorate=L.decorateView;
L.decorateView=function(html,route){
 const original=decorate?decorate.call(this,html,route):html,d=L.state.paymentDraft;
 if(route==='samplePause')return samplePresentation(original);
 if(route==='pauseDemo'&&L.testMode)return testerPresentation(original);
 if(route!=='pause'||!d||d.submittedTxId||!original.includes('focus-pause-compact'))return original;
 const impact=L.planImpactSummary(d),decision=impact?.engineDecision;
 if(!impact?.valid||!impact.canPay||!decision?.triggered)return original;
 const section=element(original,'focus-pause'),stage=element(original,'pause-conclusion-stage'),choices=element(original,'pause-decisions'),hero=element(original,'pause-hero');
 if(!section||!stage||!choices||!hero)return original;
 const key=hero.outer.match(/\bdata-projection-key="([^"]*)"/)?.[1];if(!key)return original;
 const title=E(headline(d,impact,decision));
 const conclusion=stage.outer.replace(/(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/,(_,open,close)=>open+title+close).replace(/(<p\b[^>]*class="pause-arrival-intro"[^>]*>)[\s\S]*?(<\/p>)/,(_,open,close)=>open+'A moment.'+close);
 const top=element(original,'topline')?.outer||'';
 const paymentContext=element(original,'pause-recovery-context')?.outer||((element(original,'pause-payment-context')?.outer||'')+(element(original,'decision-payment-summary')?.outer||'')+(element(original,'decision-product')?.outer||''));
 const endedPeriod=original.match(/<p\b[^>]*\bdata-budget-period\b[^>]*>[\s\S]*?<\/p>/)?.[0]||'';
 const comparison=element(original,'pause-comparison-values')?.outer||'';
 const notes=['pause-comparison-note','pause-goal-impact','pause-linked-fulfilment','pause-existing-gap'].map(name=>element(original,name)?.outer||'').join('');
 const calculation=element(original,'pause-calculation')?.inner.replace(/^\s*<summary\b[^>]*>[\s\S]*?<\/summary>/,'')||'';
 const chat=element(original,'contextual-chat-entry')?.outer||'';
 const more=element(original,'mono-pause-options')?.outer||'';
 let exits=element(original,'focus-pause-exits')?.outer||'';
 // Decide later already lives in the optional choices on Monochrome.
 exits=exits.replace(/<button\b[^>]*onclick="L\.pauseAction\('delay_payment'\)"[^>]*>[\s\S]*?<\/button>/g,'');
 const totals=E(M(Number(d.amount)+Number(d.fee||0))),transfer=d.method==='box';
 const compact=`<div class="mono-pause-payment"><p class="mono-pause-payment-line"><strong>${totals}</strong><span>to ${E(d.name)}</span></p>${Number(d.fee)>0?`<small class="mono-pause-fee">Includes ${E(M(d.fee))} fee</small>`:''}${endedPeriod?'<small class="mono-pause-budget-note">Budget period ended.</small>':''}</div>`;
 const decisions=choices.outer.replace(/>Edit amount<\/button>/g,'>Change amount</button>');
 const moment=`<div class="mono-pause-moment" data-pause-hero data-projection-key="${key}">${character}${conclusion}</div>`;
 const why=`<details class="mono-pause-why" data-pause-effects aria-hidden="true" inert><summary>See why</summary>${paymentContext}${endedPeriod}<div class="pause-comparison">${comparison}</div>${notes}<div class="pause-calculation-body">${calculation}</div>${chat}</details>`;
 const body=`<section class="focus-pause focus-pause-compact mono-pause-simple" data-illustrated-screen="pause">${top}${moment}${compact}<div id="error" role="alert"></div><div class="actions pause-actions"><p id="pause-timing-status" class="sr-only" role="status" aria-live="polite">A moment to see what changes.</p>${decisions}<p class="mono-pause-reassurance">Nothing ${transfer?'moved':'sent'} yet. PIN or biometrics comes next.</p>${more}${exits}</div>${why}</section>`;
 return original.slice(0,section.start)+body+original.slice(section.end);
};
// Native timing owns availability. Only translate its old diagram instructions
// into language that matches this avatar presentation, including live updates.
let observer=null;
const wording=()=>{
 const status=document.querySelector('.mono-pause-simple #pause-timing-status');if(!status)return;
 const text=status.textContent;
 const message=text.includes('effect appears')?'A moment to see what changes.':text.includes('3 seconds')?'Take three seconds to review.':text.includes('Press briefly')?'Continue to PIN or biometrics.':text;
 if(message!==text)status.textContent=message;
};
const motion=L.motion;
L.motion=function(...args){
 observer?.disconnect();observer=null;const result=motion?.apply(this,args);wording();
 const status=document.querySelector('.mono-pause-simple #pause-timing-status');
 if(status&&typeof MutationObserver==='function'){observer=new MutationObserver(wording);observer.observe(status,{childList:true,characterData:true,subtree:true});}
 return result;
};
const navigate=L.beforeNavigate;
L.beforeNavigate=function(...args){observer?.disconnect();observer=null;return navigate?.apply(this,args);};
L.monoPause=Object.freeze({version:2,headline});
})();
