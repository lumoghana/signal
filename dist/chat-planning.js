/* Bounded planning conversations. Suggestions remain editable; only an explicit
   Save changes planning information. No Chat path submits or authorises money. */
(()=>{
'use strict';
if(!window.L||L.chatPlanning)return;
const E=L.e,M=L.money,B=L.btn,DAY=86400000,TTL=15*60*1000;
const normal=v=>String(v||'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const costs=()=>(L.state.essentials||[]).filter(x=>x&&!x.archived&&!x.deleted&&Number(x.amount)>0);
const editable=()=>L.state.onboarded&&!L.state.locked&&!L.state.closed;
const plain=source=>({days:[7,30,90].includes(Number(source?.days))?Number(source.days):30,category:String(source?.category||'').slice(0,80)});
const currentContext=()=>plain(L.params);
const row=id=>costs().find(x=>x.id===id);
const position=()=>L.pauseEngine.planPosition({amount:0,fee:0},L.state);
const itemMark=x=>JSON.stringify([x,L.state.planHorizon,(L.state.txs||[]).filter(t=>t.essentialId===x?.id).map(t=>[t.id,t.status,t.amount])]);
const withinTime=p=>p&&Number.isFinite(Number(p.createdAt))&&Date.now()-p.createdAt<=TTL&&p.createdAt<=Date.now()+60000;
function matching(query){
 if(L.chatBudgetMatches)return L.chatBudgetMatches(query,costs());
 const q=' '+normal(query)+' ';
 return costs().filter(x=>[x.name,...String(x.name).split(/\s*(?:&|\/|\band\b)\s*/i)].map(normal).filter(s=>s.length>1).some(s=>q.includes(' '+s+' ')));
}
function amountIn(raw){
 if(/[$€£¥]|\b(?:USD|EUR|GBP|NGN|dollars?|euros?|pounds?|naira)\b/i.test(raw))return null;
 const tail=String(raw).match(/\b(?:to|at|be)\s+(?:(?:GH₵|GHS|₵)\s*)?([0-9][0-9,.]*)\s*(?:cedis?|GHS|GH₵|₵)?\s*[?.!]?$/i);
 if(!tail||/\b(?:about|around|roughly|between|or|plus)\b/i.test(raw))return null;
 const token=tail[1].replace(/\.$/,'');
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(token))return null;
 const amount=Number(token.replace(/,/g,''));return amount>=.01&&amount<=1000000?amount:null;
}
function relativeChange(raw,items=costs()){
 const text=String(raw||'').trim(),q=normal(text);
 if(!/\b(?:lower|reduce|decrease|cut|increase|raise)\b/.test(q)||!/\bby(?:\b|(?=\d))/.test(q))return null;
 if(/\b(?:dont|do not|not|never|without)\b/.test(q))return {cancelled:true};
 const match=text.match(/\b(lower|reduce|decrease|cut|increase|raise)\s+(.+?)\s+by\s*(?:(?:GH₵|GHS|₵)\s*)?([0-9][0-9,.]*)\s*(?:cedis?|GHS|GH₵|₵)?\s*[?.!]?$/i);
 if(!match||/[$€£¥]|\b(?:USD|EUR|GBP|NGN|dollars?|euros?|pounds?|naira|about|around|roughly|between|or)\b/i.test(text))return {error:'Use one exact change in Ghana cedis, for example “Lower Food by GH₵50”.'};
 const token=match[3].replace(/\.$/,'');
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(token)||Number(token.replace(/,/g,''))<=0||Number(token.replace(/,/g,''))>1000000)return {error:'Use a positive change in GH₵ with up to two decimal places.'};
 const label=match[2].trim().replace(/^(?:my|the)\s+/i,'').replace(/\s+(?:budget|item|cost|line)$/i,'').trim();
 const matches=L.chatBudgetMatches?L.chatBudgetMatches(label,items):items.filter(x=>normal(x.name)===normal(label));
 return {label,matches,delta:Number(token.replace(/,/g,'')),direction:/^(?:increase|raise)$/i.test(match[1])?1:-1};
}
const relativeAmount=(x,r)=>Math.round((Number(x.amount)+r.direction*r.delta)*100)/100;
const relativeValid=amount=>Number.isFinite(amount)&&amount>=.01&&amount<=1000000;
const makeReply=(headline,support,extra={})=>({headline,support,text:[headline,support].filter(Boolean).join(' '),context:currentContext(),...extra});
const previousAnswer=L.chatAnswer;
function itemAnswer(x,options={}){
 L.reconcileEssentialCoverage?.();
 const p=position(),v=p.essentials.find(c=>c.id===x.id),remaining=Number(v?.before)||0;
 const pending=(L.state.txs||[]).filter(t=>t.type==='out'&&t.status==='pending'&&t.essentialId===x.id).reduce((s,t)=>s+Number(t.amount||0),0);
 const covered=Math.min(Number(x.amount),Math.max(0,Number(x.paid)||0)),pendingCoverage=Math.min(pending,Math.max(0,Number(x.amount)-covered));
 const base=previousAnswer('What is left after my budget?',options),budget=L.budgetStateSummary?.();
 const headline=p.totalGap>0&&remaining>0?`${x.name} has ${M(remaining)} still to cover.`:`${M(remaining)} remains in ${x.name}.`;
 const support=[pending?`${M(pending)} is reserved for pending payments.`:'',p.totalGap?`${M(p.available)} is available in Everyday money. ${M(p.totalGap)} of your saved Budget is uncovered.`:`${M(p.room)} is left outside your saved Budget costs.`,budget?.ended?budget.qualifier:''].filter(Boolean).join(' ');
 return {...base,...makeReply(headline,support),intent:'plan',action:'See '+x.name,route:'chatBudgetItem',budgetItemId:x.id,
  calculation:{rows:[['Budget item',x.name],['Saved total',M(x.amount)],['Covered so far',M(covered)],['Pending payments',M(pending)],...(pending>pendingCoverage?[['Of pending, covering this Budget item',M(pendingCoverage)]]:[]),['Still to cover',M(remaining)],['Available Everyday money',M(p.available)],['Left after Budget',M(p.room)]],notes:['This Budget item is a planning commitment, not a separate account balance. Pending payments reserve funds until their result is known. The portion covering this item is capped at its unpaid saved cost. Only saved costs are included. Money Boxes are held separately in savings.']}};
}
function choiceReply(request,found){
 const choices=(found.length?found:costs()).map(x=>({id:x.id,name:x.name}));
 if(!choices.length)return makeReply('No Budget items are saved yet.','Start with one everyday cost so Lumo can check it separately.',{intent:'plan',action:'Create a Budget',route:'plan'});
 const planningChoice={...request,choices,...(request.kind==='relative'?{relativeMarks:Object.fromEntries(choices.map(c=>[c.id,itemMark(row(c.id))]))}:{}),createdAt:Date.now()};
 return makeReply('Which Budget item do you mean?','Choose the saved cost you want to check or edit.',{intent:'planningChoice',planningChoice,context:{...currentContext(),pendingPlanning:planningChoice}});
}
function editReply(x,amount,explanation=''){
 L.reconcileEssentialCoverage?.();
 const planningEdit={id:x.id,name:x.name,amount,mark:itemMark(x),createdAt:Date.now()};
 return makeReply(`Change ${x.name} to ${M(amount)}?`,[explanation,'Review the amount and its effect, then save. This does not move money.'].filter(Boolean).join(' '),{intent:'planningEdit',action:'Review Budget edit',route:'chatBudgetEdit',planningEdit});
}
function relativeReply(x,r){
 if((L.state.txs||[]).some(t=>t.type==='out'&&t.status==='pending'&&t.essentialId===x.id))return makeReply('A payment for this Budget item is pending.','Wait for its result before changing the total. Your Budget is unchanged.',{intent:'planningEdit',action:'Open Budget',route:'plan'});
 const amount=relativeAmount(x,r);
 if(!relativeValid(amount))return makeReply('That change needs a different total.',`Keep ${x.name} above GH₵0.00 and at or below GH₵1,000,000.00, or delete the item from your Budget.`,{intent:'planningEdit',action:'Open Budget',route:'plan'});
 return editReply(x,amount,`${M(x.amount)} ${r.direction>0?'+':'−'} ${M(r.delta)} = ${M(amount)}.`);
}
function parseDate(raw,now=Date.now()){
 const today=new Date(now).toISOString().slice(0,10),start=Date.parse(today+'T00:00:00Z'),q=normal(raw).replace(/^(?:on|its|it is|my allowance is due) /,'');
 let date=String(raw).trim().match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
 if(q==='today')date=today;
 if(q==='tomorrow')date=new Date(start+DAY).toISOString().slice(0,10);
 const weekday=q.match(/^(?:(next|this) )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
 if(weekday){const wanted=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(weekday[2]);let days=(wanted-new Date(start).getUTCDay()+7)%7;if(weekday[1]==='next'&&days===0)days=7;date=new Date(start+days*DAY).toISOString().slice(0,10);}
 if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const value=Date.parse(date+'T00:00:00Z');return Number.isFinite(value)&&new Date(value).toISOString().slice(0,10)===date&&date>=today?date:null;
}
const dateLabel=date=>new Date(date+'T12:00:00Z').toLocaleDateString('en-GH',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'});
function dateReply(date){return makeReply(`Expecting your allowance on ${dateLabel(date)}?`,'Save this expected date? It does not add money or guarantee how long your balance will last.',{intent:'planningDate',action:'Save expected date',route:'chatSaveDate',planningDate:{date,before:L.state.allowance?.date||'',createdAt:Date.now()}});}
L.chatAnswer=(question,options={})=>{
 const raw=String(question||'').trim().slice(0,500),q=normal(raw),pending=options.pendingPlanning??L.params?.pendingPlanning;
 if(withinTime(pending)&&pending.kind==='allowance-date'){
  const date=parseDate(raw,Number(options.now)||Date.now());if(date)return dateReply(date);
 }
 const relative=relativeChange(raw);
 if(relative){
  if(relative.cancelled)return makeReply('Your Budget is unchanged.','Tell me the change you want to review when you’re ready.',{intent:'planningCancelled'});
  if(relative.error)return makeReply('What change should I check?',relative.error,{intent:'planningEdit',action:'Open Budget',route:'plan'});
  if(relative.matches.length!==1)return choiceReply({kind:'relative',delta:relative.delta,direction:relative.direction},relative.matches);
  return relativeReply(relative.matches[0],relative);
 }
 if(/\b(?:spent|did i spend|have i spent|payments? to|paid to)\b/.test(q))return previousAnswer(question,options);
 const named=matching(raw),budgetWords=/\b(?:budget|cost|item)\b/.test(q);
 const edit=/\b(?:change|set|update|adjust|make)\b/.test(q)&&(budgetWords||named.length>0);
 if(edit&&/\b(?:dont|do not|not|never|without)\b/.test(q))return makeReply('Your Budget is unchanged.','Ask what remains in an item, or tell me the change you want to review.',{intent:'planningCancelled'});
 const ordinaryItem=named.length>0&&!/[0-9₵]/.test(raw)&&!/\b(?:can|could|should|would|may|buy|spend|pay|send|transfer)\b/.test(q)&&(/\b(?:left|remaining|remains|balance|available)\b/.test(q)||/\bhow much\b.*\b(?:money|have)\b/.test(q));
 const info=ordinaryItem||budgetWords&&(/\b(?:left|remaining|remains|covered|paid|balance|available)\b/.test(q)||/\bhow much\b/.test(q));
 const request=edit?{kind:'edit',amount:amountIn(raw)}:info?{kind:'item'}:null;
 if(request){
  const found=options.selectedBudgetId!==undefined?costs().filter(x=>x.id===options.selectedBudgetId):named;
  // A general Budget question retains its established whole-account answer.
  if(found.length||edit||/\b(?:my|the) .+ (?:budget|cost|item)\b/.test(q)&&!/^what.*(?:my budget|the budget)$/.test(q)&&!/after (?:my |the )?budget/.test(q)){
   if(edit&&request.amount===null)return makeReply('What total should this Budget item cover?','Use one positive amount in GH₵, for example “Change my Food budget to GH₵300”.',{intent:'planningEdit',action:'Open Budget','route':'plan'});
   if(found.length!==1)return choiceReply(request,found);
   return edit?editReply(found[0],request.amount):itemAnswer(found[0],options);
  }
 }
 // A short answer to an item clarification belongs only to that immediate turn.
 if(withinTime(pending)&&['item','edit','relative'].includes(pending.kind)&&!/\b(?:what|where|how|can|pay|send|spent|change)\b/.test(q)){
  const found=matching(raw);if(found.length===1&&pending.choices.some(c=>c.id===found[0].id))return pending.kind==='edit'?editReply(found[0],pending.amount):pending.kind==='relative'?pending.relativeMarks?.[found[0].id]===itemMark(found[0])?relativeReply(found[0],pending):makeReply('That Budget item changed.','Ask again before choosing a relative change.',{intent:'planningEdit'}):itemAnswer(found[0],options);
 }
 const reply=previousAnswer(question,options);
 if(reply.intent==='runway'&&!parseDate(L.state.allowance?.date,Number(options.now)||Date.now())){reply.context={...reply.context,pendingPlanning:{kind:'allowance-date',createdAt:Date.now()}};reply.action=L.state.allowance?.date?'Update expected date':'Choose expected date';reply.route='chatDatePicker';}
 return reply;
};
function append(q,reply){
 const draft=document.getElementById('chatText')?.value||'';
 (L.state.chats||=[]).push({q,...reply});L.params={...(reply.context||currentContext()),...(reply.lastAffordability?{lastAffordability:reply.lastAffordability}:{})};L.save();L.render();
 const input=document.getElementById('chatText');if(input)input.value=draft;L.captureFormDraft?.();L.announceChat?.(reply.text);return true;
}
const selected=index=>Number.isSafeInteger(index)&&index>=0?L.state.chats?.[index]:null;
L.chatChoosePlanning=(index,choiceIndex)=>{
 if(L.route!=='chat'||!editable())return false;
 const p=selected(index)?.planningChoice,c=Number.isSafeInteger(choiceIndex)&&p?.choices?.[choiceIndex];
 if(!withinTime(p)||!c||!row(c.id)){L.toast('That Budget item changed. Ask again for current information.');return false;}
 const x=row(c.id);if(p.kind==='relative'&&p.relativeMarks?.[x.id]!==itemMark(x)){L.toast('That Budget item changed. Ask again before editing.');return false;}const reply=p.kind==='edit'?editReply(x,p.amount):p.kind==='relative'?relativeReply(x,p):itemAnswer(x);
 return append(p.kind==='edit'?`Change ${x.name} to ${M(p.amount)}`:`Check ${x.name}`,reply);
};
const extraControls=L.chatExtraControls;
L.chatExtraControls=(reply,index)=>(extraControls?.(reply,index)||'')+(reply.planningChoice?`<div class="chips" role="group" aria-label="Choose a saved Budget item">${reply.planningChoice.choices.map((c,i)=>B(E(c.name),`L.chatChoosePlanning(${index},${i})`,'chip')).join('')}</div>`:'');
const openAnswer=L.chatOpenAnswer;
L.chatOpenAnswer=(index,secondary=false)=>{
 const reply=selected(index);if(!reply)return false;
 if(!secondary&&reply.route==='chatBudgetItem'){
  if(!editable()||!row(reply.budgetItemId)){L.toast('That Budget item is no longer available.');return false;}
  return L.go('essentialEdit',{id:reply.budgetItemId});
 }
 if(!secondary&&reply.route==='chatBudgetEdit'){
  const p=reply.planningEdit,x=row(p?.id);
  if(!editable()||!withinTime(p)||!x||p.mark!==itemMark(x)){L.toast('That Budget item changed or the suggestion expired. Ask again before editing.');return false;}
  return L.go('essentialEdit',{id:x.id,chatBudgetIndex:index,chatBudgetCreated:p.createdAt});
 }
 if(!secondary&&reply.route==='chatSaveDate')return L.saveChatExpectedDate(index);
 if(!secondary&&reply.route==='chatDatePicker'){
  if(!editable())return false;return L.go('chatExpectedDate',{before:L.state.allowance?.date||''});
 }
 return openAnswer(index,secondary);
};
const proposal=()=>{const p=selected(L.params.chatBudgetIndex)?.planningEdit;return p&&p.id===L.params.id&&p.createdAt===L.params.chatBudgetCreated?p:null;};
const essentialView=L.views.essentialEdit;
L.views.essentialEdit=function(...args){
 const html=essentialView.apply(this,args),p=proposal();if(!p)return html;
 const field=id=>html.match(new RegExp('<label\\b[^>]*\\bfor="'+id+'"[^>]*>[\\s\\S]*?<\\/label>'))?.[0]||'';
 const amount=field('essAmount').replace(/(\bvalue=")[^"]*(")/,(_,a,b)=>a+E(p.amount)+b),x=row(p.id);
 if(!amount||!x)return html;
 const coverage=html.match(/<dl class="essential-coverage"[\s\S]*?<\/dl>/)?.[0]||'';
 return `<section class="chat-budget-edit"><h1>Change ${E(x.name)}.</h1><p class="small muted">Current saved total: ${M(x.amount)}. Review your change below.</p><form class="root-form" onsubmit="event.preventDefault();L.saveEssential()">${amount}<p class="small muted">Total for the whole period, including what’s covered.</p>${B('Help me estimate','L.openBudgetEstimate()','text-btn budget-estimate-open')}<p class="small notice" id="chat-budget-projection" role="status" aria-live="polite"></p><div id="error" role="alert"></div><div class="actions"><button type="submit" class="primary">Save budget item</button>${B('Back to conversation','L.closeTask()','text-btn')}</div><details class="optional-fields"><summary>Name, date &amp; current coverage</summary>${field('essName')}${field('essDate')}${coverage}${B('Mark paid outside Lumo','L.markExternalEssential()','secondary')}${B('Remove from budget','L.removeEssential()','text-btn')}</details></form><p class="small muted">Saving a Budget item does not pay anyone or move money.</p></section>`;
};
L.refreshChatBudgetProjection=()=>{
 const target=document.getElementById('chat-budget-projection'),x=row(L.params.id);if(!target||!x)return;
 const raw=L.value('essAmount'),amount=Number(raw);
 if(!raw||!Number.isFinite(amount)||amount<=0||amount>1000000||Math.abs(amount*100-Math.round(amount*100))>.000001){target.textContent='Enter a positive Budget total with up to two decimal places.';return;}
 const candidate={...L.state,essentials:L.state.essentials.map(c=>c.id===x.id?{...c,amount,paid:Math.min(amount,Number(c.paid)||0)}:c)},p=L.pauseEngine.planPosition({amount:0,fee:0},candidate);
 target.textContent=`If saved: ${p.totalGap?M(p.totalGap)+' of your Budget would be uncovered.':M(p.room)+' left after Budget.'} No money moves.`;
};
const render=L.render;
L.render=function(...args){const r=render.apply(this,args);if(L.route==='essentialEdit')L.refreshChatBudgetProjection();return r;};
document.addEventListener('input',event=>{if(event.target?.id==='essAmount'&&L.route==='essentialEdit')L.refreshChatBudgetProjection();});
const saveEssential=L.saveEssential;
L.saveEssential=function(...args){
 const p=proposal();if(!p)return saveEssential.apply(this,args);
 const x=row(p.id);if(!editable()||!withinTime(p)||!x||p.mark!==itemMark(x))return L.error('This Budget item changed. Close this edit and ask again for current figures.','essAmount');
 const result=saveEssential.apply(this,args);
 if(L.route!=='essentialEdit'){
  if(L.taskSheet?.active)L.closeTask();else L.openTab('chat');
  append('Saved '+(row(p.id)?.name||p.name)+' Budget',itemAnswer(row(p.id)));
 }
 return result;
};
function saveDate(date,before){
 if(!editable()||!parseDate(date))return L.error('Choose today or a future expected date.','chat-expected-date');
 if((L.state.allowance?.date||'')!==before)return L.error('Your expected date changed. Close this edit and check it again.','chat-expected-date');
 L.state.allowance={...L.state.allowance,date};L.save();if(L.taskSheet?.active)L.closeTask();
 return append('Expected allowance: '+dateLabel(date),L.chatAnswer('How long will my money last?',{}));
}
L.saveChatExpectedDate=index=>{
 const p=selected(index)?.planningDate;if(!withinTime(p))return L.toast('This date suggestion expired. Ask again.');
 return saveDate(p.date,p.before);
};
L.views.chatExpectedDate=()=>`<section>${L.header('When is your next allowance expected?','An expected date, not money received.')}<form onsubmit="event.preventDefault();L.saveChatDateField()">${L.field('Expected date','chat-expected-date','','date',L.params.before||'').replace('<input ',`<input min="${new Date().toISOString().slice(0,10)}" required `)}<p class="small muted">This does not add money or promise that your balance will last until this date.</p><div id="error" role="alert"></div><div class="actions"><button class="primary" type="submit">Save expected date</button>${B('Cancel','L.closeTask()','text-btn')}</div></form></section>`;
L.saveChatDateField=()=>saveDate(L.value('chat-expected-date'),L.params.before||'');
L.taskSheet?.register('chatExpectedDate',{family:'plan',treatment:'edit',label:'Expected allowance'});
L.chatPlanning={parseDate,relativeChange};
})();
