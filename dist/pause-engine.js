/* Lumo Pause Engine MVP: specified behavioral Levels 1 and 2, plus the authorised independent saved-plan consequence trigger. */
(()=>{
'use strict';
const norm=x=>String(x||'').trim().toLowerCase().replace(/\s+/g,' ');
const money=x=>L.money(x);
const methodKey=x=>{const s=norm(x);if(s.includes('lumo'))return 'lumo';if(s.includes('mobile')||s==='momo')return 'momo';if(s.includes('bank'))return 'bank';if(s.includes('campus'))return 'campus';if(s.includes('request'))return 'request';return s;};
const recipientKey=d=>{if(d.recipientKey)return d.recipientKey;const source=d.paymentDraft||d;let dest=norm(d.destination||source.destination);if(!dest)return '';let method=methodKey(source.method||d.method);if(dest.startsWith('@'))method='lumo';if(method==='momo'){dest=dest.replace(/[\s()+-]/g,'');if(dest.startsWith('233'))dest='0'+dest.slice(3);}const provider=method==='momo'||method==='bank'?norm(d.provider||source.provider):'';return [method,provider,dest].join('|');};
const completed=s=>(s.txs||[]).filter(t=>t.type==='out'&&t.status==='success'&&Number(t.amount)>0&&Number.isFinite(Number(t.amount)));
const available=s=>Math.max(0,Number(s.balance||0)-(s.txs||[]).filter(t=>t.status==='pending'&&t.fundingAccount!=='virtual-card'&&(t.type==='out'||t.internalTransfer&&(t.boxDirection==='in'||t.cardDirection==='in'))).reduce((a,t)=>a+Number(t.amount||0)+Number(t.fee||0),0));
const withdrawing=d=>d?.method==='box'&&(d.boxDirection||d.direction)==='out';
// Work in pesewas when comparing planning gaps so a rounded cent cannot create a Pause.
const cents=x=>{const n=Number(x);return Number.isFinite(n)?Math.max(0,Math.round(n*100)):0;};
const cash=n=>n/100;
const planFacts=s=>({
 essentials:(s.essentials||[]).map(x=>[x.id||'',x.name||'',x.amount||0,x.paid||0,x.date||'']),
 goals:(s.goals||[]).map(x=>[x.id||'',x.name||'',x.allocated||0,x.target||0]),
 allowance:[s.allowance?.amount||0,s.allowance?.date||''],
 pending:(s.txs||[]).filter(t=>t.type==='out'&&t.status==='pending').map(t=>[t.id||'',t.essentialId||'',t.amount||0,t.fee||0])
});
const planPosition=(d,s,usable,after)=>{
 const pending=(s.txs||[]).filter(t=>t.type==='out'&&t.status==='pending');
 const essentials=(s.essentials||[]).map(x=>{
  const held=pending.filter(t=>x.id&&t.essentialId===x.id).reduce((n,t)=>n+cents(t.amount),0);
  const before=Math.max(0,cents(x.amount)-cents(x.paid)-held);
  const covered=x.id&&x.id===d.essentialId?Math.min(cents(d.amount),before):0;
  return {id:x.id||'',name:String(x.name||'').trim(),date:x.date||'',before,after:before-covered,covered};
 });
 const goals=(s.accounts?.version===2?[]:s.goals||[]).map(g=>({id:g.id||'',name:String(g.name||'').trim(),allocated:cents(g.allocated)})).filter(g=>g.allocated>0);
 const essentialBefore=essentials.reduce((n,x)=>n+x.before,0),essentialAfter=essentials.reduce((n,x)=>n+x.after,0),allocated=goals.reduce((n,g)=>n+g.allocated,0);
 const fundsBefore=cents(usable),fundsAfter=cents(Math.max(0,after));
 const essentialGapBefore=Math.max(0,essentialBefore-fundsBefore),essentialGapAfter=Math.max(0,essentialAfter-fundsAfter);
 const goalGapBefore=Math.max(0,allocated-Math.max(0,fundsBefore-essentialBefore)),goalGapAfter=Math.max(0,allocated-Math.max(0,fundsAfter-essentialAfter));
 return {essentials,goals,essentialBefore,essentialAfter,allocated,fundsBefore,fundsAfter,essentialGapBefore,essentialGapAfter,goalGapBefore,goalGapAfter};
};
const assessPlan=(d,s,usable,after)=>{
 const {essentials,goals,essentialBefore,essentialAfter,allocated,essentialGapBefore,essentialGapAfter,goalGapBefore,goalGapAfter}=planPosition(d,s,usable,after);
 let kind,gapBefore,gapAfter,name='',entityId='',date='';
 if(essentialGapAfter>essentialGapBefore){
  kind='essentials';gapBefore=essentialGapBefore;gapAfter=essentialGapAfter;
  const remaining=essentials.filter(x=>x.after>0);if(remaining.length===1){name=remaining[0].name;entityId=remaining[0].id;date=remaining[0].date;}
 }else if(goalGapAfter>goalGapBefore){
  kind='goals';gapBefore=goalGapBefore;gapAfter=goalGapAfter;
  if(goals.length===1){name=goals[0].name;entityId=goals[0].id;}
 }else return null;
 const extraGap=gapAfter-gapBefore;
 const subject=kind==='essentials'?(name?`the “${name}” ${s.accounts?.version===2?'budget':'plan'}`:s.accounts?.version===2?'your budget':'your saved essentials'):(name?`the “${name}” allocation`:'your goal allocations');
 const message=gapBefore>0?`This payment would add ${money(cash(extraGap))} to the gap in ${subject}, leaving ${money(cash(gapAfter))} uncovered.`:`This payment would leave ${subject} ${money(cash(gapAfter))} short.`;
 return {kind,gapBefore:cash(gapBefore),gapAfter:cash(gapAfter),extraGap:cash(extraGap),message,name,entityId,date,
  essentialsBefore:cash(essentialBefore),essentialsAfter:cash(essentialAfter),allocated:cash(allocated),essentialCovered:cash(essentialBefore-essentialAfter),
  essentialGapBefore:cash(essentialGapBefore),essentialGapAfter:cash(essentialGapAfter),goalGapBefore:cash(goalGapBefore),goalGapAfter:cash(goalGapAfter)};
};
const day=t=>new Date(t).toISOString().slice(0,10); // Accra is UTC, without daylight saving.
const evaluate=(d,s=L.state,now=Date.now())=>{
 const amount=Number(d?.amount),fee=Number(d?.fee||0),current=Number(s.balance||0),usable=available(s),after=Math.round((usable+(withdrawing(d)?amount:-amount)-fee)*100)/100||0;
 if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(fee)||fee<0)return {triggered:false,behavioralTriggered:false,planImpact:null,score:0,signals:[],selected:null,after:usable,valid:false};
 const time=Number(new Date(now)),today=day(time),hour=new Date(time).getUTCHours(),key=recipientKey(d);
 const history=completed(s).filter(t=>{const n=Number(new Date(t.date));return Number.isFinite(n)&&n<=time;});
 const paidToday=history.filter(t=>day(t.date)===today),spendToday=paidToday.reduce((a,t)=>a+Number(t.amount)+Number(t.fee||0),0);
 const same=key?history.filter(t=>recipientKey(t)===key):[];
 const week=same.filter(t=>time-Number(new Date(t.date))<=7*86400000),recent=same.filter(t=>time-Number(new Date(t.date))<=86400000);
 const firstName=String(d.name||'this recipient').split(' ')[0],verb=['lumo','momo','bank','request'].includes(methodKey(d.method))?'sent money to':'paid';
 const signals=[];
 const add=(condition,code,score,priority,message)=>{if(condition)signals.push({code,score,priority,message});};
 add(after<50,'low_balance',6,1,`After this payment, your available balance will be ${money(Math.max(0,after))}.`);
 add(current>0&&amount>current*.5,'large_share',4,2,'This payment uses more than half your balance.');
 add(amount>200,'large_payment',3,3,`You’re about to ${verb==='paid'?'pay':'send'} ${money(amount)}.`);
 add(week.length>=3,'repeat_recipient',3,4,`You’ve ${verb} ${firstName} ${week.length} times in the last 7 days.`);
 const paidEarlierToday=recent.some(t=>day(t.date)===today);
 add(recent.length>0,'recent_recipient',2,5,`You already ${verb} ${firstName} ${paidEarlierToday?'earlier today':'within the last 24 hours'}.`);
 add(spendToday>200,'daily_spend',2,6,`You’ve already spent ${money(spendToday)} today.`);
 add(paidToday.length>=5,'daily_frequency',2,7,`This would be your ${paidToday.length+1}${(paidToday.length+1)%100>=11&&(paidToday.length+1)%100<=13?'th':({1:'st',2:'nd',3:'rd'}[(paidToday.length+1)%10]||'th')} payment today.`);
 add(hour>=23||hour<5,'late_night',1,8,'You’re making this payment late at night.');
 signals.sort((a,b)=>a.priority-b.priority);
 const selectedCost=(s.essentials||[]).find(x=>x.id===d.essentialId&&!x.archived);
 const pendingCost=selectedCost?(s.txs||[]).filter(t=>t.status==='pending'&&t.type==='out'&&t.essentialId===selectedCost.id).reduce((sum,t)=>sum+Number(t.amount||0),0):0;
 const costRemaining=selectedCost?Math.max(0,Number(selectedCost.amount)-Number(selectedCost.paid||0)-pendingCost):0;
 // Plan impact is a separate, explainable trigger. It does not add a ninth behavioral score.
 const planImpact=after>=0&&!withdrawing(d)?assessPlan(d,s,usable,after):null;
 // A known, explicitly Budget-linked routine payment does not become an
 // interrupting decision solely because the student visits that merchant often.
 // Financial thresholds and every real Budget consequence remain authoritative.
 const routineCovered=!!selectedCost&&d.checked===true&&(methodKey(d.method)==='campus'||!!d.bill)&&amount<=costRemaining+.001&&!planImpact;
 const informationalSignals=routineCovered?signals.filter(x=>['repeat_recipient','recent_recipient'].includes(x.code)):[];
 const effectiveSignals=routineCovered?signals.filter(x=>!['repeat_recipient','recent_recipient'].includes(x.code)):signals;
 const score=withdrawing(d)?0:effectiveSignals.reduce((a,x)=>a+x.score,0),behavioralTriggered=score>=5;
 const selected=planImpact?{code:'plan_'+planImpact.kind,score:0,priority:0,message:planImpact.message}:effectiveSignals[0]||null;
 return {triggered:!withdrawing(d)&&after>=0&&(behavioralTriggered||Boolean(planImpact)),behavioralTriggered,planImpact,score,routineCovered,informationalSignals,signals:withdrawing(d)?[]:effectiveSignals,selected:withdrawing(d)?null:selected,after,available:usable,current,amount,fee,valid:true,recipientKey:key,today,repeatCount:week.length,recentCount:recent.length,paymentsToday:paidToday.length,spendToday};
};
const signature=(d,s=L.state,now=Date.now())=>{const q=evaluate(d,s,now);return JSON.stringify([q.amount,q.fee,q.available,q.current,q.recipientKey,q.today,q.score,q.signals.map(x=>[x.code,x.message]),d.essentialId||'',planFacts(s),q.planImpact]);};
const events=()=>L.state.pauseEvents||(L.state.pauseEvents=[]);
const log=(action,d,q,extra={})=>{if(!d||!q?.triggered)return;const sig=extra.exposureSignature||d.pauseOffer?.signature||signature(d);const unique=[d.id,sig,action].join('::');if(events().some(x=>x.unique===unique))return;events().push({id:L.id('pause'),unique,date:new Date().toISOString(),draftId:d.id,action,score:q.score,signal:q.selected.code,message:q.selected.message,amount:Number(d.amount),...extra});L.save();};
const present=d=>{const q=evaluate(d);if(q.triggered){d.pauseExposureSignature=signature(d);d.pauseOffer={signature:d.pauseExposureSignature,decision:q};log('shown',d,q);}return q;};
const respond=(action,d=L.state.paymentDraft)=>{const q=d?.pauseOffer?.decision;if(q)log(action,d,q,{exposureSignature:d.pauseOffer.signature});};
// Cash-unit facts for both safe and risky payments. UI and Chats share the
// exact pending/linked-cost calculations used above, without changing scoring.
const publicPlanPosition=(d,s=L.state)=>{
 const usable=available(s),after=Math.round((usable+(withdrawing(d)?Number(d?.amount||0):-Number(d?.amount||0))-Number(d?.fee||0))*100)/100||0;
 const p=planPosition(d||{},s,usable,after);
 return {available:cash(p.fundsBefore),after,
  essentials:p.essentials.map(x=>({...x,before:cash(x.before),after:cash(x.after),covered:cash(x.covered)})),
  goals:p.goals.map(x=>({...x,allocated:cash(x.allocated)})),
  essentialsBefore:cash(p.essentialBefore),essentialsAfter:cash(p.essentialAfter),allocated:cash(p.allocated),essentialCovered:cash(p.essentialBefore-p.essentialAfter),
  essentialGapBefore:cash(p.essentialGapBefore),essentialGap:cash(p.essentialGapAfter),goalGapBefore:cash(p.goalGapBefore),goalGap:cash(p.goalGapAfter),
  afterEssentials:cash(Math.max(0,p.fundsAfter-p.essentialAfter)),roomBefore:cash(Math.max(0,p.fundsBefore-p.essentialBefore-p.allocated)),room:cash(Math.max(0,p.fundsAfter-p.essentialAfter-p.allocated)),
  totalGapBefore:cash(p.essentialGapBefore+p.goalGapBefore),totalGap:cash(p.essentialGapAfter+p.goalGapAfter)};
};
L.pauseEngine={version:'mvp-1.1-plan-aware',threshold:5,evaluate,signature,recipientKey,present,respond,planPosition:publicPlanPosition};
L.pauseAction=action=>{const d=L.state.paymentDraft;if(!d)return L.go('pay');if(action==='edit_amount'){respond('edit_amount',d);if(d.requestId)L.go('requestDetail',{id:d.requestId});else L.editPayment();}else if(action==='cancel_payment'){respond('cancel_payment',d);L.state.paymentDraft=null;L.save();L.go('pay');}else if(action==='delay_payment'){respond('delay_payment',d);L.go('home');}};
L.keepPaymentLater=()=>{respond('delay_payment');L.go('pay');};
L.beforeNavigate=next=>{if(L.route==='pause'&&!['pause','authorize','paymentReview','paymentPlanLink','send','bill','paymentCancel','makeRoom','help','supportCase'].includes(next))respond('delay_payment');};
window.addEventListener?.('pagehide',()=>{if(L.route==='pause')respond('delay_payment');});
L.views.pauseLog=()=>{const list=[...events()].reverse();return L.header('Pause responses','Saved on this browser.')+`<div class="grid3">${['continue_payment','edit_amount','cancel_payment'].map((k,i)=>`<div class="soft"><span class="metric">${list.filter(x=>x.action===k).length}</span><p class="tiny muted">${['Continue','Edit','Cancel'][i]}</p></div>`).join('')}</div><div class="list">${list.slice(0,20).map(x=>`<div class="row"><span class="row-icon">${L.icon(x.action==='shown'?'eye':x.action==='continue_payment'?'arrowRight':x.action==='edit_amount'?'plan':x.action==='delay_payment'?'clock':'close')}</span><span class="row-copy"><strong>${L.e(x.action.replaceAll('_',' '))}</strong><small>${L.e(x.message)} · score ${x.score}</small></span></div>`).join('')||'<p class="muted small">Try a Pause, then choose an action.</p>'}</div><div class="actions">${L.btn('Download response log',"L.download('Lumo_Pause_Responses.json',JSON.stringify(L.state.pauseEvents||[],null,2),'application/json')",'secondary')}</div>`;};
})();
