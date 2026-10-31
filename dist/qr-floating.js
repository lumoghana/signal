/* A fixed QR entry in each signed-in page header and active task. */
(()=>{
'use strict';
if(!window.L||L.qrFloating)return;
let button=null;
const excluded=new Set(['welcome','signin','phone','otp','identity','livecheck','identityResult','campus','campusInterest','campusStatus','pilotUnavailable','pin','confirmPin','accountReview','accountReady','setupChoice','setupProgress','recovery','recoveryOwnership','recoveryReplacement','recoveryStatus','authorize','pause','virtualCardAuthorize']);
const eligible=()=>L.state.onboarded&&!L.state.locked&&!L.state.closed&&!excluded.has(L.route)&&!(L.route==='campusPay'&&L.params.qrScan)&&!L.qr?.isHub?.();
function mount(){
 if(button)return;
 button=document.createElement('button');button.id='lumo-scan-qr';button.type='button';button.className='lumo-qr-corner';
 button.setAttribute('aria-label','Scan QR or show my code');button.title='Scan or show your QR';
 button.innerHTML=L.icon('scan',22);
 button.addEventListener('click',()=>{if(eligible())L.qr.open();});
}
function header(){
 const dialog=L.taskSheet?.active?document.querySelector('.task-sheet'):null;
 if(dialog)return dialog.querySelector('.task-sheet-chrome');
 const view=document.getElementById('view');if(!view)return null;
 const top=view.querySelector('.hibiscus-home-header')||view.querySelector('.home-greeting')||view.querySelector('.hibiscus-root-header')||view.querySelector('.chat-banking-header')||view.querySelector('.topline');
 if(top)return top.querySelector('.home-header-actions')||top;
 let bar=view.querySelector('.lumo-qr-corner-bar');
 if(!bar){bar=document.createElement('div');bar.className='lumo-qr-corner-bar';const screen=view.querySelector('.screen')||view;screen.insertBefore(bar,screen.firstChild);}
 return bar;
}
function sync(){
 if(button)button.id='lumo-scan-qr';
 if(!eligible()){if(button)button.hidden=true;return;}
 mount();const host=header();if(!host){button.hidden=true;return;}
 if(button.parentElement!==host){
  button.parentElement?.classList.remove('has-qr-corner');
  const close=host.querySelector('.task-sheet-close');
  if(close)host.insertBefore(button,close);else host.appendChild(button);
 }
 host.classList.add('has-qr-corner');button.hidden=false;
}
L.qrCorner={sync};
// Retain the existing integration name for task-dismissal callers.
L.qrFloating={sync,reposition:sync};
const beforeNavigate=L.beforeNavigate;L.beforeNavigate=function(...args){
 const result=beforeNavigate?.apply(this,args);
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(sync);else setTimeout(sync,0);
 return result;
};
const render=L.render;L.render=function(...args){const result=render.apply(this,args);sync();return result;};
sync();
})();
