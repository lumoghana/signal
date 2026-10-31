# Plan button consistency

23 October 2026. Starting point: published version 18 (`274f3e454e455179a395eaed72bd02d32551ff4a`), checkpoint `checkpoint/pre-plan-button-cleanup-v19`.

Changed Add a cost to Add a budget item. Add a box now uses the existing secondary button style, matching the other outlined actions. No CSS, calculations, saved data, navigation destinations or form behavior changed.

Eight existing Plan journey checks pass. Both buttons were exercised in the actual browser and opened their existing editors. At 320 and 390 CSS pixels, all four Plan action buttons have matching heights and no horizontal text overflow. Screenshot: plan-buttons-390.jpg.
