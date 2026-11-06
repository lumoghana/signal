/** Campus Run is fictional play. Every amount and person is part of a sample story. */
const move=(id,label,detail,emoji,skill,effect,title,body)=>({id,label,detail,emoji,skill,effect,outcome:{title,body,tone:skill?'clear':'helpful'}});
const turn=(id,kicker,title,body,lux,choices)=>({id,kicker,title,body,lux,choices});
export const CAMPUS_MISSIONS=Object.freeze([
 {id:'weekend-run',index:0,title:'Make it to Friday',kicker:'Chapter 01 · The group chat is awake',emoji:'🍲',description:'Weekend plans, a printing surprise and money with a few jobs already.',topicId:'planning',initial:{wallet:12000,committed:6000,cushion:1000,expected:2000},skills:['Make room for plans','Notice the extra cost','Keep promises separate'],ending:{strong:{title:'Weekend unlocked. Plan intact.',body:'You found room for the plans and kept a clear picture when the week changed.'},mixed:{title:'A plot twist worth replaying.',body:'You reached Friday with a few decisions to revisit. Try another route and see what changes.'}},turns:[
  turn('weekend-invite','Friday · 4:12pm','The group chat has plans.','Dinner is happening. GH₵60 is already needed for food and rides, with a GH₵10 cushion.','You can join in without giving the whole balance a new job.',[
   move('dinner-cap','Join with a GH₵25 cap','Choose the spend before the night starts.','🍽️',true,{spend:2500,flags:{joinedDinner:true}},'You gave the night a boundary.','GH₵25 goes to dinner. Your commitments and cushion still have their space.'),
   move('after-dinner','Meet them after dinner','Same people. A different plan.','👋',true,{flags:{afterDinner:true}},'You found another way in.','The hangout stays on the calendar. No dinner spend leaves the story wallet.'),
   move('full-night','Let the night decide','The sample night adds up to GH₵65.','🎉',false,{spend:6500,flags:{unplannedNight:true}},'The balance had other jobs.','GH₵65 left the wallet, and the remaining amount no longer covers the full plan plus cushion. You can rewind this move.')
  ]),
  turn('printing-surprise','Saturday · A message from the course rep','Printing was not in the plan.','Your share is GH₵15, or GH₵10 if the group shares one reference copy.','An extra cost can change the plan before it becomes a payment.',[
   move('reserve-print','Reserve GH₵15','Give your own copy a place in the plan.','📄',true,{commit:1500,flags:{printingReserved:true}},'The new cost has a place.','The printing share is now committed in this story. It has not been paid yet.'),
   move('shared-copy','Agree one shared copy','Reserve the agreed GH₵10 share.','🤝',true,{commit:1000,flags:{sharedPrinting:true}},'A different plan, agreed together.','The shared copy reduces this sample cost. GH₵10 is reserved, with the group on the same page.'),
   move('ignore-print','Leave it for deadline day','Keep the new cost outside the plan.','🙈',false,{flags:{unplannedPrinting:true}},'It is still coming.','The wallet looks the same, but a known printing cost is missing from the plan. Rewind if you want to make room now.')
  ]),
  turn('promise-message','Sunday · Kojo checks in','“Your GH₵20 is coming.”','Kojo still owes GH₵20. There is a message, but no confirmed repayment.','Keep the outlook and today’s usable money in their own lanes.',[
   move('keep-expected','Keep it in expected money','Plan today with what is already here.','💬',true,{flags:{promiseKeptSeparate:true}},'The promise stayed in its lane.','GH₵20 remains expected. The message does not increase the story wallet.'),
   move('check-receipt','Check for a confirmed receipt','Follow the payment before changing the balance.','🔎',true,{flags:{receiptChecked:true}},'No receipt, no extra balance.','There is no confirmed payment in this scene. Your available money stays exactly where it was.'),
   move('promise-spend','Make plans for that GH₵20','Treat the message as money already here.','🛍️',false,{flags:{countedPromise:true}},'The message cannot cover a payment.','The promised GH₵20 has not arrived. This game keeps it expected, so the plan cannot rely on it yet.')
  ])
 ]},
 {id:'printing-plot',index:1,title:'The printing plot',kicker:'Chapter 02 · Submission week',emoji:'📚',description:'Get the project submitted without losing the extras in the quote.',topicId:'upcoming',initial:{wallet:9500,committed:1000,cushion:1000,expected:0},skills:['Read the whole quote','Plan the whole trip','Follow the final bill'],ending:{strong:{title:'Submitted. No mystery extras.',body:'You made the full trip visible and kept the payment trail clear.'},mixed:{title:'The quote had a second page.',body:'You got through submission week. Replay to catch the extras before they catch the plan.'}},turns:[
  turn('printer-quote','Monday · The printer replies','“Printing is only forty.”','The quote says GH₵40. Binding and the trip have not been discussed.','The first number is a starting point.',[
   move('ask-breakdown','Ask for the full breakdown','Printing, binding and collection costs.','🧾',true,{flags:{fullQuote:true}},'The extras are in view.','The full sample cost is GH₵40 printing, GH₵15 binding and GH₵10 transport: GH₵65.'),
   move('check-inclusions','Check what the quote includes','Get the missing parts before booking.','🔎',true,{flags:{fullQuote:true}},'You checked before committing.','Binding and transport were outside the quote. The complete sample trip costs GH₵65.'),
   move('headline-only','Plan around the forty','Assume the headline covers the whole trip.','🏷️',false,{flags:{headlineOnly:true}},'Two extras were hiding.','Binding adds GH₵15 and transport adds GH₵10. The full trip is GH₵65, so the headline alone would leave a gap.')
  ]),
  turn('trip-plan','Tuesday · Collection is tomorrow','Pick the collection plan.','The full trip is GH₵65. Sharing a ride with Akosua makes your total GH₵60.','Both routes can work. Give the route you choose enough room.',[
   move('own-trip','Reserve GH₵65 for my trip','Print, bind and collect on your schedule.','🚕',true,{commit:6500,flags:{ownTrip:true}},'Your route is covered.','GH₵65 is now reserved for the complete trip. The reservation itself does not spend it.'),
   move('shared-ride','Agree the shared ride','Reserve the agreed GH₵60 total.','🚌',true,{commit:6000,flags:{sharedRide:true}},'The shared route has a plan.','GH₵60 is reserved for your agreed trip. A cheaper route earns the same skill star as a fully planned solo trip.'),
   move('forty-plan','Reserve only GH₵40','Leave the extras for later.','📄',false,{commit:4000,flags:{missingExtras:true}},'The extras still need room.','The plan covers printing, but binding and transport are missing. Rewind to choose a complete route.')
  ]),
  turn('final-bill','Wednesday · Ready to collect','The printer sends a final bill.','Check the final items and the recipient before authorising the payment.','A clear plan and a clear payment trail go together.',[
   move('match-bill','Match it to the agreed quote','Check the extras and registered recipient.','✅',true,{flags:{billChecked:true}},'Everything lines up before the PIN.','You checked the final cost and who should receive it. This scene stops before any payment is authorised.'),
   move('query-extra','Ask about an unexpected charge','Clarify a changed item before paying.','💬',true,{flags:{chargeQueried:true}},'You gave the change a second look.','A changed charge deserves an explanation and an updated plan. Asking does not authorise payment.'),
   move('skip-bill','Approve the total without checking','Trust that it is the same quote.','⚡',false,{flags:{billSkipped:true}},'The final bill deserves a look.','A quote can change. Checking the final cost and recipient is useful before any payment leaves your account.')
  ])
 ]},
 {id:'hostel-countdown',index:2,title:'Hostel countdown',kicker:'Chapter 03 · Future you is calling',emoji:'🏠',description:'A big date, a weekly pace and the cost that arrives in between.',topicId:'upcoming',initial:{wallet:18000,committed:6000,cushion:2000,expected:12000},skills:['Work back from a date','Keep the weekly picture current','Check confirmed funding'],ending:{strong:{title:'The date has a route.',body:'You found a pace and adapted it around the week, without borrowing from an unconfirmed promise.'},mixed:{title:'There is time to redraw the route.',body:'Deadlines and income can move. Replay the decisions to find a plan that matches what is actually here.'}},turns:[
  turn('hostel-pace','Three weeks to go','GH₵120 is still needed.','The hostel deadline is three weeks away. Your current story wallet has GH₵100 after commitments and cushion.','A weekly pace helps, but it still needs to fit real money.',[
   move('weekly-forty','Reserve this week’s GH₵40','Use the three-week pace from the money here.','🗓️',true,{commit:4000,flags:{weeklyPace:true}},'Week one has a place.','GH₵40 is reserved. The remaining weeks still need confirmed funding as they arrive.'),
   move('agree-installment','Agree a different instalment route','Ask the hostel what dates are accepted first.','🤝',true,{flags:{installmentCheck:true}},'You checked the available routes.','An instalment only becomes the plan when the hostel agrees to it. No new money or assumed permission appears here.'),
   move('promise-all','Reserve the promised allowance too','Assume the next GH₵120 has arrived.','☁️',false,{flags:{hostelPromise:true}},'Expected is still expected.','The next GH₵120 is not in the story wallet. The deadline needs a route built on confirmed money.')
  ]),
  turn('data-need','Between now and the deadline','A data bundle is running out.','A GH₵15 bundle covers lectures. A GH₵10 bundle fits if you use the campus Wi-Fi for larger downloads.','Choose the route that fits your actual study needs.',[
   move('full-data','Take the GH₵15 bundle','Cover the week’s stated study needs.','📶',true,{spend:1500,flags:{fullData:true}},'Study needs have room.','GH₵15 leaves the wallet. The full bundle earns the same skill star as another planned route.'),
   move('wifi-route','Take the GH₵10 Wi-Fi route','Use the agreed campus download plan.','🏫',true,{spend:1000,flags:{wifiRoute:true}},'A different study route works too.','GH₵10 leaves the wallet. Your choice includes the campus Wi-Fi plan, rather than assuming everyone can use less data.'),
   move('big-unplanned','Buy the GH₵80 extra bundle','Choose a larger bundle outside the plan.','📦',false,{spend:8000,flags:{largeBundle:true}},'That bundle has a bigger footprint.','The unplanned GH₵80 can eat into money already committed. Look at the remaining picture before keeping this route.')
  ]),
  turn('hostel-funding','The next allowance date','A payment message arrives.','Someone says the allowance is on its way. The story still has no confirmed receipt.','The date and the money both need checking.',[
   move('verify-funding','Check the receipt and remaining gap','Update the plan after funding is confirmed.','🔍',true,{flags:{hostelReceipt:true}},'You kept the date and balance honest.','The sample allowance remains expected until a confirmed receipt arrives. The amount still needed stays visible.'),
   move('talk-early','Contact the hostel early','Discuss the remaining gap before the deadline.','💬',true,{flags:{hostelSupport:true}},'You opened a route before the deadline.','An early conversation can establish what options exist. It does not create funds or an automatic extension.'),
   move('mark-funded','Call the hostel target covered','Treat the message as proof of funding.','🏁',false,{flags:{hostelAssumed:true}},'A message is not the funding result.','The promised allowance has not credited this story wallet. The remaining gap cannot be marked covered yet.')
  ])
 ]},
 {id:'counter-chaos',index:3,title:'Counter chaos',kicker:'Chapter 04 · Everyone is waiting',emoji:'📲',description:'Names, spinning payment screens and the difference between approval and payment.',topicId:'safety',initial:{wallet:8000,committed:3000,cushion:1000,expected:0},skills:['Confirm the recipient','Follow one reference','Separate approval and confirmation'],ending:{strong:{title:'One clear payment trail.',body:'You checked the person, followed the result and kept approval separate from a receipt.'},mixed:{title:'The loading wheel can wait.',body:'A busy counter can rush a choice. Replay the scene and make the payment trail clearer.'}},turns:[
  turn('name-check','At the campus counter','The name does not match.','You entered the merchant’s number. The lookup returns a different registered name.','A successful lookup still needs the right person.',[
   move('confirm-number','Check the number together','Confirm the registered recipient before sending.','🔎',true,{flags:{recipientChecked:true}},'You checked before the PIN.','No payment has been made. The registered details need to match the intended recipient.'),
   move('trusted-channel','Verify through a trusted contact','Use the merchant’s established contact route.','☎️',true,{flags:{recipientVerified:true}},'You found a second way to check.','A trusted route can help verify a mismatch. The payment still waits for your review and authorisation.'),
   move('name-skip','Send the sample GH₵20 anyway','Let the working number decide.','⚡',false,{spend:2000,flags:{wrongRecipientRisk:true}},'The money moved without that check.','GH₵20 leaves this fictional wallet. A lookup alone did not establish that it was the intended person.')
  ]),
  turn('pending-loop','A separate payment is pending','The spinner is still going.','An existing payment has a reference but no final result. The merchant asks you to try again.','Stay with the payment that already has a trail.',[
   move('same-reference','Check the existing reference','Follow its status before starting another.','🧾',true,{flags:{pendingFollowed:true}},'You kept one trail to follow.','Pending is not a final result. No second debit is added to this story.'),
   move('official-status','Use the official status route','Share the reference with support if needed.','💬',true,{flags:{pendingSupport:true}},'The reference goes with the question.','Official status and support can follow the same payment. A waiting screen is not proof of failure.'),
   move('pay-again','Start another GH₵20 payment','Use a new reference to get past the spinner.','🔁',false,{spend:2000,flags:{duplicateRisk:true}},'Now there could be two payments.','Another fictional GH₵20 leaves the wallet. The original payment still needs a final result, so duplication is possible.')
  ]),
  turn('group-approval','Project group update','“Both approvers said yes.”','The group payout has its required approvals. There is no confirmed payment result yet.','Group money is separate. Approval opens the next step; it does not finish the payment.',[
   move('wait-confirmed','Follow processing to confirmation','Keep the group updated with the actual status.','✅',true,{flags:{payoutStatus:true}},'Approval and payment stayed separate.','The group can proceed through processing. Only its confirmed payment result shows that the payout completed.'),
   move('review-card','Open the payout status card','Use the authorised journey and reference.','🧾',true,{flags:{payoutReviewed:true}},'You followed the financial record.','A status card can show the actual payout stage. Your personal story wallet is unchanged by this group update.'),
   move('chat-receipt','Tell everyone the printer is paid','Use the approval replies as the receipt.','📣',false,{flags:{payoutAssumed:true}},'Those replies are not a receipt.','Approvals do not skip processing or confirmation. Chat cannot authorise or confirm a group payment by itself.')
  ])
 ]},
 {id:'tomorrow-trap',index:4,title:'The tomorrow trap',kicker:'Chapter 05 · Where did it land?',emoji:'👛',description:'Promises, a cash repayment and one reference that should be counted once.',topicId:'expected',initial:{wallet:5000,committed:2000,cushion:1000,expected:4000},skills:['Keep expected money separate','Record the right money location','Confirm a repayment once'],ending:{strong:{title:'Right money. Right place.',body:'You kept promises, cash and confirmed Lumo records in their own places.'},mixed:{title:'Follow where it actually landed.',body:'The same amount can mean different things in cash, expected money and a payment balance. Try another route.'}},turns:[
  turn('kojo-promise','Kojo’s typing…','“Tomorrow, I promise.”','Kojo owes GH₵40. Today’s Lumo story wallet contains GH₵50, including commitments and a cushion.','A promise can be useful without becoming available money.',[
   move('expected-lane','Keep GH₵40 expected','Use today’s actual money for today’s plan.','💬',true,{flags:{expectedSeparated:true}},'The outlook stayed visible.','GH₵40 remains expected. The story wallet is unchanged by Kojo’s message.'),
   move('request-confirmation','Ask for the payment reference','Check a confirmed receipt before updating.','🔎',true,{flags:{expectedChecked:true}},'A useful next step, without an extra balance.','There is no confirmed receipt in this scene. Asking does not credit the story wallet.'),
   move('promise-shopping','Spend GH₵30 against the promise','Assume tomorrow will replace it.','🛍️',false,{spend:3000,flags:{promiseShopping:true}},'Tomorrow cannot replace it yet.','GH₵30 leaves the fictional wallet now. The expected GH₵40 has not arrived to cover today’s commitments.')
  ]),
  turn('cash-repayment','After lectures','Akosua offers GH₵30 cash.','This is a different repayment. She can hand over cash, but there is no transfer into Lumo.','Real money still needs the right location in the record.',[
   move('cash-location','Record it as cash','Keep it outside the Lumo payment balance.','👛',true,{flags:{cashLocated:true}},'The record says where it is.','The GH₵30 can be recorded as cash after it is handed over. It does not credit this story’s Lumo wallet.'),
   move('choose-transfer','Ask for a transfer instead','Wait for confirmation before recording it.','📲',true,{flags:{cashTransferRequested:true}},'You chose a different repayment route.','An offered transfer stays unconfirmed until it arrives. Nothing is added to the story wallet yet.'),
   move('cash-wallet','Treat the cash offer as Lumo money','Add it to what you expect to pay from in Lumo.','➕',false,{flags:{cashMislocated:true}},'That location does not match.','Cash and an offer are not a Lumo credit. The game keeps the payment wallet unchanged so the record stays factual.')
  ]),
  turn('receipt-once','Later · A screenshot arrives','A screenshot says “sent.”','Kojo shares an image for his repayment. The official transaction result is not confirmed in this scene.','A claim and the financial record are different things.',[
   move('match-once','Match the reference to a confirmed record','Update the IOU once the payment is confirmed.','🧾',true,{flags:{receiptMatched:true}},'One repayment, one confirmed record.','The screenshot alone changes no balance. Once the payment is confirmed, record its actual amount once.'),
   move('check-own-activity','Check my own payment activity','Look for the amount and final status.','🔍',true,{flags:{ownRecordChecked:true}},'You went to the source of truth.','There is no confirmed result in this scene. The expected amount remains outside the available wallet.'),
   move('image-proof','Mark it paid from the image','Use the screenshot as final confirmation.','🖼️',false,{flags:{screenshotAssumed:true}},'The image cannot finish the payment.','A member’s claim or screenshot is not a confirmed financial record. No fictional or personal balance is credited here.')
  ])
 ]},
 {id:'plot-twist-week',index:5,title:'Plot twist week',kicker:'Chapter 06 · Lux is in your corner',emoji:'🧭',description:'Allowance is late. Adapt the plan, protect essentials and find a useful next step.',topicId:'recovery',initial:{wallet:6000,committed:5500,cushion:500,expected:15000},skills:['Adapt a changed week','Let saving rules flex','Check the remaining gap'],ending:{strong:{title:'You found a way forward.',body:'You adapted the week, kept essentials in view and knew what needed confirmation or support.'},mixed:{title:'A reset is a money skill too.',body:'You reached the end of the run. Replay any chapter, seek a useful next step and keep your completed progress.'}},turns:[
  turn('late-reset','Allowance day · No receipt yet','The week needs a reset.','The GH₵55 plan includes GH₵40 of essentials and a GH₵15 optional club order. The allowance is still expected.','A changed week deserves a fresh plan, not a judgement.',[
   move('defer-club','Postpone the GH₵15 club order','Release the optional cost with the organiser.','🗓️',true,{release:1500,flags:{optionalDeferred:true}},'You changed a part that can move.','GH₵15 is released from the story plan. Food, transport and the cushion stay visible.'),
   move('agree-new-date','Ask the organiser for a new date','Get agreement before removing the optional cost.','💬',true,{release:1500,flags:{clubDateAgreed:true}},'The sample organiser agrees.','The GH₵15 optional order is moved to a later date in this story. This agreement does not predict what a real provider will offer.'),
   move('extra-spend','Buy GH₵25 of unplanned extras','Assume the allowance will catch up.','🛍️',false,{spend:2500,flags:{recoveryExtra:true}},'The delay is still here.','GH₵25 leaves the fictional wallet. The expected allowance has not arrived to fill the space it used.')
  ]),
  turn('saving-rule','A saving rule is due','Your goal still matters.','A GH₵10 saving rule would use money the week may need for essentials.','A useful rule can adapt. A saving amount does not decide your learning credit.',[
   move('pause-rule','Pause this occurrence','Review essentials before restarting the rule.','⏸️',true,{flags:{savingPaused:true}},'The rule made room for the week.','No saving transfer runs in this game. Your goal can stay while the rule takes a pause.'),
   move('review-rule','Adjust the future pace','Keep the goal and choose a rule that fits later.','🌱',true,{flags:{savingAdjusted:true}},'You kept the goal and changed the pace.','The rule is reviewed without moving any story or real money. The amount saved is not the skill being rewarded.'),
   move('badge-saving','Keep the rule just for a badge','Ignore whether essentials would be short.','🏅',false,{flags:{savingBadgePressure:true}},'The badge is not the priority.','A saving rule should not crowd out essentials. No transfer is made here; rewind to choose a pace that fits.')
  ]),
  turn('gap-check','A friend checks on you','What would make the gap covered?','Someone offers help and says a top-up is coming. There is still no confirmed receipt.','Start from what is confirmed, then compare it with the remaining costs.',[
   move('compare-gap','Check confirmed funds against the plan','Keep the remaining gap visible.','🔎',true,{flags:{gapCompared:true}},'You know what would change the picture.','A confirmed receipt and the costs still to cover determine the gap. An offer alone does not settle it.'),
   move('ask-support','Ask for practical support too','Discuss meals, transport or a changed date.','🤝',true,{flags:{supportExplored:true}},'Support can have more than one shape.','You can ask what help is available and update the plan around confirmed arrangements. Nothing is assumed or automatically received.'),
   move('gap-solved','Call the gap solved from the offer','Treat any promised top-up as enough.','🏁',false,{flags:{gapAssumed:true}},'An offer is not the full picture.','The amount, confirmation and remaining commitments still matter. Expected help does not increase the available story wallet.')
  ])
 ]}
]);
// Later scenes remember the route taken. The engine resolves the first matching flag.
const branches=(missionId,turnId,variants)=>{MISSION_BY_ID_TEMP.get(missionId).turns.find(t=>t.id===turnId).variants=variants;};
const MISSION_BY_ID_TEMP=new Map(CAMPUS_MISSIONS.map(m=>[m.id,m]));
branches('weekend-run','printing-surprise',[
 {when:'joinedDinner',title:'Dinner had its GH₵25. Now printing?',body:'You joined dinner with a cap. Now the course rep needs GH₵15 for your own copy, or GH₵10 for an agreed shared copy.',lux:'The dinner choice stays in the picture. Give this new cost a place too.'},
 {when:'afterDinner',title:'The hangout stayed. Here comes printing.',body:'Meeting after dinner kept that spend in the wallet. Your printing share is GH₵15, or GH₵10 for a shared copy.',lux:'The earlier choice left room. You still get to choose how this cost fits.'},
 {when:'unplannedNight',title:'The night used more room than planned.',body:'The sample night cost GH₵65. Printing now needs GH₵15, or an agreed shared-copy cost of GH₵10.',lux:'The earlier spend stays in this run. Try a current recovery route, or replay the chapter to change that night.'}
]);
branches('printing-plot','trip-plan',[
 {when:'fullQuote',title:'The full quote is on the table.',body:'You checked the extras: GH₵65 covers the full trip. Sharing a ride with Akosua changes your agreed total to GH₵60.',lux:'Pick the route that works for you. Both get the same skill credit when fully planned.'},
 {when:'headlineOnly',title:'The forty had company.',body:'The missing extras are now clear: GH₵15 binding and GH₵10 transport. Plan the full GH₵65 trip, or the agreed GH₵60 shared route.',lux:'You caught the extra costs before this reservation. Give the whole route a place.'}
]);
branches('printing-plot','final-bill',[
 {when:'sharedRide',title:'Your shared route is ready.',body:'You agreed a GH₵60 total with the shared ride. Check the final items and recipient against that route before authorising.',lux:'A shared ride changed the plan. The final bill should match what was actually agreed.'},
 {when:'ownTrip',title:'Your own collection route is ready.',body:'You reserved GH₵65 for your own trip. Check the final items and recipient against that route before authorising.',lux:'Your schedule had a fully planned route. The final bill still gets a check.'}
]);
branches('hostel-countdown','data-need',[
 {when:'weeklyPace',title:'Week one is reserved. Lectures still happen.',body:'GH₵40 is reserved for this week’s hostel pace. A GH₵15 bundle covers lectures, or GH₵10 works with the campus Wi-Fi route.',lux:'The hostel plan and study needs share one picture. Check the room before choosing.'},
 {when:'installmentCheck',title:'The hostel route needs agreement. Data needs a plan too.',body:'You asked about instalments before committing. A GH₵15 study bundle, or GH₵10 with campus Wi-Fi, is the next decision.',lux:'A request is not an agreed extension. Keep the hostel gap visible while planning this week.'}
]);
branches('counter-chaos','pending-loop',[
 {when:'wrongRecipientRisk',title:'One unchecked send. Now a spinner.',body:'A fictional GH₵20 already left without the name check. A separate existing payment is pending, with a reference but no final result.',lux:'This is a chance to change the next move. Follow this payment before starting another.'},
 {when:'recipientChecked',title:'The name check came first. Keep that clarity.',body:'You checked the recipient before any send. A separate existing payment now has a pending result and a reference.',lux:'The same care helps here: follow the existing reference, rather than reading pending as failed.'},
 {when:'recipientVerified',title:'You verified the person. Now follow the payment.',body:'The trusted contact route helped with the name. A separate existing payment now has a pending result and a reference.',lux:'A verified person and a confirmed payment result answer different questions.'}
]);
branches('tomorrow-trap','cash-repayment',[
 {when:'promiseShopping',title:'Tomorrow did not refill the wallet.',body:'The fictional GH₵30 spend already left. Akosua now offers a different GH₵30 repayment in cash, without a Lumo transfer.',lux:'A cash offer cannot repair the Lumo balance. Record the actual location once it arrives.'},
 {when:'expectedSeparated',title:'Kojo stayed expected. Akosua offers cash.',body:'You kept Kojo’s GH₵40 outside available money. Akosua now offers a different GH₵30 repayment in cash.',lux:'Two repayments can have different locations and statuses. Keep each one clear.'}
]);
branches('tomorrow-trap','receipt-once',[
 {when:'cashLocated',title:'Cash is recorded. Kojo sends an image.',body:'Akosua’s cash route is separate from the Lumo wallet. Official story activity now confirms Kojo’s GH₵40 repayment; his screenshot carries that same reference.',lux:'Cash has its own place. This official receipt credits the story wallet once; its screenshot does not create a second payment.'},
 {when:'cashTransferRequested',title:'A transfer was requested. Confirmation still matters.',body:'You asked Akosua for a transfer, which remains unconfirmed here. A separate official story receipt now confirms Kojo’s GH₵40, matching his screenshot reference.',lux:'Two people, two records. Kojo’s confirmed receipt credits the story wallet once; Akosua’s requested transfer still waits.'}
]);
branches('plot-twist-week','saving-rule',[
 {when:'optionalDeferred',title:'The optional order moved. Check the saving rule.',body:'You released the GH₵15 optional club cost. Review the GH₵10 saving rule against the essentials still to cover.',lux:'The changed plan has more room. You can still adjust the rule to fit this week.'},
 {when:'clubDateAgreed',title:'The organiser agreed a new date. Your rule can flex too.',body:'The sample organiser moved the GH₵15 optional order. A GH₵10 saving rule is the next thing to review.',lux:'An agreed change helped the plan. Keep the rule useful for the week you actually have.'},
 {when:'recoveryExtra',title:'The extras used GH₵25. Essentials still need room.',body:'The unplanned spend reduced the fictional wallet. A GH₵10 saving rule is now due while allowance remains expected.',lux:'You can rewind or adjust. A badge should not decide what happens to essentials.'}
]);
// An earlier risky night still has a useful current-scene recovery route.
const printingRecovery=MISSION_BY_ID_TEMP.get('weekend-run').turns.find(t=>t.id==='printing-surprise').choices.find(c=>c.id==='shared-copy');
printingRecovery.variants=[{when:'unplannedNight',label:'Ask the rep for an approved reference option',detail:'Agree a no-new-cost way to access the pages.',effect:{flags:{printingSupport:true}},outcome:{title:'A recovery route, agreed.',body:'The course rep agrees a reference arrangement in this story. No new cost is reserved, and the existing shortfall still needs attention.',tone:'clear'}}];

