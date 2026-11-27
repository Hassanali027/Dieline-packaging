import { Box3, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { BoxParams } from '../../types/design';
import { generateDieline, rigidSizes } from '../dieline';
import { buildAssembly, LID_LIFT_EXTRA, type AssemblyPiece } from './assembly';
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

    it('keeps the rigid drawer sleeve still and slides the tray when opened', () => {
        const params: BoxParams = { ...rigid, style: 'rigid-drawer' };
        const result = generateDieline(params);
        const closed = buildAssembly('rigid-drawer', result, 1, 2);
        const opened = buildAssembly('rigid-drawer', result, 0, 2);
        expect(closed.map((piece) => piece.key)).toEqual(['sleeve', 'drawer']);
        expect(opened[0].position).toEqual(closed[0].position);
        expect(opened[1].position[0]).toBeGreaterThan(closed[1].position[0]);
        expect(opened[1].fold).toBe(1);
        const sleeveBounds = worldBounds(closed[0]);
        const trayBounds = worldBounds(closed[1]);
        expect(trayBounds.min.y).toBeGreaterThan(sleeveBounds.min.y);
        expect(trayBounds.max.y).toBeLessThan(sleeveBounds.max.y);
        expect(trayBounds.min.x).toBeGreaterThan(sleeveBounds.min.x);
        expect(trayBounds.max.x).toBeLessThan(sleeveBounds.max.x);
    });

    it('assembles the shoulder neck between the base and lid', () => {
        const params: BoxParams = { ...rigid, style: 'rigid-shoulder', rigid: { ...rigid.rigid!, shoulderHeight: 18 } };
        const result = generateDieline(params);
        const pieces = buildAssembly('rigid-shoulder', result, 1, 2);
        expect(pieces.map((piece) => piece.key)).toEqual(['base', 'liner', 'sleeve', 'lid']);
        const baseBox = worldBounds(pieces[0]);
        const neckBox = worldBounds(pieces[2]);
        const lidBox = worldBounds(pieces[3]);
        expect(neckBox.min.y).toBeCloseTo(baseBox.max.y, 1);
        expect(neckBox.max.y).toBeGreaterThan(baseBox.max.y);
        expect(lidBox.max.y).toBeCloseTo(neckBox.max.y, 1);
        expect(lidBox.min.x).toBeLessThan(neckBox.min.x);
        expect(lidBox.max.x).toBeGreaterThan(neckBox.max.x);
        expect(worldBounds(buildAssembly('rigid-shoulder', result, 0, 2)[3]).max.y).toBeGreaterThan(worldBounds(pieces[3]).max.y);
    });

    it('keeps the book tray fixed while the spine-connected cover opens', () => {
        const params: BoxParams = { ...rigid, style: 'rigid-book' };
        const result = generateDieline(params);
        const closed = buildAssembly('rigid-book', result, 1, 2);
        const open = buildAssembly('rigid-book', result, 0, 2);
        expect(closed.map((piece) => piece.key)).toEqual(['base', 'liner', 'lid']);
        expect(open[0].position).toEqual(closed[0].position);
        expect(open[2].fold).toBe(0);
        expect(closed[2].fold).toBe(1);
        expect(worldBounds(open[2]).max.z).not.toBeCloseTo(worldBounds(closed[2]).max.z, 1);
        const openCover = foldedBounds(open[2].result.panels, 0);
        const closedCover = foldedBounds(closed[2].result.panels, 1);
        expect(closedCover.getSize(new Vector3()).x).toBeLessThan(openCover.getSize(new Vector3()).x);
        expect(closedCover.getSize(new Vector3()).y).toBeGreaterThan(openCover.getSize(new Vector3()).y);
    });
});
