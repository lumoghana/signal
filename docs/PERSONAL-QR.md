# Personal Lumo QR payments

Each signed-in demo profile owns a stable opaque QR ID in its existing, edition-specific saved state. My QR is available under You/Profile and inside the scanner. It shows an actual black-on-white symbol and supports PNG save and native sharing, with a download/screenshot fallback. No account number, phone, PIN, balance or amount is included.

The draggable Scan QR control is available across signed-in pages and sheets, stays inside the visible app frame, supports arrow-key movement and remembers its position. It is hidden during sign-in, setup and PIN/Pause authorisation screens. A tap opens the rear camera request once; browser permission is still required. Upload QR image supports PNG, JPG and WebP. Camera tracks stop on exit, backgrounding and late permission replies.

Personal payloads use `LUMO1:USER:<32-hex-id>:<URI-encoded-public-name>:<handle-or-dash>` with a 600-character cap. Edition scanners can read each other's exported QRs. The name is supplied by the QR and is explicitly labelled as such. This static prototype has no central recipient verification or cross-device settlement service. Personal scans select a recipient only; the existing amount, Budget source, review, Pause where needed, PIN, balance checks and idempotency still own the simulated payment. Pending submissions and self scans are protected; replacing a substantive draft requires a deliberate confirmation.

Verification: existing merchant/sale QR lifecycle checks plus personal QR symbol roundtrip, exported image pixels, upload decode, stale callbacks, personal identity isolation, self/invalid scans, amount/review/PIN and draggable control behavior. Native camera compatibility and OS sharing require handset testing.