// This official sample event is applied once on entry, independently of the player's claim.
const confirmedRepayment=MISSION_BY_ID_TEMP.get('tomorrow-trap').turns.find(t=>t.id==='receipt-once');
confirmedRepayment.enter={receive:4000,expected:-4000,flags:{officialRepayment:true}};
confirmedRepayment.title='Official receipt. Same screenshot reference.';
confirmedRepayment.body='Story activity now confirms Kojo’s GH₵40 repayment. The screenshot he sends carries the same transaction reference.';
confirmedRepayment.lux='The confirmed record credits this fictional wallet once. An image of that same payment is not another payment.';
confirmedRepayment.choices=[
 move('match-once','Match it and settle the IOU once','Keep one confirmed repayment record.','🧾',true,{flags:{receiptMatched:true}},'One receipt. One credit.','The official sample receipt moved GH₵40 from expected to the story wallet on entry. Matching its screenshot adds no second credit.'),
 move('check-own-activity','Use the official activity record','Check the reference and final status.','🔍',true,{flags:{ownRecordChecked:true}},'You stayed with the confirmed record.','Kojo’s GH₵40 is now confirmed in this fictional wallet. The same reference is counted once, and expected money is reduced once.'),
 move('image-proof','Count the screenshot as another GH₵40','Add the image on top of the official receipt.','🖼️',false,{flags:{screenshotAssumed:true}},'Same reference, same payment.','There is one confirmed GH₵40 repayment. The game adds no second credit for an image of it; rewind to keep one clear record.')
];

