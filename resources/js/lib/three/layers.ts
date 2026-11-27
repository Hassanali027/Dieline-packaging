import { Vector3 } from 'three';
import type { Panel, Pt } from '../../types/design';
import { centroid, pointInPolygon, signedArea } from '../dieline/geometry';
import { buildFoldTree, panelMatrices, toWorld } from './foldTree';

/**
 * Flaps that end up flat against a wall when the box is closed (dust flaps, tucks, glue
 * flaps, rigid corner ears) fold into exactly the same plane as that wall. Two coplanar
 * faces fight over the same pixels ("z-fighting"): the 3D box flickered and inner flaps
 * showed through the outside. In a real box each flap sits one board thickness further in,
 * so the view stacks them that way (see FoldedBox).
 */

/** How close (mm) two faces must be to count as the same plane. */
const PLANE_EPS = 0.05;

/** Centroid plus points 60% of the way to each corner: inside the panel, away from shared edges. */
function samples(polygon: Pt[]): Pt[] {
    const c = centroid(polygon);
    return [c, ...polygon.map((p) => ({ x: c.x + (p.x - c.x) * 0.6, y: c.y + (p.y - c.y) * 0.6 }))];
}

/**
 * Pairs of panels that, folded to `progress`, lie in the same plane facing the same way and
 * overlap. `offsets` moves each panel along its own inside normal (mm) before checking.
 */
export function coincidentPanels(panels: Panel[], progress = 1, offsets?: Map<string, number>): [string, string][] {
    const matrices = panelMatrices(buildFoldTree(panels), progress);
    const pairs: [string, string][] = [];
    for (let i = 0; i < panels.length; i++) {
        const a = panels[i];
        const toA = matrices.get(a.id)!.clone().invert();
        for (let j = i + 1; j < panels.length; j++) {
            const b = panels[j];
            // B in A's flat frame: coplanar and same-facing means every point at A's height
            // and B's inside normal (+Y) still pointing +Y.
            const bToA = toA.clone().multiply(matrices.get(b.id)!);
            if (new Vector3(0, 1, 0).transformDirection(bToA).y < 0.999) continue;
            const lift = new Vector3(0, offsets?.get(b.id) ?? 0, 0);
            const mapped = b.polygon.map((p) => toWorld(p).add(lift).applyMatrix4(bToA));
            const height = offsets?.get(a.id) ?? 0;
            if (mapped.some((q) => Math.abs(q.y - height) > PLANE_EPS)) continue;
            // Back from world (-x, 0, y) to dieline (x, y).
            const flat = mapped.map((q) => ({ x: -q.x, y: q.z }));
            const overlaps = samples(flat).some((s) => pointInPolygon(s, a.polygon)) || samples(a.polygon).some((s) => pointInPolygon(s, flat));
            if (overlaps) pairs.push([a.id, b.id]);
        }
    }
    return pairs;
}

/**
 * Stacking layer of every panel when the box is closed: 0 for panels nothing overlaps, and
 * for a group of overlapping panels the biggest (the wall) stays outside at 0 and each smaller
 * flap goes one layer further in than the panels it lies against.
 */
export function panelLayers(panels: Panel[]): Map<string, number> {
    const layers = new Map<string, number>();
    const pairs = coincidentPanels(panels, 1);
    if (!pairs.length) return layers;

    const neighbours = new Map<string, Set<string>>();
    for (const [a, b] of pairs) {
        if (!neighbours.has(a)) neighbours.set(a, new Set());
        if (!neighbours.has(b)) neighbours.set(b, new Set());
        neighbours.get(a)!.add(b);
        neighbours.get(b)!.add(a);
    }

    const area = (p: Panel) => Math.abs(signedArea(p.polygon));
    const ordered = panels.filter((p) => neighbours.has(p.id)).sort((p, q) => area(q) - area(p) || p.id.localeCompare(q.id));
    for (const panel of ordered) {
        let layer = 0;
        for (const other of neighbours.get(panel.id)!) {
            const placed = layers.get(other);
            if (placed !== undefined) layer = Math.max(layer, placed + 1);
        }
        layers.set(panel.id, layer);
    }
    return layers;
}

/** Layers only take effect as the box closes, so the flat sheet stays flat. */
export function layerFade(progress: number): number {
    return Math.max(0, Math.min(1, (progress - 0.85) / 0.15));
}
