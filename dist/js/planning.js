import {QUICK_ESSENTIALS,createQuickEssentials,prepareQuickEssentials} from './budget-quick.js';
import {renderInitialPartnerSetup,handleInitialPartnerAction,partnerReady,initialPartnerReviewCopy} from './box-partner-setup.js';
import { renderPlanningParity, bindPlanningParity, planningParityLinks, openHackEditor, budgetSuggestions, planningSheet, planningMoney } from './planning-parity-ui.js';
import { esc, cash, icon, categorySymbol, pageHead, sectionHead, row, field, btn, empty, progress, dateLabel } from './ui.js';
import { getSummary, budgetCategoryKey } from './model.js';
import { hasBoxProtection, protectionSummary, validatePartnerDetails } from './box-protection.js';
import { openBoxProtection, openProtectedBoxWithdrawal } from './box-protection-ui.js';

const categories = [
  { name: 'Food & groceries', emoji: '🍲', colour: '#d4f65a' },
  { name: 'Transport', emoji: '🚌', colour: '#8faaff' },
  { name: 'Data & airtime', emoji: '📱', colour: '#d9a5eb' },
  { name: 'Fees & essentials', emoji: '📚', colour: '#ffba7a' },
];
const boxIdeas = [{ name: 'New laptop', emoji: '💻' }, { name: 'Next semester', emoji: '🎓' }, { name: 'Rainy day', emoji: '☔' }, { name: 'Something good', emoji: '✨' }];
const emojis = ['💻', '🎓', '☔', '✨', '🏠', '🎧', '✈️', '🎁'];
let poolCleanup = null;

const uid = () => globalThis.crypto?.randomUUID?.() || `p${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
const today = () => new Date().toISOString().slice(0, 10);
function future(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function parseAmount(value) {
  const text = String(value ?? '').replace(/[,\s]/g, '');
  return /^\d+(\.\d{0,2})?$/.test(text) ? Math.round(Number(text) * 100) : NaN;
}
function validMoney(n) { return Number.isSafeInteger(n) && n > 0 && n <= 1000000000; }
function dateValid(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T12:00:00`).getTime()); }
function moneyInput(value = '', placeholder = '0.00') {
  return `<div class="money-input"><span class="currency">GH₵</span><input id="planning-amount" name="amount" type="text" inputmode="decimal" autocomplete="off" aria-label="Amount in Ghana cedis" placeholder="${esc(placeholder)}" value="${esc(value)}" maxlength="12"></div>`;
}
function setupProgress(step, total) { return `<div class="setup-progress" aria-label="Step ${step} of ${total}">${Array.from({ length: total }, (_, i) => `<span class="${i < step ? 'done active' : ''}"></span>`).join('')}</div>`; }
function err() { return '<p class="error" id="planning-error" role="alert"></p>'; }
function setError(ctx, text) { const el = ctx.$('#planning-error'); if (el) el.textContent = text; else ctx.toast(text); }
function duplicateBudgetItem(items, name, id) { return (items || []).find(item => item.id !== id && budgetCategoryKey(item.name) === budgetCategoryKey(name)); }
function duplicateCopy(name) { return `${name} is already in your plan. Edit that essential to change its amount.`; }
function foundBox(ctx, route) { return (ctx.state.boxes || []).find(b => b.id === route.id); }
function maskedPartnerPhone(value) { const digits = String(value || '').replace(/\D/g,''); return digits.length > 6 ? `${digits.slice(0,3)} ••• ${digits.slice(-3)}` : 'Phone number needed'; }
function typeTitle(type) { return ({ percent: 'A little from each payment', fixed: 'A fixed amount each payment', roundup: 'Round up my payments', none: 'Choose a Savings Hack' })[type] || 'Choose a Savings Hack'; }
function hackCopy(hack, ctx) {
  if (!hack || hack.type === 'none') return 'Small moves. Growing goals.';
  if (hack.type === 'percent') return `${hack.value}% of each successful payment`;
  if (hack.type === 'fixed') return `${planningMoney(ctx, hack.value)} after each successful payment`;
  if (hack.type === 'roundup') return `Round payments to the next ${planningMoney(ctx, hack.value || 100)}`;
  if (hack.type === 'income') return `${hack.value}% when money arrives`;
  if (hack.type === 'scheduled') return `${planningMoney(ctx, hack.value)} ${hack.frequency} · ${hack.paused?'Paused':`Next ${dateLabel(hack.nextRun)}`}`;
  return 'Small moves. Growing goals.';
}
export function goalPace(box, now = Date.now()) {
  const left = Math.max(0, box.target - (box.balance || 0));
  if(!box.target)return {amount:0,period:'whenever you can',days:0};
  if (!box.deadline) return { amount: left, period: 'to reach your goal', days: 0 };
  const days = Math.ceil((new Date(`${box.deadline}T23:59:59`).getTime() - now) / 86400000);
  if (days <= 0 && left > 0) return {amount:0,period:'',days:0,overdue:true,remaining:left};
  if (days < 7) return { amount: Math.ceil(left / days), period: 'a day', days };
  if (days < 45) return { amount: Math.ceil(left / Math.max(1, days / 7)), period: 'a week', days };
  return { amount: Math.ceil(left / Math.max(1, days / 30.4375)), period: 'a month', days };
}

function remember(ctx) { ctx.saveDraft?.(); }
function finish(ctx, route) { ctx.setCapture?.(null); return ctx.finish ? ctx.finish(route) : ctx.go(route, { replace: true }); }
function saveSetupCapture(ctx, route) {
  if (route.page === 'create' && route.section === 'plan' && ctx.draft.plan) {
    const d = ctx.draft.plan; d.item ||= {};
    if(route.step==='quick'&&d.quick){
      QUICK_ESSENTIALS.forEach((_,i)=>{const amount=ctx.$(`[name="quick-amount-${i}"]`),due=ctx.$(`[name="quick-date-${i}"]`);if(amount)d.quick.amounts[i]=amount.value;if(due)d.quick.dates[i]=due.value;});
      const horizon=ctx.$('[name="quick-end"]'),buffer=ctx.$('[name="quick-buffer"]');if(horizon)d.quick.endDate=horizon.value;if(buffer)d.quick.bufferText=buffer.value;
    }
    const name = ctx.$('[name="planning-name"]'), amount = ctx.$('#planning-amount'), date = ctx.$('[name="planning-date"]');
    if (name) d.item.name = name.value;
    if (amount) { d.item.amountText = amount.value; const n = parseAmount(amount.value); if (validMoney(n)) d.item.amount = n; }
    if (date) d.item.due = date.value;
    d.lastRoute = { ...route };
  }
  if (route.page === 'create' && route.section === 'boxes' && ctx.draft.box) {
    const d = ctx.draft.box, name = ctx.$('[name="planning-name"]'), amount = ctx.$('#planning-amount'), date = ctx.$('[name="planning-date"]');
    if (name) d.name = name.value;
    if (amount) { d.amountText = amount.value; const n = parseAmount(amount.value); if (validMoney(n)) d.target = n; }
    if (date) d.deadline = date.value;
    const partnerName = ctx.$('[name="box-partner-name"]'), partnerPhone = ctx.$('[name="box-partner-phone"]');
    if (partnerName) d.partnerName = partnerName.value;
    if (partnerPhone) d.partnerPhone = partnerPhone.value;
    const partnerButton=ctx.$('[data-action="p:box-partner"]');
    if(partnerButton&&d.partnerEnabled)partnerButton.textContent=partnerReady(ctx)?'Continue':'Send partner code';
    d.lastRoute = { ...route };
  }
  if (route.page === 'hack' && ctx.draft.hack) {
    const input = ctx.$('[name="planning-hack"]'), d = ctx.draft.hack;
    if (input) { d.inputText = input.value; const n = d.type === 'percent' ? Number(input.value) : parseAmount(input.value); if (Number.isFinite(n)) d.value = n; }
  }
  remember(ctx);
}
function hasPlanDraft(ctx) { const d = ctx.draft.plan; return !!d && !!(d.quick || d.items?.length || d.item?.name || d.item?.amountText || d.item?.amount); }
function hasBoxDraft(ctx) { const d = ctx.draft.box; return !!d && !!(d.name || d.amountText || d.target); }
function resumeSetup(ctx, section) {
  const d = section === 'plan' ? ctx.draft.plan : ctx.draft.box;
  if (!d) return section === 'plan' ? planStart(ctx) : boxStart(ctx);
  const target = d.lastRoute?.page === 'create' ? { ...d.lastRoute } : { section, page: 'create', step: 'name' };
  ctx.setCapture?.(null); ctx.closeSheet(); ctx.go(target);
}
function chooseResume(ctx, section, startFresh) {
  const title = section === 'plan' ? 'Your budget setup is saved.' : 'Your Money Box setup is saved.';
  planningSheet(ctx, `<h2>${title}</h2><p>Pick up where you left off, or start with a fresh idea.</p><div class="stack">${btn('Continue setup','setup-resume')}${btn('Start again','setup-restart',{secondary:true})}</div>`, sheet => {
    sheet.querySelector('[data-action="setup-resume"]').onclick = () => resumeSetup(ctx, section);
    sheet.querySelector('[data-action="setup-restart"]').onclick = () => { ctx.closeSheet(); startFresh(); };
  });
}
function setupHead(title, {editing=false,...extra} = {}) { return pageHead(title, { ...extra, action: `<button class="text-button" data-action="${editing?'p:edit-cancel':'p:setup-cancel'}">${editing?'Cancel edit':'Cancel'}</button>` }); }
function editDraftBudgetItem(ctx, item) {
  planningSheet(ctx, `<h2>${icon(categorySymbol(item.name),20)} Adjust this essential</h2><form class="form-stack">${field({label:'Name',name:'draft-name',value:item.name,required:true})}${field({label:'Total budget (GH₵)',name:'draft-amount',type:'number',value:(item.amount/100).toFixed(2),min:((item.spent||0)/100).toFixed(2),required:true})}${field({label:'Needed by · optional',name:'draft-date',type:'date',value:item.due,min:today()})}<p class="error" role="alert"></p><button class="button" type="submit">Save and return to review</button></form>`, sheet => {
    sheet.querySelector('form').onsubmit = e => {
      e.preventDefault(); const name = sheet.querySelector('[name="draft-name"]').value.trim(), amount = parseAmount(sheet.querySelector('[name="draft-amount"]').value), due = sheet.querySelector('[name="draft-date"]').value;
      if (!name || !validMoney(amount) || amount < (item.spent || 0) || due && (!dateValid(due) || due < today())) { sheet.querySelector('.error').textContent = 'Check the name, total budget and date.'; return; }
      const d = ctx.draft.plan, updated = {...item,name:name.slice(0,40),amount,due};
      if (duplicateBudgetItem(d.items, updated.name, item.id)) { sheet.querySelector('.error').textContent = duplicateCopy(updated.name); return; }
      d.items = d.items.map(i => i.id === item.id ? updated : i); d.item = {...updated}; remember(ctx); ctx.closeSheet(); ctx.refresh();
    };
  });
}

