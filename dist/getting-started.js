/* Hibiscus's introductory composition, using each edition's own visual tokens.
   The existing welcome view keeps signup, resume, sign-in and support behavior. */
(()=>{
'use strict';
if(!window.L||L.gettingStarted)return;
const welcome=L.views.welcome;
if(!welcome)return;
const scene=()=>`<div class="getting-started-scene" aria-hidden="true">${Array.from({length:5},(_,i)=>`<i class="getting-started-arch" style="--arch:${i}"></i>`).join('')}<i class="getting-started-glow"></i></div>`;
L.views.welcome=function(...args){
 let html=welcome.apply(this,args);
 html=html.replace('class="welcome-screen"','class="welcome-screen getting-started"');
 html=html.replace(/(<(?:section|div)\b[^>]*class="welcome-screen[^\"]*"[^>]*>)/,'$1'+scene());
 html=html.replace('<h1>See what spending changes.</h1>','<h1>Your money.<br>A little clearer.</h1>');
 html=html.replace('<p class="muted">Keep your everyday costs in view.</p>','<p class="muted">For campus life, the plans you have, and the money in between.</p>');
 if(L.state.onboarded){
  // Existing accounts return through the same sign-in guard. Fresh signup
  // keeps the agreed Pause introduction and saved-setup behavior below.
  const primary=L.btn(L.state.closed?'View saved records':L.state.locked?'Sign in':'Continue my Lumo',L.state.closed?"L.go('accountInfo')":L.state.locked?"L.go('signin')":"L.openTab('home')");
  html=html.replace(/(<div class="actions">)[\s\S]*?(<\/div>)/,'$1'+primary+L.btn('See a sample Pause',"L.go('samplePause',{returnTo:'welcome'})",'secondary')+'$2');
 }
 if(!html.includes('Explore a sample account'))html=html.replace('<div class="welcome-utilities">',L.btn('Explore a sample account',"L.go('ambassadorSample')",'text-btn getting-started-sample')+'<div class="welcome-utilities">');
 return html;
};
L.gettingStarted=Object.freeze({version:2});
})();
