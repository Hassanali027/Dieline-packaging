import type { BoxParams, DielineResult, Panel, Pt } from '../../../types/design';
import { pt, rect, toMm } from '../geometry';
import { buildDielineResult } from '../result';

/**
 * Mailer box (roll-end front tuck, "RETF"), the usual corrugated e-commerce mailer.
 *
 * Inputs are the inside dimensions: length (X, left-right), width (Y, front-back) and
 * depth (height). The layout is built around the base panel, origin at its top-left:
 *
 *                 [ lid front tuck ]
 *       [dust L]  [      lid       ]  [dust R]
 *        [ear L]  [      back      ]  [ear R]
 *  [side L in][side L][   base   ][side R][side R in]
 *                 [     front      ]
 *                 [  front inner   ]
 *
 * Side walls and the front are double walls: the "inner" panel rolls over 180° to the inside.
 * The ears on the back slot in between the two layers of each side wall.
 */
export function mailerPanels(params: BoxParams): Panel[] {
    const L = toMm(params.length, params.unit);
    const W = toMm(params.width, params.unit);
    const D = toMm(params.depth, params.unit);
    const t = toMm(params.thickness, params.unit);

    const tuck = Math.max(D - t, 1);
    const dust = Math.max(D - t, 1);
    const innerWall = Math.max(D - t, 1);
    const ear = W / 2;

    const tuckChamfer = Math.min(6, tuck / 3, L / 6);
    const dustTaper = Math.min(dust, W / 4);
    const earTaper = Math.min(D * 0.3, ear / 2);
    const innerChamfer = Math.min(3, innerWall / 3);

    const hinge = (a: Pt, b: Pt) => ({ a, b });

    const panels: Panel[] = [
        {
            id: 'base',
            name: 'Base',
            polygon: rect(0, 0, L, W),
            foldAngle: 0,
            side: 'outside',
        },
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
            id: 'lid',
            name: 'Lid',
            polygon: rect(0, -D - W, L, W),
            hinge: hinge(pt(0, -D), pt(L, -D)),
            parentId: 'back',
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'lid-front',
            name: 'Lid Front Tuck',
            polygon: [
                pt(0, -D - W),
                pt(0, -D - W - tuck + tuckChamfer),
                pt(tuckChamfer, -D - W - tuck),
                pt(L - tuckChamfer, -D - W - tuck),
                pt(L, -D - W - tuck + tuckChamfer),
                pt(L, -D - W),
            ],
            hinge: hinge(pt(0, -D - W), pt(L, -D - W)),
            parentId: 'lid',
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'lid-dust-left',
            name: 'Lid Dust Flap Left',
            polygon: [pt(0, -D - W), pt(-dust, -D - W + dustTaper), pt(-dust, -D - dustTaper), pt(0, -D)],
            hinge: hinge(pt(0, -D - W), pt(0, -D)),
            parentId: 'lid',
            foldAngle: 90,
            side: 'inside',
        },
        {
            id: 'lid-dust-right',
            name: 'Lid Dust Flap Right',
            polygon: [pt(L, -D - W), pt(L, -D), pt(L + dust, -D - dustTaper), pt(L + dust, -D - W + dustTaper)],
            hinge: hinge(pt(L, -D - W), pt(L, -D)),
            parentId: 'lid',
            foldAngle: 90,
            side: 'inside',
        },
        {
            id: 'ear-left',
            name: 'Back Ear Left',
            polygon: [pt(0, -D), pt(-ear, -D + earTaper), pt(-ear, 0), pt(0, 0)],
            hinge: hinge(pt(0, -D), pt(0, 0)),
            parentId: 'back',
            foldAngle: 90,
            side: 'inside',
        },
        {
            id: 'ear-right',
            name: 'Back Ear Right',
            polygon: [pt(L, -D), pt(L, 0), pt(L + ear, 0), pt(L + ear, -D + earTaper)],
            hinge: hinge(pt(L, -D), pt(L, 0)),
            parentId: 'back',
            foldAngle: 90,
            side: 'inside',
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
            id: 'front-inner',
            name: 'Front Inner',
            polygon: [
                pt(0, W + D),
                pt(L, W + D),
                pt(L, W + D + innerWall - innerChamfer),
                pt(L - innerChamfer, W + D + innerWall),
                pt(innerChamfer, W + D + innerWall),
                pt(0, W + D + innerWall - innerChamfer),
            ],
            hinge: hinge(pt(0, W + D), pt(L, W + D)),
            parentId: 'front',
            foldAngle: 180,
            side: 'inside',
        },
        {
            id: 'side-left',
            name: 'Side Left',
            polygon: rect(-D, 0, D, W),
            hinge: hinge(pt(0, 0), pt(0, W)),
            parentId: 'base',
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'side-left-inner',
            name: 'Side Left Inner',
            polygon: [
                pt(-D, t),
                pt(-D, W - t),
                pt(-D - innerWall + innerChamfer, W - t),
                pt(-D - innerWall, W - t - innerChamfer),
                pt(-D - innerWall, t + innerChamfer),
                pt(-D - innerWall + innerChamfer, t),
            ],
            hinge: hinge(pt(-D, t), pt(-D, W - t)),
            parentId: 'side-left',
            foldAngle: 180,
            side: 'inside',
        },
        {
            id: 'side-right',
            name: 'Side Right',
            polygon: rect(L, 0, D, W),
            hinge: hinge(pt(L, 0), pt(L, W)),
            parentId: 'base',
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'side-right-inner',
            name: 'Side Right Inner',
            polygon: [
                pt(L + D, t),
                pt(L + D + innerWall - innerChamfer, t),
                pt(L + D + innerWall, t + innerChamfer),
                pt(L + D + innerWall, W - t - innerChamfer),
                pt(L + D + innerWall - innerChamfer, W - t),
                pt(L + D, W - t),
            ],
            hinge: hinge(pt(L + D, t), pt(L + D, W - t)),
            parentId: 'side-right',
            foldAngle: 180,
            side: 'inside',
        },
    ];

    return panels;
}

export function generateMailer(params: BoxParams): DielineResult {
    return buildDielineResult(mailerPanels(params));
}
