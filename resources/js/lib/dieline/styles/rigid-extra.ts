import type { BoxParams, ChipboardPiece, DielineResult, Panel } from '../../../types/design';
import { bounds, pt, rect, toMm, translate } from '../geometry';
import { buildDielineResult } from '../result';
import { linerPanels, rigidSizes, wrapPanels } from './rigid';

type Part = NonNullable<Panel['part']>;

/** A connected net for the four walls of a rigid sleeve or shoulder collar. */
function perimeterBand(part: Part, length: number, width: number, height: number, glueWidth: number, name: string): Panel[] {
    const faces: { id: string; name: string; x: number; width: number }[] = [
        { id: 'front', name: 'Front', x: 0, width: length },
        { id: 'side-a', name: 'Side', x: length, width },
        { id: 'back', name: 'Back', x: length + width, width: length },
        { id: 'side-b', name: 'Side', x: 2 * length + width, width },
    ];
    const panels: Panel[] = faces.map((face, index) => ({
        id: `${part}-${face.id}`,
        name: `${name} ${face.name}`,
        polygon: rect(face.x, 0, face.width, height),
        ...(index ? { parentId: `${part}-${faces[index - 1].id}`, hinge: { a: pt(face.x, 0), b: pt(face.x, height) } } : {}),
        foldAngle: index ? 90 : 0,
        side: 'outside',
        part,
    }));
    const x = 2 * length + 2 * width;
    panels.push({
        id: `${part}-glue`,
        name: `${name} Glue Flap`,
        polygon: rect(x, 0, glueWidth, height),
        parentId: `${part}-side-b`,
        hinge: { a: pt(x, 0), b: pt(x, height) },
        foldAngle: 180,
        side: 'inside',
        part,
    });
    return panels;
}

/** Sleeve wrap laid out as a closed four-wall band, with a glue seam and end turn-ins. */
function drawerSleevePanels(length: number, width: number, height: number, turnIn: number, board: number): Panel[] {
    const glue = Math.max(10, board * 4);
    const faces: { id: string; name: string; y: number; height: number; parent?: string; hingeY?: number }[] = [
        { id: 'bottom', name: 'Bottom', y: 0, height: width },
        { id: 'side-a', name: 'Side', y: -height, height, parent: 'sleeve-bottom', hingeY: 0 },
        { id: 'top', name: 'Top', y: -height - width, height: width, parent: 'sleeve-side-a', hingeY: -height },
        { id: 'side-b', name: 'Side', y: -2 * height - width, height, parent: 'sleeve-top', hingeY: -height - width },
        { id: 'glue', name: 'Glue Flap', y: -2 * height - width - glue, height: glue, parent: 'sleeve-side-b', hingeY: -2 * height - width },
    ];
    const panels: Panel[] = faces.map((face) => ({
        id: `sleeve-${face.id}`,
        name: `Sleeve ${face.name}`,
        polygon: rect(0, face.y, length, face.height),
        ...(face.parent && face.hingeY !== undefined ? { parentId: face.parent, hinge: { a: pt(0, face.hingeY), b: pt(length, face.hingeY) } } : {}),
        foldAngle: face.parent ? (face.id === 'glue' ? 180 : 90) : 0,
        side: face.id === 'glue' ? 'inside' : 'outside',
        part: 'sleeve',
    }));

    // Turn-ins at both open ends wrap the board edges. These are distinct from the
    // four structural walls and are trimmed for mitred corners during conversion.
    const ti = turnIn + board;
    for (const face of faces.slice(0, 4)) {
        const y0 = face.y;
        const y1 = face.y + face.height;
        for (const [end, x, outward] of [
            ['left', 0, -1],
            ['right', length, 1],
        ] as const) {
            const free = x + outward * ti;
            panels.push({
                id: `sleeve-turnin-${face.id}-${end}`,
                name: `Sleeve Turn-in ${face.name} ${end}`,
                polygon: [pt(x, y0), pt(free, y0 + Math.min(ti, face.height / 2)), pt(free, y1 - Math.min(ti, face.height / 2)), pt(x, y1)],
                parentId: `sleeve-${face.id}`,
                hinge: { a: pt(x, y0), b: pt(x, y1) },
                foldAngle: 180,
                side: 'inside',
                part: 'sleeve',
            });
        }
    }
    return panels;
}

