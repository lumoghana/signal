# Authorised collection payout rails

The organiser completes the existing Lumo, Mobile Money or Bank recipient flow, amount, purpose, optional supporting evidence, full-cost review and PIN/biometric demonstration before submitting a request. Authorising reserves the amount plus fee in the collection; it does not count as a group vote. The final required approval under the existing accepted mandate automatically submits exactly one sample payment. Pending submission retains its hold; confirmed settlement deducts the collection balance once. Personal balances and activity remain unchanged.

Native sample fees are Lumo GH₵0, Mobile Money GH₵0.50 and Bank GH₵1. Recipient lookups use the existing restricted sample directory and account checks. This static prototype sends no real payment or remote invitation/decision.

## Compatibility and failure handling

Existing any-N-of-M rules remain intact. Named approvers can exclude the organiser. Declines close a request only when its threshold becomes impossible; silence is not approval. Cancel/expiry release only an unsubmitted reservation. Processing reserves funds past approval expiry and blocks pot cancellation/refund. Retry uses the original reference and exact approved details, fresh review/PIN or biometric demo, and a new attempt ID. Stale results cannot settle a retry. Legacy saved requests without rail authorisation keep their original manual release journey. No PIN, ephemeral token or biometric ticket is saved in a payout record.

Requests, approval+dispatch, withdrawal and provider settlement are atomic saved transitions. Storage failures restore the previous state, invalidate transient review authority and show recovery. Supporting evidence keeps the existing bounded JPEG/PNG/PDF validator, capacity checks, exact-content binding and late-reader context checks.

## Verification

- New focused engine lifecycle suite:7cases.
- Independent adversarial suite:18cases across3rails, mandates, expiry, stale fields, storage failures, reload, duplicate dispatch and authorisation cleanup.
- New mounted UI suite:11cases, including all3native recipient rails, wrongPIN, scoped biometrics, final vote auto-dispatch, proof and late upload, failed retry, conflicting drafts and background clearing.
- Legacy payout/evidence/mandate suites retain explicit saved-draft coverage. New-request UI coverage lives in the new mounted suite.
- Required edition and cross-edition financial/source gates run before publication.
- Browser QA uses only fictional isolated memory state:personal GH₵1, pot GH₵600; no personal transaction.21payout states across7mobile size/text configurations per edition. Final results recorded below.

Required checks:Monochrome357/357, Everyday208/208, Hibiscus221/221 passed, with final source/identity/financial parity gates passing after the last UI cleanup. Focused native new payout UI tests11/11 passed again after removing a redundant save following the engine’s atomic successful authorisation.

Final browser results:Monochrome147/147, Everyday147/147 and Hibiscus147/147 layouts, all with0findings and0render/setup errors (441total). The final source-owned audit disables Run until the isolated app has loaded; an initial premature-run fixture error was corrected and the complete final sweep repeated successfully. Checked widths320/375/390, keyboard390×480, landscape568×320, and200% text at320/390. Explicit source-owned setup uses actual recipient selection/check, review and request authorisation. Every case asserts personal balance GH₵1 and0personal transactions; pending approval reserves the pot, final mandate approval submits one attempt, paid cases deduct once. All temporary dist QA files were removed before packaging.
