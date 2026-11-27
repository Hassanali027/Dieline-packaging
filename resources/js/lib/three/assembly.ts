import { Quaternion, Vector3 } from 'three';
import type { BoxStyle, DielineResult } from '../../types/design';
import { extractPart } from '../dieline';
import { foldedBounds, styleOrientation, toWorld } from './foldTree';

/**
 * How the 3D view puts a box together (Dev 3). Each piece is one dieline (a whole folding
 * box, or one part of a rigid box), folded by `fold` (0 = flat, 1 = folded), turned by
 * `orientation` and moved to `position` (world mm, Y up, box centred on the origin, on the
 * ground at y = 0). `key` matches the editor's texture surfaces.
 */
export type AssemblyPiece = {
    key: string;
    result: DielineResult;
    fold: number;
    orientation: Quaternion;
    position: [number, number, number];
    /** Optional hinge rotation applied around a world pivot (e.g. rigid book cover or magnetic lid). */
    hingeRotation?: {
        pivot: [number, number, number];
        axis: [number, number, number];
        angle: number;
    };
};

/** Extra height the lid rises when the box is fully open, on top of its own depth (mm). */
export const LID_LIFT_EXTRA = 40;

/** Maximum opening angle (degrees) for hinged rigid lids (book & magnetic styles). */
export const BOOK_OPEN_DEG = 115;
export const MAGNETIC_OPEN_DEG = 105;

function centred(result: DielineResult, orientation: Quaternion, floor: number): [number, number, number] {
    const box = foldedBounds(result.panels, 1, orientation);
    const c = box.getCenter(new Vector3());
    return [-c.x, floor - box.min.y, -c.z];
}

/**
 * @param progress the Open / Close slider: folding boxes fold with it; rigid boxes are always
 *                 assembled and the slider animates the lid/drawer (1 = closed, 0 = open).
 * @param board    board thickness in mm (panels are extruded outwards by it).
 */
