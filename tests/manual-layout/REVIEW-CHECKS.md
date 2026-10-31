# Whole-product review source pins and serial checks

The review coordinator runs one heavy Node fixture command at a time. Domain
owners send the exact command after their test and source checkpoint is ready.
Syntax-only checks can run separately. Do not run another heavy fixture suite
beside the active queue command.

Capture the current source, without loading the app:

```sh
node tests/manual-layout/capture-review-pins.cjs
```

The default output is `docs/review-2026-10-27/source-pins-current.json`.
`--output /absolute/path.json` writes another checkpoint. Pins include each
edition's commit and opened baseline, index, exact script/style order, runtime
source hashes, test-helper hashes and source fingerprints. They identify local
source; they do not establish which version is published.

Run a queued check using Node arguments after `--`:

```sh
node tests/manual-layout/run-review-check.cjs --owner primary --name primary-finish -- --test --test-concurrency=1 tests/primary-finish.test.cjs
```

The runner holds `/tmp/lumo-deep-review/runtime-test.lock`, captures the exact
arguments and named test files, records source before and after, and saves full
stdout/stderr plus JSON evidence under `docs/review-2026-10-27/test-runs`.
Source changes during the run are listed explicitly; a passing exit code does
not claim that later edits have been tested. Fixes need a new queued run only
when new source or a failed check requires it.

The retained peer contract scripts support `--regression --sequential` (or
`LUMO_TEST_CONCURRENCY=1`). Run the complete required gate with that option.
The same manifest regression list and assertions run, with Node's
`--test-concurrency=1` passed to the existing child runner to limit peak memory.

After all domain source is frozen, perform index and peer integration only on
the coordinator's explicit checkpoint. Preserve edition identities and storage
keys, and update provenance hashes only after those exact sources pass. Final
browser geometry and visual review are separate from these DOM fixture checks.
