import type { BoxParams, ChipboardPiece, DielineResult, Panel, Pt } from '../../../types/design';
import { distance, pt, rect, round, toMm } from '../geometry';
import { buildDielineResult } from '../result';
import { flap, hinge, LEFT, RIGHT } from './parts';
import { layoutParts, linerPanels, rigidSizes, WRAP_MM, wrapPanels, type RigidSizes } from './rigid';

/**
 * Magnetic closure box (rigid): a base tray with a hinged cover. The cover ("case") is one
 * strip of chipboard boards wrapped in one printed sheet:
 *
 *            [ turn-in ]
 *  [ti] [   back board   ] [ti]     back: glued to the base's back wall
 *  [ti] [   top board    ] [ti]     top: the lid, hinged on the back
 *  [ti] [  front flap    ] [ti]     front flap: closes over the front (magnets inside)
 *            [ turn-in ]
 *
 * - The base tray is wrapped exactly like the Lid & Base box's base; the liner too.
 * - Each wrap panel is longer than its board by one board thickness, so the paper also
 *   covers the board edge at the hinge; the side turn-ins are notched at 45° where the
 *   boards fold, so they do not overlap.
 * - `rigid.lidDepth` is the front flap height (default 60% of the base height).
 *
 * Parts: 'lid' (the case wrap), 'base' and 'liner', so the editor's part tabs and the 3D
 * view (lib/three/assembly.ts, rigid-magnetic: the cover swings open on the back hinge)
 * work as for the other rigid boxes.
 */

export type MagneticSizes = RigidSizes & {
    cover: { length: number; back: number; top: number; flap: number };
};

export function magneticSizes(params: BoxParams): MagneticSizes {
    const s = rigidSizes(params);
    const b = s.board;
    const flapInput = params.rigid?.lidDepth;
    const flapDefault = s.base.height * 0.6;
    const flapHeight = flapInput === undefined || flapInput === null ? flapDefault : Math.min(toMm(Number(flapInput), params.unit), s.base.height);
    return {
        ...s,
        cover: {
            // Covers the base with a little clearance at each side.
            length: s.base.length + 2 * WRAP_MM + s.clearance,
            // The back board stands behind the base and carries the cover, so it is as tall as the base plus the top board.
            back: s.base.height + b,
            // The top spans the base, the back board and the front flap's thickness.
            top: s.base.width + 2 * b + 2 * WRAP_MM + s.clearance,
            flap: Math.max(10, flapHeight),
        },
    };
}

/** The case wrap: back, top and front flap with turn-ins all round. */
function coverPanels(s: MagneticSizes): Panel[] {
    const b = s.board;
    const ti = s.turnIn + b;
    const Lc = s.cover.length;
    const top = s.cover.top;
    // The paper climbs over the next board's edge at each hinge.
    const back = s.cover.back + b;
    const front = s.cover.flap + b;
    const id = (name: string) => `lid-${name}`;

    const panels: Panel[] = [
        { id: id('top'), name: 'Cover Top', polygon: rect(0, 0, Lc, top), foldAngle: 0, side: 'outside', part: 'lid' },
        {
            id: id('back'),
            name: 'Cover Back',
            polygon: rect(0, -back, Lc, back),
            hinge: hinge(pt(0, 0), pt(Lc, 0)),
            parentId: id('top'),
            foldAngle: 90,
            side: 'outside',
            part: 'lid',
        },
        {
            id: id('front'),
            name: 'Cover Front Flap',
            polygon: rect(0, top, Lc, front),
            hinge: hinge(pt(0, top), pt(Lc, top)),
            parentId: id('top'),
            foldAngle: 90,
            side: 'outside',
            part: 'lid',
        },
    ];

    const turnIn = (key: string, name: string, parent: string, a: Pt, b2: Pt, out: Pt) => {
        const taper = Math.min(ti, distance(a, b2) / 2 - 0.5);
        panels.push({
            id: id(`turnin-${key}`),
            name: `Cover Turn-in ${name}`,
            polygon: flap(a, b2, out, ti, taper, taper),
            hinge: hinge(a, b2),
            parentId: id(parent),
            foldAngle: 180,
            side: 'inside',
            part: 'lid',
        });
    };

    // Free ends of the strip.
    turnIn('back', 'back edge', 'back', pt(0, -back), pt(Lc, -back), pt(0, -1));
    turnIn('front', 'front edge', 'front', pt(0, top + front), pt(Lc, top + front), pt(0, 1));
    // Both long sides, one flap per board so each folds with its own board.
    const rows: [string, string, number, number][] = [
        ['back', 'back', -back, 0],
        ['top', 'top', 0, top],
        ['front', 'front', top, top + front],
    ];
    for (const [key, parent, y1, y2] of rows) {
        turnIn(`${key}-left`, `${key} left`, parent, pt(0, y1), pt(0, y2), LEFT);
        turnIn(`${key}-right`, `${key} right`, parent, pt(Lc, y1), pt(Lc, y2), RIGHT);
    }
    return panels;
}

function chipboardList(s: MagneticSizes): ChipboardPiece[] {
    const r = (v: number) => round(v, 1);
    const b = s.board;
    const piece = (part: ChipboardPiece['part'], name: string, width: number, height: number, quantity: number): ChipboardPiece => ({
        part,
        name,
        width: r(width),
        height: r(height),
        quantity,
    });
    return [
        piece('base', 'Base bottom', s.base.length, s.base.width, 1),
        piece('base', 'Base long wall', s.base.length, s.base.height - b, 2),
        piece('base', 'Base short wall', s.base.width - 2 * b, s.base.height - b, 2),
        piece('lid', 'Cover back board', s.cover.length, s.cover.back, 1),
        piece('lid', 'Cover top board', s.cover.length, s.cover.top, 1),
        piece('lid', 'Cover front flap board', s.cover.length, s.cover.flap, 1),
    ];
}

export function generateRigidMagnetic(params: BoxParams): DielineResult {
    const s = magneticSizes(params);
    const panels = layoutParts([
        coverPanels(s),
        wrapPanels('base', s.base.length, s.base.width, s.base.height, s.turnIn, s.board),
        linerPanels(s.liner.length, s.liner.width, s.liner.wall),
    ]);
    const parts = ['lid', 'base', ...(panels.some((p) => p.part === 'liner') ? ['liner'] : [])];
    return { ...buildDielineResult(panels, { parts }), chipboard: chipboardList(s) };
}
