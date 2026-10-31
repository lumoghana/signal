# Lumo bold illustration direction

## The visual idea

The consequence comes into focus. Characters should look as though they can see their next step: eyes follow the choice, hands point or compare, and the body carries a definite direction. The illustration should establish a feeling quickly, while the actual money conclusion remains interface text.

This pass intentionally changes the earlier, cautious phone-holding poses. Solid black jackets and hair, large white shapes, confident hands and asymmetrical movement make the figures readable at phone scale. The original Lumo male cast retains his curly hair, angular nose and dot eyes. The recurring female cast has tied-back long braids, a white oversized jacket with a simple black sleeve stripe and black wide trousers.

Clothing uses small lime woven-cuff motifs, with geometric marks rather than intricate orange/navy patterns. Generated art interprets the lime hue; the interface continues to use the exact shared `#CFEF59` token for important figures. The approved wordmarks and font files are untouched.

## New art and use

All paths are within `dist/assets/clarity-bold/`.

| File | Meaning and acting | Ring responsibility |
| --- | --- | --- |
| `bold-home.png` | Student lunges sideways through an open lens, pointing confidently to the next step | The only foreground scene with a physical open ring |
| `bold-welcome.png` | Two students stride forward; one guides while the other looks ahead with a hand shading his eyes | Interface supplies its semantic focus ring |
| `bold-chat.png` | Student leans across a chair, arms wide, presenting one plain round object and one square object | Interface ring belongs to the calculated answer, not the image |
| `bold-support.png` | Two students crouch at the same level and look toward a clear next step together | Interface ring belongs to the useful recovery action |
| `legon-balme-clean.png` | Thin monochrome outline of the supplied Balme Library silhouette, tower, wings, arch and flanking palms | Separate background plate |
| `legon-avenue-clean.png` | Thin monochrome campus avenue with a clear centre, trees and a low campus building | Separate background plate |

The transaction-art companion pass supplies payment, Pause, plan, funding and confirmed-result figures using the same male master and female cast reference. These six files do not replace those companion assets.

## Layering rules

1. Keep the Legon drawing behind the actor, with restrained opacity and no painted area behind financial copy. Use the supplied clean plates rather than the earlier v21 files with filled bands.
2. Use one actor scene and one background plate per placement. Preserve the whole gesture with `object-fit: contain`; do not crop hands, heads or the comparison gesture to enlarge a face.
3. Home and introductory screens may give the drawing presence. Payment entry, review and authorisation remain compact. The financial consequence always leads the Pause.
4. Apply the real interface ring to the meaningful conclusion or action. It is not a repeated badge around every container or logo.
5. Do not place real balances, claims, payment statuses or dates in the drawings. Keep them as accessible text from the existing calculation engine.
6. These are separate flat transparent image masters, not rigged body parts. Whole-scene reveal motion is supported. Independent hand, face or leg animation would require newly separated and rigged artwork.
7. A celebratory companion illustration must follow confirmed payment state. This support scene is suitable for recovery and help because it does not imply that a transaction succeeded.

## Provenance and technical checks

All six assets were made using the built-in image-generation tool with transparent backgrounds, one tool call per requested scene. No CLI generation, tracing, recolouring, compositing or pixel edits were used. Original outputs were copied into the project under new names; prior assets remain recoverable.

The original Lumo `student-expressive.png` supplied identity. Uploaded Minna screenshots supplied gesture/contrast references only for the first master. The new male master then supplied the art direction for every subsequent figure. The welcome scene established the female cast used by the support and companion transaction scenes. Balme and avenue plates used their corresponding existing v21 source image as the architectural reference, not as pixels to clean or recolour.

All six files are 1536 × 1024 RGBA PNGs. The four actor-scene corner pixels have alpha zero. The two outline plates are more than 82% fully transparent; their opaque line pixels have RGB-channel spread at most one, confirming that no green or olive bands carry across. Very faint anti-aliased edge pixels can have alpha one. Figure assets retain small lime cuff areas and black/white fills.

The four character outputs were visually inspected after generation for gesture, silhouette, cast consistency, hand/limb count and absence of embedded text or financial facts. Transparent black-line architecture requires a white interface surface to judge its final contrast; the source alpha/colour checks are not a substitute for rendered-device review.

## Prompt set

The following describes the production prompts and their invariant constraints. Each request used `transparent_background: true`.

### Shared figure constraints

Original young Ghanaian Lumo student, cloudlike black curls, long angular nose, dot eyes, white-filled face and limbs. Solid black cropped loose jacket, white shirt and wide white trousers, bold black/white trainers. Tiny lime woven-cuff motifs with simple geometric marks. Punchy flat editorial ink, heavy confident outer contour, very few interior marks, large solid black masses, no shading, gradient, halo or background. Exactly two arms and two legs per person. Landscape 3:2 with readable hands and head inside the composition. No financial values, words, logos, bubbles, money, UI panels, charts or text.

### Home master

One student lunges sideways through one large incomplete circular lens, leaning forward, one leg bent high behind and one grounded. One arm points confidently through the open centre toward a clear next step, the other holds the ring edge for balance. Head lifted, clear delighted “now I see it” expression, raised eyebrow and long smile. Large thick black open ring, slightly tilted; confident directional composition. No campus background, because Legon is a separate layer. Input references: original Lumo male character plus uploaded Minna black/white gesture examples; preserve Lumo’s own character and avoid reproducing another brand’s specific drawing.

### Welcome

Same male and a new female with long tied-back braids, angular nose/dot eyes, oversized white jacket with a simple black woven stripe, solid black wide trousers. Both stride diagonally forward into an open campus path. Female leads with a sweeping guiding hand and large forward step. Male follows with a playful hand-to-forehead “I can see the way” gesture. Curious and assured, not cheering or exchanging money. No ring or architecture in the foreground asset. Input: new male master.

### Chat

Same male leaning sideways across a simple low chair, torso diagonal, head forward with a large interested grin and one raised eyebrow. Both arms spread wide to look at options together. One open hand presents a small plain round pebble and the other a small plain square block; neither has labels or markings. Deliberate posture rather than a baffled shrug. Black chair and clothing, white limbs, tiny lime cuff accents. No ring because the real answer receives the interface ring. Inputs: male master and welcome cast/style reference.

### Support and recovery

Same male in a low seated crouch beside a plain step, one hand open to the female with an alert hopeful eyebrow. Female kneels at his level, warm confident smile, one hand near his hand and the other pointing calmly toward a useful next step. They look ahead together. No injury, shame, dramatic rescue, high-five or success celebration. Same cast and clothing as the welcome image. No foreground ring or architecture. Inputs: male master and welcome female cast reference.

### Balme background plate

Fresh clean thin monochrome black outlines from the supplied v21 architectural reference. Preserve the recognisable stepped clocktower, low wings, broad arched entrance and small palms. Lower-middle composition, tower reaches upper third, clear foreground opening. Essential roof/window/arch/clock detail only, no brick texture, people or vehicles. All open spaces and interiors transparent. No painted fills, coloured bands, grey wash, shadows, ring or text.

### Avenue background plate

Fresh thin monochrome black outlines from the supplied v21 avenue reference. Broad welcoming one-point-perspective path, restrained tree groups at the sides, low campus building and simple tower to the right. Clear centre for the bold foreground figure, sparse foliage strokes, open shapes transparent. No foliage blobs, ground fill, painted wash, neon edges, coloured bands, people, cars, ring or text.
