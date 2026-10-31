# Contextual account illustration extension

Two new activity-specific illustrations extend the original textile character family. These are generated extensions, not recovered originals. The eight original illustration-first masters remain intact.

## Assets and intended meaning

| Asset | Activity | Suitable routes | Unsuitable use |
| --- | --- | --- | --- |
| `dist/assets/clarity-context/identity-check.png` | The original curly-haired male student positions a blank identity card alongside an upright phone to verify identity. | Identity capture, identity review and profile identity details. | OTP completion, account approval or confirmed transaction success. |
| `dist/assets/clarity-context/account-records.png` | The same student follows a notebook page with his index finger while consulting a phone on the desk. | Account details, records, activity, receipts, settings and help context. | An assertion that a payment succeeded or that a financial projection is confirmed. |

The artwork deliberately depicts the activity, not a badge or a generic palm-up pose. Root implementation owns final route selection.

Both scenes use the original black outline and white body treatment, black curly hair, expressive profile features, loose white trousers and substantial woven short-sleeve Kente shirt. Ochre, orange, navy and cream rectangles, stepped diamonds, checks and black-and-cream stripes remain within the textile areas. Neither image includes a blazer, lime cuffs, green garment, decorative ring, official identity details, readable writing, currency, numerical amounts, status icon or embedded interface.

## Method and provenance

Generated with the built-in `image_gen.imagegen` tool, one call per asset. The original masters below were inspected and supplied as style and recurring-character references:

- `dist/assets/clarity/student-expressive.png`
- `dist/assets/clarity/thoughtful-refined-4.13.png`
- `dist/assets/clarity/money-review-refined-4.13.png`

The selected generated PNGs were copied into the project without editing or overwriting the references. Each final is 1536 × 1024, RGBA, with the generated alpha preserved.

| Final asset | SHA-256 |
| --- | --- |
| `identity-check.png` | `0da0074d2ed4522bbfda494140d102d23255f0e59270ddeceb4e455e37d99fe7` |
| `account-records.png` | `da2bf5693bf1e398608b1c82c8e92ff5e47f3e62e1141b31fcbba6f8e1a1c9e2` |

## Inspection

Both outputs were visually inspected for the requested activity and consistency with the references. Identity has one phone and one blank, nonofficial card. Records has a clear page-following gesture, open notebook and phone on desk. Full head, hands, clothing, body, furniture where present, and shoes are visible. Neither scene uses a cropped character.

Alpha-channel inspection confirmed transparent surroundings. At alpha ≥ 16, subject bounds are `(531, 8, 1076, 1015)` for identity and `(216, 8, 1329, 1004)` for records. Fully transparent pixels account for approximately 83% and 65% of the respective canvases. RGB values under fully transparent pixels do not create a visible backdrop. No background was composited into either delivered asset.

These are raster and content checks. Browser layout and real-phone checks are separate.

## Final prompts

### Identity check

Use case: illustration-story. Asset type: transparent PNG scene for the Lumo mobile app, 1536 x 1024 landscape canvas. Reference images are style and recurring-character references, not edit targets: image 1 student-expressive.png; image 2 thoughtful-refined-4.13.png; image 3 money-review-refined-4.13.png. Generate ONE new scene using exactly the same recurring youthful curly-black-haired male student and the same editorial drawing language. He stands full body, wearing the original SHORT-SLEEVED COLLARED KENTE SHIRT fully covered in woven ochre-orange, yellow, deep navy and cream rectangles, stepped diamonds and black-and-cream thin horizontal stripes; white plain loose trousers and the matching patterned canvas shoes. All skin/body shapes are flat white enclosed by crisp black outlines, solid black curly hair, simple dot eye, long expressive nose; no realism, gradients or skin shading. Action: he holds a smartphone upright in his left hand and a small blank identity card in his right hand, deliberately positioning the card beside and in front of the phone to verify identity, eyes looking attentively at the phone/card. Clear separate recognisable hands with sensible five-finger anatomy, one card and one phone only. Show the actual activity, not a generic palm-up gesture. Focused but calm expression. Entire head, elbows, hands and shoes remain inside canvas with generous clear transparent margin. Crisp substantial black primary outlines and thinner interior lines match reference 2. Keep the vivid woven textile on the shirt; no blazer, black jacket, lime cuffs, green garment, ring or logo. Background: truly transparent alpha around the complete isolated full body, absolutely no halo, glow, shadow, grey wash, backdrop, campus, checkerboard pixels or frame. No money, text, numbers, legible writing, official identity details, national flag, crests, badge, checkmark, shield, padlock, currency or embedded interface. The identity card is a completely blank rounded-corner white card outlined in black. Transparent landscape output, 1536 x 1024.

### Account records

Use case: illustration-story. Asset type: transparent PNG scene for the Lumo mobile app, 1536 x 1024 landscape canvas. Reference images are style and recurring-character references, not edit targets: image 1 student-expressive.png; image 2 thoughtful-refined-4.13.png; image 3 money-review-refined-4.13.png. Generate ONE new scene using exactly the same recurring youthful curly-black-haired male student and the same editorial drawing language. He sits full body at a simple thin black-outline white desk, wearing the original SHORT-SLEEVED COLLARED KENTE SHIRT fully covered in woven ochre-orange, yellow, deep navy and cream rectangles, stepped diamonds and black-and-cream thin horizontal stripes; white plain loose trousers and matching patterned canvas shoes. All skin/body shapes are flat white enclosed by crisp black outlines, solid black curly hair, simple dot eye, long expressive nose; no realism, gradients or skin shading. Specific activity: he carefully consults a simple open paper folder/notebook on the desk. His right index finger follows a blank page while his left hand holds the opposite edge of the folder open. One upright smartphone leans against the folder on the desk and faces him. He leans forward with an attentive, inquisitive expression, clearly looking at the records and phone, not posing toward the viewer. Pages are blank white with at most a few thin nonsemantic black lines; no readable text, numbers, graphs, amounts or icons. One student only. Clear sensible hands and finger gesture. Show complete body and both shoes, entire desk and simple chair within the canvas, generous clear transparent margins. Crisp substantial black primary outlines and thinner interior lines match reference 3. Keep the vivid woven textile on shirt and shoes. No blazer, black jacket, lime cuffs, green garment, ring or logo. Background: truly transparent alpha around the complete isolated scene, absolutely no halo, glow, shadow, grey wash, backdrop, campus, checkerboard pixels or frame. No money, text, writing, numbers, badge, checkmark, shield, padlock, currency or embedded interface. Transparent landscape output, 1536 x 1024.

