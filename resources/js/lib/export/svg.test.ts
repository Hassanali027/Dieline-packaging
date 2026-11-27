import { describe, expect, it } from 'vitest';
import type { BoxParams } from '../../types/design';
import { generateDieline } from '../dieline';
import { dielineFileName, dielineToSvg, formatLength } from './svg';

const params: BoxParams = { style: 'mailer', length: 220, width: 160, depth: 70, thickness: 1.5, unit: 'mm', construction: 'corrugated' };
const result = generateDieline(params);

describe('dieline SVG export', () => {
    const svg = dielineToSvg(result, { params });

    it('is a true-size SVG in millimetres', () => {
        const w = result.overallSize.width + 36;
        const h = result.overallSize.height + 36;
        expect(svg.startsWith('<?xml')).toBe(true);
        expect(svg).toContain(`width="${w}mm"`);
        expect(svg).toContain(`height="${h}mm"`);
        expect(svg).toContain(`viewBox="-18 -18 ${w} ${h}"`);
    });

    it('puts each line type on its own named layer, cut line on top', () => {
        const order = ['Bleed', 'Safe', 'Crease', 'CutContour', 'Dimensions'].map((id) => svg.indexOf(`<g id="${id}" inkscape:groupmode="layer"`));
        order.forEach((i) => expect(i).toBeGreaterThan(0));
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        expect(svg).toContain(`d="${result.cutPath}"`);
        expect((svg.match(/stroke="#00a0e9"/g) ?? []).length).toBe(result.creasePaths.length);
    });

    it('labels the sheet and the box size', () => {
        expect(svg).toContain('497 mm (sheet)');
        expect(svg).toContain('Inside L 220 × W 160 × D 70 mm · board 1.5 mm');
    });

    it('can label in inches and hide layers', () => {
        const inch = dielineToSvg(result, { params, unit: 'in', layers: { safe: false, dimensions: false } });
        expect(inch).not.toContain('id="Safe"');
        expect(inch).not.toContain('id="Dimensions"');
        expect(inch).toContain('id="CutContour"');
        expect(formatLength(254, 'in')).toBe('10 in');
        expect(dielineToSvg(result, { params, unit: 'in' })).toContain('19.57 in (sheet)');
    });

    it('escapes text and keeps tags balanced', () => {
        const titled = dielineToSvg(result, { title: 'A & B <test>' });
        expect(titled).toContain('<title>A &amp; B &lt;test&gt;</title>');
        expect((titled.match(/<g[ >]/g) ?? []).length).toBe((titled.match(/<\/g>/g) ?? []).length);
    });

    it('names the file after the box', () => {
        expect(dielineFileName(params)).toBe('mailer-220x160x70mm.svg');
        expect(dielineFileName({ ...params, length: 8.5, unit: 'in' })).toBe('mailer-8_5x160x70in.svg');
        expect(dielineFileName(null)).toBe('dieline.svg');
    });
});
