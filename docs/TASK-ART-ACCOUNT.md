# Account task illustration extension

Four generated task illustrations supplement the recovered original textile masters. They are new extensions, not recovered historical assets. The original assets remain unchanged.

## Purpose and use

| Asset | Clear activity and large prop | Intended use |
| --- | --- | --- |
| `profile-card.png` | The braided student points to her own portrait on a large profile card. | Profile and personal-details controls. The card is illustrative, not a government ID. |
| `privacy-curtain.png` | The same student pulls a curtain over part of a large personal-information card. | Privacy choices and visibility controls. It makes no protection or completion claim. |
| `notifications-bell.png` | The curly-haired student checks a phone beside a large black-and-white bell. | Notifications and notification preferences. It makes no payment or success claim. |
| `bank-details.png` | Kente-sleeved hands check a blank receiving-details card beside a substantial three-pillar bank facade. | Bank receiving details and account details. It does not depict money moving. |

Final files are in `dist/assets/clarity-tasks`. All four are RGBA PNGs at 1536 × 1024. Black-and-white props remain prominent. Colour is confined to Ghanaian textile clothing.

## Style and source references

The original `friends-editorial.png`, `thoughtful-refined-4.13.png` and `student-expressive.png` from `dist/assets/clarity` supplied the recurring cast and drawing style. The new images retain black curls or braids, white body shapes, expressive profile features, substantial black outline and the ochre/orange/navy/cream textile family. The female uses wax-print circles and leaves; the male and hands use woven Kente rectangles, stepped diamonds, checks and stripes.

There are no black blazers, lime cuffs, green garments, jewellery, earrings, decorative rings, monetary amounts, readable writing, official identity numbers or status ticks.

## Generation and preservation

Built-in `image_gen.imagegen` was used once per asset with `transparent_background: true` and the three original references. All four selected outputs were copied unchanged into the project. No output was recoloured, background-composited, redrawn or cropped. Existing files were not overwritten.

| Asset | SHA-256 | Visible-alpha bounds at alpha ≥16 |
| --- | --- | --- |
| `profile-card.png` | `975cd28e87dad84225361963658d01c5bdd45fbdb036f579aa75fc7be28127c1` | `(124,36,1474,1024)` |
| `privacy-curtain.png` | `e878736547ced67904a04d1c8095d5d34e1797960dd1f0afde3517a730a530ac` | `(97,127,1433,970)` |
| `notifications-bell.png` | `74552db0fb7d3348904c781dc346577c8c81ab69f54dc9fdaead95564fe1eb8c` | `(101,37,1503,1008)` |
| `bank-details.png` | `f088a3d24ca4f1f2be86e3a6901523617aef10954907ceb4499c183885ccbf65` | `(13,120,1461,952)` |

## Inspection

All four images were inspected full size and rendered on white at 64px height for a component-size inspection. The card and portrait, curtain and personal card, bell and phone, and bank pillars and details card remain recognisable. Financial values stay outside the images as real interface text.

Alpha inspection confirms actual transparency surrounding the subjects. The black appearance of fully transparent RGB areas in some image viewers is not a painted background. No campus scenery or ground is baked into these scenes.

Heads, fingers and task props are fully contained. The profile-card drawing is an upper-body composition that ends at the lower waist/trouser area on the bottom canvas edge. The other three have transparent margins on all visible subject sides. Root layout must use `object-fit: contain` and preserve the entire task prop.

This is asset inspection, not a browser screenshot or real-device layout check. Route selection, responsive placement, accessibility and motion remain implementation responsibilities.

## Final prompt set

Each final prompt combines the shared direction below with its task-specific paragraph.

### Shared direction

