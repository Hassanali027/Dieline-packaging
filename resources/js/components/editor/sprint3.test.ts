import { parseDxfDieline } from '@/lib/dieline/upload';
import { useEditorStore } from '@/store/useEditorStore';
import type { CanvasObject } from '@/types/design';
import { describe, expect, it } from 'vitest';
import { imageDpi, LOW_PRINT_DPI, lowDpiImages, MIN_PRINT_DPI } from './objects';

describe('Sprint 3 editor helpers', () => {
    it('computes effective DPI using the lowest-resolution axis', () => {
        const img: CanvasObject = {
            id: 'img-1',
            type: 'image',
            side: 'outside',
            props: {
                src: '/storage/test.png',
                naturalWidth: 1200,
                naturalHeight: 1200,
                // 101.6 mm = 4 in -> 300 DPI horizontally; 203.2 mm = 8 in -> 150 DPI vertically.
                scaleX: 101.6 / 1200,
                scaleY: 203.2 / 1200,
            },
        };
        expect(imageDpi(img)).toBe(150);
        expect(lowDpiImages([img])).toHaveLength(1);

        const veryLow: CanvasObject = {
            ...img,
            id: 'img-2',
            props: { ...img.props, scaleX: 304.8 / 1200, scaleY: 304.8 / 1200 }, // 12 in -> 100 DPI
        };
        const dpi2 = imageDpi(veryLow);
        expect(dpi2).toBe(100);
        expect(dpi2!).toBeLessThan(LOW_PRINT_DPI);
        expect(dpi2!).toBeLessThan(MIN_PRINT_DPI);
    });

    it('parses DXF dielines and persists cut/fold line tags in store', () => {
        const dxf = [
            '0',
            'SECTION',
            '2',
            'ENTITIES',
            '0',
            'LINE',
            '8',
            'CUT',
            '10',
            '0',
            '20',
            '0',
            '11',
            '100',
            '21',
            '0',
            '0',
            'LINE',
            '8',
            'CREASE',
            '10',
            '50',
            '20',
            '0',
            '11',
            '50',
            '21',
            '80',
            '0',
            'ENDSEC',
            '0',
            'EOF',
        ].join('\n');

        const parsed = parseDxfDieline(dxf, 'custom.dxf');
        expect(parsed.lines).toHaveLength(2);
        expect(parsed.lines[0].tag).toBe('cut');
        expect(parsed.lines[1].tag).toBe('fold');
        expect(parsed.foldMapped).toBe(true);

        const store = useEditorStore.getState();
        store.setSource({ kind: 'uploaded-dieline', ...parsed });
        store.setUploadedLineTag(parsed.lines[0].id, 'fold');

        const updated = useEditorStore.getState().design.source;
        expect(updated.kind).toBe('uploaded-dieline');
        if (updated.kind === 'uploaded-dieline') {
            expect(updated.lines?.[0].tag).toBe('fold');
        }
    });

    it('toggles turn-in warning visibility', () => {
        const before = useEditorStore.getState().showTurnInWarning;
        useEditorStore.getState().toggleTurnInWarning();
        expect(useEditorStore.getState().showTurnInWarning).toBe(!before);
        useEditorStore.getState().toggleTurnInWarning();
        expect(useEditorStore.getState().showTurnInWarning).toBe(before);
    });
});
