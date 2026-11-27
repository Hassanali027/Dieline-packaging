import {
    closePath,
    lineTo,
    moveTo,
    PDFOperatorNames as Ops,
    PDFDict,
    PDFDocument,
    PDFName,
    PDFNumber,
    PDFOperator,
    PDFString,
    popGraphicsState,
    pushGraphicsState,
    setDashPattern,
    setLineWidth,
    StandardFonts,
    stroke,
    type PDFPage,
    type PDFRef,
} from 'pdf-lib';
import type { BoxParams, DielineResult } from '../../types/design';
import { BLEED_MM, mirrorPathX } from '../dieline';
import { svgPathToPolylines } from '../dieline/svgPath';

/**
 * Print-ready PDF of a box (Dev 1): one page per printed sheet (each rigid part, and the
 * inside when it has artwork), at true size.
 *
 * - Artwork: the printed sheet, bleed included, as a 300 DPI image (text and vector art are
 *   flattened into it, so fonts can never go missing at the printer).
 * - CutContour / Crease: the knife and fold lines as vector paths in spot colours of those
 *   names (Separation colour spaces): cutting tables and RIP software pick them up by name and
 *   never print them.
 * - Layers (optional content): Artwork, CutContour, Crease, Marks, so prepress can hide any.
 * - Crop marks and a slug line outside the bleed; TrimBox / BleedBox set on every page.
 */

export type PrintSheet = {
    /** e.g. "Outside", "Lid outside". */
    name: string;
    result: DielineResult;
    /** The sheet drawn from -bleed to size + bleed (see ARTWORK_MARGIN_MM). Null = blank board. */
    artwork: HTMLCanvasElement | null;
    /** The inside is printed on the back: its lines are mirrored like the artwork. */
    mirrored?: boolean;
};

export type PrintPdfOptions = { title: string; params?: BoxParams | null };

/** Artwork canvases must cover the bleed on every side. */
export const ARTWORK_MARGIN_MM = BLEED_MM;
/** Room around the bleed for crop marks and the slug line. */
const PAGE_MARGIN_MM = 15;
const PT_PER_MM = 72 / 25.4;
/** Hairlines prepress expects for cut / crease (0.25 pt). */
const LINE_PT = 0.25;

type Spot = { name: string; cmyk: [number, number, number, number] };
const CUT: Spot = { name: 'CutContour', cmyk: [0, 1, 0, 0] };
const CREASE: Spot = { name: 'Crease', cmyk: [1, 0, 0, 0] };

async function canvasJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) throw new Error('Could not encode the artwork.');
    return new Uint8Array(await blob.arrayBuffer());
}

/** A Separation colour space for a spot colour (tint 1 = the CMYK fallback for proofs). */
function separation(doc: PDFDocument, spot: Spot): PDFRef {
    const tint = doc.context.register(doc.context.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: spot.cmyk, N: 1 }));
    return doc.context.register(doc.context.obj([PDFName.of('Separation'), PDFName.of(spot.name), PDFName.of('DeviceCMYK'), tint]));
}

function resourceDict(doc: PDFDocument, page: PDFPage, key: string): PDFDict {
    const { Resources } = page.node.normalizedEntries();
    const existing = Resources.lookupMaybe(PDFName.of(key), PDFDict);
    if (existing) return existing;
    const dict = doc.context.obj({});
    Resources.set(PDFName.of(key), dict);
    return dict;
}

type OperatorArg = NonNullable<Parameters<typeof PDFOperator.of>[1]>[number];
const op = (name: Ops, ...args: OperatorArg[]) => PDFOperator.of(name, args);

