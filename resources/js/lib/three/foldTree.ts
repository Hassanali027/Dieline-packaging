import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import type { BoxStyle, Panel, Pt } from '../../types/design';
import { centroid } from '../dieline/geometry';

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
