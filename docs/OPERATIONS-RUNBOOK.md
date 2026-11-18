# Lumo operating and acceptance procedures

Scope: the connected prototype and its production preparation. These procedures define work and evidence; they do not claim that a staffed shift, real provider, physical handset or hosted disaster restore has already passed.

## Release ownership

Engineering owns immutable source/artifact IDs, migration compatibility, backend deployment and rollback. Product/QA owns named consumer/merchant/cashier journeys and device acceptance. Risk/operations owns privileged access, reconciliation, cases, retention and incident decisions. The release owner records the exact web commit/deployment, every edge version, database migration set, native APK version/signature/checksum, test run IDs and unresolved items together.

Every private real-money acceptance report must repeat the launch index's exact `release`, `sourceCommit`, `apkSha256` and `backendBundleSha256`. Its report bytes are separately checksummed in the index. A rebuilt or replaced artifact needs matching acceptance evidence even when its version and source label are unchanged; updating only the launch index must fail validation.

Roll out additive compatible database changes before dependent gateway code, then web/native surfaces. Keep the previous executable bundle and signed APK. Review new managed-Auth triggers independently and test ordinary Auth behaviour as well as the targeted reset case before applying them. Never roll a database back by dropping ledger/audit records. A rollback that cannot understand a new durable request state must be rejected or use an explicitly reviewed compatibility bridge.

## Payments and unknown outcomes

Look up the original actor/reference/fingerprint and canonical journal. A terminal decline remains that decline even after funds arrive. A successful reference returns its original result. A pending/unknown result must be reconciled with that original request before another instruction is created. Correctable PIN errors and transient conflicts do not become permanent business declines.

Never edit account balances, delete entries, infer success from a client screen or silently create a replacement debit. Record incident/case references and use the original merchant refund path with independent authorisation where required. Refund approval is not proof that the refund executed; the original journal and immutable refund receipt are the evidence.

## Privileged access and approvals

Keep hosting audience and application staff roles separate. Each operator enrols and verifies their own authenticator. Use the readiness screen to confirm staff factors before requiring MFA; do not lock out the only operator by changing a global flag first. Production enforcement requires the tested access-admin coverage and current second-factor session. A deliberately temporary pilot exception must remain visible.

General proposals use original request IDs, fingerprints, target-state versions and expiry. Opposing or superseded proposals are not a shortcut around a more recent suspension. Reviewers check current evidence, and stale decisions require a new proposal. Record reasons and independent approval; never invent a factor, bypass an enrolment requirement or reuse a colleague's identity.

## Password reset and uncertain outcomes

The active public release uses the existing guarded access7-compatible protocol. The managed Auth write-fence migration and its operator reconcile/cancel capability are private, unapplied and absent from this export. Both active gateways keep their recovery-resolution flags false; unsupported admin recovery commands stop before their unavailable RPC. Do not treat an inactive implementation branch as an available support operation.

Keep the original reset execution and its uncertainty guard. Do not infer success, backfill a marker, release a pending writer because time passed or blindly issue a second password PUT. Escalate uncertain external Auth outcomes through the controlled support process while retaining the original reference. Ordinary metadata/password changes, rehashes, simultaneous reset/change and delayed replies need a separately accepted managed Auth/concurrency matrix before any future fence rollout. No blanket migration push from a private candidate is permitted.

## Restore and continuity exercise

1. Agree recovery point and recovery time objectives, a measured launch workload and an accountable recovery owner. Do not invent achieved RPO/RTO values.
2. Restore a selected encrypted backup into an isolated, access-controlled environment. Include the full migration history, required nonsecret configuration and separately controlled encryption/signing key recovery. Never put production secrets in Git or test logs.
3. Run `backend/ops/verify-restored-ledger.sql` read-only and compare counts/cutoff/checksums with the chosen backup checkpoint. Zero unexplained balances/entries or journal differences are required; the negative test-funding source is not a customer overdraft.
4. Exercise original successful/declined/unknown references, fixed requests, group refunds, loyalty claims/redemptions, support unread state and the active legacy reset guards. A future managed Auth fence needs its own separate isolated acceptance. No messages or provider payouts may escape the isolated environment.
5. Measure elapsed recovery and data cutoff. Record missing objects/keys, operational steps, result and reviewer. Clean schema boot alone does not establish this exercise.

## Provider, identity and notification acceptance

Use provider-owned test credentials in the secret manager, signed callbacks, request/amount/identity binding and bounded replay recovery. Test pending, expiry, response loss, duplicate/out-of-order callbacks, reversals and statement reconciliation. Compare the ledger with provider settlement evidence before enabling a live rail. A simulated network/name response is not a verified customer identity.

Stored-face similarity is not presentation-attack detection. Genuine liveness/identity acceptance needs the selected provider, request-bound captures, calibration on representative Ghanaian users/devices, failure/fallback and retention evidence. Keep the sandbox disclosures and keyless policy until an explicitly accepted replacement is connected.

In-app foreground updates are the current notification service. If closed-app alerts become a promise, supply server-event/outbox and registered device delivery, token rotation, deduplication, unread reconciliation and privacy-safe content. Prove one correct case alert on a backgrounded signed APK; do not substitute a locally scheduled demo notice.

## Devices and scale

Use the original-certificate signed APK. Record device/build/Android version and install/upgrade, app links, permissions, camera orientation, biometric invalidation, keyboard/insets, large text/TalkBack, reboot, process death and network interruption. Include the oldest supported and recent OS versions, and actual merchant receiving phones. Framework shadows are useful but are not a handset acceptance result.

Load tests must use authorised synthetic identities, declared target/limits and explicit provider sandbox isolation. Measure compact/long-history accounts, simultaneous independent merchants, p95/p99 latency, lock waits, retries, payload/bandwidth and mobile battery behaviour. Active users are not concurrent users. Do not infer two-million-user capacity from a small fixture, a rate formula or an empty error log.

## Privacy, retention and public editions

Define retention separately for ledger/audit evidence, inactive sessions, failed enrolments, consented biometric ciphertext and deletion requests. Verify fulfilment, key rotation/recovery and what remains in backups. Closing an account must not erase required ledger evidence, and an opened support ticket is not completed biometric deletion.

Keep a register of current consumer, merchant, admin, marketing and historical URLs. Label historical editions clearly; preserve audience and do not delete, publish or restrict old work without the relevant ownership decision. Browser-local records belong to their original account/origin and must not be imported silently.