function provenanceCopy(p) {
  if (!p) return '';
  if(!p.sources)return 'Earlier suggested amounts. Review every category; some may use student starting amounts.';
  const sources=Object.values(p.sources||{}),sample=sources.includes('sample'),existing=sources.includes('existing'),history=sources.includes('history');
  if (!history) return sample ? 'Sample student starting amounts, not a prediction from your spending. Adjust them to your week.' : 'Based on your existing plan. Review the amounts for this period.';
  return `${sample||existing?'Mixed starting amounts. ':''}${p.transactions} confirmed payments across four complete weeks (${dateLabel(p.start)} – ${dateLabel(p.end)}). History-based weekly averages × ${p.projectedWeeks} weeks.${sample?' Some categories use sample student amounts.':''}${existing?' Categories without history keep your existing amounts.':''} Fees, refunds and internal moves are excluded.`;
}

function planHome(ctx) {
  const s = ctx.state, sum = getSummary(s), items = s.budget?.items || [], unfinished = hasPlanDraft(ctx);
  if (!s.budget?.created && !items.length) {
    return `<section class="page">${sectionHead('Plan')}<div class="content">${empty({ emoji: icon('plan', 28), title: 'Give your money a plan.', body: 'Food, transport and the things that cannot wait.', action:unfinished?'p:plan-resume':'p:plan-quick',label:unfinished?'Continue budget setup':'Quick essentials' })}<button class="text-button planning-alt-start" data-action="p:plan-start">Build one essential at a time</button><details class="planning-details"><summary>How your plan works</summary><p>Your money stays in your account. Lumo simply shows what is already spoken for. Expected allowance and unpaid IOUs stay outside your balance.</p></details>${planningParityLinks(ctx,'plan')}</div></section>`;
  }
  const budgetPlanned = items.reduce((n, i) => n + Math.max(0, i.amount - i.spent), 0);
  const spent = items.reduce((n, i) => n + (i.spent || 0), 0);
  return `<section class="page">${sectionHead('Your plan', `<button type="button" data-action="${unfinished?'p:plan-resume':'p:plan-add'}" aria-label="${unfinished?'Continue budget setup':'Add an essential'}">${icon(unfinished?'arrow':'plus',18)} ${unfinished?'Continue':'Add'}</button>`)}
    <div class="planning-summary" role="region" aria-label="Plan summary"><div class="planning-hero planning-plan-hero"><div><span class="muted">Still set aside</span><div class="amount-xl accent">${planningMoney(ctx,budgetPlanned)}</div></div><span class="planning-used muted">${planningMoney(ctx,spent)}<small>used so far</small></span></div>
    <div class="stat-grid planning-balance-strip"><div class="stat"><span class="muted">Available</span><strong>${planningMoney(ctx,sum.available)}</strong></div><div class="stat"><span class="muted">Left after plan</span><strong>${planningMoney(ctx,sum.spendable)}</strong></div></div></div><div class="content">
    ${sum.planned + (s.buffer || 0) > sum.available ? `<button class="notice" data-action="p:recovery">${icon('info')} Your plan needs ${planningMoney(ctx,sum.planned + (s.buffer || 0) - sum.available)} more. Let’s work through it. ${icon('chevron', 16)}</button>` : ''}
    <div class="section-label"><h2>Essentials</h2><button class="text-button" data-action="p:plan-suggest">Suggest from spending</button></div>
    <div class="panel planning-list planning-essentials">${items.map(item => `<button type="button" class="plan-tracker" data-action="p:plan-item" data-id="${esc(item.id)}"><div class="row"><span class="row-icon">${icon(categorySymbol(item.name),20)}</span><div class="row-copy"><span class="row-title">${esc(item.name)}</span><span class="row-sub">${dateLabel(item.due)} · ${planningMoney(ctx,item.spent || 0)} used</span></div><span class="row-right">${planningMoney(ctx,Math.max(0, item.amount - item.spent))}<small>left</small></span>${icon('chevron', 16)}</div><div class="progress"><span class="progress-bar" style="width:${Math.min(100, Math.max(0, (item.spent || 0) / Math.max(1, item.amount) * 100))}%"></span></div></button>`).join('')}</div>
    ${unfinished ? '<p class="planning-help">Your unfinished changes are saved.</p>' : ''}
    ${s.budget.provenance?`<details class="planning-details"><summary>${Object.values(s.budget.provenance.sources||{}).includes('sample')?'Sample student starting amounts':Object.values(s.budget.provenance.sources||{}).includes('history')?'How these amounts were suggested':'Starting amounts from your plan'}</summary><p>${esc(provenanceCopy(s.budget.provenance))}</p></details>`:''}
    <details class="planning-details"><summary>Breathing room & plan details</summary><div class="planning-list">${row({ emoji: icon('lock', 20), title: 'Your breathing room', sub: `${planningMoney(ctx,s.buffer || 0)} kept untouched`, right: 'Edit', action: 'p:buffer' })}</div><p>A budget reserves part of your available money. It does not move it. Expected allowance and unpaid IOUs stay outside your balance.</p></details>${planningParityLinks(ctx,'plan')}</div></section>`;
}

