/* First-use education stays available below the task. Only reviewed static
   copy is moved; live facts, form instructions and approvals keep their place. */
(()=>{
'use strict';
if(!window.L||L.pageGuidance)return;
const E=L.e,J=JSON.stringify;
const definitions={
 goals:{label:'About Money Boxes',copy:['Save for what matters to you.'],reuse:'How Money Boxes work'},
 goal:{label:'About this Money Box',copy:['In your Lumo savings account.'],match:text=>/^Your (?:budget|Budget) applies to (?:your operational account|Everyday money)\. Money here is separate\. Transferring back needs your PIN or biometric approval(?: and your partner’s approval)?\.$/.test(text)},
 goalEdit:{label:'About Money Boxes',copy:['Make it personal.','Creating a Money Box doesn’t move money. Fund it when you choose, or use an optional Savings hack.']},
 balances:{label:'About your balances',copy:['Money Boxes are already in savings. They are not deducted from your operational balance again. Move money back before spending it. Protected boxes also need partner approval.','Money Boxes are already in savings. They are not deducted from Everyday money again. Move money back before spending it. Protected boxes also need partner approval.','Available balance is money in your Everyday account. Left after Budget allows for the saved costs still to cover.','Both figures describe the same money. A Budget does not move or lock it. Money Boxes and card balances are separate.','Card money is separate from Everyday Money and Money Boxes. Loading a card is not expenditure.']},
 allowance:{label:'About expected money',copy:['What are you expecting? It only becomes account money when it arrives.','An estimate is enough.','An estimate is fine. You can change it whenever life changes.']},
 planEdit:{label:'About your Budget',copy:['Choose an item to change.','Start with the costs you know.','Choose what your operational money must cover.','Choose what your Everyday money must cover.']},
 essentials:{label:'About Budget items',copy:['Choose an item to change.','Start with the costs you know.','The costs this money needs to cover.']},
 essentialEdit:{label:'About Budget items',copy:['The full cost, including what’s covered.','Saving a budget item doesn’t pay anyone or move money.']},
 budgetCategory:{label:'About this Budget category',copy:['Your earlier items are kept together in this category, with their payment history unchanged.']},
 addMoney:{label:'About adding money',copy:['Choose where your money comes from.']},
 bankAdd:{label:'How to send with GIP',reuse:'How to send with GIP'},
 sendOptions:{label:'About transfers',copy:['Choose where your money is going.']},
 requests:{label:'About money requests',copy:['Your share, made simple.','Keep track of what you’ve asked for and what you owe.']},
 activity:{label:'About activity',copy:['Every payment has a story.']},
 virtualCards:{label:'About virtual cards',copy:['For online payments. Up to two cards.','Your online payments, in one place.']},
 story:{label:'About your money story',copy:['Your confirmed spending.','See where it went, including fees.'],reuse:'What counts?'},
 homeMoneyStory:{label:'About your money story',copy:['Your confirmed spending.','See where it went, including fees.'],reuse:'What counts?'},
 profile:{label:'About your profile',copy:['The details people see.']},
 profileEdit:{label:'About your profile',copy:['Make it yours.','Your public details.']},
 security:{label:'About security',copy:['A little care goes a long way.','Keep your account yours.']},
 devices:{label:'About your devices',copy:['Know where you are signed in.','Review your devices.']},
 privacy:{label:'About privacy choices',copy:['Your information. Your choices.','Your information. Your choice.']},
 notificationPrefs:{label:'About notifications',copy:['A nudge, on your terms.','Choose your nudges.']},
 notifications:{label:'About updates',copy:['The things worth knowing.','The things to know.']},
 statements:{label:'About statements',copy:['Your activity, for a chosen period.','Choose a period.']},
 dataExport:{label:'About your data copy',copy:['A copy for your own records.','Download your information.']},
 help:{label:'About getting help',copy:['Let’s find the right place to start.','Find the next step.']},
 supportCase:{label:'About support reports',copy:['Tell us what needs attention.','Tell us what happened.']}
};
definitions.cardsHome=definitions.virtualCards;
definitions.moneyStoryHome=definitions.homeMoneyStory;
const topics={moneyStoryHome:['moneyStoryHome','homeMoneyStory','story'],cardsHome:['cardsHome','virtualCards']};
const topic=route=>Object.keys(topics).find(key=>topics[key].includes(route))||route;
const owner=()=>String(L.state.profile?.account||L.state.profile?.phone||'local');
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const storage=()=>{
 const key=owner(),s=L.state.pageGuidance;
 if(!s||s.version!==1||s.owner!==key||!s.seen||typeof s.seen!=='object'||Array.isArray(s.seen)||!s.dismissed||typeof s.dismissed!=='object'||Array.isArray(s.dismissed))L.state.pageGuidance={version:1,owner:key,seen:{},dismissed:{}};
 const saved=L.state.pageGuidance;
 // Read legacy route flags without sharing education across accounts/editions.
 for(const [key,routes]of Object.entries(topics)){
  if(routes.some(route=>saved.seen[route]))saved.seen[key]=true;
  if(routes.some(route=>saved.dismissed[route]))saved.dismissed[key]=true;
 }
 return saved;
};
const textOf=html=>html.replace(/<[^>]*>/g,' ').replace(/&(?:amp|lt|gt|quot|#39);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[x])).replace(/\s+/g,' ').trim();
const escapeRx=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
let visit=null;
const mounted=route=>document.getElementById('view')?.querySelector?.('.page-guidance[data-guidance-route="'+route+'"]');
const visitScope=(route,params={})=>route+'|'+String(params.id||'')+'|'+String(params.reference||'')+'|'+String(params.txId||'');
function currentVisit(route){
 const account=owner(),scope=visitScope(route,L.params);
 if(!visit||visit.state!==L.state||visit.owner!==account||visit.scope!==scope)visit={state:L.state,owner:account,scope,route,open:null};
 else {const node=mounted(route);if(node)visit.open=node.hasAttribute('open');}
 return visit;
}
// A sheet can restore its mounted parent without rendering it. The navigation
// hook still marks the visit boundary while keeping all existing controllers.
const beforeNavigate=L.beforeNavigate;
L.beforeNavigate=function(route,params={},...args){
 if(visit&&visit.scope!==visitScope(route,params)){
  // A retained root is not repainted when a child task closes. Leave its
  // education collapsed now so returning to that same DOM stays quiet too.
  const prior=mounted(visit.route)||document.querySelector?.('.page-guidance[data-guidance-route="'+visit.route+'"]');
  prior?.removeAttribute('open');visit=null;
 }
 return beforeNavigate?.call(this,route,params,...args);
};
function markup(route,label,body,attributes='',v){
 const s=storage(),key=topic(route);
 if(v.open===null)v.open=!s.seen[key]&&!s.dismissed[key];
 s.seen[key]=true;
 const classes=attributes.match(/\bclass="([^"]*)"/)?.[1]||'';
 const attrs=attributes.replace(/\bclass="[^"]*"/,'').replace(/\s*\bopen(?:="[^"]*")?/g,'');
 return `<details${attrs} class="${E(classes)} page-guidance" data-guidance-route="${route}"${v.open?' open':''}><summary>${E(label)}</summary><div class="page-guidance-body">${body}<button type="button" class="text-btn page-guidance-dismiss" onclick="L.pageGuidance.dismiss(${E(J(route))})">Got it</button></div></details>`;
}
const decorate=L.decorateView;
L.decorateView=function(html,route){
 html=decorate?decorate.call(this,html,route):html;
 const v=currentVisit(route);
 const definition=definitions[route];if(!definition||!allowed()||html.includes('data-guidance-route='))return html;
 const paragraphs=[];
 if(route==='requests')html=html.replace(/<h1(?:\s[^>]*)?>A simple ask\.<\/h1>/,()=>{paragraphs.push('<p>A simple ask.</p>');return '<h1 class="sr-only">Money requests</h1>';});
 html=html.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/g,(all,attrs,inside)=>{
  // Exact reviewed copy cannot absorb customer notes or important notices.
  if(/(?:receipt-note|focus-note|payment-note|preview|disclosure|warning|notice|error|role="alert"|\bsh-|protection)/.test(attrs))return all;
  const text=textOf(inside);
  if(!definition.copy?.includes(text)&&!definition.match?.(text))return all;
  paragraphs.push(all);return '';
 });
 if(definition.reuse){
  const pattern=new RegExp('<details\\b([^>]*)>\\s*<summary>'+escapeRx(definition.reuse)+'</summary>([\\s\\S]*?)</details>');
  let reused=false;
  html=html.replace(pattern,(all,attrs,body)=>{reused=true;return markup(route,definition.reuse,paragraphs.join('')+body,attrs,v);});
  if(reused)return html;
 }
 return paragraphs.length?html+markup(route,definition.label,paragraphs.join(''),'',v):html;
};
function dismiss(route){
 if(!allowed()||!definitions[route]||L.route!==route)return;
 const node=mounted(route);if(!node)return;
 const s=storage(),key=topic(route);s.seen[key]=true;s.dismissed[key]=true;
 const v=currentVisit(route);v.open=false;node.removeAttribute('open');
 node.querySelector('summary')?.focus?.({preventScroll:true});L.save();
}
document.addEventListener('toggle',event=>{
 const node=event.target;if(!node?.matches?.('.page-guidance'))return;
 const route=node.getAttribute('data-guidance-route');
 if(route!==L.route||node!==mounted(route)||!allowed())return;
 currentVisit(route).open=node.hasAttribute('open');
},true);
L.pageGuidance=Object.freeze({version:1,dismiss,routes:Object.freeze(Object.keys(definitions))});
})();
