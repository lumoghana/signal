# Onboarding, access, account and support review

Review date: 27 October 2026. Phase 1 source audit, two design passes and Phase 2 visual review. Application changes were authorised after Phase 2; Phase 3 is recorded below.

## Scope and evidence

53 route IDs were reviewed individually below. Compatibility aliases are listed separately, although they share one surface. The shipped Everyday script order was inspected, including the later welcome, account, native confirmation, guidance and notification adapters. The shared `onboarding.js` and `account.js` files match byte-for-byte in Everyday, Minna and Hibiscus. Phase 2 below records direct browser screenshot inspection in all three editions. This document does not claim measured contrast or completed implementation.

The source review was checked against a mounted production-script harness. The bounded reproduction returned no runtime errors and confirmed:

- After sign-out, the welcome page still leads with Get started and the sample Pause instead of Sign in.
- `profileEdit`, `profilePhone`, `changePin`, `dataExport`, `statements` and `supportCase` contain no HTML form, so their single-task controls lack native submit semantics.
- Preparing a data export clears the PIN field; downloading it then requires a second PIN entry.
- A closed report still offers Save update; saving changes its status from Resolved to Saved on device without an explicit reopen choice.
- A sign-in warning still says 30 seconds after the fake clock advances 31 seconds. The underlying lock expires correctly; the presentation is stale.

The harness is a behavior model, not a browser layout engine. Findings below distinguish confirmed behavior from layout candidates for root inspection.

## Quality direction after two design passes

The first pass explored shorter flows, lighter copy, clearer field feedback and fewer steps. The second pass challenged shortcuts against truth, authorisation, resumability and the user's existing decisions. The resulting direction is:

1. Keep a stable task structure: clear task title, necessary current context, labelled inputs, one primary action, a predictable exit and concise feedback.
2. Let returning customers resume the right job. Welcome should recognise a saved account. A timer should visibly finish. A closed report should remain closed until the customer deliberately reopens it.
3. Use native form submission for single-task forms, with the same existing controller and validation. Associate field errors with the field that needs correction.
4. Keep important disclosures readable without making every screen a long disclaimer. The recently shipped lower About guidance already addresses repeated static education and should be preserved.
5. Keep sample capabilities honest. A polished visual layer must not imply live identity checking, support delivery, push messages, external sessions or bank connections that do not exist.

## Priority findings and implementation candidates

### A1. Returning welcome has the wrong primary action — P1, confirmed

`compact.js:83–85` composes the current welcome buttons. It checks saved unfinished setup, but does not prioritise `state.onboarded`. `getting-started.js:9–17` changes the presentation without correcting those actions. A customer who signs out (`account.js:35`) is sent to Welcome and sees Get started, I already have Lumo, and Skip example and sign up. Get started routes through the sample Pause even though the account exists.

**Proposed change:** use three explicit entry states. New customer: Get started. Unfinished setup: Continue setup. Existing account: Sign in when locked, Continue to Home when already open. Keep the sample account and sample Pause as secondary preview choices. Preserve existing signup and sign-in controllers, Home privacy defaults and no automatic payment continuation.

**Acceptance:** explicit sign-out leads to a primary Sign in action; an unfinished signup still offers its saved setup; a fresh customer still reaches the agreed Pause intro and signup. No account data is reset by these entry choices.

### A2. Sign-in lock feedback is frozen — P1, confirmed

`onboarding.js:355–358` calculates the lock countdown when the view renders. Unlike the OTP timer at `onboarding.js:283–298`, it does not update the visible countdown or button state. A user who waits the requested 30 seconds still sees Try again in 30s until another action causes a render. The controller at `onboarding.js:224–242` correctly enforces the stored lock.

**Proposed change:** a small in-place countdown with a stable status node and disabled Sign in action while locked; on expiry, enable the existing submit action and announce that the customer can try again. Do not rerender the form, clear typed values, reset attempts, auto-submit or alter lock duration.

**Acceptance:** countdown reaches zero without another tap, values and focus survive, timers stop on leaving, and invalid PIN attempts still follow existing lock rules.

### A3. Account forms do not behave like the signup forms — P1, confirmed

`account.js:69–83` emits controls and onclick buttons inside a stack, without forms for the six single-task routes reproduced above. Signup uses actual `<form onsubmit>` structures. This creates inconsistent keyboard Done/Enter behavior and makes these screens feel like a website assembled from buttons rather than one consistent application. Most account validation errors also omit the existing `fieldId` argument, despite `core.js:28` already supporting `aria-invalid`, error association and focus.

**Proposed change:** wrap only genuine single-submit tasks with a form using their existing handler. Use the same action for tapping the main button and keyboard submission. Add specific field IDs to validation errors: display name, handle, email, phone/code, PIN confirmation, statement range and report description. Preserve native confirmation wrappers and sensitive-field handling.

**Do not:** make a list of session actions one form that could end the wrong session, or make a generic Enter key listener invoke any visible button.

### A4. Closed reports are editable without an explicit reopen — P1, confirmed

`account.js:82` renders Add an update and Save update regardless of status. `replyCase` at `account.js:44` changes a resolved report back to Saved on device. The page also offers a separate Reopen report button, so two different reopening mechanisms coexist and the first is implicit.

