# Readiness 2.14 active public source evidence

This public export contains the complete **active59** migration release and exact source for deployed lumo-approved 25, lumo-access 8 and lumo-admin 8. It excludes the private unapplied managed Auth write-fence migration and its two stage-only SQL fixtures. No installer or shipping CI step skips an included migration: all 59 included files are bootstrapped, and all 37 included SQL fixtures are executed.

`active-deployment.json` records the post-deployment versions, actual bundle hashes and exact file hashes. The source verifier requires all 3 imported runtime closures to match those live-verified bytes. Access `resetFenceEnabled:false` and admin `recoveryResetsEnabled:false` must remain literal index options. The former full private candidate is not the parent or source of a public release commit; the public source baseline is the original `99b7b1024978ba0dc3a143c0033db0af5e3ebc4e`.

`rollout-plan.json` explicitly inventories excluded private work. The verifier requires those 3 files to be absent, checks the exact59-file migration lineage and rejects external/computed imports, path escapes, missing baselines or unreviewed runtime changes. `active-schema.mjs` independently checks the real isolated schema for absence of the private Auth marker column, Auth trigger and fence/reconcile/cancel helper functions. Both runtime recovery flags remain disabled; this export provides the existing guarded access7-compatible password-only protocol.

`live-baseline-sha256.json` is unchanged. It pins the 50 exact pre-change source files, 47 original migration hashes, 5 recovered already-applied sources and historical release manifests/patches. Its digest remains pinned in the verifier. Historical maintenance/audit/loyalty manifests and source references are not regenerated. The isolated maintenance function retains its 31-file historical import closure and is not deployed by this release.

`review-notes.json` contains per-file rationale and evidence references. Existing active financial, MFA, legacy reset, stored-face and retention assertions remain. The two excluded SQL fixtures tested private F05-only schema; their private positive assertions are not claimed as public/live acceptance. The former mixed queue-success assertion now proves the private schema is absent; MFA denial and all active financial/policy assertions remain. The 7 reset HTTP tests now exercise the deployed password-only protocol, retaining original ownership, definite-rejection, uncertain-outcome and new-password policy checks.

The pinned Acorn parser follows actual import/export declarations and literal dynamic imports, including same-line declarations and cross-function sharing. Comment/string decoys cannot hide shipping dependencies. Source records do not establish genuine liveness, handset acceptance, provider readiness or a real-money score.

After reviewing any permitted release-record change:

```sh
node scripts/update-readiness-source-manifest.mjs --write --frozen
node scripts/update-readiness-source-manifest.mjs --check
npm test --prefix backend
node scripts/verify-clean-database.mjs --fixtures
LUMO_PGLITE_MODULE="$PWD/verification/node_modules/@electric-sql/pglite/dist/index.js" node backend/verification/readiness-2.14.0/financial-regressions.mjs
LUMO_PGLITE_MODULE="$PWD/verification/node_modules/@electric-sql/pglite/dist/index.js" node backend/verification/readiness-2.14.0/independent-security-rollout.mjs
```

The writer updates only this release's source record and never rewrites historical baselines. The source-review status is separate from actual deployment evidence. The private Auth fence is not installed or published here and requires separate managed Auth/concurrent-process staging evidence and approval before any future inclusion.
