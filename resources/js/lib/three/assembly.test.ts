import { Box3, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { BoxParams, DielineResult } from '../../types/design';
import { generateDieline, rigidSizes } from '../dieline';
import { rect } from '../dieline/geometry';
import { buildDielineResult } from '../dieline/result';
import { BOOK_OPEN_DEG, buildAssembly, LID_LIFT_EXTRA, MAGNETIC_OPEN_DEG, type AssemblyPiece } from './assembly';
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

    it('slides the rigid drawer out of the sleeve along +Z when opened', () => {
        const mockDrawerResult: DielineResult = buildDielineResult(
            [
                { id: 'sleeve-floor', name: 'Sleeve', polygon: rect(0, 0, 200, 150), foldAngle: 0, side: 'outside', part: 'sleeve' },
                { id: 'drawer-floor', name: 'Drawer', polygon: rect(230, 0, 190, 145), foldAngle: 0, side: 'outside', part: 'drawer' },
            ],
            { parts: ['sleeve', 'drawer'] },
        );
        const closed = buildAssembly('rigid-drawer', mockDrawerResult, 1, 2);
        const open = buildAssembly('rigid-drawer', mockDrawerResult, 0, 2);

        expect(closed.map((p) => p.key)).toEqual(['sleeve', 'drawer']);
        expect(open[0].position[2]).toBeCloseTo(closed[0].position[2], 3);
        expect(open[1].position[2]).toBeGreaterThan(closed[1].position[2] + 50);
    });

    it('animates hinged lids for rigid-book and rigid-magnetic styles', () => {
        const result = generateDieline(rigid);
        const bookOpen = buildAssembly('rigid-book', result, 0, 2);
        const bookClosed = buildAssembly('rigid-book', result, 1, 2);
        expect(bookClosed.find((p) => p.key === 'lid')?.hingeRotation?.angle).toBeCloseTo(0, 5);
        expect(bookOpen.find((p) => p.key === 'lid')?.hingeRotation?.angle).toBeCloseTo((BOOK_OPEN_DEG * Math.PI) / 180, 4);

        const magOpen = buildAssembly('rigid-magnetic', result, 0, 2);
        expect(Math.abs(magOpen.find((p) => p.key === 'lid')?.hingeRotation?.angle ?? 0)).toBeCloseTo((MAGNETIC_OPEN_DEG * Math.PI) / 180, 4);
    });
});