**Proposed change:** show the saved record and conversation read-only when closed, with one clear Reopen report action. After reopening, show the update form again. Keep the report reference, original description, local-only delivery status and return-to-task context. Do not imply a real support submission.

**Acceptance:** Save update is unavailable on a closed report; reopening preserves history and changes only that report; returning to the originating payment does not change its state.

### A5. Record downloads contain avoidable double authorisation friction — P2, confirmed

`account.js:39–42,75,79` splits Prepare and Download into separate actions, each requiring PIN. Preparing rerenders the view, and secure draft handling clears the field. The data export's final `downloadData()` method already authenticates and builds the current export directly; `tests/virtual-cards.test.cjs:159` also uses that authenticated final method. Statements require a prepared range and need a more careful single-action design review.

**Proposed first increment:** make data export one Download my data form using the existing final authenticated method. Clearly identify file type and included records. Keep PIN exclusion and all account/card export adapters intact. For statements, keep the date range prominent and design one customer-intent Download action, with existing date validation and fresh authorisation preserved. Do not create a reusable cached PIN or persistent authorisation grant.

**Second-pass caution:** a clearer two-step design is preferable to weakening either guard. If statement composition cannot be safely simplified within this pass, retain it and make the preparation/download states explicit rather than silently bypassing validation.

### A6. Support context is a reference, not a recognisable task — P2, source-confirmed

`account.js:19–20,81–82` captures reference, kind, amount, date and status, then puts the related record behind a closed details element. It omits the transaction's name. A customer reporting a payment may not recognise an opaque reference and has to expand the record before confirming the amount and status.

**Proposed change:** a compact context line naming the payment and showing its amount/status, with reference/date in expandable details. Preserve the original immutable reference and return parameters. Keep the report textarea as the next main action rather than moving all receipt data into it.

### A7. Detail review can be made lighter without concealing verified data — P2, browser candidate

The approved identity review at `onboarding.js:308–312` contains three read-only identity rows, a phone correction row, university, required email and an optional address field, plus progress, notice, title and actions. It is necessarily more substantial than the phone/PIN steps.

**Proposed change:** keep the identity facts and university/email visible. Put a blank optional address behind Add address (optional), opening it when an address is already present. Keep the input mounted with its existing ID and draft behavior. Use University consistently in edit/setup progress labels instead of switching between Campus and University (`onboarding.js:336,352`). Root must confirm small-phone hierarchy before any compression.

**Rejected alternative:** hiding all verified details or making authoritative name/Ghana Card/date-of-birth fields editable. The existing read-only design and correction route are deliberate and tested.

### A8. Settings labels should distinguish real preview behavior from saved preferences — P2, source-confirmed

`account.js:71` labels a row Face or fingerprint with Not available in this preview. The callback specifically means biometric sign-in, while payment authorisation has a separate labelled biometric demo in `biometric-auth.js:35–44`. Rename the settings row to Biometric sign-in so this distinction is clear.

The personalisation switch in `account.js:74` changes a stored preference; no other shipped source reads that flag. Marketing and Chat update switches are also saved preferences without connected external delivery. The page's local-only disclosure is useful, but a switch should not imply it has changed a live service. Keep working in-app Plan and Money update preferences distinct from unconnected delivery choices. Resolve this through truthful labels/availability, not by switching off core payment calculations or inventing a connection.

### A9. Unchanged status checks need an acknowledgement — P2, source-confirmed

Identity, application and recovery Check status controllers (`onboarding.js:154–164,212–215,258–263`) can rerender an unchanged result with no visible acknowledgement. Their pending pages correctly retain a reference and exit. Add a concise Still in review response or local Last checked indicator, with a polite announcement, so customers know the tap worked. Do not invent turnaround promises, push notifications or provider progress.

### A10. Ambassador guidance is a reading task rather than a usable test companion — P2, source-confirmed

`ambassador.js:15–26` provides nine useful tasks in one long list, without per-task start actions. The separate tester guide (`app.js:66`) has Try this actions, producing two styles of test guidance. Keep the sample details and replacement warnings. Use a short task list with expandable detail and eligible Start task actions, making signup/account-loaded prerequisites clear. This is a preview companion, so it should not intrude into the ordinary You menu outside ambassador/test mode.

## Screen-by-screen review

Legend: **keep** means no app behavior change recommended from this audit; **refine** means a concrete improvement above; **inspect** needs root visual confirmation. Source line references describe the active owner or its relevant adapter, rather than an earlier overwritten view.

### Signup and access

