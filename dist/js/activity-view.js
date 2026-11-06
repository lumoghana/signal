import { esc, cash, icon, categorySymbol, row, sectionHead, dateLabel } from './ui.js';

export const isExternalReceipt = transaction => ['iou-manual-receipt', 'iou-manual-repayment', 'split-manual-receipt'].includes(transaction?.type);

export function filterActivity(transactions, filters = {}) {
  const q = String(filters.query || '').trim().toLowerCase();
  const asOf = Date.parse(filters.asOf);
  return transactions.filter(t => {
    const searchable = [t.id,t.reference,t.merchant,t.note,t.category,t.rail,t.status,t.recipient?.number].join(' ').toLowerCase();
    const day = String(t.at || '').slice(0,10);
    return (!q || searchable.includes(q))
      && (!filters.direction || filters.direction === 'all' || t.direction === filters.direction)
      && (!filters.status || filters.status === 'all' || t.status === filters.status)
      && (!filters.category || t.category === filters.category)
      && (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to)
      && (!Number.isFinite(asOf) || (Number.isFinite(Date.parse(t.at)) && Date.parse(t.at) <= asOf));
  }).sort((a,b) => String(b.at).localeCompare(String(a.at)));
}

function filters(ctx) { return ctx.draft.activityFilters ||= {query:ctx.draft.activityQuery || '',direction:'all',status:'all',category:'',from:'',to:''}; }
export function renderActivityEntries(ctx) {
  const list = filterActivity(ctx.state.transactions, filters(ctx));
  if (!list.length) return '<div class="empty"><h2>No moves in this view.</h2><p>Try another date, category or reference.</p></div>';
  let previous = '';
  return list.map(t => {
    const date = String(t.at).slice(0,10), heading = date !== previous ? `<div class="feed-date">${esc(dateLabel(t.at))}</div>` : ''; previous = date;
    const outsideReceipt = isExternalReceipt(t);
    const sub = outsideReceipt ? `${t.type==='iou-manual-repayment'?'Paid outside Lumo':'Outside repayment'} · ${{cash:'Cash',momo:'MoMo',bank:'Other bank',other:'Other account'}[t.rail] || 'Recorded manually'} · Lumo unchanged` : t.status === 'success' ? (t.note || t.category) : t.status;
    const symbol = t.type === 'saving' && t.emoji ? esc(t.emoji) : icon(categorySymbol(t.category),22);
    return heading + row({emoji:symbol,title:t.merchant,sub,right:`<span class="${!outsideReceipt && t.direction === 'in'?'feed-positive':''}">${outsideReceipt?'':t.direction === 'in'?'+':'−'}${cash(t.amount)}</span>`,action:`root-tx:${t.id}`});
  }).join('');
}

export function renderActivity(ctx) {
  const f=filters(ctx), count=[f.status !== 'all',!!f.category,!!f.from,!!f.to].filter(Boolean).length;
  const iqReturn=ctx.route?.returnTo?.section==='learn'&&ctx.route.returnTo.page==='money-iq';
  const snapshot = f.asOf && Number.isFinite(Date.parse(f.asOf)) ? `<p class="muted activity-snapshot" role="status">Snapshot as of ${esc(new Date(f.asOf).toLocaleString('en-GH', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'UTC' }))} GMT. <button type="button" class="text-button" data-activity-clear-snapshot>Clear snapshot</button></p>` : '';
  return `<section class="page activity-page">${iqReturn?`<button class="miq-activity-return" data-activity-iq-return>${icon('back',18)} Back to my Money IQ reveal</button>`:''}${sectionHead('Your activity', `<button data-action="insights">Insights ${icon('chevron',14)}</button>`)}${snapshot}<div class="activity-tools"><label style="flex:1"><input id="activity-search" aria-label="Search activity" placeholder="Person, payment or reference" value="${esc(f.query)}"></label><button class="chip" data-activity-filters>Filters${count?` · ${count}`:''}</button></div><div class="chips" style="margin-bottom:20px">${[['all','All moves'],['in','Money in'],['out','Money out']].map(([id,label])=>`<button class="chip ${f.direction===id?'selected':''}" data-activity-direction="${id}">${label}</button>`).join('')}</div><div class="activity-list" id="activity-entries">${renderActivityEntries(ctx)}</div><button class="button text" data-activity-statement>${icon('download',17)} Download a statement</button></section>`;
}

export function bindActivity(ctx) {
  const f=filters(ctx), input=ctx.$('#activity-search');
  ctx.$('[data-activity-iq-return]')?.addEventListener('click',()=>ctx.go(ctx.route.returnTo));
  ctx.$('[data-activity-clear-snapshot]')?.addEventListener('click',()=>{delete f.asOf;ctx.saveDraft?.();ctx.refresh();});
  input?.addEventListener('input',()=>{f.query=input.value;ctx.$('#activity-entries').innerHTML=renderActivityEntries(ctx);ctx.saveDraft?.();});
  ctx.$$('[data-activity-direction]').forEach(b=>b.onclick=()=>{f.direction=b.dataset.activityDirection;ctx.refresh();});
  ctx.$('[data-activity-statement]')?.addEventListener('click',()=>ctx.go({section:'life',page:'account-statements',returnTo:{section:'activity',page:'home'}}));
  ctx.$('[data-activity-filters]')?.addEventListener('click',()=>{
    const categories=[...new Set(ctx.state.transactions.map(t=>t.category).filter(Boolean))].sort();
    ctx.sheet(`<h2>Find that move.</h2><form id="activity-filter-form"><label class="field"><span>Status</span><select name="status">${['all','success','pending','failed','reversed'].map(s=>`<option value="${s}" ${f.status===s?'selected':''}>${s==='all'?'All statuses':s[0].toUpperCase()+s.slice(1)}</option>`).join('')}</select></label><label class="field"><span>Category</span><select name="category"><option value="">All categories</option>${categories.map(c=>`<option value="${esc(c)}" ${f.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label><label class="field"><span>From</span><input type="date" name="from" value="${esc(f.from)}"></label><label class="field"><span>To</span><input type="date" name="to" value="${esc(f.to)}"></label><p class="error" role="alert"></p><button class="button" type="submit">Show my moves</button><button class="button text" type="button" data-clear-filters>Clear filters</button></form>`,el=>{
      const form=el.querySelector('form');
      form.onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(form));if(v.from&&v.to&&v.from>v.to){form.querySelector('.error').textContent='Choose an end date after the start.';return;}Object.assign(f,v);delete f.asOf;ctx.closeSheet();ctx.refresh();};
      el.querySelector('[data-clear-filters]').onclick=()=>{Object.assign(f,{status:'all',category:'',from:'',to:''});delete f.asOf;ctx.closeSheet();ctx.refresh();};
    });
  });
}
