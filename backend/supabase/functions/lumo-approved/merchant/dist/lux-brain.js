import {metricsFor, ledger, businessDay, financialTradingDay} from './domain.js';
import {calculateBusinessPlan, normalizeBusinessPlan} from './business-plan-model.js';

// Read-only business reasoning. Inference selects a tool; these functions own
// every amount, time window, permission boundary and in-app handoff.
export const MERCHANT_LUX_TASKS=Object.freeze(['collections','shops','changes','pending','refunds','funds','close','receipt','stock','expenses','plan','links','coverage','explain','help','clarify']);
export const MERCHANT_LUX_PERIODS=Object.freeze(['today','yesterday','this week','last week','this month','last month','last 7 days','last 30 days']);
const clean=(v,max=400)=>typeof v==='string'?v.trim().replace(/\s+/g,' ').slice(0,max):'';
const norm=v=>clean(v).normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'");
const iso=t=>new Date(t).toISOString().slice(0,10),DAY=86400000;
const validDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&iso(Date.parse(v))===v;
const shift=(day,amount)=>iso(Date.parse(day)+amount*DAY);
const amount=v=>{if(!Number.isSafeInteger(v)||v<0||v>9999999999)throw Error('Invalid money record');return v;};
const sum=rows=>{const total=rows.reduce((n,r)=>n+amount(r.amount),0);if(!Number.isSafeInteger(total))throw Error('Invalid money total');return total;};
export const merchantLuxMoney=v=>Number.isSafeInteger(v)?`GH₵${(v/100).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2})}`:'Unavailable';
export const privateMerchantQuestion=q=>/\b(?:pin|password|passcode|otp|access.?token|refresh.?token|ghana.?card|card number|cvv)\b.{0,32}(?:\d{3,}|[=:]\s*\S+)|\bGHA-\d{9}-\d\b|\b(?:\d[ -]?){13,19}\b/i.test(q);
const action=(label,page,extra={})=>({label,page,...extra});
const clarification=(title,body,followUps=[])=>({title,paragraphs:[body],stats:[],basis:[],actions:[],followUps,kind:'clarify'});
const allowedRole=actor=>actor&&['owner','manager'].includes(actor.role);

export function merchantLuxContext(messages=[]){
 const questions=messages.filter(m=>m?.role==='user'&&typeof m.text==='string'&&!privateMerchantQuestion(m.text)).slice(-6).map(m=>clean(m.text));
 const last=[...messages].reverse().find(m=>m?.role==='assistant'&&m.answer?.plan);
 return {questions,previous:last?.answer?.plan||null};
}

export function validateMerchantLuxPlan(input,question,context={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||!MERCHANT_LUX_TASKS.includes(input.task))return null;
 if(input.confidence!=null&&(!Number.isFinite(input.confidence)||input.confidence<0||input.confidence>1))return null;
 if(input.confidence!=null&&input.confidence<.72)return{task:'clarify'};
 const p={task:input.task},source=norm([...(context.questions||[]).slice(-6),question].join(' '));
 for(const key of ['shop','compareShop','reference'])if(input[key]){
  const value=clean(input[key],100);if(!value||!source.includes(norm(value))&&context.previous?.[key]!==value)return null;p[key]=value;
 }
 if(input.period){if(!MERCHANT_LUX_PERIODS.includes(input.period))return null;p.period=input.period;}
 for(const key of ['start','end'])if(input[key]){if(!validDay(input[key])||!source.includes(input[key]))return null;p[key]=input[key];}
 if(!!p.start!==!!p.end||p.start&&p.start>p.end)return null;
 return p;
}

export function planMerchantLux(question,context={}){
 const q=norm(question),previous=context.previous,follow=/^(?:and|what about|how about|just|only|instead|what if|that|the same|then)\b/.test(q);
 const period=MERCHANT_LUX_PERIODS.find(value=>q.includes(value));
 const date=q.match(/\bfrom (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})\b/);
 const p=follow&&previous?{...previous}:{task:'collections'};
 if(period){p.period=period;delete p.start;delete p.end;}
 if(date){p.start=date[1];p.end=date[2];delete p.period;}
 if(/^why[?!.\s]*$|how.*(?:work|calculate|know)|show.*(?:math|calculation)|what.*based on/.test(q))return{task:'explain'};
 if(/\blinks?\b/.test(q)){
  p.task='links';
  const token=q.match(/[?&]link=([a-z0-9_-]{3,100})\b/i)?.[1]||clean(question).match(/\b(?:payment\s+)?link(?:\s+(?:reference|id))?\s+([A-Za-z0-9][A-Za-z0-9_-]{2,99})\b/i)?.[1];
  if(token&&!['been','paid','payments','status','has','have','is','was','for','from','through','today','yesterday'].includes(norm(token)))p.reference=token;
  else if(/\b(?:this|that|it)\b/.test(q)&&previous?.task==='links'&&previous.reference)p.reference=previous.reference;
 }
 else if(/\b(?:after (?:my |our |the |business )*(?:business )?plan|(?:money|funds|left|remains?|remaining).*(?:plan|commitments)|business plan|planning estimate)\b/.test(q))p.task='plan';
 else if(/\b(?:stock|restock|restocking|inventory)\b/.test(q))p.task='stock';
 else if(/\b(?:expenses?|costs|bills)\b/.test(q)&&!/\b(?:profit|margin|profitable)\b/.test(q))p.task='expenses';
 else if(/\b(?:refund|refunds|return.*money|money.*back)\b/.test(q))p.task='refunds';
 else if(/\b(?:pending|processing|waiting|awaiting(?: confirmation)?|stuck|not confirmed)\b/.test(q))p.task='pending';
 else if(/\b(?:settle|settlement|withdraw|available|balance|money.*held|where.*money)\b/.test(q))p.task='funds';
 else if(/\b(?:close|closing|closed|reset|end of day|end the day)\b/.test(q))p.task='close';
 else if(/\b(?:profit|profitable|margin|cash sales|all (?:my |our )?sales|expenses|costs)\b/.test(q))p.task='coverage';
 else if(/\b(?:receipt|reference|landed|arrived|paid me|paid us|says.*paid|has.*paid|did.*pay)\b/.test(q)){
  p.task='receipt';const ref=clean(question).match(/\b(?:reference|receipt)\s+(?:is\s+)?([A-Za-z0-9][A-Za-z0-9_-]{2,99})\b/i)?.[1];if(ref&&!['number','please','today'].includes(norm(ref)))p.reference=ref;
 }
 else if(/\b(?:changed|change|more than|less than|usual|trend|trends|up or down|doing better|doing worse)\b|compar.*(?:week|month|yesterday|today|days)/.test(q))p.task='changes';
 else if(/\b(?:which shop|most|least|best shop|top shop|compare.*shops|shop comparison)\b/.test(q))p.task='shops';
 else if(/^(?:hi|hey|hello|thanks|thank you|who are you|what can you do|help)[?!.\s]*$/.test(q))p.task='help';
 else if(!follow&&!/collect|sales|paid|payment|take in|came in|received|made|income|today|yesterday/.test(q))p.task='clarify';
 const named=q.match(/\bhow much (?:did|has|have) (.+?) (?:collect|received?|take|make)\b/)?.[1]||q.match(/\b(?:at|from|only|just) (.+?)(?=\s+(?:today|yesterday|this|last|from)|[?.!]|$)/)?.[1];
 if(named){const name=clean(named.replace(/^(?:the|my|our)\s+/,''),100);if(!['we','i','you','us','business','shops','payments','collections','refunds','processing','customers','today','yesterday'].includes(name)&&!/^\d{4}-\d{2}-\d{2}/.test(name))p.shop=name;}
 if(/\ball shops\b/.test(q))p.shop='all';
 if(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|last year|semester|january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(q)&&!period&&!date)p.task='clarify';
 if(p.task==='changes'&&!p.start){if(/(?:than|compared to|versus|vs) last week/.test(q))p.period='this week';else if(/(?:than|compared to|versus|vs) last month/.test(q))p.period='this month';else if(!p.period)p.period='this week';}
 return p;
}