function renderPlanSetup(ctx, route) {
  const draft = ctx.draft.plan || (ctx.draft.plan = { items: [], item: {} });
  const step = route.step || 'name';
  if(step==='quick'){
    const q=draft.quick||(draft.quick=createQuickEssentials());
    if(draft.lastRoute?.step==='review')QUICK_ESSENTIALS.forEach((c,i)=>{const item=draft.items.find(x=>budgetCategoryKey(x.name)===budgetCategoryKey(c.name));q.amounts[i]=item?(item.amount/100).toFixed(2):'';q.dates[i]=item?.due||'';});
    draft.lastRoute={section:'plan',page:'create',step:'quick'};
    if(ctx.state.budget?.created||ctx.state.budget?.items?.length)return `<section class="page">${pageHead('Your plan is in progress')}<p>Edit your existing essentials to keep their spending history.</p>${btn('Back to my plan','p:quick-home')}</section>`;
    return `<section class="page task-page">${setupHead('Quick essentials')}<div class="content"><h1 class="large-question">Cover your basics.</h1><p class="muted" style="margin-bottom:20px">Fill what you need. Leave the rest blank.</p><div class="form-stack">${QUICK_ESSENTIALS.map((c,i)=>field({label:`${c.name} (GH₵)`,name:`quick-amount-${i}`,type:'number',value:q.amounts[i],min:'0',placeholder:'Leave blank if not needed'})).join('')}${field({label:'Make this plan last until',name:'quick-end',type:'date',value:q.endDate,min:today(),required:true})}<p class="muted small">This is your plan’s horizon. Your expected allowance date stays separate.</p><details class="planning-details"><summary>Dates & breathing room</summary><p class="planning-help">Individual due dates · optional</p><div class="form-stack" style="margin-top:16px">${QUICK_ESSENTIALS.map((c,i)=>field({label:`${c.name} needed by`,name:`quick-date-${i}`,type:'date',value:q.dates[i],min:today()})).join('')}</div>${field({label:'Keep a little back (GH₵) · optional',name:'quick-buffer',type:'number',value:q.bufferText,min:'0',placeholder:'0.00'})}<p class="muted small">Your cushion stays outside daily flex. Nothing moves when you make a plan.</p></details>${err()}</div></div><div class="bottom-action">${btn('Review my essentials','p:quick-review')}</div></section>`;
  }
  if (step === 'name') {
    return `<section class="page task-page">${setupHead('Make a plan')}${setupProgress(1, 3)}<div class="content"><h1 class="large-question">What must this cover?</h1><div class="stack">${categories.map(c => {
      const used = duplicateBudgetItem(draft.items, c.name, draft.item?.id);
      return row({ emoji: icon(categorySymbol(c.name),20), title: c.name, sub: used ? 'Already in your plan' : '', right: used ? icon('check', 16) : '', action: used ? '' : `p:category-${categories.indexOf(c)}` });
    }).join('')}</div><div class="form-stack" style="margin-top:18px">${field({ label: 'Something else?', name: 'planning-name', value: draft.item?.name || '', placeholder: 'Give this essential a name' })}${err()}</div></div><div class="bottom-action">${btn('Continue', 'p:plan-name')}</div></section>`;
  }
  if (step === 'amount') {
    return `<section class="page task-page">${setupHead(draft.item?.name || 'Your essential')}${setupProgress(2, 3)}<div class="content"><h1 class="large-question">How much for this?</h1>${moneyInput(draft.item?.amountText ?? (draft.item?.amount ? (draft.item.amount / 100).toFixed(2) : ''))}<p class="muted">Available in your account: ${planningMoney(ctx,ctx.state.wallet)}</p><div class="chips">${[5000, 10000, 20000, 50000].map(v => `<button class="chip" data-action="p:quick-amount" data-amount="${v}">${cash(v, { decimals: false })}</button>`).join('')}</div>${err()}</div><div class="bottom-action">${btn('Continue', 'p:plan-amount')}</div></section>`;
  }
  if (step === 'date') {
    return `<section class="page task-page">${setupHead(draft.item?.name || 'Your essential')}${setupProgress(3, 3)}<div class="content"><h1 class="large-question">When is it needed?</h1><p class="lead muted">Give this money a date, so the important things stay in view.</p><div class="form-stack">${field({ label: 'Needed by', name: 'planning-date', type: 'date', value: draft.item?.due || ctx.state.income?.nextDate || future(30), min: today(), required: true })}${err()}</div></div><div class="bottom-action">${btn('Add to my plan', 'p:plan-date')}</div></section>`;
  }
  const reviewItems = draft.newPeriod ? draft.items.map(item => ({ ...item, spent: 0 })) : draft.items;
  const reviewEndDate = draft.newPeriod?.endDate || draft.endDate || ctx.state.budget.endDate;
  const reviewBuffer = draft.newPeriod ? ctx.state.buffer : draft.buffer ?? ctx.state.buffer;
  const total = reviewItems.reduce((n, i) => n + Math.max(0, i.amount - (i.spent || 0)), 0);
  const previewSummary = getSummary({ ...ctx.state, buffer: reviewBuffer, budget: { ...ctx.state.budget, created: true, items: reviewItems, endDate: reviewEndDate } });
  const available = previewSummary.available;
  const left = previewSummary.spendable;
  const gap = Math.max(0, previewSummary.planned + (reviewBuffer || 0) - available);
  return `<section class="page task-page">${setupHead('Review your budget')}<div class="content"><h1 class="large-question">Here’s your plan.</h1>${draft.newPeriod?.endDate||draft.endDate?`<p class="muted" style="margin-bottom:18px">Plan covers you until ${dateLabel(reviewEndDate)}. Allowance and bill dates stay separate.</p>`:''}${draft.suggestion?`<p class="notice">${esc(provenanceCopy(draft.suggestion))}</p>`:''}<div class="panel">${draft.items.map(i => row({ emoji: icon(categorySymbol(i.name),20), title: i.name, sub: dateLabel(i.due), right: cash(i.amount), action: `p:plan-review-${i.id}` })).join('')}</div><p class="muted" style="font-size:12px">Tap an essential to adjust it.</p><div class="stat-grid" style="margin-top:24px"><div class="stat"><span class="muted">Budget set aside</span><strong>${cash(total)}</strong></div><div class="stat"><span class="muted">Left after plan</span><strong class="accent">${planningMoney(ctx,left)}</strong></div></div>${gap > 0 ? `<p class="notice">Your plan and due IOUs need ${cash(gap)} more than you currently have. Save it to see the gap clearly.</p>` : `<p class="muted">Includes due IOUs and ${planningMoney(ctx,reviewBuffer || 0)} kept as breathing room.</p>`}${draft.quick?`<button class="text-button" data-action="p:quick-edit">Edit quick essentials</button>`:''}<button class="text-button" data-action="p:plan-another">${icon('plus', 18)} Add another essential</button>${err()}</div><div class="bottom-action">${btn(ctx.state.budget?.created ? 'Update my plan' : 'Create my budget', 'p:plan-save', { disabled: !draft.items.length })}</div></section>`;
}

function boxesHome(ctx) {
  const boxes = (ctx.state.boxes || []).filter(b=>!b.archived), total = boxes.reduce((n, b) => n + b.balance, 0), archivedHeld = (ctx.state.boxes || []).filter(b=>b.archived).reduce((n,b)=>n+b.balance,0), unfinished = hasBoxDraft(ctx);
  return `<section class="page">${sectionHead('Money Boxes',boxes.length?`<button type="button" data-action="p:box-start" aria-label="Create a Money Box">${icon('plus',18)} New</button>`:'')}<div class="planning-hero"><span class="muted">In active boxes</span><div class="amount-xl accent">${planningMoney(ctx,total)}</div><span class="muted">${boxes.length ? `${boxes.length} ${boxes.length === 1 ? 'goal' : 'goals'}` : 'Your next chapter starts here.'}</span></div><div class="content">${archivedHeld > 0 ? `<button type="button" class="text-button" data-parity="archives" aria-label="View archived boxes"><span>Your Savings total also includes ${planningMoney(ctx,archivedHeld)} in archived boxes.</span>${icon('chevron',16)}</button>` : ''}${unfinished ? `<div class="planning-saved-draft">${row({emoji:icon('clock',20),title:'Continue your Money Box',sub:ctx.draft.box.name || 'Your goal setup is saved',action:'p:box-resume'})}</div>` : ''}${boxes.length ? `<div class="box-grid planning-box-list">${boxes.map(b => `<button type="button" class="box-card planning-box-row" data-action="p:box-open" data-id="${esc(b.id)}"><span class="box-emoji">${esc(b.emoji || '✨')}</span><span class="planning-box-copy"><span class="row-title">${esc(b.name)}</span><span class="row-sub">${b.target?`Goal ${planningMoney(ctx,b.target)}`:'Open-ended saving'}${hasBoxProtection(b)?' · Partner protection':b.locked?' · Locked':b.hack?.type&&b.hack.type!=='none'?' · Savings Hack':''}</span></span><strong class="box-balance box-amount">${planningMoney(ctx,b.balance)}</strong>${b.target?progress(b.balance, b.target):''}${icon('chevron',16)}</button>`).join('')}</div>` : empty({ emoji: icon('box',28), title: 'What are you saving for?', body: 'Give your next goal a little space.', action: unfinished?'p:box-resume':'p:box-start', label: unfinished?'Continue your Money Box':'Create a Money Box' })}${planningParityLinks(ctx,'boxes')}</div></section>`;
}

