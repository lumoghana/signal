/* Readable Budget progress, using the existing commitment and coverage
   authorities. A pending payment is reserved, never described as spent. */
(()=>{
'use strict';
if(!window.L||!L.budgetOverview||L.budgetReadability)return;
const E=L.e,M=L.money,B=L.btn,J=value=>E(JSON.stringify(value));
const cash=value=>Math.round((Number(value)||0)*100)/100;
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const positive=value=>Math.max(0,cash(value));
// The disclosure is presentation state only. Keep it while an item is edited,
// but never store it with the customer's Budget or carry it to another account.
let disclosureAccount=L.state,itemsOpen=false;
function rememberItems(open){
 if(disclosureAccount!==L.state){disclosureAccount=L.state;itemsOpen=false;}
 itemsOpen=!!open;
}
function summary(){
 const shared=L.budgetOverview.summary(),s=L.state;
 const groups=shared.groups.map(g=>{
  const ids=new Set(g.items.map(x=>x.id));
  const spent=cash(g.items.reduce((sum,item)=>sum+positive(L.confirmedEssentialPaid(item.id,s)),0));
  const coveredElsewhere=cash(g.items.reduce((sum,item)=>sum+Math.min(positive(item.amount),positive(item.externalPaid)),0));
  const pending=cash((s.txs||[]).filter(t=>t.type==='out'&&t.status==='pending'&&ids.has(t.essentialId)).reduce((sum,t)=>sum+positive(t.amount),0));
  return {...g,spent,coveredElsewhere,pending,remaining:positive(g.remaining),over:positive(spent-g.total)};
 });
 return {...shared,groups};
}
const notes=g=>[
 ...(g.coveredElsewhere?[`<span data-budget-external>${M(g.coveredElsewhere)} covered elsewhere</span>`]:[]),
 ...(g.pending?[`<span data-budget-pending>${M(g.pending)} pending</span>`]:[]),
 ...(g.over?[`<span data-budget-over>${M(g.over)} above Budget</span>`]:[])
];
function progress(g,{detail=false}={}){
 const extras=notes(g);
 return `<span class="budget-line-figures${detail?' budget-line-detail-figures':''}"><span data-budget-spent>${M(g.spent)} paid from Budget</span><span data-budget-remaining>${M(g.remaining)} left</span></span>${extras.length?`<span class="budget-line-notes">${extras.join('')}</span>`:''}`;
}
function item(g){
 const label=`${g.name}. ${M(g.total)} budgeted. ${M(g.spent)} paid from Budget. ${M(g.remaining)} left.${g.coveredElsewhere?' '+M(g.coveredElsewhere)+' covered elsewhere.':''}${g.pending?' '+M(g.pending)+' pending, not yet spent.':''}`;
 return `<button type="button" class="budget-overview-item budget-readability-item" data-budget-line="${E(g.id)}" onclick="L.budgetOverview.openCategory(${J(g.id)})" aria-label="${E(label)}"><span class="budget-line-top"><strong>${E(g.name)}</strong><span class="budget-overview-item-amount"><span data-budgeted>${M(g.total)}</span><small>budgeted</small>${L.icon('chevron',16)}</span></span>${progress(g)}</button>`;
}
const items=z=>`<div class="budget-overview-items budget-readable-items" aria-label="Your Budget items">${z.groups.map(item).join('')}</div>`;
function itemsDisclosure(z){
 if(disclosureAccount!==L.state){disclosureAccount=L.state;itemsOpen=false;}
 return `<details class="budget-items-disclosure" data-budget-items-disclosure${itemsOpen?' open':''} ontoggle="L.budgetReadability.rememberItems(this.open)"><summary aria-controls="budget-items-panel"><span class="budget-items-show">View Budget items</span><span class="budget-items-hide">Hide Budget items</span><span class="budget-items-count">${z.groups.length}</span>${L.icon('chevron',16)}</summary><div id="budget-items-panel">${items(z)}</div></details>`;
}
function labelPeriod(html){
 return html.replace(/<button\b([^>]*class="[^"]*\bbudget-overview-period\b[^"]*"[^>]*)>([\s\S]*?)<\/button>/g,(_,attrs,body)=>`<button${attrs} data-budget-period><span class="budget-period-kicker">Budget period</span><span class="budget-period-date">${body}</span></button>`);
}
function periodControl(){
 const raw=String(L.state.planHorizon?.date||''),date=/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(raw+'T12:00:00Z'):null;
 const valid=date&&!Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===raw;
 const today=new Date().toISOString().slice(0,10),dateLabel=valid?(raw<today?'Ended ':'Through ')+date.toLocaleDateString('en-GH',{timeZone:'Africa/Accra',day:'numeric',month:'short',...(raw.slice(0,4)!==today.slice(0,4)?{year:'numeric'}:{})}):'Add dates';
 return `<button type="button" class="budget-readable-period" data-budget-period onclick="L.go('planPeriod')" aria-label="${E(valid?'Change Budget period · '+dateLabel:'Add Budget dates')}"><span>Budget period</span><strong>${E(dateLabel)} ${L.icon('chevron',15)}</strong></button>`;
}
function enhanceList(html,route){
 if(!allowed())return html;
 const z=summary();
 if(!z.groups.length)return html;
 html=html.replace(/<div class="budget-overview-items"[^>]*>[\s\S]*?<\/div>/,route==='plan'?itemsDisclosure(z):items(z));
 if(route==='plan')html=labelPeriod(html);
 else html=html.replace(/(<div class="budget-overview-edit-total">[\s\S]*?<\/div>)/,'$1'+periodControl());
 return html;
}
for(const route of ['plan','planEdit','essentials']){
 const view=L.views[route];if(!view)continue;
 L.views[route]=function(...args){return enhanceList(view.apply(this,args),route);};
}
const category=L.views.budgetCategory;
if(category)L.views.budgetCategory=function(...args){
 let html=category.apply(this,args);if(!allowed())return html;
 const g=summary().groups.find(x=>x.id===L.params.id);if(!g)return html;
 const info=`<div class="budget-readable-category" data-budget-line="${E(g.id)}" role="group" aria-label="${E(g.name)} progress">${progress(g,{detail:true})}${g.pending?'<p>Pending amounts are reserved until the payment is confirmed.</p>':''}</div>`;
 return html.replace(/<p class="small muted">[^<]*still to cover\. This is a planned cost, not a separate balance\.<\/p>/,info)
  .replace('Budget item · Operational account','Budget item · Everyday Money');
};
L.budgetReadability=Object.freeze({summary,rememberItems});
})();