| Route | Purpose and main action | First-time review | Returning review | Decision and evidence |
| --- | --- | --- | --- | --- |
| `welcome` | Explain Lumo and start signup | Clear value, sample boundary and optional sample account; agreed Pause remains available | Existing-account state still shows signup-first actions | **Refine A1.** `compact.js:83–85`; `getting-started.js:9–17` |
| `setupChoice` | Resume or replace unfinished setup | Appropriate only when prior progress exists; replacement consequence is stated | Continue is primary and preserves the setup | **Keep.** Consider less prominent Start again; do not reset on ordinary Back. `onboarding.js:272–274` |
| `phone` | Capture Ghana mobile number and continue | Country code, national-number example, privacy route, sample boundary and labelled form are clear | Saved draft and purpose-specific wording support resume/recovery | **Keep.** Source accepts local and +233 variants; no new number format policy. `onboarding.js:275–282` |
| `otp` | Confirm six-digit code | Correct number shown with Change number; sample code is explicit | Live resend timer, expiry and attempt lock already implemented | **Keep.** Preserve timer/input identity and no SMS claim. `onboarding.js:283–301` |
| `identity` | Acknowledge sample identity check | Mandatory acknowledgement and explanatory notice are clear | Saved acknowledgement can be reviewed; no real identity captured | **Keep required consent.** Pure preview bridge can be visually lighter, not silently bypassed. `onboarding.js:302–304` |
| `livecheck` | Continue the sample verification outcome | Camera stays off is explicit; the screen collects no additional input | A separate Continue can feel repetitive | **Inspect.** Preserve its simulation meaning and actual provider-state outcomes; do not show a fake successful camera scan. `onboarding.js:305–307` |
| `identityResult` | Review authoritative identity and enter university/email | Important facts visible, non-Legon notice allows continuation, correction path present | Pending/linked/refused states retain references and specific recovery actions | **Refine A7/A9.** Optional address disclosure; keep verified data read-only. `onboarding.js:308–316` |
| `campus` | Enter university/email on legacy or correction path | Uses University labels and permits non-Legon signup | Drafts and pilot notice retained | **Keep compatibility.** Default signup collects these in identity review. `onboarding.js:317–319` |
| `campusStatus` | Compatibility alias of university form | Does not expose an obsolete eligibility gate | Saved older routes remain usable | **Keep alias, do not create a new page.** `onboarding.js:320–322` |
| `pilotUnavailable` | Compatibility alias of university form | No false blocked university state | Existing saved link can continue | **Keep alias.** `onboarding.js:320–322` |
| `campusInterest` | Compatibility alias of university form | No extra waitlist collection | Older draft can prefill current fields | **Keep alias.** `onboarding.js:320–323` |
| `campusInterestSaved` | Resume an older interest draft | Clear Continue setup and edit university action | Explicitly routes back into current setup | **Keep, low-frequency compatibility.** `onboarding.js:324–327` |
| `pin` | Choose a six-digit signup/reset PIN | Clear label, numeric keyboard, password masking and preview warning | Recovery uses a different heading; PIN is never retained as an ordinary draft | **Keep security rules.** Inspect comfortable mobile input and keyboard fit. `onboarding.js:328–331` |
| `confirmPin` | Confirm the chosen PIN | One clear Save PIN action; choose-different option | Mismatch clears only confirmation, preserving deliberate retry | **Keep.** Do not remove confirmation for speed. `onboarding.js:332–334` |
| `accountReview` | Confirm final details and consent | Details, edit actions, mandatory agreement and optional product updates are distinct | Choices survive opening notices; no duplicate account creation | **Refine University terminology only.** Keep terms consent. `onboarding.js:335–337` |
| `applicationStatus` | Follow pending/more-information/refused application | Clear status-specific next action and stable reference | Check status lacks unchanged-result acknowledgement | **Refine A9.** Do not invent provider SLA. `onboarding.js:338–342` |
| `applicationCorrection` | Correct university/email without restarting | Scope of retained checks is stated | Saved corrections retain the application reference | **Keep.** Use normal field errors and no full restart. `onboarding.js:343` |
| `accountReady` | Confirm completion and add money | Strong single Add money action, optional Explore Home, no account-number clutter | Guard prevents unapproved/locked ready state | **Keep.** This is a successful onboarding payoff. `onboarding.js:344–349`; `tests/account-onboarding.test.cjs` |
| `setupProgress` | Resume first incomplete step | Five clear completion rows and one Continue action | Completed checks remain saved | **Refine Campus→University label.** No need to make every finished row a competing action. `onboarding.js:350–354` |
| `signin` | Unlock the saved account | Empty-local-account state needs a clear explanation and start path | Saved number is prefilled, but lock countdown is stale | **Refine A2/A3.** Keep successful sign-in to Home with balances hidden. `onboarding.js:355–359,224–242`; `tests/signin-home-privacy.test.cjs` |
| `recovery` | Choose PIN or phone recovery | Two plain choices; saved request can be resumed | Existing recovery appears as Continue recovery | **Keep.** Do not add a new account path here. `onboarding.js:360–364` |
| `recoveryReplacement` | Start number replacement | Same-account promise and made-up-number boundary are clear | Can leave and resume the request | **Keep.** Continue into the existing phone/OTP ownership path. `onboarding.js:365–367` |
| `recoveryOwnership` | Confirm sample ownership outcome | Clearly says no documents/camera are used | Stable saved recovery context | **Keep mandatory check.** Do not replace with a decorative fake verification. `onboarding.js:368–370` |
| `recoveryStatus` | Follow pending/unconfirmed ownership | Help and leave actions are clear | Check status needs an acknowledgement | **Refine A9.** Preserve reference and provider-state semantics. `onboarding.js:371–374` |
| `privacyNotice` | Read preview privacy/terms | Short top boundary plus separate information sections is useful | Content stays available; Back restores the originating task | **Keep legal/preview copy.** It is intentional reading, not recurring decorative education. `onboarding.js:375–382` |