// The final sample payment follows the collection route actually chosen.
const settleBill=MISSION_BY_ID_TEMP.get('printing-plot').turns.find(t=>t.id==='final-bill').choices.find(c=>c.id==='match-bill');
settleBill.label='Check and settle the sample bill';
settleBill.detail='Match the full cost and recipient, then follow the fictional confirmed result.';
settleBill.effect={flags:{billChecked:true}};
settleBill.outcome={title:'The agreed route determines the payment.',body:'This is a fictional confirmed payment inside Campus Run. Your actual Lumo accounts are unchanged.',tone:'clear'};
settleBill.effectVariants=[
 {when:'ownTrip',effect:{spend:6500,release:6500,flags:{billChecked:true}}},
 {when:'sharedRide',effect:{spend:6000,release:6000,flags:{billChecked:true}}},
 {when:'missingExtras',effect:{commit:2500,spend:6500,release:6500,flags:{billChecked:true}}}
];
settleBill.outcomeVariants=[
 {when:'ownTrip',title:'Your GH₵65 sample bill is confirmed.',body:'The fictional payment uses the GH₵65 reserved for your own trip. The same reservation is released, so it is not counted again as money still committed.',tone:'clear'},
 {when:'sharedRide',title:'Your shared-route GH₵60 bill is confirmed.',body:'The fictional payment follows the agreed shared ride. GH₵60 leaves the story wallet and its GH₵60 reservation is released once.',tone:'clear'},
 {when:'missingExtras',title:'You caught the extras before settling.',body:'The plan adds the missing GH₵25, then the fictional GH₵65 payment is confirmed. Its reservation is released once; the full bill is counted once.',tone:'clear'}
];

