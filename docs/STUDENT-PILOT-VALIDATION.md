# Student pilot: does Lumo help a useful decision?

This is a test plan, not a report of student results. Keep it outside the customer flow. The prototype uses sample money, simulated verification and simulated payments.

## Set up the sessions

- Run an exploratory round with 6–8 students, including students unfamiliar with Lumo. Include different phones, confidence with money and accessibility needs. This sample can reveal problems; it cannot establish population-wide success rates or superiority over another app.
- Allow about 35–45 minutes each. Start half in Everyday Edition and half in Minna Edition. Record edition and build. If someone tries both, distinguish their first attempt from their learned second attempt.
- Use separate disposable demo accounts. Provide only the sample verification details they need, available in the existing Ambassador guide. Never use real Ghana Card details, account credentials or money. Save any wanted feedback before an explicit sample reset.
- Ask permission for notes and any optional recording. Use participant IDs such as P01. Do not collect names, personal balances or transaction histories in the observation sheet. Agree who may access observations and when recordings will be deleted.
- Open from the existing preview entry. For the unaided tasks, do not show the Ambassador guide's walkthrough beforehand. Its **Leave feedback** and **Download saved feedback** controls remain available afterwards through **You → Ambassador guide** in the ambassador preview.

Facilitator introduction: “We are testing Lumo, not you. Use the sample information. Try each task in your own way. Tell us what you expect to happen. You can stop at any time.”

Do not teach the meaning of Budget or Pause before observing it. If a student is stuck, first ask “What are you looking for?” Record any further help and the point where it became necessary.

## Tasks and what to observe

Read only the task column aloud. The observation column is for the facilitator.

| Task | Observe and verify |
|---|---|
| **1. Set up without an ambassador.** “Use the sample details to get Lumo ready. You have sample money for the coming week.” | Can the student finish account setup, find funding and recognise simulation? Can they explain Everyday money and Money Boxes without reciting account architecture? Record help and time to first useful Budget result. |
| **2. Build one believable Budget.** “You expect to spend GH₵25 on food each day for seven days. Put that into your Budget.” | Can they find the optional estimator or enter GH₵175 directly? Both are valid. Ask what the total covers and whether saving the Budget paid anyone. Test leaving and resuming once; do not reward a particular route. |
| **3. Ask about a specific item.** “Find out what remains in Food, then change its total to GH₵300 using Chat.” | Distinguish the Food amount from money left after the whole Budget. The proposed edit must identify Food, show its consequence and remain editable. Nothing changes until Save. Confirm returning to the conversation retains its context and unsent text. |
| **4. Answer Chat naturally.** “Ask how long your money will last. Respond to any question it asks you.” | Use a fixture without an allowance date. Can the student provide/select a date and recognise any interpreted calendar date? Lumo must not treat expected allowance as received money or promise a runway without the required costs and dates. |
| **5. Consider a purchase.** “You are thinking about this purchase. Use Lumo to decide what you want to do.” | Use the controlled shortfall below. After the student reads the Pause, ask “What would change?” and “Has anything been paid yet?” Let them choose edit, continue, defer or cancel. A well-understood decision to continue is valid. |
| **6. Help Lumo understand a payment.** “Lumo says one of today's payments needs a category. Put it where you think it belongs.” | Count from opening the Home insight to saved correction. A visible suggested category should save in one tap within the story sheet. Something else and Not now must work. Correction changes categorisation only, never account money or Budget fulfilment. |
| **7. Make an everyday payment.** “Pay for this sample lunch / printing / transport / data purchase.” | Vary contexts across participants. Meals, printing and transport use supported Campus Pay merchants; data uses the existing top-up flow. Exercise QR/code alternatives and recent/favourite recipients where relevant, a linked Budget cost and an extra purchase. Check merchant, amount, source, keyboard reachability and separate approval. Scan completion must never look like payment completion. |
| **8. Handle uncertainty.** “The sample payment is pending. Find out what to do next.” Then show a failed result in a fresh case. | Can they follow the original reference, find help and avoid another payment while pending? Can they distinguish failed from pending and confirmed? Repeat taps must not duplicate a submission. A recoverable failure should retain the intended details. |

After task 5, ask these neutral questions without giving the expected answer:

