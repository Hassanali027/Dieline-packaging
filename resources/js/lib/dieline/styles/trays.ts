import type { BoxParams, DielineResult, Panel } from '../../../types/design';
import { pt, rect } from '../geometry';
import { buildDielineResult } from '../result';
import { chamferFlap, clamp, dims, flap, hinge, LEFT, RIGHT, UP } from './parts';

/**
 * Base + four walls, with corner flaps on the front and back walls that fold inside the
 * side walls. Shared by the tray and the burger box. Origin at the base's top-left.
 *
 *          [flap][ back ][flap]
 *    [left]      [ base ]      [right]
 *          [flap][ front][flap]
 */
function trayPanels(L: number, W: number, D: number): Panel[] {
    const corner = Math.min(W * 0.45, D);
    const cornerTaper = Math.min(corner * 0.35, D * 0.3);

    const panels: Panel[] = [
        { id: 'base', name: 'Base', polygon: rect(0, 0, L, W), foldAngle: 0, side: 'outside' },
        {
            id: 'back',
            name: 'Back',
            polygon: rect(0, -D, L, D),
            hinge: hinge(pt(0, 0), pt(L, 0)),
            parentId: 'base',
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'front',
            name: 'Front',
            polygon: rect(0, W, L, D),
            hinge: hinge(pt(0, W), pt(L, W)),
            parentId: 'base',
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'left',
            name: 'Left',
            polygon: rect(-D, 0, D, W),
            hinge: hinge(pt(0, 0), pt(0, W)),
            parentId: 'base',
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'right',
            name: 'Right',
            polygon: rect(L, 0, D, W),
            hinge: hinge(pt(L, 0), pt(L, W)),
            parentId: 'base',
            foldAngle: 90,
            side: 'outside',
        },
    ];

    // Corner flaps: tapered on the free (rim) end so they clear the side wall's fold.
    const corners: [string, string, number, number, number][] = [
        // id, parent, hinge x, y from, y to (y from = base side, y to = rim side)
        ['back-left', 'back', 0, 0, -D],
        ['back-right', 'back', L, 0, -D],
        ['front-left', 'front', 0, W, W + D],
        ['front-right', 'front', L, W, W + D],
    ];
    for (const [id, parentId, x, y0, y1] of corners) {
        const out = x === 0 ? LEFT : RIGHT;
        panels.push({
            id: `corner-${id}`,
            name: `Corner Flap ${id.replace('-', ' ')}`,
            polygon: flap(pt(x, y0), pt(x, y1), out, corner, 0, cornerTaper),
            hinge: hinge(pt(x, y0), pt(x, y1)),
            parentId,
            foldAngle: 90,
            side: 'inside',
        });
    }

    return panels;
}

export function generateTray(params: BoxParams): DielineResult {
    const { L, W, D } = dims(params);
    return buildDielineResult(trayPanels(L, W, D));
}

/**
 * Burger box: a tray with a lid hinged on the back wall. The lid is a board thickness
 * bigger than the base so its three lips close over the outside of the walls.
 */
export function burgerPanels(params: BoxParams): Panel[] {
    const { L, W, D, t } = dims(params);
    const c = t; // lid clearance
    const lip = clamp(D * 0.4, 8, 30);
    const lipChamfer = lip * 0.4;
    const lidTop = -D - W - c;

    return [
        ...trayPanels(L, W, D),
        {
            id: 'lid',
            name: 'Lid',
            polygon: rect(-c, lidTop, L + 2 * c, W + c),
            hinge: hinge(pt(0, -D), pt(L, -D)),
            parentId: 'back',
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'lid-front',
            name: 'Lid Front Lip',
            polygon: chamferFlap(pt(-c, lidTop), pt(L + c, lidTop), UP, lip, lipChamfer),
            hinge: hinge(pt(-c, lidTop), pt(L + c, lidTop)),
            parentId: 'lid',
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'lid-left',
            name: 'Lid Left Lip',
            polygon: flap(pt(-c, lidTop), pt(-c, -D), LEFT, lip, lipChamfer, lipChamfer),
            hinge: hinge(pt(-c, lidTop), pt(-c, -D)),
            parentId: 'lid',
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'lid-right',
            name: 'Lid Right Lip',
            polygon: flap(pt(L + c, lidTop), pt(L + c, -D), RIGHT, lip, lipChamfer, lipChamfer),
            hinge: hinge(pt(L + c, lidTop), pt(L + c, -D)),
            parentId: 'lid',
            foldAngle: 90,
            side: 'outside',
        },
    ];
}

export function generateBurger(params: BoxParams): DielineResult {
    return buildDielineResult(burgerPanels(params));
}

/**
 * Sleeve: an open-ended tube that slides over a tray. Length runs along the tube; the
 * cross-section is width × depth. Origin at the bottom panel's top-left:
 *
 *    [bottom][side][ top ][side][glue]
 */
export function sleevePanels(params: BoxParams): Panel[] {
    const { L, W, D } = dims(params);
    const glue = clamp(W * 0.25, 8, 15);
    const glueTaper = Math.min(glue * 0.6, L / 4);

    return [
        { id: 'bottom', name: 'Bottom', polygon: rect(0, 0, W, L), foldAngle: 0, side: 'outside' },
        {
            id: 'side-right',
            name: 'Side Right',
            polygon: rect(W, 0, D, L),
            hinge: hinge(pt(W, 0), pt(W, L)),
            parentId: 'bottom',
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'top',
            name: 'Top',
            polygon: rect(W + D, 0, W, L),
            hinge: hinge(pt(W + D, 0), pt(W + D, L)),
            parentId: 'side-right',
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'side-left',
            name: 'Side Left',
            polygon: rect(2 * W + D, 0, D, L),
            hinge: hinge(pt(2 * W + D, 0), pt(2 * W + D, L)),
            parentId: 'top',
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'glue',
            name: 'Glue Flap',
            polygon: flap(pt(2 * W + 2 * D, 0), pt(2 * W + 2 * D, L), RIGHT, glue, glueTaper),
            hinge: hinge(pt(2 * W + 2 * D, 0), pt(2 * W + 2 * D, L)),
            parentId: 'side-left',
            foldAngle: 90,
            side: 'inside',
        },
    ];
}

export function generateSleeve(params: BoxParams): DielineResult {
    return buildDielineResult(sleevePanels(params));
}
