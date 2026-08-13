# AutoNinja mascot continuity guide

## Current decision state

The leaning mascot with a car key dangling from one finger is the approved
production master and homepage pose.
Proposed brand patterns remain previews until separately approved.

The superseded angular-hood homepage hero character drifted from the established
small leaning mascot and must not be used to generate new poses.

## Identity source of truth

- Primary identity reference: `public/brand/autoninja/mascot-leaning-key-hero-v2.png`
- Supporting face reference: `public/brand/autoninja/mascot-head.png`
- Supporting approved full-body pose: `public/brand/autoninja/mascot-steering-wheel-hero-v1.png`
- Approved full-body master: `public/brand/autoninja/mascot-leaning-key-hero-v2.png`
- Production hero asset: `public/brand/autoninja/mascot-leaning-key-hero-v2.webp`
- Production car background: `public/brand/autoninja/homepage-hero-car-studio-v1.webp`
- Legacy proportion reference only: `public/brand/autoninja/mascot-master.png`

Every future mascot graphic must include the approved final character sheet as
an image reference. A text prompt by itself is not enough to preserve the
character. Do not use a previously generated scene as the only reference,
because small errors compound from generation to generation.

## Locked character invariants

- Oversized, nearly spherical matte-black head with the same rounded silhouette
  and head-to-body ratio as the primary leaning reference.
- Wide glossy-black visor face with the same outline, inset depth, and placement.
- Two simple friendly orange crescent eyes. No pupils, mouth, nose, eyebrows, or
  exposed human skin.
- Compact, friendly body with soft premium 3D toy rendering and matte-black
  materials. Never tall, athletic, muscular, realistic, or aggressive.
- Proper simple black kimono jacket with a visible crossover collar and relaxed
  black trousers.
- Preserve the original orange headband: the same width, a knot on the
  character's left, and two short orange cloth tails.
- Preserve the original orange tied belt: the same front knot and two short
  hanging orange ends.
- The black hood beneath the headband must read as cloth rather than a helmet.
  Use only two to four broad overlapping fabric panels or seams; never cover the
  head in many narrow bandage-like wraps.
- Plain one-piece matte-black rounded ninja ankle boots. Each boot has one
  continuous closed toe box: no split toe, visible toes, sneakers, laces, white
  athletic soles, or streetwear.
- Calm, confident, helpful personality. No weapons or combat-led poses.
- Every production pose must show an automotive action or object: for example a
  car key, steering wheel, tyre, wheel, pressure gauge, gearshift, diagnostic
  tool, charging cable, or another clearly recognizable car-related item. The
  mascot should never stand empty-handed without doing anything.
- In the approved homepage pose, the key ring loops over a finger and the car
  key hangs visibly below it. The key must not be clenched in the palm.
- The final approved clothing construction must be copied exactly in every pose.

## Approved palette

- Ninja orange: `#F45B00`
- Orange interaction hover: `#E85A00`
- Ninja black: `#111317`
- Platform dark green: `#005C33`
- Dark-green interaction hover: `#004726`
- White: `#FFFFFF`
- Mint highlight: `#49E698`

Use `#F45B00` as the base orange material in both UI and generated artwork.
Normal highlights and shadows from 3D lighting are acceptable, but do not
substitute a darker orange solely to satisfy a contrast score. Orange UI text,
logos, and accents must resolve to the shared brand tokens in
`src/config/theme-brand.json`.

## Logo lockup

- The approved wordmark construction is Barlow Black (900), with the compact
  existing tracking preserved as outlined paths in `wordmark.svg` and
  `wordmark-inverse.svg`.
- `Auto` uses Ninja black on light surfaces and white on dark surfaces.
  `Ninja` always uses the exact Ninja orange `#F45B00`.
- Production must render the outlined files through `BrandLogo`; do not rebuild
  the wordmark with live text, a look-alike font, or browser-synthesized weight.
- At navigation and footer sizes, pair the wordmark only with the approved head
  icon. Full-body mascot poses belong in hero/editorial placements.
- The domain suffix is market-specific UI text and is not part of the outlined
  wordmark master.
- Recreate the SVGs only with `scripts/generate-brand-wordmark.py`, then review
  the result visually and update the locked SHA-256 values in
  `mascot-manifest.json` deliberately.

## Production generation workflow

1. Start from the approved final character sheet, never from text alone.
2. Add the primary leaning identity reference when the face or proportions are
   especially important.
3. State that both images are strict identity references, then describe only the
   new pose, prop, expression, or scene.
4. Repeat every invariant and the negative list in the prompt. Request one pose
   per generation so the model does not average several designs together.
5. Compare the result with the final sheet at the same head size. Reject it if
   the head outline, visor shape, eye spacing, body ratio, kimono, footwear, or
   selected signature changes.
6. Save only approved cutouts as versioned masters. Do not make a rejected scene
   part of the reference chain.

## Reusable generation prompt

Use the final character sheet and the leaning identity reference, then begin
with:

> Preserve the exact AutoNinja mascot identity from the supplied approved
> references: the same spherical matte-black head, rounded inset black visor,
> friendly orange crescent eyes, compact soft 3D proportions, proper black
> kimono, plain one-piece black boots, original tied orange headband, original tied
> orange belt, restrained broad cloth panels beneath the headband, and the
> selected automotive prop. This must be the same character in a new pose, not a
> reinterpretation or a generic ninja. Change only the requested pose, prop, or
> environment.

Always finish with:

> Do not remove or redesign the orange headband knot, its two short tails, the
> tied orange belt, or its two short ends. No split toes, visible toes, sneakers,
> laces, white soles, smooth helmet shell, excessive narrow wraps, mummy
> wrapping, weapons, exposed skin, realistic facial features, angry eyes,
> complicated armor, extra logos, text, or watermark.

## Usage rules

- Use the head icon at small sizes; do not shrink a full-body scene into an icon.
- Keep clear space around the round hood and preserve the visor silhouette.
- Avoid placing the face over visually busy vehicle details.
- Use empty alt text when the mascot is decorative. Use concise descriptive alt
  text only when the mascot conveys unique information.
