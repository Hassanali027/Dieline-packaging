# Dieline engine (Dev 1)

`generateDieline(params: BoxParams): DielineResult` is the only function the editor, the 3D view and the exporters call.

## Conventions (everyone relies on these)

- All output is **millimetres**, whatever `params.unit` is (`'in'` input is converted).
- X grows right, Y grows **down** (same as SVG and Fabric). 1 Fabric scene unit = 1 mm.
- The cut outline starts at `(0, 0)`. `overallSize` is the cut outline size; the bleed (3 mm) goes into negative coordinates.
- `Panel.hinge` is the crease shared with `Panel.parentId`. The root panel (base) has no parent.
- `Panel.foldAngle` is in degrees. A positive angle always folds the panel towards the inside of the box. The 3D builder (`lib/three/foldTree.ts`) works out the rotation direction from the hinge.
- Paths only use `M`, `L` and `Z` commands, so they are easy to mirror (`mirrorPathX`) and export.
- Cut lines are every panel edge except the hinges, with shared edges drawn once so the cutter never runs the same line twice.

## Files

| File               | What it does                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `index.ts`         | `generateDieline`, `validateParams`, `isStyleSupported`, limits                           |
| `geometry.ts`      | points, polygons, union (clipper2-js), bleed grow / safe shrink, segment merge, SVG paths |
| `result.ts`        | panels → `DielineResult` (cut / crease / bleed / safe / size)                             |
| `styles/mailer.ts` | Mailer box (roll-end front tuck)                                                          |
| `styles/tuck.ts`   | Reverse tuck and straight tuck cartons                                                    |
| `styles/trays.ts`  | Tray, burger box (tray + lid with lips) and sleeve                                        |
| `styles/parts.ts`  | Shared flap shapes (tapered flaps, chamfered tuck flaps) and mm conversion                |

`styles.test.ts` checks every style: one root, no overlapping panels, no cut along a crease, and that it folds (via `lib/three/foldTree.ts`) into a box of the requested inside size.

`clipper2-js` 1.2.x `InflatePaths` returns broken outlines, so offsets are done in `geometry.ts` and only `Clipper.Union` is used.

## Adding a style

1. Add `styles/<style>.ts` that returns `Panel[]` and wraps it with `buildDielineResult`.
2. Register it in `GENERATORS` in `index.ts`.
3. Add a Vitest file next to the mailer one (panel sizes, hinge tree, no cut on a hinge).

## Fixture

`resources/js/fixtures/mailer.json` is the default mailer (220 × 160 × 70 mm, 1.5 mm board) for Dev 2 and Dev 3 to use as mock data. `mailer.test.ts` fails if it gets out of date. Regenerate it with:

```
UPDATE_FIXTURES=1 npm test
```
