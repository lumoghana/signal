/** Short chapter reflections for completed, fictional Campus Run stories.
 * Amounts are integer pesewas, matching the game model. No personal state is read.
 * visual.items and insight.metric are presentation data, never account events.
 */
import {MISSION_BY_ID} from './learning-game-content.js';

const money=value=>`GH₵${(value/100).toLocaleString('en-GH',{maximumFractionDigits:2})}`;
const metric=(label,value)=>({label,value,unit:'money'});
const change=(label,before,after)=>({label,before,after,unit:'money'});
const lessons={
 'weekend-run':()=>({title:'Give your balance jobs',line:'Your balance can cover plans, a cushion and fun. See each job before choosing.',visual:{kind:'split',items:[{label:'Plan',amount:6000},{label:'Cushion',amount:1000},{label:'Room',amount:5000}],caption:'GH₵120 at the start of this story.'}}),
 'printing-plot':()=>({title:'Find the whole price',line:'Ask about the extras before committing. The headline price may cover only part of the trip.',visual:{kind:'sum',items:[{label:'Printing',amount:4000},{label:'Binding',amount:1500},{label:'Trip',amount:1000}],caption:'Solo route: GH₵65 altogether.'}}),
 'hostel-countdown':()=>({title:'Turn a date into steps',line:'A weekly pace makes a target smaller. Each step still needs confirmed money.',visual:{kind:'pace',items:[{label:'Week 1',amount:4000,status:'Illustrative pace'},{label:'Week 2',amount:4000,status:'Needs funding'},{label:'Week 3',amount:4000,status:'Needs funding'}],caption:'GH₵120 over three weeks: a pace, not funding.'}}),
 'counter-chaos':()=>({title:'Follow the payment trail',line:'Check the recipient, follow one reference and wait for the confirmed result.',visual:{kind:'trail',items:[{label:'Approved',status:'Permission'},{label:'Processing',status:'In progress'},{label:'Confirmed',status:'Final result'}],caption:'Approval and confirmation are different stages.'}}),
 'tomorrow-trap':()=>({title:'One receipt. One credit.',line:'Promises stay expected. Cash has its own place. A repeated screenshot does not add another payment.',visual:{kind:'receipt',items:[{label:'Official receipt',amount:4000,status:'Confirmed'},{label:'Same screenshot',amount:4000,status:'Same reference'}],caption:'One GH₵40 credit from the confirmed record.'}}),
 'plot-twist-week':()=>({title:'Let the plan flex',line:'When income is late, review movable costs and saving rules while keeping essentials in view.',visual:{kind:'reset',items:[{label:'Essentials',amount:4000,status:'Keep visible'},{label:'Optional order',amount:1500,status:'Discuss a change'},{label:'Saving rule',amount:1000,status:'Review the pace'}],caption:'Different parts of a plan can move differently.'}})
};

