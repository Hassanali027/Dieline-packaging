import { describe, expect, it } from 'vitest';
import type { BoxParams } from '../../types/design';
import { extractPart, generateDieline } from '../dieline';
import { coincidentPanels, layerFade, panelLayers } from './layers';

const STYLES: BoxParams[] = [
    { style: 'mailer', length: 220, width: 160, depth: 70, thickness: 1.5, unit: 'mm', construction: 'corrugated' },
    { style: 'reverse-tuck', length: 100, width: 60, depth: 140, thickness: 0.4, unit: 'mm', construction: 'folding' },
    { style: 'straight-tuck', length: 100, width: 60, depth: 140, thickness: 0.4, unit: 'mm', construction: 'folding' },
    { style: 'burger', length: 115, width: 115, depth: 85, thickness: 0.4, unit: 'mm', construction: 'folding' },
    { style: 'tray', length: 180, width: 120, depth: 45, thickness: 0.5, unit: 'mm', construction: 'folding' },
    { style: 'sleeve', length: 150, width: 100, depth: 40, thickness: 0.35, unit: 'mm', construction: 'folding' },
    {
        style: 'rigid-lid-base',
        length: 200,
        width: 150,
        depth: 60,
        thickness: 2,
        unit: 'mm',
        construction: 'rigid',
        rigid: { boardThickness: 2, turnIn: 15 },
    },
    {
        style: 'rigid-magnetic',
        length: 220,
        width: 160,
        depth: 70,
        thickness: 2,
        unit: 'mm',
        construction: 'rigid',
        rigid: { boardThickness: 2, turnIn: 18 },
    },
];

/** Every printed sheet of a style (rigid boxes fold each part on its own). */
function sheets(params: BoxParams) {
    const result = generateDieline(params);
    return result.parts?.length ? result.parts.map((p) => extractPart(result, p).panels) : [result.panels];
}

describe('3D panel layers (no z-fighting when closed)', () => {
    it.each(STYLES.map((p) => [p.style, p] as const))('%s: closed flaps no longer share a plane with a wall', (_style, params) => {
        for (const panels of sheets(params)) {
            const layers = panelLayers(panels);
            const offsets = new Map([...layers].map(([id, layer]) => [id, layer * params.thickness]));
            expect(coincidentPanels(panels, 1, offsets)).toEqual([]);
        }
    });

    it('keeps the wall outside and moves the smaller flaps in (mailer)', () => {
        const [panels] = sheets(STYLES[0]);
        expect(coincidentPanels(panels, 1).length).toBeGreaterThan(0);
        const layers = panelLayers(panels);
        expect(layers.get('front')).toBe(0);
        expect(layers.get('lid-front')).toBe(1);
        expect(layers.get('side-left')).toBe(0);
        expect(layers.get('ear-left')).toBeGreaterThan(0);
        expect(layers.get('lid-dust-left')).toBeGreaterThan(0);
        // Panels that overlap nothing get no layer at all.
        expect(layers.has('base')).toBe(false);
    });

    it('fades the layers in only as the box closes', () => {
        expect(layerFade(0)).toBe(0);
        expect(layerFade(0.85)).toBe(0);
        expect(layerFade(1)).toBe(1);
    });
});
