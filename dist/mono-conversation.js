/* Monochrome Home starts a useful conversation from recorded money facts.
   Illustrations and prompts add no financial authority or automatic action. */
(()=>{
'use strict';
if(!window.L||L.monoConversation)return;
const E=L.e,M=L.money;
const GOAL_QUESTION='How close am I to my savings goal?';
const allowed=()=>!!L.state?.onboarded&&!L.state.locked&&!L.state.closed;
const cash=value=>{const amount=Number(value);return Number.isFinite(amount)?Math.round(Math.max(0,amount)*100)/100:0;};
const visible=()=>allowed()&&!String(L.privateMoney?.('available',0)||'money-mask').includes('money-mask');
const dateTick=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return null;const tick=Date.parse(value+'T00:00:00Z');return Number.isFinite(tick)&&new Date(tick).toISOString().slice(0,10)===value?tick:null;};
const goals=()=>((L.state.goals||[]).filter(g=>g&&!g.archived&&!g.deleted&&Number(g.target)>0&&cash(g.allocated)<cash(g.target))).slice().sort((a,b)=>
 (dateTick(a.date)??Infinity)-(dateTick(b.date)??Infinity)||cash(b.allocated)/cash(b.target)-cash(a.allocated)/cash(a.target)||String(a.id).localeCompare(String(b.id)));
const selectedGoal=()=>{const goal=allowed()?goals()[0]:null;return goal?{...goal}:null;};
function current(){
 if(!allowed())return null;
 // Account migration/coverage helpers receive copies. Choosing a question
 // must never repair, save or move the customer's money as a side effect.
 const state=L.state,facts={...state,profile:{...state.profile},goals:(state.goals||[]).map(g=>({...g})),txs:(state.txs||[]).map(t=>({...t})),essentials:(state.essentials||[]).map(c=>({...c}))};
 const account=L.accountBalances?.(facts)||{available:cash(facts.balance)},outlook=L.spendingOutlook?.summary?.({state:facts});
 const costs=facts.essentials.filter(c=>c&&!c.archived&&!c.deleted&&Number(c.amount)>0);
 if(!costs.length||outlook?.gap>0||account.available<=0)return {kind:'affordability',art:'affordability',question:'What can I spend without getting caught short?',chatQuestion:'How much can I spend?',insight:outlook?.gap>0?`${M(cash(outlook.gap))} of your planned costs is uncovered.`:account.available<=0?'No Everyday money is available right now.':'Start with the costs your money needs to cover.',detail:''};
 const week=L.spendingSummary?.({days:7})||{total:0,txs:[]};
 const goal=goals()[0],goalPrompt=()=>({kind:'goal',art:'goal',question:'What’s left to save?',chatQuestion:GOAL_QUESTION,goalId:goal.id,insight:`${String(goal.name||'Your Money Box')} · ${Math.min(100,Math.floor(cash(goal.allocated)/cash(goal.target)*100))}% saved.`,detail:`${M(cash(cash(goal.target)-cash(goal.allocated)))} to go.`});
 // A real near/overdue goal date is more relevant than a repeated daily-guide
 // prompt. This changes salience only; it makes no prediction about saving.
 if(goal&&dateTick(goal.date)!==null&&dateTick(goal.date)<=Date.now()+14*86400000)return goalPrompt();
 // Use recent spending as context for the supported Budget-based daily
 // guide. This is not a forecast from an observed spending pace.
 const days=new Set(week.txs.map(t=>new Date(t.date).toISOString().slice(0,10)));
 if(week.txs.length>=3&&days.size>=3&&week.total>0)return {kind:'runway',art:'runway',question:'What can I spend each day?',chatQuestion:'What is my daily spending guide?',insight:`${M(cash(week.total))} paid out in the last 7 days.`,detail:''};
 if(goal)return goalPrompt();
 if(week.total>0)return {kind:'spending',art:'spending',question:'Where did my money go?',chatQuestion:'Where did my money go in the last 7 days?',insight:`${M(cash(week.total))} paid out in the last 7 days.`,detail:''};
 return {kind:'affordability',art:'affordability',question:'What can I spend a day?',chatQuestion:'What is my daily spending guide?',insight:outlook?.status==='ended'?'Your Budget dates need a review.':`${M(cash(outlook?.room??account.available))} left after planned costs.`,detail:''};
}
function illustration(kind){
 const scene=['goal','runway','spending','affordability'].includes(kind)?kind:'affordability';
 const [x,y,r]={goal:[1310.5,470.5,24],runway:[1185.5,337.5,22],spending:[1094,442.5,29],affordability:[1348,464.5,24]}[scene];
 const signal=`<svg class="mono-campus-signal" viewBox="0 0 1774 887" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><circle class="mono-campus-pulse" cx="${x}" cy="${y}" r="${r}"/></svg>`;
 return `<img class="mono-campus-scene" data-conversation-scene="${scene}" src="/assets/ask-lumo-campus-immersive/${scene}.webp" alt="" decoding="async" fetchpriority="high">${signal}`;
}
function card(){
 const prompt=current();if(!prompt)return '';
 return `<section class="account-card mono-conversation-card" data-conversation-kind="${prompt.kind}" aria-label="Ask Lumo"><button type="button" class="mono-conversation-open" onclick="L.monoConversation.open()"><span class="mono-conversation-art" aria-hidden="true">${illustration(prompt.art)}</span><span class="mono-conversation-copy"><span class="mono-conversation-eyebrow"><span class="mono-lumo-avatar" aria-hidden="true"><img src="/brand/lumo-avatar-icon-192.png" alt="" width="192" height="192" decoding="async"></span><span>Ask Lumo</span></span><strong class="mono-conversation-insight" data-mono-conversation-insight>${insightMarkup(prompt)}</strong><span class="mono-conversation-question">${E(prompt.question)}</span></span></button></section>`;
}
function insightMarkup(prompt){
 if(!prompt||!visible())return '<span class="money-mask" aria-label="Insight hidden"><span aria-hidden="true">•••••</span></span>';
 return E(prompt.insight)+(prompt.detail?`<span class="mono-conversation-insight-detail">${E(prompt.detail)}</span>`:'');
}
function syncPrivacy(){
 const prompt=current();
 for(const element of document.querySelectorAll('[data-mono-conversation-insight]'))element.innerHTML=insightMarkup(prompt);
}
function open(){
 if(!allowed()||L.route!=='home'||L.taskSheet?.active||L.contextualChat?.current?.()||L.budgetGuide?.active?.())return false;
 const prompt=current();if(!prompt)return false;
 L.openBankingChat();if(L.route!=='chat'||L.taskSheet?.active)return false;
 const field=document.getElementById('chatText');if(!field)return false;
 const draft=field.value||'',count=(L.state.chats||[]).length;
 L.hibiscusChat.ask(prompt.chatQuestion);
 const composer=document.getElementById('chatText');
 if(draft&&composer){composer.value=draft;L.captureFormDraft?.();}
 return (L.state.chats||[]).length===count+1;
}
L.monoConversation=Object.freeze({current,card,open,visible,selectedGoal,syncPrivacy});
})();
