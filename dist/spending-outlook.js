/* A dated guide for money outside the saved Budget. This projects no income,
   submits no money and never treats planned food as extra spending. */
(()=>{
'use strict';
if(!window.L||L.spendingOutlook)return;
const E=L.e,M=L.money,B=L.btn,DAY=86400000;
const cash=n=>Math.round(Math.max(0,Number(n)||0)*100)/100;
const dateValue=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;const n=Date.parse(value+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n:null;};
const iso=now=>new Date(now).toISOString().slice(0,10);
const label=value=>new Date(value+'T12:00:00Z').toLocaleDateString('en-GH',{day:'numeric',month:'short',year:'numeric',timeZone:'Africa/Accra'});
const allowed=state=>!!state?.onboarded&&!state.locked&&!state.closed;
// Reconcile a cloned cache through the core ledger authority. Advice must not
// mutate even a stale loaded record while preparing its current projection.
function snapshot(state){
 const copy={...state,essentials:(state.essentials||[]).map(item=>({...item}))};L.reconcileEssentialCoverage?.(copy);return copy;
}
function summary({now=Date.now(),state=L.state}={}){
 if(!allowed(state))return {status:'unavailable',ready:false,headline:'Sign in to see your spending outlook.',support:'Your saved money information stays private.'};
 const tick=Number.isFinite(Number(now))?Number(now):Date.now(),today=iso(tick),start=dateValue(today),facts=snapshot(state),p=L.pauseEngine.planPosition({amount:0,fee:0},facts),h=state.planHorizon||{},end=dateValue(h.date);
 const common={ready:false,start:today,available:p.available,budget:p.essentialsBefore,room:p.room,gap:p.totalGap,savingsSeparate:state.accounts?.version===2,hasBudget:(state.essentials||[]).some(x=>x&&!x.archived&&!x.deleted&&Number(x.amount)>0)};
 if(!common.hasBudget)return {...common,status:'no-budget',headline:'Start with the costs this money needs to cover.',support:'Save a Budget before using a daily amount as a guide.',route:'plan',action:'Create a Budget'};
 if(p.totalGap>0)return {...common,status:'gap',headline:`${M(p.totalGap)} of your Budget is uncovered.`,support:'Cover or review those saved costs before planning money for extras.',route:'makeRoom',action:'Review your options'};
 if(!['date','allowance'].includes(h.mode)||end===null)return {...common,status:'missing-period',headline:'How long should this money cover?',support:'Choose the period for your saved Budget to see a daily guide for extras.',route:'planPeriod',action:'Choose Budget dates'};
 if(end<start)return {...common,status:'ended',headline:'Your Budget period has ended.',support:'Review its dates and costs before using another daily guide.',route:'planPeriod',action:'Review Budget dates'};
 if(h.mode==='allowance'&&h.date!==(state.allowance?.date||''))return {...common,status:'changed-allowance',headline:'Your expected allowance date has changed.',support:'Review your Budget period so the dates agree. No expected money has been included.',route:'planPeriod',action:'Review Budget dates'};
 const days=Math.round((end-start)/DAY)+(h.mode==='date'?1:0);
 if(days<1)return {...common,status:'allowance-due',headline:'Your allowance is expected today.',support:'Only money already available can be spent. Review the date if the money has not arrived.',route:'allowance',action:'Review expected money'};
 const last=iso(end-(h.mode==='allowance'?DAY:0)),roomCents=Math.round(p.room*100),dailyCents=Math.floor(roomCents/days),perDay=dailyCents/100,remainder=(roomCents-dailyCents*days)/100;
 const period=`${label(today)} to ${label(last)}`,headline=`${M(p.room)} for extras over ${days} ${days===1?'day':'days'}.`,daily=`About ${M(perDay)} a day.`,support=`Your saved Budget stays covered. Other costs may be missing.`;
 return {...common,status:'ready',ready:true,end:h.date,last,mode:h.mode,days,perDay,remainder,period,headline,daily,support,
  counting:h.mode==='allowance'?'Includes today and ends the day before your expected allowance.':'Includes today and the last day of your saved Budget period.',
  allowanceDate:dateValue(state.allowance?.date)!==null?state.allowance.date:'',route:'spendingOutlook',action:'See spending outlook'};
}
const canOpen=()=>allowed(L.state);
const revealed=()=>!L.privateMoney?.('room',0)?.includes('money-mask');
const lineContent=()=>{
 const s=summary();
 if(!revealed())return `After saved costs · See daily guide ${L.icon('chevron',14)}`;
 return s.ready?`<span class="outlook-daily-value">${M(s.perDay)}/day</span> for extras ${L.icon('chevron',14)}`:`${E(s.status==='missing-period'?'After saved costs · Add dates for a daily guide':'Saved costs · Review your spending outlook')} ${L.icon('chevron',14)}`;
};
L.views.spendingOutlook=()=>{
 const s=summary();if(!canOpen())return `<section>${L.header('Spending outlook')}<p>Sign in to see your saved information.</p></section>`;
 const ready=s.ready?`<div class="outlook-conclusion"><span>A day for extras</span><h1>${M(s.perDay)}</h1><p>${E(s.headline)}</p></div><p class="outlook-period">${E(s.period)}</p><p>${E(s.support)}</p><details class="optional-fields"><summary>See calculation</summary><dl class="outlook-calculation"><div><dt>Available Everyday money</dt><dd>${M(s.available)}</dd></div><div><dt>Saved Budget still to cover</dt><dd>${M(s.budget)}</dd></div><div><dt>Left for extras</dt><dd>${M(s.room)}</dd></div><div><dt>Remaining days</dt><dd>${s.days}</dd></div><div><dt>Daily guide, rounded down</dt><dd>${M(s.perDay)}</dd></div>${s.remainder?`<div><dt>Rounding remainder</dt><dd>${M(s.remainder)}</dd></div>`:''}</dl><p class="small muted">${E(s.counting)} ${s.remainder?`${M(s.perDay)} × ${s.days} days leaves ${M(s.remainder)} from rounding. `:''}Saved food, transport and other Budget costs are already deducted. ${s.savingsSeparate?'Money Boxes are separate savings. ':''}Expected allowance is excluded until it arrives. This is a guide, not a promise that money will last.</p>${B('See full balance breakdown',"L.go('balances')",'text-btn')}</details><div class="actions outlook-actions">${B('Done','L.closeTask()')}${B('Review Budget dates',"L.go('planPeriod')",'text-btn')}</div>`:`<h1>${E(s.headline)}</h1><p>${E(s.support)}</p><div class="actions">${B(E(s.action),`L.go('${s.route}')`)}${B('Done','L.closeTask()','text-btn')}</div>`;
 return `<section class="spending-outlook" data-illustrated-screen="spendingOutlook">${ready}</section>`;
};
const open=()=>{if(!canOpen())return false;L.go('spendingOutlook');return true;};
L.taskSheet?.register('spendingOutlook',{family:'records',treatment:'detail',label:'Spending outlook'});
const home=L.views.home;
L.views.home=function(...args){
 const html=home.apply(this,args);if(!canOpen()||!summary().hasBudget)return html;
 return html.replace(/<button class="account-room"([^>]*)>([\s\S]*?)<\/button>/,(_,attributes,body)=>{
  const entry=attributes.replace(/onclick="[^"]*"/,'onclick="L.spendingOutlook.open()"').replace(/aria-label="[^"]*"/,'aria-label="Left after Budget. See calculation and daily guide"');
  const content=body.replace(/<small data-budget-scope>[\s\S]*?<\/small>/,`<small data-budget-scope class="home-spending-outlook-caption">${lineContent()}</small>`);
  return `<button class="account-room" data-spending-outlook-entry${entry}>${content}</button>`;
 });
};
const refresh=L.refreshPrivateMoney;
L.refreshPrivateMoney=function(...args){const result=refresh?.apply(this,args),line=document.querySelector('.home-spending-outlook-caption');if(line)line.innerHTML=lineContent();return result;};
const dailyQuestion=question=>{
 const q=String(question||'').toLowerCase().replace(/[’]/g,"'").replace(/[?!.]+$/,'').replace(/\s+/g,' ').trim();
 // Bound this shortcut to a single amount-free request. A purchase amount,
 // compound decision or historical spending question keeps its existing flow.
 return /^(?:please )?(?:how much (?:can|could) i (?:spend|use) (?:(?:a|per|each) day|daily)|what can i spend (?:a|per|each) day|how much (?:money )?do i have (?:a|per|each) day|what(?:'s| is) my daily (?:spending )?(?:guide|amount)|show(?: me)? (?:my )?(?:daily spending guide|spending outlook))(?: please)?$/.test(q);
};
const answer=L.chatAnswer;
L.chatAnswer=function(question,options={}){
 const explicit=dailyQuestion(question),reply=answer.call(this,explicit?'How long will my money last?':question,options),q=String(question||'').toLowerCase(),s=summary({now:Number(options.now)||Date.now()});
 const context={...(reply.context||{})};if(explicit)delete context.pendingPlanning;
 if(explicit&&!s.ready&&s.status!=='unavailable')return {...reply,intent:'runway',headline:s.headline,support:s.support,text:s.headline+' '+s.support,context,route:s.route,action:s.action};
 // Let the existing missing-date conversation complete in its own flow. The
 // ordinary allowance-date question remains an answer about that date. A
 // direct daily-guide request only needs an explicit valid Budget period.
 if(!s.ready||!explicit&&(reply.intent!=='runway'||!dateValue(L.state.allowance?.date)||dateValue(L.state.allowance.date)<dateValue(iso(Number(options.now)||Date.now()))||!/\b(?:how long|last until|last till|money last|run out|runway)\b/.test(q)))return reply;
 const expected=dateValue(L.state.allowance?.date),allowance=expected!==null?(expected<dateValue(s.start)?`Your saved allowance date, ${label(L.state.allowance.date)}, has passed. `:`Next allowance expected ${label(L.state.allowance.date)}. `):'';
 const beyond=expected!==null&&expected>dateValue(s.last)+DAY?'Costs after that Budget date aren’t included. ':'';
 const headline=explicit?`About ${M(s.perDay)} a day for extras.`:s.headline;
 const pace=L.chatAnalytics?.runwayQuestion(q)&&/\b(?:spending|rate|pace|behaviou?r|burn)\b/.test(q)?'This is a Budget-based guide, not a forecast from your spending rate. ':'';
 const support=`${explicit?s.headline:s.daily} Budget through ${label(s.last)}. Guide only; other costs may be missing. ${pace}${(expected!==null&&expected<dateValue(s.start)||!explicit)?allowance:''}${beyond}`.trim();
 return {...reply,intent:'runway',headline,support,text:headline+' '+support,context,route:'spendingOutlook',action:'See spending outlook',outlookDate:s.start,
  calculation:{rows:[['Period',s.period],['Available Everyday money',M(s.available)],['Saved Budget still to cover',M(s.budget)],['Left for extras',M(s.room)],['Remaining days',String(s.days)],['Daily guide, rounded down',M(s.perDay)],...(s.remainder?[['Rounding remainder',M(s.remainder)]]:[])],notes:[s.counting,'The guide divides only money outside your saved Budget. Planned food and transport are already included in those commitments. Only recorded costs are covered; this is not a prediction of every future expense. Expected allowance is not received money. Money Boxes remain separate savings. I can’t promise money will last; other costs may be missing.']}};
};
const openAnswer=L.chatOpenAnswer;
L.chatOpenAnswer=function(index,secondary=false){const reply=L.state.chats?.[index];if(!secondary&&reply?.route==='spendingOutlook')return open();return openAnswer.apply(this,arguments);};
const extraSnapshot=L.chatSnapshotStatusExtra;
L.chatSnapshotStatusExtra=reply=>extraSnapshot?.(reply)||(reply?.outlookDate&&reply.outlookDate!==iso(Date.now())?'Earlier daily guide. Check again for today’s dates.':'');
L.spendingOutlook={summary,open};
})();
