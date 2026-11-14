import {ledger} from './domain.js';

const list=value=>Array.isArray(value)?value:[];
const cents=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const text=value=>typeof value==='string'?value:'';
const assertMoney=(value,label='Planning amount')=>{if(!Number.isSafeInteger(value)||value<0)throw new Error(label+' is invalid. Refresh the authoritative record before using this estimate.');return value;};
const sum=values=>{const total=values.reduce((number,value)=>number+assertMoney(value),0);if(!Number.isSafeInteger(total))throw new Error('This plan exceeds the safe calculation limit.');return total;};

export function normalizeBusinessPlan(value={}) {
  value=value&&typeof value==='object'?value:{};
  if(value.stockReserve?.amount!==undefined)assertMoney(value.stockReserve.amount,'Stock reserve');
  if(value.expenses!==undefined&&!Array.isArray(value.expenses))throw new Error('The expense records are invalid. Refresh the business plan.');
  const seen=new Set();for(const item of list(value.expenses)){if(!item||typeof item.id!=='string'||!item.id||seen.has(item.id))throw new Error('An expense reference is invalid or duplicated.');seen.add(item.id);assertMoney(item.amount,'Expense amount');}
  const expenses=list(value.expenses).filter(item=>item&&typeof item.id==='string').map(item=>({
    id:item.id,title:text(item.title),amount:cents(item.amount),shopId:item.shopId||null,
    category:item.category==='stock'?'stock':'expense',dueDate:item.dueDate||null,
    status:item.status==='recorded'?'recorded':'planned',
    funding:item.status==='recorded'?(item.funding==='ledger'?'ledger':'external'):'unpaid',
    ledgerReference:item.funding==='ledger'?item.ledgerReference||null:null,
    createdAt:item.createdAt||null,updatedAt:item.updatedAt||null
  }));
  return {version:1,revision:Number.isSafeInteger(value.revision)?value.revision:0,
    stockReserve:{amount:cents(value.stockReserve?.amount)},expenses,
    managerShopIds:[...new Set(list(value.managerShopIds).filter(item=>typeof item==='string'))],
    updatedAt:value.updatedAt||null,...(value.scope==='shops'?{scope:'shops',allowedShopIds:[...new Set(list(value.allowedShopIds))]}:{scope:'business'})};
}

