import {normalizeBusinessPlan,businessPlanProjection,businessPlanLedgerDebits,calculateBusinessPlan} from '../dist/business-plan-model.js';
import {APIError,iso,audit} from './network.js';

const list=value=>Array.isArray(value)?value:[];
const canonical=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(item=>JSON.parse(canonical(item))):Object.fromEntries(Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>[key,JSON.parse(canonical(value[key]))])):value);
const money=(value,allowZero=false)=>{if(!Number.isSafeInteger(value)||value<(allowZero?0:1)||value>9999999999)throw new APIError('Enter a valid whole-pesewa amount within the planning limit.',400,'INVALID_PLAN_AMOUNT');return value;};
function dueDate(value){if(value===null||value===undefined||value==='')return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw new APIError('Choose a valid expense date.',400,'INVALID_PLAN_DATE');return value;}
function title(value){const text=typeof value==='string'?value.trim():'';if(!text||text.length>100||/[\u0000-\u001f<>]/.test(text))throw new APIError('Use an expense name of 1–100 characters.',400,'INVALID_PLAN_TITLE');return text;}
function permission(business,context){
  if(context.counter||!['owner','manager'].includes(context.user.role))throw new APIError('Cashier access does not include business planning.',403,'PLANNING_FORBIDDEN');
  const access=businessPlanProjection(business,context.user).businessPlanAccess;
  if(!access.canEdit)throw new APIError('Ask the owner to enable planning for your assigned shop.',403,'PLANNING_FORBIDDEN');
  return access;
}
function shopPermission(business,context,access,shopId){
  if(shopId!==null&&(!business.shops.some(shop=>shop.id===shopId)||!access.allowedShopIds.includes(shopId)))throw new APIError('This expense belongs outside your planning access.',403,'PLAN_SHOP_FORBIDDEN');
  if(context.user.role!=='owner'&&shopId===null)throw new APIError('Managers can plan only for an assigned, enabled shop.',403,'PLAN_SHOP_FORBIDDEN');
}

