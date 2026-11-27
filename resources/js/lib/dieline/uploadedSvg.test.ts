import { describe, expect, it } from 'vitest';
import { parseUploadedSvg } from './uploadedSvg';

describe('parseUploadedSvg', () => {
    it('scales physical SVG dimensions to millimetres and preserves cut and crease tags', () => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><polygon id="panel" points="0,0 100,0 100,50 0,50"/><line id="cut-line" x1="0" y1="0" x2="100" y2="0" stroke="#ff0000"/><line id="crease-line" x1="10" y1="10" x2="90" y2="10" stroke-dasharray="4 2"/></svg>`;
        const result = parseUploadedSvg(svg);
        expect(result.width).toBe(100);
        expect(result.height).toBe(50);
        expect(result.panels).toHaveLength(1);
        expect(result.lines.map((line) => line.kind)).toEqual(['cut', 'crease']);
    });

    it('rejects entities and reports pixel scale ambiguity', () => {
        expect(() => parseUploadedSvg('<!DOCTYPE svg [<!ENTITY x "x">]><svg/>')).toThrow();
        const result = parseUploadedSvg('<svg width="960px" height="480px" viewBox="0 0 960 480"><rect x="1" y="1" width="20" height="10"/></svg>');
        expect(result.warnings.join(' ')).toContain('confirm the physical scale');
        expect(result.panels[0].polygon[2].x).toBeCloseTo((20 * 25.4) / 96);
    });

    it('splits a closed outline at a crease and links the panels for folding', () => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><polygon points="0,0 100,0 100,50 0,50"/><line id="fold" x1="0" y1="25" x2="100" y2="25" stroke-dasharray="4 2"/></svg>`;
        const result = parseUploadedSvg(svg);
        expect(result.panels).toHaveLength(2);
        expect(result.panels.filter((panel) => panel.parentId)).toHaveLength(1);
        expect(result.panels.find((panel) => panel.parentId)?.hinge).toBeDefined();
    });

    it('finds panels from a connected cut-line outline when the SVG has no polygon elements', () => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><line id="cut-top" x1="0" y1="0" x2="100" y2="0" stroke="#ec008c"/><line id="cut-right" x1="100" y1="0" x2="100" y2="50" stroke="#ec008c"/><line id="cut-bottom" x1="100" y1="50" x2="0" y2="50" stroke="#ec008c"/><line id="cut-left" x1="0" y1="50" x2="0" y2="0" stroke="#ec008c"/><line id="crease" x1="0" y1="25" x2="100" y2="25" stroke="#00a0e9"/></svg>`;
        const result = parseUploadedSvg(svg);
        expect(result.panels).toHaveLength(2);
        expect(result.panels.filter((panel) => panel.parentId)).toHaveLength(1);
        expect(result.warnings).toEqual([]);
    });
});