export function buildAssembly(style: BoxStyle | undefined, result: DielineResult, progress: number, board: number): AssemblyPiece[] {
    const p = Math.max(0, Math.min(1, progress));

    if (!result.parts?.length) {
        const orientation = styleOrientation(style);
        return [{ key: 'main', result, fold: p, orientation, position: centred(result, orientation, board) }];
    }

    const none = new Quaternion();
    const pieces: AssemblyPiece[] = [];

    // Dev 1's rigid styles (Sprint 3): built from their real dielines (lib/dieline/styles/rigid-extra.ts).
    if (style === 'rigid-drawer' && result.parts.includes('drawer') && result.parts.includes('sleeve')) {
        return drawerAssembly(result, p, board);
    }
    if (style === 'rigid-shoulder' && result.parts.includes('sleeve') && result.parts.includes('lid')) {
        return shoulderAssembly(result, p, board);
    }
    if (style === 'rigid-book' && result.parts.includes('lid') && result.parts.includes('base')) {
        return bookAssembly(result, p, board);
    }

    // Rigid Drawer box: sleeve stays fixed, inner drawer/tray slides out along +Z as progress -> 0.
    if (style === 'rigid-drawer' || (result.parts.includes('sleeve') && (result.parts.includes('drawer') || result.parts.includes('tray')))) {
        const sleeve = extractPart(result, 'sleeve');
        const sleeveBounds = foldedBounds(sleeve.panels, 1, none);
        const sleeveDepth = sleeveBounds.max.z - sleeveBounds.min.z;
        const sleevePos = centred(sleeve, none, board);
        pieces.push({ key: 'sleeve', result: sleeve, fold: 1, orientation: none, position: sleevePos });

        const drawerKey = result.parts.includes('drawer') ? 'drawer' : 'tray';
        const drawer = extractPart(result, drawerKey);
        const drawerBasePos = centred(drawer, none, board + 0.5);
        const slideZ = (1 - p) * sleeveDepth * 0.78;
        pieces.push({
            key: drawerKey,
            result: drawer,
            fold: 1,
            orientation: none,
            position: [drawerBasePos[0], drawerBasePos[1], drawerBasePos[2] + slideZ],
        });

        if (result.parts.includes('liner')) {
            const liner = extractPart(result, 'liner');
            const linerPos = centred(liner, none, board + 0.8);
            pieces.push({
                key: 'liner',
                result: liner,
                fold: 1,
                orientation: none,
                position: [linerPos[0], linerPos[1], linerPos[2] + slideZ],
            });
        }
        return pieces;
    }

    const base = extractPart(result, 'base');
    const baseLocal = foldedBounds(base.panels, 1);
    const basePos = centred(base, none, board);
    const baseTop = basePos[1] + baseLocal.max.y;
    const baseWidth = baseLocal.max.x - baseLocal.min.x;
    const baseDepth = baseLocal.max.z - baseLocal.min.z;
    pieces.push({ key: 'base', result: base, fold: 1, orientation: none, position: basePos });

    if (result.parts.includes('tray') && style === 'rigid-shoulder') {
        const tray = extractPart(result, 'tray');
        pieces.push({ key: 'tray', result: tray, fold: 1, orientation: none, position: centred(tray, none, board + 0.3) });
    }

    if (result.parts.includes('liner')) {
        const liner = extractPart(result, 'liner');
        // On the base floor (the floor panel's inner face is at y = board).
        pieces.push({ key: 'liner', result: liner, fold: 1, orientation: none, position: centred(liner, none, board + 0.3) });
    }

    if (result.parts.includes('lid')) {
        const lid = extractPart(result, 'lid');
        // The lid wrap folds top-down; flip it over so the top faces up and the walls hang down.
        const flip = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI);
        const box = foldedBounds(lid.panels, 1, flip);
        const c = box.getCenter(new Vector3());
        const lidHeight = box.max.y - box.min.y;
        const closedPos: [number, number, number] = [-c.x, baseTop - box.max.y, -c.z];

        if (style === 'rigid-book') {
            // Book cover swings open around the left spine edge.
            const angle = ((1 - p) * BOOK_OPEN_DEG * Math.PI) / 180;
            pieces.push({
                key: 'lid',
                result: lid,
                fold: 1,
                orientation: flip,
                position: closedPos,
                hingeRotation: {
                    pivot: [-baseWidth / 2, baseTop, 0],
                    axis: [0, 0, 1],
                    angle,
                },
            });
        } else if (style === 'rigid-magnetic') {
            // Magnetic closure flap swings open around the back hinge edge.
            const angle = -(((1 - p) * MAGNETIC_OPEN_DEG * Math.PI) / 180);
            pieces.push({
                key: 'lid',
                result: lid,
                fold: 1,
                orientation: flip,
                position: closedPos,
                hingeRotation: {
                    pivot: [0, baseTop, -baseDepth / 2],
                    axis: [1, 0, 0],
                    angle,
                },
            });
        } else {
            const lift = (1 - p) * (lidHeight + LID_LIFT_EXTRA);
            // Closed: the inside of the lid top rests on the base rim.
            pieces.push({ key: 'lid', result: lid, fold: 1, orientation: flip, position: [closedPos[0], closedPos[1] + lift, closedPos[2]] });
        }
    }
    return pieces;
}

/**
 * Rigid drawer: the sleeve is a tube open at both ends of its length (world X); the drawer
 * tray, with its liner, sits on the sleeve floor and slides out along X as the box opens.
 */