export async function buildPrintPdf(sheets: PrintSheet[], opts: PrintPdfOptions): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.setTitle(opts.title);
    doc.setCreator('Dieline Studio');
    doc.setProducer('Dieline Studio (pdf-lib)');
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const cutCs = separation(doc, CUT);
    const creaseCs = separation(doc, CREASE);
    // "All" is the registration colour: crop marks print on every plate.
    const regCs = separation(doc, { name: 'All', cmyk: [1, 1, 1, 1] });

    const layer = (name: string) => doc.context.register(doc.context.obj({ Type: 'OCG', Name: PDFString.of(name) }));
    const layers = { Artwork: layer('Artwork'), CutContour: layer('CutContour'), Crease: layer('Crease'), Marks: layer('Marks') };
    const all = Object.values(layers);
    doc.catalog.set(PDFName.of('OCProperties'), doc.context.obj({ OCGs: all, D: { Order: all, ON: all } }));

    for (const sheet of sheets) {
        const { width: W, height: H } = sheet.result.overallSize;
        const B = ARTWORK_MARGIN_MM;
        const M = PAGE_MARGIN_MM;
        const k = PT_PER_MM;
        const pageW = (W + 2 * M) * k;
        const pageH = (H + 2 * M) * k;
        const page = doc.addPage([pageW, pageH]);
        page.setTrimBox(M * k, M * k, W * k, H * k);
        page.setBleedBox((M - B) * k, (M - B) * k, (W + 2 * B) * k, (H + 2 * B) * k);

        const colorSpaces = resourceDict(doc, page, 'ColorSpace');
        colorSpaces.set(PDFName.of('CutContour'), cutCs);
        colorSpaces.set(PDFName.of('Crease'), creaseCs);
        colorSpaces.set(PDFName.of('All'), regCs);
        const properties = resourceDict(doc, page, 'Properties');
        for (const [name, ref] of Object.entries(layers)) properties.set(PDFName.of(name), ref);

        const X = (x: number) => (M + x) * k;
        const Y = (y: number) => pageH - (M + y) * k;
        const begin = (name: keyof typeof layers) => page.pushOperators(op(Ops.BeginMarkedContentSequence, PDFName.of('OC'), PDFName.of(name)));
        const end = () => page.pushOperators(op(Ops.EndMarkedContent));

        if (sheet.artwork) {
            const image = await doc.embedJpg(await canvasJpeg(sheet.artwork));
            begin('Artwork');
            page.drawImage(image, { x: X(-B), y: Y(H + B), width: (W + 2 * B) * k, height: (H + 2 * B) * k });
            end();
        }

        const strokePaths = (paths: string[], colorSpace: string, dash: number[]) => {
            const ops = [
                pushGraphicsState(),
                op(Ops.StrokingColorspace, PDFName.of(colorSpace)),
                op(Ops.StrokingColorN, PDFNumber.of(1)),
                setLineWidth(LINE_PT),
            ];
            if (dash.length) ops.push(setDashPattern(dash, 0));
            for (const d of paths) {
                for (const line of svgPathToPolylines(sheet.mirrored ? mirrorPathX(d, W) : d)) {
                    ops.push(moveTo(X(line.pts[0].x), Y(line.pts[0].y)));
                    for (const p of line.pts.slice(1)) ops.push(lineTo(X(p.x), Y(p.y)));
                    if (line.closed) ops.push(closePath());
                }
            }
            ops.push(stroke(), popGraphicsState());
            page.pushOperators(...ops);
        };

        begin('CutContour');
        strokePaths([sheet.result.cutPath], 'CutContour', []);
        end();
        begin('Crease');
        strokePaths(sheet.result.creasePaths, 'Crease', [3 * k, 2 * k]);
        end();

        // Crop marks at the sheet's corners, starting 1 mm outside the bleed, 6 mm long.
        begin('Marks');
        const gap = B + 1;
        const len = 6;
        const marks: string[] = [];
        for (const [cx, sx] of [
            [0, -1],
            [W, 1],
        ] as const) {
            for (const [cy, sy] of [
                [0, -1],
                [H, 1],
            ] as const) {
                marks.push(`M${cx + sx * gap} ${cy} L${cx + sx * (gap + len)} ${cy}`);
                marks.push(`M${cx} ${cy + sy * gap} L${cx} ${cy + sy * (gap + len)}`);
            }
        }
        const markOps = [
            pushGraphicsState(),
            op(Ops.StrokingColorspace, PDFName.of('All')),
            op(Ops.StrokingColorN, PDFNumber.of(1)),
            setLineWidth(LINE_PT),
        ];
        for (const d of marks) {
            const [line] = svgPathToPolylines(d);
            markOps.push(moveTo(X(line.pts[0].x), Y(line.pts[0].y)), lineTo(X(line.pts[1].x), Y(line.pts[1].y)));
        }
        markOps.push(stroke(), popGraphicsState());
        page.pushOperators(...markOps);

        const size = opts.params
            ? `${opts.params.length} × ${opts.params.width} × ${opts.params.depth} ${opts.params.unit}`
            : `${Math.round(W)} × ${Math.round(H)} mm sheet`;
        page.drawText(`${opts.title} · ${sheet.name} · ${size} · sheet ${W.toFixed(1)} × ${H.toFixed(1)} mm · bleed ${B} mm`, {
            x: X(0),
            y: Y(H + B + 6),
            size: 7,
            font,
        });
        end();
    }

    // No object streams (a PDF 1.5 feature): older print RIPs and PDF/X-1a workflows expect plain objects.
    return doc.save({ useObjectStreams: false });
}

/** Saves the PDF in the browser. */
export function downloadPdf(fileName: string, bytes: Uint8Array): void {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