function piecesFor(part: ChipboardPiece['part'], dims: [string, number, number, number][]): ChipboardPiece[] {
    return dims.map(([name, width, height, quantity]) => ({
        part,
        name,
        width: Math.round(width * 10) / 10,
        height: Math.round(height * 10) / 10,
        quantity,
    }));
}

function packParts(groups: Panel[][], gap = 25): Panel[] {
    const output: Panel[] = [];
    let x = 0;
    for (const group of groups) {
        if (!group.length) continue;
        const box = bounds(group.map((panel) => panel.polygon));
        const dx = x - box.minX;
        const dy = -box.minY;
        output.push(
            ...group.map((panel) => ({
                ...panel,
                polygon: translate(panel.polygon, dx, dy),
                hinge: panel.hinge
                    ? { a: pt(panel.hinge.a.x + dx, panel.hinge.a.y + dy), b: pt(panel.hinge.b.x + dx, panel.hinge.b.y + dy) }
                    : undefined,
            })),
        );
        x += box.width + gap;
    }
    return output;
}

export function generateRigidDrawer(params: BoxParams): DielineResult {
    const s = rigidSizes(params);
    const board = s.board;
    const turnIn = s.turnIn;
    const drawerHeight = Math.max(5, s.base.height - board);
    const sleeveHeight = drawerHeight + board + 1.5;
    const sleeveWidth = s.base.width + 1.5;
    const drawer = wrapPanels('drawer', s.base.length, s.base.width, drawerHeight, turnIn, board);
    const liner = linerPanels(s.liner.length, s.liner.width, s.liner.wall);
    const sleeve = drawerSleevePanels(s.base.length + 1.5, sleeveWidth, sleeveHeight, turnIn, board);
    const panels = packParts([drawer, liner, sleeve]);
    const chipboard = [
        ...piecesFor('drawer', [
            ['Drawer bottom', s.base.length, s.base.width, 1],
            ['Drawer long wall', s.base.length, drawerHeight, 2],
            ['Drawer short wall', s.base.width - 2 * board, drawerHeight, 2],
        ]),
        ...piecesFor('sleeve', [
            ['Sleeve top/bottom', s.base.length + 1.5, sleeveWidth, 2],
            ['Sleeve side wall', s.base.length + 1.5, sleeveHeight - board, 2],
        ]),
    ];
    return { ...buildDielineResult(panels, { parts: ['drawer', 'liner', 'sleeve'] }), chipboard };
}

export function generateRigidShoulder(params: BoxParams): DielineResult {
    const s = rigidSizes(params);
    const board = s.board;
    const shoulderHeight = params.rigid?.shoulderHeight === undefined ? Math.max(12, board * 4) : toMm(params.rigid.shoulderHeight, params.unit);
    const base = wrapPanels('base', s.base.length, s.base.width, s.base.height - board, s.turnIn, board);
    const liner = linerPanels(s.liner.length, s.liner.width, s.liner.wall);
    const neck = perimeterBand(
        'sleeve',
        s.base.length - 2 * board,
        s.base.width - 2 * board,
        shoulderHeight,
        Math.max(10, board * 4),
        'Shoulder Neck',
    );
    const lid = wrapPanels('lid', s.lid.length, s.lid.width, Math.min(s.lid.height, shoulderHeight + board), s.turnIn, board);
    const panels = packParts([base, liner, neck, lid]);
    const chipboard = [
        ...piecesFor('base', [
            ['Base bottom', s.base.length, s.base.width, 1],
            ['Base long wall', s.base.length, s.base.height - board, 2],
            ['Base short wall', s.base.width - 2 * board, s.base.height - board, 2],
        ]),
        ...piecesFor('sleeve', [
            ['Neck long wall', s.base.length - 2 * board, shoulderHeight, 2],
            ['Neck short wall', s.base.width - 2 * board, shoulderHeight, 2],
        ]),
        ...piecesFor('lid', [
            ['Lid top', s.lid.length, s.lid.width, 1],
            ['Lid long wall', s.lid.length, Math.max(board, s.lid.height - board), 2],
            ['Lid short wall', s.lid.width - 2 * board, Math.max(board, s.lid.height - board), 2],
        ]),
    ];
    return { ...buildDielineResult(panels, { parts: ['base', 'liner', 'sleeve', 'lid'] }), chipboard };
}

