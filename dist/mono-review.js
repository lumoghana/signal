/* Corrections found by independent student-session rehearsal. The original
   controllers still own authentication, records, navigation and money. */
(()=>{
'use strict';
if(!window.L||L.monoReview)return;
const decorate=L.decorateView;
L.decorateView=function(html,route){
 let out=decorate?decorate.call(this,html,route):html;
 if(['moneyStoryHome','homeMoneyStory','story','dailyMoneyStory'].includes(route))out=out.replace(/(<figcaption><span>Money out by calendar day<\/span>)/g,'$1<small class="mono-story-window-note">First day and today may be partial.</small>');
 if(route==='firstGoal')out=out.replace('Save your budget here. Create and fund a Money Box from Savings.','Save your budget here. Create and fund a Money Box from Money Boxes in Menu.');
 if(route==='ambassadorGuide')out=out
  .replace('Use You → Ambassador guide → Leave feedback.','Open Menu → Help &amp; support → Share feedback, or use Leave feedback below.')
  .replace('Open Pay, then Campus Pay → Akua’s Kitchen.','Open QR at the top right, choose Enter merchant code and use AK01 for Akua’s Kitchen. You can also open the sample merchant below.')
  .replace("Open Campus Pay</button>","Open sample merchant</button>")
  .replace('onclick="L.go(\'campusPay\')"','onclick="L.go(\'campusPay\',{qrSample:true})"');
 return out;
};
function syncQrName(){
 if(!L.qr?.isHub?.())return;
 for(const backdrop of document.querySelectorAll('.task-sheet-layer[data-task-route="campusPay"]>.task-sheet-backdrop,.task-sheet-layer[data-task-route="myQr"]>.task-sheet-backdrop'))backdrop.setAttribute('aria-label','Close QR');
}
const render=L.render;
L.render=function(...args){const result=render.apply(this,args);syncQrName();return result;};
const syncChat=L.syncChatBanking;
L.syncChatBanking=function(...args){const result=syncChat?.apply(this,args);syncQrName();return result;};
L.monoReview=Object.freeze({version:1});
})();
