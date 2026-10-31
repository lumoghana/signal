# Page correlation and visible navigation

Checked 18 October 2026. This pass updates only **Lumo · Clarity Edition**, project `appgprj_6ad4c822fe3881919757091e91e2ce9f`. The campus-pilot source was opened read only as the illustration-correlation reference. Neither original deployment is a publication target.

## Navigation correction

The active item was present in the markup but could disappear visually. An older `#nav:not([hidden])` rule had higher specificity than the later `#nav` black-background rule. The resulting paper bar inherited a white active label. The final stylesheet now explicitly resolves the visible bar to ink #111111 at matching specificity.

All five items remain present: Home, My plan, Chats, Pay and You. Inactive labels/icons use #B8B8B8. The current page uses #CFEF59 plus a short 24×2px underline, font weight 700 and existing `aria-current="page"`. Targets are at least 44px wide and 52px high. Keyboard focus remains a visible white outline. Open task sheets retain the parent's navigation nodes and selection. Navigation remains hidden during the existing onboarding/sign-in flows.

Lime now has two explicit jobs: financial intelligence in content and current location in the main navigation. This change does not restore decorative rings or green artwork.

## Illustration correction

The campus prototype's stronger correlation comes from recognisable task props, not a different phone pose. This pass extends the earlier Kente/wax-print cast with 11 new upper-body or hands compositions. The object leads the scene so a compact sheet does not depend on a tiny phone in a full-body figure. The clean monochrome Legon plates, original capital-L wordmarks and actual Lumo Sans weights remain.

| Page/activity | Dominant illustration |
| --- | --- |
| Add money / MoMo funding | Open wallet beside the student's own phone. No money already crossing or success claim. |
| Bank receiving details / bank transfer | Recognisable bank facade and details card held by Kente-sleeved hands. |
| Campus Pay lookup | Phone beside an abstract scan placard, suitable for food, printing and transport. |
| Selected food merchant | Original food counter. Campus Print CP02 uses records; its actual category is Study. Transport keeps the neutral Campus Pay context. |
| Lumo transfer / money request | The actual campus pilot's two-phone transfer and paper-plane/request props, reused unchanged and displayed in grayscale. |
| Airtime / data / electricity / water / TV / internet | The corresponding handset, SIM, lamp, tap, TV or router from the campus pilot's existing service atlas. |
| Review / history / receipts / statements | Large receipt strips checked against a ledger. Payment facts remain real interface text. |
| PIN / authorisation / recovery / security | Large closed padlock beside the phone. No completed-payment checkmark. |
| Profile / You | Large portrait card representing the student's own details. |
| Privacy | A curtain shielding a profile card. |
| Notifications | A large bell beside the phone. |
| Planning / period / allowance / generic goals | A large blank month calendar, planning card and notebook. Expected allowance is never depicted as received money. |
| Selected laptop goal | Existing laptop scene remains conditional on an actual selected laptop goal. |
| Chat introduction | Two large conversation bubbles beside the student's phone. Active conversation still removes the introductory illustration. |
| Help / saved support report / feedback | Open reference booklet, pencil and a question bubble. No connected live-agent implication. |

Pay changes illustration with its selected tab: transfer, Campus Pay scan or bill/record review. These choices follow the selected activity and actual draft data. Actual payment and funding result gates remain unchanged: pending, failed, reversed and unknown results cannot acquire completed-purchase art. Food handover still requires confirmed Campus Pay Food plus explicit delivered status.

Branded confirmations retain a safe snapshot of the originating scene. The exposed copy contains only route and scene key, never fields, PIN/OTP, callback or action. This preserves a selected laptop scene through archive confirmation without relying on the confirmation route's empty params. Cancellation and acceptance continue to use the existing functions and guards.

## Asset construction and provenance

New generated project assets are under `/workspace/sites/lumo-clarity-edition/dist/assets/clarity-tasks/`:

- `funding-wallet.png`, `security-lock.png`, `records-receipts.png`: [transaction prompts and checks](TASK-ART-TRANSACTIONS.md).
- `chat-conversation.png`, `planning-calendar.png`, `help-question.png`: [core prompts and checks](TASK-ART-CORE.md).
- `profile-card.png`, `privacy-curtain.png`, `notifications-bell.png`, `bank-details.png`: [account prompts and checks](TASK-ART-ACCOUNT.md).
- `campus-scan.png`: [Campus Pay prompt and checks](TASK-ART-CAMPUS.md).

All 11 were generated with the built-in image tool using the original textile cast as references, visually inspected and copied unchanged. They are 1536×1024 RGBA with genuine transparency. Props are monochrome; clothing retains the original ochre/orange/navy/cream textile patterns. No balances, payment amounts, dates or user data are baked into the images. The Help asset's question mark and abstract profile/scan symbols are purely illustrative.

The existing `/assets/lumo-payment-atlas-v19.webp` is byte-identical to the campus source. Eight safe source cells supply the six utilities, transfer and request. No bitmap was redrawn or edited. A tightly bounded nested SVG viewport clips each cell inside the outer responsive viewport, so wide layouts cannot reveal adjacent services. The crop uses no fragment IDs, so the task host's retained-parent ID isolation cannot break it. Only those reused service objects are grayscaled. One foreground and one restrained Legon background remain per scene.

The active renderer references 23 unique assets: 22 PNGs and one shared WebP atlas. Eleven are the new task masters. Existing original master bytes and fonts remain unchanged. The rejected v3 foregrounds remain recoverable in history but are not rendered.

## Checks

**25/25 suites pass: 23 JavaScript and 2 Python font suites.** The current presentation suite has 30 checks; navigation has 9; task sheets retain 68 behavior checks. The atlas component suite has 24 pixel cases plus a negative control and retained-parent check. **89/89 source checks pass.** Machine results are recorded in `page-correlation-check-results.json`. The focused suites cover all five navigation destinations and retained task selection, the effective navigation cascade, task-specific mapping, source-asset integrity, selected bill/merchant/goal context, confirmation-scene isolation and transaction-status guards. The independent audit added a component raster check for atlas spill in wide and compact viewports.

The existing payment fixture remains authoritative: 600 available, 350 essentials, 100 goals and 150 after the plan. Extra 80 leaves 520 available and 70 room; extra 140 leaves 460 and 10; extra 280 leaves 320 with 30 essentials and 100 goals uncovered. Linked 80 leaves 520 available, 270 remaining essentials and 150 room. The financial engine, Pause thresholds, fees, authorisation and actual ledger mutation code are unchanged.

An independent audit caught two visual issues before publication: adjacent atlas cells could leak through a letterboxed outer SVG, and a laptop archive confirmation lost its selected-goal art when route params cleared. Both are corrected with focused regression coverage. No additional product policy was introduced.

## Recovery and isolation

Opened Clarity v4 source `7bdd86c62f1f51bf3aaa92ba8a694d82a98c5f54` before editing. Recovery tag: `checkpoint-clarity-before-page-correlation-20261018`. The campus reference remains at v25, commit `2c877ba0d90f8acf6341f0152e9a8246b08b3cc4`; illustration-first remains separate. Public access and `lumo-clarity-edition-v1` demo storage are preserved.

## Verification limits

Supported browser control is unavailable. No alternate browser or preview server was used. The artwork and isolated service SVGs were inspected directly; DOM/source and component-raster checks do not establish actual Safari/Chrome paint, keyboard placement, larger-text fit or physical touch behavior. Screenshots and a journey recording remain unavailable.

Artwork remains flat PNG/SVG-atlas composition, not rigged animation. Existing reveal/hold/resolve motion and reduced motion remain. This is still a simulation with no live banking, identity verification or payments.
