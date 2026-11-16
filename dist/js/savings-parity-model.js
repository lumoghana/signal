/** Local saving schedules and budget periods. No background bank instructions are sent. */
const DAY=86400000, clone=v=>JSON.parse(JSON.stringify(v));
const date=()=>new Date().toISOString().slice(0,10), stamp=()=>new Date().toISOString();
const uid=p=>`${p}-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const cents=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000000;
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(new Date(`${v}T12:00:00Z`).getTime())&&new Date(`${v}T12:00:00Z`).toISOString().slice(0,10)===v;
const ok=(message,extra={})=>({ok:true,message,...extra}), fail=message=>({ok:false,message});
export function ensureSavingsParity(s){
  s.savingsHistory ||= [];s.budgetHistory ||= [];s.externalBalanceHistory ||= [];s.categoryRules ||= [];
  s.budget.periodId ||= uid('period');s.budget.startDate ||= date();s.budget.endDate ||= s.income?.amount > 0 ? s.income.nextDate || '' : '';
  // Older saves omitted the source period. Bind before a rollover can reuse IDs.
  // For an already rolled-over save, the first archived snapshot after the receipt
  // is the original containing period. Ambiguous old records never touch today's plan.
  for(const t of s.transactions||[]){
    if(t.budgetPeriodId||!t.budgetItemId)continue;
    const at=Date.parse(t.at),history=s.budgetHistory.filter(b=>b.items?.some(i=>i.id===t.budgetItemId)&&Number.isFinite(Date.parse(b.archivedAt))&&Number.isFinite(at)&&at<=Date.parse(b.archivedAt)).sort((a,b)=>Date.parse(a.archivedAt)-Date.parse(b.archivedAt));
    if(history.length)t.budgetPeriodId=history[0].periodId;
    else if(!s.budgetHistory.length||(Number.isFinite(at)&&t.at.slice(0,10)>=s.budget.startDate))t.budgetPeriodId=s.budget.periodId;
    else t.budgetPeriodId='legacy-unresolved';
  }
  return s;
}
export function normalizeSavingsHack(value){
  const type=value?.type||'none';
  if(!['none','percent','fixed','roundup','income','scheduled'].includes(type))return null;
  if(type==='none')return {type,value:0};
  const amount=value?.value??(type==='roundup'?100:0);
  if(['percent','income'].includes(type)?!Number.isFinite(amount)||amount<=0||amount>100:!cents(amount)||amount===0)return null;
  const hack={type,value:amount};
  if(type==='scheduled'){
    if(!['daily','weekly','monthly'].includes(value.frequency)||!validDate(value.nextRun))return null;
    Object.assign(hack,{frequency:value.frequency,nextRun:value.nextRun});
  }
  for(const key of ['monthlyCap','floor'])if(value[key]!==undefined){if(!cents(value[key]))return null;hack[key]=value[key];}
  if(value.paused!==undefined)hack.paused=!!value.paused;
  if(value.lastRun)hack.lastRun=value.lastRun;
  return hack;
}
function following(d,frequency){const n=new Date(`${d}T12:00:00Z`);if(frequency==='monthly'){const original=n.getUTCDate();n.setUTCDate(1);n.setUTCMonth(n.getUTCMonth()+1);const end=new Date(Date.UTC(n.getUTCFullYear(),n.getUTCMonth()+1,0)).getUTCDate();n.setUTCDate(Math.min(original,end));}else n.setUTCDate(n.getUTCDate()+(frequency==='weekly'?7:1));return n.toISOString().slice(0,10);}

/** Canonical automatic work identity: archived rules have no due occurrence. */
export function savingsAutomaticWork(s, today = date()) {
  const due = (s.boxes || []).filter(box => !box.archived && box.hack?.type === 'scheduled' && validDate(box.hack.nextRun) && box.hack.nextRun <= today)
    .map(box => [box.id, box.hack.nextRun, { ...box.hack }]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const seen = new Set(s._sharedIncomeSeen || []);
  const income = (s.transactions || []).filter(tx => tx.type === 'income' && tx.direction === 'in' && tx.status === 'success' && tx.ledgerJournalId && !seen.has(tx.ledgerJournalId))
    .map(tx => tx.ledgerJournalId).sort();
  return { due, income };
}
export function runSavingsRules(s,event,{transaction,getSummary}){
  ensureSavingsParity(s);const results=[],now=date();
  for(const box of s.boxes){
    const h=box.hack;if(!h||h.type==='none'||box.archived)continue;
    const matches=event.kind==='schedule'?h.type==='scheduled'&&h.nextRun<=now:event.kind==='income'?h.type==='income':['percent','fixed','roundup'].includes(h.type);
    if(!matches)continue;
    const eventKey=event.kind==='schedule'?`schedule:${h.nextRun}`:`${event.kind}:${event.id}`;
    if(s.savingsHistory.some(x=>x.boxId===box.id&&x.eventKey===eventKey))continue;
    let amount=['percent','income'].includes(h.type)?Math.round(event.amount*h.value/100):h.type==='roundup'?(h.value-event.amount%h.value)%h.value:h.value;
    const month=now.slice(0,7),used=s.savingsHistory.filter(x=>x.boxId===box.id&&x.status==='saved'&&x.at.startsWith(month)).reduce((n,x)=>n+x.amount,0);
    let reason='';
    if(h.paused)reason='Rule paused';
    else if(s.recovery?.active)reason='Recovery plan protects your everyday money';
    else if(box.target>0&&box.balance>=box.target)reason='Goal already reached';
    else if(h.monthlyCap>0&&used>=h.monthlyCap)reason='Monthly saving limit reached';
    if(box.target>0)amount=Math.min(amount,Math.max(0,box.target-box.balance));
    if(h.monthlyCap>0)amount=Math.min(amount,Math.max(0,h.monthlyCap-used));
    const available=Math.min(getSummary(s).spendable,Math.max(0,s.wallet-(h.floor||0)));
    if(!reason&&amount>available)reason='Your plan and protected balance come first';
    if(!reason&&amount<=0)reason='No spare change on this payment';
    const entry={id:uid('hack-event'),boxId:box.id,eventKey,at:stamp(),amount:reason?0:amount,status:reason?'skipped':'saved',reason:reason||'Saved automatically',rule:clone(h)};
    if(!reason){s.wallet-=amount;box.balance+=amount;const tx=transaction(s,{type:'saving',amount,merchant:box.name,category:'Savings Hack',emoji:box.emoji,rail:'internal',note:`Saved with your ${h.type} rule`,parentPaymentId:event.kind==='payment'?event.id:undefined,parentIncomeId:event.kind==='income'?event.id:undefined,boxId:box.id});entry.transactionId=tx.id;results.push(tx.id);}
    s.savingsHistory.unshift(entry);
    if(h.type==='scheduled'){h.lastRun=h.nextRun;let next=following(h.nextRun,h.frequency);while(next<=now)next=following(next,h.frequency);h.nextRun=next;}
  }
  return results;
}
export function budgetSuggestions(s,now=new Date()){
  const day=new Date(`${now.toISOString().slice(0,10)}T00:00:00Z`),weekday=(day.getUTCDay()+6)%7;
  const end=new Date(day.getTime()-weekday*DAY),start=new Date(end.getTime()-28*DAY);
  const list=(s.transactions||[]).filter(t=>['payment','card-purchase'].includes(t.type)&&t.status==='success'&&t.direction!=='in'&&t.at>=start.toISOString()&&t.at<end.toISOString());
  const by=new Map();for(const t of list){const category=t.category||'Other',amount=Math.max(0,t.amount-(t.type==='card-purchase'?(t.refunded||0):0));if(amount)by.set(category,(by.get(category)||0)+amount);}
  return {start:start.toISOString().slice(0,10),end:new Date(end-DAY).toISOString().slice(0,10),weeks:4,transactions:list.length,categories:[...by].map(([name,total])=>({name,total,weekly:Math.ceil(total/4)}))};
}
function archive(s){const period={...clone(s.budget),archivedAt:stamp(),totalPlanned:s.budget.items.reduce((n,i)=>n+i.amount,0),totalSpent:s.budget.items.reduce((n,i)=>n+(i.spent||0),0)};s.budgetHistory.unshift(period);return period;}
export function handleSavingsParityAction(s,type,p,helpers){
  ensureSavingsParity(s);
  if(type==='runScheduledSavings'){return ok('Scheduled saving checked on this device.',{transfers:runSavingsRules(s,{kind:'schedule'},helpers)});}
  if(type==='setHackPaused'||type==='cancelSavingsHack'){
    const b=s.boxes.find(x=>x.id===(p.boxId||p.id));if(!b||!b.hack||b.hack.type==='none')return fail('Choose a box with a saving rule.');
    const old=clone(b.hack);if(type==='cancelSavingsHack')b.hack={type:'none',value:0};else b.hack.paused=!!p.paused;
    s.savingsHistory.unshift({id:uid('hack-event'),boxId:b.id,at:stamp(),status:type==='cancelSavingsHack'?'cancelled':p.paused?'paused':'resumed',amount:0,reason:type==='cancelSavingsHack'?'Rule cancelled. Saved money stays in your box.':p.paused?'Rule paused':'Rule resumed',rule:old});
    return ok(type==='cancelSavingsHack'?'Saving rule cancelled.':p.paused?'Saving rule paused.':'Saving rule resumed.');
  }
  if(type==='archiveBox'||type==='restoreBox'){
    const b=s.boxes.find(x=>x.id===(p.boxId||p.id));if(!b)return fail('That Money Box could not be found.');
    if(type==='archiveBox'&&s.transactions.some(t=>t.boxId===b.id&&t.boxTransfer&&t.status==='pending'))return fail('Wait for this box’s pending transfer before archiving it.');
    b.archived=type==='archiveBox';b.archivedAt=b.archived?stamp():null;return ok(b.archived?'Box archived. Your money and history stay safe.':'Box restored.');
  }
  if(type==='startBudgetPeriod'||type==='reuseBudgetPeriod'){
    const source=type==='reuseBudgetPeriod'?s.budgetHistory.find(b=>b.periodId===p.periodId):s.budget;
    if(!source)return fail('Choose a saved budget period.');
    if(!validDate(p.startDate)||!validDate(p.endDate)||p.endDate<p.startDate)return fail('Choose valid start and end dates.');
    if(p.startDate>date())return fail('Save a future period as a draft. Start it when it begins.');
    const prepared=helpers.prepareBudgetItems ? helpers.prepareBudgetItems(clone(p.items||source.items).map(i=>({...i,spent:0}))) : {items:clone(p.items||source.items).map(i=>({...i,spent:0}))};
    if(prepared.error)return fail(prepared.error);
    const items=prepared.items;
    if(!items.length)return fail('Add an essential before starting the next period.');
    if(s.budget.created)archive(s);
    s.budget={created:true,items,periodId:uid('period'),startDate:p.startDate,endDate:p.endDate,...((p.provenance||source.provenance)?{provenance:clone(p.provenance||source.provenance)}:{})};
    return ok('Fresh period ready. Your previous plan is in history.',{budget:s.budget});
  }
  if(type==='archiveBudgetPeriod'){
    if(!s.budget.created)return fail('There is no active budget to archive.');
    const saved=archive(s);s.budget={created:false,items:[],periodId:uid('period'),startDate:date(),endDate:s.income.nextDate};return ok('Budget period archived.',{period:saved});
  }
  if(type==='rememberCategory'||type==='forgetCategory'||type==='correctTransactionCategory'){
    if(type==='correctTransactionCategory'){
      const t=s.transactions.find(x=>x.id===p.transactionId);if(!t||t.type!=='payment'||t.status!=='success')return fail('Choose a completed payment.');
      const budget=!t.budgetPeriodId||t.budgetPeriodId===s.budget.periodId?s.budget:s.budgetHistory.find(b=>b.periodId===t.budgetPeriodId);
      const item=budget?.items.find(x=>x.id===p.budgetItemId);if(!item)return fail('Choose a category from this payment’s original plan period.');
      const old=budget.items.find(x=>x.id===t.budgetItemId);if(old)old.spent=Math.max(0,old.spent-(t.budgetSpentAmount??t.budgetAllocation??t.amount));
      item.spent+=t.amount;t.category=item.name;t.budgetItemId=item.id;t.budgetSpentAmount=t.amount;t.budgetAllocation=Math.min(t.amount,Math.max(0,item.amount-(item.spent-t.amount)));t.categoryCorrectedAt=stamp();
      if(budget!==s.budget)budget.totalSpent=budget.items.reduce((n,i)=>n+(i.spent||0),0);
      if(p.remember){const key=String(t.merchant).trim().toLowerCase();s.categoryRules=s.categoryRules.filter(x=>x.merchantKey!==key);s.categoryRules.push({merchantKey:key,merchant:t.merchant,budgetItemId:item.id,category:item.name});}
      return ok('Category corrected. Your plan reflects this payment.');
    }
    const key=String(p.merchant||'').trim().toLowerCase();if(!key)return fail('Choose a merchant.');
    if(type==='forgetCategory'){s.categoryRules=s.categoryRules.filter(x=>x.merchantKey!==key);return ok('Category preference forgotten.');}
    const item=s.budget.items.find(x=>x.id===p.budgetItemId);if(!item)return fail('Choose a budget category.');
    s.categoryRules=s.categoryRules.filter(x=>x.merchantKey!==key);s.categoryRules.push({merchantKey:key,merchant:String(p.merchant),budgetItemId:item.id,category:item.name});return ok('Lumo will suggest this category next time.');
  }
  if(type==='completeRecovery'){
    if(!s.recovery?.active)return fail('There is no active recovery plan.');
    const summary=helpers.getSummary(s),gap=Math.max(0,summary.planned+s.buffer-summary.available);
    if(gap>0&&!p.confirmAdjusted)return fail('Your plan still has a gap. Review your essentials before finishing recovery.');
    s.recovery.active=false;s.recovery.completedAt=stamp();return ok('Recovery complete. Your saving rules can run again.');
  }
  if(type==='reviewRecoveryIncome'){
    if(!s.recovery?.active)return fail('There is no active recovery plan.');
    const t=s.transactions.find(t=>t.id===p.transactionId&&t.type==='income'&&t.status==='success');if(!t||t.at<s.recovery.startedAt)return fail('Choose money actually received after recovery began.');
    s.recovery.reviewedIncomeId=t.id;s.recovery.reviewedAt=stamp();return ok('Received money reviewed. Check your plan before ending recovery.');
  }
  return null;
}