function visibleBusiness(state,actor){
 if(!state?.business?.id||!allowedRole(actor)||actor.businessId&&actor.businessId!==state.business.id)throw Error('FORBIDDEN');
 const allowed=new Set(actor.role==='owner'?(state.shops||[]).map(s=>s.id):actor.shopIds||[]);
 const result={...state,shops:(state.shops||[]).filter(s=>allowed.has(s.id))};
 if(!result.shops.length)throw Error('FORBIDDEN');
 for(const key of ['transactions','refunds','requests','closings','shifts','reconciliations','paymentLinks','guestCollections'])result[key]=(state[key]||[]).filter(row=>allowed.has(row.shopId));
 result.settlements=actor.role==='owner'?(state.settlements||[]):[];result.openingBalance=actor.role==='owner'?state.openingBalance||0:0;
 if(actor.role!=='owner'){
  const plan=normalizeBusinessPlan(state.businessPlan),permitted=new Set((plan.managerShopIds||[]).filter(id=>allowed.has(id)));
  const projected=state.businessPlan?.scope==='shops'&&state.businessPlanAccess?.canView===true;
  if(projected)for(const id of state.businessPlanAccess.allowedShopIds||[])if(allowed.has(id))permitted.add(id);
  result.businessPlan={...plan,scope:'shops',stockReserve:{amount:0},managerShopIds:[...permitted],allowedShopIds:[...permitted],expenses:plan.expenses.filter(row=>row.shopId&&permitted.has(row.shopId))};
  result.businessPlanAccess={canView:permitted.size>0,canEdit:false,scope:'shops',allowedShopIds:[...permitted]};
  delete result.businessPlanSummary;
 }
 return result;
}
function shopChoice(state,value){
 const n=norm(value);if(!n||n==='all'||n==='all shops')return{all:true};
 const exact=state.shops.filter(s=>norm(s.name)===n||s.id===value);if(exact.length===1)return{shop:exact[0]};
 const choices=state.shops.filter(s=>norm(s.name).includes(n)||norm(s.area)===n);
 if(choices.length===1)return{shop:choices[0]};
 return{error:clarification(choices.length?'Which shop did you mean?':'That shop is outside this view.',choices.length?`Choose ${choices.map(s=>s.name).join(' or ')}.`:'Choose one of the shops you have access to, or change the shop filter.')};
}
function scopeFor(state,actor,selection,plan){
 const requested=plan.shop||selection,choice=shopChoice(state,requested);
 if(choice.error)return choice;
 if(plan.shop&&['all','all shops'].includes(norm(plan.shop))&&actor.role!=='owner')return{error:clarification('Your view stays with your assigned shops.','The owner can compare the whole business. I can explain the shops assigned to your account.',['How much did we collect today?'])};
 return{all:choice.all===true,ids:choice.shop?[choice.shop.id]:state.shops.map(s=>s.id),label:choice.shop?choice.shop.name:state.shops.length===1?state.shops[0].name:actor.role==='owner'?'All shops':'Your assigned shops'};
}
function windowFor(state,shopId,p,now){
 const shop=state.shops.find(s=>s.id===shopId),today=businessDay(now,shop?.cutoff||state.business.cutoff||'00:00'),d=new Date(today+'T00:00:00Z'),period=p.period||'today';
 if(p.start&&p.end){if(!validDay(p.start)||!validDay(p.end)||p.start>p.end||p.end>today||Date.parse(p.end)-Date.parse(p.start)>366*DAY)throw Error('DATES');return{start:p.start,end:p.end,label:`${p.start} to ${p.end}`};}
 let start=today,end=today;
 if(period==='yesterday')start=end=shift(today,-1);
 else if(period==='this week')start=shift(today,-((d.getUTCDay()+6)%7));
 else if(period==='last week'){end=shift(today,-((d.getUTCDay()+6)%7)-1);start=shift(end,-6);}
 else if(period==='this month')start=today.slice(0,7)+'-01';
 else if(period==='last month'){start=iso(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1));end=iso(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),0));}
 else if(period==='last 7 days'||period==='last 30 days')start=shift(today,period==='last 7 days'?-6:-29);
 return{start,end,label:period};
}
function records(state,ids,plan,now,{previous=false}={}){
 const windows=new Map(ids.map(id=>{
  const w=windowFor(state,id,plan,now),p=plan.period||'today';
  if(previous){
   if(p==='this week'){w.start=shift(w.start,-7);w.end=shift(w.end,-7);}
   else if(p==='this month'){const a=new Date(w.start),b=new Date(w.end),last=iso(Date.UTC(a.getUTCFullYear(),a.getUTCMonth(),0));w.start=iso(Date.UTC(a.getUTCFullYear(),a.getUTCMonth()-1,1));w.end=iso(Date.UTC(a.getUTCFullYear(),a.getUTCMonth()-1,Math.min(b.getUTCDate(),new Date(last).getUTCDate())));}
   else if(p==='last month'){const a=new Date(w.start);w.start=iso(Date.UTC(a.getUTCFullYear(),a.getUTCMonth()-1,1));w.end=iso(Date.UTC(a.getUTCFullYear(),a.getUTCMonth(),0));}
   else{const length=Math.floor((Date.parse(w.end)-Date.parse(w.start))/DAY)+1;w.end=shift(w.start,-1);w.start=shift(w.start,-length);}
  }
  return[id,w];
 }));
 const matches=(row,kind)=>{const w=windows.get(row.shopId);if(!w)return false;const date=financialTradingDay(state,row,kind);return date>=w.start&&date<=w.end;};
 const paid=state.transactions.filter(row=>row.status==='paid'&&matches(row,'payment')),refunds=state.refunds.filter(row=>row.status==='paid'&&matches(row,'refund'));
 return{paid,refunds,gross:sum(paid),returned:sum(refunds),net:sum(paid)-sum(refunds),windows};
}
const periodLabel=p=>p.start?`${p.start} to ${p.end}`:p.period||'today';
function reviewFilters(state,scope,p,now,item){
 const filters={shopId:scope.ids.length===1?scope.ids[0]:'all',status:item.activityStatus||'all',period:'all',search:p.task==='receipt'?p.reference||'':''};
 if(['collections','shops','changes'].includes(p.task)||p.task==='pending'&&(p.period||p.start)){
  if(!p.start&&(!p.period||p.period==='today'))filters.period='today';
  else{const ranges=scope.ids.map(id=>windowFor(state,id,p,now));if(ranges.every(w=>w.start===ranges[0].start&&w.end===ranges[0].end))Object.assign(filters,{period:'custom',from:ranges[0].start,to:ranges[0].end});}
 }
 return filters;
}
function basisFor(state,scope,p,now,actor){
 if(['stock','expenses','plan'].includes(p.task))return[
  `Scope: ${scope.label}. Current recorded commitments as of ${now.toISOString()}; this is not a daily collection total.`,
  'Available merchant funds already exclude ledger holds. The business plan is an estimate, not a ledger reservation or a payment.',
  'Planned stock expenses are covered by the stock reserve up to its target; only the larger stock commitment is deducted. Recorded expenses already reflected in the ledger are not deducted again.',
  'Expenses recorded as paid externally came from outside this Lumo account. Recording them does not debit merchant funds or prove a supplier was paid.'
 ];
 if(p.task==='links')return[
  `Scope: ${scope.label}. ${p.reference?'The exact link is checked across its recorded lifetime.':`Confirmed receipts use ${periodLabel(p)} trading dates; unpaid link status is current.`}`,
  'Source totals count only guest MoMo receipts with a canonical link identifier. A fixed request may also be paid from its original QR; request status is checked separately and does not prove shared-link origin.',
  'Guest mobile money collections in this build are explicitly sandbox transactions. A sandbox ledger posting does not prove live provider settlement, and collecting does not connect withdrawals.'
 ];
 if(p.task==='funds'&&actor.role==='owner'&&scope.all){const m=ledger(state),received=sum(state.transactions.filter(r=>r.status==='paid')),returned=sum(state.refunds.filter(r=>r.status==='paid')),payouts=state.settlements.filter(r=>r.status==='paid').reduce((n,r)=>n+amount(r.amount)+(r.fee?amount(r.fee):0),0);return[`${merchantLuxMoney(state.openingBalance)} opening balance + ${merchantLuxMoney(received)} confirmed receipts − ${merchantLuxMoney(returned)} completed refunds − ${merchantLuxMoney(payouts)} completed payouts and fees = ${merchantLuxMoney(m.balance)} account balance.`,`${merchantLuxMoney(m.balance)} account balance − ${merchantLuxMoney(m.reserved)} reserved = ${merchantLuxMoney(m.available)} after reservations.`,`Scope: ${scope.label}. Account and open-period amounts are checked as of ${now.toISOString()}.`,'The merchant account uses all recorded confirmed receipts, completed refunds and completed payouts. Pending payouts and refunds reserve funds. A shop counter is an allocation within the shared account.'];}
 if(p.task==='funds'){const m=metricsFor(state,scope.ids.length===1?scope.ids[0]:null);return[`${merchantLuxMoney(m.currentGross)} uncaptured confirmed receipts − ${merchantLuxMoney(m.currentRefunds)} uncaptured completed refunds = ${merchantLuxMoney(m.currentNet)} in this shop collection period.`,'A shop collection counter is separate from the owner’s shared merchant account balance.'];}
 if(p.task==='close')return[`Scope: ${scope.label}. This is the open collection period, including uncaptured receipts, refunds and recorded late adjustments. It is not limited to calendar today.`,'Closing records a shop period and resets its counter. It does not send or withdraw merchant money.'];
 if(p.task==='receipt')return[`Scope: ${scope.label}. The exact receipt reference is checked against current authorised payment records, without assuming a date.`,'Only a recorded confirmed status proves receipt in this test service. Screenshots and unpaid requests do not.'];
 if(p.task==='pending'&&!p.period&&!p.start)return[`Scope: ${scope.label}. This is the current processing queue across its recorded dates. Unpaid open requests are listed separately.`,'A processing receipt has not confirmed money received. The elapsed time does not guarantee an outcome or completion time.'];
 return[`Scope: ${scope.label}. Period: ${periodLabel(p)}.`,...scope.ids.map(id=>{const s=state.shops.find(s=>s.id===id),w=windowFor(state,id,p,now);return`${s.name}: trading dates ${w.start}–${w.end}, using its recorded closing cutoff (${s.cutoff||state.business.cutoff||'00:00'} Accra time).`;}),'Confirmed receipts count as collections. Only completed refunds reduce net collections; processing, failed and unpaid requests are excluded. Cash, outside sales, costs and profit are not inferred.'];
}
export function merchantLuxEvidence(state,actor,now=new Date()){
 const s=visibleBusiness(state,actor),rows=key=>s[key].map(r=>[r.id,r.shopId,r.amount,r.fee,r.status,r.payer,r.reference,r.createdAt,r.confirmedAt,r.paidAt,r.tradingDay,r.tradingCutoff,r.periodStartedAt,r.businessDay,r.transactionIds,r.refundIds]);
 return JSON.stringify({business:s.business.id,actor:[actor.id||actor.userId||'',actor.role,[...(actor.shopIds||[])].sort()],shops:s.shops.map(x=>[x.id,x.name,x.cutoff,businessDay(now,x.cutoff||s.business.cutoff||'00:00')]),opening:s.openingBalance,transactions:rows('transactions'),refunds:rows('refunds'),requests:rows('requests'),closings:rows('closings'),settlements:rows('settlements'),businessPlan:s.businessPlan||null,businessPlanAccess:s.businessPlanAccess||null,paymentLinks:s.paymentLinks.map(r=>[r.id,r.shopId,r.kind,r.requestId,r.amount,r.description,r.status,r.expiresAt,r.confirmedCount,r.confirmedAmount,r.pendingCount,r.pendingAmount,r.guestConfirmedAmount,r.lumoConfirmedAmount,r.requestPayment?[r.requestPayment.id,r.requestPayment.reference,r.requestPayment.amount,r.requestPayment.currency,r.requestPayment.status,r.requestPayment.createdAt,r.requestPayment.rail,r.requestPayment.requestId,r.requestPayment.shopId]:null]),guestCollections:s.guestCollections.map(r=>[r.id,r.shopId,r.linkId,r.requestId,r.reference,r.providerReference,r.amount,r.status,r.createdAt,r.confirmedAt,r.journalId,r.providerMode,r.settlementStatus,r.refundedAmount])});
}
export function merchantLuxStale(state,answer,{actor,now=new Date()}={}){
 if(!answer?.evidence)return false;try{return answer.evidence!==merchantLuxEvidence(state,actor,now);}catch{return true;}
}