### Account, settings and support

| Route | Purpose and main action | First-time review | Returning review | Decision and evidence |
| --- | --- | --- | --- | --- |
| `more` | Find account/settings/help | Six destinations have clear names; actual customer identity stays visible | Predictable navigation, sign-out at bottom | **Keep primary structure.** Home/navigation reviewer owns visual hierarchy. `focus.js:98–101` |
| `profile` | Read display/account contact details | Separates Edit profile from phone correction | Most static intro already collapses through page guidance | **Keep.** Retain masked phone and verified identity correction route. `account.js:68` |
| `profileEdit` | Edit name/handle/email | Labels and limits exist; discard is branded | Keyboard submit and field-level validation inconsistent | **Refine A3.** Preserve drafts and explicit discard. `account.js:30,69`; `native-decisions.js:56–58` |
| `profilePhone` | Change phone with PIN and sample confirmation | Required fields exist but phone/code error focus is global | No native form submit; re-entry should be predictable | **Refine A3.** Keep PIN + confirmation gates and sample code disclosure. `account.js:32,70` |
| `security` | Reach PIN, devices and recovery | Security advice is useful; biometric availability label is broad | Fast menu is appropriate | **Refine A8 label.** Biometric sign-in is unavailable; payment demo is separate. `account.js:71`; `biometric-auth.js:35–44` |
| `changePin` | Enter current/new/confirmation PIN | Correct numeric masking and explicit labels | No form submit; mismatch clears confirmation without focusing it | **Refine A3.** Keep all validation and sensitive draft exclusions. `account.js:33,72` |
| `devices` | Review current/local sessions | Clearly identifies this device and local-only scope | Other sessions shown only for test scenarios; end-session confirmation is branded | **Keep.** Do not imply connected cross-device sessions. `account.js:73`; `native-decisions.js:55` |
| `privacy` | Set preferences and access data tasks | Controls are labelled; deletion and closure correctly separated | Personalisation flag has no effect beyond saving itself | **Refine A8 capability labels.** Never suppress operational payment facts because a marketing preference is off. `account.js:12,37,74` |
| `dataExport` | Download local account records | Included data and PIN exclusion are stated | Prepare then Download requires PIN twice | **Refine A5/A3.** Prefer existing authenticated final download action. `account.js:39–40,75`; `product-accounts.js:57–64` |
| `notificationPrefs` | Choose optional update categories | Working in-app preferences and unconnected delivery should be distinguished | Fast On/Off actions; repeated education already lower | **Refine A8 wording.** Keep account notices accessible. `account.js:76`; `daily-insights.js:160–161` |
| `dailyUpdatePrefs` | Choose review time, quiet hours and privacy | Actual form and Ghana-time meaning are clear | Cancel/save clear draft; quiet/review controls remain usable | **Keep.** Consider disabling irrelevant time controls visually when toggles are off only if values remain retained. `daily-insights.js:162–178` |
| `accountInfo` | Read two account identities and copy details | Two accounts are truthful but competing numbers need clear emphasis | Copy remains available, account tools are easy to find | **Inspect priority.** Everyday receiving account should read as the main funding destination; keep separate Savings identity and warning. `product-accounts.js:33–35`; `experience-clarity.js:77–80` |
| `accountTerms` | Read sample fees, limits and terms | Placeholders are honest; no fabricated provider terms | A deliberate information destination, not a daily task | **Keep facts.** Clarify limit scope if visual review finds sale vs personal-payment ambiguity. `account.js:78` |
| `statements` | Choose dates and download CSV | Range and demo-file limitation are clear | Prepare/Download state and duplicate PIN work can be streamlined | **Refine A5/A3 carefully.** Keep date checks and fresh authorisation. `account.js:41–42,79` |
| `help` | Choose topic, see saved reports or return to task | Topic choices are useful; saved reports and unconnected support must stay truthful | Contextual Return to task preserves workflow | **Refine A6 companion context.** Avoid marketing wording that implies a live agent. `account.js:80` |
| `supportCase` | Describe a problem with related record | Related record is opaque/collapsed and omits the payment name | No native form submit; errors should point to the description | **Refine A3/A6.** Keep no-PIN and local-save boundary next to action. `account.js:19–20,43,81` |
| `caseDetail` | Read/update or close/reopen a saved report | Clear local-only status and report reference | Closed reports still allow an implicit reopening update | **Refine A4.** Explicit status lifecycle, preserved history/context. `account.js:44–46,82` |
| `closeAccount` | Resolve blockers, then request closure | Blockers, record download and consequence acknowledgement are clear | Closing/Closed states retain records and cancel-request path | **Keep rules.** Inspect consistency of Close account/Close accounts labels; never hide blockers for a cleaner page. `account.js:47–50,83`; `product-accounts.js:37–40`; `virtual-cards-payments.js:163–164` |
| `notifications` | Read current money/account updates | Pending and Budget attention stay visible; private previews supported | Mark all read and dated history are useful | **Keep working behavior.** Current status remains available during quiet hours. Home/Story reviewer owns this page too. `daily-insights.js:155–159` |
| `dailyAccountNotice` | Read a saved important notice | Plain title/body and Done are appropriate | Must remain reachable after marking read | **Keep.** Do not place important notice content in dismiss-once education. `daily-insights.js:145–146` |

