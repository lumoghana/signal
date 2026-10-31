# QR payments and biometric approval

23 October 2026. Existing Lumo Everyday Edition project and public access retained.

## Restorable starting point

Published version 17, source `189ea291c5b29460da03b2751db447383b8f6d50`. Local checkpoint: `checkpoint/pre-qr-biometric-v18`. The storage key, saved accounts, financial rules, typeface, wordmarks and illustration assets are unchanged.

## QR payment journey

Campus Pay now offers Scan QR alongside merchant/sale code entry. The Campus Pay tab in Pay also offers scanning. The scanner uses an explicitly requested rear camera or a chosen PNG/JPG/WebP QR photo. Permission denial, unavailable hardware, an unreadable photo and unsupported codes retain useful recovery actions.

QR decoding runs locally, preferring BarcodeDetector where available and using the bundled jsQR fallback. Photos are not uploaded. No runtime CDN is required. The encoder/decoder packages and original licenses are included under `dist/vendor/`.

Accepted payloads identify a known preview merchant or an existing local sale: `LUMO1:MERCHANT:AK01`, `LUMO1:SALE:SALE-…`, or the corresponding plain identifier. URLs, arbitrary amounts and unrelated payment formats are rejected. The existing shared merchant/sale resolver checks identity, status, expiry and any fixed sale amount. Scanning opens payment details and never debits money or displays a payment success.

Merchant sale pages now show a genuine decodable Lumo sample QR, replacing their illustrative code. A local sale remains available only in the browser that holds that demo record. Bundled merchant QRs work with the bundled registry. This is not a live GhQR/EMV integration.

Camera tracks are stopped on recognition, cancellation, route exit, sheet dismissal, hidden tabs and page exit. Late permission responses and decoder results cannot take over another account or task. Returning from the background requires an explicit camera restart.

## Authorisation

The existing authorisation sheet offers a clearly labelled Face/fingerprint demo and the existing PIN. Choosing the demo updates that same surface. Approval, cancellation, retry and PIN fallback are explicit.

The demo never reads or fills the stored PIN and does not capture faces or fingerprints. A private, short-lived, one-use receipt is tied to the exact account, draft and current transaction facts. The shared transaction executor still checks the review quote, available funds, accepted Pause and duplicate submission. Pending and failed outcomes remain distinct from success.

Both directions of Money Box transfer are covered. Protected withdrawals still require the independent, fresh partner approval. Biometric approval does not unlock a protected box on its own.

Pause choices now say Continue, and the next step offers PIN or biometric approval. The existing three-second reading period, money-arrival reveal and 90 ms hold are unchanged.

## Verification

- All 23 selected regression files pass: 296 named behavior checks, including 47 new QR/biometric checks.
- All 43 shipped JavaScript files pass syntax checks. `git diff --check` passes.
- Browser verification read an actual generated QR PNG through the file-picker and local image decoder into Akua’s Kitchen payment details.
- Browser journey: QR photo → GH₵80 → review → biometric demo → PIN fallback → demo approval → confirmed simulated result. The operational balance changed from GH₵720 to GH₵640 only on confirmation; savings stayed GH₵200.
- Browser journey: actual sample QR decoding → GH₵450 → GH₵130 budget shortfall Pause → brief hold → PIN/biometric authorisation options → cancellation. No second debit.
- Manual CP02 code lookup still opens Campus Print. Leaving a draft uses the existing explicit keep/discard choice.
- At 360 × 640, the camera/photo actions, code alternative, biometric entry, PIN action and main biometric choices are reachable. Larger phone layouts and 320 px with enlarged text were checked; no horizontal overflow. Enlarged text uses natural vertical scrolling.
- Layout observations, screenshots and the complete behavior output are under `docs/qa/v18/`, outside the deployed product flow.

## Remaining production work

The biometric experience is an interaction simulation, not actual device verification. A live implementation needs the native platform or bank-approved device authentication, server-issued transaction challenges and server-side verification. Live GhQR acceptance and cross-device sale lookup need the relevant provider integration and authoritative merchant/payment service.

Physical phone camera behavior and real operating-system biometric prompts could not be tested here. Camera lifecycle cases were tested with controlled media stubs, and the real browser image decoder was exercised. No real payments, SMS, identity verification or banking connections were introduced.
