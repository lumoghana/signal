# Task illustration: transactions, access and records

This pass creates three task-specific illustrations with large foreground props. The upper-body composition replaces the tiny phone in a distant full-body pose, making the subject of each screen easier to recognise in compact art slots.

Generated with the built-in `image_gen` tool, one independent call per asset. Inputs were the inspected original Lumo assets `dist/assets/clarity/student-expressive.png`, `dist/assets/clarity/friends-editorial.png` and `dist/assets/clarity/thoughtful-refined-4.13.png`. Those remain unchanged.

## Delivered assets

| File | Screen job | Readable foreground action |
| --- | --- | --- |
| `dist/assets/clarity-tasks/funding-wallet.png` | Choose how to add money | Original braided woman compares her open wallet with her own upright phone. No money is shown arriving. |
| `dist/assets/clarity-tasks/security-lock.png` | Protect account access | Original curly-haired man holds a large closed padlock beside his phone. No success or payment completion is implied. |
| `dist/assets/clarity-tasks/records-receipts.png` | Check activity and receipts | Original Kente-clad man compares two large serrated receipt strips against an open ledger, following a row with his finger. |

The original black-ink/white-body editorial identity and Ghanaian ochre/orange/navy/cream Kente or wax-print clothing are retained. There are no black blazers, lime cuffs or green clothing. Colour remains separate from the live interface accent. No Legon background, focus ring, numerical amounts, legible text, arrows or confirmed ticks are baked into the artwork.

## Validation

All three generated compositions were visually inspected. Each file is 1536 × 1024 RGBA, with transparent pixels and transparent corners. Production PNGs were copied byte-for-byte from the generated output without background removal, cropping, recolouring or other raster editing. Complete hands and props remain within the canvas; the torso intentionally ends at the lower edge as an upper-body cutout. These are flattened static illustrations. Actual 48–64 px device rendering must still be checked by the integration owner.

## Exact prompts

Each call used this common prompt:

Use case: illustration-story. Asset type: compact production task illustration for the Lumo Ghanaian student money app, rendered as a transparent cutout. Input image 1 supplies the original curly-haired student and warm textile identity, image 2 supplies the original braided female and wax-print clothing, image 3 supplies the exact casual Kente shirt. Preserve the original Lumo drawing family: strong clean black ink contours; white-filled faces, hands and bodies; natural but expressive young adult Ghanaian students; black curly hair or braided hair; long angular noses, dot eyes, expressive eyebrows; actual Ghanaian Kente or wax-print clothing with ochre/orange, deep navy and cream colour confined to the clothes. Never black blazers, lime cuffs, solid black fashion jackets or green. These are task illustrations, not general lifestyle poses. COMPOSITION: UPPER BODY ONLY, head-and-chest plus hands, with ONE dominant large recognisable TASK PROP taking roughly 40% of the landscape 1536x1024 image; simplify the contour and internal details so the action still reads in a 48-64 pixel app illustration. Do not draw full body, legs, small distant phone, furniture or campus. The prop is the foreground focus and face carries warm intelligent expression. Keep complete hair, all fingers and entire prop safely within canvas. Crisp two-dimensional flat editorial linework without gradients, grey shading, shadows, halos, glows, noise or texture outside the authentic textile pattern. Background must be actually transparent with alpha, not a white rectangle or checkerboard. No logos, rings, colour outside clothes, arrows, coins, floating symbols, numbers, legible text, money amounts, badges, checkmarks or success indicators. Blank phone screen and no embedded UI. No cash passing between people and no suggestion that an unconfirmed action has already completed.

### funding-wallet

Task: choose how to add money. Draw the original braided young woman from image 2 wearing the same simple short-sleeve warm ochre/orange/navy/cream wax-print blouse. Upper body at slight three-quarter angle. She holds her own LARGE OPEN WALLET prominently in one hand near the lower foreground and her own upright phone beside it in the other hand, comparing them while looking down toward the wallet with a thoughtful raised eyebrow and small engaged smile. Her black braids are tied back, white face and hands. Wallet dominates, with a clearly open fold, plain large card-shaped slots and a visible empty main compartment, simple black-and-white construction with bold contour. Wallet should look like a familiar small personal wallet, not a handbag or cash register; no banknotes or coins. Phone is secondary but clearly upright, blank screen, comfortably within the composition. One believable action of considering funding choice. No animation of money arriving and no relief/celebration pose.

Output: `/workspace/scratch/2b244a32f08e/generated_images/exec-6e39344c-29e3-4f33-9376-2b0b7fbeca6a.png`.

### security-lock

Task: protect access to the account. Draw the original curly-haired young man in the authentic casual short-sleeve Kente shirt from image 3: ochre/orange woven rectangular blocks, navy diamond motifs, narrow cream stripe bands and navy/cream checker panels. Upper body at slight three-quarter angle. His foreground hand firmly holds ONE LARGE CLOSED PADLOCK at chest height, its simple familiar U-shaped closed shackle and keyhole clearly visible; padlock takes about 40% of the entire image and is plain black-and-white, not coloured. Other hand holds an upright plain phone just to the side, secondary and entirely within canvas. Attentive, confident face looking toward the padlock, warm direct eyebrows and a calm small smile. Protecting access rather than claiming a successful transaction. Do not add a shield, tick, ring, password dots, numbers, text or extra lock. Keep broad easy-to-read prop outline, torso, hands and head only.

Output: `/workspace/scratch/2b244a32f08e/generated_images/exec-1c213d6b-75d0-4eac-8621-ad7b8c1a3a53.png`.

### records-receipts

Task: review activity and receipts. Draw the original curly-haired male student in the authentic short-sleeve Kente shirt from image 3 with ochre/orange rectangular weave, navy diamond motifs, narrow cream stripe bands and checker panels. UPPER BODY ONLY. Place two LARGE SEPARATE RECEIPT STRIPS in the foreground, their rolled or slightly curved paper tops and distinctly serrated bottom edges making them immediately recognisable as receipts, with just a few non-letter horizontal black rule marks. In one hand he holds and checks the two strips beside a small OPEN LEDGER held steady by the other hand; his index finger follows a row in the ledger while his face tilts down attentively, one eyebrow raised in engaged understanding. The receipts, not a generic notebook, must dominate about 40% of the canvas and be clearly separated from the open ledger behind. Ledger has sparse ruled rows, no words, glyphs, dates, amounts or checkmarks. Natural credible hands and no extra fingers. This is checking transaction records, not school homework or writing an essay. No pen, no phone, no success celebration.

Output: `/workspace/scratch/2b244a32f08e/generated_images/exec-fe85c0c5-1710-41bb-bfe2-cbec8005c235.png`.

This pass changes only the three new PNGs and this implementation note. Shared JavaScript, CSS, financial facts and transaction rules remain the integration owner's responsibility.