function renderBoxSetup(ctx, route) {
  const draft = ctx.draft.box || (ctx.draft.box = { name: '', emoji: '✨', target: 0, deadline: future(90) });
  const step = route.step || 'name';
  if (step === 'name') {
    return `<section class="page task-page">${setupHead(route.edit ? 'Edit goal name' : 'Create a Money Box',{editing:!!route.edit})}${setupProgress(1, 5)}<div class="content"><h1 class="large-question">What are you saving for?</h1><div class="chips">${boxIdeas.map((b, i) => `<button class="chip${draft.name === b.name ? ' selected' : ''}" data-action="p:box-idea" data-index="${i}">${b.emoji} ${b.name}</button>`).join('')}</div><div class="form-stack" style="margin-top:22px">${field({ label: 'Give your goal a name', name: 'planning-name', placeholder: 'Something worth looking forward to', value: draft.name })}<details class="planning-details planning-symbol-choice"><summary>Choose a symbol</summary><div class="chips" aria-label="Choose a Money Box emoji">${emojis.map(e => `<button class="chip ${draft.emoji === e ? 'selected' : ''}" data-action="p:box-emoji" data-emoji="${esc(e)}" aria-label="${esc(e)}" aria-pressed="${draft.emoji === e}">${e}</button>`).join('')}</div></details>${err()}</div></div><div class="bottom-action">${btn(route.edit ? 'Save name' : 'Continue', 'p:box-name')}</div></section>`;
  }
  if (step === 'target') {
    return `<section class="page task-page">${setupHead(`${draft.emoji} ${draft.name}`,{editing:!!route.edit})}${setupProgress(2, 5)}<div class="content"><h1 class="large-question">What’s your goal amount?</h1>${moneyInput(draft.amountText ?? (draft.target ? (draft.target / 100).toFixed(2) : ''))}<p class="muted">You can change your goal later, or keep this box open-ended.</p><button class="text-button" data-action="p:box-no-target">Save without a target</button>${err()}</div><div class="bottom-action">${btn(route.edit ? 'Save goal amount' : 'Continue', 'p:box-target')}</div></section>`;
  }
  if (step === 'date') {
    return `<section class="page task-page">${setupHead(`${draft.emoji} ${draft.name}`,{editing:!!route.edit})}${setupProgress(3, 5)}<div class="content"><h1 class="large-question">Got a goal date in mind?</h1><div class="form-stack">${field({ label: 'Goal date', name: 'planning-date', type: 'date', value: draft.deadline || '', min: future(1), required: false })}</div><div class="chips" style="margin-top:20px">${[[30, 'A month'], [90, '3 months'], [180, '6 months']].map(([d, label]) => `<button class="chip" data-action="p:quick-date" data-days="${d}">${label}</button>`).join('')}</div><button class="text-button" data-action="p:box-no-date">No deadline for now</button>${err()}</div><div class="bottom-action">${btn(route.edit ? 'Save goal date' : 'Continue', 'p:box-date')}</div></section>`;
  }
  if (step === 'partner') return renderInitialPartnerSetup(ctx,route,{setupHead,setupProgress,err});
  const p = goalPace(draft);
  const pace = p.overdue ? 'Your goal date has passed. Choose a new date or adjust your goal. You can keep saving at your own pace.' : !draft.target ? 'Save at your own pace. You can add a target later.' : draft.deadline ? `About ${cash(p.amount)} ${p.period} to reach your goal. A guide, not an automatic payment.` : `${cash(p.amount)} to reach your goal. Save at your own pace.`;
  return `<section class="page task-page">${setupHead('Review your Money Box',{editing:!!route.edit})}${setupProgress(5, 5)}<div class="content"><div class="planning-goal-heading"><span aria-hidden="true">${esc(draft.emoji)}</span><h1>${esc(draft.name)}</h1><button type="button" class="text-button" data-action="p:box-edit-name" aria-label="Edit goal name">Edit</button></div><p class="planning-pace-guide ${p.overdue?'notice':'muted'}">${esc(pace)}</p><div class="panel planning-list planning-review-list">${row({ title: 'Goal amount', right: draft.target?cash(draft.target):'Open-ended', action: 'p:box-edit-target' })}${row({ title: 'Goal date', right: draft.deadline?dateLabel(draft.deadline):'No deadline', action: 'p:box-edit-date' })}${row({ title: 'Accountability partner', sub: initialPartnerReviewCopy(ctx), action: 'p:box-edit-partner' })}${row({emoji:icon('repeat',20),title:'Savings rule',sub:hackCopy(draft.hack, ctx),action:'p:box-setup-hack'})}</div>${draft.partnerEnabled&&!partnerReady(ctx)?'<div class="notice"><span>Your partner needs to confirm this name and number before this box is created.</span><button class="text-button" data-action="p:box-edit-partner">Confirm partner</button></div>':''}${err()}</div><div class="bottom-action">${btn('Create Money Box', 'p:box-save',{disabled:draft.partnerEnabled&&!partnerReady(ctx)})}</div></section>`;

}

function boxDetail(ctx, route) {
  const b = foundBox(ctx, route);
  if (!b) return `<section class="page">${pageHead('Money Box')}${empty({ emoji: '✨', title: 'This box has moved on.', body: 'Your other goals are waiting.', action: 'p:boxes-home', label: 'View Money Boxes' })}</section>`;
  const p = goalPace(b), completed = b.target>0&&b.balance >= b.target, protection = protectionSummary(b);
  const partnerRow = row({emoji:icon('users',20),title:'Accountability partner',sub:hasBoxProtection(b) ? protection.status === 'recovery-required' ? 'Partner details need review · Verified support can help' : `${protection.partnerName || 'Your partner'} · Fresh code for every transfer back` : protection.status === 'invited' ? 'Invitation pending · Withdrawals stay available' : protection.status === 'declined' ? 'Invitation declined · Choose another partner' : protection.status === 'cancelled' ? 'Invitation cancelled · Choose a partner anytime' : 'Optional backup from someone you trust.',action:'p:box-partner-manage'});
  const tx = (ctx.state.transactions || []).filter(t => t.boxId === b.id).slice(0, 5);
  return `<section class="page task-page">${pageHead(`${b.emoji || '✨'} ${b.name}`, { action: `<button class="icon-button" data-action="p:box-menu" aria-label="Money Box options">${icon('more')}</button>` })}<div class="pool-card" style="position:relative;height:255px"><div class="pool-amount" style="position:absolute;top:38px;left:0;right:0;text-align:center;z-index:1;pointer-events:none"><div class="amount-xl accent">${planningMoney(ctx,b.balance)}</div><div class="muted">${b.target?`of ${planningMoney(ctx,b.target)}`:'Your open-ended pot'}</div></div><canvas class="saver-pool" id="saver-pool" style="display:block;width:100%;height:255px;touch-action:pan-x" aria-label="Interactive savings pool. ${Math.min(100, Math.round(b.balance / Math.max(1, b.target) * 100))}% of goal saved"></canvas></div><p class="pool-hint">${b.balance ? 'Pull down to save a little.' : 'Your first contribution starts the ripple.'}</p><div class="content"><div class="panel planning-list planning-goal-status">${row({ emoji: icon(completed ? 'check' : 'calendar',20), title: completed ? 'You made it.' : p.overdue ? 'Your goal date has passed' : b.target?`About ${planningMoney(ctx,p.amount)} ${p.period}`:'Your pace. Your pot.', sub: completed ? 'This goal is fully funded.' : p.overdue ? `${planningMoney(ctx,p.remaining)} to go. Choose a new date or adjust your goal.` : b.target&&b.deadline ? `To reach ${planningMoney(ctx,b.target)} by ${dateLabel(b.deadline)}` : 'No rush. Every contribution counts.', action: 'p:box-edit' })}${partnerRow}</div><button type="button" class="text-button planning-withdraw" data-action="p:box-withdraw">Take money out ${icon('arrow',17)}</button><details class="planning-details"><summary>Saving options</summary><div class="planning-list">${row({ emoji: icon('repeat',20), title: b.hack?.type && b.hack.type !== 'none' ? b.hack.paused?'Savings Hack is paused':'Savings Hack is on' : 'Try a Savings Hack', sub: hackCopy(b.hack, ctx), action: 'p:box-hack' })}${row({ emoji: icon(b.locked?'lock':'unlock',20), title: hasBoxProtection(b) ? b.locked ? 'Your goal lock is on' : 'Your own goal lock' : b.locked ? 'Locked for your goal' : 'Keep it for your goal', sub: hasBoxProtection(b) ? b.locked ? 'Unlock this first. Partner approval stays on.' : 'An extra lock. Partner approval stays on.' : b.locked ? 'Unlock before taking money out.' : 'Lock this box to add a moment of pause.', action: 'p:box-lock', right: b.locked ? 'Unlock' : 'Lock' })}${row({emoji:icon('plus',20),title:'Save a little',sub:'Move a small amount into this goal.',action:'p:box-pull'})}</div></details>${tx.length ? `<details class="planning-details"><summary>Recent moves</summary><div class="planning-list">${tx.map(t => row({ emoji: icon(t.direction === 'in' ? 'download' : 'arrow',20), title: t.note || 'Money moved', sub: `${dateLabel(t.at)} · ${t.status}`, right: planningMoney(ctx,t.amount), action:t.boxTransfer?`parity-move-${t.id}`:'' })).join('')}</div></details>` : ''}<p class="planning-help">Contributions live in savings, separate from your everyday balance.</p></div><div class="bottom-action">${btn('Add money', 'p:box-contribute')}</div></section>`;
}

