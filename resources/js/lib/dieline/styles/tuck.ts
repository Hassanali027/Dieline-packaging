import type { BoxParams, DielineResult, Panel } from '../../../types/design';
import { pt, rect } from '../geometry';
import { buildDielineResult } from '../result';
import { chamferFlap, clamp, dims, DOWN, flap, hinge, LEFT, UP } from './parts';

/**
 * Tuck end cartons (folding boxboard). Inside size: length (front panel width),
 * width (side panel width) and depth (height). Layout, origin at the back panel's top-left:
 *
 *            [top tuck]
 *            [top lid ] [dust]            [dust]
 *    [glue]  [  back  ] [side 1] [ front ] [side 2]
 *            [bot lid*]  [dust]  [bot lid*] [dust]
 *
 * Reverse tuck: top lid on the back, bottom lid on the front.
 * Straight tuck: both lids on the back.
 */
export function tuckEndPanels(params: BoxParams, mode: 'reverse' | 'straight'): Panel[] {
    const { L, W, D } = dims(params);

    const glue = clamp(W * 0.3, 8, 15);
    const glueTaper = Math.min(glue * 0.6, D / 4);
    const tuck = Math.min(clamp(W * 0.35, 8, 25), D / 2);
    const tuckChamfer = tuck * 0.45;
    const dust = Math.min(L * 0.45, W * 0.9);
    const dustTaper = Math.min(dust * 0.3, W * 0.2);

    const xBack = 0;
    const xSide1 = L;
    const xFront = L + W;
    const xSide2 = 2 * L + W;

    const panels: Panel[] = [
        { id: 'back', name: 'Back', polygon: rect(xBack, 0, L, D), foldAngle: 0, side: 'outside' },
        {
            id: 'side-1',
            name: 'Side 1',
            polygon: rect(xSide1, 0, W, D),
            hinge: hinge(pt(xSide1, 0), pt(xSide1, D)),
            parentId: 'back',
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'front',
            name: 'Front',
            polygon: rect(xFront, 0, L, D),
            hinge: hinge(pt(xFront, 0), pt(xFront, D)),
            parentId: 'side-1',
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'side-2',
            name: 'Side 2',
            polygon: rect(xSide2, 0, W, D),
            hinge: hinge(pt(xSide2, 0), pt(xSide2, D)),
            parentId: 'front',
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'glue',
            name: 'Glue Flap',
            polygon: flap(pt(0, 0), pt(0, D), LEFT, glue, glueTaper),
            hinge: hinge(pt(0, 0), pt(0, D)),
            parentId: 'back',
            foldAngle: 90,
            side: 'inside',
        },
        // Top closure: always on the back.
        {
            id: 'top-lid',
            name: 'Top Lid',
            polygon: rect(xBack, -W, L, W),
            hinge: hinge(pt(xBack, 0), pt(xBack + L, 0)),
            parentId: 'back',
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'top-tuck',
            name: 'Top Tuck',
            polygon: chamferFlap(pt(xBack, -W), pt(xBack + L, -W), UP, tuck, tuckChamfer),
            hinge: hinge(pt(xBack, -W), pt(xBack + L, -W)),
            parentId: 'top-lid',
            foldAngle: 90,
            side: 'inside',
        },
    ];

    // Bottom closure: on the front (reverse tuck) or the back (straight tuck).
    const bottomParent = mode === 'reverse' ? 'front' : 'back';
    const xBottom = mode === 'reverse' ? xFront : xBack;
    panels.push(
        {
            id: 'bottom-lid',
            name: 'Bottom Lid',
            polygon: rect(xBottom, D, L, W),
            hinge: hinge(pt(xBottom, D), pt(xBottom + L, D)),
            parentId: bottomParent,
            foldAngle: 90,
            side: 'outside',
        },
        {
            id: 'bottom-tuck',
            name: 'Bottom Tuck',
            polygon: chamferFlap(pt(xBottom, D + W), pt(xBottom + L, D + W), DOWN, tuck, tuckChamfer),
            hinge: hinge(pt(xBottom, D + W), pt(xBottom + L, D + W)),
            parentId: 'bottom-lid',
            foldAngle: 90,
            side: 'inside',
        },
    );

    // Dust flaps on both side panels, top and bottom.
    for (const [sideId, x] of [
        ['side-1', xSide1],
        ['side-2', xSide2],
    ] as const) {
        const n = sideId.slice(-1);
        panels.push(
            {
                id: `top-dust-${n}`,
                name: `Top Dust Flap ${n}`,
                polygon: flap(pt(x, 0), pt(x + W, 0), UP, dust, dustTaper),
                hinge: hinge(pt(x, 0), pt(x + W, 0)),
                parentId: sideId,
                foldAngle: 90,
                side: 'inside',
            },
            {
                id: `bottom-dust-${n}`,
                name: `Bottom Dust Flap ${n}`,
                polygon: flap(pt(x, D), pt(x + W, D), DOWN, dust, dustTaper),
                hinge: hinge(pt(x, D), pt(x + W, D)),
                parentId: sideId,
                foldAngle: 90,
                side: 'inside',
            },
        );
    }

    return panels;
}

export function generateReverseTuck(params: BoxParams): DielineResult {
    return buildDielineResult(tuckEndPanels(params, 'reverse'));
}

export function generateStraightTuck(params: BoxParams): DielineResult {
    return buildDielineResult(tuckEndPanels(params, 'straight'));
}
