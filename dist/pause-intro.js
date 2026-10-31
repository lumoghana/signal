/* An isolated example of the same saved-Budget consequence used by a real
   Pause. No personal records, forecast dates or future contributions are read. */
(()=>{
'use strict';
if(!window.L||L.pauseIntro)return;
const E=L.e,B=L.btn,M=L.money;
const preference=window.matchMedia?.('(prefers-reduced-motion: reduce)')||{matches:false};
const duration=8000;
function commitmentImpact(){
 const state={balance:600,accounts:{version:2},essentials:[{id:'food',name:"Next week’s food",amount:350,paid:0}],goals:[],txs:[]};
 const draft={method:'campus',name:'Campus shoes',destination:'EXAMPLE-SHOES',amount:280,fee:0,checked:true};
 const p=L.pauseEngine.planPosition(draft,state);
 return Object.freeze({amount:draft.amount,available:p.available,after:p.after,commitment:state.essentials[0].name,planned:p.essentialsBefore,shortfall:p.essentialGap,roomBefore:p.roomBefore,source:'saved-budget',moneyBoxesChanged:false});
}
function replay(){
 if(L.route!=='samplePause'||preference.matches||document.hidden)return false;
 L.render();document.getElementById('pause-intro-replay')?.focus?.({preventScroll:true});return true;
}
L.views.samplePause=()=>{
 const p=commitmentImpact(),back=L.params.returnTo==='ambassadorWelcome'?'ambassadorWelcome':'welcome';
 const signup=L.params.intent==='signup'&&!L.state.onboarded;
 return `<section class="pause-intro pause-intro-commitment" data-pause-intro data-illustrated-screen="samplePause" style="--pause-intro-duration:${duration}ms">
 <div class="pause-intro-topline"><button type="button" class="icon-btn" onclick="L.go('${back}')" aria-label="Back to the start">${L.icon('arrowLeft',22)}</button><span class="pause-intro-badge">A Pause Moment</span>${signup?B('Skip example','L.onboarding.start()','text-btn sample-pause-skip pause-intro-skip'):'<span class="pause-intro-header-spacer" aria-hidden="true"></span>'}</div>
 <h1>These shoes leave next week’s food <strong>${E(M(p.shortfall))} short.</strong></h1>
 <div class="pause-intro-story"><p>${E(M(p.amount))} for shoes today.</p><p data-intro-summary>Example story. ${E(M(p.available))} available − ${E(M(p.amount))} for shoes leaves ${E(M(p.after))}. Next week’s food needs ${E(M(p.planned))}. That leaves a ${E(M(p.shortfall))} gap. Nothing moves. Money Box savings stay unchanged.</p></div>
 <div class="pause-intro-actions">${B(L.state.onboarded?'Back to Lumo':'Start sign-up',L.state.onboarded?"L.go(L.state.locked?'signin':'home')":'L.onboarding.start()')}
 <div class="pause-intro-utilities">${B(L.icon('refresh',15)+' Replay','L.pauseIntro.replay()','text-btn pause-intro-replay').replace('<button ','<button id="pause-intro-replay" '+(preference.matches?'hidden ':''))}${B('Back to the start',`L.go('${back}')`,'text-btn pause-intro-back')}</div>
 <p class="pause-intro-boundary">Example story. Nothing moves.</p></div></section>`;
};
L.pauseIntro=Object.freeze({version:4,duration,replay,commitmentImpact,exampleImpact:commitmentImpact});
})();
