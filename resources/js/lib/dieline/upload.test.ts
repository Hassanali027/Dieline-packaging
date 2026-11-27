// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseSvgDieline } from './upload';

describe('parseSvgDieline', () => {
    it('keeps the real shape of relative paths and moves the drawing to (0, 0)', () => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">
            <path d="M10,10 h200 v100 h-200 z" stroke="#000" fill="none"/>
            <path d="M10 60 l200 0" stroke="#000" stroke-dasharray="4 2"/>
        </svg>`;
        const parsed = parseSvgDieline(svg, 'box.svg');

        expect(parsed.lines.map((l) => l.tag)).toEqual(['cut', 'fold']);
        expect(parsed.lines[0].path).toBe('M0.00,0.00 L200.00,0.00 L200.00,100.00 L0.00,100.00 Z');
        expect(parsed.lines[1].path).toBe('M0.00,50.00 L200.00,50.00');
        expect(parsed.panels[0].polygon).toEqual([
            { x: 0, y: 0 },
            { x: 200, y: 0 },
            { x: 200, y: 100 },
            { x: 0, y: 100 },
        ]);
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
});
