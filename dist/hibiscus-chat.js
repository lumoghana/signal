/* The collection's Ask Lumo space, using the working conversation and ledger.
   This layer presents saved facts. It does not infer missing costs or move money. */
(()=>{
'use strict';
if(!window.L||L.hibiscusChat)return;
const E=L.e,M=L.money,B=L.btn;
const tabs=new Set(['home','pay','plan','more']);
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const today=()=>new Date().toISOString().slice(0,10);
const dateValue=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;
 const n=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n:null;
};
const dateLabel=value=>new Date(value+'T12:00:00Z').toLocaleDateString('en-GH',{weekday:'short',day:'numeric',month:'short',timeZone:'Africa/Accra'});
const greeting=()=>{
 const hour=new Date().getUTCHours(),period=hour<12?'Morning':hour<18?'Afternoon':'Evening';
 const name=String(L.state.profile?.displayName||L.state.profile?.name||'there').trim().split(/\s+/)[0]||'there';
 return `${period}, ${name}`;
};
const js=value=>E(JSON.stringify(value));
const card=(label,headline,support,action,extra='',kind='')=>`<button type="button" class="hibiscus-chat-insight${kind?' hibiscus-chat-insight-'+kind:''}" onclick="${action}"><span class="hibiscus-chat-insight-label">${E(label)}</span><strong>${E(headline)}</strong>${extra}<span class="hibiscus-chat-insight-support">${E(support)}</span>${L.icon('chevron',17)}</button>`;
function feed(){
 const position=L.pauseEngine?.planPosition?.({amount:0,fee:0},L.state);
 const costs=(L.state.essentials||[]).filter(x=>x&&!x.deleted&&!x.archived&&dateValue(x.date)!==null).map(x=>({item:x,remaining:Number(position?.essentials?.find(c=>c.id===x.id)?.before)||0})).filter(x=>x.remaining>0).sort((a,b)=>String(a.item.date).localeCompare(String(b.item.date)));
 const due=costs[0],budget=L.budgetStateSummary?.(),b=L.balances();
 let insight;
 if(budget?.ended){
  insight=card('Worth a look','Your Budget period has ended.','Review the dates before your next payment.',"L.openTab('plan')",'','budget');
 }else if(b.gap>0){
  insight=card('Worth a look',`${M(b.gap)} of your Budget is uncovered.`,'See which saved costs need attention.',"L.openTab('plan')",'','budget');
 }else if(due){
  const overdue=due.item.date<today();
  insight=card(overdue?'Worth a look':'Coming up',`${due.item.name} · ${M(due.remaining)}`,`${overdue?'Saved date was':'Due'} ${dateLabel(due.item.date)}. In your Budget.`,`L.openDueBudgetCost(${js(due.item.id)})`,'','budget');
 }else if(!budget?.hasBudget){
  insight=card('Start here','What must your money cover?','We can build a Budget together.',"L.budgetGuide.start({mode:'create'})",'','budget');
 }else{
  const week=L.spendingSummary?.({days:7})||{total:0};
  insight=card('Your money story',Number(week.total)>0?`${M(week.total)} paid out in the last 7 days.`:'No completed payments in the last 7 days.','Ask where it went, or check your next spend.',"L.hibiscusChat.ask('What did I spend in the last 7 days?')",'','spending');
 }
 const questions=['Can I spend GH₵80?','Where did my money go?','How long will my money last?'];
 return `<div class="hibiscus-chat-feed"><div class="hibiscus-chat-feed-greeting"><span class="hibiscus-chat-hello">${E(greeting())}.</span><h2>Ask your money.</h2><p>Make sense of a spend. Talk through a plan.</p></div>${insight}<div class="hibiscus-chat-starters" role="group" aria-label="Questions to get started">${questions.map(q=>`<button type="button" onclick="L.hibiscusChat.ask(${js(q)})">${E(q)}${L.icon('arrowUp',16)}</button>`).join('')}</div><p class="hibiscus-chat-data-note">Based on your saved Lumo information.</p></div>`;
}
function header(){
 const context=L.contextualChat?.current?.();
 const history=B(L.icon('receipt',21),"L.go('hibiscusChatHistory')",'hibiscus-chat-history').replace('<button ','<button aria-label="Conversation history" aria-haspopup="dialog" ');
 const actions=B(L.icon('grid',19),'L.openChatBankingActions()','chat-banking-actions').replace('<button ','<button aria-label="Chat actions" aria-haspopup="dialog" ');
 if(context){
  const back=B(`${L.icon('arrowLeft',19)}<span>${E(context.returnLabel)}</span>`,'L.contextualChat.returnToTask()','chat-banking-back contextual-chat-return hibiscus-chat-context').replace('<button ',`<button data-context-return aria-label="${E(context.returnLabel)}" `);
  return `<header class="chat-banking-header hibiscus-chat-header has-context-return">${back}<span class="hibiscus-chat-header-title">Ask Lumo</span>${actions}</header>`;
 }
 const b=L.balances(),has=L.hasMeaningfulPlan?.(),tab=tabs.has(L.hibiscusLastTab)?L.hibiscusLastTab:'home',name={home:'Home',pay:'Pay',plan:'Plan',more:'You'}[tab];
 const value=has?b.room:b.available,kind=has?'room':'available';
 const amount=L.privateMoney?.(kind,value)||M(value);
 const back=B(`${L.icon('arrowLeft',19)}`,'L.closeBankingChat()','chat-banking-back hibiscus-chat-app-return').replace('<button ',`<button aria-label="Back to ${E(name)}" `);
 return `<header class="chat-banking-header hibiscus-chat-header">${back}<span class="hibiscus-chat-header-title">Ask Lumo</span><div class="hibiscus-chat-header-actions">${history}${actions}</div><span id="hibiscus-chat-return-kind" class="sr-only">${has?'Left after Budget':'Available balance'}</span><span id="hibiscus-chat-return-amount" class="sr-only">${amount}</span></header>`;
}
const view=L.views.chat;
L.views.chat=function(...args){
 let html=view.apply(this,args);if(!allowed())return html;
 html=html.replace('<section class="chat-workspace','<section class="hibiscus-chat-workspace chat-workspace');
 html=html.replace(/<header class="chat-banking-header">[\s\S]*?<\/header>/,header());
 // Keep a real accessible screen title without retaining the large introductory
 // artwork in the reading area. The feed owns its own compact greeting.
 html=html.replace(/<div class="page-heading chat-banking-intro">[\s\S]*?(?=<div id="chat-thread")/,'<div class="hibiscus-chat-screen-title sr-only"><h1>Ask your money.</h1></div>');
 const empty=!(L.state.chats||[]).length&&!L.budgetGuide?.active?.();
 if(empty){
  html=html.replace(/(<div id="chat-thread"[^>]*>)[\s\S]*?(<\/div>)(?=<div class="chat-tools">)/,(_,open,close)=>open+feed()+close);
  html=html.replace('hibiscus-chat-workspace chat-workspace','hibiscus-chat-workspace hibiscus-chat-is-feed chat-workspace');
 }
 html=html.replace('placeholder="Ask your money…"','placeholder="Ask about your money…"');
 html=html.replace('Answers use your saved information.','Lumo explains. You decide and confirm every payment.');
 return html;
};
const HISTORY_PAGE=30,historyViews=new WeakMap();
function historyView(){let view=historyViews.get(L.state);if(!view){view={query:'',page:0};historyViews.set(L.state,view);}return view;}
function historyMatches(){const query=historyView().query.toLocaleLowerCase('en-GH');return (L.state.chats||[]).map((reply,index)=>({reply,index})).reverse().filter(({reply})=>!query||[reply.q,reply.headline,reply.text,reply.support].filter(Boolean).join(' ').toLocaleLowerCase('en-GH').includes(query));}
L.views.hibiscusChatHistory=()=>{
 if(!allowed())return `<section>${L.header('Conversation history')}<p>Sign in to see your saved conversation.</p></section>`;
 const chats=L.state.chats||[],state=historyView(),matches=historyMatches(),page=Math.min(state.page,Math.max(0,Math.ceil(matches.length/HISTORY_PAGE)-1)),start=page*HISTORY_PAGE;
 const form=`<form class="chat-history-search" onsubmit="event.preventDefault();L.hibiscusChat.searchHistory()"><label for="chatHistorySearch">Search questions and answers</label><div><input id="chatHistorySearch" name="chatHistorySearch" type="search" maxlength="80" value="${E(state.query)}" placeholder="Find a question" autocomplete="off"><button type="submit" class="secondary">Search</button></div>${state.query?B('Clear search','L.hibiscusChat.clearHistorySearch()','text-btn'):''}</form>`;
 const pages=matches.length>HISTORY_PAGE?`<div class="chat-thread-pages" role="group" aria-label="History pages">${page?B('Newer questions',"L.hibiscusChat.historyPage(-1)",'text-btn'):''}<span class="small muted">${start+1}–${Math.min(matches.length,start+HISTORY_PAGE)} of ${matches.length}</span>${start+HISTORY_PAGE<matches.length?B('Older questions',"L.hibiscusChat.historyPage(1)",'text-btn'):''}</div>`:'';
 return `<section class="hibiscus-chat-history-page">${L.header('Your conversation.','Saved in this browser. Latest questions first.')}${form}<p class="small muted" role="status">${matches.length} ${state.query?'matching ':''}question${matches.length===1?'':'s'}</p>${pages}<ol class="hibiscus-chat-history-list">${matches.slice(start,start+HISTORY_PAGE).map(({reply,index})=>`<li>${L.row(reply.q||'Money question',L.chatSnapshotStatus?.(reply)||reply.answerDateLabel||'Saved answer · Open in conversation','chat',`L.hibiscusChat.openSaved(${index})`)}</li>`).join('')||`<li><strong>${chats.length?'No matching questions.':'No questions yet.'}</strong><p>${chats.length?'Try another word or clear the search.':'Your questions and Lumo’s answers stay here.'}</p></li>`}</ol>${pages}<div class="actions">${B('Back to conversation','L.closeTask()')}</div></section>`;
};
L.taskSheet?.register?.('hibiscusChatHistory',{family:'records',treatment:'detail',label:'Conversation history'});
const close=L.closeBankingChat;
L.closeBankingChat=function(...args){
 // The contextual controller remains the authority for a suspended payment,
 // breakdown or protected box. Ordinary Chat returns to the last main tab.
 if(L.contextualChat?.current?.()&&L.route==='chat')return close.apply(this,args);
 if(allowed()&&L.route==='chat'&&!L.taskSheet?.active)return L.openTab(tabs.has(L.hibiscusLastTab)?L.hibiscusLastTab:'home');
 return close.apply(this,args);
};
L.hibiscusChat={
 ask(question){if(!allowed()||L.route!=='chat'||L.taskSheet?.active)return false;const field=document.getElementById('chatText');if(!field)return false;field.value=String(question||'').slice(0,500);return L.askChat();},
 searchHistory(){if(!allowed()||L.route!=='hibiscusChatHistory')return false;const state=historyView();state.query=String(document.getElementById('chatHistorySearch')?.value||'').trim().slice(0,80);state.page=0;L.render();document.getElementById('chatHistorySearch')?.focus?.({preventScroll:true});return true;},
 clearHistorySearch(){if(!allowed()||L.route!=='hibiscusChatHistory')return false;historyViews.set(L.state,{query:'',page:0});L.render();document.getElementById('chatHistorySearch')?.focus?.({preventScroll:true});return true;},
 historyPage(direction){if(!allowed()||L.route!=='hibiscusChatHistory'||![-1,1].includes(direction))return false;const state=historyView(),total=historyMatches().length,page=Math.max(0,Math.min(Math.max(0,Math.ceil(total/HISTORY_PAGE)-1),state.page+direction));if(page===state.page)return false;state.page=page;L.render();return true;},
 openSaved(index){
  if(!allowed()||L.route!=='hibiscusChatHistory'||!Number.isSafeInteger(index)||index<0)return false;
  const account=L.state,reply=account.chats?.[index];if(!reply)return false;
  const changedWindow=L.chatThreadWindow?.ensure(index);
  // Closing restores the retained conversation and unsent composer. Focus only
  // after the sheet has restored its own trigger, including deferred history.
  if(L.taskSheet?.parentRoute==='chat')L.closeTask();else L.openTab('chat');
  const jump=()=>{
   if(L.state!==account||!allowed()||L.route!=='chat'||L.taskSheet?.active||L.state.chats?.[index]!==reply)return;
   let turn=document.querySelector?.(`#chat-thread [data-chat-turn-index="${index}"]`);
   if(!turn&&changedWindow){const draft=document.getElementById('chatText')?.value||'';L.captureFormDraft?.();L.render();const field=document.getElementById('chatText');if(field)field.value=draft;L.captureFormDraft?.();turn=document.querySelector?.(`#chat-thread [data-chat-turn-index="${index}"]`);}
   if(!turn)return;
   turn.focus?.({preventScroll:true});turn.scrollIntoView?.({block:'start',behavior:'auto'});
  };
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(jump);else setTimeout(jump,0);
  return true;
 },
 feed
};
})();
