import type { BoxParams, ChipboardPiece, DielineResult, Panel } from '../../../types/design';
import { bounds, pt, rect, round, toMm, translate } from '../geometry';
import { buildDielineResult } from '../result';
import { dims, DOWN, flap, hinge, LEFT, RIGHT, UP } from './parts';

/**
 * Rigid (set-up) boxes: chipboard trays covered with a printed wrap paper.
 * What gets printed is the wrap, so each part's dieline is its wrap:
 *
 *              [  turn-in  ]
 *     [ear]    [   wall    ]    [ear]
 * [ti][wall]   [ top/bottom]   [wall][ti]
 *     [ear]    [   wall    ]    [ear]
 *              [  turn-in  ]
 *
 * - walls fold 90° up around the chipboard, turn-ins fold 180° over the rim to the inside
 *   (cut at 45° so they meet in a mitre), ears on the long walls wrap around the corners
 *   under the short walls' paper.
 * - The liner covers the inside floor and the inside walls below the turn-in.
 *
 * Inputs are the inside size of the base; defaults follow the plan (turn-in 15-20 mm,
 * lid clearance 1-2 mm). Tolerances will become admin-editable per factory.
 */

/** Wrap paper thickness used in the lid size formula, mm. */
export const WRAP_MM = 0.2;

export type RigidSizes = {
    board: number;
    turnIn: number;
    clearance: number;
    base: { length: number; width: number; height: number };
    lid: { length: number; width: number; height: number };
    liner: { length: number; width: number; wall: number };
};

/** All the derived sizes of a lid & base box (outer sizes of the chipboard trays). */
export function rigidSizes(params: BoxParams): RigidSizes {
    const { L, W, D, t } = dims(params);
    const r = params.rigid ?? { boardThickness: t, turnIn: 18 };
    const mm = (v: number | undefined, fallback: number) =>
        v === undefined || v === null || Number.isNaN(Number(v)) ? fallback : toMm(Number(v), params.unit);
    const board = mm(r.boardThickness, t || 2);
    const turnIn = mm(r.turnIn, 18);
    const clearance = mm(r.lidClearance, 1.5);
    const baseHeight = D + board;
    const lidHeight = Math.min(mm(r.lidDepth, D / 2), baseHeight);

    // Plan: lid = base outer + 2 × (board + wrap) + clearance (inside of the lid).
    const lidInsideL = L + 2 * (board + WRAP_MM) + clearance;
    const lidInsideW = W + 2 * (board + WRAP_MM) + clearance;

    return {
        board,
        turnIn,
        clearance,
        base: { length: L + 2 * board, width: W + 2 * board, height: baseHeight },
        lid: { length: lidInsideL + 2 * board, width: lidInsideW + 2 * board, height: lidHeight },
        // The liner sits inside, 0.5 mm clear of each wall, and covers the wall below the turn-in.
        liner: { length: L - 1, width: W - 1, wall: Math.max(0, D - turnIn + 3) },
    };
}

/** Wrap for one chipboard tray of outer size length × width × height. */
export function wrapPanels(part: 'lid' | 'base', length: number, width: number, height: number, turnIn: number, board: number): Panel[] {
    const Lo = length;
    const Wo = width;
    const H = height;
    // The turn-in also has to climb over the board's edge before it reaches the inside.
    const ti = turnIn + board;
    const ear = Math.min(15, H * 0.6, Wo * 0.25);
    const earTaper = ear * 0.4;
    const id = (name: string) => `${part}-${name}`;
    const face = part === 'lid' ? 'top' : 'bottom';
    const label = (name: string) => `${part === 'lid' ? 'Lid' : 'Base'} ${name}`;

    const walls: [string, string, Panel['polygon'], { a: ReturnType<typeof pt>; b: ReturnType<typeof pt> }][] = [
        ['back', 'Back', rect(0, -H, Lo, H), hinge(pt(0, 0), pt(Lo, 0))],
        ['front', 'Front', rect(0, Wo, Lo, H), hinge(pt(0, Wo), pt(Lo, Wo))],
        ['left', 'Left', rect(-H, 0, H, Wo), hinge(pt(0, 0), pt(0, Wo))],
        ['right', 'Right', rect(Lo, 0, H, Wo), hinge(pt(Lo, 0), pt(Lo, Wo))],
    ];

    const panels: Panel[] = [
        { id: id(face), name: label(face === 'top' ? 'Top' : 'Bottom'), polygon: rect(0, 0, Lo, Wo), foldAngle: 0, side: 'outside', part },
    ];
    for (const [key, name, polygon, h] of walls) {
        panels.push({ id: id(key), name: label(name), polygon, hinge: h, parentId: id(face), foldAngle: 90, side: 'outside', part });
    }

    // Turn-ins on the far edge of every wall, mitred at 45° (taper = height).
    const turnIns: [string, ReturnType<typeof pt>, ReturnType<typeof pt>, ReturnType<typeof pt>][] = [
        ['back', pt(0, -H), pt(Lo, -H), UP],
        ['front', pt(0, Wo + H), pt(Lo, Wo + H), DOWN],
        ['left', pt(-H, 0), pt(-H, Wo), LEFT],
        ['right', pt(Lo + H, 0), pt(Lo + H, Wo), RIGHT],
    ];
    for (const [key, a, b, out] of turnIns) {
        panels.push({
            id: id(`turnin-${key}`),
            name: label(`Turn-in ${key}`),
            // 45° mitre, but never so deep that a short edge turns inside out.
            polygon: flap(
                a,
                b,
                out,
                ti,
                Math.min(ti, Math.hypot(b.x - a.x, b.y - a.y) / 2 - 0.5),
                Math.min(ti, Math.hypot(b.x - a.x, b.y - a.y) / 2 - 0.5),
            ),
            hinge: hinge(a, b),
            parentId: id(key),
            foldAngle: 180,
            side: 'inside',
            part,
        });
    }

    // Corner ears on the long walls, wrapping round the corners under the short walls' paper.
    const ears: [string, string, ReturnType<typeof pt>, ReturnType<typeof pt>, ReturnType<typeof pt>][] = [
        ['back-left', 'back', pt(0, 0), pt(0, -H), LEFT],
        ['back-right', 'back', pt(Lo, 0), pt(Lo, -H), RIGHT],
        ['front-left', 'front', pt(0, Wo), pt(0, Wo + H), LEFT],
        ['front-right', 'front', pt(Lo, Wo), pt(Lo, Wo + H), RIGHT],
    ];
    for (const [key, parent, a, b, out] of ears) {
        panels.push({
            id: id(`ear-${key}`),
            name: label(`Corner ear ${key.replace('-', ' ')}`),
            polygon: flap(a, b, out, ear, earTaper, earTaper),
            hinge: hinge(a, b),
            parentId: id(parent),
            foldAngle: 90,
            side: 'inside',
            part,
        });
    }
    return panels;
}

