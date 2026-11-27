import { Box3, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { BoxParams } from '../../types/design';
import { generateDieline, rigidSizes } from '../dieline';
import { buildAssembly, LID_LIFT_EXTRA, MAGNETIC_OPEN_DEG, type AssemblyPiece } from './assembly';
import { foldedBounds } from './foldTree';

function worldBounds(piece: AssemblyPiece): Box3 {
    const local = foldedBounds(piece.result.panels, piece.fold, piece.orientation);
    return local.applyMatrix4(new Matrix4().makeTranslation(new Vector3(...piece.position)));
}

const rigid: BoxParams = {
    style: 'rigid-lid-base',
    length: 200,
    width: 150,
    depth: 60,
    thickness: 2,
    unit: 'mm',
    construction: 'rigid',
    rigid: { boardThickness: 2, turnIn: 18, lidDepth: 30, lidClearance: 1.5 },
};

describe('3D assembly', () => {
    it('folding boxes are one centred piece standing on the ground', () => {
        const result = generateDieline({
            style: 'mailer',
            length: 220,
            width: 160,
            depth: 70,
            thickness: 1.5,
            unit: 'mm',
            construction: 'corrugated',
        });
        const [piece, ...rest] = buildAssembly('mailer', result, 1, 1.5);
        expect(rest).toHaveLength(0);
        const b = worldBounds(piece);
        expect(b.min.y).toBeCloseTo(1.5, 3);
        expect((b.min.x + b.max.x) / 2).toBeCloseTo(0, 3);
        expect((b.min.z + b.max.z) / 2).toBeCloseTo(0, 3);
    });

    it('closes the rigid lid over the base and lifts it when opened', () => {
        const result = generateDieline(rigid);
        const s = rigidSizes(rigid);
        const closed = buildAssembly('rigid-lid-base', result, 1, s.board);
        expect(closed.map((p) => p.key)).toEqual(['base', 'liner', 'lid']);

        const base = worldBounds(closed[0]);
        const liner = worldBounds(closed[1]);
        const lid = worldBounds(closed[2]);

        // Lid surrounds the base and its top sits on the base rim.
        expect(lid.min.x).toBeLessThan(base.min.x);
        expect(lid.max.z).toBeGreaterThan(base.max.z);
        expect(lid.max.y).toBeCloseTo(base.max.y, 3);
        expect(lid.max.y - lid.min.y).toBeCloseTo(s.lid.height, 3);
        // Liner inside the base.
        expect(liner.min.x).toBeGreaterThan(base.min.x);
        expect(liner.max.y).toBeLessThan(base.max.y);

        const open = buildAssembly('rigid-lid-base', result, 0, s.board);
        expect(worldBounds(open[2]).min.y - lid.min.y).toBeCloseTo(s.lid.height + LID_LIFT_EXTRA, 3);
    });

    it('slides the drawer and its liner out of the sleeve along the open ends (X)', () => {
        const result = generateDieline({ ...rigid, style: 'rigid-drawer' });
        const closed = buildAssembly('rigid-drawer', result, 1, 2);
        const open = buildAssembly('rigid-drawer', result, 0, 2);
        expect(closed.map((p) => p.key)).toEqual(['sleeve', 'drawer', 'liner']);
        // The sleeve stays put; drawer and liner move together, along X only.
        expect(open[0].position).toEqual(closed[0].position);
        expect(open[1].position[0] - closed[1].position[0]).toBeGreaterThan(100);
        expect(open[2].position[0] - closed[2].position[0]).toBeCloseTo(open[1].position[0] - closed[1].position[0], 6);
        expect(open[1].position[2]).toBeCloseTo(closed[1].position[2], 6);
        // Closed, the drawer is inside the sleeve (sides, floor and top).
        const sleeve = worldBounds(closed[0]);
        const drawer = worldBounds(closed[1]);
        expect(drawer.min.y).toBeGreaterThan(sleeve.min.y);
        expect(drawer.max.y).toBeLessThan(sleeve.max.y);
        expect(drawer.min.z).toBeGreaterThan(sleeve.min.z);
        expect(drawer.max.z).toBeLessThan(sleeve.max.z);
    });

    it('stands the shoulder neck on the base and closes the lid over it', () => {
        const result = generateDieline({ ...rigid, style: 'rigid-shoulder', rigid: { ...rigid.rigid!, shoulderHeight: 18 } });
        const pieces = buildAssembly('rigid-shoulder', result, 1, 2);
        expect(pieces.map((p) => p.key)).toEqual(['base', 'liner', 'sleeve', 'lid']);
        const base = worldBounds(pieces[0]);
        const neck = worldBounds(pieces[2]);
        const lid = worldBounds(pieces[3]);
        expect(neck.min.y).toBeCloseTo(base.max.y, 1);
        expect(neck.max.y - neck.min.y).toBeCloseTo(18, 1);
        // The neck fits inside the base walls; the lid covers it.
        expect(neck.min.x).toBeGreaterThan(base.min.x);
        expect(neck.max.x).toBeLessThan(base.max.x);
        // Bounds are board surfaces: the lid's inner top rests on the neck's top edge.
        expect(lid.max.y).toBeCloseTo(neck.max.y, 1);
        expect(lid.min.x).toBeLessThan(neck.min.x);
        // Opening lifts the lid.
        expect(worldBounds(buildAssembly('rigid-shoulder', result, 0, 2)[3]).min.y).toBeGreaterThan(lid.min.y + 18);
    });

    it('wraps the book cover under, beside and over the tray, and opens only the front cover', () => {
        const result = generateDieline({ ...rigid, style: 'rigid-book' });
        const closed = buildAssembly('rigid-book', result, 1, 2);
        const open = buildAssembly('rigid-book', result, 0, 2);
        expect(closed.map((p) => p.key)).toEqual(['base', 'liner', 'lid']);
        const tray = worldBounds(closed[0]);
        const cover = worldBounds(closed[2]);
        // Bounds are board surfaces: the back board (0..2 mm) lies on the ground, its inner face at
        // 2 mm; the tray's outer bottom stands on it (its floor board 2..4 mm).
        expect(cover.min.y).toBeCloseTo(2, 1);
        expect(tray.min.y).toBeCloseTo(4, 1);
        expect(cover.max.y).toBeGreaterThan(tray.max.y);
        expect(cover.max.y - tray.max.y).toBeLessThan(5);
        // The tray sits within the cover's footprint.
        expect(tray.min.x).toBeGreaterThan(cover.min.x - 0.01);
        expect(tray.max.x).toBeLessThan(cover.max.x + 0.01);
        // Open: the tray stays, the front cover swings up well above the box.
        expect(open[0].position).toEqual(closed[0].position);
        expect(worldBounds(open[2]).max.y).toBeGreaterThan(cover.max.y + 100);
        expect(open[2].result.panels.find((p) => p.id === 'lid-spine')?.foldAngle).toBe(90);
    });

    it('swings the magnetic lid open on its hinge', () => {
        const result = generateDieline(rigid);
        const magClosed = buildAssembly('rigid-magnetic', result, 1, 2);
        const magOpen = buildAssembly('rigid-magnetic', result, 0, 2);
        expect(magClosed.find((p) => p.key === 'lid')?.hingeRotation?.angle).toBeCloseTo(0, 5);
        expect(Math.abs(magOpen.find((p) => p.key === 'lid')?.hingeRotation?.angle ?? 0)).toBeCloseTo((MAGNETIC_OPEN_DEG * Math.PI) / 180, 4);
    });
});