function collections(state,scope,p,now){
 const r=records(state,scope.ids,p,now);
 return{title:r.paid.length?`${merchantLuxMoney(r.net)} in net Lumo collections.`:'No confirmed collections in this period.',paragraphs:[`${r.paid.length} confirmed ${r.paid.length===1?'payment':'payments'} ${periodLabel(p)}${r.paid.length?`, averaging ${merchantLuxMoney(Math.round(r.gross/r.paid.length))}`:''}.`,r.returned?`${merchantLuxMoney(r.gross)} received − ${merchantLuxMoney(r.returned)} in completed refunds = ${merchantLuxMoney(r.net)} net collections.`:'Processing payments and unpaid checkout requests do not add to this total.'],basis:[`${merchantLuxMoney(r.gross)} confirmed receipts − ${merchantLuxMoney(r.returned)} completed refunds = ${merchantLuxMoney(r.net)} net collections.`],stats:[{label:'Confirmed collections',value:merchantLuxMoney(r.gross)},{label:'Completed refunds',value:merchantLuxMoney(r.returned)},{label:'Net collections',value:merchantLuxMoney(r.net)}],actions:[action('Review payments','activity',{activityStatus:'all'})],followUps:['What is still processing?','What changed in our collections?']};
}
function shops(state,scope,p,now){
 let ids=scope.ids;
 if(p.compareShop){const choice=shopChoice(state,p.compareShop);if(choice.error)return choice.error;if(choice.shop)ids=[...new Set([...scope.ids,choice.shop.id])];}
 if(ids.length<2)return clarification('There is one shop in this view.','A comparison needs at least two shops within your access. I can explain this shop’s collections.',['How much did we collect today?']);
 const rows=ids.map(id=>({shop:state.shops.find(s=>s.id===id),...records(state,[id],p,now)})).sort((a,b)=>b.gross-a.gross);
 const leaders=rows.filter(r=>r.gross===rows[0].gross),total=rows.reduce((n,r)=>n+r.gross,0);
 return{title:!total?'No confirmed collections to rank.':leaders.length>1?'There is no single leader.':`${rows[0].shop.name} received the most.`,paragraphs:[`This compares confirmed Lumo collections ${periodLabel(p)}, before completed refunds. It measures collection volume, not profit.`,...rows.slice(0,3).map(r=>`${r.shop.name}: ${merchantLuxMoney(r.gross)} from ${r.paid.length} confirmed payments; ${merchantLuxMoney(r.net)} after completed refunds.`)],stats:rows.slice(0,3).map(r=>({label:r.shop.name,value:merchantLuxMoney(r.gross)})),actions:[action('View shop performance','overview')],followUps:['What changed in our collections?','Show the calculation']};
}
function changes(state,scope,p,now){
 const a=records(state,scope.ids,p,now),b=records(state,scope.ids,p,now,{previous:true}),delta=a.net-b.net;
 const dates=[...b.windows].map(([id,w])=>`${state.shops.find(s=>s.id===id).name}: ${w.start}–${w.end}`).join('; ');
 return{title:!a.paid.length&&!b.paid.length?'There isn’t a collection pattern to call yet.':delta===0?'Net collections are the same in these records.':`${merchantLuxMoney(Math.abs(delta))} ${delta>0?'more':'less'} in net collections.`,paragraphs:[`${merchantLuxMoney(a.net)} ${periodLabel(p)}, compared with ${merchantLuxMoney(b.net)} in the earlier period.`,b.gross?`The change includes ${merchantLuxMoney(a.gross-b.gross)} in receipt differences and ${merchantLuxMoney(a.returned-b.returned)} in refund differences.`:'There is no earlier confirmed collection baseline, so a “usual” level or percentage would be misleading.','This describes recorded Lumo collections. It cannot explain changes in cash sales or costs that are not recorded.'],stats:[{label:'Current period · net',value:merchantLuxMoney(a.net)},{label:'Earlier period · net',value:merchantLuxMoney(b.net)}],basis:[`${merchantLuxMoney(a.gross)} − ${merchantLuxMoney(a.returned)} = ${merchantLuxMoney(a.net)} now; ${merchantLuxMoney(b.gross)} − ${merchantLuxMoney(b.returned)} = ${merchantLuxMoney(b.net)} earlier.`,`Earlier trading dates: ${dates}.`,p.period==='this week'?'Compared the same elapsed weekdays.':p.period==='this month'?'Compared elapsed calendar dates, clipped to the earlier month’s last day.':p.period==='last month'?'Full calendar months can have different lengths.':'Compared equal preceding date windows.'],actions:[action('Review reports','reports')],followUps:['Which shop collected the most?','Show the calculation']};
}
function pending(state,scope,p,now){
 const filter=row=>scope.ids.includes(row.shopId)&&(!p.period&&!p.start||(()=>{const w=windowFor(state,row.shopId,p,now),d=financialTradingDay(state,row);return d>=w.start&&d<=w.end;})());
 const queue=state.transactions.filter(r=>r.status==='processing'&&filter(r)),requests=state.requests.filter(r=>['open','active'].includes(r.status)&&scope.ids.includes(r.shopId)&&Date.parse(r.expiresAt)>now.getTime()),guest=state.guestCollections.filter(r=>['pending','processing','unknown'].includes(r.status)&&filter(r)&&!queue.some(payment=>payment.id===r.journalId));
 const oldest=queue.map(r=>Date.parse(r.createdAt)).filter(t=>Number.isFinite(t)&&t<=now.getTime()).sort((a,b)=>a-b)[0],age=oldest===undefined?null:Math.floor((now-oldest)/60000);
 return{title:guest.length?`${queue.length+guest.length} ${queue.length+guest.length===1?'payment is':'payments are'} still awaiting confirmation.`:queue.length?`${queue.length} ${queue.length===1?'payment is':'payments are'} still processing.`:'No processing payments in this view.',paragraphs:[queue.length?`${merchantLuxMoney(sum(queue))} is awaiting confirmation${p.period||p.start?` for ${periodLabel(p)}`:''}. It is excluded from confirmed collections and available merchant funds.`:'A customer’s message or screenshot cannot confirm a payment. Use the recorded receipt status.',...(guest.length?[`${guest.length} guest MoMo sandbox ${guest.length===1?'attempt is':'attempts are'} also awaiting confirmation, totalling ${merchantLuxMoney(sum(guest))}. An initiated provider attempt or elapsed time is not money received.`]:[]),...(age!==null?[`The oldest has been processing for about ${age<60?`${age} minutes`:`${Math.floor(age/60)} hours`}. This is elapsed time, not a promised completion time.`]:[]),...(requests.length?[`${requests.length} open checkout ${requests.length===1?'request is':'requests are'} also waiting to be paid. A request is not money received.`]:[])],stats:[{label:'Processing amount',value:merchantLuxMoney(sum(queue)+sum(guest))},{label:'Processing payments',value:String(queue.length+guest.length)}],actions:[action('Check original references','activity',{activityStatus:'processing'}),...(guest.length?[action('Review payment links','payment-links')]:[])],followUps:['How do I confirm a payment?','How much did we collect today?']};
}
function refunds(state,scope,p,now){
 const r=records(state,scope.ids,p,now),waiting=state.refunds.filter(x=>scope.ids.includes(x.shopId)&&['requested','processing'].includes(x.status));
 return{title:`${merchantLuxMoney(r.returned)} in completed refunds.`,paragraphs:[`${r.refunds.length} completed ${r.refunds.length===1?'refund':'refunds'} ${periodLabel(p)}. A refund reduces net collections on its recorded refund trading date, even when the original sale was earlier.`,waiting.length?`${waiting.length} ${waiting.length===1?'refund is':'refunds are'} awaiting approval or completion, totalling ${merchantLuxMoney(sum(waiting))}. These remain separate from completed refunds.`:'There are no refunds awaiting approval or completion in this shop view.','To return money, open the original payment and review its remaining refundable amount. This chat does not approve or issue a refund.'],stats:[{label:'Completed in period',value:merchantLuxMoney(r.returned)},{label:'Awaiting approval/completion',value:merchantLuxMoney(sum(waiting))}],actions:[action('Review payments and refunds','activity')],followUps:['What changed in our collections?','Show the calculation']};
}
function funds(state,actor,scope,{settlementConnected=false}={}){
 if(actor.role!=='owner'||!scope.all){const id=scope.ids.length===1?scope.ids[0]:null,m=metricsFor(state,id);return{title:'Shop collections are part of the shared account.',paragraphs:[`${merchantLuxMoney(m.currentNet)} is recorded in the current collection period for ${scope.label}. Closing that shop period resets its counter; the funds remain in the merchant account.`,actor.role==='owner'?'Choose All shops for the business account’s full balance.':'The owner controls the shared merchant account and settlement. Your view stays within your assigned shops.'],stats:[{label:'Current collection period · net',value:merchantLuxMoney(m.currentNet)}],actions:[action('Review shop activity','activity')],followUps:['What happens when I close the day?']};}
 const m=ledger(state);
 return{title:`${merchantLuxMoney(m.available)} after reservations.`,paragraphs:[`${merchantLuxMoney(m.balance)} is held in the merchant account. ${merchantLuxMoney(m.reserved)} is reserved for pending refunds or payouts.`,'Collections measure confirmed incoming payments. Available money also includes the opening balance and adjusts for completed refunds, completed payouts, fees and ledger holds. Planned business expenses are a separate estimate; they do not change this balance.',settlementConnected?'Review the destination, amount and any fee in Settlements before authorising a payout.':'Transfers out are not connected in this shared test. This balance is not a promise that a bank payout can run.', 'Closing a shop day resets its collection counter. It does not remove money from this account.'],stats:[{label:'Merchant account',value:merchantLuxMoney(m.balance)},{label:'Reserved',value:merchantLuxMoney(m.reserved)},{label:'After reservations',value:merchantLuxMoney(m.available)}],actions:[action('View merchant funds','settlements')],followUps:['How much remains after my business plan?','What is still processing?']};
}
function close(state,scope,p,now){
 if(scope.ids.length!==1)return{title:'Closing a shop day resets its collection counter.',paragraphs:['The money stays in the shared merchant account. Closing captures a shop period; it does not send funds out.',`Choose which shop to review: ${scope.ids.map(id=>state.shops.find(s=>s.id===id).name).join(', ')}.`],stats:[],actions:[action('Review shop activity','overview')],followUps:['Where is our money?']};
 const id=scope.ids[0],m=metricsFor(state,id,{now:now.toISOString()});
 return{title:`${scope.label}: ${merchantLuxMoney(m.currentNet)} in the open collection period.`,paragraphs:[`${merchantLuxMoney(m.currentGross)} in confirmed receipts, less ${merchantLuxMoney(m.currentRefunds)} in completed refunds. Processing payments remain separate.`, 'Closing captures this shop’s recorded receipts and refunds and starts a fresh collection counter. The money stays in the shared merchant account.','Review the close screen, including any late or prior-period adjustments, before confirming. Nothing has been closed in chat.'],stats:[{label:'Open period · receipts',value:merchantLuxMoney(m.currentGross)},{label:'Open period · refunds',value:merchantLuxMoney(m.currentRefunds)},{label:'Open period · net',value:merchantLuxMoney(m.currentNet)}],actions:[action('Review shop close','close',{shopId:id})],followUps:['What is still processing?','Where is the money after closing?']};
}
function receipt(state,scope,p){
 if(!p.reference)return clarification('Which Lumo reference should I check?','Use the exact reference from the payment. I can check the recorded status within your shop access; a screenshot alone is not confirmation.');
 const found=state.transactions.filter(r=>scope.ids.includes(r.shopId)&&[r.reference,r.id].some(v=>norm(v)===norm(p.reference)));
 if(found.length!==1)return clarification(found.length?'That reference is not unique in this view.':'No matching receipt in this view.','Check the exact reference and selected shop in Payments. I won’t confirm money that is not in your authorised records.');
 const r=found[0];amount(r.amount);const paid=r.status==='paid';
 return{title:paid?'This payment is confirmed.':r.status==='processing'?'This payment is still processing.':'This receipt does not confirm money received.',paragraphs:[`${r.reference||r.id}: ${merchantLuxMoney(r.amount)} at ${state.shops.find(s=>s.id===r.shopId).name}.`,paid?'It is included in confirmed collections. Any refund remains a separate linked record.':'Use the current receipt status in Payments before treating this as money received.'],stats:[{label:'Recorded amount',value:merchantLuxMoney(r.amount)},{label:'Status',value:r.status}],actions:[action('Open payment activity','activity')],followUps:['What is still processing?']};
}

