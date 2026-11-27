import type { Panel, Pt } from '../../types/design';
import { distance } from '../dieline/geometry';

/**
 * Fold mapping for uploaded dielines (Sprint 3): pick a base panel, build the hinge tree
 * from shared edges, adjust angles. The 2D editor imports this eagerly (FoldMappingPanel in
 * the right panel), so it must not import `three`: see the note at the top of materials.ts.
 */

function polygonEdges(poly: Pt[]): [Pt, Pt][] {
    const edges: [Pt, Pt][] = [];
    for (let i = 0; i < poly.length; i++) {
        edges.push([poly[i], poly[(i + 1) % poly.length]]);
    }
    return edges;
}

/** Finds a shared edge segment between two polygons (used for auto-building custom dieline hinges). */
function findSharedEdge(a: Pt[], b: Pt[], tolerance = 1.5): { a: Pt; b: Pt } | null {
    for (const [a1, a2] of polygonEdges(a)) {
        if (distance(a1, a2) < 1) continue;
        for (const [b1, b2] of polygonEdges(b)) {
            if (distance(b1, b2) < 1) continue;
            const sameDir = distance(a1, b1) <= tolerance && distance(a2, b2) <= tolerance;
            const revDir = distance(a1, b2) <= tolerance && distance(a2, b1) <= tolerance;
            if (sameDir || revDir) {
                return { a: a1, b: a2 };
            }
        }
    }
    return null;
}

/**
 * Builds a hinge tree starting from `basePanelId` for uploaded/custom dielines (Sprint 3 fold mapping).
 * Walks touching panels via BFS, sets `parentId` + `hinge`, and preserves existing non-zero fold angles.
 */
export function autoBuildFoldTreeFromBase(panels: Panel[], basePanelId: string, defaultAngle = 90): Panel[] {
    if (!panels.length) return panels;
    const base = panels.find((p) => p.id === basePanelId) ?? panels[0];
    const resultMap = new Map<string, Panel>();
    resultMap.set(base.id, { ...base, parentId: undefined, hinge: undefined, foldAngle: 0 });

    const queue: Panel[] = [base];
    const visited = new Set<string>([base.id]);

    while (queue.length > 0) {
        const current = queue.shift()!;
        for (const candidate of panels) {
            if (visited.has(candidate.id)) continue;
            const shared = findSharedEdge(current.polygon, candidate.polygon);
            if (!shared) continue;
            visited.add(candidate.id);
            const foldAngle = candidate.foldAngle !== 0 ? candidate.foldAngle : defaultAngle;
            resultMap.set(candidate.id, {
                ...candidate,
                parentId: current.id,
                hinge: shared,
                foldAngle,
            });
            queue.push(candidate);
        }
    }

    return panels.map((p) => resultMap.get(p.id) ?? { ...p, parentId: undefined, hinge: undefined });
}

/** Adjusts the fold angle (-180..180 deg) for a single panel in a fold-mapped dieline. */
export function updatePanelFoldAngle(panels: Panel[], panelId: string, foldAngle: number): Panel[] {
    const clamped = Math.max(-180, Math.min(180, foldAngle));
    return panels.map((p) => (p.id === panelId ? { ...p, foldAngle: clamped } : p));
}

/**
 * The base panel of a mapped dieline: the root that other panels hang from. Panels that share
 * no edge are roots too (they stay unlinked), so "first panel without a parent" is not enough.
 * Returns null while nothing is mapped yet.
 */
export function findBasePanel(panels: Panel[]): Panel | null {
    const parents = new Set(panels.map((p) => p.parentId).filter(Boolean));
    return panels.find((p) => !p.parentId && parents.has(p.id)) ?? null;
}
