/** Short play-area copy. The existing Campus Run engine remains the source of truth. */
const worldByMission={
 'weekend-run':'campus','printing-plot':'print','hostel-countdown':'hostel',
 'counter-chaos':'pay','tomorrow-trap':'promise','plot-twist-week':'recovery',
};
const scenes={
 'weekend-invite':['Dinner with friends?','Leave room for essentials.'],
 'printing-surprise':['Make room for printing.','The next cost needs a place.'],
 'promise-message':['Kojo promised GH₵20. Not here yet.','Promised is not received.'],
 'printer-quote':['Print quote: GH₵40. What’s included?','Look beyond the first price.'],
 'trip-plan':['Get the project collected.','Pick a complete route.'],
 'final-bill':['Check the bill before paying.','Follow the agreed route.'],
 'hostel-pace':['GH₵120 needed. Three weeks to go.','Give this week a pace.'],
 'data-need':['Keep lectures connected.','Choose a study route that fits.'],
 'hostel-funding':['Allowance message. No receipt yet.','The deadline needs confirmed funds.'],
 'name-check':['That registered name doesn’t match.','Check before money moves.'],
 'pending-loop':['Still pending. Follow one payment.','One reference. One trail.'],
 'group-approval':['Approved. No payment result yet.','Approval starts the next step.'],
 'kojo-promise':['Kojo’s GH₵40 is still expected.','Use what is here today.'],
 'cash-repayment':['Akosua offers GH₵30 cash.','Cash has its own place.'],
 'receipt-once':['GH₵40 confirmed. Same screenshot reference.','Same reference. Count it once.'],
 'late-reset':['Allowance late. Protect essentials.','Find a part that can move.'],
 'saving-rule':['Make the rule fit this week.','The goal can stay.'],
 'gap-check':['Help offered. Nothing confirmed yet.','Keep the actual gap visible.'],
};
// Labels name destinations in the world, rather than answers in a questionnaire.
const targets={
 'dinner-cap':['Dinner cap','🍽️','spend'],
 'after-dinner':['Meet later','👋','wait'],
 'full-night':['Party plans','🎉','spend'],
 'reserve-print':['My copy','📄','plan'],
 'shared-copy':['Shared copy','🤝','plan'],
 'ignore-print':['Leave unplanned','⏳','defer'],
 'keep-expected':['Keep expected','☁️','wait'],
 'check-receipt':['Find receipt','🧾','verify'],
 'promise-spend':['Use promise','🛍️','claim'],
 'ask-breakdown':['Full quote','🧾','verify'],
 'check-inclusions':['Check extras','🔎','verify'],
 'headline-only':['Only printing','🏷️','claim'],
 'own-trip':['My trip','🚕','plan'],
 'shared-ride':['Shared ride','🚌','plan'],
 'forty-plan':['Printing only','📄','plan'],
 'match-bill':['Check & pay','✅','spend'],
 'query-extra':['Query charge','💬','verify'],
 'skip-bill':['Skip check','⚡','claim'],
 'weekly-forty':['This week','🗓️','plan'],
 'agree-installment':['Ask hostel','🤝','support'],
 'promise-all':['Use promise','☁️','claim'],
 'full-data':['Full bundle','📶','spend'],
 'wifi-route':['Campus Wi-Fi route','🏫','spend'],
 'big-unplanned':['Extra bundle','📦','spend'],
 'verify-funding':['Check funding','🔍','verify'],
 'talk-early':['Talk early','💬','support'],
 'mark-funded':['Claim funded','🏁','claim'],
 'confirm-number':['Check number','🔎','verify'],
 'trusted-channel':['Trusted contact','☎️','support'],
 'name-skip':['Send anyway','⚡','spend'],
 'same-reference':['Same reference','🧾','verify'],
 'official-status':['Ask support','💬','support'],
 'pay-again':['Pay again','🔁','spend'],
 'wait-confirmed':['Follow status','⏳','wait'],
 'review-card':['Status card','🧾','verify'],
 'chat-receipt':['Claim paid','📣','claim'],
 'expected-lane':['Keep expected','☁️','wait'],
 'request-confirmation':['Find receipt','🔎','verify'],
 'promise-shopping':['Spend now','🛍️','spend'],
 'cash-location':['Cash pocket','👛','record'],
 'choose-transfer':['Request transfer','📲','wait'],
 'cash-wallet':['Add to Lumo','➕','claim'],
 'match-once':['Match once','🧾','verify'],
 'check-own-activity':['Official activity','🔍','verify'],
 'image-proof':['Count image again','🖼️','claim'],
 'defer-club':['Move club order','🗓️','release'],
 'agree-new-date':['Agree new date','🤝','release'],
 'extra-spend':['Buy extras','🛍️','spend'],
 'pause-rule':['Pause rule','⏸️','pause'],
 'review-rule':['Adjust pace','🌱','review'],
 'badge-saving':['Keep for badge','🏅','claim'],
 'compare-gap':['Check the gap','🔍','verify'],
 'ask-support':['Practical help','🤝','support'],
 'gap-solved':['Claim covered','🏁','claim'],
};
const money=value=>`GH₵${(value/100).toLocaleString('en-GH',{minimumFractionDigits:0,maximumFractionDigits:2})}`;
const words=(text,n)=>String(text||'').trim().split(/\s+/).slice(0,n).join(' ');
const amounts=text=>[...new Set([...String(text||'').matchAll(/GH[₵¢]\s*(\d[\d,]*(?:\.\d{1,2})?)/g)].map(match=>money(Math.round(Number(match[1].replaceAll(',',''))*100))))];
const billTotal=run=>/GH₵60\b/.test(run.turn?.body||'')?6000:6500;
function targetFor(choice,run){
 const base=targets[choice.id]||[words(choice.label,4),choice.emoji||'✦','review'];
 let [label,icon,kind]=base,costLabel=amounts(`${choice.label} ${choice.detail}`).join(' / ');
 if(choice.id==='after-dinner')costLabel='No dinner spend';
 if(choice.id==='shared-copy'&&/reference option/.test(choice.label)){label='Ask course rep';kind='support';costLabel='No new cost';}
 if(['keep-expected','promise-spend'].includes(choice.id))costLabel='GH₵20 expected';
 if(choice.id==='check-receipt')costLabel='Not confirmed';
 if(choice.id==='headline-only')costLabel='GH₵40 quote';
 if(choice.id==='match-bill')costLabel=`${money(billTotal(run))} bill`;
 if(choice.id==='skip-bill')costLabel='Unchecked';
 if(choice.id==='promise-all')costLabel='GH₵120 expected';
 if(choice.id==='verify-funding'||choice.id==='mark-funded')costLabel='Unconfirmed';
 if(choice.id==='wait-confirmed'||choice.id==='review-card')costLabel='Awaiting result';
 if(choice.id==='chat-receipt')costLabel='Not confirmed';
 if(choice.id==='expected-lane')costLabel='GH₵40 expected';
 if(choice.id==='request-confirmation')costLabel='Not received';
 if(choice.id==='cash-location'||choice.id==='cash-wallet')costLabel='GH₵30 cash offer';
 if(choice.id==='choose-transfer')costLabel='Not received';
 if(choice.id==='match-once'||choice.id==='check-own-activity')costLabel='Already credited';
 if(choice.id==='image-proof')costLabel='GH₵40 again';
 if(choice.id==='defer-club'||choice.id==='agree-new-date')costLabel='GH₵15 optional';
 if(['pause-rule','review-rule','badge-saving'].includes(choice.id))costLabel='GH₵10 rule';
 if(choice.id==='gap-solved')costLabel='Not confirmed';
 return {id:choice.id,label,costLabel,icon,kind};
}
const outcomes={
 'dinner-cap':'Dinner planned. Essentials protected.',
 'after-dinner':'Friends kept. Dinner spend skipped.',
 'full-night':'The night used protected money.',
 'reserve-print':'Printing reserved. Not paid yet.',
 'shared-copy':'Shared printing has a place.',
 'ignore-print':'Printing still needs a place.',
 'keep-expected':'GH₵20 stays expected.',
 'check-receipt':'No receipt. No extra balance.',
 'promise-spend':'That GH₵20 has not arrived.',
 'ask-breakdown':'Full trip: GH₵65.',
 'check-inclusions':'Full trip: GH₵65.',
 'headline-only':'Full trip: GH₵65. Extras matter.',
 'own-trip':'GH₵65 reserved. Not spent.',
 'shared-ride':'GH₵60 reserved. Not spent.',
 'forty-plan':'GH₵25 extra still needs planning.',
 'match-bill':'Sample payment confirmed. Reservation released once.',
 'query-extra':'Check first. No payment made.',
 'skip-bill':'Bill unchecked. Payment needs review.',
 'weekly-forty':'GH₵40 reserved for this week.',
 'agree-installment':'Dates need the hostel’s agreement.',
 'promise-all':'Promise held. No new funds.',
 'full-data':'GH₵15 for lectures.',
 'wifi-route':'GH₵10 with campus Wi-Fi.',
 'big-unplanned':'GH₵80 spent. Review remaining commitments.',
 'verify-funding':'Hostel still needs confirmed funding.',
 'talk-early':'Support asked. No funds assumed.',
 'mark-funded':'A message cannot fund the hostel.',
 'confirm-number':'Recipient check first. No payment.',
 'trusted-channel':'Trusted check. Payment still waits.',
 'name-skip':'GH₵20 sent. Recipient unchecked.',
 'same-reference':'One reference. Result still pending.',
 'official-status':'Support follows the existing reference.',
 'pay-again':'Another GH₵20 sent. First still pending.',
 'wait-confirmed':'Approved, still awaiting payment confirmation.',
 'review-card':'Payment status checked. Wallet unchanged.',
 'chat-receipt':'Approval replies are not receipts.',
 'expected-lane':'GH₵40 stays expected.',
 'request-confirmation':'Receipt requested. Balance unchanged.',
 'promise-shopping':'GH₵30 spent. Promise still expected.',
 'cash-location':'Cash stays outside Lumo.',
 'choose-transfer':'Transfer requested. Confirmation still needed.',
 'cash-wallet':'Cash is not a Lumo credit.',
 'match-once':'GH₵40 counted once.',
 'check-own-activity':'One confirmed record. One GH₵40 credit.',
 'image-proof':'Same reference. No second credit.',
 'defer-club':'GH₵15 released. Essentials kept.',
 'agree-new-date':'New date agreed. GH₵15 released.',
 'extra-spend':'GH₵25 spent. Allowance still expected.',
 'pause-rule':'Saving paused. Your goal stays.',
 'review-rule':'Rule reviewed. No money moved.',
 'badge-saving':'Essentials first. Badge can wait.',
 'compare-gap':'Check confirmed funds against commitments.',
 'ask-support':'Help requested. Nothing received yet.',
 'gap-solved':'An offer is not confirmed money.',
};
function outcomeFor(run){
 const current=run.lastOutcome;if(!current)return null;
 const choice=run.turn?.choices?.find(c=>c.label===current.choiceLabel),id=choice?.id;
 let line=outcomes[id]||words(current.title,10);
 if(current.title==='This move needs a different plan.')line='Not enough room. Try another route.';
 else if(id==='shared-copy'&&/reference option/.test(current.choiceLabel))line=(run.money?.shortfall||0)>0?`Reference agreed. ${money(run.money.shortfall)} still needs covering.`:'Reference agreed. No new cost.';
 else if(id==='full-night'&&(run.money?.shortfall||0)>0)line=`${money(run.money.shortfall)} still needs covering.`;
 else if(id==='match-bill'){
  const debit=current.changes?.find(c=>c.label==='Story wallet'&&c.before>c.after);
  if(debit)line=`${money(debit.before-debit.after)} paid. Reservation released once.`;
 }
 return {line,kind:current.tone==='clear'?'clear':'thoughtful',choiceId:id||'',skill:current.skill===true};
}
/** All returned copy is for the fictional game; it does not create records. */
export function getWorldPresentation(run){
 if(!run?.turn)return null;
 const id=run.turn.id,definition=scenes[id]||[words(run.turn.title,8),'Choose your route.'];
 let [prompt,heroLine]=definition;
 if(id==='printing-surprise'&&(run.money?.shortfall||0)>0)prompt='Printing now. A shortfall still needs covering.';
 if(id==='data-need'&&/Week one/.test(run.turn.title))prompt='Hostel reserved. Stay connected.';
 if(id==='pending-loop'&&/unchecked send/i.test(run.turn.title))prompt='Unchecked send. A separate payment is pending.';
 const facts=[];
 if(id==='trip-plan')facts.push({label:'Full trip',value:'GH₵65'},{label:'Shared ride',value:'GH₵60'});
 if(id==='final-bill')facts.push({label:'Sample bill',value:money(billTotal(run))});
 if(id==='hostel-pace')facts.push({label:'Deadline',value:'3 weeks'},{label:'Target',value:'GH₵120'});
 if(id==='cash-repayment')facts.push({label:'Offer',value:'GH₵30 cash'});
 if(id==='late-reset')facts.push({label:'Essentials',value:'GH₵40'},{label:'Optional club',value:'GH₵15'});
 if(id==='saving-rule')facts.push({label:'Saving rule',value:'GH₵10'});
 return {world:worldByMission[run.missionId]||'campus',prompt,heroLine,targets:(run.turn.choices||[]).map(choice=>targetFor(choice,run)),outcome:outcomeFor(run),facts,...(id==='receipt-once'?{arrival:{amount:4000,label:'GH₵40 confirmed',credited:true}}:{})};
}
