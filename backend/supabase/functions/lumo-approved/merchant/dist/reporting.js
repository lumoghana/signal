import {businessDay,financialTradingDay,closingTradingDay as domainClosingTradingDay,isShopCloseDue} from './domain.js';
const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sum = (rows, field = 'amount') => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
const array = value => Array.isArray(value) ? value : [];
const fallbackMoney = value => `GH₵${(Number(value || 0) / 100).toLocaleString('en-GH', {minimumFractionDigits:2,maximumFractionDigits:2})}`;
const shopName = (state, id) => array(state.shops).find(shop => shop.id === id)?.name || 'Unallocated';
const historicalOwner = 'Business owner (historical name unavailable)';
const staffName = (state, id) => array(state.staff).find(person => person.id === id)?.name || (String(id).startsWith('owner-') ? historicalOwner : id ? 'Former team member' : 'Shop-level receipt · no cashier assigned');
const recordedName = value => typeof value === 'string' && value.trim() ? value.trim() : '';
function shiftPerformer(state,shift) {
 const saved=recordedName(shift.staffName)||recordedName(shift.performedBy);if(saved)return saved;
 const payment=array(state.transactions).find(payment=>payment.staffId===shift.staffId&&eventShiftId(state,payment)===shift.id&&(recordedName(payment.staffName)||recordedName(payment.performedBy)));
 if(payment)return recordedName(payment.staffName)||recordedName(payment.performedBy);
 const refund=array(state.refunds).find(refund=>refund.staffId===shift.staffId&&eventShiftId(state,refund,'refund')===shift.id&&recordedName(refund.performedBy));
 if(refund)return recordedName(refund.performedBy);
 // Legacy `by` sometimes contains a person's name, and often contains an account ID.
 // Only a clear human-readable name is evidence; the current business owner is not.
 const by=recordedName(shift.by);
 if(by&&/\s/.test(by)&&!/^(?:owner|access|user|staff|session|shift)-/i.test(by)&&!/^(?:business owner|assigned team member|shop manager|cashier|owner|manager)$/i.test(by))return by;
 return staffName(state,shift.staffId);
}
function savedShiftName(state,event,kind='payment') {
 const shift=array(state.shifts).find(shift=>shift.id===eventShiftId(state,event,kind)&&shift.staffId===event.staffId);
 return shift&&(recordedName(shift.staffName)||recordedName(shift.performedBy));
}
const paymentPerformer = (state,payment) => payment.staffName || payment.performedBy || savedShiftName(state,payment) || staffName(state,payment.staffId);
const refundPerformer = (state, refund) => refund.performedBy || savedShiftName(state,refund,'refund') || (refund.staffId ? staffName(state,refund.staffId) : 'Unattributed return');
function cashflowActor(state,id,refunds,payments=[]) {
 if(!id)return 'Shop-level activity · no cashier assigned';
 const payment=payments.find(payment=>payment.staffId===id&&(payment.staffName||payment.performedBy||savedShiftName(state,payment)));
 if(payment)return paymentPerformer(state,payment);
 const refund=refunds.find(refund=>refund.staffId===id&&(refund.performedBy||savedShiftName(state,refund,'refund')));
 return refund?refundPerformer(state,refund):staffName(state,id);
}
const eventDay = value => { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : ''; };
const validDate = value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && eventDay(value) === value;
const currentDay = () => eventDay(Date.now());
const cutoffFor = (state, shopId) => array(state.shops).find(shop => shop.id === shopId)?.cutoff || state.business?.cutoff || '00:00';
export function paymentTradingDay(state, payment) { try { return financialTradingDay(state,payment,'payment'); } catch { return ''; } }
export function refundTradingDay(state, refund) { try { return financialTradingDay(state,refund,'refund'); } catch { return ''; } }
export function closingTradingDay(state,close) {
 try { return domainClosingTradingDay(state,close); } catch { return ''; }
}
function eventShiftId(state,entity,kind='payment') {
 if(Object.hasOwn(entity,'shiftId'))return entity.shiftId||null;
 return array(state.shifts).find(shift => array(kind==='refund' ? shift.refundIds : shift.transactionIds).includes(entity.id))?.id || null;
}
function matchesDay(state, entity, day, filters = {}) {
 if(!day)return false;
 if(filters.period === 'today' || filters.period === 'week') {
  const today=businessDay(filters.now ?? Date.now(),cutoffFor(state,entity.shopId));
  return filters.period === 'today' ? day === today : day >= eventDay(Date.parse(today+'T00:00:00Z')-6*86400000) && day <= today;
 }
 return (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
}
function matchesPeriod(state, entity, value, filters = {}, kind = 'event') {
 try { return matchesDay(state,entity,kind==='payment' ? paymentTradingDay(state,entity) : kind==='refund' ? refundTradingDay(state,entity) : entity.tradingDay || businessDay(value,entity.tradingCutoff || cutoffFor(state,entity.shopId)),filters); } catch { return false; }
}
const displayDate = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('en-GH', {timeZone:'Africa/Accra',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
const statusLabel = status => ({paid:'Confirmed',processing:'Processing',failed:'Failed',requested:'Awaiting approval',rejected:'Declined'})[status] || status || 'Unknown';
const statusBadge = status => `<span class="badge ${status === 'paid' ? 'success' : ['processing','requested'].includes(status) ? 'warning' : ['failed','rejected'].includes(status) ? 'danger' : 'neutral'}">${E(statusLabel(status))}</span>`;
const button = (text, action, extra = '', style = 'secondary small') => `<button class="btn ${style}" type="button" data-action="reporting-${action}" ${extra}>${text}</button>`;

export function paymentDate(payment) { return payment?.status === 'paid' ? payment.confirmedAt || payment.createdAt : payment?.createdAt; }
export function refundDate(refund) { return refund?.paidAt || refund?.approvedAt || refund?.createdAt; }
export function validateDateRange(from = '', to = '') {
 if (!validDate(from) || !validDate(to)) return 'Enter valid trading dates in YYYY-MM-DD format.';
 if (from && to && from > to) return 'The start date must be on or before the end date.';
 return '';
}
function inDates(value, {from = '', to = ''} = {}) {
 const date = eventDay(value);
 return Boolean(date) && (!from || date >= from) && (!to || date <= to);
}
export function filterPayments(state, filters = {}) {
 const {shopId = null, from = '', to = '', status = 'all', search = '', staffId = '', shiftId = ''} = filters;
 if (validateDateRange(from, to)) return [];
 const query = String(search).trim().toLocaleLowerCase();
 return array(state.transactions).filter(payment => (!shopId || shopId === 'all' || payment.shopId === shopId)
  && (!status || status === 'all' || payment.status === status)
  && (!staffId || staffId === 'all' || (staffId === 'unattributed' ? !payment.staffId : payment.staffId === staffId))
  && (!shiftId || shiftId === 'all' || (shiftId === 'unassigned' ? !eventShiftId(state,payment) : eventShiftId(state,payment) === shiftId))
  && matchesPeriod(state,payment,paymentDate(payment),filters,'payment')
  && (!query || [payment.payer, payment.reference, shopName(state, payment.shopId), paymentPerformer(state,payment), payment.amount, (Number(payment.amount) / 100).toFixed(2), fallbackMoney(payment.amount)].some(value => String(value ?? '').toLocaleLowerCase().includes(query))))
  .sort((a,b) => Date.parse(paymentDate(b)) - Date.parse(paymentDate(a)) || String(a.id).localeCompare(String(b.id)));
}
export function refundActivityDate(refund){return refund.status==='paid'?refundDate(refund):refund.decidedAt||refund.rejectedAt||refund.createdAt;}
export function filterRefundActivity(state,filters={}){
 if(validateDateRange(filters.from,filters.to))return [];
 const query=String(filters.search||'').trim().toLocaleLowerCase();
 return array(state.refunds).filter(refund=>{
  const payment=array(state.transactions).find(item=>item.id===refund.transactionId),actor=refund.staffId||refund.requestedStaffId,shift=refund.shiftId||refund.requestedShiftId;
  return (!filters.shopId||filters.shopId==='all'||refund.shopId===filters.shopId)
   &&(!filters.refundStatus||filters.refundStatus==='all'||refund.status===filters.refundStatus)
   &&(!filters.staffId||filters.staffId==='all'||(filters.staffId==='unattributed'?!actor:actor===filters.staffId))
   &&(!filters.shiftId||filters.shiftId==='all'||(filters.shiftId==='unassigned'?!shift:shift===filters.shiftId))
   &&matchesPeriod(state,refund,refundActivityDate(refund),filters,refund.status==='paid'?'refund':'event')
   &&(!query||[payment?.reference,payment?.payer,refund.payer,refund.reason,refund.requestedBy,refund.decidedBy,shopName(state,refund.shopId),(refund.amount/100).toFixed(2)].some(value=>String(value||'').toLocaleLowerCase().includes(query)));
 }).sort((a,b)=>Date.parse(refundActivityDate(b))-Date.parse(refundActivityDate(a))||String(a.id).localeCompare(String(b.id)));
}
export function paginate(rows, page = 1, pageSize = 25) {
 const size = Math.max(1, Math.min(100, Math.floor(Number(pageSize) || 25)));
 const total = rows.length, pageCount = Math.max(1, Math.ceil(total / size));
 const selected = Math.max(1, Math.min(pageCount, Math.floor(Number(page) || 1)));
 return {items: rows.slice((selected - 1) * size, selected * size), page:selected, pageSize:size, pageCount, total, from:total ? (selected - 1) * size + 1 : 0, to:Math.min(selected * size, total)};
}
export function csvRows(payments, state = {}) {
 return [['Reference','Payer','Shop','Cashier attribution','Shift','Amount GHS','Status','Recorded at UTC','Confirmed at UTC','Reporting timestamp UTC','Trading day Ghana','Method','Collection adjustment','Original shop trading day','Allocated at UTC'], ...payments.map(payment => [payment.reference, payment.payer, shopName(state,payment.shopId), paymentPerformer(state,payment), eventShiftId(state,payment) || 'Unassigned', (Number(payment.amount) / 100).toFixed(2), statusLabel(payment.status), payment.createdAt || '', payment.confirmedAt || '', paymentDate(payment) || '', paymentTradingDay(state,payment), payment.method || '',payment.priorPeriodAllocation?'Late shop allocation':'',payment.allocationReceiptTradingDay||'',payment.assignedAt||''])];
}
function filteredRefunds(state, filters) {
 if (validateDateRange(filters.from, filters.to)) return [];
 return array(state.refunds).filter(refund => {
  return refund.status === 'paid' && (!filters.shopId || filters.shopId === 'all' || refund.shopId === filters.shopId)
   && matchesPeriod(state,refund,refundDate(refund),filters,'refund')
   && (!filters.staffId || filters.staffId === 'all' || (filters.staffId === 'unattributed' ? !refund.staffId : refund.staffId === filters.staffId))
   && (!filters.shiftId || filters.shiftId === 'all' || (filters.shiftId === 'unassigned' ? !eventShiftId(state,refund,'refund') : eventShiftId(state,refund,'refund') === filters.shiftId));
 });
}
export function reportExceptions(state, scope = null, now = Date.now()) {
 const shops = array(state.shops).filter(shop => !scope || scope === 'all' || shop.id === scope);
 const ids = new Set(shops.map(shop => shop.id));
 const today = eventDay(now), activeBusinessDate = businessDay(now, state.business?.cutoff || '00:00');
 const closeState={...state,business:state.business||{},shops:array(state.shops),transactions:array(state.transactions),refunds:array(state.refunds),closings:array(state.closings)};
 const lateClose = shops.filter(shop => isShopCloseDue(closeState,shop,now));
 const unallocated = !scope || scope === 'all' ? array(state.transactions).filter(payment => payment.status === 'paid' && !payment.shopId) : [];
 const pending = array(state.transactions).filter(payment => payment.status === 'processing' && ids.has(payment.shopId));
 const agedPending = pending.filter(payment => now - Date.parse(payment.createdAt) > 15 * 60000);
 const refunds = array(state.refunds).filter(refund => refund.status === 'requested' && ids.has(refund.shopId));
 const openShifts = array(state.shifts).filter(shift => !shift.endedAt && shift.status !== 'closed' && ids.has(shift.shopId));
 const staleShifts = openShifts.filter(shift => now - Date.parse(shift.startedAt) > 12 * 3600000);
 const items = [
  ...lateClose.map(shop => ({kind:'close',shopId:shop.id,title:`${shop.name} needs a closing review`,text:'A previous trading day has no matching recent closing report. Save a zero-sales close when no payments were received.'})),
  ...(unallocated.length ? [{kind:'unallocated',title:`${unallocated.length} unallocated receipt${unallocated.length === 1 ? '' : 's'}`,text:'Assign a shop before attributing collections or announcing success at a counter.'}] : []),
  ...(agedPending.length ? [{kind:'processing',title:`${agedPending.length} payment${agedPending.length === 1 ? '' : 's'} processing over 15 minutes`,text:'Check the original payment status. A processing receipt is not confirmed money.'}] : []),
  ...(refunds.length ? [{kind:'refund',title:`${refunds.length} refund approval${refunds.length === 1 ? '' : 's'} waiting`,text:'Review the original payment and approve or decline the request.'}] : []),
  ...staleShifts.map(shift => ({kind:'shift',shopId:shift.shopId,title:`${shiftPerformer(state,shift)} has a long-running shift`,text:`${shopName(state,shift.shopId)} · started ${displayDate(shift.startedAt)}. Review the handover.`}))
 ];
 return {items,lateClose,unallocated,pending,agedPending,refunds,openShifts,staleShifts,today,activeBusinessDate};
}
function empty(text) { return `<div class="reporting-empty"><p>${text}</p></div>`; }
function heading(title, description, actions = '') { return `<div class="page-heading"><div><div class="eyebrow">BUSINESS REPORTING</div><h1 class="page-title">${title}</h1><p class="subtitle">${description}</p></div><div class="page-actions">${actions}</div></div>`; }
function staffOptions(state, scope) {
 const people=array(state.staff).filter(person => !scope || scope === 'all' || (person.shopIds || [person.shopId]).includes(scope)).map(person=>({...person}));
 const inScope=event=>!scope||scope==='all'||event.shopId===scope;
 const add=(event,name)=>{
  if(!event.staffId||!inScope(event))return;
  const existing=people.find(person=>person.id===event.staffId);
  if(!existing)people.push({id:event.staffId,name,active:true});
  else if([historicalOwner,'Former team member'].includes(existing.name)&&![historicalOwner,'Former team member'].includes(name))existing.name=name;
 };
 for(const payment of array(state.transactions))add(payment,paymentPerformer(state,payment));
 for(const refund of array(state.refunds))add(refund,refundPerformer(state,refund));
 for(const shift of array(state.shifts))add(shift,shiftPerformer(state,shift));
 return people;
}
function filterBar(state, filters, kind, {scope = null, owner = true, filtersOpen = true} = {}) {
 const field = (label, name, content) => `<label class="field"><span class="label">${label}</span>${content}</label>`;
 const select = (name, label, options) => field(label,name,`<select class="select" data-reporting="${kind}" name="${name}" id="reporting-${kind}-${name}" aria-label="${label}">${options.map(([value,text]) => `<option value="${E(value)}" ${String(filters[name] || 'all') === String(value) ? 'selected' : ''}>${E(text)}</option>`).join('')}</select>`);
 const shops = array(state.shops).filter(shop => !scope || scope === 'all' || shop.id === scope);
 const shifts = array(state.shifts).filter(shift => (!scope || scope === 'all' || shift.shopId === scope) && (!filters.staffId || filters.staffId === 'all' || shift.staffId === filters.staffId));
 const controls=`${owner ? select('shopId','Shop',[['all',scope ? 'Selected shop' : 'All shops'],...shops.map(shop => [shop.id,shop.name])]) : ''}${field('From trading day','from',`<input class="input" type="date" name="from" id="reporting-${kind}-from" value="${E(filters.from || '')}" data-reporting="${kind}" aria-label="From trading day">`)}${field('To trading day','to',`<input class="input" type="date" name="to" id="reporting-${kind}-to" value="${E(filters.to || '')}" data-reporting="${kind}" aria-label="To trading day">`)}${select('staffId','Cashier / operator',[['all','All cashiers'],['unattributed','Shop-level / no cashier'],...staffOptions(state,scope).map(person => [person.id,person.name+(person.active === false ? ' · inactive' : '')])])}${select('shiftId','Shift',[['all','All shifts'],['unassigned','Unassigned receipts'],...shifts.map(shift => [shift.id,`${shiftPerformer(state,shift)} · ${displayDate(shift.startedAt)}`])])}${kind === 'activity' ? select('status','Status',[['all','All statuses'],['paid','Confirmed'],['processing','Processing'],['failed','Failed']]) : ''}`;
 const presets=`<div class="reporting-presets">${button('Today',`${kind}-today`,`aria-pressed="${filters.period === 'today'}"`,filters.period === 'today' ? 'dark small' : 'secondary small')}${button('Last 7 trading days',`${kind}-week`,`aria-pressed="${filters.period === 'week'}"`,filters.period === 'week' ? 'dark small' : 'secondary small')}${button('All time',`${kind}-all`,`aria-pressed="${filters.period === 'all'}"`,filters.period === 'all' ? 'dark small' : 'secondary small')}</div>`;
 if(kind!=='activity')return `<div class="reporting-filters">${controls}${presets}</div>`;
 const active=[owner&&filters.shopId&&filters.shopId!=='all',Boolean(filters.from||filters.to),filters.staffId&&filters.staffId!=='all',filters.shiftId&&filters.shiftId!=='all',filters.status&&filters.status!=='all'].filter(Boolean).length;
 return `<div class="reporting-activity-filters">${presets}<details class="reporting-more-filters" ${filtersOpen?'open':''}><summary data-action="reporting-toggle-filters"><span>More filters</span><span class="reporting-filter-count">${active} active</span></summary><div class="reporting-filters">${controls}</div><p class="hint">${filters.period === 'today' ? 'Today follows the current trading day at each shop’s cutoff. ' : filters.period === 'week' ? 'Last seven trading days follow each shop’s cutoff. ' : ''}Date fields select recorded shop trading days. Late shop allocations use the open allocation period and keep their original confirmation time. Exports include every matching row across all pages.</p></details></div>`;
}
function reportRows(state, payments, refunds, money) {
 const shops = array(state.shops);
 return shops.map(shop => {
  const receipts = payments.filter(payment => payment.shopId === shop.id), returned = refunds.filter(refund => refund.shopId === shop.id);
  return receipts.length || returned.length ? `<tr><th scope="row">${E(shop.name)}</th><td>${receipts.length}</td><td>${money(sum(receipts))}</td><td>${money(sum(returned))}</td><td class="amount">${money(sum(receipts)-sum(returned))}</td></tr>` : '';
 }).join('') + (payments.some(payment => !payment.shopId) ? `<tr><th scope="row">Unallocated</th><td>${payments.filter(payment => !payment.shopId).length}</td><td>${money(sum(payments.filter(payment => !payment.shopId)))}</td><td>—</td><td class="amount">Awaiting shop allocation</td></tr>` : '');
}
export function renderReport({state, scope = null, formatMoney = fallbackMoney, filters = {}, owner = true, includeFilters = true} = {}) {
 state ||= {};
 const actual = {...filters, shopId:scope && scope !== 'all' ? scope : filters.shopId === 'all' ? null : filters.shopId};
 const error = validateDateRange(actual.from,actual.to), payments = filterPayments(state,{...actual,status:'paid'}), refunds = filteredRefunds(state,actual), gross = sum(payments), returned = sum(refunds), exceptions = reportExceptions(state,actual.shopId), lateAllocations=payments.filter(payment=>payment.priorPeriodAllocation);
 const people = [...new Set([...payments.map(payment => payment.staffId || ''),...refunds.map(refund => refund.staffId || '')])];
 const staffRows = people.map(id => { const receipts = payments.filter(payment => (payment.staffId || '') === id), returns = refunds.filter(refund => (refund.staffId || '') === id);return `<tr><th scope="row">${E(cashflowActor(state,id,returns,receipts))}</th><td>${receipts.length}</td><td>${formatMoney(sum(receipts))}</td><td>${formatMoney(sum(returns))}</td><td class="amount">${formatMoney(sum(receipts)-sum(returns))}</td></tr>`; }).join('');
 const shifts = array(state.shifts).filter(shift => (!actual.shopId || shift.shopId === actual.shopId) && (!actual.staffId || actual.staffId === 'all' || shift.staffId === actual.staffId) && (!actual.shiftId || actual.shiftId === 'all' || shift.id === actual.shiftId) && (matchesPeriod(state,shift,shift.startedAt,actual) || payments.some(payment => eventShiftId(state,payment) === shift.id) || refunds.some(refund => eventShiftId(state,refund,'refund') === shift.id)));
 const closeReports = error ? [] : array(state.closings).filter(close => (!actual.shopId || close.shopId === actual.shopId) && matchesDay(state,close,closingTradingDay(state,close),actual)).sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt));
 const tableHead = '<thead><tr><th>Attribution</th><th>Payments</th><th>Collections</th><th>Refunds</th><th class="amount">Net</th></tr></thead>';
 return `<div class="reporting-workspace">${heading('A clear view of every trading day.','Choose trading days, shops or cashiers. Every shop follows its Ghana cutoff.',button('Export this report','export-report','','primary'))}${includeFilters ? `<section class="panel reporting-filter-panel">${filterBar(state,filters,'report',{scope,owner})}${error ? `<p class="reporting-error" role="alert">${E(error)}</p>` : ''}<p class="hint">${filters.period === 'today' ? 'Today follows the current trading day at each shop’s cutoff. ' : filters.period === 'week' ? 'The last seven trading days follow each shop’s cutoff. ' : ''}Confirmed payments follow their recorded shop trading day. Late shop allocations are booked in the open allocation period, with their original confirmation time preserved. Refunds use the time money was returned. Refund cash flow belongs to the person and shift that performed the return. Original sale attribution is preserved in the export.</p></section>` : ''}<div class="stat-grid three reporting-summary">${[['Confirmed collections',gross,`${payments.length} payments`],['Completed refunds',returned,'By date returned'],['Net collections',gross-returned,'Collections less refunds in this period']].map(([label,value,note]) => `<section class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${formatMoney(value)}</div><div class="stat-note">${note}</div></section>`).join('')}</div>${lateAllocations.length?`<p class="notice">Includes ${formatMoney(sum(lateAllocations))} in late shop allocations booked into this period. Original receipt dates and shop trading days remain in the export.</p>`:''}<section class="panel section-gap"><div class="panel-heading"><h2 class="panel-title">Shop breakdown</h2></div>${payments.length || refunds.length ? `<div class="table-wrap"><table class="data-table">${tableHead}<tbody>${reportRows(state,payments,refunds,formatMoney)}</tbody></table></div>` : empty('No confirmed collections or refunds in this period.')}</section><section class="panel section-gap"><div class="panel-heading"><h2 class="panel-title">Cashier / operator cash flow</h2></div>${staffRows ? `<div class="table-wrap"><table class="data-table">${tableHead}<tbody>${staffRows}</tbody></table></div>` : empty('No attributable receipts in this period.')}<p class="notice">Staff-generated payment requests follow their recorded operator and shift. Static shop QR receipts stay at shop level with no cashier assigned, even while a shift is open. Refunds follow the person returning funds, including owner approvals.</p></section><section class="panel section-gap"><div class="panel-heading"><h2 class="panel-title">Shifts & handovers</h2><span class="badge neutral">${shifts.length} shifts</span></div>${shifts.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Person / shop</th><th>Started</th><th>Handover</th><th>Receipts in selected period</th><th>Collections</th><th>Refunds</th><th class="amount">Net cash flow</th></tr></thead><tbody>${shifts.map(shift => {const shiftPayments=payments.filter(payment => eventShiftId(state,payment) === shift.id),shiftRefunds=refunds.filter(refund=>eventShiftId(state,refund,'refund')===shift.id);return `<tr><th scope="row">${E(shiftPerformer(state,shift))}<small>${E(shopName(state,shift.shopId))}</small></th><td>${displayDate(shift.startedAt)}</td><td>${shift.endedAt ? displayDate(shift.endedAt) : '<span class="badge warning">Open shift</span>'}</td><td>${shiftPayments.length}</td><td class="amount">${formatMoney(sum(shiftPayments))}</td><td>${formatMoney(sum(shiftRefunds))}</td><td class="amount">${formatMoney(sum(shiftPayments)-sum(shiftRefunds))}</td></tr>`;}).join('')}</tbody></table></div>` : empty('No shifts started in this period.')}</section><section class="panel section-gap reporting-exceptions"><div class="panel-heading"><h2 class="panel-title">Needs attention now</h2><span class="badge ${exceptions.items.length ? 'warning' : 'success'}">${exceptions.items.length} items</span></div>${exceptions.items.length ? `<div class="reporting-exception-list">${exceptions.items.map(item => `<div><span class="reporting-exception-dot"></span><span><strong>${E(item.title)}</strong><small>${E(item.text)}</small></span></div>`).join('')}</div>` : empty('No overdue closings, aged payments or waiting refund approvals in this scope.')}<p class="notice">These are current operating exceptions, independent of the report date filter. Bank reconciliation and receiving-device health appear in Operations.</p></section><section class="panel section-gap"><div class="panel-heading"><h2 class="panel-title">Archived closings</h2><span class="badge neutral">${closeReports.length} reports</span></div>${closeReports.length ? `<div class="activity-list">${closeReports.map(close => `<button class="activity-item" data-action="reporting-closing" data-id="${E(close.id)}"><span><strong>${E(shopName(state,close.shopId))}</strong><small>${displayDate(close.createdAt)} · ${close.count ?? close.transactionIds?.length ?? 0} payments${closingTradingDay(state,close) ? ' · Trading day '+E(closingTradingDay(state,close)) : ''}</small></span><strong>${formatMoney(close.net)}</strong></button>`).join('')}</div>` : empty('No closing reports saved in this period.')}</section></div>`;
}
function paymentTable(state, payments, money) {
 if (!payments.length) return empty('No payments match these filters. Try a wider date range or another status.');
 const mobile=`<div class="reporting-mobile-payments">${payments.map(payment=>`<button class="reporting-mobile-receipt" type="button" data-action="reporting-payment" data-id="${E(payment.id)}" aria-label="View payment ${E(payment.reference)}"><span><strong>${E(payment.payer)}</strong><small>${E(shopName(state,payment.shopId))} · ${E(payment.reference)}</small><span>${statusBadge(payment.status)}<small>${displayDate(paymentDate(payment))}</small></span></span><strong class="reporting-mobile-amount">${money(payment.amount)}</strong></button>`).join('')}</div>`;
 return `${mobile}<div class="table-wrap reporting-desktop-payments"><table class="data-table reporting-payments"><thead><tr><th>Payment</th><th>Shop / cashier</th><th>Status</th><th>Confirmation / trading day</th><th class="amount">Amount</th></tr></thead><tbody>${payments.map(payment => `<tr role="button" tabindex="0" data-action="reporting-payment" data-id="${E(payment.id)}" aria-label="View payment ${E(payment.reference)}"><td><strong>${E(payment.payer)}</strong><small>${E(payment.reference)}</small></td><td>${E(shopName(state,payment.shopId))}<small>${E(paymentPerformer(state,payment))}</small></td><td>${statusBadge(payment.status)}</td><td>${displayDate(paymentDate(payment))}<small>Trading day ${E(paymentTradingDay(state,payment))}</small>${payment.priorPeriodAllocation?`<small>Late shop allocation · original shop day ${E(payment.allocationReceiptTradingDay||'not recorded')}</small>`:''}${payment.confirmedAt && eventDay(payment.confirmedAt) !== eventDay(payment.createdAt) ? '<small>Confirmed after an earlier request</small>' : ''}</td><td class="amount">${money(payment.amount)}</td></tr>`).join('')}</tbody></table></div>`;
}
export function createReporting(config = {}) {
 const defaults = () => ({from:'',to:'',period:'today',shopId:'all',staffId:'all',shiftId:'all',status:'all',refundStatus:'all',search:'',page:1,refundPage:1,pageSize:25});
 let activity=defaults(),report=defaults(),context='',activityFiltersOpen=false;
 const phoneViewport=typeof window!=='undefined'&&typeof window.matchMedia==='function'?window.matchMedia('(max-width: 600px)'):null;
 const state = () => config.getState?.() || {};
 const scope = () => config.getScope?.() || null;
 const money = config.formatMoney || fallbackMoney;
 const owner = () => typeof config.isOwner === 'function' ? config.isOwner() : config.isOwner !== false;
 function contextKey(){const snapshot=state();return config.getContextKey?.()||[snapshot.business?.id||snapshot.business?.accountNumber||'sample',owner()?'owner':'staff'].join(':')}
 function normalize(filters){
  const snapshot=state(),selectedScope=scope(),shops=array(snapshot.shops).filter(shop=>!selectedScope||selectedScope==='all'||shop.id===selectedScope);
  if(filters.shopId!=='all'&&!shops.some(shop=>shop.id===filters.shopId))filters.shopId='all';
  const people=staffOptions(snapshot,selectedScope);
  if(!['all','unattributed'].includes(filters.staffId)&&!people.some(person=>person.id===filters.staffId)){filters.staffId='all';filters.shiftId='all'}
  const shifts=array(snapshot.shifts).filter(shift=>(!selectedScope||selectedScope==='all'||shift.shopId===selectedScope)&&(filters.staffId==='all'||shift.staffId===filters.staffId));
  if(!['all','unassigned'].includes(filters.shiftId)&&!shifts.some(shift=>shift.id===filters.shiftId))filters.shiftId='all';
 }
 function ensureContext(){const next=contextKey();if(context&&context!==next){activity=defaults();report=defaults();activityFiltersOpen=false}context=next;normalize(activity);normalize(report)}
 const resolved = filters => ({...filters,shopId:scope() || (filters.shopId === 'all' ? null : filters.shopId)});
 const redraw = () => config.onRender?.();
 phoneViewport?.addEventListener?.('change',redraw);
 function renderActivity() {
  ensureContext();
  const snapshot=state(),filters=resolved(activity),rows=filterPayments(snapshot,filters),page=paginate(rows,activity.page,activity.pageSize),refunds=filterRefundActivity(snapshot,filters),returns=paginate(refunds,activity.refundPage,activity.pageSize),error=validateDateRange(activity.from,activity.to);
  activity.page=page.page;activity.refundPage=returns.page;
  return `<div class="reporting-workspace reporting-activity">${heading('Every payment, clearly.','Find a receipt, follow processing payments and export the exact selection.',button('Export filtered payments','export-activity','','primary'))}<section class="panel reporting-filter-panel"><label class="field reporting-search"><span class="label">Find a payment</span><input class="input" type="search" name="search" id="reporting-activity-search" data-reporting="activity" value="${E(activity.search)}" placeholder="Name, amount, reference or shop" aria-label="Search payments"></label>${filterBar(snapshot,activity,'activity',{scope:scope(),owner:owner(),filtersOpen:!phoneViewport?.matches||activityFiltersOpen})}${error ? `<p class="reporting-error" role="alert">${E(error)}</p>` : ''}</section><section class="panel section-gap">${paymentTable(snapshot,page.items,money)}<div class="reporting-pagination"><span>${page.from}–${page.to} of ${page.total} matching payments</span><div><label class="reporting-page-size">Per page <select class="select" name="pageSize" id="reporting-activity-pageSize" data-reporting="activity" aria-label="Payments per page">${[25,50,100].map(size => `<option value="${size}" ${activity.pageSize === size ? 'selected' : ''}>${size}</option>`).join('')}</select></label>${button('Previous','previous',page.page <= 1 ? 'disabled' : '')}<span>Page ${page.page} of ${page.pageCount}</span>${button('Next','next',page.page >= page.pageCount ? 'disabled' : '')}</div></div></section><section class="panel section-gap reporting-refunds"><div class="panel-heading"><h2 class="panel-title">Refunds & decisions</h2>${button('Export refunds','export-refunds')}</div><label class="field refund-status-filter"><span class="label">Refund status</span><select class="select" name="refundStatus" data-reporting="activity" aria-label="Refund status">${[['all','All refunds'],['requested','Awaiting approval'],['paid','Completed'],['rejected','Declined']].map(([value,label])=>`<option value="${value}" ${activity.refundStatus===value?'selected':''}>${label}</option>`).join('')}</select></label>${returns.items.length?returns.items.map(refund=>{const payment=array(snapshot.transactions).find(item=>item.id===refund.transactionId);return `<button type="button" class="reporting-refund-row" data-action="reporting-refund" data-id="${E(refund.transactionId)}"><span><strong>${E(payment?.payer||refund.payer||'Original payer')}</strong><small>${E(refund.reason||'Customer refund')} · ${E(shopName(snapshot,refund.shopId))}</small><small>${E(payment?.reference||refund.transactionId)}</small><span>${statusBadge(refund.status)}<small>${displayDate(refundActivityDate(refund))}</small></span>${refund.status==='rejected'&&!refund.decidedAt?'<small>Request recorded above · decision time unavailable</small>':''}${refund.decidedBy?`<small>Decision by ${E(refund.decidedBy)}</small>`:''}</span><strong class="reporting-mobile-amount">${money(refund.amount)}</strong></button>`}).join(''):empty('No refunds match these filters.')}<div class="reporting-pagination"><span>${returns.from}–${returns.to} of ${returns.total} refunds</span><div>${button('Previous refunds','refund-previous',returns.page<=1?'disabled':'')}<span>Page ${returns.page} of ${returns.pageCount}</span>${button('Next refunds','refund-next',returns.page>=returns.pageCount?'disabled':'')}</div></div></section></div>`;
 }
 function renderCurrentReport() { ensureContext();return renderReport({state:state(),scope:scope(),formatMoney:money,filters:report,owner:owner()}); }
 function handleChange(element) {
  ensureContext();
  const kind=element?.dataset?.reporting;if(!['activity','report'].includes(kind))return false;
  const target=kind === 'activity' ? activity : report;
  if(!['from','to','shopId','staffId','shiftId','status','refundStatus','search','pageSize'].includes(element.name))return false;
  target[element.name]=element.name === 'pageSize' ? Number(element.value) : String(element.value);
  target.page=1;target.refundPage=1;if(['from','to'].includes(element.name))target.period='custom';if(element.name === 'staffId')target.shiftId='all';
  redraw();return true;
 }
 function setPeriod(target, period) {
  target.period=period;target.from='';target.to='';target.page=1;target.refundPage=1;redraw();
 }
 function handleClick(action, element = {}) {
  ensureContext();
  const name=String(action).replace(/^reporting-/,'');
  if(name==='toggle-filters'){activityFiltersOpen=!element.closest?.('details')?.open;return true;}
  if(name === 'refund-previous'||name==='refund-next'){activity.refundPage+=name==='refund-next'?1:-1;redraw();return true;}
  if(name === 'refund'){config.onOpenTransaction?.(element.dataset?.id);return true;}
  if(name === 'export-refunds'){if(!validateDateRange(activity.from,activity.to)){const snapshot=state();config.onExport?.([['Payment reference','Refund reference','Shop','Payer','Amount GHS','Status','Reason','Requested at UTC','Decision at UTC','Returned at UTC','Decision by'],...filterRefundActivity(snapshot,resolved(activity)).map(refund=>[array(snapshot.transactions).find(payment=>payment.id===refund.transactionId)?.reference||refund.transactionId,refund.id,shopName(snapshot,refund.shopId),refund.payer||'',(refund.amount/100).toFixed(2),statusLabel(refund.status),refund.reason||'',refund.createdAt||'',refund.decidedAt||'',refund.status==='paid'?refundDate(refund)||'':'',refund.decidedBy||''])],'lumo-filtered-refunds.csv')}return true;}
  if(name === 'payment'){config.onOpenTransaction?.(element.dataset?.id);return true;}
  if(name === 'closing'){config.onOpenClosing?.(element.dataset?.id);return true;}
  if(name === 'previous' || name === 'next'){activity.page+=name === 'next' ? 1 : -1;redraw();return true;}
  const preset=/^(activity|report)-(today|week|all)$/.exec(name);if(preset){setPeriod(preset[1] === 'activity' ? activity : report,preset[2]);return true;}
  if(name === 'export-activity'){if(!validateDateRange(activity.from,activity.to))config.onExport?.(csvRows(filterPayments(state(),resolved(activity)),state()),'lumo-filtered-payments.csv');return true;}
  if(name === 'export-report'){
   const snapshot=state(),filters=resolved(report);if(validateDateRange(filters.from,filters.to))return true;
   const payments=filterPayments(snapshot,{...filters,status:'paid'}),refunds=filteredRefunds(snapshot,filters);
   const rows=[['Type','Reference','Shop','Performed by','Amount GHS','Event timestamp UTC','Trading day Ghana','Performing shift','Original sale cashier','Original sale shift','Collection adjustment','Original shop trading day','Allocated at UTC'],...payments.map(payment => ['Confirmed collection',payment.reference,shopName(snapshot,payment.shopId),paymentPerformer(snapshot,payment),(payment.amount/100).toFixed(2),paymentDate(payment),paymentTradingDay(snapshot,payment),eventShiftId(snapshot,payment)||'Unassigned',paymentPerformer(snapshot,payment),eventShiftId(snapshot,payment)||'Unassigned',payment.priorPeriodAllocation?'Late shop allocation':'',payment.allocationReceiptTradingDay||'',payment.assignedAt||'']),...refunds.map(refund => {const receipt=array(snapshot.transactions).find(payment => payment.id === refund.transactionId);return ['Completed refund',receipt?.reference || refund.transactionId,shopName(snapshot,refund.shopId),refundPerformer(snapshot,refund),(-refund.amount/100).toFixed(2),refundDate(refund),refundTradingDay(snapshot,refund),eventShiftId(snapshot,refund,'refund')||'Unassigned',receipt?paymentPerformer(snapshot,receipt):staffName(snapshot,refund.sourceStaffId),refund.sourceShiftId||eventShiftId(snapshot,receipt||{})||'Unassigned','','',''];})];
   config.onExport?.(rows,'lumo-selected-period-report.csv');return true;
  }
  return false;
 }
 return {renderActivity,renderReport:renderCurrentReport,handleClick,handleChange,getFilters:kind=>{ensureContext();return {... (kind === 'report' ? report : activity)}},getFilteredPayments:()=>{ensureContext();return filterPayments(state(),resolved(activity))},reset(){activity=defaults();report=defaults();activityFiltersOpen=false;context=contextKey();}};
}