export function mutateBusinessPlan(network,context,input) {
  const business=network.businesses[context.user.businessId],access=permission(business,context);
  const operation=String(input.operation||''),payload=input.payload||{},mutationId=String(input.mutationId||'');
  if(!/^[A-Za-z0-9_.:-]{10,120}$/.test(mutationId))throw new APIError('Keep a stable planning request reference.',400,'PLAN_REFERENCE_REQUIRED');
  if(!['reserve','upsertExpense','removeExpense','setManagerAccess'].includes(operation))throw new APIError('Choose a valid planning action.',400,'INVALID_PLAN_ACTION');
  const fingerprint=canonical({operation,payload,userId:context.user.id}),stored=business.businessPlan||{},saved=stored._attempts?.[mutationId];
  if(saved){if(saved.fingerprint!==fingerprint)throw new APIError('That planning reference belongs to different details.',409,'PLAN_REFERENCE_CONFLICT');return {unchanged:true,entity:{id:saved.resultId||null,revision:saved.revision},replayed:true};}
  const plan=normalizeBusinessPlan(stored);
  if(input.expectedRevision!==plan.revision)throw new APIError('Your business plan changed. Refresh it before saving these details.',409,'PLAN_CHANGED');
  let resultId=null;
  if(operation==='reserve'){
    if(context.user.role!=='owner')throw new APIError('Only the owner can change the business stock reserve.',403,'OWNER_REQUIRED');
    plan.stockReserve={amount:money(payload.amount,true)};
  }
  if(operation==='setManagerAccess'){
    if(context.user.role!=='owner')throw new APIError('Only the owner can change manager planning access.',403,'OWNER_REQUIRED');
    if(!Array.isArray(payload.shopIds)||payload.shopIds.some(id=>typeof id!=='string'||!business.shops.some(shop=>shop.id===id)))throw new APIError('Choose valid shops for planning access.',400,'INVALID_PLAN_SHOPS');
    plan.managerShopIds=[...new Set(payload.shopIds)];
  }
  if(operation==='removeExpense'){
    const expense=plan.expenses.find(item=>item.id===payload.id);if(!expense)throw new APIError('This expense is no longer in the plan.',404,'PLAN_EXPENSE_NOT_FOUND');
    shopPermission(business,context,access,expense.shopId);plan.expenses=plan.expenses.filter(item=>item.id!==expense.id);resultId=expense.id;
  }
  if(operation==='upsertExpense'){
    const expenseId=payload.id||'expense-'+mutationId;
    if(typeof expenseId!=='string'||!/^[A-Za-z0-9_.:-]{5,160}$/.test(expenseId))throw new APIError('Use a valid expense reference.',400,'INVALID_PLAN_REFERENCE');
    const prior=plan.expenses.find(item=>item.id===expenseId);if(prior)shopPermission(business,context,access,prior.shopId);
    const shopId=payload.shopId||null;shopPermission(business,context,access,shopId);
    if(!['planned','recorded'].includes(payload.status)||!['stock','expense'].includes(payload.category))throw new APIError('Choose an expense category and status.',400,'INVALID_PLAN_EXPENSE');
    const expense={id:expenseId,title:title(payload.title),amount:money(payload.amount),shopId,category:payload.category,dueDate:dueDate(payload.dueDate),status:payload.status,funding:payload.status==='planned'?'unpaid':payload.funding,ledgerReference:null,createdAt:prior?.createdAt||iso(),updatedAt:iso()};
    if(expense.status==='recorded'&&!['external','ledger'].includes(expense.funding))throw new APIError('Record whether the expense was paid outside Lumo or already reflected in its ledger.',400,'INVALID_PLAN_FUNDING');
    if(expense.funding==='ledger'){
      const debit=businessPlanLedgerDebits(business).find(item=>item.id===payload.ledgerReference||item.reference===payload.ledgerReference);
      if(!debit||context.user.role!=='owner'&&debit.shopId!==shopId||debit.shopId&&debit.shopId!==shopId)throw new APIError('Choose a confirmed debit within this expense’s shop access.',400,'PLAN_LEDGER_NOT_FOUND');
      const allocated=plan.expenses.filter(item=>item.id!==expenseId&&item.funding==='ledger'&&item.ledgerReference===debit.id).reduce((total,item)=>total+item.amount,0);
      if(expense.amount+allocated>debit.amount)throw new APIError('Recorded expenses cannot exceed the linked ledger debit.',400,'PLAN_LEDGER_OVERALLOCATED');
      expense.ledgerReference=debit.id;
    }
    if(!prior&&plan.expenses.length>=200)throw new APIError('This plan supports up to 200 expenses. Remove an old record before adding another.',400,'PLAN_LIMIT');
    plan.expenses=plan.expenses.filter(item=>item.id!==expenseId);plan.expenses.unshift(expense);resultId=expense.id;
  }
  plan.revision++;plan.updatedAt=iso();
  const summary=calculateBusinessPlan({...business,businessPlan:plan});
  if(!Number.isSafeInteger(summary.totalCommitments)||!Number.isSafeInteger(summary.afterPlan))throw new APIError('The plan exceeds the safe calculation limit.',400,'PLAN_LIMIT');
  const attempts={...(stored._attempts||{}),[mutationId]:{fingerprint,resultId,revision:plan.revision,createdAt:iso()}};
  plan._attempts=Object.fromEntries(Object.entries(attempts).slice(-100));business.businessPlan=plan;
  audit(network,'BUSINESS_PLAN_UPDATED',business.business.id,context.user.id,{operation,expenseId:resultId});
  return {entity:{id:resultId,revision:plan.revision},replayed:false};
}

// Legacy owner history imports may contain the new planning metadata. Validate
// it separately from money records and never import access grants or attempts.
export function prepareImportedBusinessPlan(raw,business,remap) {
  if(raw===undefined)return undefined;
  const plan=normalizeBusinessPlan(raw);
  if(plan.scope!=='business'||plan.expenses.length>200)throw new APIError('Import a complete owner business plan with at most 200 expenses.',400,'INVALID_PLAN_IMPORT');
  plan.stockReserve.amount=money(plan.stockReserve.amount,true);plan.managerShopIds=[];plan.revision=0;plan.updatedAt=iso();
  const allocated=new Map();
  plan.expenses=plan.expenses.map(item=>{
    if(item.shopId&&!business.shops.some(shop=>shop.id===item.shopId))throw new APIError('A saved expense belongs to an unknown shop.',400,'INVALID_PLAN_IMPORT');
    const expense={...item,id:'expense-'+remap(item.id),title:title(item.title),amount:money(item.amount),dueDate:dueDate(item.dueDate),updatedAt:iso()};
    if(expense.funding==='ledger'){
      const reference=remap(item.ledgerReference),debit=businessPlanLedgerDebits(business).find(record=>record.id===reference);
      if(!debit||debit.shopId&&debit.shopId!==expense.shopId)throw new APIError('A saved expense does not match its original ledger debit.',400,'INVALID_PLAN_IMPORT');
      const total=(allocated.get(debit.id)||0)+expense.amount;if(total>debit.amount)throw new APIError('Saved expenses exceed their original ledger debit.',400,'INVALID_PLAN_IMPORT');allocated.set(debit.id,total);expense.ledgerReference=debit.id;
    }
    return expense;
  });
  return plan;
}