Use case: illustration-story. Asset type: task-specific illustration for a Ghanaian student banking prototype. Output ONE 1536 x 1024 landscape PNG with ACTUAL TRANSPARENT ALPHA background. The three supplied originals are character, textile and drawing-style references, not edit targets. Keep the original Lumo editorial family: substantial crisp black ink outlines, thinner interior details, solid black hair, white flat skin/body and white props, simple expressive profile nose/dot eyes. Flat drawing, no gradients, skin shading, atmospheric effects or dimensional rendering. Restrict colour to the Ghanaian textile clothing: ochre/orange/navy/cream woven Kente rectangles/stepped diamonds/stripes for the curly-haired male; ochre/orange/navy/cream Ghanaian wax-print fabric with bold circles and leaves for the braided-haired female. NO green, lime, coloured skin, black blazer, suit, jewellery, hoop earrings or decorative rings. This must be UPPER BODY, HANDS and VERY LARGE unmistakable TASK PROPS, with the main prop taking roughly 40% of the canvas. Do not show full-body tiny-phone scenes. Compose as one strongly readable scene at 64px high, simple silhouette and sparse details. Keep all head, arms, fingers and props completely INSIDE the canvas with generous transparent margins, never cropped. No campus, buildings in the background, ground, frames, logos, badges, status ticks/checkmarks, floating money, currency, written words or numbers. No shadow, halo, glow, texture behind the figure or baked checkerboard. Final background is transparent, not black or white. 

### profile-card

Specific task PROFILE: show the original warm young braided-haired female student from reference 1, from waist upward, wearing the patterned wax-print short-sleeve top, no earrings. She holds up a very large white horizontal personal profile card with both hands at chest height, looking at it with a small confident smile. Her index finger points to the card's portrait area. The card is the unmistakable central prop, around 40% canvas width, outlined in black with rounded corners. It contains ONLY one simple black silhouette portrait of the SAME BRAIDED-HAIRED WOMAN, plus at most two short blank black lines indicating detail fields. No writing or numbers. Do not make a government ID, passport, credit card or bank card. The activity is checking one's own profile details. One woman, one large card, sensible separate hands; no extra phone, no unrelated object. Strong open white composition.

### privacy-curtain

Specific task PRIVACY CHOICE: show the original warm young braided-haired female student from reference 1, waist upward, wax-print short-sleeve top, no earrings. In front of her is one oversized white horizontal personal profile card with a simple black silhouette portrait, a few blank black strokes and no writing. A plain white small curtain hangs from a single thin black curtain rail immediately above this card. The woman deliberately PULLS THE CURTAIN ACROSS PART OF THE CARD with one visible hand holding the curtain edge, while her other hand steadies the card. Show the curtain half covering the portrait/card so the action of choosing what remains visible is instantly clear. Curtain folds use just three or four bold black vertical curves. Main card-plus-curtain prop covers roughly 45% canvas, large enough to recognise at 64px. Her face is calm and attentive to her hand/card. No padlock, shield, checkmark or claimed success. One woman, one curtain and one card, all edges contained, no extra objects. Transparency around the entire scene.

### notifications-bell

Specific task NOTIFICATIONS: show the original curly-black-haired male student from references 2 and 3, waist upward, wearing the FULL SHORT-SLEEVED COLLARED KENTE SHIRT with ochre/orange/navy/cream woven rectangles, stepped diamonds, black-and-cream stripes. He holds one upright WHITE SMARTPHONE with a thick black outline in one hand at chest height and looks attentively at its blank face, the other index finger near the screen as though checking an update. Immediately beside the phone is ONE VERY LARGE CLASSIC BELL: a plain white dome-shaped bell with thick black contour, small top loop, flat rim and simple black clapper. The bell is as tall as his torso and occupies around 40% of the canvas, strongly recognisable as a notification symbol. It is an intentional adjacent task prop, not a tiny floating icon. Bell entirely black and white, no badge, no counter number, no ringing rays, money or celebration. One student, one phone, one large bell; generous clear margins.

### bank-details

Specific task RECEIVING BANK DETAILS: hands-and-large-props illustration, no full character or face needed. Two white outlined HUMAN HANDS extend from short KENTE PATTERNED SLEEVES in ochre/orange/navy/cream, the same fabric as reference 2. They hold and check one very large WHITE HORIZONTAL RECEIVING-DETAILS CARD on the left, rounded corners, thick black border, only three short blank black field strokes, no writing, numbers, QR code, barcode, signature or portrait. One index finger points to a blank field as though confirming the receiving details. Beside the card on the right is ONE LARGE recognisable BLACK-AND-WHITE BANK FACADE: a triangular classical pediment above THREE substantial pillars, white columns with bold black outlines, simple base steps. This bank is an explicit foreground task prop around 40% of the canvas, not scenery. The card and bank sit side by side at similar height and fill the scene generously, hands naturally grasping the card without covering the bank. No currency, coins, cash, arrows, checkmarks, shields, status claims, logos or text. All hands and props fully contained with transparent margins. This must read as account receiving details, not money movement.

