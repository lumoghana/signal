/* Clarity Edition: one projected comparison, using the existing plan authority.
   This presentation layer does not change Pause rules or move any money. */
(()=>{
'use strict';
const E=L.e,M=L.money;
const cash=value=>Math.round(Math.max(0,Number(value)||0)*100)/100;
const coverage=(required,gap)=>cash(Number(required)-Number(gap));
// A fulfilled essential is removed from the remaining requirement by the engine.
// Comparing both coverage and requirement keeps that payment from looking like
// extra spending or a second deduction from the same planned cost.
L.pauseComparison=impact=>{
 const p=impact;
 if(p.essentialGap>0)return {
  kind:'essentials',label:'Budget coverage',before:coverage(p.essentialsBefore,p.essentialGapBefore),after:coverage(p.essentialsAfter,p.essentialGap),
  requiredBefore:p.essentialsBefore,requiredAfter:p.essentialsAfter,
  note:p.essentialGapBefore?'Some budget items would stay uncovered.':'Your remaining budget would no longer be fully covered.'
 };
 if(p.goalGap>0)return {
  kind:'goals',label:p.goalName?`${p.goalName} money covered`:'Goal money covered',before:coverage(p.allocated,p.goalGapBefore),after:coverage(p.allocated,p.goalGap),
  requiredBefore:p.allocated,requiredAfter:p.allocated,
  note:'Your budget stays covered. This shows how much of your goal money would still be covered.'
 };
 if(p.hasPlan)return {
  kind:'room',label:'Left after budget',before:cash(p.roomBefore),after:cash(p.room),
  note:L.state.accounts?.version===2?'Your remaining budget stays covered. Money Boxes are separate savings.':'Your remaining budget and goal allocations would stay covered.'
 };
 return {kind:'account',label:'Available account money',before:cash(p.available),after:cash(p.after),note:'No saved costs to check. This comparison only shows account money.'};
};
L.pauseComparisonMarkup=impact=>{
 const p=impact,c=L.pauseComparison(p),transfer=L.state.paymentDraft?.method==='box';
 const amount=value=>L.balanceNumber?L.balanceNumber(value):E(M(value));
 const requirement=which=>Number.isFinite(c['required'+which])?`<small>of ${E(M(c['required'+which]))} planned</small>`:'';
 const rows=[['Available now',M(p.available)],[transfer?'Transfer amount':'Payment amount','−'+M(p.amount)]];
 if(p.fee)rows.push(['Fee','−'+M(p.fee)]);
 rows.push(['Projected operational balance',M(p.after)],['Remaining budget',M(p.essentialsAfter)]);
 if(L.state.accounts?.version!==2&&p.allocated)rows.push(['Goal allocations',M(p.allocated)]);
 if(p.essentialGap)rows.push(['Budget shortfall',M(p.essentialGap)]);
 if(p.goalGap)rows.push(['Goal money uncovered',M(p.goalGap)]);
 rows.push(p.totalGap?['Total budget shortfall',M(p.totalGap)]:['Left after budget',M(p.room)]);
 const linked=p.essentialCovered>0?`<p class="pause-linked-fulfilment">This payment covers ${E(M(p.essentialCovered))} of an existing budget item. The remaining budget falls by the same amount.</p>`:'';
 return `<div class="pause-comparison" data-pause-comparison data-comparison-kind="${c.kind}"><div class="pause-comparison-heading"><h2>${E(c.label)}</h2></div><div class="pause-comparison-values"><div class="pause-comparison-before"><span class="comparison-label">Now</span><strong>${amount(c.before)}</strong>${requirement('Before')}</div><span class="pause-comparison-arrow" aria-hidden="true">→</span><div class="pause-comparison-after"><span class="comparison-label">${transfer?'After transfer':'After payment'} · projected</span><strong>${amount(c.after)}</strong>${requirement('After')}</div></div></div>${p.hasPlan&&c.kind!=='goals'?'':`<p class="pause-comparison-note">${E(c.note)}</p>`}${c.kind==='essentials'&&p.goalExplanation?`<p class="pause-goal-impact">${E(p.goalExplanation)}</p>`:''}${linked}${p.totalGapBefore?`<p class="pause-existing-gap">${E(p.changeExplanation)}</p>`:''}<details class="pause-calculation"><summary>See calculation</summary><dl>${rows.map(([label,value])=>`<div><dt>${E(label)}</dt><dd>${E(value)}</dd></div>`).join('')}</dl><p>${E(p.commitmentExplanation)}</p><p>These figures are a preview. ${transfer?'Nothing has been moved.':'Nothing has been sent.'}</p></details>`;
};
const pause=L.views.pause;
L.views.pause=()=>{
 const html=pause(),d=L.state.paymentDraft;
 // Keep missing-draft, already-submitted and non-Pause routes exactly as they are.
 if(!d||d.submittedTxId||!html.includes('class="focus-pause focus-pause-compact"'))return html;
 const impact=L.planImpactSummary(d);
 if(!impact.valid||!impact.canPay)return html;
 const comparison=L.pauseComparisonMarkup(impact),at=comparison.indexOf('<details class="pause-calculation">');
 const facts=at<0?comparison:comparison.slice(0,at),calculation=at<0?'':comparison.slice(at);
 const composed=html.replace(/<div class="pause-decision-consequence" data-projection>[\s\S]*?<\/div>(?=<div id="error"|<p class="focus-choice")/,`<div class="pause-decision-consequence" data-projection>${facts}</div>`);
 // The choice is primary. Optional arithmetic follows every decision action.
 return composed.includes('<p class="focus-footnote">')?composed.replace('<p class="focus-footnote">',calculation+'<p class="focus-footnote">'):composed.replace('</section>',calculation+'</section>');
};
// Reveal the relationship using the shared timing. Financial text is always the
// real final projection; reduced motion gets the same information immediately.
const motion=L.motion;
L.motion=function(...args){
 const result=motion?.apply(this,args);
 if(L.route!=='pause'||document.hidden||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return result;
 // The signature money scene has its own cancellable, finite sequence.
 if(document.getElementById('view')?.querySelector?.('[data-pause-hero]'))return result;
 const root=document.getElementById('view'),values=root?.querySelector?.('.pause-comparison-after'),arrow=root?.querySelector?.('.pause-comparison-arrow');
 const timing={duration:L.motionRules?.reveal||180,easing:L.motionRules?.ease||'ease-out'};
 values?.animate?.([{transform:'translateX(-3px)'},{transform:'translateX(0)'}],timing);
 arrow?.animate?.([{transform:'scaleX(.8)'},{transform:'scaleX(1)'}],timing);
 return result;
};
})();
