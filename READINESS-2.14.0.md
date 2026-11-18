# Lumo 2.14.0 readiness candidate

18 November 2026. The reviewed publication is user-approved, excluding the managed Auth write fence. The 9/10 prototype and 8/10 real-money targets have not been reached. Conservative evidence-based estimates remain 8.6/10 prototype quality and 4.6/10 real-money readiness, not certification or launch approval.

## Active backend and public export boundary

Gateways lumo-approved 25, lumo-access 8 and lumo-admin 8 are ACTIVE. All 60 imported file appearances match the reviewed source exactly, with existing application authentication retained. Their actual bundle hashes and per-file source hashes are recorded in backend/verification/readiness-2.14.0/active-deployment.json. Both recovery flags remain literal false.

Seven independently safe migrations are active, taking the complete hosted schema from 52 to 59. This public export contains all 59 active sources and runs every included migration and SQL fixture. The private unapplied F05 managed Auth write-fence migration and its two stage-only SQL fixtures are absent; no blanket push can install it from this export. The old guarded password-only reset protocol remains active. Operator marker-based reconciliation/cancellation is unavailable and blocked at the active admin gateway.

Public GitHub disclosure and coordinated web/Site publication were explicitly approved. App publication is complete; this active-only source export awaits its GitHub commit and CI result. An earlier full-candidate tree was rejected because it included the excluded private migration. This export is a separate active59 tree with the original public baseline parent; the private full-candidate checkout is unchanged and is not public history. Consumer and Merchant Vercel production aliases now serve the approved release; Merchant Site41 and Admin Site13 are published with their existing audiences. Both canonical APK downloads match the reviewed signed bytes. Anonymous browser-session checks pass12/12 and7 sampled consumer source files match exactly. The release owner observed welcome and Explore read-only. Full signed-in, provider, physical-device and hosted-CI acceptance is not inferred from these checks. Deployment identifiers are in source-provenance.json.

The signed 2.14.0 APK and clients retain the exact reviewed bytes. Their publication and artifact identities remain separately verifiable; the source export does not rebuild or substitute them.

## Candidate changes

- Financial references retain terminal declines as well as successful results.
  Later funding cannot make an old definitive decline payable. Correctable PIN
  errors and temporary revision conflicts retain their existing recovery path.
- General admin approvals bind current target state/revision and expiry, reject
  stale or superseded decisions, and retain original creation/decision references.
  Refunds have a separately paged, counted queue. Staff enrollment and production
  MFA rollout are explicit; the existing pilot exception is preserved.
- Incoming/outgoing IOU questions use the recorded relationship and supported date
  scope before general daily guidance. Unsupported or conflicting dates clarify.
  Rewards retain a validated selected shop/member through Home and Pay.
- Original new secrets are screened before derivation. The canonical consumer
  browser candidate uses a same-origin HttpOnly/Secure/Strict cookie boundary,
  acknowledged issuance, account/generation fences and signed proxy provenance.
  The paired deployment is active; full authenticated browser/device acceptance remains open.
- Merchant directory and reward-request checks use private indexed projections.
  Routine merchant reads select the operator's tenant; hydration avoids repeated
  history scans. Unchanged businesses skip canonical metadata rewrites and broad
  account locks. Five jittered retries preserve original references. Partial
  display snapshots cannot replace complete metadata authority.
- Native changes mirror IOU interpretation, secret screening and rewards context;
  expose selected navigation/heading semantics; and bound unchanged/outage polling
  without overlapping refreshes or slowing unresolved-request reconciliation.
- Biometric expiry, indexed bounded cleanup and withdrawal/closure erasure have
  a standalone hosted migration. Raw selfies are not retained. Production
  retention periods, backup expiry and fulfilment acceptance are still required.
- Source reconstruction now includes the five exact recovered live migrations.
  Pinned CI, imported-source review, operating procedures and a private launch
  evidence validator were added. Reports must match the exact source, APK and
  backend artifact digests. The incomplete example remains rejected.

The approved merchant static subpath is regenerated from its canonical reviewed
source. Some exported loyalty/recovery files were previously stale or absent
under `dist/merchant`; the asset reconciliation records distinguish these copies
from new readiness code. Four unchanged baseline maintenance assets omitted from
the previous asset map are now covered without claiming a code change.

## Evidence and its limits

| Check | Result | Scope |
| --- | --- | --- |
| Consumer suite | 1,910 pass | Final local source model/UI/transport tests, including wrapper regressions |
| Merchant/cashier/loyalty suite | 734 pass | Local canonical merchant source |
| Backend suite | 445 pass | Active public export, including source/provenance controls |
| Complete active SQL fixtures | 37/37 pass on 59 migrations | All included SQL sources and fixtures; private Auth schema absent |
| Active financial phase | 38/38 pass on 59 migrations | Actual gateway/SQL; excludes F05 exactly |
| Merchant scaling | 67/67 pass | Actual local SQL/HTTP, deterministic stale-CAS race and cache parity; not independent-connection throughput |
| Android | 80 model suites; 64 readiness assertions; 441 framework cases | Original-certificate signed candidate and independent cached-toolchain clean rebuild; no physical handset acceptance |
| Face service | 14 Python tests; 4 actual provider/Python checks | Synthetic public fixtures; no live customer image or independent camera/PAD acceptance |
| Browser journeys | 8 discovered; manual managed-preview observations recorded | Standard-runner automated execution remains unverified after local install/process restrictions |
| Hosted post-migration aggregates | 4 cache mismatch counts all zero; 56 accounts / 99 journals / 198 entries | Read-only; zero balance discrepancies, unbalanced journals or negative customer/merchant accounts |

