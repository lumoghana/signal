# Public Lumo source export

This branch contains the Lumo2.12.2 application, backend functions, migrations,
build scripts, ordinary unit tests, and retained licenses from reviewed source
commit `f9f3a18336537daf2b0233e188591c685507dd31`. The original reviewed implementation was
`7faa0d820a97cded91f45093889d5066fe2676e2`.

Operational deployment records, internal verification reports, and release audit
reports are outside this public export. Any historical `source-provenance.json`
already present on public main remains unchanged; it is not a current deployment
receipt. Current public version and recovery capability facts are in
`dist/consumer-release.json`. Runtime/application files and ordinary tests match
the reviewed source snapshot exactly.

## Tests

The normal root unit suite needs no omitted operational evidence:

```sh
npm test
```

The backend behavior profile retains the exact test files and skips only three
historical provenance assertions that require the omitted private audit records:

```sh
npm ci --prefix backend
node --test --test-skip-pattern='^(audit retains historical source records|audit source matches explicit reviewed deltas|isolated dependencies retain baseline)' backend/tests/*.test.mjs
```

Those three audit assertions can be run from the authorized private review
checkout containing its original evidence. They are source-history checks, not
behavioral test fixtures. SQL/Auth integration, hosted acceptance, deployment,
and physical-device checks require a separate isolated environment and authorized
configuration; publishing this branch does not perform them.

## Face matcher inputs

Model binaries and portrait test images are not uploaded with this source.
Pinned official URLs, checksums, and licenses remain. The Python function build
hook downloads and verifies its models before packaging; inference does not
download models. See `face_service/README.md` for the opt-in local fixture helper
and the14Python/fourNode-to-Python regression checks. Historical QA screenshots
also stay outside this export.

Face profiles are saved only after explicit storage consent. New selfies are
compared with the account's encrypted template, and the private recovery key
remains required. SMS/GhanaCard checks remain simulated; live-person checks are
unverified. Original enrollment/recovery photos are transient.