function hackPage(ctx, route) {
  const b = foundBox(ctx, route);
  if (!b) return boxesHome(ctx);
  const draft = ctx.draft.hack || (ctx.draft.hack = { ...(b.hack || { type: 'none', value: 0 }) });
  const selected = draft.type || 'none';
  return `<section class="page task-page">${pageHead('Savings Hacks')}<div class="content"><p class="eyebrow">${esc(b.emoji)} ${esc(b.name)}</p><h1 class="large-question">Choose your saving style.</h1><div class="panel">${[
    ['percent', 'spark', 'A percentage of each payment', 'Spend GH₵100. Save GH₵5 at 5%.'],
    ['fixed', 'plus', 'A fixed amount each time', 'A small extra contribution when you pay.'],
    ['roundup', 'repeat', 'Round up my payments', 'Let the spare change find its purpose.'],
  ].map(([type, emoji, title, sub]) => `<button class="row ${selected === type ? 'selected' : ''}" data-action="p:hack-type" data-type="${type}" aria-pressed="${selected === type}"><span class="row-icon">${icon(emoji,20)}</span><span class="row-copy"><span class="row-title">${title}</span><span class="row-sub">${sub}</span></span>${selected === type ? `<span class="accent">${icon('check')}</span>` : icon('chevron', 16)}</button>`).join('')}</div>${selected === 'percent' || selected === 'fixed' ? `<div class="form-stack" style="margin-top:22px">${field({ label: selected === 'percent' ? 'Percentage to save' : 'Amount to save each time (GH₵)', name: 'planning-hack', type: 'number', value: draft.inputText ?? (selected === 'percent' ? String(draft.value || 5) : ((draft.value || 100) / 100).toFixed(2)), min: selected === 'percent' ? '1' : '0.01', max: selected === 'percent' ? '100' : '10000' })}</div>` : selected === 'roundup' ? `<div class="section-label">Round to the next</div><div class="chips">${[100, 200, 500].map(value => `<button class="chip ${(draft.value || 100) === value ? 'selected' : ''}" data-action="p:hack-round" data-value="${value}">${cash(value, { decimals: false })}</button>`).join('')}</div>` : ''}<p class="muted" style="font-size:12px;margin-top:18px">Only successful payments trigger a hack. Lumo skips a contribution when there is not enough spendable money.</p>${b.hack?.type && b.hack.type !== 'none' ? '<button class="text-button" data-action="p:hack-disable">Turn off this hack</button>' : ''}${err()}</div><div class="bottom-action">${btn('Save my hack', 'p:hack-save', { disabled: selected === 'none' })}</div></section>`;
}

export function renderPlanning(ctx, route) {
  if (poolCleanup) { poolCleanup(); poolCleanup = null; }
  let html = renderPlanningParity(ctx,route);
  if (!html) {
    if (route.section === 'plan') html = route.page === 'create' ? renderPlanSetup(ctx, route) : planHome(ctx);
    else if (route.page === 'create') html = renderBoxSetup(ctx, route);
    else if (route.page === 'detail' || route.page === 'edit') html = boxDetail(ctx, route);
    else if (route.page === 'hack') html = hackPage(ctx, route);
    else html = boxesHome(ctx);
  }
  const page = ['create','detail','edit','hack','hacks','periods','guided','archive','transfer'].includes(route.page) ? route.page : 'home';
  return html.replace('<section class="', `<section class="planning-page planning-${route.section === 'plan'?'plan':'boxes'} planning-${page} `);
}

function planStart(ctx, add = false, force = false) {
  const fresh = () => { ctx.setCapture?.(null); ctx.draft.plan = { items: add ? (ctx.state.budget?.items || []).map(i => ({ ...i })) : [], item: {} }; remember(ctx); ctx.go({ section: 'plan', page: 'create', step: 'name', backTo: {section:'plan',page:'home'} }); };
  if (!force && hasPlanDraft(ctx)) return chooseResume(ctx, 'plan', fresh);
  fresh();
}
function quickPlanStart(ctx,force=false){
  if(ctx.state.budget?.created||ctx.state.budget?.items?.length){ctx.toast('Edit your current plan to keep its spending intact.');return;}
  const fresh=()=>{ctx.setCapture?.(null);ctx.draft.plan={items:[],item:{},quick:createQuickEssentials(),lastRoute:{section:'plan',page:'create',step:'quick'}};remember(ctx);ctx.go({section:'plan',page:'create',step:'quick',backTo:{section:'plan',page:'home'}});};
  if(!force&&hasPlanDraft(ctx))return chooseResume(ctx,'plan',fresh);fresh();
}
function boxStart(ctx, force = false) {
  const fresh = () => { ctx.setCapture?.(null); ctx.draft.box = { name: '', emoji: '✨', target: 0, balance: 0, deadline: future(90) }; remember(ctx); ctx.go({ section: 'boxes', page: 'create', step: 'name', backTo: {section:'boxes',page:'home'} }); };
  if (!force && hasBoxDraft(ctx)) return chooseResume(ctx, 'boxes', fresh);
  fresh();
}
function displayResult(ctx, result, success) { if (!result.ok) { ctx.toast(result.message || 'Let’s check those details.'); return false; } if (success) ctx.toast(success); return true; }

function editBudgetItem(ctx, id) {
  const item = ctx.state.budget?.items?.find(i => i.id === id);
  if (!item) return;
  planningSheet(ctx, `<div class="sheet-form"><h2>${icon(categorySymbol(item.name),20)} ${esc(item.name)}</h2><form id="plan-item-form" class="form-stack">${field({ label: 'Name', name: 'name', value: item.name, required: true })}${field({ label: 'Total budget (GH₵)', name: 'amount', type: 'number', value: (item.amount / 100).toFixed(2), min: ((item.spent || 0) / 100).toFixed(2), required: true })}${field({ label: 'Needed by', name: 'due', type: 'date', value: item.due || future(30), required: true })}<p class="muted">${planningMoney(ctx,item.spent || 0)} already used. Your new total must cover that.</p><p class="error" role="alert"></p><button class="button" type="submit">Save changes</button></form><button class="button ghost" data-delete-item style="margin-top:10px">Remove this essential</button></div>`, sheet => {
    sheet.querySelector('form').addEventListener('submit', event => {
      event.preventDefault(); const data = new FormData(event.currentTarget), amount = parseAmount(data.get('amount')), name = String(data.get('name')).trim(), due = String(data.get('due'));
      if (!name || !validMoney(amount) || amount < (item.spent || 0) || !dateValid(due)) { sheet.querySelector('.error').textContent = 'Add a name, a valid date, and an amount that covers what you have used.'; return; }
      const items = ctx.state.budget.items.map(i => i.id === id ? { ...i, name: name.slice(0, 40), amount, due } : { ...i });
      const result = ctx.act('updateBudget', { items });
      if (!result.ok) { sheet.querySelector('.error').textContent = result.message; return; }
      ctx.closeSheet(); ctx.refresh(); ctx.toast('Your plan is up to date.');
    });
    sheet.querySelector('[data-delete-item]').addEventListener('click', () => {
      const result = ctx.act('deleteBudgetItem', { id });
      if (displayResult(ctx, result, 'Essential removed. Your money stays in your account.')) { ctx.closeSheet(); ctx.refresh(); }
    });
  });
}

function editBox(ctx, b) {
  planningSheet(ctx, `<div class="sheet-form"><h2>${esc(b.emoji)} Make it yours</h2><form class="form-stack">${field({ label: 'Name', name: 'name', value: b.name, required: true })}${field({ label: 'Goal amount (GH₵)', name: 'target', type: 'number', value: b.target?(b.target / 100).toFixed(2):'', min: '0', required: false })}${field({ label: 'Goal date', name: 'deadline', type: 'date', value: b.deadline || '', min: future(1), required: false })}<p class="error" role="alert"></p><button type="submit" class="button">Save changes</button></form></div>`, sheet => {
    sheet.querySelector('form').addEventListener('submit', event => {
      event.preventDefault(); const data = new FormData(event.currentTarget), target = data.get('target')?parseAmount(data.get('target')):0, name = String(data.get('name')).trim(), deadline = String(data.get('deadline'));
      if (!name || !Number.isSafeInteger(target) || target<0 || deadline&&(!dateValid(deadline) || deadline < future(1))) { sheet.querySelector('.error').textContent = 'Add a name. A target and future date are optional.'; return; }
      const result = ctx.act('updateBox', { id: b.id, name: name.slice(0, 40), target, deadline });
      if (!result.ok) { sheet.querySelector('.error').textContent = result.message; return; }
      ctx.closeSheet(); ctx.refresh(); ctx.toast('A fresh plan for your goal.');
    });
  });
}

