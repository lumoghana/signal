# Campus Pay discovery artwork

`dist/assets/clarity-tasks/campus-scan.png` is a new task-specific transparent foreground for discovering a Campus Pay merchant. The student scans an abstract merchant placard before authorisation. There is no food, cash exchange or payment success signal, so this can accompany food, printing and transport merchant discovery.

## Provenance

- Method: built-in image generation, transparent-background mode.
- Generated source: `/workspace/scratch/2b244a32f08e/generated_images/exec-484609be-3c2f-4e0b-aad9-c4bab730016f.png`.
- Project asset: `dist/assets/clarity-tasks/campus-scan.png`.
- References inspected and supplied: `dist/assets/clarity/student-expressive.png` and `dist/assets/clarity/friends-editorial.png`.
- Reference role: the original face, ink contours and warm ochre/orange, dark navy and cream Ghanaian textiles. Both original files remain unchanged.
- The generated source was copied byte-for-byte. No image editing, recolouring, resizing, alpha manipulation or code-rendered substitute was applied.

## Validation

The output is a 1536 × 1024 RGBA PNG with genuinely transparent empty pixels. Visual inspection confirmed one upper-body student, large upright phone and abstract scan placard, black ink/white body construction, patterned textile shirt, and no text, amount, green, ring, food, cash handover or success mark. The counter is a narrow neutral edge. No campus scenery is baked into this foreground; the app can retain its separate Legon layer.

The apparent dark RGB backdrop in an alpha-unaware preview is transparent: sampled empty locations around the phone, placard and shirt have alpha 0. The generated subject reaches alpha 254; its PNG bytes are preserved as supplied by the image tool. No claim of browser or phone rendering verification is made.

The abstract mosaic is illustrative and intentionally lacks a working QR's finder-square geometry. It is not a real merchant code and should not be presented as scannable.

## Full generation prompt

```text
Use case: illustration-story / style-transfer derivative.
Asset type: one production foreground illustration for Lumo Campus Pay discovery and scanning, before any payment is authorised.
Reference images: the two supplied original Lumo images are cast, face, line-work and Ghanaian textile references only. Keep those source files intact. Create a distinct new scene in their same editorial drawing family.

Primary scene: a Ghanaian university student's upper body and expressive hands, holding a large upright smartphone toward a small freestanding merchant scan placard on a simple neutral counter edge. The student wears a short-sleeved Ghanaian Kente shirt using the original warm ochre/orange, dark navy and cream geometric woven pattern. White/off-white body shapes, black curly hair, simple dot eyes and the original angular friendly facial features. The head turns attentively toward the phone and placard; the gesture clearly communicates scanning and checking a merchant before paying. Relaxed confidence and a purposeful scanning posture.

Composition: landscape 1536 by 1024 pixels. Tight upper-body and hands composition, no full-body distant figure. A large upright phone and large scan placard together occupy at least 40 percent of the canvas and are immediately recognisable at small mobile sizes. Phone slightly angled toward the placard, with their relationship obvious. On the phone screen show only four thick black scan-corner brackets around a small abstract mosaic. Placard shows a larger abstract black block mosaic with no real machine-readable QR geometry, no finder-square pattern. A few plain black scan-corner brackets on the placard are enough. Use clean open negative space around both objects so the gesture reads instantly. All head, hands, phone, placard and counter edge remain fully within canvas margins. The counter is only a narrow black line, not a retail/food scene.

Drawing: bold clean black ink contours, simple white/off-white filled body and objects, lighter secondary detail lines, recognisable original textile pattern confined to the shirt/sleeves. Crisp premium editorial art, no photorealism. Naturally simplified hands that hold the phone convincingly. One student only. No black blazer.

Background: genuine fully transparent alpha across all empty pixels, no white rectangle or painted background. No Legon architecture baked into this foreground. NO halo, glow, gradient, vignette, drop shadow or ground shadow. This must be a clean transparent cutout that can sit over a separate campus background.

Strict constraints: no text, letters, numbers, logos, currency, amounts, coins, rings, green or lime anywhere. No checkmark, success signal, tick, celebration, money transfer, cash exchange, food, meal, printer, transport vehicle or cash handover. The merchant is still being discovered; no transaction has happened. Warm ochre/orange, dark navy and cream only inside the Ghanaian Kente clothing; everything else black ink with white/off-white solid shapes. Match the reference face and outline language. Deliver a single 1536x1024 RGBA transparent PNG.
```