/** A planning estimate, never a ledger mutation or an inference of profit. */
export function calculateBusinessPlan(snapshot={},options={}) {
  const plan=normalizeBusinessPlan(snapshot.businessPlan),shopId=options.shopId||null;
  const restricted=plan.scope==='shops'||snapshot.accessScope==='shops'||snapshot.accessScope==='cashier'||snapshot.accessScope==='counter';
  const allowed=restricted?new Set(plan.allowedShopIds):null;
  const rows=plan.expenses.filter(item=>(!shopId||item.shopId===shopId)&&(!allowed||allowed.has(item.shopId)));
  const planned=rows.filter(item=>item.status==='planned');
  const plannedStock=sum(planned.filter(item=>item.category==='stock').map(item=>item.amount));
  const otherCommitments=sum(planned.filter(item=>item.category!=='stock').map(item=>item.amount));
  const businessScope=!shopId&&!restricted;
  const stockReserve=businessScope?plan.stockReserve.amount:null;
  const stockCommitment=businessScope?Math.max(stockReserve,plannedStock):plannedStock;
  const totalCommitments=stockCommitment+otherCommitments;if(!Number.isSafeInteger(totalCommitments))throw new Error('This plan exceeds the safe calculation limit.');
  const now=options.now?new Date(options.now):new Date(),today=Number.isFinite(now.getTime())?now.toISOString().slice(0,10):new Date().toISOString().slice(0,10);
  let funds=null;
  if(businessScope){
    const safe={openingBalance:Number.isSafeInteger(snapshot.openingBalance)?snapshot.openingBalance:0,
      transactions:list(snapshot.transactions),refunds:list(snapshot.refunds),settlements:list(snapshot.settlements)};
    for(const rows of [safe.transactions,safe.refunds,safe.settlements])for(const item of rows){if(['paid','processing','requested'].includes(item.status)){assertMoney(item.amount,'Ledger amount');if(item.fee!==undefined)assertMoney(item.fee,'Ledger fee');}}
    if(snapshot.openingBalance!==undefined&&!Number.isSafeInteger(snapshot.openingBalance))throw new Error('The authoritative merchant balance is invalid.');
    funds=ledger(safe);if(![funds.available,funds.balance,funds.reserved].every(Number.isSafeInteger))throw new Error('The authoritative funds exceed the safe calculation limit.');
  }
  return {
    scope:businessScope?'business':'shops',shopId,currency:'GHS',estimate:true,
    coverage:businessScope?'All shops and the merchant account. Confirmed funds after ledger holds; plans are estimates.':'Selected shop commitments only. Merchant account funds, the business stock reserve and other shops are excluded.',
    available:funds?.available??null,ledgerBalance:funds?.balance??null,ledgerHolds:funds?.reserved??null,
    stockReserve,stockCoveredCommitments:plannedStock,stockCommitment,otherCommitments,totalCommitments,
    afterPlan:funds?funds.available-totalCommitments:null,
    upcomingExpenses:planned.map(item=>({...item,overdue:!!item.dueDate&&item.dueDate<today})).sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||a.title.localeCompare(b.title)),
    recordedExpenses:rows.filter(item=>item.status==='recorded'),
    excludedLedgerExpenses:rows.filter(item=>item.status==='recorded'&&item.funding==='ledger'),
    externalRecordedTotal:sum(rows.filter(item=>item.status==='recorded'&&item.funding==='external').map(item=>item.amount)),
    plannedExpenseCount:planned.length,
    explanation:'The stock reserve covers planned stock expenses up to the reserve; only an excess is added. Recorded ledger expenses are already reflected in available funds. Recorded external expenses were paid outside this Lumo account and are not deducted from it. Recording or changing a plan never pays anyone.'
  };
}

export function businessPlanProjection(snapshot,user) {
  const owner=user?.role==='owner';
  const allowed=owner?list(snapshot.shops).map(shop=>shop.id):user?.role==='manager'?list(user.shopIds).filter(id=>list(snapshot.businessPlan?.managerShopIds).includes(id)):[];
  const canView=owner||allowed.length>0;
  const access={canView,canEdit:canView,canManageAccess:owner,scope:owner?'business':'shops',allowedShopIds:allowed};
  if(!canView)return {businessPlanAccess:access};
  const plan=normalizeBusinessPlan(snapshot.businessPlan);
  const visible=owner?plan:{...plan,scope:'shops',allowedShopIds:allowed,stockReserve:{amount:0},managerShopIds:[],expenses:plan.expenses.filter(item=>allowed.includes(item.shopId))};
  return {businessPlan:visible,businessPlanAccess:access,businessPlanDebits:businessPlanLedgerDebits(snapshot).filter(item=>owner||allowed.includes(item.shopId)),businessPlanSummary:calculateBusinessPlan({...snapshot,businessPlan:visible,...(!owner?{accessScope:'shops'}:{})})};
}

export function businessPlanLedgerDebits(snapshot) {
  const refunds=list(snapshot.refunds).filter(item=>item.status==='paid').map(item=>({id:item.id,reference:item.reference||item.id,amount:item.amount,shopId:item.shopId||null,kind:'refund',label:'Completed refund'}));
  const payouts=list(snapshot.settlements).filter(item=>item.status==='paid').map(item=>({id:item.id,reference:item.reference||item.id,amount:item.amount+(item.fee||0),shopId:item.shopId||null,kind:'settlement',label:'Completed settlement'}));
  return [...refunds,...payouts];
}