1. “What did the moving money and ring mean to you?”
2. “What did you understand from the comparison?”
3. “What would happen if you continued?”
4. “Was this interruption useful for this decision? Why?”

Ask the same relevance question for a covered purchase that receives an existing behavioural warning. Do not change the trigger rules for the study. Keep ordinary payments free of research questionnaires.

## Controlled financial cases

Prepare and verify these isolated cases before their tasks; reset between cases. Do not assume the bundled sample account has these exact values. Never overwrite a student's personal records.

Starting fixture: GH₵500 available Everyday money; Food GH₵350 still to cover; GH₵100 already in a Money Box; GH₵150 left after Budget. Savings has already left Everyday money and must not be deducted again.

| Case | Expected consequence before approval / confirmed result afterwards |
|---|---|
| Extra GH₵80 | GH₵420 Everyday money; Food GH₵350; GH₵70 left after Budget. |
| Extra GH₵140 | GH₵360 Everyday money; Food GH₵350; GH₵10 left after Budget. |
| Extra GH₵280 | GH₵220 Everyday money; Food GH₵130 short. Money Box stays GH₵100. |
| GH₵80 linked to Food | GH₵420 Everyday money; Food GH₵270 remaining; GH₵150 left after Budget. |

Before authentication, these are projections only. For pending, failed and cancelled cases, use the existing transaction-state rules rather than treating a projected balance as a completed debit.

Also prepare one saved, unpaid dated cost for tomorrow and one optional weekly review missed until the following day. Check the Home/update action uses the correct item and dates, does not invent income and does not create repeated catch-up reviews.

## Record observations

One row per task; do not record only a final satisfaction score.

| Participant / edition / build / device | Task | Unaided, helped or stopped | Elapsed time | Taps | Required scrolls / keyboard obstruction | Expected vs understood outcome, in their words | Defect / severity |
|---|---|---|---:|---:|---|---|---|
| P__ / __ / __ / __ | __ | __ | __ | __ | __ | __ | __ |

Count a tap when it activates a control. Record field focus and text entry separately; do not mix them into an action-count comparison. Mark optional detail viewing separately from scrolling needed to reach a main action. Separate time choosing from time blocked by the system. Note returned/dismissed sheets, lost values and requests for help.

For the Pause, preserve the approved sequence: effects appear at the ring after 900 ms; then at least three visible reading seconds; then the 90 ms hold before separate authentication. Reduced motion preserves the explanation and minimum reading period. Time in the background must not count towards approval readiness. Observe comprehension and relevance; do not treat waiting, more cancellations or more continuing as evidence of benefit.

Existing local `pauseEvents` record exposures and edit/continue/cancel/defer reactions with draft IDs. With the participant's agreement, authorised testers may export the existing response log and relate it to the matching demo outcome. It is local prototype evidence, not new production telemetry. Combine it with observations because an event cannot establish understanding. Export the existing feedback separately; it is not a complete session record.

## Decide what to fix

- Report counts such as “5 of 8 completed unaided,” alongside the observed explanation and task context. Do not imply statistical certainty.
- Treat an incorrect financial conclusion, premature success, payment without approval, duplicate debit or lost recoverable input as a release blocker. Inspect and retest the cause.
- Prioritise repeated misunderstandings of item vs whole Budget, expected vs received money, pending vs completed and Budget vs savings.
- For the quick category path, verify one tap saves a displayed suggestion after opening the story. Log longer fallback paths separately. For payments, count entry/review-or-Pause/authentication stages separately from recipient navigation and optional detail.
- After fixes, rerun affected tasks with students who have not learned the earlier route. Evaluate whether they can explain the consequence and complete the task without facilitator directions. Keep negative feedback and justified exceptions visible in the report.

## What this cannot prove

Browser tests and this plan do not prove student comprehension until sessions occur. Synthetic keyboard space does not prove behaviour on physical Android/iOS keyboards. Camera permission, real QR conditions, screen readers and native biometrics require device checks; prototype biometrics remain simulated. The small demo merchant directory cannot prove real merchant acceptance, network/provider availability, settlement, live funding or support response. Validate those operational dependencies in a separately authorised real-service pilot before making reliability or coverage claims.
