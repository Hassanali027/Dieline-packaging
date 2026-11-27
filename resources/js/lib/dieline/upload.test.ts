// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseSvgDieline, scaleUploadedDieline } from './upload';

describe('parseSvgDieline', () => {
    it('keeps the real shape of relative paths and splits the outline at the fold', () => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">
            <path d="M10,10 h200 v100 h-200 z" stroke="#000" fill="none"/>
            <path d="M10 60 l200 0" stroke="#000" stroke-dasharray="4 2"/>
        </svg>`;
        const parsed = parseSvgDieline(svg, 'box.svg');

        expect(parsed.lines.map((l) => l.tag)).toEqual(['cut', 'fold']);
        expect(parsed.lines[0].path).toBe('M0.00,0.00 L200.00,0.00 L200.00,100.00 L0.00,100.00 Z');
        expect(parsed.lines[1].path).toBe('M0.00,50.00 L200.00,50.00');
        // Two panels, hinged on the fold line.
        expect(parsed.panels).toHaveLength(2);
        const child = parsed.panels.find((p) => p.parentId)!;
        expect(child.hinge).toBeDefined();
        expect([child.hinge!.a.y, child.hinge!.b.y]).toEqual([50, 50]);
        expect(parsed.foldMapped).toBe(true);
        // No width / height on the file: read as mm, flagged for the customer to confirm.
        expect(parsed.unit).toBe('assumed mm');
        expect(parsed.scaleConfirmed).toBe(false);
    });

    it('applies group and element transforms and skips clip paths', () => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg">
            <defs><clipPath id="c"><rect x="-500" y="-500" width="2000" height="2000"/></clipPath></defs>
            <g transform="translate(100 50)">
                <rect x="0" y="0" width="40" height="20" transform="scale(2)"/>
                <line x1="0" y1="20" x2="80" y2="20" stroke-dasharray="3"/>
            </g>
        </svg>`;
        const parsed = parseSvgDieline(svg, 'grouped.svg');

        expect(parsed.lines).toHaveLength(2);
        expect(parsed.lines[0].path).toBe('M0.00,0.00 L80.00,0.00 L80.00,40.00 L0.00,40.00 Z');
        expect(parsed.lines[1]).toMatchObject({ tag: 'fold', path: 'M0.00,20.00 L80.00,20.00' });
    });

    it('converts the file unit to millimetres', () => {
        const cm = parseSvgDieline(
            '<svg xmlns="http://www.w3.org/2000/svg" width="20cm" height="10cm" viewBox="0 0 200 100"><rect width="200" height="100"/></svg>',
            'cm.svg',
        );
        expect([cm.widthMm, cm.heightMm, cm.unit]).toEqual([200, 100, 'cm']);
        expect(cm.warnings).toEqual([]);
        expect(cm.scaleConfirmed).toBe(true);

        const px = parseSvgDieline(
            '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="480"><rect width="960" height="480"/></svg>',
            'px.svg',
        );
        expect(px.widthMm).toBeCloseTo(254, 6);
        expect(px.unit).toBe('px');
        expect(px.warnings.join(' ')).toContain('pixels');
    });

    it('finds panels from separate cut lines and a crease that crosses every wall', () => {
        // A 3-panel strip: outline drawn as four cut lines, one long crease across two panels' joint.
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120mm" height="60mm" viewBox="0 0 120 60">
            <line x1="0" y1="0" x2="120" y2="0" stroke="#ec008c"/>
            <line x1="120" y1="0" x2="120" y2="60" stroke="#ec008c"/>
            <line x1="120" y1="60" x2="0" y2="60" stroke="#ec008c"/>
            <line x1="0" y1="60" x2="0" y2="0" stroke="#ec008c"/>
            <line x1="40" y1="0" x2="40" y2="60" stroke-dasharray="3 2"/>
            <line x1="80" y1="0" x2="80" y2="60" stroke-dasharray="3 2"/>
            <line x1="0" y1="30" x2="120" y2="30" stroke-dasharray="3 2"/>
        </svg>`;
        const parsed = parseSvgDieline(svg, 'grid.svg');
        // Two vertical creases make 3 panels; the long horizontal crease splits all three: 6 panels.
        expect(parsed.panels).toHaveLength(6);
        // One root, every other panel hinged to a neighbour.
        expect(parsed.panels.filter((p) => !p.parentId)).toHaveLength(1);
        expect(parsed.panels.filter((p) => p.parentId && p.hinge)).toHaveLength(5);
    });

    it('scales an upload to the real size the customer confirms', () => {
        const parsed = parseSvgDieline(
            '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H100V50H0Z"/><path d="M0 25H100" stroke-dasharray="2"/></svg>',
            'scale.svg',
        );
        const scaled = scaleUploadedDieline(parsed, 2);
        expect([scaled.widthMm, scaled.heightMm]).toEqual([200, 100]);
        expect(scaled.lines![1].path).toBe('M0.00,50.00 L200.00,50.00');
        expect(Math.max(...scaled.panels.flatMap((p) => p.polygon.map((q) => q.x)))).toBe(200);
        expect(scaled.panels.find((p) => p.hinge)!.hinge!.a.y).toBe(50);
    });
});
