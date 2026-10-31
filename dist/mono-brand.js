/* Lumo's supplied character is the common identity, not a payment verdict.
   Edition-owned presentation only: no records, permissions or money change. */
(()=>{
'use strict';
if(!window.L||L.monoBrand)return;
const avatar=(kind='small')=>{const size={mini:24,small:32,greeting:72,welcome:112,hero:190,empty:64}[kind]||32;return `<span class="mono-brand-avatar mono-brand-avatar-${kind}" aria-hidden="true"><img src="/brand/lumo-avatar-icon-192.png" srcset="/brand/lumo-avatar-icon-192.png 192w, /brand/lumo-avatar-icon-512.png 512w" sizes="${size}px" alt="" width="192" height="192" decoding="async"></span>`;};
const identity=(kind='root')=>`<span class="mono-brand-lockup mono-brand-lockup-${kind}" role="img" aria-label="Lumo">${avatar()}<img class="mono-brand-wordmark" src="/brand/Lumo-Wordmark-Black.svg" alt="" width="88" height="32"></span>`;
const attribution=label=>`<div class="mono-brand-attribution">${avatar('mini')}<span>${label}</span></div>`;
const roots=new Set(['home','plan','pay','more','moneyStoryHome','cardsHome']);
const decorate=L.decorateView;
L.decorateView=function(html,route){
 let out=decorate?decorate.call(this,html,route):html;
 out=out.replace(/<span class="eyebrow">LUMO<\/span>/g,'<span class="eyebrow">'+identity('topline')+'</span>');
 if(route==='welcome')out=out.replace(/<svg class="mono-aperture"[\s\S]*?<\/svg>/,avatar('hero'));
 if(route==='ambassadorWelcome')out=out.replace(/<span class="wordmark">[\s\S]*?<\/span>/,identity());
 if(roots.has(route)){
  // The root brand occupies the existing heading row. Titles stay accessible.
  if(route==='home')out=out.replace(/<span class="wordmark" aria-label="Lumo">[\s\S]*?<\/span>/,identity()).replace('class="mono-home-intro"','class="mono-home-intro sr-only"');
  else out=out.replace(/(<header\b[^>]*class="[^"]*hibiscus-root-header[^\"]*"[^>]*>)/,'$1'+identity());
 }
 if(route==='monoMenu')out=out.replace('<p class="mono-menu-owner">',identity('menu')+'<p class="mono-menu-owner">');
 if(out.includes('class="onboarding-page"')){
  // Keep the existing Back/help row and exact step name; never add a banner.
  out=out.replace(/(<span class="eyebrow">)([\s\S]*?)(<\/span>)/,(_,open,label,close)=>'<span class="mono-setup-identity">'+avatar('small')+open+label+close+'</span>');
  if(route==='accountReady'&&L.state.onboarded&&!L.state.locked)out=out.replace('<div class="onboarding-page">','<div class="onboarding-page mono-brand-ready">'+avatar('welcome'));
 }
 if(route==='chat'){
  out=out.replace(/<span class="hibiscus-chat-header-title">Ask Lumo<\/span>/,`<span class="hibiscus-chat-header-title mono-brand-chat-title">${avatar('small')}<span>Ask Lumo</span></span>`);
  out=out.replace('<div class="hibiscus-chat-feed-greeting">','<div class="hibiscus-chat-feed-greeting">'+avatar('greeting'));
  // Attribute answers once, without confusing the customer and assistant.
  out=out.replace(/(<div\b[^>]*class="chat-bubble(?: chat-reply[^\"]*)?"[^>]*>)/g,'$1'+attribution('Lumo'));
 }
 if(['moneyStoryHome','homeMoneyStory','story'].includes(route))out=out.replace(/(<section class="ms-insights"[^>]*>)/,'$1'+attribution('Lumo insights'));
 // The card is a branded object. Its lock, status and masked number remain.
 out=out.replace(/(<div class="vc-face-top">)(<img\b[^>]*class="vc-wordmark"[^>]*>)/g,'$1<span class="mono-card-identity">'+avatar('small')+'$2</span>');
 // Identity sits outside the QR and quiet zone. Recipient identity stays intact.
 out=out.replace('<figure class="personal-qr-card">','<figure class="personal-qr-card">'+identity('qr'));
 if(route==='pause')out=out.replace('<div class="pause-hero-intro">','<div class="pause-hero-intro mono-brand-pause">'+attribution('A moment with Lumo'));
 if(route==='goals')out=out.replace(/(<div class="empty"[^>]*>)/,'$1'+avatar('empty'));
 if(route==='plan')out=out.replace('<p class="plan-hub-empty">','<p class="plan-hub-empty mono-brand-empty-line">'+avatar('small'));
 if(route==='help')out=out.replace('<div class="stack account-flow">','<div class="stack account-flow">'+`<div class="mono-brand-help">${avatar('greeting')}<p>A little help, whenever you need it.</p></div>`);
 if(route==='feedback')out=out.replace(/(<(?:div|form)\b[^>]*class="form")/,attribution('Help shape Lumo')+'$1');
 return out;
};
L.monoBrand=Object.freeze({version:1});
})();
