import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import type { BoxStyle, Panel, Pt } from '../../types/design';
import { centroid, distance } from '../dieline/geometry';

/**
 * Turns flat dieline panels into a hinge tree the 3D view can fold.
 *
 * Mapping from the dieline (mm, Y down) to the 3D world (mm, Y up):
 *   dieline (x, y)  →  world (-x, 0, y)
 * The dieline is drawn as seen from the printed outside. In 3D the sheet lies on the XZ
 * plane printed side down (-Y), like a real sheet folded on a table, so seen from below
 * it must read the right way round: hence the mirrored X. Every fold lifts panels
 * upwards (+Y) and the printed side ends up outside the box.
 */
export type FoldNode = {
    panel: Panel;
    /** Hinge start point in dieline coordinates (the group's pivot). Root uses (0, 0). */
    origin: Pt;
    /** Pivot relative to the parent's pivot, in world units. */
    offset: [number, number, number];
    /** Unit hinge axis in world space, or null for the root. */
    axis: [number, number, number] | null;
    /** +1 or -1 so that a positive foldAngle always lifts the panel up (+Y). */
    sign: 1 | -1;
    children: FoldNode[];
};

export function toWorld(p: Pt): Vector3 {
    return new Vector3(-p.x, 0, p.y);
}

export function buildFoldTree(panels: Panel[]): FoldNode[] {
    const byParent = new Map<string | undefined, Panel[]>();
    for (const panel of panels) {
        const key = panel.parentId && panels.some((p) => p.id === panel.parentId) ? panel.parentId : undefined;
        byParent.set(key, [...(byParent.get(key) ?? []), panel]);
    }

    const visited = new Set<string>();

    const build = (panel: Panel, parentOrigin: Pt): FoldNode => {
        visited.add(panel.id);
        let origin: Pt = parentOrigin;
        let axis: FoldNode['axis'] = null;
        let sign: 1 | -1 = 1;

        if (panel.hinge && panel.parentId) {
            origin = panel.hinge.a;
            const u = toWorld(panel.hinge.b).sub(toWorld(panel.hinge.a)).normalize();
            const r = toWorld(centroid(panel.polygon)).sub(toWorld(panel.hinge.a));
            // Y component of u × r tells which way a positive rotation moves the panel.
            const lift = u.z * r.x - u.x * r.z;
            sign = lift >= 0 ? 1 : -1;
            axis = [u.x, u.y, u.z];
        }

        const children = (byParent.get(panel.id) ?? []).filter((c) => !visited.has(c.id)).map((c) => build(c, origin));

        return {
            panel,
            origin,
            offset: [-(origin.x - parentOrigin.x), 0, origin.y - parentOrigin.y],
            axis,
            sign,
            children,
        };
    };

    return (byParent.get(undefined) ?? []).map((root) => build(root, { x: 0, y: 0 }));
}

/** Rotation of one node for a given fold progress (0 = flat, 1 = fully folded). */
export function nodeQuaternion(node: FoldNode, progress: number): Quaternion {
    const q = new Quaternion();
    if (!node.axis) return q;
    const angle = ((node.panel.foldAngle * Math.PI) / 180) * Math.max(0, Math.min(1, progress)) * node.sign;
    return q.setFromAxisAngle(new Vector3(...node.axis), angle);
}

/**
 * World matrices for every panel (maps a flat dieline point, in world coordinates, to its folded position).
 * Used by tests and later for click-to-select and camera framing.
 */
export function panelMatrices(roots: FoldNode[], progress: number): Map<string, Matrix4> {
    const out = new Map<string, Matrix4>();
    const walk = (node: FoldNode, parent: Matrix4) => {
        const local = new Matrix4().compose(new Vector3(...node.offset), nodeQuaternion(node, progress), new Vector3(1, 1, 1));
        const world = parent.clone().multiply(local);
        // Geometry is authored relative to the pivot, so shift by -origin before applying the node transform.
        const pivot = toWorld(node.origin);
        out.set(node.panel.id, world.clone().multiply(new Matrix4().makeTranslation(-pivot.x, 0, -pivot.z)));
        node.children.forEach((child) => walk(child, world));
    };
    roots.forEach((root) => walk(root, new Matrix4()));
    return out;
}

/**
 * Styles whose root panel is a wall rather than the base (tuck end cartons) are folded
 * lying on their back; this turns them upright, top closure up and front panel facing +Z.
 */
const UPRIGHT_STYLES: BoxStyle[] = ['reverse-tuck', 'straight-tuck'];

export function styleOrientation(style: BoxStyle | undefined): Quaternion {
    const q = new Quaternion();
    if (style && UPRIGHT_STYLES.includes(style)) {
        q.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
    }
    return q;
}

/** Bounding box of every panel at the given fold progress, after an optional orientation. */
export function foldedBounds(panels: Panel[], progress: number, orientation = new Quaternion()): Box3 {
    const matrices = panelMatrices(buildFoldTree(panels), progress);
    const rotate = new Matrix4().makeRotationFromQuaternion(orientation);
    const box = new Box3();
    for (const panel of panels) {
        const m = rotate.clone().multiply(matrices.get(panel.id)!);
        for (const p of panel.polygon) box.expandByPoint(toWorld(p).applyMatrix4(m));
    }
    return box;
}

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