function planning(state,actor,scope,p,now){
 if(actor.role!=='owner'&&state.businessPlanAccess?.canView!==true)return clarification('The owner hasn’t shared this business plan.','Ask the owner to allow planning access for your assigned shop. Collection and refund access does not give access to business planning.');
 if(p.start||p.end||p.period&&p.period!=='today')return clarification('The business plan is a current estimate.','Historical plan snapshots and period-specific forecasts are not recorded here. Ask about the current plan or open its recorded expenses and due dates.',['What expenses are coming up?','How much remains after my business plan?']);
 const shopId=scope.all?null:scope.ids[0],summary=calculateBusinessPlan(state,{shopId,now});
 const full=summary.scope==='business',next=summary.upcomingExpenses||[],recorded=summary.recordedExpenses||[];
 const review=[action('Review business plan','business-plan',shopId?{shopId}:{})];
 const scopeNote=full?'This includes every shop’s recorded commitments.':`${summary.coverage} ${actor.role==='owner'?'Choose All shops to see the full after-plan estimate.':'The owner keeps the merchant account and business-wide reserve private.'}`;
 const expenseLine=expense=>`${expense.title}: ${merchantLuxMoney(expense.amount)}${expense.dueDate?`, ${expense.overdue?'overdue since':'due'} ${expense.dueDate}`:', no due date recorded'}.`;
 if(p.task==='expenses')return{
  title:next.length?`${next.length} planned ${next.length===1?'expense needs':'expenses need'} attention.`:'No upcoming expenses are recorded in this view.',
  paragraphs:[scopeNote,...next.slice(0,5).map(expenseLine),...(next.length>5?[`${next.length-5} more are listed in the business plan.`]:[]),`${recorded.length} recorded ${recorded.length===1?'expense is':'expenses are'} separate from upcoming commitments. ${merchantLuxMoney(summary.externalRecordedTotal)} was recorded as paid from outside this Lumo account; it is not deducted from Lumo funds.`,summary.excludedLedgerExpenses.length?`${summary.excludedLedgerExpenses.length} recorded ${summary.excludedLedgerExpenses.length===1?'expense is':'expenses are'} linked to an already completed ledger debit and excluded from planned commitments.`:'Recording an expense does not pay a supplier or move any Lumo money.'],
  stats:[{label:'Planned commitments',value:merchantLuxMoney(summary.totalCommitments)},{label:'Upcoming expenses',value:String(next.length)},{label:'Recorded outside Lumo',value:merchantLuxMoney(summary.externalRecordedTotal)}],
  actions:review,followUps:['How much remains after my business plan?','How much should I keep for stock?']
 };
 if(p.task==='stock')return{
  title:summary.stockCommitment?`${merchantLuxMoney(summary.stockCommitment)} in your recorded stock plan.`:'There isn’t a stock target to recommend from yet.',
  paragraphs:[scopeNote,full?`Your stock reserve target is ${merchantLuxMoney(summary.stockReserve)}. Recorded unpaid stock expenses total ${merchantLuxMoney(summary.stockCoveredCommitments)}. The larger amount, ${merchantLuxMoney(summary.stockCommitment)}, is included once in the plan.`:`Recorded unpaid stock expenses in this shop view total ${merchantLuxMoney(summary.stockCommitment)}. The business-wide stock reserve is not shown here.`, 'A sensible stock target needs your restocking costs and trading needs. Lux uses the target and expenses you record; it does not invent a recommended stock amount from collections alone.','This is a planning commitment, not locked savings or a supplier payment.'],
  stats:[...(full?[{label:'Stock reserve target',value:merchantLuxMoney(summary.stockReserve)}]:[]),{label:'Unpaid stock expenses',value:merchantLuxMoney(summary.stockCoveredCommitments)},{label:'Stock commitment · counted once',value:merchantLuxMoney(summary.stockCommitment)}],
  actions:review,followUps:['What expenses are coming up?','How much remains after my business plan?']
 };
 if(!full)return{
  title:`${merchantLuxMoney(summary.totalCommitments)} in this shop’s planned commitments.`,
  paragraphs:[scopeNote,'An after-plan business figure needs the complete merchant account and all shops’ commitments. Subtracting only this shop’s plan from the shared balance would leave out the other shops.','Planning does not reserve funds in the ledger or initiate a payment.'],
  stats:[{label:'Selected shop commitments',value:merchantLuxMoney(summary.totalCommitments)}],actions:review,followUps:['What expenses are coming up?']
 };
 return{
  title:summary.afterPlan<0?`The recorded plan exceeds available funds by ${merchantLuxMoney(-summary.afterPlan)}.`:`${merchantLuxMoney(summary.afterPlan)} remains after the recorded plan.`,
  paragraphs:[`${merchantLuxMoney(summary.available)} available after existing ledger holds − ${merchantLuxMoney(summary.stockCommitment)} for stock − ${merchantLuxMoney(summary.otherCommitments)} in other planned expenses = ${merchantLuxMoney(summary.afterPlan)} after the plan.`,scopeNote,'This is a planning estimate. It is not profit, a guaranteed spending allowance or a promise that a withdrawal or supplier payment is connected.','Recorded ledger expenses have already affected funds and are not deducted again. Expenses recorded as paid externally came from outside this Lumo account.'],
  stats:[{label:'After ledger holds',value:merchantLuxMoney(summary.available)},{label:'Stock · counted once',value:merchantLuxMoney(summary.stockCommitment)},{label:'Other planned expenses',value:merchantLuxMoney(summary.otherCommitments)},{label:'After plan · estimate',value:merchantLuxMoney(summary.afterPlan)}],
  actions:review,followUps:['What expenses are coming up?','Why is available money different from collections?']
 };
}

