/* Money Story presents the same confirmed spending ledger as Chat. Charts,
   groups and insights are read-only views of spendingSummary's returned rows. */
(()=>{
'use strict';
if(!window.L||L.moneyStoryAnalytics)return;
const E=L.e,M=L.money,B=L.btn,DAY=86400000;
const cash=value=>Math.round((Number(value)||0)*100)/100;
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const validDays=value=>[7,30,90].includes(Number(value))?Number(value):7;
const clean=value=>typeof value==='string'?value.trim().slice(0,96):'';
const normal=value=>clean(value).toLocaleLowerCase('en-GH');
const dateLabel=value=>new Date(value).toLocaleDateString('en-GH',{day:'numeric',month:'short',timeZone:'Africa/Accra'});
const fullDate=value=>new Date(value).toLocaleDateString('en-GH',{day:'numeric',month:'short',year:'numeric',timeZone:'Africa/Accra'});
const dateTime=value=>new Date(value).toLocaleString('en-GH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Africa/Accra'});
const cost=t=>cash(Number(t.amount)+Number(t.fee||0));
const J=value=>E(JSON.stringify(value));
const params=(source=L.params)=>({days:validDays(source.days),category:clean(source.category),merchant:clean(source.merchant),breakdown:source.breakdown==='merchants'?'merchants':'categories'});
const groupMerchants=txs=>{
 const groups=new Map();
 for(const t of txs){const name=clean(t.name)||'Unnamed recipient',key=normal(name);if(!groups.has(key))groups.set(key,{name,total:0,count:0,transfers:true});const g=groups.get(key);g.total=cash(g.total+cost(t));g.count++;g.transfers=g.transfers&&t.category==='Transfers';}
 return [...groups.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
};
function points(txs,start,end,count,bucketWidth){
 const span=Math.max(1,end-start),width=bucketWidth||span/count;
 const data=Array.from({length:count},(_,i)=>{const a=start+i*width,b=i===count-1?end:start+(i+1)*width;return {start:a,end:b,label:dateLabel(a),rangeLabel:dateTime(a)+' to '+dateTime(b),amount:0};});
 for(const t of txs){const at=Date.parse(t.date),i=Math.min(count-1,Math.max(0,Math.floor((at-start)/width)));data[i].amount=cash(data[i].amount+cost(t));}
 return data;
}
function calendarPoints(txs,start,end){
 const data=[];let cursor=start;
 while(cursor<end){const next=Math.min(end,(Math.floor(cursor/DAY)+1)*DAY);data.push({start:cursor,end:next,label:dateLabel(cursor),rangeLabel:dateTime(cursor)+' to '+dateTime(next),partial:next-cursor<DAY,amount:0});cursor=next;}
 if(!data.length)data.push({start,end,label:dateLabel(start),rangeLabel:dateTime(start)+' to '+dateTime(end),partial:true,amount:0});
 for(const t of txs){const at=Date.parse(t.date),p=data.find((p,i)=>at>=p.start&&(at<p.end||i===data.length-1&&at<=p.end));if(p)p.amount=cash(p.amount+cost(t));}
 return data;
}
function insights(s){
 const list=[],unknown=s.txs.filter(t=>t.category==='Uncategorised'||L.needsCategory?.(t)),unknownTotal=cash(unknown.reduce((n,t)=>n+cost(t),0));
 if(unknown.length)list.push({kind:'category',headline:`${M(unknownTotal)} still needs a category.`,support:`${unknown.length} completed payment${unknown.length===1?'':'s'} included in money out.`,action:'Help Lumo recognise it',route:'categorySort'});
 const lead=s.categories[0],ties=lead?s.categories.filter(([,amount])=>amount===lead[1]):[];
 if(lead&&list.length<2){
  if(ties.length>1)list.push({kind:'share',headline:`${ties.length} categories share the largest amount.`,support:`${M(lead[1])} each in this period.`});
  else list.push({kind:'share',headline:lead[0]==='Transfers'?`${M(lead[1])} was money sent to others.`:`${lead[0]} made up ${Math.round(lead[1]/s.total*100)}% of money out.`,support:lead[0]==='Transfers'?'Transfers are money sent, not necessarily purchases.':`${M(lead[1])} of ${M(s.total)} in this period.`});
 }
 const repeat=s.merchants.filter(m=>m.count>1).sort((a,b)=>b.count-a.count||b.total-a.total)[0];
 if(repeat&&list.length<2)list.push({kind:'repeat',headline:`${repeat.count} payments to ${repeat.name}.`,support:`${M(repeat.total)} in this period.`,merchant:repeat.name,action:'See these payments'});
 return list.slice(0,2);
}
function summary({days=7,category='',merchant='',now=Date.now()}={}){
 days=validDays(days);category=clean(category);merchant=clean(merchant);now=Number.isFinite(Number(now))?Number(now):Date.now();
 const authority=L.spendingSummary({days,category,now});
 const txs=merchant?authority.txs.filter(t=>normal(t.name)===normal(merchant)):authority.txs;
 const categoriesMap=new Map();for(const t of txs){const key=clean(t.category)||'Other';categoriesMap.set(key,cash((categoriesMap.get(key)||0)+cost(t)));}
 const categories=merchant?[...categoriesMap.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])):authority.categories;
 const total=merchant?cash(txs.reduce((n,t)=>n+cost(t),0)):authority.total;
 const count=days===7?7:days===30?10:13;
 const s={days,category,merchant,now,start:authority.cutoff,end:authority.end,total,txs,categories,merchants:groupMerchants(txs),points:days===7?calendarPoints(txs,authority.cutoff,authority.end):points(txs,authority.cutoff,authority.end,count,days===90?7*DAY:undefined),label:`Last ${days} days`,valid:true};
 s.insights=insights(s);return s;
}
function homeSummary({now=Date.now()}={}){
 const s=summary({days:7,now}),lead=s.categories[0];
 const headline=!s.total?'Your first payment starts the story.':lead?.[0]==='Transfers'?`${M(lead[1])} sent to others in the last 7 days.`:lead?.[0]==='Uncategorised'?`${M(lead[1])} needs a category.`:`${lead[0]} took ${M(lead[1])} of ${M(s.total)} paid out.`;
 return {...s,headline,periodLabel:'Last 7 days',topCategory:lead?.[0]||'',topAmount:lead?.[1]||0};
}
function chart(s,{compact=false}={}){
 const max=Math.max(0,...s.points.map(p=>p.amount));
 if(!max)return `<figure class="ms-chart ms-chart-empty" data-money-story-chart data-chart-total="${E(s.total)}"><p class="home-story-no-payments">No completed payments in this period.</p></figure>`;
 const range=`${fullDate(s.start)} to ${fullDate(s.end)}`;
 const bars=s.points.map((p,i)=>`<span class="ms-chart-column"><span class="ms-chart-bar${p.amount===max?' is-highest':''}" style="--bar-height:${p.amount?p.amount/max*100:0}%" title="${E((p.rangeLabel||p.label)+': '+M(p.amount))}"></span>${(s.days===7||s.days===1||i===0||i===s.points.length-1)?`<small>${E(s.days===1?new Date(p.start).toLocaleTimeString('en-GH',{hour:'numeric',hour12:false,timeZone:'Africa/Accra'}):new Date(p.start).toLocaleDateString('en-GH',{day:'numeric',month:i===0?'short':undefined,timeZone:'Africa/Accra'}))}</small>`:'<small aria-hidden="true">·</small>'}</span>`).join('');
 return `<figure class="ms-chart${compact?' ms-chart-compact':''}" data-money-story-chart data-chart-total="${E(s.total)}"><figcaption><span>${s.days===1?'Money out through the day':s.days===7?'Money out by calendar day':s.days===30?'Money out in 3-day groups':'Money out in weekly groups'}</span><strong>${M(max)} <small>highest</small></strong></figcaption><div class="ms-chart-bars" aria-hidden="true">${bars}</div><p class="sr-only">Money out from ${E(range)}, including fees: ${M(s.total)}. Highest group: ${M(max)}.</p>${compact?'':`<details class="ms-chart-values"><summary>Graph values</summary>${s.days===7?'<p>First day and today may be partial. The exact seven-day spending window is unchanged.</p>':''}<dl>${s.points.map(p=>`<div><dt>${E(p.rangeLabel||p.label)}${p.partial?' · partial day':''}</dt><dd>${M(p.amount)}</dd></div>`).join('')}</dl></details>`}</figure>`;
}
const route=()=>L.route==='story'?'story':'homeMoneyStory';
function open(options={}){if(!allowed())return false;L.go('homeMoneyStory',{days:validDays(options.days),...(clean(options.category)?{category:clean(options.category)}:{}),...(clean(options.merchant)?{merchant:clean(options.merchant)}:{}),...(options.breakdown==='merchants'?{breakdown:'merchants'}:{})});return true;}
function navigate(next){const p={...params(),...next};if(!p.category)delete p.category;if(!p.merchant)delete p.merchant;if(p.breakdown==='categories')delete p.breakdown;L.go(route(),p);}
function filter(kind,value){if(!['category','merchant'].includes(kind)||!allowed())return;const v=clean(value);navigate({[kind]:v,...(kind==='category'?{merchant:''}:{}),breakdown:kind==='merchant'?'merchants':'categories'});}
function setPeriod(days){if(!allowed())return;navigate({days:validDays(days)});}
function setBreakdown(kind){if(!allowed())return;navigate({breakdown:kind==='merchants'?'merchants':'categories'});}
function clear(){navigate({category:'',merchant:''});}
function currentSummary(){return summary(params());}
function ask(){
 if(!allowed()||!['moneyStoryHome','homeMoneyStory','story'].includes(L.route))return false;const p=params(),q=p.merchant?`Where did my money go at ${p.merchant} in the last ${p.days} days?`:p.category?`Where did my ${p.category.toLowerCase()} money go in the last ${p.days} days?`:`Where did my money go in the last ${p.days} days?`;
 // A Story task launched from Chat returns to that retained Chat first. Queue
 // the scoped question after native close, which deliberately drops new params
 // when a destination is already the retained parent.
 if(L.taskSheet?.active&&L.taskSheet.parentRoute==='chat')L.closeTask();
 L.go('chat',{question:q,days:p.days,category:p.category,merchant:p.merchant,moneyStoryInsight:true});return true;
}
function dashboard(){
 if(!allowed())return `<section>${L.header('Your money story')}<p>Sign in to see your recorded spending.</p></section>`;
 const p=params(),s=summary(p),scope=[p.category,p.merchant].filter(Boolean).join(' · '),groups=p.breakdown==='merchants'?s.merchants.map(m=>[m.name,m.total,m.count]):s.categories;
 const rows=groups.map(([name,value,count])=>`<div class="ms-breakdown-row"><dt><button type="button" data-story-${p.breakdown==='merchants'?'merchant':'category'}="${E(name)}" onclick="L.moneyStoryAnalytics.filter('${p.breakdown==='merchants'?'merchant':'category'}',${J(name)})"><span>${E(name)}</span>${p.breakdown==='merchants'?`<small>${count} payment${count===1?'':'s'}</small>`:''}</button></dt><dd><strong>${M(value)}</strong><small>${Math.round(value/s.total*100)}%</small></dd><div class="ms-category-track" aria-hidden="true"><i style="--category-share:${value/s.total*100}%"></i></div></div>`).join('');
 const categoryQueue=s.txs.filter(t=>t.category==='Uncategorised'||L.needsCategory?.(t)).slice(0,3).map(t=>t.id);
 const insight=s.insights.map(i=>`<article class="ms-insight"><span class="ms-insight-symbol" aria-hidden="true">${L.icon(i.kind==='category'?'help':'bolt',17)}</span><div><strong>${E(i.headline)}</strong><p>${E(i.support)}</p>${i.action?B(E(i.action),i.kind==='category'?`L.go('categorySort',${J({days:p.days,queue:categoryQueue,at:0})})`:`L.moneyStoryAnalytics.filter('merchant',${J(i.merchant)})`,'text-btn'):''}</div></article>`).join('');
 return `<section class="home-story-detail ms-dashboard" data-money-story-dashboard>${L.header('Your money story')}<h1>Where did it go?</h1><div class="home-story-periods ms-periods" role="group" aria-label="Money story period">${[7,30,90].map(d=>B(d+' days',`L.go('${route()}',{days:${d}${p.category?',category:'+J(p.category):''}${p.merchant?',merchant:'+J(p.merchant):''}${p.breakdown==='merchants'?",breakdown:'merchants'":''}})`,'chip'+(d===p.days?' selected':'')).replace('<button ',`<button aria-pressed="${d===p.days}" `)).join('')}</div><p class="home-story-scope">Last ${p.days} days · money out, including fees</p>${scope?`<div class="ms-scope"><strong>${E(scope)}</strong>${B('All spending','L.moneyStoryAnalytics.clear()','text-btn')}</div>`:''}<strong class="home-story-detail-total ms-total">${L.balanceNumber(s.total)}</strong>${chart(s)}${s.total?`<section class="ms-insights" aria-label="Lumo insights">${insight}</section>`:''}<div class="ms-breakdown-tabs" role="group" aria-label="Spending breakdown">${B('Categories',"L.moneyStoryAnalytics.setBreakdown('categories')",'chip'+(p.breakdown==='categories'?' selected':'')).replace('<button ',`<button aria-pressed="${p.breakdown==='categories'}" `)}${B('Merchants',"L.moneyStoryAnalytics.setBreakdown('merchants')",'chip'+(p.breakdown==='merchants'?' selected':'')).replace('<button ',`<button aria-pressed="${p.breakdown==='merchants'}" `)}</div>${rows?`<dl class="home-story-breakdown ms-breakdown">${rows}</dl>`:''}${s.txs.length?`<section class="home-story-transactions ms-transactions" aria-label="Payments in this story"><h2>${scope?'Matching payments':'Recent payments'}</h2>${s.txs.slice(0,8).map(t=>`<button type="button" class="ms-payment" onclick="L.go('txDetail',{id:${J(t.id)}})"><span><strong>${E(t.name||'Payment')}</strong><small>${E(dateLabel(t.date))} · ${E(t.category||'Other')}${t.fundingAccount==='virtual-card'?' · Card':''}</small></span><strong>${M(cost(t))}</strong>${L.icon('chevron',16)}</button>`).join('')}</section>`:''}<div class="actions ms-actions">${B('Ask Lumo about this','L.moneyStoryAnalytics.ask()')}${B(s.total?'View payments':'View all activity',`L.go('activity',{scope:'spending',filter:'out',days:${p.days}${p.category?',category:'+J(p.category):''}${p.merchant?',query:'+J(p.merchant):''}})`,'secondary')}</div><details class="home-story-definition ms-definition"><summary>What counts?</summary><p>Completed outgoing payments, including fees and transfers. Transfers are money sent, not purchases. Incoming money, pending, failed and reversed payments, Money Box transfers and virtual card top-ups are excluded. Only activity recorded in Lumo is included.</p></details></section>`;
}
L.views.homeMoneyStory=dashboard;L.views.story=dashboard;
// Keep the exact calendar-window daily story and its one-tap categorisation.
const daily=L.views.dailyMoneyStory;
if(daily)L.views.dailyMoneyStory=function(...args){
 let html=daily.apply(this,args);if(!allowed())return html;
 const p=L.params,period=['today','yesterday','thisWeek','lastWeek'].includes(p.period)?p.period:'today',range=Number.isFinite(Number(p.start))&&Number.isFinite(Number(p.end));
 const s=L.dailySpendingSummary(range?{period:'range',start:Number(p.start),end:Number(p.end)}:{period});
 if(s.valid===false)return html;
 const span=s.end-s.start,dailyChart={...s,days:span>2*DAY?7:1,points:points(s.txs,s.start,s.end,span>2*DAY?7:6)};
 const graph=chart(dailyChart,{compact:true});
 html=html.replace('<div class="daily-story-actions">',graph+'<div class="daily-story-actions">');
 return html.replace(/<button\b[^>]*onclick="L.back\(\)"[^>]*>Done<\/button>/,B('Explore my spending',"L.go('homeMoneyStory',{days:7})",'secondary')+B('Done','L.back()','text-btn'));
};
// Card receipts bypassed the older receipt-category adapter. Reuse its current
// correction authority instead of introducing another category writer.
const receipt=L.views.txDetail;
L.views.txDetail=function(...args){
 let html=receipt.apply(this,args);const t=(L.state.txs||[]).find(t=>t.id===L.params.id);
 if(!allowed()||!t||t.type!=='out'||t.status!=='success'||L.isInternalTransfer?.(t)||html.includes('class="receipt-category"')||html.includes('data-ms-receipt-category'))return html;
 html=html.replace(/<div class="summary-line"><span>Category<\/span><strong>[^<]*<\/strong><\/div>/,'');
 const ui=`<div class="ms-receipt-category" data-ms-receipt-category><span>Category <strong>${E(t.category||'Uncategorised')}</strong></span>${B('Change category',`L.openCategory(${J(t.id)})`,'text-btn')}</div>`;
 return html.includes('<div class="receipt">')?html.replace('<div class="receipt">',ui+'<div class="receipt">'):html.replace('<div class="actions">',ui+'<div class="actions">');
};
const chat=L.chatAnswer;
L.chatAnswer=function(question,options={}){
 const recheck=options.moneyStoryInsight&&options.storyParams;
 if(!allowed()||!recheck&&(!L.params.moneyStoryInsight||String(question)!==String(L.params.question)))return chat.apply(this,arguments);
 const p=params(recheck?options.storyParams:L.params),now=Number(options.now)||Date.now(),s=summary({...p,now}),subject=p.merchant?` to ${p.merchant}`:p.category?` on ${p.category.toLowerCase()}`:'',headline=`${M(s.total)} paid out${subject} in the last ${s.days} days.`,support=s.insights[0]?[s.insights[0].headline,s.insights[0].support].join(' '):'No completed payments are recorded for this view.';
 return L.chatAnalytics.stamp({intent:'money-story-insight',headline,support,text:headline+' '+support,context:{days:s.days,category:p.category,merchant:p.merchant},params:p,action:'Return to this money story',route:'homeMoneyStory',calculation:{rows:[['Period',s.label],...(p.merchant?[['Merchant',p.merchant]]:[]),...s.categories.map(([name,amount])=>[name,M(amount)]),['Total money out',M(s.total)]],notes:['Completed outgoing payments and fees only. Card top-ups and Money Box movements are internal transfers, not expenditure. This is recorded Lumo activity, not a forecast.']}},{kind:'rolling',days:p.days,category:p.category,merchant:p.merchant},now);
};
const openAnswer=L.chatOpenAnswer;
L.chatOpenAnswer=function(index,secondary=false){const r=L.state.chats?.[index];if(!secondary&&r?.intent==='money-story-insight'&&allowed())return L.go('homeMoneyStory',r.params||r.context||{});return openAnswer.apply(this,arguments);};
const snapshot=L.chatSnapshotStatusExtra;
L.chatSnapshotStatusExtra=r=>snapshot?.(r)||(!r?.answerScope&&r?.moneyStoryMark?'Saved spending view. Ask again for current dates and figures.':'');
L.moneyStoryAnalytics={summary,homeSummary,chart,open,filter,setPeriod,setBreakdown,clear,ask};
})();
