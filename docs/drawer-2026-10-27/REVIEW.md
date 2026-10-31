# Scrollable Menu sidebar

The monochrome edition now opens Menu from the right over the current page. Its heading and close button stay fixed while the grouped destinations scroll. Home, Ask Lumo and Menu remain the three bottom items. Existing internal More navigation remains compatible.

The presentation reuses the native task controller for retained page state, inert background, keyboard focus, Escape, backdrop, close and browser Back. Selecting a destination first closes the sidebar, then uses the existing feature route. The edition adapter restores the QR singleton to its retained page when native dismissal finishes. No shared financial or account engine changed.

Browser checks covered 320×568, 375×667, 390×844, 390×480, 568×320, 768×1024 and 1100×900, plus 150% and 200% text at 320×568. All nine layouts reported zero palette, horizontal overflow, text clipping, unreachable content or collapsed-scroll findings. Raw results are in `layouts.json`. Desktop keyboard scrolling reached Sign out while the close control stayed visible. This is browser layout evidence, not a claim about live banking or every physical device.

The required sequential regression command and its results are in `regression.log`; focused native drawer checks are in `focused-tests.log`. Temporary QA assets are removed before packaging.