The hosted check also confirms all three retention indexes are valid and one
hourly cleanup job is registered. MFA is still **false**, with **one active
operator and zero verified TOTP factors**. No factors were fabricated and no
operator was locked out. Private RLS/no-policy INFO notices fit the service-only
design; the provider leaked-password-protection warning remains.

## Finding disposition

“Source corrected” means the reproduced defect is addressed and locally checked.
It does not mean the candidate gateway/UI has been activated or accepted hosted.

| Findings | Disposition | Remaining boundary |
| --- | --- | --- |
| F01 declined reference | Source corrected; gateway and SQL active | Paired original-reference acceptance and external operating evidence |
| F02/F10 stale and duplicate approvals | Source corrected; safe SQL active | Current portal/gateway workflow acceptance |
| F03 admin MFA | Partial | Real enrollment, enforced AAL2, second verified access administrator and loss/recovery exercise |
| F04 missing migration source | Source corrected | Observed CI/promotion result; hosted backup restore is separate |
| F05 uncertain reset resolution | Staged, blocked and open | Managed Auth and independent concurrent-writer staging proof, separate approval; no flag enablement |
| F06 IOU intent | Source corrected with native parity | Publish/accept paired web, API and native answers |
| F07 original-secret screening | Partial | Reviewed production breach coverage and deployed policy acceptance |
| F08 browser credential isolation | Partial | Coordinated canonical-origin deployment and real browser/device acceptance; legacy transports remain separate |
| F09 rewards route context | Source corrected with native regression | Paired published journey acceptance |
| F11 scheduled worker | Source corrected; safe SQL active | Authorised hosted synthetic worker acceptance |
| F12 refund visibility | Source corrected; safe SQL active | Signed-in queue/UI acceptance |
| F13 background notifications | Open service boundary | Foreground inbox refresh is the current promise; durable OS push is not implemented |
| F14 native accessibility | Partial | Actual TalkBack, large text, focus and complete handset journeys |
| F15 authoritative documentation | Updated candidate entry points | Final approved handover and public URL/release register |
| F16 CI/promotion enforcement | Partial | Observe a real run rejecting failures and exact-artifact promotion; browser/device gates remain |
| F17 APK build coupling | Source corrected | Final 2.14 immutable artifact is byte-verified; verified build-input reconstruction is available; retain independent build inputs |
| F18 merchant data boundaries | Partial | Shared metadata writer/revision and whole tenant histories remain; authoritative tenant writes and measured load are required |
| F19 polling | Partial | Compact consumer snapshots/cursors plus bandwidth, battery and load measurements |
| F20 loyalty archival | Open | Normalised authoritative members/events/claims/attempts and archival; lifetime caps remain |
| F21 biometric lifecycle | Partial; standalone SQL and gateway active | Operational retention/fulfilment, backups and key lifecycle acceptance |
| F22 installed Android acceptance | Open | Original-certificate ART install/upgrade, OEM camera/keystore, poor network and accessibility matrix |
| F23 operational assurance | Open | Timed hosted restore with keys, RPO/RTO, load/failover, independent security and genuine provider/PAD acceptance |
| F24 historical public editions | Open | Owned URL register, labels and accepted old-link/sunset behavior |

The shared merchant writer still has its project-wide ceiling. Loyalty member,
event, private claim and attempt safeguards have not been removed. No
two-million-active-user capacity claim follows from these changes.

## Candidate identity and promotion

`source-provenance.json` identifies the prepared candidate separately from live
gateway versions and historical releases. `dist-sha256.json` records actual
public source/export bytes, including the IOU and password-policy modules.
`verification/readiness-2.14.0/asset-reconciliation.json` records each changed or
added asset against reviewed commit `99b7b1024978ba0dc3a143c0033db0af5e3ebc4e`,
its reason, and canonical export source where applicable. Historical manifests,
captured live baselines and the dated 2.13 web-hotfix record remain intact.

The reviewed publication was explicitly approved. Preserve the active59-only export and verify exact coordinated web/server/native artifact identities. Private F05 work remains outside this public source and needs separate managed Auth/concurrency staging acceptance and approval; it cannot be installed from this export. For real money, all six private evidence gates in
`scripts/check-live-readiness.mjs` must have current accepted reports for the
exact artifacts. Passing that validator checks evidence integrity, not provider
truth, independent signatures, legal approval or an automatic readiness score.

The operating procedures are in `docs/OPERATIONS-RUNBOOK.md`. Current capability
boundaries and executable verification commands are in `READINESS.md`.