function drawerAssembly(result: DielineResult, p: number, board: number): AssemblyPiece[] {
    const none = new Quaternion();
    const sleeve = extractPart(result, 'sleeve');
    const drawer = extractPart(result, 'drawer');
    // Sleeve floor board spans y 0..board; the drawer's outer bottom rests just above it.
    const sleevePos = centred(sleeve, none, board);
    const drawerFloor = 2 * board + 0.3;
    const drawerPos = centred(drawer, none, drawerFloor);
    const drawerBox = foldedBounds(drawer.panels, 1);
    const slide = (1 - p) * (drawerBox.max.x - drawerBox.min.x) * 0.75;
    const pieces: AssemblyPiece[] = [
        { key: 'sleeve', result: sleeve, fold: 1, orientation: none, position: sleevePos },
        { key: 'drawer', result: drawer, fold: 1, orientation: none, position: [drawerPos[0] + slide, drawerPos[1], drawerPos[2]] },
    ];
    if (result.parts?.includes('liner')) {
        const liner = extractPart(result, 'liner');
        const linerPos = centred(liner, none, drawerFloor + 0.3);
        pieces.push({ key: 'liner', result: liner, fold: 1, orientation: none, position: [linerPos[0] + slide, linerPos[1], linerPos[2]] });
    }
    return pieces;
}

/**
 * Shoulder box: the base, the neck (a four-wall collar standing up out of the base) and the lid
 * that closes over the neck down to the base's rim; opening lifts the lid off.
 */
function shoulderAssembly(result: DielineResult, p: number, board: number): AssemblyPiece[] {
    const none = new Quaternion();
    const base = extractPart(result, 'base');
    const basePos = centred(base, none, board);
    const baseTop = basePos[1] + foldedBounds(base.panels, 1).max.y;
    const pieces: AssemblyPiece[] = [{ key: 'base', result: base, fold: 1, orientation: none, position: basePos }];
    if (result.parts?.includes('liner')) {
        const liner = extractPart(result, 'liner');
        pieces.push({ key: 'liner', result: liner, fold: 1, orientation: none, position: centred(liner, none, board + 0.3) });
    }

    // The neck band folds into a tube along world Z; stand it up.
    const neck = extractPart(result, 'sleeve');
    const upright = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
    const neckPos = centred(neck, upright, baseTop);
    const neckTop = neckPos[1] + foldedBounds(neck.panels, 1, upright).max.y;
    pieces.push({ key: 'sleeve', result: neck, fold: 1, orientation: upright, position: neckPos });

    const lid = extractPart(result, 'lid');
    const flip = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI);
    const lidBox = foldedBounds(lid.panels, 1, flip);
    const c = lidBox.getCenter(new Vector3());
    const lift = (1 - p) * (lidBox.max.y - lidBox.min.y + LID_LIFT_EXTRA);
    pieces.push({ key: 'lid', result: lid, fold: 1, orientation: flip, position: [-c.x, neckTop - lidBox.max.y + lift, -c.z] });
    return pieces;
}

/**
 * Book box: the cover's back board lies under the tray, the spine stands at one end and the
 * front cover closes over the top. Opening swings only the front cover about the spine.
 */
function bookAssembly(result: DielineResult, p: number, board: number): AssemblyPiece[] {
    const none = new Quaternion();
    const base = extractPart(result, 'base');
    // The tray stands on the back board (board thick), so its outer bottom is at y = board.
    const basePos = centred(base, none, 2 * board);
    const pieces: AssemblyPiece[] = [{ key: 'base', result: base, fold: 1, orientation: none, position: basePos }];
    if (result.parts?.includes('liner')) {
        const liner = extractPart(result, 'liner');
        pieces.push({ key: 'liner', result: liner, fold: 1, orientation: none, position: centred(liner, none, 2 * board + 0.3) });
    }

    const cover = extractPart(result, 'lid');
    // Closed: front cover at 90° to the spine (flat over the tray); open: swung past upright.
    const frontAngle = 90 - (1 - p) * BOOK_OPEN_DEG;
    const panels = cover.panels.map((panel) => (panel.id === 'lid-front' ? { ...panel, foldAngle: frontAngle } : panel));
    const back = panels.find((panel) => panel.id === 'lid-back');
    const centre = new Vector3();
    if (back) {
        for (const q of back.polygon) centre.add(toWorld(q));
        centre.divideScalar(back.polygon.length);
    }
    // The back board's inner face (local y = 0) sits at y = board, centred under the tray.
    pieces.push({ key: 'lid', result: { ...cover, panels }, fold: 1, orientation: none, position: [-centre.x, board, -centre.z] });
    return pieces;
}