### Ambassador and test companion

| Route | Purpose and main action | First-time review | Returning review | Decision and evidence |
| --- | --- | --- | --- | --- |
| `ambassadorWelcome` | Introduce student preview and choose entry | Clear sample boundary and start-from-signup choice | Continue my Lumo appears when a sample account exists | **Keep**, inspect action density/illustration balance; do not replace ordinary welcome. `ambassador.js:11–12` |
| `ambassadorReset` | Confirm replacing the local sample | Data-removal consequence and optional feedback export are explicit | Should visually match other destructive confirmation styling | **Refine consistency only.** Keep distinct Keep account exit. `ambassador.js:13`; compare `app.js:68` |
| `ambassadorSample` | Explain/loading the lived-in sample | Existing balance split, Budget math and sample PIN are useful | Replacement warning prevents accidental progress loss | **Keep.** This is a deliberate confirmation; do not auto-load on entry. `ambassador.js:14` |
| `ambassadorGuide` | Help participants run scenarios | Useful details, but nine long tasks require memory and scrolling | No per-task start action; two different guides coexist | **Refine A10.** Use expandable tasks and eligible start actions. `ambassador.js:15–26` |
| `testing` | Detailed tester controls and session export | Appropriate for explicit test mode, not primary student flow | Scenario shortcuts and exports are useful | **Keep mode boundary.** Consolidate guide structure without exposing tester controls in ordinary app. `app.js:65–66`; `core.js:62` |
| `feedback` | Save a usability note and download it | Local-only delivery is clear; score plus free text is sufficient | New note clears fields and shows latest three; file download contains all notes | **Refine A3 error focus and submission consistency if needed.** It already has a root submit form adapter. `app.js:69–75` |
| `sampleConfirm` | Confirm replacement with a sample account | Clear existing-progress warning and keep-current exit | Redundant with ambassadorSample, but only tester route | **Keep compatibility.** Harmonise wording/styling, not another new route. `app.js:67` |
| `resetConfirm` | Confirm local reset or export first | Clear destructive choice and safer exit | Existing export-first option is valuable | **Keep.** Do not weaken explicit replacement confirmation. `app.js:68` |

## Second-pass decisions: changes deliberately not recommended

- Do not remove mandatory identity, privacy, terms or recovery confirmation to hit a step-count slogan. The pending/failed/recovery branches need coherent treatment, not only the happy path.
- Do not make verified legal identity fields freely editable. Display-name editing and correction support already serve different purposes.
- Do not restore an old payment directly into authorisation after signing in. The tested Home return and hidden balances are intentional safeguards.
- Do not report native browser confirmation dialogs as a current defect: `native-decisions.js:17–58` already replaces those gates with branded choices while retaining validation and sensitive fields safely.
- Do not blanket-hide subtitles or explanatory paragraphs. Current amounts, account identity, report status, privacy consent and simulation boundaries can use the same HTML classes as ordinary introduction text.
- Do not force all screens into a fixed no-scroll frame. A reviewed identity, legal notice, report thread or closure checklist needs accessible reading space. Root should check first-fold actions, scroll ownership and keyboard reachability at small sizes instead.
- Do not add simulated live provider progress, support response promises, push notifications or session claims merely to make the preview look complete.
- Do not remove authorisation checks to simplify exports. Prefer a customer intent that uses the existing final authenticated method, or make the two stages clear until safely unified.

## Proposed file ownership and validation for a later implementation phase

Likely shared files: `compact.js` / `getting-started.js` for entry state; `onboarding.js` for the in-place sign-in timer, University wording and optional address presentation; `account.js` for form semantics, field IDs, closed-report view, support context, biometric label and export action; `ambassador.js` for task companion hierarchy. A narrowly scoped late adapter is acceptable if it avoids fragile repeated string replacement and preserves load order. Root must decide final ownership before concurrent edits.

Validation should cover: fresh and saved setup; explicit sign-out and returning welcome; locked sign-in countdown with node/value preservation; Enter and click invoking the same controller exactly once; wrong PIN and field errors; no PIN draft persistence; export still excludes PIN/card secrets and uses all existing account/card adapters; closed report read-only/reopen/history; help returning to the exact reference; onboarding identity/OTP/terms/protected routes unchanged; first vs returning About behavior; long names, large text, keyboard-height phones and all three edition presentations.

The phase-1 mounted reproduction was observational only. No financial movement, saved customer profile, external communication, provider call or source behavior was changed.


## Phase 2 visual ledger

