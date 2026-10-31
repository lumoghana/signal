# Money Story sidebar link

Reproduced the published v39 issue in the browser: Home → Menu → Money Story closed Menu and returned to Home. The Money Story route was registered, but its added tab wrapper launched before the sidebar's asynchronous history close completed.

The edition handler now sends Story and Cards through the existing native `L.go` close queue. Plan and Payments retain their existing queued tab handoff; other task links are unchanged. The shared controller, analytics, account data and financial rules are unchanged. The presenter script URL is refreshed so the corrected handler loads on the published site.

Browser verification of the final fix:

- Menu opens the Money Story dashboard and stays there.
- The 30-day filter updates the story.
- Opening a payment receipt and closing it returns to the same 30-day story.
- Browser Back returns Home; Forward restores the story and period.
- The related Cards root also opens correctly from Menu.

Focused regressions assert page content and browser history together, including deferred native history, the older core listener running first, and Back/Forward. The final required sequential gate and counterexamples are recorded alongside this review. Shared baseline hashes remain pinned.

Final validation: 49/49 focused navigation checks and 161/161 required Node entries passed, with all eight edition contracts passing. An in-memory negative control using the exact v39 presenter produced the four expected Story/Cards failures under both listener orders; it did not change the runtime files.
