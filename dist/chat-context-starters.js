/* The first Chat starter responds to saved costs and dates. It suggests an
   existing task or question; opening Chat never sends a question or money. */
(()=>{
'use strict';
if(!window.L||L.chatContextStarters)return;
const E=L.e,DAY=86400000;
const allowed=state=>!!state?.onboarded&&!state.locked&&!state.closed;
const dateValue=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return null;
 const tick=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(tick)&&new Date(tick).toISOString().slice(0,10)===value?tick:null;
};
function suggestion(state=L.state,now=Date.now()){
 if(!allowed(state))return null;
 const tick=Number.isFinite(Number(now))?Number(now):Date.now();
 // Reconcile only a copy. Asking what to suggest must not repair or change
 // the customer's saved financial records as a side effect.
 const facts={...state,essentials:(state.essentials||[]).map(item=>({...item}))};
 L.reconcileEssentialCoverage?.(facts);
 const costs=facts.essentials.filter(item=>item&&!item.archived&&!item.deleted&&Number(item.amount)>0);
 if(!costs.length)return state.planDraft
  ?{kind:'continue-budget',label:'Continue my Budget'}
  :{kind:'build-budget',label:'Build my Budget'};
 const outlook=L.spendingOutlook?.summary?.({state:facts,now:tick});
 const position=L.pauseEngine?.planPosition?.({amount:0,fee:0},facts);
 if((outlook?.gap??position?.totalGapBefore??0)>0)return {kind:'budget-gap',label:'Review my Budget gap'};
 const horizon=facts.planHorizon||{},end=dateValue(horizon.date),today=dateValue(new Date(tick).toISOString().slice(0,10));
 if(outlook?.status==='ended'||end!==null&&end<today)return {kind:'review-dates',label:'Review my Budget dates'};
 if(outlook?.status==='changed-allowance'||horizon.mode==='allowance'&&horizon.date!==(facts.allowance?.date||''))return {kind:'review-dates',label:'Review my Budget dates'};
 if(outlook?.status==='allowance-due')return {kind:'expected-money',label:'Review my expected money'};
 if(outlook?.status==='missing-period'||!['date','allowance'].includes(horizon.mode)||end===null)return {kind:'choose-dates',label:'Choose my Budget dates'};
 const due=costs.map(item=>({item,date:dateValue(item.date),remaining:position?.essentials?.find(cost=>cost.id===item.id)?.before||0}))
  .filter(cost=>cost.date!==null&&cost.date<=today+3*DAY&&cost.remaining>0)
  .sort((a,b)=>a.date-b.date||String(a.item.name).localeCompare(String(b.item.name)))[0];
 if(due)return {kind:'due-cost',label:'Review '+String(due.item.name||'my upcoming cost').slice(0,60),costId:due.item.id};
 return {kind:'daily-guide',label:'What can I spend a day?',question:'What is my daily spending guide?'};
}
function activate(){
 if(!allowed(L.state)||L.route!=='chat'||L.taskSheet?.active)return false;
 // Re-check on tap. A retained starter must not act on dates or a cost that
 // has changed since this screen was rendered.
 const next=suggestion();if(!next)return false;
 if(next.kind==='build-budget')return L.budgetGuide?.start({mode:'create'})??false;
 if(next.kind==='continue-budget')return L.budgetGuide?.resume()??false;
 if(next.kind==='budget-gap'){L.go('makeRoom');return true;}
 if(next.kind==='review-dates'||next.kind==='choose-dates'){L.go('planPeriod');return true;}
 if(next.kind==='expected-money'){L.go('allowance');return true;}
 if(next.kind==='due-cost')return L.openDueBudgetCost?.(next.costId)??false;
 return L.hibiscusChat?.ask(next.question)??false;
}
function decorate(html){
 if(!allowed(L.state))return html;
 const next=suggestion();if(!next)return html;
 return html.replace(/(<div\b[^>]*class="[^"]*\bhibiscus-chat-starters\b[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/,(_,open,content,close)=>
  open+content.replace(/<button\b[^>]*>[\s\S]*?<\/button>/,`<button type="button" data-chat-context-starter onclick="L.chatContextStarters.activate()">${E(next.label)}${L.icon('arrowUp',16)}</button>`)+close);
}
const chat=L.views.chat;
if(chat)L.views.chat=function(...args){return decorate(chat.apply(this,args));};
const feed=L.hibiscusChat?.feed;
if(feed)L.hibiscusChat.feed=function(...args){return decorate(feed.apply(this,args));};
L.chatContextStarters=Object.freeze({suggestion,activate});
})();