const linkCount=value=>amount(value??0);
const linkedReceipt=receipt=>!!receipt.linkId&&(receipt.source==='guest-momo'||receipt.rail==='momo');
function requestPaymentFor(link){
 const payment=link.requestPayment;
 return link.kind==='request'&&payment&&payment.status==='posted'&&payment.currency==='GHS'&&Number.isSafeInteger(payment.amount)&&payment.amount>0&&payment.amount===link.amount&&payment.requestId===link.requestId&&payment.shopId===link.shopId&&typeof payment.id==='string'&&!!payment.id&&typeof payment.reference==='string'&&!!payment.reference&&['lumo','momo'].includes(payment.rail)?payment:null;
}
function links(state,scope,p,now,question){
 const available=state.paymentLinks.filter(link=>scope.ids.includes(link.shopId));
 if(p.reference){
  const found=available.filter(link=>[link.id,link.publicToken,link.requestId].some(value=>value&&norm(value)===norm(p.reference)));
  if(found.length!==1)return clarification('No unique payment link matches that reference.','Check the link reference in Payment links. I won’t confirm a link from a customer’s screenshot or a similar amount.');
  const link=found[0],requestPayment=requestPaymentFor(link),confirmed=requestPayment?1:linkCount(link.confirmedCount),received=requestPayment?requestPayment.amount:amount(link.confirmedAmount??0),waiting=linkCount(link.pendingCount),pendingAmount=amount(link.pendingAmount??0),guest=amount(link.guestConfirmedAmount??0);
  const expired=link.expiresAt&&Date.parse(link.expiresAt)<=now.getTime(),status=link.status==='paid'&&confirmed?'paid':link.status==='paid'?'unverified':expired&& !['paid','cancelled'].includes(link.status)?'expired':link.status;
  const oneOff=link.kind==='request',description=clean(link.description,120)||'Merchant payment';
  return{
   title:confirmed?`${confirmed} confirmed ${confirmed===1?'payment':'payments'} for ${oneOff?'the linked request':'this link'}.`:waiting?'This link has a payment awaiting confirmation.':'This link has no confirmed payment in the recorded service.',
   paragraphs:[`${description} · ${state.shops.find(shop=>shop.id===link.shopId)?.name||'Assigned shop'}. ${oneOff?`Fixed amount: ${merchantLuxMoney(amount(link.amount))}.`:'Reusable shop link; each customer reviews their own amount.'}`,...(requestPayment?[`Canonical payment reference: ${requestPayment.reference}. The linked request was paid ${requestPayment.rail==='lumo'?'from a Lumo wallet':'through guest MoMo in the sandbox'}.`]:[]),`Current link status: ${status||'unavailable'}${link.expiresAt?`. Expires ${new Date(link.expiresAt).toLocaleString('en-GH',{timeZone:'Africa/Accra',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})} Accra time`:'. No one-off expiry is recorded for this reusable link'}.`,waiting?`${waiting} ${waiting===1?'payment is':'payments are'} still awaiting confirmation, totalling ${merchantLuxMoney(pendingAmount)}. Pending amounts are not included in received funds.`:'There are no pending provider attempts recorded for this link.',oneOff?(confirmed?'This one-off request cannot be paid again. Any refund stays linked to the original payment.':'This is a one-off request. Check its current status and original reference before attempting payment.'):'A reusable link can collect more than one payment; each confirmed receipt has its own reference.',...(guest?[`${merchantLuxMoney(guest)} came through guest MoMo in the sandbox. The test ledger posting is not live provider settlement.`]:[]),...(oneOff?[`The linked request may also be paid using its original Lumo QR. A paid request confirms receipt, but does not prove the customer arrived through the shared link.`]:[])],
   stats:[{label:oneOff?'Linked request · confirmed':'Confirmed for this link',value:merchantLuxMoney(received)},{label:'Wallet link-source coverage',value:'Not recorded'},{label:'Guest MoMo · sandbox confirmed',value:merchantLuxMoney(guest)},{label:'Awaiting confirmation',value:merchantLuxMoney(pendingAmount)}],
   actions:[action('Review this payment link','payment-links',{paymentLinkId:link.id,shopId:link.shopId})],followUps:['Which payments are awaiting confirmation?','How much did we receive through shared links?']
  };
 }
 if(/\b(?:has|is|was|did|this|that|it)\b.*\b(?:paid|complete|confirmed)\b/.test(norm(question)))return clarification('Which payment link should I check?','Give me its exact link reference, or open Payment links and choose it. A link, screenshot or matching amount alone does not prove payment.',['How much did we receive through shared links?']);
 const period=records(state,scope.ids,p,now),paid=period.paid.filter(linkedReceipt),ids=new Set(state.transactions.filter(row=>scope.ids.includes(row.shopId)&&linkedReceipt(row)).map(row=>row.id)),returned=period.refunds.filter(row=>ids.has(row.transactionId));
 const guest=paid;
 const pending=state.guestCollections.filter(row=>scope.ids.includes(row.shopId)&&['pending','processing','unknown'].includes(row.status));
 const total=sum(paid),refunded=sum(returned);
 return{
  title:`${merchantLuxMoney(total)} in confirmed MoMo collections through payment links.`,
  paragraphs:[`${paid.length} confirmed ${paid.length===1?'payment':'payments'} ${periodLabel(p)}. ${merchantLuxMoney(refunded)} in completed linked refunds is recorded separately.`,'This source total covers guest MoMo sandbox payments with a recorded link identifier. A Lumo wallet payment may use the same fixed request through its QR or shared link; those paths are not distinguished in the recorded source data.',pending.length?`${pending.length} guest ${pending.length===1?'payment is':'payments are'} currently awaiting confirmation, totalling ${merchantLuxMoney(sum(pending))}; these amounts are excluded.`:'There are no guest provider attempts awaiting confirmation in this scope.','Wallet-link source coverage is not recorded. Lumo wallet payments and generic shop payments are excluded from this exact link-source total, even when the linked fixed request is paid. These figures can therefore be smaller than total shop collections.','Guest MoMo is a sandbox journey here. Confirmed test postings are separate from live provider settlement and merchant withdrawals.'],
  stats:[{label:'MoMo payment links · confirmed',value:merchantLuxMoney(total)},{label:'Wallet link-source coverage',value:'Not recorded'},{label:'Guest MoMo · sandbox',value:merchantLuxMoney(sum(guest))},{label:'Linked refunds · completed',value:merchantLuxMoney(refunded)}],actions:[action('Review payment links','payment-links')],followUps:['Which payments are awaiting confirmation?','Why is available money different from collections?']
 };
}

