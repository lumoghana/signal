# Lumo · Minna Edition

Created 23 October 2026 through Sites' new-project workflow, independently of the original. This is a Lumo prototype with Minna-inspired visual discipline, not a Minna-branded app.

## Source and independence

Everyday v19, commit `b951f6d15263042d63dd7efcbd2d307cccee4868`, is the functional baseline. Its 43 shipped scripts and 120 destinations are retained. Only the core demo-storage literal changes. The new CSS and metadata-only script own this edition's presentation. The original source and publication remain untouched. No personal saved records were copied; bundled sample data is available independently.

See `EDITIONS.md`, `AGENTS.md` and `config/editions.json` for the two-project maintenance contract. Feature changes must be made and checked in both editions; presentation changes remain edition-specific. The parity checker reports unapproved divergence instead of silently accepting it.

## Shared presentation rules

| Role | Rule |
|---|---|
| Typography | Local Manrope variable, real 400 / 500 / 600 / 700 weights. Regular support, medium amounts/titles, semibold conclusions/actions. No synthetic styles. |
| Currency | Existing formatter remains authoritative: GH₵, two decimals, tabular numerals, nonwrapping currency token. Manrope lacks ₵; the existing Lumo Sans font deliberately supplies only U+20B5 at the matching weight. See `fontsource-note.txt`. |
| Wordmark | Exact original Lumo black and white SVGs; no typeset substitute. |
| Colour | White #FFFFFF, ink #111111, secondary #626262, divider #D7D7D7. Yellow #FFE477 marks Pause reveal and interaction feedback. Meaning also uses words and symbols. |
| Geometry | Open sections, thin rules, 2px button/field corners. Rounded 18px sheet top edge marks a temporary surface rather than a permanent card. No decorative gradients or shadows. |
| Spacing | 22px phone gutter, related facts grouped, generally 8/12/16/20/24px steps. Controls remain at least 44px tall; primary actions generally 50–52px. Natural scrolling remains available. |
| Illustration | Existing context-specific Lumo student artwork, rendered monochrome. A single relevant figure supplies organic contrast; no Minna characters are copied. Restrained artwork on entry, review and authorisation. Decorative campus backdrops are suppressed in this edition. |
| Home | Open operational-money summary with Left after budget primary, balance secondary, separate savings ledger, receiving/funding controls and concise money story. Global privacy control remains visible. |
| Plan | Two ledgers separated by rules: operational Budget and savings Money Boxes. Their controls and calculations are unchanged. |
| Chat | Open invitation, monochrome illustration and useful starters. Active conversation removes introductory decoration. Black question bubbles, open answer text, conclusion first, calculation in a sheet. |
| Pause | Focused black surface, white consequence and one before/after comparison. Yellow ring brings the projected effect into focus. Edit, continue, link, defer and cancel remain available. |
| Motion | Existing reveal → hold → resolve and short task transitions. 900ms projected arrival, then the approved minimum 3-second reading period; 90ms press before separate PIN/biometric authorisation. Reduced motion retains information and choices immediately. No success before confirmation. |

## Functional validation

The new edition retains onboarding, Ghana Card sample details, university/email handling, funding, GIP guide, two accounts, Budget, Money Boxes, optional partner protection, payments, transfers, bills/top-ups, Campus Pay, QR and code, PIN, biometric demo, Chat, activity, receipts, profile, help and recovery states.

Current two-account fixture: GH₵500 operational + GH₵100 savings, with GH₵350 remaining Budget. Initial Left after budget is GH₵150. Savings is already separated and must not be deducted again.

| Scenario | Confirmed result |
|---|---|
| Extra GH₵80 | Operational GH₵420; Left after budget GH₵70; savings GH₵100 |
| Extra GH₵140 | Operational GH₵360; Left after budget GH₵10; savings GH₵100 |
| Extra GH₵280 | Operational GH₵220; Budget uncovered GH₵130; savings GH₵100 remains intact |
| Linked Budget GH₵80 | Operational GH₵420; remaining Budget GH₵270; Left after budget GH₵150; savings GH₵100 |

The earlier fixture with a virtual goal allocation is historical. The approved two-account model holds Money Boxes in a separate savings account. Tests use this current model, not double-counted virtual savings.

Passed 9 edition contracts plus 287 named behavior checks in 22 current regression files. These include matching preview/Chat/ledger results, storage isolation, source hashes, all routes, pending/failure/duplicate handling, QR recipient constraints, biometric single-use authorisation and protected withdrawals. Seven navigation behavior checks also pass in the original navigation test; its old palette/CSS snapshots are replaced by the new edition contract. A blanket historical suite has the same 13 outdated test-file failures on both original and new sources; these are documented in EDITIONS.md.

Command: `node scripts/check-edition-parity.cjs --regression --peer /workspace/sites/lumo-everyday-edition`.

## Visual acceptance and limits

Browser checks cover the Home → Campus Pay → amount → Pause → separate biometric demo → confirmed result journey, global privacy, Budget edit/back, Chat answer/calculation/return and retained navigation. Phone audit uses 360×640, 390×844, 412×915, narrow 320px and enlarged text. Main payment action remains reachable; long content and the shortest Pause use natural scrolling rather than compressed type. All transaction rules, stage count and navigation destinations are unchanged.

The feature-parity checks are automated. They do not prove native keyboard, physical camera or operating-system biometric behavior. Transactions, identity verification, partner codes and biometrics remain explicitly simulated; no live integrations or production-readiness claims are added.

## Primary design references

- Minna official design interview: https://note.minna-no-ginko.com/n/n699acf901335
- Minna official illustration interview: https://note.minna-no-ginko.com/n/nc0ccd28d1d37
- Minna official app overview: https://corporate.minna-no-ginko.com/common/pdf/news/2025/04/01/newsrelease_media_0401_02.pdf

These informed open composition, monochrome contrast, rectilinear controls and restrained illustrations. Lumo retains its own identity and financial behavior. Appearance alone is not evidence of usability superiority.