function boxMoney(ctx, b, withdraw = false, suggested = null) {
  if (withdraw && b.locked) { ctx.toast(hasBoxProtection(b) ? 'Unlock your goal lock in Saving options first. Partner approval stays on.' : 'Unlock this Money Box before taking money out.'); return; }
  if (withdraw && hasBoxProtection(b)) return openProtectedBoxWithdrawal(ctx, b, suggested);
  const available = withdraw ? b.balance : ctx.state.wallet;
  const preset = suggested || Math.min(available, 10000);
  const requestKey = uid();
  planningSheet(ctx, `<div class="sheet-form"><p class="eyebrow">${esc(b.emoji)} ${esc(b.name)}</p><h2>${withdraw ? 'Bring some back?' : suggested ? 'A little move. A bigger future.' : 'Give your goal a little lift.'}</h2><p class="muted">${withdraw ? 'Money returns to your everyday account.' : `You have ${planningMoney(ctx,available)} in your everyday account.`}</p><form class="form-stack">${field({ label: 'Amount (GH₵)', name: 'amount', type: 'number', value: (preset / 100).toFixed(2), min: '0.01', max: (available / 100).toFixed(2), required: true })}<details><summary>Try a transfer outcome</summary><label>Local simulation<select name="outcome"><option value="success">Confirmed</option><option value="pending">Pending</option><option value="failed">Failed</option></select></label></details><p class="notice" data-preview></p><p class="error" role="alert"></p><button class="button" type="submit">${withdraw ? 'Move to everyday account' : 'Add to Money Box'}</button></form><p class="muted" style="font-size:12px">Demo PIN: 1234. This prototype moves simulated money.</p></div>`, sheet => {
    const input = sheet.querySelector('[name="amount"]'), preview = sheet.querySelector('[data-preview]');
    const update = () => {
      const amount = parseAmount(input.value);
      if (!validMoney(amount)) { preview.textContent = 'Enter the amount you would like to move.'; return; }
      const walletAfter = ctx.state.wallet + (withdraw ? amount : -amount), current = getSummary(ctx.state);
      preview.textContent = withdraw ? `Everyday balance after: ${planningMoney(ctx,walletAfter)}.` : `Everyday balance after: ${planningMoney(ctx,Math.max(0, walletAfter))}.${walletAfter < current.planned + (ctx.state.buffer || 0) ? ' This would use some money covered by your plan.' : ''}`;
    };
    input.addEventListener('input', update); update();
    sheet.querySelector('form').addEventListener('submit', event => {
      event.preventDefault(); const amount = parseAmount(input.value), status = sheet.querySelector('[name=outcome]')?.value||'success';
      if (!validMoney(amount) || amount > available) { sheet.querySelector('.error').textContent = `Choose an amount between GH₵0.01 and ${planningMoney(ctx,available)}.`; return; }
      ctx.closeSheet();
      ctx.auth({ title: withdraw ? 'Confirm your transfer' : 'Back your goal', onCancel: () => boxMoney(ctx,b,withdraw,amount), onSuccess: () => {
        const wasComplete = b.balance >= b.target;
        const result = ctx.act(withdraw ? 'withdrawBox' : 'contributeBox', { id: b.id, amount, status, idempotencyKey: requestKey });
        if (!displayResult(ctx, result)) return;
        if(result.transaction?.status!=='success'){ctx.go({section:'boxes',page:'transfer',id:result.transaction.id,boxId:b.id});return;}
        ctx.refresh();
        if (!withdraw && !wasComplete && b.balance >= b.target) ctx.celebrate({ title: `${b.name}. You did that.`, body: `${planningMoney(ctx,b.balance)} saved. Every little move brought you here.`, button: 'Look at my goal', onDone: () => ctx.go({ section: 'boxes', page: 'detail', id: b.id }) });
        else ctx.toast(withdraw ? `${cash(amount)} is back in everyday money.` : `${cash(amount)} closer. Nice move.`);
      } });
    });
  });
}

export function openBoxFunding(ctx, boxId) {
  const box = (ctx.state.boxes || []).find(item => item.id === boxId && !item.archived);
  if (!box) { ctx.toast('Choose an active Money Box to add money.'); return; }
  return boxMoney(ctx, box);
}

function spareChange(ctx) {
  const wallet = ctx.state.wallet || 0;
  const proposed = wallet % 100 || 100;
  return Math.min(proposed, wallet);
}

function suggestBudget(ctx, force = false) {
  if (!force && hasPlanDraft(ctx)) return chooseResume(ctx,'plan',()=>suggestBudget(ctx,true));
  const history=budgetSuggestions(ctx.state),weeks=Math.max(1,Math.ceil(getSummary(ctx.state).daysLeft/7));
  const existing=ctx.state.budget.items.map(i=>({...i})),sources={};
  const find=name=>history.categories.filter(c=>budgetCategoryKey(c.name)===budgetCategoryKey(name)).reduce((n,c)=>n+c.weekly,0);
  const suggested=(existing.length?existing:categories.map((c,i)=>({...c,id:uid(),spent:0,amount:[45000,20000,10000,35000][i],due:getSummary(ctx.state).planEndDate}))).map(i=>{
    const weekly=find(i.name);sources[budgetCategoryKey(i.name)]=weekly?'history':existing.length?'existing':'sample';
    return {...i,amount:Math.max(i.spent||0,weekly?Math.ceil(weekly*weeks/100)*100:i.amount)};
  });
  ctx.draft.plan={items:suggested,item:{},suggestion:{...history,projectedWeeks:weeks,sources}};
  ctx.go({section:'plan',page:'create',step:'review'});ctx.toast(Object.values(sources).includes('history')?'Review the history-based amounts and any starting amounts.':'These are starting amounts. Make them fit your week.');
}

