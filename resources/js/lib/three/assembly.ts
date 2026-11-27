import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import type { BoxStyle, DielineResult } from '../../types/design';
import { extractPart } from '../dieline';
import { buildFoldTree, foldedBounds, panelMatrices, styleOrientation, toWorld } from './foldTree';

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
};

/** Extra height the lid rises when the box is fully open, on top of its own depth (mm). */
export const LID_LIFT_EXTRA = 40;

function centred(result: DielineResult, orientation: Quaternion, floor: number): [number, number, number] {
    const box = foldedBounds(result.panels, 1, orientation);
    const c = box.getCenter(new Vector3());
    return [-c.x, floor - box.min.y, -c.z];
}

/**
 * @param progress the Open / Close slider: folding boxes fold with it; rigid boxes are always
 *                 assembled and the slider lifts the lid instead (1 = closed).
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

    // A rigid drawer is two assemblies: the sleeve stays put while the tray slides
    // out along the front axis. Its dieline parts are named drawer and sleeve.
    if (style === 'rigid-drawer' && result.parts.includes('drawer') && result.parts.includes('sleeve')) {
        const sleeve = extractPart(result, 'sleeve');
        const drawer = extractPart(result, 'drawer');
        const sleevePosition = centred(sleeve, none, board);
        const drawerPosition = centred(drawer, none, board);
        // The tray sits on the sleeve bottom and slides out along the box length (+X).
        drawerPosition[1] += board + 0.3;
        drawerPosition[0] += (1 - p) * (Math.max(1, drawer.overallSize.width) * 0.72);
        pieces.push({ key: 'sleeve', result: sleeve, fold: 1, orientation: none, position: sleevePosition });
        pieces.push({ key: 'drawer', result: drawer, fold: 1, orientation: none, position: drawerPosition });
        return pieces;
    }

    if (style === 'rigid-shoulder' && result.parts.includes('sleeve') && result.parts.includes('lid')) {
        const base = extractPart(result, 'base');
        const basePos = centred(base, none, board);
        const baseBox = foldedBounds(base.panels, 1);
        const baseTop = basePos[1] + baseBox.max.y;
        pieces.push({ key: 'base', result: base, fold: 1, orientation: none, position: basePos });

        if (result.parts.includes('liner')) {
            const liner = extractPart(result, 'liner');
            pieces.push({ key: 'liner', result: liner, fold: 1, orientation: none, position: centred(liner, none, board + 0.3) });
        }

        const neck = extractPart(result, 'sleeve');
        const neckOrientation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
        const neckPosition = centred(neck, neckOrientation, baseTop);
        const neckBox = foldedBounds(neck.panels, 1, neckOrientation);
        const neckTop = neckPosition[1] + neckBox.max.y;
        pieces.push({ key: 'sleeve', result: neck, fold: 1, orientation: neckOrientation, position: neckPosition });

        const lid = extractPart(result, 'lid');
        const flip = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI);
        const lidBox = foldedBounds(lid.panels, 1, flip);
        const lidLift = (1 - p) * (lidBox.max.y - lidBox.min.y + LID_LIFT_EXTRA);
        pieces.push({ key: 'lid', result: lid, fold: 1, orientation: flip, position: [-lidBox.getCenter(new Vector3()).x, neckTop - lidBox.max.y + lidLift, -lidBox.getCenter(new Vector3()).z] });
        return pieces;
    }

    if (style === 'rigid-book' && result.parts.includes('base') && result.parts.includes('lid')) {
        const base = extractPart(result, 'base');
        const basePos = centred(base, none, board);
        const baseBox = foldedBounds(base.panels, 1);
        pieces.push({ key: 'base', result: base, fold: 1, orientation: none, position: basePos });
        if (result.parts.includes('liner')) {
            const liner = extractPart(result, 'liner');
            pieces.push({ key: 'liner', result: liner, fold: 1, orientation: none, position: centred(liner, none, board + 0.3) });
        }

        const cover = extractPart(result, 'lid');
        const back = cover.panels.find((panel) => panel.id === 'lid-back');
        const coverMatrices = panelMatrices(buildFoldTree(cover.panels), p);
        const backMatrix = coverMatrices.get('lid-back') ?? new Matrix4();
        const backBounds = new Box3();
        if (back) for (const point of back.polygon) backBounds.expandByPoint(toWorld(point).applyMatrix4(backMatrix));
        const target = new Vector3(0, basePos[1] + board, 0);
        const offset = target.sub(backBounds.getCenter(new Vector3()));
        pieces.push({ key: 'lid', result: cover, fold: p, orientation: none, position: [offset.x, offset.y, offset.z] });
        return pieces;
    }

    const base = extractPart(result, 'base');
    const basePos = centred(base, none, board);
    const baseTop = basePos[1] + foldedBounds(base.panels, 1).max.y;
    pieces.push({ key: 'base', result: base, fold: 1, orientation: none, position: basePos });

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
        const lift = (1 - p) * (lidHeight + LID_LIFT_EXTRA);
        // Closed: the inside of the lid top rests on the base rim.
        pieces.push({ key: 'lid', result: lid, fold: 1, orientation: flip, position: [-c.x, baseTop - box.max.y + lift, -c.z] });
    }
    return pieces;
}