/** Liner: inside floor plus the inside walls below the turn-in. */
export function linerPanels(length: number, width: number, wall: number): Panel[] {
    const floor: Panel = { id: 'liner-floor', name: 'Liner Floor', polygon: rect(0, 0, length, width), foldAngle: 0, side: 'outside', part: 'liner' };
    if (wall < 3) return [floor];
    const w = wall;
    const sides: [string, Panel['polygon'], ReturnType<typeof pt>, ReturnType<typeof pt>][] = [
        ['back', rect(0, -w, length, w), pt(0, 0), pt(length, 0)],
        ['front', rect(0, width, length, w), pt(0, width), pt(length, width)],
        ['left', rect(-w, 0, w, width), pt(0, 0), pt(0, width)],
        ['right', rect(length, 0, w, width), pt(length, 0), pt(length, width)],
    ];
    return [
        floor,
        ...sides.map(
            ([key, polygon, a, b]): Panel => ({
                id: `liner-${key}`,
                name: `Liner ${key[0].toUpperCase()}${key.slice(1)}`,
                polygon,
                hinge: hinge(a, b),
                parentId: 'liner-floor',
                foldAngle: 90,
                side: 'outside',
                part: 'liner',
            }),
        ),
    ];
}

function chipboardList(s: RigidSizes): ChipboardPiece[] {
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
        // Walls stand on the bottom / under the top; long walls run full length, short walls fit between them.
        piece('base', 'Base bottom', s.base.length, s.base.width, 1),
        piece('base', 'Base long wall', s.base.length, s.base.height - b, 2),
        piece('base', 'Base short wall', s.base.width - 2 * b, s.base.height - b, 2),
        piece('lid', 'Lid top', s.lid.length, s.lid.width, 1),
        piece('lid', 'Lid long wall', s.lid.length, s.lid.height - b, 2),
        piece('lid', 'Lid short wall', s.lid.width - 2 * b, s.lid.height - b, 2),
    ];
}

/** Gap between parts when they share one sheet, mm. */
const PART_GAP = 25;

/** Lays the parts of a rigid box out left to right, top-aligned, so a combined sheet never overlaps. */
export function layoutParts(groups: Panel[][]): Panel[] {
    const panels: Panel[] = [];
    let x = 0;
    for (const group of groups) {
        const b = bounds(group.map((p) => p.polygon));
        const dx = x - b.minX;
        const dy = -b.minY;
        for (const p of group) {
            panels.push({
                ...p,
                polygon: translate(p.polygon, dx, dy),
                hinge: p.hinge ? { a: pt(p.hinge.a.x + dx, p.hinge.a.y + dy), b: pt(p.hinge.b.x + dx, p.hinge.b.y + dy) } : undefined,
            });
        }
        x += b.width + PART_GAP;
    }
    return panels;
}

export function rigidLidBasePanels(params: BoxParams): { panels: Panel[]; sizes: RigidSizes } {
    const s = rigidSizes(params);
    const panels = layoutParts([
        wrapPanels('lid', s.lid.length, s.lid.width, s.lid.height, s.turnIn, s.board),
        wrapPanels('base', s.base.length, s.base.width, s.base.height, s.turnIn, s.board),
        linerPanels(s.liner.length, s.liner.width, s.liner.wall),
    ]);
    return { panels, sizes: s };
}

export function generateRigidLidBase(params: BoxParams): DielineResult {
    const { panels, sizes } = rigidLidBasePanels(params);
    const parts = ['lid', 'base', ...(panels.some((p) => p.part === 'liner') ? ['liner'] : [])];
    return { ...buildDielineResult(panels, { parts }), chipboard: chipboardList(sizes) };
}
