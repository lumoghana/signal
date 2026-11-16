import {calculateBusinessPlan,normalizeBusinessPlan} from './business-plan-model.js';

const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>`${value<0?'−':''}GH₵${(Math.abs(Number(value)||0)/100).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const id=()=>globalThis.crypto?.randomUUID?.()||'plan-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const amount=value=>{const raw=String(value||'').trim();if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw Error('Enter an amount with up to two decimal places.');const [whole,fraction='']=raw.split('.'),result=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(!Number.isSafeInteger(result)||result<0||result>9999999999)throw Error('Choose a valid planning amount.');return result;};
const decimal=value=>((Number(value)||0)/100).toFixed(2);
const emptyExpense=shopId=>({id:'',title:'',amount:'',shopId:shopId||'',category:'expense',dueDate:'',status:'planned',funding:'external',ledgerReference:''});
const button=(label,action,style='secondary',extra='')=>`<button type="button" class="btn ${style}" data-action="plan-${action}" ${extra}>${label}</button>`;

export function createBusinessPlan(config={}) {
  let context='',generation=0,busy=false,error='',notice='',editing=false,filter='planned',selectedShop='',draft=null,reserveDraft=null,permissionDraft=null,expectedRevision=null,pending=null,confirmRemoval='';
  const state=()=>config.getState?.()||{},session=()=>config.getSession?.()||null;
  const isSample=()=>config.isSample?.()===true;
  const access=()=>state().businessPlanAccess||{canView:false,canEdit:false,canManageAccess:false,allowedShopIds:[]};
  const owner=()=>session()?.role==='owner';
  const shops=()=>(state().shops||[]).filter(shop=>owner()||access().allowedShopIds.includes(shop.id));
  const currentPlan=()=>normalizeBusinessPlan(state().businessPlan);
  const shopName=shopId=>state().shops?.find(shop=>shop.id===shopId)?.name||'Whole business';
  const redraw=()=>config.onChange?.();
  function key(){const s=session();return [isSample()?'sample':'connected',s?.businessId||state().business?.id,s?.id,s?.userId,s?.role].join(':');}
  function storageKey(){const user=session();return 'lumo-business-plan-attempt-v1:'+JSON.stringify([isSample()?'sample':'connected',user?.businessId,user?.userId,user?.role]);}
  function readPending(){try{const value=JSON.parse(globalThis.sessionStorage?.getItem(storageKey())||'null');return value&&/^[A-Za-z0-9_.:-]{10,120}$/.test(value.mutationId||'')&&value.payload&&typeof value.payload==='object'?value:null;}catch{return null;}}
  function savePending(value){pending=value;try{if(value)globalThis.sessionStorage?.setItem(storageKey(),JSON.stringify(value));else globalThis.sessionStorage?.removeItem(storageKey());}catch{}}
  function clear(){generation++;busy=false;error='';notice='';editing=false;filter='planned';selectedShop='';draft=null;reserveDraft=null;permissionDraft=null;expectedRevision=null;pending=null;confirmRemoval='';}
  function ensure(){const next=key();if(context!==next){clear();context=next;pending=readPending();}if(!owner()&&access().canView&&!shops().some(shop=>shop.id===selectedShop))selectedShop=shops()[0]?.id||'';}
  function failure(errorValue){error=errorValue?.message||'The plan could not be saved. Your merchant funds are unchanged.';notice='';}
  async function refresh(){
    ensure();if(isSample()||!session())return;
    const epoch=generation;error='';redraw();
    try{await config.api('/api/business-plan');if(epoch===generation&&!pending)expectedRevision=currentPlan().revision;}
    catch(e){if(epoch===generation)failure(e);}finally{if(epoch===generation)redraw();}
  }
  async function send(operation,payload){
    ensure();if(busy||!access().canEdit)return;
    const epoch=generation;busy=true;error='';notice='';
    if(!pending)savePending({operation,payload,mutationId:'plan-'+id(),expectedRevision:expectedRevision??currentPlan().revision});
    redraw();
    try{
      await config.api('/api/business-plan',{method:'POST',body:pending});
      if(epoch!==generation)return;
      savePending(null);expectedRevision=currentPlan().revision;draft=null;editing=false;reserveDraft=null;permissionDraft=null;confirmRemoval='';notice='Business plan saved. No money moved.';
    }catch(e){
      if(epoch!==generation)return;
      if(e.status>=400&&e.status<500&&e.status!==408){savePending(null);expectedRevision=currentPlan().revision;}
      failure(e);
    }finally{if(epoch===generation){busy=false;redraw();}}
  }
  function field(label,input){return `<label class="field"><span class="label">${label}</span>${input}</label>`;}
  function select(name,value,options,extra=''){return `<select class="select" name="${name}" ${extra}>${options.map(([key,label])=>`<option value="${E(key)}" ${String(value)===String(key)?'selected':''}>${E(label)}</option>`).join('')}</select>`;}
  function summary(){
    const result=calculateBusinessPlan(state(),{shopId:owner()?null:selectedShop||null});
    if(!owner())return `<section class="plan-summary panel"><span class="eyebrow">YOUR ENABLED SHOP</span><h2>${E(shopName(selectedShop))}</h2><div class="plan-hero-value">${money(result.totalCommitments)}</div><p>Planned commitments for this shop. The merchant account and the business stock reserve remain with the owner.</p></section>`;
    return `<section class="plan-summary panel"><span class="eyebrow">AFTER YOUR BUSINESS PLAN</span><h2 class="plan-hero-value ${result.afterPlan<0?'plan-shortfall':''}">${money(result.afterPlan)}</h2><p>Planning estimate · all shops</p><dl><div><dt>Available after payment holds</dt><dd>${money(result.available)}</dd></div><div><dt>Stock commitment</dt><dd>− ${money(result.stockCommitment)}</dd></div><div><dt>Other planned expenses</dt><dd>− ${money(result.otherCommitments)}</dd></div></dl><p class="plan-explainer">This helps you plan. It does not reserve, spend or move money.</p>${result.afterPlan<0?'<div class="callout warning">Your plan is larger than the available Lumo funds. Review the commitments before spending.</div>':''}<details><summary>How this is worked out</summary><p>Confirmed merchant funds: ${money(result.ledgerBalance)}. Existing refund and payout holds: ${money(result.ledgerHolds)}.</p><p>The stock commitment is the larger of the stock reserve (${money(result.stockReserve)}) and planned stock expenses (${money(result.stockCoveredCommitments)}), so they are counted once.</p><p>Recorded Lumo deductions are already reflected in available funds. Recorded external expenses were paid from outside this account and are not deducted from it. None of these figures represents profit.</p></details></section>`;
  }
  function reserve(){
    if(!owner())return '';
    const value=reserveDraft??decimal(currentPlan().stockReserve.amount);
    return `<section class="panel plan-section"><h2 class="panel-title">Keep money for stock</h2><p class="muted">One reserve covers the whole business, including any stock expenses below.</p><form data-form="business-plan" data-plan-form="reserve">${field('Stock reserve · GH₵',`<input class="input" name="reserveAmount" inputmode="decimal" value="${E(value)}" required ${busy||pending?'disabled':''}>`)}<button class="btn secondary" ${busy||pending?'disabled':''}>Save stock reserve</button></form></section>`;
  }
  function expenseForm(){
    if(!editing)return '';
    draft=draft||emptyExpense(owner()?'':selectedShop);const value=draft;
    const shopOptions=[...(owner()?[['','Whole business']]:[]),...shops().map(shop=>[shop.id,shop.name])];
    const debits=(state().businessPlanDebits||[]).filter(item=>owner()||item.shopId===value.shopId);
    return `<section class="panel plan-section"><div class="panel-heading"><h2 class="panel-title">${value.id?'Edit expense':'Add an expense'}</h2>${button('Cancel','cancel','ghost small',busy?'disabled':'')}</div><form data-form="business-plan" data-plan-form="expense">
      ${field('Expense',`<input class="input" name="title" maxlength="100" required value="${E(value.title)}" placeholder="e.g. Packaging supplies" ${busy||pending?'disabled':''}>`)}
      <div class="plan-form-pair">${field('Amount · GH₵',`<input class="input" name="amount" inputmode="decimal" value="${E(value.amount)}" required ${busy||pending?'disabled':''}>`)}${field('Due date (optional)',`<input class="input" type="date" name="dueDate" value="${E(value.dueDate)}" ${busy||pending?'disabled':''}>`)}</div>
      ${field('Shop',select('shopId',value.shopId,shopOptions,busy||pending?'disabled':''))}
      ${field('Category',select('category',value.category,[['expense','Business expense'],['stock','Stock · covered by the reserve']],busy||pending?'disabled':''))}
      ${field('Status',select('status',value.status,[['planned','Planned · still to be paid'],['recorded','Recorded · already paid']],busy||pending?'disabled':''))}
      ${value.status==='recorded'?field('Where was it paid?',select('funding',value.funding,[['external','Outside this Lumo account'],...(debits.length?[['ledger','A Lumo deduction already counted']]:[])],busy||pending?'disabled':'')):''}
      ${value.status==='recorded'&&value.funding==='ledger'?field('Confirmed Lumo deduction',select('ledgerReference',value.ledgerReference,[['','Choose a debit'],...debits.map(item=>[item.id,`${item.label} · ${money(item.amount)} · ${item.reference}`])],`required ${busy||pending?'disabled':''}`)):''}
      <p class="plan-explainer">${value.status==='planned'?'This is a planning commitment. Saving it does not pay a supplier.':value.funding==='ledger'?'Already counted in Lumo funds. Linking this debit does not verify that a supplier was paid.':'A record of money paid from outside this Lumo account. It will not reduce the account or create another commitment.'}</p>
      <button class="btn primary full" ${busy||pending?'disabled':''}>${busy?'Saving…':'Save expense record'}</button></form></section>`;
  }
  function expenseList(){
    const rows=currentPlan().expenses.filter(item=>item.status===filter&&(!selectedShop||item.shopId===selectedShop));
    return `<section class="panel plan-section"><div class="panel-heading"><h2 class="panel-title">Business expenses</h2>${button('Add expense','add','primary small',busy||pending?'disabled':'')}</div><p class="plan-explainer">Add each expense once, either for the whole business or for one shop.</p><div class="plan-filters"><div class="plan-tabs" role="group" aria-label="Expense records">${[['planned','Upcoming'],['recorded','Recorded']].map(([value,label])=>button(label,'filter',filter===value?'primary small':'secondary small',`data-value="${value}"`)).join('')}</div>${shops().length>1||owner()?field('Show expenses for',select('planShop',selectedShop,[...(owner()?[['','All shops and business expenses']]:[]),...shops().map(shop=>[shop.id,shop.name])])):''}</div><div class="plan-expense-list">${rows.length?rows.map(item=>`<article class="plan-expense"><div><strong>${E(item.title)}</strong><small>${E(shopName(item.shopId))}${item.dueDate?' · Due '+E(item.dueDate):''}</small><p>${item.status==='planned'?(item.category==='stock'?'Stock · counted within the business stock commitment':'Planned business expense'):item.funding==='ledger'?'Already counted in Lumo funds':'Recorded outside this Lumo account'}</p></div><div><strong>${money(item.amount)}</strong>${button('Edit','edit','ghost small',`data-id="${E(item.id)}" ${busy||pending?'disabled':''}`)}${button('Remove','remove','ghost small',`data-id="${E(item.id)}" ${busy||pending?'disabled':''}`)}</div></article>`).join(''):`<div class="plan-empty">${filter==='planned'?'Add the expenses you want to keep money for.':'Record expenses paid outside Lumo, or link a deduction already counted in its funds.'}</div>`}</div>${confirmRemoval?`<div class="callout warning"><p>Remove this expense from your plan? The original payment and your account funds stay unchanged.</p>${button('Keep expense','keep','secondary small')}${button('Remove expense record','confirm-remove','secondary small',`data-id="${E(confirmRemoval)}"`)}</div>`:''}</section>`;
  }
  function managerPermissions(){
    if(!owner())return '';
    const enabled=permissionDraft||currentPlan().managerShopIds;
    return `<details class="panel plan-permissions"><summary>Manager planning access</summary><p class="muted">Enable a shop only when its assigned managers should add and update that shop’s expense records. The merchant balance and business stock reserve remain owner-only.</p><form data-form="business-plan" data-plan-form="permissions">${shops().map(shop=>`<label class="field check-line"><input type="checkbox" name="managerShopIds" value="${E(shop.id)}" ${enabled.includes(shop.id)?'checked':''} ${busy||pending?'disabled':''}><span>${E(shop.name)}</span></label>`).join('')}<button class="btn secondary" ${busy||pending?'disabled':''}>Save manager access</button></form></details>`;
  }
  function render(){
    ensure();
    const heading=`<div class="page-heading"><div><div class="eyebrow">BUSINESS PLAN</div><h1 class="page-title">Keep the business moving.</h1><p class="subtitle">Stock, expenses and a clearer view of what remains.</p></div>${!isSample()&&session()?button('Refresh','refresh','secondary small',busy?'disabled':''):''}</div>`;
    if(isSample()||!session())return `<div class="business-plan-workspace">${heading}<section class="panel plan-section"><h2 class="panel-title">Connect your business plan</h2><p>Sign in to plan with your shared merchant funds. This browser sample cannot confirm an account balance or save a shared business plan.</p></section></div>`;
    if(!access().canView)return `<div class="business-plan-workspace">${heading}<section class="panel plan-section"><h2 class="panel-title">Owner-led planning</h2><p>Your owner can enable planning for your assigned shop. Its merchant account balance and business-wide reserve remain private.</p></section></div>`;
    let body='';try{body=summary()+reserve()+expenseForm()+expenseList()+managerPermissions();}catch(e){failure(e);body='<section class="panel plan-section"><p>Lumo could not calculate a reliable plan from these records. Refresh before using an estimate.</p></section>';}
    return `<div class="business-plan-workspace">${heading}${error?`<div class="callout warning" role="alert">${E(error)}</div>`:''}${notice?`<div class="callout" role="status">${E(notice)}</div>`:''}${pending?`<div class="callout warning"><p>A saved planning request still needs an outcome. Retry the same details before making another change.</p>${button(busy?'Checking…':'Check saved request','retry','secondary',busy?'disabled':'')}</div>`:''}${body}</div>`;
  }
  async function handleClick(element){
    ensure();const action=String(element?.dataset?.action||'').replace(/^plan-/,'');
    if(action==='refresh')return refresh();
    if(action==='retry'&&pending)return send(pending.operation,pending.payload);
    if(busy||pending)return;
    if(action==='add'){draft=emptyExpense(owner()?selectedShop:selectedShop||shops()[0]?.id);editing=true;expectedRevision=currentPlan().revision;}
    if(action==='edit'){const item=currentPlan().expenses.find(row=>row.id===element.dataset.id);if(item){draft={...item,amount:decimal(item.amount),shopId:item.shopId||'',dueDate:item.dueDate||'',ledgerReference:item.ledgerReference||''};editing=true;expectedRevision=currentPlan().revision;}}
    if(action==='cancel'){editing=false;draft=null;}
    if(action==='filter')filter=element.dataset.value==='recorded'?'recorded':'planned';
    if(action==='remove')confirmRemoval=element.dataset.id;
    if(action==='keep')confirmRemoval='';
    if(action==='confirm-remove')return send('removeExpense',{id:element.dataset.id});
    redraw();
  }
  async function handleSubmit(form){
    ensure();if(busy||pending)return;error='';
    const values=Object.fromEntries(new FormData(form));
    try{
      if(form.dataset.planForm==='reserve')return await send('reserve',{amount:amount(values.reserveAmount)});
      if(form.dataset.planForm==='permissions')return await send('setManagerAccess',{shopIds:new FormData(form).getAll('managerShopIds')});
      if(form.dataset.planForm==='expense')return await send('upsertExpense',{...(draft?.id?{id:draft.id}:{}),title:values.title,amount:amount(values.amount),shopId:values.shopId||null,category:values.category,dueDate:values.dueDate||null,status:values.status,funding:values.status==='recorded'?values.funding:'unpaid',ledgerReference:values.ledgerReference||null});
    }catch(e){failure(e);redraw();}
  }
  function handleChange(element){
    ensure();if(busy||pending)return;
    if(element.name==='reserveAmount'){reserveDraft=element.value;expectedRevision??=currentPlan().revision;return;}
    if(element.name==='planShop'){selectedShop=element.value;redraw();return;}
    if(element.name==='managerShopIds'){permissionDraft=permissionDraft||[...currentPlan().managerShopIds];permissionDraft=element.checked?[...new Set([...permissionDraft,element.value])]:permissionDraft.filter(value=>value!==element.value);expectedRevision??=currentPlan().revision;return;}
    if(editing&&draft&&Object.hasOwn(draft,element.name)){draft[element.name]=element.value;if(['status','funding','shopId'].includes(element.name))redraw();}
  }
  return {render,refresh,handleClick,handleSubmit,handleChange,reset(){clear();context='';}};
}