Reviewed the isolated local gallery in owned browser tab 8. Each frame mounted the actual application at 375 × 667; four frames were optically scaled across the desktop viewport. Used prepared standard fixture state and native disclosure state for the complete top-of-page pass. Every screenshot was inspected directly; a DOM-ready fact was not counted as visual evidence by itself. Early screenshots showing “Rendering pages” or mixed generations were rejected and recaptured after the gallery generation/disabled-control fix. The final ledger contains **72 distinct edition/experience/group observations: 45 route surfaces × first and returning × three editions = 270 page observations**.

“First” and “Returning” below mean the gallery’s first/returning guidance fixture, not a claim that every route can be entered from a fresh unauthenticated customer. Returning guidance was visibly collapsed where supported; essential consent, current records, fields and sample disclosures remained. The 53-route source inventory above has eight cross-domain routes outside this gallery domain (`welcome`, `more`, `notifications`, `dailyAccountNotice`, `dailyUpdatePrefs`, `testing`, `sampleConfirm`, `resetConfirm`). Their source audit remains included, but they are not falsely counted among these 45 visual surfaces; root coordinates their visual coverage with the other domain.

| Group | Exact native routes inspected | Everyday | Minna | Hibiscus | Visual result / refinement |
| --- | --- | --- | --- | --- | --- |
| 1–4 | accountInfo, accountReady, accountReview, accountTerms | First + Returning | First + Returning | First + Returning | Account cards and native task chrome are readable. AccountReady has clear Add money/Explore Home. Everyday review art delays mandatory consent until scroll; Minna already has small art, Hibiscus no onboarding art. Consent remains a required review task. |
| 5–8 | ambassadorGuide, ambassadorReset, ambassadorSample, ambassadorWelcome | First + Returning | First + Returning | First + Returning | Guide sample-details block precedes nine lengthy tasks; first task starts near/below fold in illustrated editions. Reset/sample replacement warnings and existing data boundary are clear. No per-task launch control. |
| 9–12 | applicationCorrection, applicationStatus, campus, campusInterest | First + Returning | First + Returning | First + Returning | QR wraps to a separate second header row on applicationCorrection/status in all three. University forms are usable; Everyday’s large art plus pilot notice delays both fields. Aliases use same current form; illustration selection differs by route. |
| 13–16 | campusInterestSaved, campusStatus, caseDetail, changePin | First + Returning | First + Returning | First + Returning | campusInterestSaved also has second-row QR. Case history preserves clear sender/time; related payment is only a reference disclosure. Change PIN fields/actions fit in native sheet and remain readable. |
| 17–20 | closeAccount, confirmPin, dataExport, devices | First + Returning | First + Returning | First + Returning | Blockers are distinct and actionable; all five reachable on scroll. Export explains local file scope and excludes PIN. Current device and unavailable remote sessions are honest. First-use About guide closes on returning. |
| 21–24 | feedback, help, identity, identityResult | First + Returning | First + Returning | First + Returning | Feedback has redundant inner Back/LUMO/Help row inside native task sheet in all three. Help’s four task choices are clear. Mandatory sample-identity checkbox is visible. Approved details are long but ordered; blank optional address can be collapsed, existing address must stay visible. |
| 25–28 | livecheck, notificationPrefs, otp, phone | First + Returning | First + Returning | First + Returning | Camera-off/sample-code boundaries remain explicit. Code and Ghana phone fields usable with clear primary actions. Notification row states readable. No screenshot evidence supports shortening required input or removing preview context. |
| 29–32 | pilotUnavailable, pin, privacy, privacyNotice | First + Returning | First + Returning | First + Returning | PrivacyNotice has QR on its own second header row. PIN/consent form is clear. Privacy controls show truthful current state but personalization/sign-in scope needs copy correction from source findings. Legal disclosures scroll naturally. |
| 33–36 | profile, profileEdit, profilePhone, recovery | First + Returning | First + Returning | First + Returning | Hibiscus profile’s standard name, campus and email values wrap in unnecessarily narrow right column (Kwame/Mensah; kwame@exam/ple.test) despite center space. Other editions fit normal values better. Recovery choices are clear. |
| 37–40 | recoveryOwnership, recoveryReplacement, recoveryStatus, security | First + Returning | First + Returning | First + Returning | Necessary ownership/replacement boundaries stay visible. Status page needs feedback when Check status leaves outcome unchanged. Security’s “Face or fingerprint unavailable” scope may confuse payment biometrics. No need to remove security education wholesale. |
| 41–44 | setupChoice, setupProgress, signin, statements | First + Returning | First + Returning | First + Returning | Resume choices are clear. Setup uses “Campus” while forms use University. Sign-in is a simple form. Statements shows Prepare and Download together, matching source evidence of repeat authentication friction. |
| 45 | supportCase | First + Returning | First + Returning | First + Returning | Category, message, Save report and local-only boundary are readable. Payment context remains a reference behind a disclosure, confirming recognition problem. No global clipping seen at standard size. |

### Critical lower-content inspection

In all three editions, also inspected **Bottom of page + Open supporting details** for groups 1, 2, 4, 5, 6, 8 and 11 (one-based). This directly covered account instructions, mandatory review consent/Create account, ambassador guide ending, university form final actions, report history/update/close controls, PIN form ending, all five closure blockers, export privacy/disclosure, device guidance, feedback save/download boundary, saved support reports, identity University/Email/Address/Confirm details, full privacy disclosure ending and statement Prepare/Download controls. These are additional lower-content inspections, not extra pages in the 270 count.

