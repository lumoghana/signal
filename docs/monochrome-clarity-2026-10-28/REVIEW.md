# Monochrome clarity refinement · 28 October 2026

The user requested an entirely monochrome surface with only a small Lumo-colour accent for insight or clarity, and for the illustration and question to blend into one block.

The four local campus scenes retain their student subjects, poses and Legon setting in grayscale. The Home Ask Lumo panel and enlarged-text fallback use the same neutral background. A tiny lime star identifies the leading insight question. Navigation, quick actions, welcome, QR selection, Chat send, milestones and selected collection controls are neutral; existing thin financial-insight graph and Pause highlights remain the accent.

No financial engines, shared scripts, storage namespaces, routes or mandate rules changed. Existing generated colour artwork remains in source history and local assets; Home loads only the selected monochrome scene. Image prompts are retained here.

## Validation

- `node scripts/check-edition-parity.cjs --regression --sequential`: 194 passed, 0 failed. Existing baseline hashes and script order passed.
- Browser, 375×667: view 375×566, scroll size 375×566; hero 327×166. Image loaded, one-page Home.
- Browser, 390×844: view 390×743, scroll size 390×743; hero 342×190. One-page Home.
- Browser, 320×568 with 200% root text: no horizontal overflow (view and scroll width 305px); content grows and scrolls vertically. Neutral readable fallback confirmed.
- Leading question opens real contextual Chat and renders the confirmed selected-goal progress and calculation link.
- Separate read-only palette review found no cascade or contrast blockers.

The QA viewport fixture was removed before packaging. Everyday and Hibiscus were not changed by this edition-specific presentation request.