export function bindPlanning(ctx, route) {
  const stopParity=bindPlanningParity(ctx,route);
  let alive = true;
  const listeners = [], current = () => alive && (!ctx.route || ctx.route.section === route.section && ctx.route.page === route.page && (ctx.route.id || '') === (route.id || '') && (ctx.route.step || '') === (route.step || '') && !!ctx.route.edit === !!route.edit);
  const listen = (element, name, callback) => { if (!element) return; const handler = event => { if (current() && element.isConnected !== false && !element.disabled) callback(event); }; element.addEventListener(name, handler); listeners.push(() => element.removeEventListener?.(name, handler)); };
  ctx.setCapture?.(() => { if (alive) saveSetupCapture(ctx, route); });
  const intent=ctx.draft.boxTransferIntent;if(intent&&route.section==='boxes'&&route.page==='detail'&&intent.boxId===route.id){delete ctx.draft.boxTransferIntent;queueMicrotask(()=>{if(alive){const box=foundBox(ctx,route);if(box)boxMoney(ctx,box,intent.direction==='withdraw',intent.amount);}});}
  ctx.$$('input, select').forEach(el => { listen(el, 'input', () => saveSetupCapture(ctx, route)); listen(el, 'change', () => saveSetupCapture(ctx, route)); });
  const planRoute = (step, extra = {}) => { ctx.setCapture?.(null); ctx.go({ section: 'plan', page: 'create', step, ...extra }); };
  const boxRoute = (step, extra = {}) => { ctx.setCapture?.(null); ctx.go({ section: 'boxes', page: 'create', step, ...extra }, { replace: !!route.edit || !!extra.edit }); };
  const refresh = () => { ctx.setCapture?.(null); remember(ctx); ctx.refresh(); };
  ctx.$$('[data-action^="p:"]').forEach(button => listen(button, 'click', event => {
    saveSetupCapture(ctx, route);
    const action = button.dataset.action.slice(2), b = foundBox(ctx, route);
    if (action === 'edit-cancel') { if(ctx.draft.boxEditBackup)Object.assign(ctx.draft.box,ctx.draft.boxEditBackup); delete ctx.draft.boxEditBackup; ctx.setCapture?.(null); ctx.go({section:'boxes',page:'create',step:'review'},{replace:true}); return; }
    if (action === 'setup-cancel') { ctx.go({section:route.section,page:'home'},{replace:true}); ctx.toast('Setup saved. Continue whenever you’re ready.'); return; }
    if (action === 'plan-resume') return resumeSetup(ctx, 'plan');
    if (action === 'box-resume') return resumeSetup(ctx, 'boxes');
    if(action==='plan-quick')return quickPlanStart(ctx);
    if(action==='quick-home')return ctx.go({section:'plan',page:'home'});
    if(action==='quick-review'){
      const result=prepareQuickEssentials(ctx.state,ctx.draft.plan.quick,ctx.draft.plan.items,uid);if(!result.ok)return setError(ctx,result.message);
      Object.assign(ctx.draft.plan,{items:result.items,buffer:result.buffer,endDate:result.endDate,item:{}});remember(ctx);
      return planRoute('review',{backTo:{section:'plan',page:'create',step:'quick',backTo:{section:'plan',page:'home'}}});
    }
    if(action==='quick-edit'){
      const d=ctx.draft.plan;QUICK_ESSENTIALS.forEach((c,i)=>{const item=d.items.find(x=>budgetCategoryKey(x.name)===budgetCategoryKey(c.name));d.quick.amounts[i]=item?(item.amount/100).toFixed(2):'';d.quick.dates[i]=item?.due||'';});
      remember(ctx);return planRoute('quick',{backTo:{section:'plan',page:'home'}});
    }
    if (action === 'plan-start') return planStart(ctx);
    if (action === 'plan-add') return planStart(ctx, true);
    if (action === 'plan-item') return editBudgetItem(ctx, button.dataset.id);
    if (action === 'plan-suggest') return suggestBudget(ctx);
    if (action === 'recovery') return ctx.go({ section: 'life', page: 'recovery' });
    if (action === 'buffer') {
      planningSheet(ctx, `<div class="sheet-form"><h2>A little breathing room.</h2><p class="muted">This stays in your account, outside what Lumo shows as spendable.</p><form class="form-stack">${field({ label: 'Keep untouched (GH₵)', name: 'buffer', type: 'number', value: ((ctx.state.buffer || 0) / 100).toFixed(2), min: '0', required: true })}<p class="error" role="alert"></p><button type="submit" class="button">Save breathing room</button></form></div>`, sheet => {
        sheet.querySelector('form').addEventListener('submit', e => { e.preventDefault(); const amount = parseAmount(sheet.querySelector('[name="buffer"]').value); if (!Number.isSafeInteger(amount) || amount < 0) { sheet.querySelector('.error').textContent = 'Use a valid amount of zero or more.'; return; } const result = ctx.act('updateProfile', { buffer: amount }); if (!result.ok) { sheet.querySelector('.error').textContent = result.message; return; } ctx.closeSheet(); ctx.refresh(); });
      }); return;
    }
    const pd = ctx.draft.plan;
    if (action.startsWith('category-')) { const c = categories[Number(action.split('-')[1])]; if (!c) return; if (duplicateBudgetItem(pd.items, c.name, pd.item?.id)) return setError(ctx, duplicateCopy(c.name)); pd.item = { ...pd.item, name: c.name, emoji: c.emoji }; return planRoute('amount'); }
    if (action === 'plan-name') { const name = ctx.$('[name="planning-name"]')?.value.trim(); if (!name) return setError(ctx, 'What should we call this essential?'); if (duplicateBudgetItem(pd.items, name.slice(0, 40), pd.item?.id)) return setError(ctx, duplicateCopy(name.slice(0, 40))); pd.item = { ...pd.item, name: name.slice(0, 40), emoji: pd.item?.emoji || '📝' }; return planRoute('amount'); }
    if (action === 'quick-amount') { const input = ctx.$('#planning-amount'); if (input) input.value = (Number(button.dataset.amount) / 100).toFixed(2); saveSetupCapture(ctx,route); return; }
    if (action === 'plan-amount') { const amount = parseAmount(ctx.$('#planning-amount')?.value); if (!validMoney(amount)) return setError(ctx, 'Add a valid amount greater than zero.'); if (amount < (pd.item.spent || 0)) return setError(ctx, `This essential already has ${planningMoney(ctx,pd.item.spent)} used. Keep the total at least that high.`); pd.item.amount = amount; return planRoute('date'); }
    if (action === 'plan-date') { const due = ctx.$('[name="planning-date"]')?.value; if (!dateValid(due) || due < today()) return setError(ctx, 'Choose today or a future date.'); const item = { ...pd.item, id: pd.item.id || uid(), due, spent: pd.item.spent || 0 }; if (duplicateBudgetItem(pd.items, item.name, item.id)) return setError(ctx, duplicateCopy(item.name)); const index = pd.items.findIndex(i => i.id === item.id); if (index >= 0) pd.items[index] = item; else pd.items.push(item); pd.item = item; return planRoute('review'); }
    if (action.startsWith('plan-review-')) { const item = pd.items.find(i => i.id === action.slice(12)); if (item) return editDraftBudgetItem(ctx,item); return; }
    if (action === 'plan-another') { pd.item = {}; return planRoute('name'); }
    if (action === 'plan-save') {
      if (!pd?.items.length) return setError(ctx, 'Add an essential to start your plan.');
      const result = pd.newPeriod ? ctx.act(pd.newPeriod.periodId?'reuseBudgetPeriod':'startBudgetPeriod',{...pd.newPeriod,items:pd.items,provenance:pd.suggestion}) : ctx.act(ctx.state.budget?.created ? 'updateBudget' : 'createBudget', { items:pd.items,provenance:pd.suggestion,buffer:pd.buffer,endDate:pd.endDate });
      if (!result.ok) return setError(ctx, result.message);
      ctx.draft.plan = null;
      return ctx.celebrate({ title: 'Your money has a plan.', body: `${planningMoney(ctx,getSummary(ctx.state).spendable)} is left after your essentials and breathing room.`, button: 'See my plan', onDone: () => finish(ctx, { section: 'plan', page: 'home' }) });
    }
    if (action === 'box-start') return boxStart(ctx);
    if (action === 'boxes-home') return ctx.go({ section: 'boxes', page: 'home' });
    if (action === 'box-open') return ctx.go({ section: 'boxes', page: 'detail', id: button.dataset.id });
    if (action === 'hack-explain') { planningSheet(ctx, `<h2>Let the little things add up.</h2><p class="lead muted">A Savings Hack puts a little away when you make a successful payment.</p><div class="panel">${row({ emoji: '🪄', title: 'Percentage', sub: 'Save a percentage of each payment.' })}${row({ emoji: '⚡', title: 'Fixed amount', sub: 'Save the same small amount each time.' })}${row({ emoji: '🪙', title: 'Round up', sub: 'Save the change to the next whole amount.' })}</div><p class="muted">Choose a Money Box to switch one on. You can change it or turn it off whenever you like.</p>${btn('Got it', 'p:sheet-close')}`, sheet => sheet.querySelector('[data-action="p:sheet-close"]').addEventListener('click', ctx.closeSheet)); return; }
    const bd = ctx.draft.box;
    if(handleInitialPartnerAction(ctx,route,action,{setError,boxRoute,refresh}))return;
    if (action === 'box-idea') { const idea = boxIdeas[Number(button.dataset.index)]; if (!idea) return; bd.name = idea.name; bd.emoji = idea.emoji; refresh(); return; }
    if (action === 'box-emoji') { const input = ctx.$('[name="planning-name"]'); if (input) bd.name = input.value; bd.emoji = button.dataset.emoji; refresh(); return; }
    if (action === 'box-name') { const name = ctx.$('[name="planning-name"]')?.value.trim(); if (!name) return setError(ctx, 'Give this goal a name first.'); bd.name = name.slice(0, 40); if(route.edit)delete ctx.draft.boxEditBackup; return boxRoute(route.edit ? 'review' : 'target'); }
    if (action === 'box-setup-hack') return openHackEditor(ctx,bd,{setup:true});
    if (action === 'box-no-target') {bd.target=0;bd.amountText='';return boxRoute(route.edit?'review':'date');}
    if (action === 'box-no-date') {bd.deadline='';return boxRoute(route.edit?'review':'partner');}
    if (action === 'box-target') { const target = parseAmount(ctx.$('#planning-amount')?.value); if (!validMoney(target)) return setError(ctx, 'Choose a goal amount greater than zero.'); bd.target = target; if(route.edit)delete ctx.draft.boxEditBackup; return boxRoute(route.edit ? 'review' : 'date'); }
    if (action === 'quick-date') { const input = ctx.$('[name="planning-date"]'); if (input) input.value = future(Number(button.dataset.days)); saveSetupCapture(ctx,route); return; }
    if (action === 'box-date') { const deadline = ctx.$('[name="planning-date"]')?.value; if (!dateValid(deadline) || deadline <= today()) return setError(ctx, 'Give your goal a date in the future.'); bd.deadline = deadline; if(route.edit)delete ctx.draft.boxEditBackup; return boxRoute(route.edit ? 'review' : 'partner'); }
    if (action === 'box-edit-name') { ctx.draft.boxEditBackup={name:bd.name,target:bd.target,amountText:bd.amountText,deadline:bd.deadline,emoji:bd.emoji,partnerEnabled:bd.partnerEnabled,partnerName:bd.partnerName,partnerPhone:bd.partnerPhone,partnerInvitationId:bd.partnerInvitationId,partnerSetupId:bd.partnerSetupId,partnerCodePhase:bd.partnerCodePhase}; return boxRoute('name',{edit:true,backTo:{section:'boxes',page:'create',step:'review'}}); }
    if (action === 'box-edit-target') { ctx.draft.boxEditBackup={name:bd.name,target:bd.target,amountText:bd.amountText,deadline:bd.deadline,emoji:bd.emoji,partnerEnabled:bd.partnerEnabled,partnerName:bd.partnerName,partnerPhone:bd.partnerPhone,partnerInvitationId:bd.partnerInvitationId,partnerSetupId:bd.partnerSetupId,partnerCodePhase:bd.partnerCodePhase}; return boxRoute('target',{edit:true,backTo:{section:'boxes',page:'create',step:'review'}}); }
    if (action === 'box-edit-date') { ctx.draft.boxEditBackup={name:bd.name,target:bd.target,amountText:bd.amountText,deadline:bd.deadline,emoji:bd.emoji,partnerEnabled:bd.partnerEnabled,partnerName:bd.partnerName,partnerPhone:bd.partnerPhone,partnerInvitationId:bd.partnerInvitationId,partnerSetupId:bd.partnerSetupId,partnerCodePhase:bd.partnerCodePhase}; return boxRoute('date',{edit:true,backTo:{section:'boxes',page:'create',step:'review'}}); }
    if (action === 'box-edit-partner') { ctx.draft.boxEditBackup={name:bd.name,target:bd.target,amountText:bd.amountText,deadline:bd.deadline,emoji:bd.emoji,partnerEnabled:bd.partnerEnabled,partnerName:bd.partnerName,partnerPhone:bd.partnerPhone,partnerInvitationId:bd.partnerInvitationId,partnerSetupId:bd.partnerSetupId,partnerCodePhase:bd.partnerCodePhase}; return boxRoute('partner',{edit:true,backTo:{section:'boxes',page:'create',step:'review'}}); }
    if (action === 'box-save') {
      if (!bd?.name || !Number.isSafeInteger(bd.target) || bd.target<0) return setError(ctx, 'Check your goal details first.');
      let accountabilityPartner;
      if (bd.partnerEnabled) { const checked = validatePartnerDetails({name:bd.partnerName,phone:bd.partnerPhone},ctx.state.profile?.phone); if (!checked.ok) return setError(ctx,checked.message); if(!partnerReady(ctx))return setError(ctx,'Confirm your partner’s acceptance and code before creating this Money Box.'); accountabilityPartner = checked.partner; }
      const result = ctx.act('createBox', { ...(accountabilityPartner ? {accountabilityPartner,partnerInvitationId:bd.partnerInvitationId,partnerSetupId:bd.partnerSetupId} : {}), name: bd.name, emoji: bd.emoji, target: bd.target, deadline: bd.deadline, hack: bd.hack||{ type: 'none', value: 0 }, locked: false, idempotencyKey: bd.idempotencyKey || (bd.idempotencyKey = uid()) });
      if (!result.ok) return setError(ctx, result.message);
      const id = result.id || result.box?.id || ctx.state.boxes.at(-1)?.id;
      ctx.draft.box = null;
      return ctx.celebrate({ title: `${bd.name}. Let’s make it happen.`, body: bd.partnerEnabled ? 'Your Money Box is ready, and your partner has accepted. Each withdrawal still needs a fresh code and your PIN.' : 'Your Money Box is ready. Your first little move is up to you.', button: 'Meet my Money Box', onDone: () => finish(ctx, { section: 'boxes', page: 'detail', id }) });
    }
    if (!b) return;
    if (action === 'box-partner-manage') return openBoxProtection(ctx,b);
    if (action === 'box-contribute') return boxMoney(ctx, b);
    if (action === 'box-withdraw') return boxMoney(ctx, b, true);
    if (action === 'box-pull') { const amount = spareChange(ctx); if (!amount) return ctx.toast('Add money to your everyday account first.'); return boxMoney(ctx, b, false, amount); }
    if (action === 'box-edit') return editBox(ctx, b);
    if (action === 'box-lock') return ctx.auth({ title: b.locked ? 'Unlock your Money Box' : 'Keep it for your goal', onSuccess: () => { const result = ctx.act('updateBox', { id: b.id, locked: !b.locked }); if (displayResult(ctx, result, b.locked ? 'Goal protected. You can still add money.' : hasBoxProtection(b) ? 'Goal unlocked. Your partner still approves money out.' : 'Unlocked. Your choice, always.')) ctx.refresh(); } });
    if (action === 'box-menu') {
      planningSheet(ctx, `<h2>${esc(b.emoji)} ${esc(b.name)}</h2><div class="panel">${row({ emoji: '✏️', title: 'Edit goal', action: 'p:menu-edit', right: icon('chevron', 16) })}${row({ emoji: '⚡', title: 'Savings Hack', action: 'p:menu-hack', right: icon('chevron', 16) })}${row({emoji:icon('users'),title:'Accountability partner',sub:hasBoxProtection(b)?'Manage partner protection':protectionSummary(b).status==='invited'?'Invitation pending · Withdrawals stay available':'Add someone you trust',action:'p:menu-partner',right:icon('chevron',16)})}${row({ emoji: '🗂️', title: 'Archive Money Box', sub: 'Your money and complete history stay safe.', action: 'p:menu-delete', right: icon('chevron', 16) })}</div>`, sheet => {
        sheet.querySelector('[data-action="p:menu-edit"]').addEventListener('click', () => { ctx.closeSheet(); editBox(ctx, b); });
        sheet.querySelector('[data-action="p:menu-partner"]').addEventListener('click', () => openBoxProtection(ctx,b));
        sheet.querySelector('[data-action="p:menu-hack"]').addEventListener('click', () => { ctx.closeSheet(); openHackEditor(ctx,b); });
        sheet.querySelector('[data-action="p:menu-delete"]').addEventListener('click', () => { ctx.closeSheet(); const result=ctx.act('archiveBox',{id:b.id}); if(displayResult(ctx,result))finish(ctx,{section:'boxes',page:'home'}); });
      }); return;
    }
    if (action === 'box-hack') return openHackEditor(ctx,b);
    if (action === 'hack-type') { if (ctx.draft.hack.type !== button.dataset.type) ctx.draft.hack = { type: button.dataset.type, value: button.dataset.type === 'percent' ? 5 : 100 }; refresh(); return; }
    if (action === 'hack-round') { ctx.draft.hack.value = Number(button.dataset.value); refresh(); return; }
    if (action === 'hack-disable') { const result = ctx.act('updateBox', { id: b.id, hack: { type: 'none', value: 0 } }); if (displayResult(ctx, result, 'Savings Hack turned off. Your saved money stays put.')) { ctx.draft.hack = null; ctx.setCapture?.(null); ctx.go({ section: 'boxes', page: 'detail', id: b.id },{replace:true}); } return; }
    if (action === 'hack-save') {
      const hd = { ...ctx.draft.hack }, raw = ctx.$('[name="planning-hack"]')?.value;
      if (hd.type === 'percent') { hd.value = Number(raw); if (!Number.isFinite(hd.value) || hd.value < 1 || hd.value > 100) return setError(ctx, 'Choose a percentage from 1 to 100.'); }
      else if (hd.type === 'fixed') { hd.value = parseAmount(raw); if (!validMoney(hd.value)) return setError(ctx, 'Choose a positive amount to save.'); }
      else if (hd.type !== 'roundup') return setError(ctx, 'Choose how you would like to save.');
      const result = ctx.act('updateBox', { id: b.id, hack: hd });
      if (displayResult(ctx, result, 'Your little saving moves are switched on.')) { ctx.draft.hack = null; ctx.setCapture?.(null); ctx.go({ section: 'boxes', page: 'detail', id: b.id },{replace:true}); }
    }
  }));
  const money = ctx.$('#planning-amount');
  if (money) listen(money, 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const button = ctx.$('.bottom-action .button'); if (button) button.click(); } });
  return () => { alive = false; stopParity(); listeners.forEach(remove => remove()); };
}

