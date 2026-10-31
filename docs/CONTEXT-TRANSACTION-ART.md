# Contextual transaction artwork

Generated with the built-in `image_gen` tool on 18 October 2026, using one independent call per asset. This pass restores the original illustration-first identity and replaces arbitrary acrobatic gestures with credible actions tied to the screen's job.

## Identity authority

The original local assets were inspected before generation and supplied as references:

- `dist/assets/clarity/student-expressive.png`: original face, hair, phone and casual identity.
- `dist/assets/clarity/thoughtful-refined-4.13.png`: original Kente shirt, natural standing pose and proportions.
- `dist/assets/clarity/friends-editorial.png`: original recurring cast and Ghanaian casual textile language.

The rejected black-blazer/green-cuff artwork was not used as an input. Both new scenes use the recurring curly-haired student, black ink, white-filled body and loose white trousers, with an ochre/orange/navy/cream Kente short-sleeve shirt. The weave uses rectangular blocks, small navy motifs, narrow stripe bands and checker panels. Colour stays in clothing.

## Final assets

| Asset | Screen job | Meaning |
| --- | --- | --- |
| `dist/assets/clarity-context/payment-phone.png` | Prepare a payment | Student leans toward an upright phone and taps to enter or check the recipient. This is preparation, not success. |
| `dist/assets/clarity-context/decision-phone.png` | Consider the proposed payment | Student checks the upright phone with the other palm open, thoughtfully pausing before a tap. |

No campus, background, numerical figures, rings, text, payment success marks or unrelated trade-off props are baked into the scenes. The interface remains responsible for live financial facts, the focus ring and transaction state.

Both PNGs are 1536 × 1024 RGBA with genuinely transparent pixels. They are copied byte-for-byte from the generator output without recolouring, background removal, cropping or raster editing. Visual inspection confirms full bodies and original textile palette. Source/destination bytes were verified identical.

## Full prompts

Each generation used this exact common prompt:

Use case: illustration-story. Asset type: finished production transparent illustration cutout for the Lumo student app. Inputs are ORIGINAL Lumo identity references, not targets: image 1 supplies the recurring curly-haired student face and phone; image 2 supplies the authentic casual KENTE short-sleeve shirt and standing proportions; image 3 confirms the original cast and Ghanaian casual clothing language. Draw THIS SAME young adult man with solid black cloudlike curly hair, long angular nose, dot eyes with clear expressive eyebrows, white-filled face/hands/body, black crisp confident contour lines and plain loose WHITE trousers. Wear the actual Ghanaian casual Kente button-front short-sleeve shirt from image 2: alternating woven rectangular ochre/yellow/orange blocks, deep navy and cream geometric motifs, narrow woven stripe bands and checker panels. Preserve that textile identity and warm palette, not a random colourful shirt. Sneakers can carry a small matching woven inset while the trousers remain plain. Grounded credible student proportions and weight, subtly enlarged expressive hands, clear legible human acting and warm intelligence; no stretched elastic anatomy, no acrobatics, no huge foreshortening or balancing tricks. Whole body including complete shoes/hair/hands fully within a landscape 1536x1024 canvas, safe 60px margins. Flat editorial black-ink/white-body illustration, colours confined to actual woven clothing. Transparent background with real alpha; no white rectangle, checkerboard, halo, shadow, gradients, glows, environment, campus, building or ground plane. No black blazer, black jacket, black trousers, lime cuffs, GREEN, rings, circles as decoration, floating objects or symbols, logos, numbers, amounts, UI text, checkmarks, cash, coins, handover or celebration. Leave phone screen entirely blank. Strong character expression must come from eyes, brows, mouth, hands and natural posture. One character, one phone, one understandable pre-authorisation action.

### payment-phone

Scene: the student stands with both feet on an ordinary stable stance, one knee relaxed, torso leaning slightly forward toward an upright phone held naturally at chest height in his left hand. His right index fingertip is touching the front screen, actively entering or checking a recipient. Both hands and the phone remain visibly separated from the chest. His eyes concentrate on the screen with brows lifted just a little, and a small engaged smile says 'I know what I am checking'. His mouth is not open in celebration. Three-quarter view of the full body; show the tapping finger credibly touching the upright phone, not pointing elsewhere. Natural focused movement, not idle phone holding. A PREPARATION action before any payment is authorised.

### decision-phone

Scene: the same student stands in an ordinary grounded stance, torso leaning a little toward the upright phone held naturally in his left hand at chest height. His right hand is open with palm softly up at waist-to-chest height, pausing before a tap. His eyes are clearly checking the phone, one thoughtful eyebrow raised and lips gently pressed into a knowing slight smile. The pose communicates considering what a choice changes, not fear, shame or alarm. The free hand is not pointing at imaginary objects. Three-quarter full-body view. The upright phone and open palm are the only elements of the action. No food, book, backpack, laptop or extra shoe prop. This is a believable pause before an unconfirmed decision.

## Generation provenance

- `payment-phone.png`: `/workspace/scratch/2b244a32f08e/generated_images/exec-dead093b-9b5e-4657-90f1-fe9c79487661.png`.
- `decision-phone.png`: `/workspace/scratch/2b244a32f08e/generated_images/exec-984f5f35-545f-435c-a76a-df6a3a99fc0e.png`.

These are flattened static artwork. This pass does not alter shared JavaScript, CSS, financial calculations or transaction rules. Both scenes remain appropriate before authorisation; neither visually claims that a payment has happened.