export function getMerchantLuxAnswer(snapshot,question,{actor,shopId=null,context={},plan,now=new Date(),mode='local',settlementConnected=false}={}){
 if(privateMerchantQuestion(question))return{...clarification('Keep that detail private.','Use the secure account screens for passwords, PINs and identity details. Don’t put them in chat.'),mode};
 let state;try{state=visibleBusiness(snapshot,actor);}catch{return{...clarification('This account cannot open merchant Lux.','Ask the owner for the appropriate shop access.'),mode};}
 if(/[$€£]|\b(?:usd|dollars?|eur|euros?|gbp|pounds?|naira|btc|usdt)\b/i.test(question))return{...clarification('This view uses Ghana cedis.','Currency conversion is not connected. I can explain the GHS amounts recorded in Lumo.'),mode};
 const p={...(plan||planMerchantLux(question,context))};
 if(p.task==='links'&&!p.reference){const parsed=planMerchantLux(question,context);if(parsed.task==='links'&&parsed.reference)p.reference=parsed.reference;}
 const mentioned=state.shops.filter(s=>{const name=norm(s.name),q=norm(question),words=x=>' '+x.split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ')+' ';return name.length>2&&!MERCHANT_LUX_PERIODS.includes(name)&&words(q).includes(words(name));});
 if(mentioned.length&&!/\ball shops\b/.test(norm(question))){if(/\b(?:not|except|excluding|without)\b/.test(norm(question)))return{...clarification('Which shop should I check?','Choose one named shop, all your authorised shops, or two shops to compare. I won’t substitute an excluded shop.'),mode};p.shop=mentioned[0].name;}
 if(p.task==='shops'&&!p.compareShop&&mentioned.length===2)p.compareShop=mentioned[1].name;
 const scope=scopeFor(state,actor,shopId,p);if(scope.error)return{...scope.error,mode,plan:p};
 try{
  if(p.task==='shops'&&p.compareShop){const other=shopChoice(state,p.compareShop);if(other.error)return{...other.error,plan:p,mode};if(other.shop){scope.ids=[...new Set([...scope.ids,other.shop.id])];scope.label=scope.ids.map(id=>state.shops.find(s=>s.id===id).name).join(' and ');}}
  let a;
  if(p.task==='explain'){
   const previous=context.previous;if(!previous||previous.task==='explain')a=clarification('What would you like explained?','Ask about a collection, refund or shop first, then I can show the calculation.');
   else{const original=context.questions?.at(-1)||question;const fresh=getMerchantLuxAnswer(state,original,{actor,shopId,context:{...context,previous:null},plan:previous,now,mode,settlementConnected});return{...fresh,title:fresh.basis?.length?'Here’s what that answer rests on.':fresh.title,paragraphs:fresh.basis?.length?fresh.basis:fresh.paragraphs,basis:[]};}
  }else if(p.task==='collections')a=collections(state,scope,p,now);
  else if(p.task==='shops')a=shops(state,scope,p,now);
  else if(p.task==='changes')a=changes(state,scope,p,now);
  else if(p.task==='pending')a=pending(state,scope,p,now);
  else if(p.task==='refunds')a=refunds(state,scope,p,now);
  else if(p.task==='funds')a=funds(state,actor,scope,{settlementConnected});
  else if(['stock','expenses','plan'].includes(p.task))a=planning(state,actor,scope,p,now);
  else if(p.task==='links')a=links(state,scope,p,now,question);
  else if(p.task==='close')a=close(state,scope,p,now);
  else if(p.task==='receipt')a=receipt(state,scope,p);
  else if(p.task==='coverage')a={kind:'help',title:'Collections can’t tell us profit on their own.',paragraphs:['Lux can read confirmed Lumo receipts, completed refunds and the business expenses you explicitly record. Cash sales, outside sales and unrecorded costs are not connected here.','Recorded expenses and planning estimates do not prove a supplier was paid. A profit figure or a claim about all your sales would need those missing records.'],stats:[],actions:[action('Review recorded collections','reports')],followUps:['What expenses are coming up?']};
  else if(p.task==='help')a={title:'A clearer view of your business.',paragraphs:['I can explain collections, compare shops, check payment links and refunds, review recorded stock and expense plans, and help you understand close of day.','Ask the next question naturally. I can help you review a next step; every financial action stays in its normal approval flow.'],stats:[],actions:[],followUps:['How much remains after my business plan?','What is still processing?'],kind:'help'};
  else a=clarification('What would you like to make clearer?','Ask about collections, payment links, stock, planned expenses, a payment reference or close of day. For a date range, use “from YYYY-MM-DD to YYYY-MM-DD”.',['How much did we collect today?','What expenses are coming up?']);
  if(a.kind==='clarify'||a.kind==='help')return{...a,plan:p,mode,scope:scope.label};
  const priorBasis=a.basis||[];return{...a,actions:(a.actions||[]).map(item=>['activity','reports'].includes(item.page)?{...item,filters:reviewFilters(state,scope,p,now,item)}:item),plan:p.task==='explain'?context.previous:p,mode,scope:scope.label,checkedAt:now.toISOString(),sourceQuestion:clean(question),evidence:merchantLuxEvidence(state,actor,now),basis:[...priorBasis,...basisFor(state,scope,p,now,actor)].slice(0,9)};
 }catch(error){return{...clarification(error.message==='DATES'?'Which completed trading dates should I check?':'I couldn’t read those records safely.',error.message==='DATES'?'Use a valid past trading-date range of up to 366 days.':'Open Payments and check the recorded amounts and dates before relying on a total.'),mode};}
}
