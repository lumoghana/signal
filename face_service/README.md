# Saved-face verification

This server component compares a later capture with the face enrolled for one
account. It performs real feature extraction and comparison. It does not search
other accounts, verify a Ghana Card, or prove that a live person is present.

## What is saved

Three consented camera JPEGs produce three normalized 128-dimensional face
vectors. AES-256-GCM encrypts the vectors and enrolled-frame hashes. Authenticated
encryption binds the template to the account, consumer/merchant/admin module,
template ID, model checksum, and consent version. Only the encrypted template
is stored in the private database. Browser and Android responses contain status
metadata, never embeddings or ciphertext. Original JPEGs are transient and are
not written to files or database storage.

Consent version is `2026-11-16.face.1`. Old hash-only enrollment cannot be
converted: users must sign in, confirm their current password, consent, and
capture again. Explicit removal requires the current password, clears stored
ciphertext, and invalidates face proofs. Backup retention is governed by the
database retention policy; removal does not claim immediate backup erasure.

## Recovery boundary

The existing private recovery key remains required. The access service checks
the account, key, request revision, and attempt limit before fetching the
encrypted template. A database attempt is reserved before inference. A signed
successful comparison yields a single-use database proof; the client cannot
supply a score or verdict. Password reset and recovery-key rotation preserve
the face template while invalidating old requests and grants. Removal preserves
the private-key and simulated-SMS routes, including creation of a replacement
key after a completed reset.

Exact reuse of enrolled JPEG bytes is rejected. This is not a presentation
attack detection system: an altered photo, video, mask, or injected camera feed
has not been independently evaluated. Three captures and pose prompts do not
establish liveness. `livenessVerified` and `identityVerified` remain false.

## Deployment configuration

The Python function is `api/face.py` on the consumer Vercel project. Root
`pyproject.toml` registers the Python builder's `vercel-install` hook, which runs
`scripts/prepare-face-build.py` inside its build virtual environment. The hook
downloads missing model weights from immutable OpenCV Zoo URLs and checks their
exact sizes and SHA-256 checksums against `model-manifest.json`, then installs
the pinned Python dependencies. A failed download, checksum, or install fails
the build. The verified models are present before the function files are
collected. Model weights stay outside Git and source uploads; licenses and the
manifest remain in source control. There are no runtime model or dependency
downloads. The static build command does not fetch models, avoiding concurrent
downloads between the static and Python builders.
Root `requirements.txt` lists the four pinned Python dependencies directly, and
`.python-version` selects Python 3.12. Explicit function inclusions cover the
runtime modules, model files, licenses, and manifest. The matcher test code and
portraits are excluded.

The nonsecret build setting `VERCEL_PYTHON_DISABLE_RUNTIME_INSTALL=1` is included
in `vercel.json`. It keeps the Python dependencies in the function bundle rather
than letting the builder defer large packages to a runtime download. Preserve
this build setting when changing project configuration. The verified local
Python bundle is below Vercel's 500 MB uncompressed Python limit.

Set these server-only variables through the deployment secret manager:

| Location | Variable | Value |
| --- | --- | --- |
| Vercel and Supabase Edge | `LUMO_FACE_PROCESSOR_SECRET` | Same independent random 32-byte key encoded as unpadded base64url |
| Vercel only | `LUMO_FACE_TEMPLATE_KEYS` | JSON object mapping key versions to independent random 32-byte base64url keys |
| Vercel only | `LUMO_FACE_ACTIVE_KEY_ID` | One version present in that keyring |
| Supabase Edge only | `LUMO_FACE_PROCESSOR_URL` | `https://lumo-connected-pilot.vercel.app/api/face` |

Never reuse the processor MAC key as a template encryption key. Keep encryption
keys outside the database and client bundles. Retain old keyring entries while
their templates are in use: dropping an old key deliberately makes those
templates unusable and requires re-enrollment. Do not log function bodies,
captures, templates, authorization headers, passwords, or recovery keys.

The internal endpoint requires an HMAC over the exact request body and a
timestamp within 60 seconds. Its response HMAC additionally binds the request
ID and request-body hash. The Edge client pins the exact HTTPS endpoint,
rejects redirects, limits response size, and fails closed on timeout or any
invalid response. Missing configuration disables face enrollment and recovery
without falling back to simulated face approval. Key/SMS recovery remains.

Apply the reviewed stored-face migration before replacing `lumo-access`, then
deploy the matcher with configured secrets and test an authorized synthetic
account before publishing the dependent web and APK releases. Keep old templates
disabled if rolling the code back; do not re-enable hash-only face approval.
The migration wraps the captured current access service. The schema snapshots
under `backend/verification/biometrics-2.12.2` are test provenance, not migrations.

## Local regression checks

Portrait test images are kept outside Git and deployment bundles. Their immutable
official source URLs, sizes, checksums, and rights notes remain in
`tests/fixtures/fixture-manifest.json`, alongside the source and license notices.
Use a Python 3.12 environment with the pinned root requirements installed, then
run these commands from the repository root:

```sh
python scripts/fetch-face-test-fixtures.py
python -m unittest face_service.tests.test_face_service -v
FACE_TEST_PYTHON=python node face_service/tests/test_provider_integration.mjs
```

The helper only downloads `face-a.png` and `face-b.jpg` when missing, verifies their
exact size and SHA-256 before saving, and checks existing files without replacing
them. It does not upload data or run automatically during builds or inference.
The tests generate deterministic photo variations in memory. The separately
recorded `face-a-variation.jpg` and model probe remain historical test provenance;
that JPEG is not required by the current tests or restored by the helper.

The suite contains 14 Python tests and four actual Node-to-Python provider checks.

## Acceptance limits

The 0.6 cosine threshold is a conservative pilot engineering setting, not a
measured false-match guarantee for Lumo's population. Model-directory licenses
are retained. Commercial training-data provenance questions remain open in the
upstream project and require review before a production launch. A validated
liveness/PAD service, Ghanaian-user calibration, representative device testing,
and an operational key/retention policy are still required before considering
face comparison as an independent recovery factor.

Tests use public licensed research fixtures and synthetic database accounts.
They demonstrate the implemented comparison, encryption, and authorization
boundaries; they are not physical-camera, demographic-accuracy, or PAD tests.