export function afterPlanning(ctx, route) {
  if (route.section !== 'boxes' || !['detail', 'edit'].includes(route.page)) return;
  const canvas = ctx.$('#saver-pool'), b = foundBox(ctx, route);
  if (!canvas || !b) return;
  const g = canvas.getContext('2d'); if (!g) return;
  const ratio = Math.min(1, b.balance / Math.max(1, b.target));
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  let width = canvas.clientWidth || 390, height = 255, frame = 0, stopped = false, pointer = null, start = null, pullUsed = false;
  canvas.width = width * dpr; canvas.height = height * dpr; g.scale(dpr, dpr);
  const random = n => { const x = Math.sin(n * 137.371 + 29.17) * 43758.5453; return x - Math.floor(x); };
  const count = b.balance ? Math.max(24, Math.round(160 * ratio)) : 0;
  const dots = Array.from({ length: count }, (_, i) => ({ x: random(i + 1) * width, y: random(i + 31), r: 1.3 + random(i + 67) * 1.8, speed: .45 + random(i + 91), phase: random(i + 201) * Math.PI * 2 }));
  function draw(time = 0) {
    if (stopped || !canvas.isConnected) return;
    g.clearRect(0, 0, width, height);
    const fill = Math.max(22, ratio * 105), t = reduced ? 0 : time / 1000;
    for (const dot of dots) {
      let x = dot.x + Math.sin(t * dot.speed + dot.phase) * 4;
      let y = height - 14 - dot.y * fill + Math.sin(t * .8 + dot.phase) * 2;
      if (pointer) { const dx = x - pointer.x, dy = y - pointer.y, distance = Math.hypot(dx, dy); if (distance < 70 && distance > .1) { const force = (70 - distance) / 5; x += dx / distance * force; y += dy / distance * force; } }
      g.beginPath(); g.arc(x, y, dot.r, 0, Math.PI * 2); g.fillStyle = '#d4f65a'; g.globalAlpha = .45 + dot.r / 6; g.fill();
    }
    g.globalAlpha = 1;
    if (b.balance) { g.font = '27px -apple-system, BlinkMacSystemFont, sans-serif'; g.textAlign = 'center'; g.fillText(b.emoji || '✨', width * .52 + Math.sin(t * .6) * 4, height - fill - 5 + Math.sin(t) * 2); }
    else { g.strokeStyle = '#363841'; g.lineWidth = 1; g.beginPath(); g.moveTo(28, height - 20); g.lineTo(width - 28, height - 20); g.stroke(); }
    if (!reduced) frame = requestAnimationFrame(draw);
  }
  const locate = e => { const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };
  const down = e => { start = locate(e); pointer = start; pullUsed = false; canvas.setPointerCapture?.(e.pointerId); if (reduced) draw(); };
  const move = e => { pointer = locate(e); if (reduced) draw(); if (start && !pullUsed && pointer.y - start.y > 70 && Math.abs(pointer.x - start.x) < 90) { pullUsed = true; start = null; const amount = spareChange(ctx); if (!amount) ctx.toast('Add money to your everyday account first.'); else boxMoney(ctx, b, false, amount); } };
  const up = () => { pointer = null; start = null; if (reduced) draw(); };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('pointerleave', up);
  draw();
  poolCleanup = () => { stopped = true; cancelAnimationFrame(frame); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('pointerleave', up); };
  return poolCleanup;
}
