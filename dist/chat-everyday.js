/* Calendar-backed answers and editable chatbanking drafts. Text cannot authorise
   money: the existing review, conditional Pause and authentication own payments. */
(()=>{
'use strict';
if(!window.L||L.dailySpendingSummary)return;
const DAY=86400000,MAX=5000,E=L.e,M=L.money,B=L.btn;
const round=n=>Math.round((Number(n)||0)*100)/100;
const clean=v=>String(v??'').trim().slice(0,120);
const normal=v=>clean(v).toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9@]+/g,' ').trim();
const copy=v=>{try{return JSON.parse(JSON.stringify(v));}catch{return null;}};
const dateText=n=>new Date(n).toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'});
const dateOnly=value=>{const s=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const n=Date.parse(s+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===s?n:null;};
const utcDay=now=>{const d=new Date(now);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());};
const internal=t=>t.internalTransfer===true||t.type==='internal'||!!t.boxId||t.method==='Money Box transfer';
const labels={today:'Today',yesterday:'Yesterday',thisWeek:'This week',lastWeek:'Last week',thisMonth:'This month',lastMonth:'Last month'};
function range({period='today',now=Date.now(),start,end}={}){
 now=Number(now);if(!Number.isFinite(now))now=Date.now();
 const today=utcDay(now),d=new Date(today),week=today-((d.getUTCDay()+6)%7)*DAY,month=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);
 let a,b;
 switch(period){
  case 'today':a=today;b=now;break;
  case 'yesterday':a=today-DAY;b=today-1;break;
  case 'thisWeek':a=week;b=now;break;
  case 'lastWeek':a=week-7*DAY;b=week-1;break;
  case 'thisMonth':a=month;b=now;break;
  case 'lastMonth':a=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1);b=month-1;break;
  case 'range':a=typeof start==='string'?dateOnly(start):Number(start);b=typeof end==='string'?(dateOnly(end)===null?null:dateOnly(end)+DAY-1):Number(end);break;
  default:return {valid:false,period,label:'Choose a calendar period',start:null,end:null,now};
 }
 if(a===null||b===null||!Number.isFinite(a)||!Number.isFinite(b)||a>b||a>now)return {valid:false,period,label:'Choose a valid past date range',start:null,end:null,now};
 b=Math.min(b,now);
 return {valid:true,period,label:labels[period]||dateText(a)+(utcDay(a)!==utcDay(b)?' – '+dateText(b):''),start:a,end:b,now};
}
L.dailySpendingSummary=(options={})=>{
 const r=range(options),category=clean(options.category),merchant=normal(options.merchant),groups=Object.create(null);
 const txs=r.valid?(L.state.txs||[]).filter(t=>{
  const at=new Date(t.date).getTime(),amount=Number(t.amount),fee=Number(t.fee||0),name=clean(t.category)||'Other';
  return !internal(t)&&t.type==='out'&&t.status==='success'&&Number.isFinite(at)&&at>=r.start&&at<=r.end&&Number.isFinite(amount)&&amount>0&&Number.isFinite(fee)&&fee>=0&&(!category||normal(name)===normal(category))&&(!merchant||normal(t.name).includes(merchant));
 }).sort((a,b)=>new Date(b.date)-new Date(a.date)):[];
 txs.forEach(t=>{const key=clean(t.category)||'Other';groups[key]=round((groups[key]||0)+Number(t.amount)+Number(t.fee||0));});
 const categories=Object.entries(groups).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
 return {...r,category,merchant:clean(options.merchant),total:round(categories.reduce((n,p)=>n+p[1],0)),txs,categories,count:txs.length};
};
const periodWords=[['this week','thisWeek'],['last week','lastWeek'],['this month','thisMonth'],['last month','lastMonth'],['yesterday','yesterday'],['today','today']];
function periodsIn(q){return periodWords.flatMap(([text,period])=>{const at=q.indexOf(text);return at<0?[]:[{period,at}];}).sort((a,b)=>a.at-b.at);}
function categoryIn(q){
 const all=[...new Set(['Food','Transport','Study','Data','Phone','Shopping','Bills','Transfers','Other',...(L.state.txs||[]).map(t=>clean(t.category)).filter(Boolean)])];
 return all.sort((a,b)=>b.length-a.length).find(name=>(' '+normal(q)+' ').includes(' '+normal(name)+' '))||'';
}
function merchantIn(q){
 const end=/(?:\s+(?:today|yesterday|this week|last week|this month|last month|(?:(?:in )?(?:the )?(?:last|past)) \d+ days?|from \d{4}|between \d{4}|on \d{4}|in \d{4})\b|[?!.,]$)/i;
 const m=q.match(/\b(?:payment(?:s)? (?:to|at)|paid (?:to|at)|spent (?:at|with)|spend (?:at|with)|money (?:go|went) (?:at|to)|transactions? (?:at|with|to))\s+(.+)/i);
 return m?clean(m[1].split(end)[0]).replace(/\s+(?:please|again)$/i,''):'';
}
function calendarAnswer(raw,options){
 const q=raw.toLowerCase().replace(/[’]/g,"'"),periods=periodsIn(q),dates=[...q.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(m=>m[0]);
 if(L.chatAnalytics?.runwayQuestion(q)||L.chatAnalytics?.savingsQuestion(q)||L.chatAnalytics?.goalQuestion(q))return null;
 const namedMerchant=merchantIn(raw);
 if(!periods.length&&!dates.length&&!namedMerchant)return null;
 if(!/\b(?:spent|spend|spending|payments?|paid|transactions?|compare|comparison)\b|where .*money/.test(q))return null;
 if(/\b(?:can|could|afford|will|would)\b/.test(q)&&!/\b(?:show|compare)\b/.test(q))return null;
 // A merchant named "Food House" is not a request for the Food category.
 // Only words outside the extracted merchant label can choose a category.
 const now=Number(options.now)||Date.now(),merchant=namedMerchant,category=categoryIn(merchant?q.replace(merchant.toLowerCase().replace(/[’]/g,"'"),''):q),base={now,category,merchant};
 const comparing=/\b(?:compare|compared|comparison|versus|vs|more|less|than)\b/.test(q),single=d=>({period:'range',start:d,end:d});
 const rolling=merchant&&!dates.length&&!periods.length?q.match(/\b(?:last|past)\s+(\d+)\s*days?\b/):null,rollingDays=rolling?Number(rolling[1]):0;
 if(rolling&&(rollingDays<1||rollingDays>366))return {intent:'spending-period',headline:'Which period should I check?',support:'Use up to 366 past days or choose exact dates. No payments are changed.',text:'Which period should I check? Use up to 366 past days or choose exact dates.',context:{days:30,category:''}};
 let request=dates.length?{period:'range',start:dates[0],end:dates[1]||dates[0]}:periods[0]?{period:periods[0].period}:{period:'range',start:now-(rollingDays||30)*DAY,end:now,...(rollingDays?{rollingDays}:{})},comparison=null;
 if(comparing&&periods.length===2&&!dates.length)comparison={period:periods[1].period};
 else if(comparing&&dates.length===2&&!periods.length){request=single(dates[0]);comparison=single(dates[1]);}
 else if(comparing&&dates.length===4&&!periods.length){request={period:'range',start:dates[0],end:dates[1]};comparison={period:'range',start:dates[2],end:dates[3]};}
 else if(comparing&&dates.length===1&&periods.length===1){const dated=single(dates[0]),named={period:periods[0].period};if(q.indexOf(dates[0])<periods[0].at){request=dated;comparison=named;}else {request=named;comparison=dated;}}
 if(dates.length>2&&!comparison||dates.some(d=>dateOnly(d)===null))request={period:'invalid'};
 const a=L.dailySpendingSummary({...base,...request});
 if(!a.valid)return {intent:'calendarSpending',text:'Use a past date or date range, for example “Show spending from 2026-10-01 to 2026-10-15.”',headline:'Which dates should I check?',context:{days:30,category:''}};
 const context={days:[7,30,90].includes(rollingDays)?rollingDays:30,category},subject=merchant?' with '+merchant:category?' on '+category.toLowerCase():'';
 const rows=[['Period',dateText(a.start)+' – '+dateText(a.end)],['Completed spending'+subject,M(a.total)],...a.categories.map(([n,v])=>[n,M(v)])];
 const extra={intent:'calendarSpending',context,calendarQuery:{...request,category,merchant},...(comparison?{calendarComparison:comparison}:{}),contextLabel:a.label,calculation:{rows,notes:['Completed outgoing payments, including fees. Incoming money, pending or failed payments and transfers between your accounts are excluded. Ghana time (UTC).']},action:a.count?'See payments':undefined,route:a.count?'chatCalendarPayments':undefined,calendarTxIds:a.txs.map(t=>t.id)};
 if(comparison){
  const b=L.dailySpendingSummary({...base,...comparison});
  if(!b.valid)return {intent:'calendarSpending',text:'Use two past dates or calendar periods so I can compare recorded spending.',headline:'Which two periods should I compare?',context:{days:30,category:''}};
  const difference=round(a.total-b.total),direction=difference>0?'more':difference<0?'less':'the same';
  const headline=difference===0?'You spent the same amount in both periods.':`You spent ${M(Math.abs(difference))} ${direction}${subject}.`;
  const support=`${a.label}: ${M(a.total)}. ${b.label}: ${M(b.total)}.${['thisWeek','thisMonth','today'].includes(a.period)?' The current period is still in progress.':''}`;
  return {...extra,text:headline+' '+support,headline,support,contextLabel:a.label+' · '+b.label,calculation:{rows:[[a.label+' · '+dateText(a.start)+' – '+dateText(a.end),M(a.total)],[b.label+' · '+dateText(b.start)+' – '+dateText(b.end),M(b.total)],['Difference',M(Math.abs(difference))+' '+direction]],notes:extra.calculation.notes},calendarTxIds:[...new Set([...a.txs,...b.txs].map(t=>t.id))]};
 }
 const headline=a.count?`You spent ${M(a.total)}${subject}.`:`No completed payments${subject} ${a.label.toLowerCase()}.`;
 const top=a.categories[0],support=a.count?`${a.count} ${a.count===1?'payment':'payments'}${!category&&top?'. '+top[0]+' was largest at '+M(top[1]):''}.`: 'I only count confirmed spending recorded in this prototype.';
 return {...extra,text:headline+' '+support,headline,support};
}

// These are the existing demo directory entries, not inferred account identities.
// An optional shared directory can expose more verified demo merchants.
const people=[{id:'abena',name:'Abena Asante',handle:'@abena.a'},{id:'kojo',name:'Kojo Owusu',handle:'@kojo.o'},{id:'ama',name:'Ama Boateng',handle:'@ama.b'}];
const baseMerchants=[{id:'AK01',name:'Akua’s Kitchen',category:'Food'},{id:'CP02',name:'Campus Print',category:'Study'},{id:'RB03',name:'Ride & Go',category:'Transport'}];
const merchants=()=>{const additional=L.everydayPayments?.merchants?.()||[];return [...new Map([...baseMerchants,...additional].filter(m=>m?.id&&m?.name).map(m=>[m.id,m])).values()];};
const costs=()=>(L.state.essentials||[]).filter(x=>!x.archived&&!x.deleted);
const boxes=()=>(L.state.goals||[]).filter(x=>!x.archived&&!x.deleted);
const recipientList=()=>[...people.map(p=>({...p,targetKind:'person'})),...merchants().map(m=>({...m,targetKind:'merchant'}))];
const matches=(items,text)=>{const q=normal(text).replace(/^(?:my|the|a) /,'').replace(/ (?:money )?box$/,'');if(!q)return [];const exact=items.filter(x=>[x.name,x.handle,x.id].some(v=>normal(v)===q));return exact.length?exact:items.filter(x=>[x.name,x.handle,x.id].some(v=>normal(v).includes(q)));};
const currency=/(?:GH₵|GHS|₵)\s*([+-]?[0-9][0-9,.]*)|([+-]?[0-9][0-9,.]*)\s*(?:cedis?|GHS|GH₵|₵)(?=\s|[?!.,]|$)/gi;
function amountIn(raw,allowBare=false){
 if(/[$€£¥]|\b(?:USD|EUR|GBP|NGN|dollars?|euros?|pounds?|naira)\b|\d\s*(?:USD|EUR|GBP|NGN)\b/i.test(raw))return {error:'Use Ghana cedis. What is the amount in GH₵?'};
 const tokens=[...raw.matchAll(currency)].map(m=>m[1]||m[2]);
 let rest=raw.replace(currency,' ');
 if(!tokens.length){const stripped=allowBare?raw.trim():raw.replace(/\b(?:from|using)\b[\s\S]*$/i,'');tokens.push(...[...stripped.matchAll(/(?<![a-z0-9@])[+-]?[0-9][0-9,.]*(?![a-z0-9])/gi)].map(m=>m[0]));rest='';}
 if(!tokens.length)return {amount:null};
 if(tokens.length!==1||/\b(?:about|around|roughly|approximately|between|maybe|up to|at least)\b/i.test(raw)||/\b(?:or|and|plus|instead of)\b.*\d/i.test(rest))return {error:'What single amount should I use in GH₵?'};
 const token=tokens[0].replace(/\.$/,'');
 if(!/^\+?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(token))return {error:'Use a positive amount with up to two decimal places.'};
 const amount=Number(token.replace(/,/g,''));
 if(!Number.isFinite(amount)||amount<0.01||amount>MAX)return {error:'Use an amount from GH₵0.01 to GH₵5,000, the prototype’s payment limit.'};
 return {amount:round(amount)};
}
function command(raw){
 const m=raw.match(/^\s*(?:please\s+)?(pay|send|transfer|put|move|save|add)\b\s*([\s\S]*)$/i);if(!m)return null;
 const kind=/^(?:put|move|save|add|transfer)$/i.test(m[1])&&/\bbox\b/i.test(m[2])?'box':'payment';
 if(kind==='payment'&&/^(?:put|move|save|add)$/i.test(m[1]))return null;
 if(/\b(?:back|withdraw|out of)\b/i.test(m[2])&&kind==='box')return {unsupported:true};
 const parsed=amountIn(m[2]),source=m[2].match(/\b(?:from|using)\s+(.+)$/i),body=m[2].replace(/\b(?:from|using)\s+.+$/i,'');
 let targetText=body.replace(/(?:USD|EUR|GBP|NGN)\s*[+-]?[0-9][0-9,.]*|[+-]?[0-9][0-9,.]*\s*(?:USD|EUR|GBP|NGN)\b/gi,' ').replace(currency,' ').replace(/[$€£¥]/g,' ').replace(/(?<![a-z0-9@])[+-]?[0-9][0-9,.]*(?![a-z0-9])/gi,' ').replace(/^\s*(?:to|into|in)\s+/i,'').replace(/^\s*(?:my|the)\s+/i,'').replace(/\s+(?:money\s+)?box\s*$/i,'').replace(/\s+(?:please|now)\s*$/i,'').trim();
 return {kind,amount:parsed.amount??null,amountError:parsed.error,targetText:clean(targetText),sourceText:clean(source?.[1]||''),createdAt:Date.now()};
}
const baseContext=()=>({days:[7,30,90].includes(Number(L.params.days))?Number(L.params.days):30,category:clean(L.params.category)});
const clarification=(p,field,headline,choices=[])=>{
 const pending={...p,missing:field,choices:choices.map(x=>({id:x.id,name:x.name,targetKind:x.targetKind||field}))};delete pending.amountError;
 return {intent:'bankingClarification',headline,text:headline,support:field==='amount'?'Nothing has been sent.':undefined,context:{...baseContext(),pendingBanking:pending},bankingPending:pending,action:choices.length?'Choose '+(field==='source'?'a budget source':p.kind==='box'?'a Money Box':'a recipient'):undefined,route:choices.length?'chatBankingChoice':undefined};
};
function resolve(p){
 if(p.unsupported)return {intent:'bankingDraft',headline:'Transfers back need the Money Box controls.',text:'Transfers back need the Money Box controls. Choose your box to review protection and approval.',support:'Choose your box to review protection and approval.',context:baseContext(),action:'Open Money Boxes',route:'goals'};
 const list=p.kind==='box'?boxes().map(x=>({...x,targetKind:'box'})):recipientList();
 if(p.amountError)return clarification(p,'amount',p.amountError);
 if(p.amount===null||p.amount===undefined)return clarification(p,'amount','How much should I '+(p.kind==='box'?'put in the box':'send')+' in GH₵?');
 const targets=p.targetId?list.filter(x=>x.id===p.targetId&&(!p.targetKind||x.targetKind===p.targetKind)):matches(list,p.targetText);
 if(targets.length!==1)return clarification(p,'target',targets.length>1?'Which '+(p.kind==='box'?'Money Box':'recipient')+' do you mean?':p.targetText?'I couldn’t match that '+(p.kind==='box'?'Money Box':'recipient')+'. Which one should I use?':'Who is this '+(p.kind==='box'?'Money Box transfer':'payment')+' for?',targets.length?targets:list);
 const target=targets[0];let source=null;
 if(p.kind==='payment'&&p.sourceText&&!/^(?:left after (?:my )?budget|after budget|spare money)$/i.test(normal(p.sourceText))){
  const found=p.sourceId?costs().filter(x=>x.id===p.sourceId):matches(costs(),p.sourceText);
  if(found.length!==1)return clarification({...p,targetId:target.id,targetKind:target.targetKind},'source','Which budget item should this payment cover?',found.length?found:costs());
  source=found[0];
 }
 const proposal={version:1,kind:p.kind,amount:p.amount,targetId:target.id,targetKind:target.targetKind,targetName:target.name,sourceId:source?.id||'',sourceName:source?.name||(p.kind==='box'?'Operational account':'Left after budget'),createdAt:p.createdAt||Date.now()};
 const headline=p.kind==='box'?`Put ${M(p.amount)} in ${target.name}?`:`Pay ${target.name} ${M(p.amount)}?`;
 const support=p.kind==='box'?'Review the transfer from your operational account, then approve it separately.':`From ${proposal.sourceName}. You can edit before review and approval.`;
 return {intent:'bankingDraft',headline,support,text:headline+' '+support,action:p.kind==='box'?'Open editable transfer':'Open editable payment',route:'chatBankingDraft',context:baseContext(),bankingProposal:proposal};
}
function followUp(raw,p){
 if(!p||typeof p!=='object'||!['amount','target','source'].includes(p.missing)||!['box','payment'].includes(p.kind)||Date.now()-Number(p.createdAt)>15*60*1000)return null;
 if(/^(?:cancel|never mind|nevermind|stop|leave it)[.!]?$/i.test(raw))return {intent:'bankingCancelled',headline:'Draft idea cancelled.',text:'Draft idea cancelled. No money moved.',support:'No money moved.',context:baseContext()};
 if(raw.length>120||/[?]/.test(raw)||/^(?:what|where|how|can|could|why|show|compare|is|are|do|did|i want|tell)\b/i.test(raw))return null;
 const next={...copy(p)};delete next.choices;delete next.missing;
 if(p.missing==='amount'){const parsed=amountIn(raw,true);if(parsed.amount==null&&!parsed.error)return null;next.amount=parsed.amount??null;next.amountError=parsed.error;}
 else if(p.missing==='source'){next.sourceText=raw;delete next.sourceId;}
 else{next.targetText=raw;delete next.targetId;delete next.targetKind;}
 return resolve(next);
}
const previousAnswer=L.chatAnswer;
L.chatAnswer=(question,options={})=>{
 const raw=String(question||'').trim().slice(0,500),p=command(raw);
 if(p)return resolve(p);
 const calendar=calendarAnswer(raw,options);if(calendar)return calendar.calendarQuery?L.chatAnalytics.stamp(calendar,{kind:'calendar',query:calendar.calendarQuery,...(calendar.calendarComparison?{comparison:calendar.calendarComparison}:{})},Number(options.now)||Date.now()):calendar;
 const follow=followUp(raw,options.pendingBanking??L.params.pendingBanking);if(follow)return follow;
 return previousAnswer(question,options);
};
function selected(index){const n=Number(index);return Number.isSafeInteger(n)&&n>=0?L.state.chats?.[n]:null;}
function validProposal(proposal){
 if(!proposal||proposal.version!==1||!Number.isFinite(proposal.amount)||proposal.amount<.01||proposal.amount>MAX||Math.abs(proposal.amount*100-Math.round(proposal.amount*100))>.000001)return false;
 const list=proposal.kind==='box'?boxes().map(x=>({...x,targetKind:'box'})):proposal.kind==='payment'?recipientList():[];
 return list.some(x=>x.id===proposal.targetId&&x.targetKind===proposal.targetKind&&x.name===proposal.targetName)&&(!proposal.sourceId||proposal.kind==='payment'&&costs().some(x=>x.id===proposal.sourceId&&x.name===proposal.sourceName));
}
const sameProposal=(a,b)=>a&&b&&a.kind===b.kind&&a.amount===b.amount&&a.targetId===b.targetId&&a.sourceId===b.sourceId&&a.createdAt===b.createdAt;
function openProposal(index,replace=false){
 const reply=selected(index),p=reply?.bankingProposal;
 if(!validProposal(p)){L.toast('That recipient, box or budget item changed. Ask again to make a fresh draft.');return false;}
 if(Date.now()-p.createdAt>15*60*1000||p.createdAt>Date.now()+60000){L.toast('This proposal is old. Ask again for a fresh draft.');return false;}
 if(L.state.locked||L.state.closed||!L.state.onboarded){L.toast('Return to your account before starting a payment.');return false;}
 const prior=L.state.paymentDraft;
 if(prior&&!prior.submittedTxId&&(prior.name||Number(prior.amount)>0)&&!replace){L.go('chatBankingReplace',{index:Number(index)});return true;}
 if(replace&&L.route!=='chatBankingReplace')return false;
 if(replace&&!sameProposal(p,selected(L.params.index)?.bankingProposal))return false;
 // Starting a fresh existing entry is the only mutation here. It changes no
 // account, budget or transaction. Submission remains in the payment engine.
 const start=()=>{
  if(p.kind==='box')L.startMoneyBoxTransfer(p.targetId,'in');
  else if(p.targetKind==='merchant')L.pickMerchant(p.targetId);
  else {L.startSend('lumo',p.sourceId||'');L.pickPerson(p.targetId);}
  const d=L.state.paymentDraft;
  if(!d||d.submittedTxId||p.kind==='box'&&(d.method!=='box'||d.boxId!==p.targetId)||p.kind==='payment'&&p.targetKind==='merchant'&&d.merchantId!==p.targetId||p.kind==='payment'&&p.targetKind==='person'&&d.recipient!==p.targetId)return false;
  d.amount=String(p.amount);d.fee=Number(L.paymentFee?.(d.method,p.amount)||0);d.chatProposal={targetId:p.targetId,createdAt:p.createdAt};
  if(p.kind==='payment'&&!L.setPaymentSource(p.sourceId||'',d))return false;
  delete d.reviewFingerprint;delete d.pauseAcceptedSignature;L.save();L.render();return true;
 };
 return replace&&L.runReviewedPaymentReplacement?L.runReviewedPaymentReplacement(prior,start):start();
}
L.openChatBankingDraft=(index,replace=false)=>openProposal(index,replace);
const openAnswer=L.chatOpenAnswer;
L.chatOpenAnswer=(index,secondary=false)=>{
 const reply=selected(index);if(!reply)return;
 if(!secondary&&reply.route==='chatBankingDraft')return openProposal(index);
 if(!secondary&&reply.route==='chatBankingChoice'&&reply.bankingPending)return L.go('chatBankingChoice',{index:Number(index)});
 if(!secondary&&reply.route==='chatCalendarPayments'&&Array.isArray(reply.calendarTxIds))return L.go('chatCalendarPayments',{index:Number(index)});
 return openAnswer(index,secondary);
};
L.views.chatBankingReplace=()=>{
 const reply=selected(L.params.index),p=reply?.bankingProposal,d=L.state.paymentDraft;
 const unfinished=d&&!d.submittedTxId&&(d.name||Number(d.amount)>0),fresh=validProposal(p)&&Number.isFinite(p.createdAt)&&p.createdAt<=Date.now()+60000&&Date.now()-p.createdAt<=15*60*1000;
 if(!unfinished||!fresh)return `<section class="chat-draft-choice">${L.header(!unfinished?'Your saved draft is no longer here.':'This proposal is no longer available.',unfinished?'Your saved draft has been kept. Return to your conversation and ask again.':'Return to your conversation to choose or prepare a payment.')}<div class="actions">${B('Back to conversation','L.closeTask()')}</div></section>`;
 return `<section class="chat-draft-choice">${L.header('Which draft would you like to use?','Your saved draft stays until you choose.')}<p><span class="small muted">Saved draft</span><br><strong>${E(d.name||'Your saved draft')}</strong>${Number(d.amount)>0?' · '+E(M(d.amount)):''}</p><p><span class="small muted">New draft${p.kind==='box'?' · Money Box transfer':''}</span><br><strong>${E(p.targetName)}</strong> · ${E(M(p.amount))}${p.sourceName?`<br><span class="small muted">From ${E(p.sourceName)}</span>`:''}</p><div class="actions">${B('Start this new draft',`L.openChatBankingDraft(${Number(L.params.index)},true)`)}${B('Keep my previous draft','L.closeTask()','secondary')}</div><p class="small muted">No money moves until you review and approve.</p></section>`;
};
L.views.chatBankingChoice=()=>{
 const reply=selected(L.params.index),p=reply?.bankingPending,index=Number(L.params.index);
 if(!p||!Array.isArray(p.choices))return L.header('Choose in your conversation.','Return and ask again.')+B('Back','L.back()');
 const title=p.missing==='source'?'Choose a budget item':p.kind==='box'?'Choose a Money Box':'Choose a recipient';
 return `<section class="chat-banking-choices">${L.header(title,reply.headline||'One detail to prepare your draft.')}<div class="list">${p.choices.map((c,i)=>L.row(c.name,c.targetKind==='merchant'?'Campus Pay merchant':c.targetKind==='person'?'Lumo recipient':c.targetKind==='box'?'Your savings account':'Your budget','chevron',`L.chatChooseBankingDetail(${index},${i})`)).join('')}</div><div class="actions">${B('Back to conversation','L.closeTask()','secondary')}</div></section>`;
};
L.chatChooseBankingDetail=(index,choice)=>{
 const saved=selected(index),p=saved?.bankingPending,c=p?.choices?.[Number(choice)];
 if(!p||!c||L.route!=='chatBankingChoice'||Number(L.params.index)!==Number(index))return false;
 const next={...copy(p)};delete next.missing;delete next.choices;
 if(p.missing==='source'){next.sourceId=c.id;next.sourceText=c.name;}else {next.targetId=c.id;next.targetText=c.name;next.targetKind=c.targetKind;}
 const reply=resolve(next);L.closeTask();
 L.state.chats.push({q:c.name,...reply});L.params=copy(reply.context)||{};L.save();L.render();L.announceChat?.(reply.text);return true;
};
L.views.chatCalendarPayments=()=>{
 const reply=selected(L.params.index),ids=reply?.calendarTxIds||[],txs=ids.map(id=>(L.state.txs||[]).find(t=>t.id===id)).filter(t=>t&&!internal(t)&&t.type==='out'&&t.status==='success');
 return `<section class="chat-calendar-payments">${L.header('Completed payments',reply?.contextLabel||'The payments included in your answer.')}<div class="list">${txs.map(t=>L.row(t.name,dateText(new Date(t.date).getTime())+' · '+(clean(t.category)||'Other'),'receipt',`L.go('txDetail',{id:${E(JSON.stringify(t.id))}})`,E(M(Number(t.amount)+Number(t.fee||0))))).join('')||'<p class="small muted">No completed payments to show.</p>'}</div><div class="actions">${B('Back to conversation','L.closeTask()','secondary')}</div></section>`;
};
for(const [route,treatment,label]of [['chatBankingChoice','selection','Complete your payment draft'],['chatBankingReplace','confirmation','Keep your saved payment?'],['chatCalendarPayments','detail','Completed payments']])L.taskSheet?.register?.(route,{family:'records',treatment,label});
})();
