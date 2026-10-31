/* When a question is unclear, offer a short choice before asking for detail.
   Supported answers, amounts, dates and payment approvals keep their existing
   authorities. No fuzzy interpretation turns a question into a transaction. */
(()=>{
'use strict';
if(!window.L||L.hibiscusChatClarity||!L.hibiscusChat)return;
const E=L.e,B=L.btn;
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const choices=()=>[
 {id:'spend',label:'Check a spend'},
 {id:'story',label:'Where did it go?'},
 {id:'budget',label:L.hasMeaningfulPlan()?'Adjust my Budget':'Build my Budget'}
];
const previousAnswer=L.chatAnswer;
L.chatAnswer=function(...args){
 const reply=previousAnswer.apply(this,args);
 if(!allowed()||reply?.intent!=='unsupported')return reply;
 const headline='What would you like to check?',support='Choose one, or ask another way.';
 // Remove the unrelated Plan redirect from this fallback, while keeping the
 // saved period/category context and the original unsupported intent.
 const {action,route,secondaryAction,secondaryRoute,...rest}=reply;
 return {...rest,headline,support,text:headline+' '+support,clarityChoices:choices()};
};
const extra=L.chatExtraControls;
L.chatExtraControls=function(reply,index){
 const original=extra?.apply(this,arguments)||'';
 if(reply?.intent!=='unsupported'||!Array.isArray(reply.clarityChoices))return original;
 const supported=new Set(['spend','story','budget']);
 const buttons=reply.clarityChoices.filter(c=>supported.has(c?.id)).map(c=>B(E(c.label),`L.hibiscusChatClarity.choose(${Number(index)},${E(JSON.stringify(c.id))})`,'chip chat-clarify-choice')).join('');
 return original+(buttons?`<div class="chips chat-clarify-choices" role="group" aria-label="Choose what Lumo should check">${buttons}</div>`:'');
};
function choose(index,id){
 if(!allowed()||L.route!=='chat'||L.taskSheet?.active||!Number.isSafeInteger(index)||index<0)return false;
 const reply=L.state.chats?.[index];
 if(reply?.intent!=='unsupported'||!reply.clarityChoices?.some(c=>c.id===id))return false;
 // A choice asks a normal question or starts the existing, resumable Budget
 // guide. It never creates a payment draft or approves a movement of money.
 if(id==='spend')return L.hibiscusChat.ask('Can I afford this?');
 if(id==='story')return L.hibiscusChat.ask('Where did my money go?');
 if(id==='budget')return L.budgetGuide.start({mode:'create'});
 return false;
}
L.hibiscusChatClarity=Object.freeze({choose});
})();