function insightFor(run,mission,flags,m){
 const storyWallet=()=>change('Story wallet',mission.initial.wallet,m.wallet);
 switch(run.missionId){
  case 'weekend-run':
   if(m.shortfall>0)return {title:'One cost still needs room',line:flags.printingSupport?`The reference arrangement avoided a new printing cost. This run still finished ${money(m.shortfall)} short of the plan and cushion.`:`This run finished ${money(m.shortfall)} short of its plan and cushion. The unconfirmed GH₵20 remained expected.`,metric:metric('Story shortfall',m.shortfall)};
   if(flags.countedPromise)return {title:'Message, not money',line:'Kojo’s message left GH₵20 expected. It did not increase the story wallet.',metric:metric('Still expected',m.expected)};
   if(flags.unplannedPrinting)return {title:'The cost is still coming',line:'The known printing cost stayed outside the plan. The unchanged wallet did not make that cost disappear.'};
   if(flags.joinedDinner)return {title:'Your night had a boundary',line:'You chose GH₵25 dinner and kept the remaining plan visible. Kojo’s message added no wallet money.',metric:storyWallet()};
   return {title:'Same friends. Your own route.',line:'Meeting after dinner meant no dinner spend. Your later choices still shaped the printing plan.',metric:metric('Dinner spend in this run',0)};
  case 'printing-plot':
   if(flags.billChecked){const paid=mission.initial.wallet-m.wallet,expected=flags.sharedRide?6000:6500;if(paid!==expected)return {title:'You made the final check',line:'Your saved story records the bill check. It does not record a completed debit for that bill.',metric:metric('Confirmed story payment',0)};return {title:'The bill followed your route',line:`The confirmed ${money(paid)} bill matched your chosen route. Its reservation was released once.`,metric:metric('Confirmed story bill',paid)};}
   if(flags.chargeQueried)return {title:'You asked before paying',line:'No sample payment completed after your query. The amount stayed reserved while the bill needed clarification.',metric:metric('Confirmed story payment',0)};
   if(flags.billSkipped)return {title:'Make the final check',line:'The final bill stayed unchecked. This run recorded no confirmed payment; checking the amount and recipient remains useful.',metric:metric('Confirmed story payment',0)};
   return {title:'The payment needed more room',line:'The story balance did not cover that payment. No sample debit or reservation release completed.',metric:metric('Confirmed story payment',0)};
  case 'hostel-countdown':
   if(m.shortfall>0)return {title:'The bundle changed the picture',line:`The story wallet finished ${money(m.shortfall)} short of its plan and cushion. Expected allowance did not fill it.`,metric:metric('Story shortfall',m.shortfall)};
   if(flags.hostelAssumed||flags.hostelPromise)return {title:'The target still needs funding',line:'GH₵120 allowance stayed expected. The message did not confirm funding or complete the hostel target.',metric:metric('Still expected',m.expected)};
   if(flags.weeklyPace)return {title:'One week has a place',line:'GH₵40 was reserved for the first week. The later weeks still need confirmed funding.',metric:metric('This week’s hostel reservation',4000)};
   if(flags.hostelSupport)return {title:'You opened a useful conversation',line:'Contacting the hostel opened a support route. It did not create money or an automatic extension.'};
   return {title:'Agreement comes before a new date',line:'You explored an instalment route. Accepted dates and confirmed funding still need checking.',metric:metric('Still expected',m.expected)};
  case 'counter-chaos':
   if(flags.duplicateRisk)return {title:'Another reference adds risk',line:'You started another GH₵20 payment while the first was pending. The original result still needs checking.',metric:metric('Extra story retry debit',2000)};
   if(flags.wrongRecipientRisk)return {title:'The name deserved another look',line:'GH₵20 left the story wallet before the mismatch was resolved. A working number alone does not verify the recipient.',metric:storyWallet()};
   if(flags.payoutAssumed)return {title:'Approval is not a receipt',line:'The payout had approvals but no confirmed payment result. Group approval replies did not change your story wallet.'};
   return {title:'You followed the financial record',line:'You avoided a second debit and kept approval separate from confirmation. The group update did not change your story wallet.',metric:metric('Extra story retry debit',0)};
  case 'tomorrow-trap':
   if(!flags.officialRepayment)return {title:'Keep the record in view',line:'This saved run has no official repayment arrival. A message or screenshot alone does not confirm a credit.',metric:metric('Confirmed Kojo credit',0)};
   if(flags.screenshotAssumed)return {title:'One reference stays one credit',line:'The screenshot repeated Kojo’s confirmed GH₵40 reference. It added no second credit.',metric:metric('Confirmed Kojo credit',4000)};
   if(flags.cashMislocated)return {title:'Cash kept its own location',line:'Akosua’s cash offer did not credit Lumo. Kojo’s separate official receipt was counted once.',metric:metric('Lumo credit from cash offer',0)};
   if(flags.promiseShopping)return {title:'Today’s spend happened first',line:'GH₵30 left before Kojo’s repayment arrived. The later confirmed receipt added GH₵40 once.',metric:storyWallet()};
   if(flags.cashTransferRequested)return {title:'A request still needs confirmation',line:'Akosua’s requested transfer stayed unconfirmed. Kojo’s separate GH₵40 receipt credited the story wallet once.',metric:metric('Confirmed Kojo credit',4000)};
   return {title:'Right money. Right place.',line:'You kept the cash route separate from Lumo. Kojo’s official GH₵40 repayment was counted once.',metric:metric('Confirmed Kojo credit',4000)};
  case 'plot-twist-week':
   if(m.shortfall>0)return {title:'The gap stayed visible',line:`This story still needed ${money(m.shortfall)} for its plan and cushion. An offer of help did not cover it.`,metric:metric('Story shortfall',m.shortfall)};
   if(flags.gapAssumed)return {title:'Support still needs a result',line:'The top-up offer did not confirm a payment. The expected allowance stayed outside the story wallet.',metric:metric('Still expected',m.expected)};
   if(flags.savingBadgePressure)return {title:'Essentials get a second look',line:'No saving transfer ran in this story. Review essentials before deciding whether the saving rule should run.'};
   if(flags.optionalDeferred||flags.clubDateAgreed)return {title:'You changed the flexible part',line:'The agreed GH₵15 club-order change reduced the plan. Your saving goal could stay while its rule adapted.',metric:change('Story planned costs',mission.initial.committed,m.committed)};
   return {title:'The goal can keep its place',line:'Reviewing a saving rule does not remove the goal. Keep checking confirmed money against the costs ahead.'};
  default:return null;
 }
}

/** Completed getCampusRun view -> concise lesson and a choice-specific insight.
 * metric values are factual story amounts, not scores or advice to spend less.
 * Null before completion prevents an answer sheet appearing mid-challenge.
 */
export function getCampusReflection(run){
 const mission=MISSION_BY_ID.get(run?.missionId);
 if(!mission||run.status!=='completed'||!run.ending||!run.ending.branch||!run.money)return null;
 const source=run.money;
 if(!['wallet','committed','cushion','expected'].every(key=>Number.isSafeInteger(source[key])&&source[key]>=0))return null;
 const m={wallet:source.wallet,committed:source.committed,cushion:source.cushion,expected:source.expected,flexible:Math.max(0,source.wallet-source.committed-source.cushion),shortfall:Math.max(0,source.committed+source.cushion-source.wallet)};
 const flags=run.ending.branch,insight=insightFor(run,mission,flags,m);
 const skills=mission.skills.map((label,index)=>({label,earned:run.ending.skills?.[index]?.earned===true}));
 return {chapterId:mission.id,title:mission.title,storyLabel:'This run · story money',challengeCount:mission.turns.length,lesson:lessons[mission.id](),insight:{...insight,routeLabel:'Try this in Lumo'},skills,money:m};
}