const endingBranches={
 'weekend-run':[{when:'printingSupport',title:'You found a current recovery route.',body:'The course rep agreed a reference arrangement after the earlier spend. That support avoids a new printing cost; it does not erase the existing shortfall.'},{when:'afterDinner',title:'Same friends. Your own route.',body:'You chose the after-dinner hangout. The money picture remembers that route; the stars show the skills you practised along it.'},{when:'joinedDinner',title:'A capped night, a clearer week.',body:'You set a limit for dinner, then worked through a printing surprise and Kojo’s promise. Your choices shaped the week.'}],
 'printing-plot':[{when:'sharedRide',title:'The project took the shared route.',body:'The shared-ride plan changed the full cost. Your final checks determine how clear the submitted project’s trail became.'},{when:'ownTrip',title:'Your collection route had its own plan.',body:'The solo trip used its fully planned total. Different affordable routes earn the same skill credit when the full costs are considered.'}],
 'hostel-countdown':[{when:'hostelSupport',title:'You started the conversation early.',body:'You opened a support route before the deadline. The next step still depends on actual agreements and confirmed funding.'},{when:'weeklyPace',title:'A date became a weekly route.',body:'Your first week had a reservation. Keep checking the study costs and confirmed funding as each next week arrives.'}],
 'counter-chaos':[{when:'pendingSupport',title:'The reference went with the question.',body:'You used the official support route for the pending payment. The payment’s final result still has the last word.'},{when:'pendingFollowed',title:'You followed one payment trail.',body:'You stayed with the existing reference. That habit helps the next time a waiting screen meets a busy counter.'}],
 'tomorrow-trap':[{when:'cashLocated',title:'Cash found its own place.',body:'You kept the cash route separate from Lumo. Continue matching expected money and repayment claims to their own confirmed records.'},{when:'cashTransferRequested',title:'You chose a different repayment route.',body:'Requesting a transfer gave the repayment a route, not an automatic balance. Confirmation and the correct reference still finish the picture.'}],
 'plot-twist-week':[{when:'supportExplored',title:'You looked for more than one way forward.',body:'A changed date, practical help or confirmed funding can each matter. Your plan stays grounded in what is actually agreed and received.'},{when:'savingPaused',title:'The goal stayed. The rule took a pause.',body:'You made space to review this week. Completed progress stays yours, and the saving pace can change with life.'}]
};
for(const [id,variants] of Object.entries(endingBranches))MISSION_BY_ID_TEMP.get(id).ending.variants=variants;

export const CAMPUS_REWARDS=Object.freeze([
 {id:'lime-trail',title:'Campus spark',emoji:'✦',threshold:3},
 {id:'orbit-trail',title:'Lux orbit',emoji:'◌',threshold:8},
 {id:'star-trail',title:'Clarity constellation',emoji:'✧',threshold:14}
]);
export const MISSION_BY_ID=new Map(CAMPUS_MISSIONS.map(mission=>[mission.id,mission]));
