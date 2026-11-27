import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { BoxParams } from '../../types/design';
import { extractPart, generateDieline } from '../dieline';
import { buildPrintPdf } from './pdf';

const mailer: BoxParams = { style: 'mailer', length: 220, width: 160, depth: 70, thickness: 1.5, unit: 'mm', construction: 'corrugated' };
const PT = 72 / 25.4;

const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

describe('print PDF', () => {
    it('makes a true-size page with trim and bleed boxes', async () => {
        const result = generateDieline(mailer);
        const bytes = await buildPrintPdf([{ name: 'Outside', result, artwork: null }], { title: 'Test box', params: mailer });
        expect(text(bytes.slice(0, 5))).toBe('%PDF-');

        const doc = await PDFDocument.load(bytes);
        expect(doc.getPageCount()).toBe(1);
        const page = doc.getPage(0);
        const { width: W, height: H } = result.overallSize;
        expect(page.getWidth()).toBeCloseTo((W + 30) * PT, 3);
        expect(page.getHeight()).toBeCloseTo((H + 30) * PT, 3);
        expect(page.getTrimBox()).toMatchObject({ x: 15 * PT, width: W * PT, height: H * PT });
        expect(page.getBleedBox().width).toBeCloseTo((W + 6) * PT, 3);
        expect(doc.getTitle()).toBe('Test box');
    });

    it('draws cut and crease lines in named spot colours on their own layers', async () => {
        const result = generateDieline(mailer);
        const raw = text(await buildPrintPdf([{ name: 'Outside', result, artwork: null }], { title: 'Spots' }));
        expect(raw).toContain('/Separation /CutContour /DeviceCMYK');
        expect(raw).toContain('/Separation /Crease /DeviceCMYK');
        expect(raw).toContain('/Separation /All /DeviceCMYK');
        expect(raw).toContain('/OCProperties');
        for (const layer of ['Artwork', 'CutContour', 'Crease', 'Marks']) expect(raw).toContain(`(${layer})`);
    });

    it('gives every rigid part its own page', async () => {
        const rigid: BoxParams = {
            ...mailer,
            style: 'rigid-lid-base',
            thickness: 2,
            construction: 'rigid',
            rigid: { boardThickness: 2, turnIn: 18 },
        };
        const result = generateDieline(rigid);
        const sheets = result.parts!.map((part) => ({ name: part, result: extractPart(result, part), artwork: null }));
        const doc = await PDFDocument.load(await buildPrintPdf(sheets, { title: 'Rigid', params: rigid }));
        expect(doc.getPageCount()).toBe(3);
    });
});
