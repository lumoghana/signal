# Local browser acceptance

The eight Chromium phone checks exercise actual application modules and DOM event bindings with synthetic local accounts and a verification-only transport. They complement unit tests; they do not prove real Auth, provider delivery, physical camera/biometrics, installed Android or production capacity.

Run from `verification` after installing its locked dependencies:

```sh
npx playwright install --with-deps chromium
npx playwright test --config browser/playwright.config.mjs
```

For a development runtime where the pinned browser CDN cannot be reached, an already installed recognized Chromium can run the same isolated checks with `LUMO_TEST_CHROMIUM_EXECUTABLE=/usr/bin/chromium`. CI should install and use the pinned Playwright browser normally. This option changes the test binary, not the assertions or the customer application's runtime.

`@playwright/test` is pinned in the parent verification package. By default the server binds only `127.0.0.1:4177`. For supported local preview it accepts `PORT`/`HOST` or `--port`/`--host` from the preview daemon. It serves the actual `dist` assets and a separately located fixture. CSP and the test request route deny external network calls; the server never proxies hosted services. Fake gateway routes only implement reads, quotes, synthetic logout and the actual recorded-money API against a synthetic snapshot. It rejects payment, approval and membership mutations.

Covered journeys: live application welcome/tour entry and exit; directory-to-typed-quote-to-amount; fresh review/approval boundary without PIN execution; paused/original-unknown guards; delayed stale-session quote; rewards Home/Pay continuity; actual Chat-to-recorded-API IOU direction; and explicit private membership consent without saving its raw code.

The fixture's navigation adapter uses the actual route-checkpoint helpers and its views use the real render/bind modules. Only account identity, records and transport outcomes are synthetic. No production module contains a QA injection hook. Do not deploy this directory or include its HTML in the public offline cache.

Failure screenshots/traces contain only these synthetic fixtures and are written beneath `verification/browser-results`, outside `dist`. CI should retain them as diagnostic artifacts, not publish them as product assets.

In the current managed runtime, the pinned Chromium CDN response was truncated and the installed Chromium could not create its required socket, before test assertions ran. `--list` successfully discovers all eight tests. A supported managed preview allowed manual cloud-browser coverage of the same rendered journeys; that evidence is separate from a passing automated CI run. Keep the CI browser gate pending until those eight tests execute on its standard runner.
