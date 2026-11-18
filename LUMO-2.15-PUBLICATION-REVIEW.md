# Lumo 2.15 publication review

The naming change is built: the product, assistant and mascot share the name **Lumo**. Chat uses **Ask Lumo** and learning uses **Learn with Lumo**. The existing artwork is retained. Exact display aliases handle old application-owned labels without rewriting customer names, questions, financial records or progress.

## Verified deliverables

| Check | Result |
| --- | --- |
| Consumer tests, including old-backend display compatibility | 1,920 passed |
| Merchant and admin branding/regressions | 741 passed |
| Backend tests | 448 passed |
| API tests | 28 passed |
| Android model suites | 80 passed |
| Android framework tests | Prior complete branding run: 444 passed; final exact-status compatibility followup: 40 passed on API 28/35 |
| Public assets | 283 reviewed; 42 changed, 241 unchanged |
| Historical database migrations | All 59 byte-identical |
| Signed APK | 2.15.0 / 21500; original signing certificate retained |

APK SHA-256: `b1f1268c5d871c76538e83d1c83a858b0800c34dd9e00d6c20bdb3e33b6a4c1a` (4,645,839 bytes).

Source ZIP SHA-256: `ca5cf642a6c202ffaf5488cc7a50206508cde0dab75e39cc83943f27a73434f7` (5,186,016 bytes). The APK and source ZIP are delivered separately. Signing material and generated QA files are excluded.

## Current publication

| Destination | Verified state |
| --- | --- |
| Consumer Vercel | 2.15 is READY at https://lumo-connected-pilot.vercel.app/. Deployment `dpl_BUfUbWB4TjReK2xiQ5dH5hP3i9Jg`; immutable origin https://lumo-connected-pilot-6fw6xyyfq-williedark-6795.vercel.app. The 303-file submission was checked by SHA-1 and size. Canonical release JSON identifies 2.15/21500; the public APK returns HTTP 200 without redirect and matches final SHA-256 and 4,645,839 bytes. Existing access/protection settings are preserved. |
| Merchant Vercel | 2.15 is READY at https://lumo-merchant.vercel.app/. Deployment `dpl_Eq1GBHz54kvfiF22AQ9Nq1tyxViq`; immutable origin https://lumo-merchant-papx34b4v-williedark-6795.vercel.app. Both release JSON files identify the final 2.15 APK; canonical and immutable downloads return HTTP 200 and match its SHA-256 and 4,645,839 bytes. |
| Merchant Mobile Site | Version 42 is published at https://lumo-merchant-mobile.oness15.chatgpt.site. Source `39790ce0341ca0d9c9f623cd23779fd975820477`; deployment `appgdep_6afd6614768c81918364c7363ac9fe53` succeeded. Final 2.15 source, APK and immutable fallback pin are packaged together; 738 tests pass and the actual Worker build succeeds with 88 assets. Existing project identity, D1 DB binding and public audience are preserved. |
| Marketing and Admin Sites | Current marketing publications and Admin Site 14 are already published. Admin custom access is retained. |
| Supabase project `iwutbrljiiodamtyoorg` | Branding gateways approved 26, admin 9 and maintenance 5 are ACTIVE. All 82 hosted source files match the exact frozen reviewed candidates and six safe HTTP checks pass. Access 8, all 59 migrations, Auth settings and financial rules remain unchanged. The immutable candidate review is [publication-approval.json](backend/verification/branding-2.15.0/publication-approval.json). |
| Public GitHub repository `lumoghana/signal` | Explicit user approval covers this reviewed source publication transaction on `feat/lumo-brand-2.15.0`, including updated admin-console source. Its exact resulting commit, branch-head confirmation and hosted CI outcome are recorded externally after publication to avoid self-referential commit hashes. Excluded private Auth-fence files, signing material, APKs and generated QA data remain outside source. |

Both canonical APK restore helpers use the verified final immutable merchant artifact URL. Actual public network restoration, existing-artifact verification and corrupt-byte rejection passed for each helper. The earlier partial uploads and Merchant LOCAL-HOLD archive belonged to a superseded first APK and were not reused.

The live consumer welcome, Explore and Ask Lumo sample scene were inspected in the browser: visible headings, companion alt text, sample answer and explanation use Lumo. This is bounded browser evidence. It does not establish complete authenticated-journey, physical-handset or production-provider acceptance. The naming release does not change the prior readiness rating or enable real money.

Earlier automatic approval review rejections were resolved by explicit user approval for the named existing Vercel consumer destination, Supabase project and public GitHub source disclosure. The approved publication resumed through native tools.

There are no database migrations, Auth configuration changes, new financial rules or live-provider activation in this naming release. Historical records and frozen baseline/approval evidence remain authentic. Current runtime/source-transaction state is in [source-provenance.json](source-provenance.json).
