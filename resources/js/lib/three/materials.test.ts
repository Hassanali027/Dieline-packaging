import { describe, expect, it } from 'vitest';
import { MATERIAL_OPTIONS, materialColor, resolveFinishProps } from './materials';

describe('3D materials and finishes', () => {
    it('exposes folding and rigid wrap-paper material options', () => {
        const values = MATERIAL_OPTIONS.map((o) => o.value);
        expect(values).toEqual(expect.arrayContaining(['white', 'kraft', 'transparent', 'wrap-paper', 'linen', 'leatherette']));
        expect(materialColor('linen', 'outside')).toMatch(/^#/);
        expect(materialColor('leatherette', 'inside')).toMatch(/^#/);
        expect(materialColor('#ff8800', 'outside')).toBe('#ff8800');
    });

    it('resolves lamination, foil, and spot UV surface properties', () => {
        const soft = resolveFinishProps('wrap-paper', { lamination: 'soft-touch', foil: 'none', spotUv: false });
        expect(soft.roughness).toBeGreaterThan(0.9);
        expect(soft.metalness).toBe(0);

        const goldSpot = resolveFinishProps('white', { lamination: 'matte', foil: 'gold', spotUv: true });
        expect(goldSpot.metalness).toBeGreaterThan(0.8);
        expect(goldSpot.foilTint).toBe('#d4af37');
        expect(goldSpot.clearcoat).toBeGreaterThan(0.8);

        const linen = resolveFinishProps('linen');
        expect(linen.bumpScale).toBeGreaterThan(0.2);
    });
});