- Account closure correctly suppresses a final close action while blockers exist. Do not add an apparently available Close button merely for visual completeness.
- Bottom content is reachable and not covered by the task-sheet chrome. Normal scrolling is appropriate for identity review, legal information, multi-blocker closure and the ambassador guide.
- The gallery fixture has an existing address “Hall 2, Legon”. Any optional-address disclosure must be **open when a saved/draft value exists**. Collapsing that value would hide information the customer should review.
- The footer and support copy make clear that this is saved on the device and not submitted to a live support service. Retain that boundary during copy reduction.

### Refined decisions after visual challenge

**Confirmed fixes for central CSS owner:** give QR-bearing onboarding headers four intentional columns and keep QR at the top right; suppress only redundant inner Back/LUMO/Help toolbars within native task chrome; expand Hibiscus profile’s available value column without truncating important data; strengthen unreadable field boundaries through the agreed design-system pass. Exact QR evidence: `onboarding.js:7–12` emits three `.topline` children, while `qr-floating.js:19,28–36` appends `#lumo-scan-qr.lumo-qr-corner` and adds `.has-qr-corner`.

**Confirmed source candidates for this domain:** existing-account Welcome primary action through the final `getting-started.js` adapter; live sign-in lock countdown; native submit forms with field-bound validation; single final authenticated export intent; explicit closed-report reopening; recognisable payment context; honest biometric-sign-in/personalization scope; status-check acknowledgment; consistent University copy; optional blank address disclosure with draft-safe reopening.

**Hierarchy refinement:** limit illustration resizing to demonstrably crowded Everyday review/university surfaces if the central pass does not already improve them. Minna’s illustrations are already compact and carry identity. Hibiscus’s onboarding has no illustrations and should not gain them merely for parity. The established Hibiscus Home illustration is a separate preserved product decision.

**Rejected after direct inspection:** no all-edition illustration reduction, no no-scroll rule, no hiding legal/sample/identity consent, no generic “all paragraphs are clutter” rule, no claim that these standard-size screens are globally overflowing, no fabricated live support or authentication capability. Standard-size inspection found specific layout defects and cognitive load; root’s larger-text/long-value checks remain separate evidence.

Phase 2 completed before implementation. Award-winning quality remains an aspiration; the evidence supports bounded, observable product corrections, not an award claim.


## Phase 3 implementation and bounded verification

After the complete visual gate, implemented the following shared behavior in Everyday, Minna and Hibiscus. The shared onboarding, account and ambassador JS files and tests are byte-identical across the peers. Welcome uses the actual edition adapter: getting-started.js in Everyday/Minna and hibiscus-flows.js in Hibiscus. Edition identity, storage, themes and illustration files were not copied or changed.

| Owned file | Final change |
| --- | --- |
| `dist/getting-started.js` (Everyday/Minna), `dist/hibiscus-flows.js` (Hibiscus) | Existing signed-out profiles receive primary Sign in; existing open accounts receive Continue my Lumo. Fresh signup, saved setup and the Pause example keep their existing controllers. |
| `dist/onboarding.js` | In-place sign-in lock countdown disables only the submit action, preserves input nodes/focus and announces availability once at expiry. Unchanged identity/application/recovery checks acknowledge the saved state. Blank optional address collapses but stays mounted; existing/draft addresses open and remain reviewable. Setup/review copy consistently says University. |
| `dist/account.js` | Six native single-task forms, submit controls without duplicate click handlers, field-specific validation, explicit closed-report reopening plus controller guard, recognisable compact payment context with human status/delivery truth, one final authenticated data/statement download, truthful saved-preference/biometric-sign-in labels, and merchant no-match/clear-search recovery. |
| `dist/ambassador.js` | Sample credentials remain available under a disclosure beside a persistent sample-data warning. Nine task summaries expand individually; eligible unlocked accounts can use existing task destinations. Signup still passes through existing reset warning/prerequisites. |
| `tests/onboarding-finish.test.cjs` | Eleven mounted finishing groups cover entry states/Home privacy, timer identity and expiry, forms/field focus, exactly-once controller submission, account/card export adapters, strict dates/fresh download PIN, closed reports/context, optional-address drafts, unchanged status acknowledgment, merchant search and guarded ambassador actions. |
| `tests/signin-home-privacy.test.cjs` | Root-approved update of two signed-out known-profile label selectors from I already have Lumo to Sign in; privacy/auth/draft assertions preserved. |

The statement path validates real calendar dates, range ordering and no-future end date before fresh PIN approval. The private file writer is not an exported bypass; legacy downloadStatement still independently validates its saved range and authenticates. Each subsequent download requires a fresh field PIN. Data export invokes final `L.acct.downloadData`, retaining product-account and virtual-card wrappers. The PIN is excluded from JSON and cleared from the active field after generation; no new PIN cache is introduced.

Verification evidence from the serial QA owner:

