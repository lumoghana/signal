/** A draft-only starter. No money moves and saved plans are never overwritten. */
import {budgetCategoryKey} from './model.js';
export const QUICK_ESSENTIALS=Object.freeze([
  {name:'Food & groceries',emoji:'🍲'}, {name:'Transport',emoji:'🚌'},
  {name:'Data & airtime',emoji:'📱'}, {name:'Fees & essentials',emoji:'📚'},
]);
const today=()=>new Date().toISOString().slice(0,10);
const future=()=>new Date(Date.now()+30*86400000).toISOString().slice(0,10);
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const money=v=>/^\d+(?:\.\d{0,2})?$/.test(String(v).trim())?Math.round(Number(v)*100):NaN;
export function createQuickEssentials(){return {amounts:['','','',''],dates:['','','',''],endDate:future(),bufferText:''};}
export function prepareQuickEssentials(state,quick,existingItems=[],makeId=()=>globalThis.crypto?.randomUUID?.()||`quick-${Date.now()}-${Math.random()}`){
  const fail=message=>({ok:false,message});
  if(state.budget?.created||state.budget?.items?.length||existingItems.some(i=>i.spent>0))return fail('Your saved plan is already in progress. Edit its essentials to keep spending intact.');
  const existingKeys=existingItems.map(i=>budgetCategoryKey(i.name));if(new Set(existingKeys).size!==existingKeys.length)return fail('An essential is already in this draft. Keep one entry per category.');
  if(!validDate(quick?.endDate)||quick.endDate<today())return fail('Choose today or a future date for how long this plan should last.');
  const buffer=String(quick.bufferText||'').trim()===''?0:money(quick.bufferText);
  if(!Number.isSafeInteger(buffer)||buffer<0||buffer>1000000000)return fail('Use a valid keep-back amount of zero or more.');
  const presetKeys=QUICK_ESSENTIALS.map(i=>budgetCategoryKey(i.name));
  const items=existingItems.filter(i=>!presetKeys.includes(budgetCategoryKey(i.name))).map(i=>({...i}));
  for(let index=0;index<QUICK_ESSENTIALS.length;index++){
    const raw=String(quick.amounts?.[index]||'').trim();if(!raw)continue;
    const amount=money(raw);if(!Number.isSafeInteger(amount)||amount<0||amount>1000000000)return fail('Use valid amounts with up to two decimal places. Leave unused essentials blank.');
    if(!amount)continue;
    const due=quick.dates?.[index]||'';
    if(due&&(!validDate(due)||due<today()))return fail('Use today or a future due date, or leave the date blank.');
    const preset=QUICK_ESSENTIALS[index],old=existingItems.find(i=>budgetCategoryKey(i.name)===presetKeys[index]);
    items.push({...preset,id:old?.id||makeId(),amount,spent:0,due});
  }
  if(!items.length)return fail('Give at least one essential an amount above zero.');
  const keys=items.map(i=>budgetCategoryKey(i.name));if(new Set(keys).size!==keys.length)return fail('An essential is already in this draft. Edit its existing amount.');
  const total=items.reduce((sum,i)=>sum+i.amount,0);
  return {ok:true,items,buffer,endDate:quick.endDate,total,shortfall:Math.max(0,total+buffer-state.wallet)};
}
