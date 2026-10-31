# Lumo three-item navigation · 27 October 2026

The monochrome edition now has exactly three main destinations: Home, Ask Lumo and Menu. The existing more root supplies Menu, so existing authentication, retained task parents and browser history remain authoritative. Original financial controllers, storage and all registered routes are preserved.

Menu groups:
- Move money: Payments, Requests & collections, Cards, Activity.
- Plan & save: Plan, Money Boxes, Money Story.
- Your account: Profile, Account details, Security, Privacy, Notifications.
- Help & support: Get help, Share feedback, Ambassador guide. Conditional preview tools and Sign out remain available.

Home's rendering function, information, financial amounts, three money actions and header remain unchanged. Phone-only spacing releases an obsolete illustration grid reservation and uses compact spacing on shorter screens. Standard Home fits without scrolling at375×667 and390×844. Long content, notices, very short screens and enlarged text may still scroll naturally. No content is cropped to force a single screen.

Ordinary Chat retains the three-item bar. Contextual and guided conversations and active tasks keep their existing task navigation. Cached primary controls retain their exact DOM identity through task dismissal, preventing the shared five-tab presenter from replacing retained navigation. Chat drafts, thread state, money and approval flows are preserved.

Validation:
- Required gate:86 files,129 Node checks,129 passed,0 failures. Includes26 new actual-index navigation cases and unchanged retained-parent/navigation-node assertions. All8 local contract checks pass; peer checkout comparison explicitly skipped because none is present.
- Existing test/checker changes are narrowly limited to the user-approved3-item navigation and Menu grouping. Financial, source-baseline, access, authentication, draft, route and retained-state assertions remain. The legacy ambassador fixture now parses actual navigation controls rather than returning an empty list.
-402 enlarged-text/long-value layouts:0 findings. Final phone spacing was then refined only for Home;60 final Home privacy layouts cover those changes across ordinary/enlarged text and widths, with0 findings and stable comparisons.
- Standard Home fit measured at375×667 and390×844:scrollHeight equals clientHeight.
- Browser checks cover Home, grouped Menu, ordinary Chat, preserved unsent question and main active states. Existing regression covers native Back, card drafts, contextual returns, locks and pending financial tasks.

The app remains a sample-money prototype. This review records source and QA, not a deployment receipt.