- `2026-10-27T01-08-28-145Z-onboarding-finish`: new finishing, existing account-onboarding and existing sign-in Home-privacy suites passed 26 groups, zero failures.
- `2026-10-27T01-10-01-932Z-onboarding-finish-forms`: refined eleven-group suite, including explicit six-form controller exactly-once, passed.
- `2026-10-27T01-13-40-246Z-onboarding-finish-context`: final account context refinement, eleven groups, passed. Test/source hashes stayed stable through the run.
- Syntax checks on all four JS files/new test and targeted diff whitespace check passed. Heavy suites were delegated to the single serial queue.

A bounded post-change Everyday browser pass directly inspected the changed case/PIN, export, profile/phone, sign-in/setup/statements, ambassador and support surfaces. Forms and final download actions remain readable and reachable. It exposed an empty fallback context card for reference-only old reports; the final refinement omits that card and condenses amount/status to one line. Final support screenshot shows Akua’s Kitchen + GH₵80.00 · Completed, expandable reference and the Save report action at the fold. Peer final visual/font/large-text checks remain root’s shared release gate; this document does not claim they are already complete.

Implementation checkpoint: `/tmp/lumo-deep-review/onboarding-checkpoint`. No publication or financial/live-account operation performed by this domain owner.


### Hibiscus Welcome integration correction

The peer integration check found that Hibiscus ships `hibiscus-flows.js`, not `getting-started.js`. The initial change to the latter had not reached the Hibiscus mounted Welcome. The final implementation ports only the approved existing-account action priority into Hibiscus’s actual Welcome wrapper and retains its own purple arches, type, scene and fresh Get started composition. The task-created unused getting-started.js file was removed from Hibiscus. No Everyday scene or new script load was added.

The shared finishing test’s Welcome group now also checks fresh Get started → sample Pause without account mutation, signed-out Sign in → hidden-balance Home, unlocked Continue my Lumo → Home, and preservation of Hibiscus’s scene with no Everyday scene element. The fresh Hibiscus gallery screenshot was inspected directly and retains the original purple arches/white Get started action.


The final closed-account branch now labels Welcome’s primary action **View saved records** and uses the existing accountInfo route. Core closed-record and authentication guards are untouched. The focused test checks saved records without financial mutation and the retained sign-in guard for a closed, locked profile.

After the gallery Welcome seed correction (First = real reset/fresh, Returning = existing locked sample), directly inspected both modes in Everyday, Minna and Hibiscus. All three show Get started for fresh and Sign in for returning, with their own original scene/accent retained. Earlier generic gallery Welcome observations were not sufficient evidence of those account-state branches and are superseded by these explicit observations. A separate QA-only onboarding fixture registration now provides fresh, existing locked, closed open and closed locked Welcome cases for further visual comparison.

A retained ambassador test identified that the shortened warning no longer explicitly named Ghana Card details and banking PINs. Restored the exact original warning as the always-visible guide warning: “Do not enter real Ghana Card details, banking PINs or payment information.” Sample credentials remain under their disclosure. The retained test assertion was not changed.

The final shared CSS owner’s Hibiscus correction was also directly verified: normal profile name/university/email fit one line; field boundaries are more visible; applicationCorrection/applicationStatus QR stays in the same top row. These are visual confirmations, not changes owned by this domain.


Final explicit Welcome scenario visual gate completed after the actual peer adapters and corrected seed were ready: four prepared cases × three editions = twelve directly inspected pages. In Everyday, Minna and Hibiscus respectively, fresh shows Get started; existing locked shows Sign in; closed open and closed locked both show View saved records. The actions remain readable and inside the scene at 375 × 667. Everyday’s green, Minna’s black and Hibiscus’s purple arches remain distinct. These scenarios live only in `tests/manual-layout/deep-onboarding-fixtures.js`; no customer-bundle or financial-state operation was used for visual review.

The full Everyday retained suite passed 82 of 84 files before final compatibility corrections. The two retained failures were the ambassador warning (original text restored) and link-audit’s old onclick-only support submission assumption. Root approved changing only the latter’s interaction assertion to the real form onsubmit, with exactly one submit control and no onclick duplication. All report/reference/return/financial assertions remain. The corrected test is synced across three editions; focused verification is queued with the serial QA owner.


Final retained-fix verification passed with stable source/test pins: ambassador-entry 4 groups, link-audit 4 groups (188 views and 1,107 handlers), onboarding-finish 11 groups. Evidence prefix: `2026-10-27T01-40-28-845Z-onboarding-retained-submit`. The earlier actual all-three-edition onboarding/privacy branch run passed 54 groups across six files, including closed-account guards. No onboarding blocker remains; shared release gates/publication are coordinated by root.


The full Hibiscus gate exposed one further retained onclick-only assumption in its edition-only setup/navigation test. Root approved replacing the changePin action lookup with an exact native form submit check: preventDefault + L.acct.changePin(), one submit control and no duplicate onclick. Original PIN, security destination, saved-context, parent and financial assertions remain. No customer code changed; this Hibiscus-only test was not copied into other editions. Focused and full Hibiscus verification are delegated to the serial QA owner.
