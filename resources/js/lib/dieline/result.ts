import type { DielineResult, Panel } from '../../types/design';
import {
    bounds,
    mergeSegments,
    offset,
    polygonEdges,
    polygonsToPath,
    roundPt,
    segmentToPath,
    segmentsToPath,
    translate,
    union,
    type Segment,
} from './geometry';

/** Print defaults, in mm. */
export const BLEED_MM = 3;
export const SAFE_MM = 3;

export type BuildOptions = {
    bleed?: number;
    safe?: number;
    parts?: string[];
};

/**
 * Turn a list of panels (with hinges) into a full DielineResult:
 * - panels are moved so the cut outline starts at (0, 0)
 * - cut lines = every panel edge except the hinges, with shared edges drawn once
 * - crease lines = the hinges
 * - bleed = outer outline grown by `bleed`; safe = each panel shrunk by `safe`
 */
export function buildDielineResult(rawPanels: Panel[], options: BuildOptions = {}): DielineResult {
    const bleed = options.bleed ?? BLEED_MM;
    const safe = options.safe ?? SAFE_MM;

    const b = bounds(rawPanels.map((p) => p.polygon));
    const dx = -b.minX;
    const dy = -b.minY;

    const panels: Panel[] = rawPanels.map((p) => ({
        ...p,
        polygon: translate(p.polygon, dx, dy).map((q) => roundPt(q)),
        hinge: p.hinge
            ? { a: roundPt({ x: p.hinge.a.x + dx, y: p.hinge.a.y + dy }), b: roundPt({ x: p.hinge.b.x + dx, y: p.hinge.b.y + dy }) }
            : undefined,
    }));

    const hinges: Segment[] = panels.flatMap((p) => (p.hinge ? [{ a: p.hinge.a, b: p.hinge.b }] : []));
    const edges = panels.flatMap((p) => polygonEdges(p.polygon));

    const cutSegments = mergeSegments(edges, hinges);
    const creaseSegments = mergeSegments(hinges);

    const outline = union(panels.map((p) => p.polygon));
    const bleedPolys = offset(outline, bleed);
    const safePolys = offset(
        panels.map((p) => p.polygon),
        -safe,
    );
    // offset() merges overlapping results; panels only touch at edges so shrinking keeps them apart.

    const size = bounds(panels.map((p) => p.polygon));

    return {
        panels,
        cutPath: segmentsToPath(cutSegments),
        creasePaths: creaseSegments.map(segmentToPath),
        bleedPath: polygonsToPath(bleedPolys),
        safePath: polygonsToPath(safePolys),
        overallSize: { width: size.width, height: size.height },
        ...(options.parts ? { parts: options.parts } : {}),
    };
}
