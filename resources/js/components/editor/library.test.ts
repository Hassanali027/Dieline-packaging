import { describe, expect, it } from 'vitest';
import type { LibraryIcon, LibraryPattern } from '../../lib/api';
import { generateDieline, signedArea } from '../../lib/dieline';
import type { Panel } from '../../types/design';
import { iconBaseSize, iconSrc, makeIcon, makePattern, patternTileSrc, sheetOutline, svgDataUri, tintSvg } from './library';
import { objectSize } from './objects';

const ICON: LibraryIcon = {
    id: 1,
    name: 'Leaf',
    category: 'Eco',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12"><path fill="none" stroke="#0f172a" d="M0 0h24"/><circle fill="#123456" style="stroke:#abcdef;opacity:.5" r="2"/></svg>',
    src: '',
};

const decode = (uri: string) => decodeURIComponent(uri.replace('data:image/svg+xml;charset=utf-8,', ''));

describe('library icons', () => {
    it('recolours fills and strokes but keeps "none"', () => {
        const out = tintSvg(ICON.svg, '#ff0000');
        expect(out).toContain('fill="none"');
        expect(out).toContain('stroke="#ff0000"');
        expect(out).toContain('fill="#ff0000"');
        expect(out).toContain('stroke:#ff0000');
        expect(out).toContain('opacity:.5');
        expect(out).not.toContain('#123456');
    });

    it('ignores colours that are not hex (no markup injection through the colour)', () => {
        expect(tintSvg(ICON.svg, '"/><script>')).toContain('stroke="#0f172a"');
    });

    it('gives the image an explicit size that keeps the viewBox aspect', () => {
        expect(iconBaseSize(ICON.svg)).toEqual({ width: 100, height: 50 });
        const svg = decode(svgDataUri('<svg viewBox="0 0 10 10" width="3"><g/></svg>', 100, 100));
        expect(svg).toBe('<svg viewBox="0 0 10 10" width="100" height="100"><g/></svg>');
    });

    it('makes an icon object 15–40 mm wide in its colour', () => {
        const icon = makeIcon(ICON, 'outside', { width: 400, height: 300 });
        expect(icon.type).toBe('icon');
        expect(objectSize(icon).width).toBeCloseTo(40, 5);
        expect(decode(iconSrc({ ...icon, props: { ...icon.props, fill: '#00ff00' } }))).toContain('stroke="#00ff00"');
    });
});

describe('library patterns', () => {
    const pattern: LibraryPattern = {
        id: 2,
        name: 'Dots',
        category: null,
        svg: '<svg viewBox="0 0 20 20"><circle fill="#000" r="2"/></svg>',
        src: '',
    };
    const panel: Panel = {
        id: 'front',
        name: 'Front',
        polygon: [
            { x: 10, y: 0 },
            { x: 60, y: 0 },
            { x: 60, y: 40 },
            { x: 10, y: 40 },
        ],
        foldAngle: 0,
        side: 'outside',
    };

    it('covers the whole sheet plus bleed when no panel is chosen', () => {
        const o = makePattern(pattern, 'outside', { width: 200, height: 100 });
        expect(o.panelId).toBeUndefined();
        expect(o.props.points).toEqual([
            { x: -3, y: -3 },
            { x: 203, y: -3 },
            { x: 203, y: 103 },
            { x: -3, y: 103 },
        ]);
        expect([o.props.left, o.props.top, o.props.width, o.props.height]).toEqual([100, 50, 206, 106]);
    });

    it('follows the panel outline, mirrored on the inside sheet', () => {
        const outside = makePattern(pattern, 'outside', { width: 200, height: 100 }, panel);
        const inside = makePattern(pattern, 'inside', { width: 200, height: 100 }, panel);
        expect(outside.panelId).toBe('front');
        expect(outside.props.left).toBe(35);
        // Inside is drawn mirrored across the sheet width: x → 200 - x.
        expect(inside.props.left).toBe(165);
    });

    it('recolours SVG tiles and uses image tiles as they are', () => {
        const svgTile = makePattern(pattern, 'outside', { width: 100, height: 100 });
        expect(decode(patternTileSrc({ ...svgTile, props: { ...svgTile.props, fill: '#336699' } }))).toContain('fill="#336699"');
        const imageTile = makePattern({ ...pattern, svg: null, src: '/storage/library/patterns/tile.png' }, 'outside', { width: 100, height: 100 });
        expect(patternTileSrc(imageTile)).toBe('/storage/library/patterns/tile.png');
    });
});

describe('sheet outline for whole-box patterns', () => {
    it('follows the dieline plus bleed instead of the sheet rectangle', () => {
        const result = generateDieline({
            style: 'mailer',
            length: 220,
            width: 160,
            depth: 70,
            thickness: 1.5,
            unit: 'mm',
            construction: 'corrugated',
        });
        const outline = sheetOutline(result, result.overallSize);
        const { width: W, height: H } = result.overallSize;
        expect(outline.length).toBeGreaterThan(4);
        for (const p of outline) {
            expect(p.x).toBeGreaterThanOrEqual(-3.01);
            expect(p.y).toBeGreaterThanOrEqual(-3.01);
            expect(p.x).toBeLessThanOrEqual(W + 3.01);
            expect(p.y).toBeLessThanOrEqual(H + 3.01);
        }
        // Smaller than the bounding rectangle: the waste around the dieline is left out.
        expect(Math.abs(signedArea(outline))).toBeLessThan((W + 6) * (H + 6) * 0.95);
    });

    it('falls back to the sheet rectangle plus bleed', () => {
        expect(sheetOutline(null, { width: 10, height: 20 })).toEqual([
            { x: -3, y: -3 },
            { x: 13, y: -3 },
            { x: 13, y: 23 },
            { x: -3, y: 23 },
        ]);
    });
});