function bookCoverPanels(length: number, width: number, spine: number, turnIn: number): Panel[] {
    const backX = 0;
    const spineX = length;
    const frontX = spineX + spine;
    const y = 0;
    const faces: { id: string; name: string; x: number; w: number; parent?: string; hingeX?: number; angle: number }[] = [
        { id: 'back', name: 'Book Back Cover', x: backX, w: length, angle: 0 },
        { id: 'spine', name: 'Book Spine', x: spineX, w: spine, parent: 'lid-back', hingeX: spineX, angle: 90 },
        { id: 'front', name: 'Book Front Cover', x: frontX, w: length, parent: 'lid-spine', hingeX: frontX, angle: 90 },
    ];
    const panels: Panel[] = faces.map((face) => ({
        id: `lid-${face.id}`,
        name: face.name,
        polygon: rect(face.x, y, face.w, width),
        ...(face.parent && face.hingeX !== undefined
            ? { parentId: face.parent, hinge: { a: pt(face.hingeX, y), b: pt(face.hingeX, y + width) } }
            : {}),
        foldAngle: face.angle,
        side: 'outside',
        part: 'lid',
    }));
    // Continuous cover wrap with crease hinges at the spine; only the outside perimeter is cut.
    const edges: [string, pt: ReturnType<typeof pt>, end: ReturnType<typeof pt>, out: ReturnType<typeof pt>][] = [
        ['back-left', pt(backX, y), pt(backX, y + width), pt(-1, 0)],
        ['back-top', pt(backX, y), pt(backX + length, y), pt(0, -1)],
        ['back-bottom', pt(backX, y + width), pt(backX + length, y + width), pt(0, 1)],
        ['front-right', pt(frontX + length, y), pt(frontX + length, y + width), pt(1, 0)],
        ['front-top', pt(frontX, y), pt(frontX + length, y), pt(0, -1)],
        ['front-bottom', pt(frontX, y + width), pt(frontX + length, y + width), pt(0, 1)],
        // The spine's paper also has to turn in at both ends, or the spine board's edges stay bare.
        ['spine-top', pt(spineX, y), pt(frontX, y), pt(0, -1)],
        ['spine-bottom', pt(spineX, y + width), pt(frontX, y + width), pt(0, 1)],
    ];
    for (const [id, a, b, out] of edges) {
        const dx = out.x * turnIn;
        const dy = out.y * turnIn;
        const edgeLength = Math.hypot(b.x - a.x, b.y - a.y);
        const taper = Math.min(turnIn, Math.max(0, edgeLength / 2 - 0.5));
        const ux = (b.x - a.x) / edgeLength;
        const uy = (b.y - a.y) / edgeLength;
        const parentId = id.startsWith('back') ? 'lid-back' : id.startsWith('spine') ? 'lid-spine' : 'lid-front';
        panels.push({
            id: `lid-turnin-${id}`,
            name: `Cover Turn-in ${id.replace('-', ' ')}`,
            polygon: [
                a,
                pt(a.x + dx, a.y + dy),
                pt(a.x + dx + ux * taper, a.y + dy + uy * taper),
                pt(b.x + dx - ux * taper, b.y + dy - uy * taper),
                pt(b.x + dx, b.y + dy),
                b,
            ],
            parentId,
            hinge: { a, b },
            foldAngle: 180,
            side: 'inside',
            part: 'lid',
        });
    }
    return panels;
}

export function generateRigidBook(params: BoxParams): DielineResult {
    const s = rigidSizes(params);
    const board = s.board;
    const base = wrapPanels('base', s.base.length, s.base.width, s.base.height - board, s.turnIn, board);
    const liner = linerPanels(s.liner.length, s.liner.width, s.liner.wall);
    const cover = bookCoverPanels(s.lid.length, s.lid.width, s.base.height, s.turnIn);
    const panels = packParts([base, liner, cover]);
    const chipboard = [
        ...piecesFor('base', [
            ['Book tray bottom', s.base.length, s.base.width, 1],
            ['Book tray long wall', s.base.length, s.base.height - board, 2],
            ['Book tray short wall', s.base.width - 2 * board, s.base.height - board, 2],
        ]),
        ...piecesFor('lid', [
            ['Book back board', s.lid.length, s.lid.width, 1],
            ['Book spine board', s.base.height, s.lid.width, 1],
            ['Book front board', s.lid.length, s.lid.width, 1],
        ]),
    ];
    return { ...buildDielineResult(panels, { parts: ['base', 'liner', 'lid'] }), chipboard };
}
