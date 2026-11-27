import { BLEED_MM, mirrorPathX, mirrorPolygonX } from '@/lib/dieline';
import { materialColor } from '@/lib/three/materials';
import type { BoxSide } from '@/store/useEditorStore';
import type { DielineResult, Pt } from '@/types/design';
import { Canvas, Group, Path, Point, Polygon, type FabricObject, type TPointerEventInfo } from 'fabric';
import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react';

export type CanvasController = {
    zoomIn: () => void;
    zoomOut: () => void;
    fit: () => void;
    getZoom: () => number;
};

type Props = {
    result: DielineResult | null;
    side: BoxSide;
    material: string;
    faceColors: Record<string, string>;
    selectedPanelId: string | null;
    onSelectPanel: (id: string | null) => void;
    onZoomChange?: (zoom: number) => void;
    controllerRef?: Ref<CanvasController>;
};

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 40;
/** Empty space kept around the bleed when fitting, in mm. */
const FIT_MARGIN_MM = 12;

const COLORS = {
    cut: '#0f172a',
    crease: '#e11d48',
    bleed: '#38bdf8',
    safe: '#22c55e',
    selected: '#6366f1',
};

/** Marks objects that belong to the locked dieline layer (not user content, not exported as design). */
const DIELINE_LAYER = 'dieline-layer';

export default function DielineCanvas({ result, side, material, faceColors, selectedPanelId, onSelectPanel, onZoomChange, controllerRef }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const canvasRef = useRef<Canvas | null>(null);
    const resultRef = useRef<DielineResult | null>(null);
    const fittedFor = useRef<string | null>(null);
    const onSelectPanelRef = useRef(onSelectPanel);
    const onZoomChangeRef = useRef(onZoomChange);
    onSelectPanelRef.current = onSelectPanel;
    onZoomChangeRef.current = onZoomChange;

    const emitZoom = useCallback(() => {
        const canvas = canvasRef.current;
        if (canvas) onZoomChangeRef.current?.(canvas.getZoom());
    }, []);

    const fit = useCallback(() => {
        const canvas = canvasRef.current;
        const dieline = resultRef.current;
        if (!canvas || !dieline) return;
        const pad = BLEED_MM + FIT_MARGIN_MM;
        const w = dieline.overallSize.width + pad * 2;
        const h = dieline.overallSize.height + pad * 2;
        const cw = canvas.getWidth();
        const ch = canvas.getHeight();
        if (!cw || !ch) return;
        const zoom = Math.min(cw / w, ch / h);
        canvas.setViewportTransform([zoom, 0, 0, zoom, (cw - dieline.overallSize.width * zoom) / 2, (ch - dieline.overallSize.height * zoom) / 2]);
        canvas.requestRenderAll();
        emitZoom();
    }, [emitZoom]);

    const zoomBy = useCallback(
        (factor: number) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, canvas.getZoom() * factor));
            canvas.zoomToPoint(new Point(canvas.getWidth() / 2, canvas.getHeight() / 2), zoom);
            emitZoom();
        },
        [emitZoom],
    );

    useImperativeHandle(
        controllerRef,
        () => ({
            zoomIn: () => zoomBy(1.2),
            zoomOut: () => zoomBy(1 / 1.2),
            fit,
            getZoom: () => canvasRef.current?.getZoom() ?? 1,
        }),
        [fit, zoomBy],
    );

    // Create the Fabric canvas once, with zoom (wheel) and pan (Space/Alt + drag, or middle mouse).
    useEffect(() => {
        const el = canvasElRef.current;
        const container = containerRef.current;
        if (!el || !container) return;

        const canvas = new Canvas(el, {
            backgroundColor: '#e2e8f0',
            preserveObjectStacking: true,
            selection: true,
            fireMiddleClick: true,
            stopContextMenu: true,
        });
        canvasRef.current = canvas;

        let spaceDown = false;
        let panning = false;
        let last: { x: number; y: number } | null = null;

        const onWheel = (opt: TPointerEventInfo<WheelEvent>) => {
            const e = opt.e;
            const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, canvas.getZoom() * 0.999 ** e.deltaY));
            canvas.zoomToPoint(new Point(e.offsetX, e.offsetY), zoom);
            e.preventDefault();
            e.stopPropagation();
            emitZoom();
        };

        const onDown = (opt: TPointerEventInfo) => {
            const e = opt.e as MouseEvent;
            if (spaceDown || e.altKey || e.button === 1) {
                panning = true;
                last = { x: e.clientX, y: e.clientY };
                canvas.selection = false;
                canvas.setCursor('grabbing');
                return;
            }
            const target = opt.target as (FabricObject & { panelId?: string }) | undefined;
            onSelectPanelRef.current(target?.panelId ?? null);
        };

        const onMove = (opt: TPointerEventInfo) => {
            if (!panning || !last) return;
            const e = opt.e as MouseEvent;
            canvas.relativePan(new Point(e.clientX - last.x, e.clientY - last.y));
            last = { x: e.clientX, y: e.clientY };
        };

        const onUp = () => {
            if (!panning) return;
            panning = false;
            last = null;
            canvas.selection = true;
            canvas.setCursor(spaceDown ? 'grab' : 'default');
        };

        const isTyping = () => {
            const tag = (document.activeElement?.tagName ?? '').toLowerCase();
            return tag === 'input' || tag === 'textarea' || tag === 'select';
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !isTyping()) {
                spaceDown = true;
                canvas.defaultCursor = 'grab';
                canvas.setCursor('grab');
                e.preventDefault();
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                spaceDown = false;
                canvas.defaultCursor = 'default';
                canvas.setCursor('default');
            }
        };

        canvas.on('mouse:wheel', onWheel);
        canvas.on('mouse:down', onDown);
        canvas.on('mouse:move', onMove);
        canvas.on('mouse:up', onUp);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        const resize = () => {
            const { width, height } = container.getBoundingClientRect();
            if (width < 1 || height < 1) return;
            canvas.setDimensions({ width, height });
            if (fittedFor.current) fit();
            else canvas.requestRenderAll();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        resize();

        return () => {
            observer.disconnect();
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            canvasRef.current = null;
            void canvas.dispose();
        };
    }, [emitZoom, fit]);

    // (Re)draw the locked dieline layer whenever the dieline, side or colours change.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !result) return;
        resultRef.current = result;

        canvas
            .getObjects()
            .filter((o) => (o as FabricObject & { layer?: string }).layer === DIELINE_LAYER)
            .forEach((o) => canvas.remove(o));

        const locked = {
            selectable: false,
            hasControls: false,
            lockMovementX: true,
            lockMovementY: true,
            objectCaching: false,
            strokeUniform: true,
            excludeFromExport: true,
        } as const;

        // The inside of the sheet is the mirror image of the outside.
        const w = result.overallSize.width;
        const inside = side === 'inside';
        const path = (d: string) => (inside ? mirrorPathX(d, w) : d);
        const polygon = (p: Pt[]) => (inside ? mirrorPolygonX(p, w) : p);

        // Fabric places polygons and paths at their own coordinates, so 1 scene unit = 1 mm.
        const baseFill = materialColor(material, side);
        const panelObjects = result.panels.map((panel) =>
            Object.assign(
                new Polygon(polygon(panel.polygon), {
                    ...locked,
                    fill: faceColors[panel.id] ?? baseFill,
                    stroke: panel.id === selectedPanelId ? COLORS.selected : undefined,
                    strokeWidth: panel.id === selectedPanelId ? 2 : 0,
                    hoverCursor: 'pointer',
                    evented: true,
                }),
                { panelId: panel.id },
            ),
        );

        const lineStyle = { ...locked, evented: false, fill: '' };
        const lines = [
            new Path(path(result.bleedPath), { ...lineStyle, stroke: COLORS.bleed, strokeWidth: 1, strokeDashArray: [6, 4] }),
            new Path(path(result.safePath), { ...lineStyle, stroke: COLORS.safe, strokeWidth: 0.75, strokeDashArray: [2, 3] }),
            new Path(path(result.cutPath), { ...lineStyle, stroke: COLORS.cut, strokeWidth: 1.25 }),
            ...result.creasePaths.map((d) => new Path(path(d), { ...lineStyle, stroke: COLORS.crease, strokeWidth: 1, strokeDashArray: [5, 4] })),
        ];

        // Panels stay separate objects so they can be clicked; the line work is one non-interactive group.
        const linesGroup = new Group(lines, { ...locked, evented: false, subTargetCheck: false });

        const layer = [...panelObjects, linesGroup];
        layer.forEach((obj) => Object.assign(obj, { layer: DIELINE_LAYER }));
        canvas.add(...layer);
        // Keep the dieline under any user objects, in the same order (panels, then lines).
        [...layer].reverse().forEach((obj) => canvas.sendObjectToBack(obj));
        canvas.requestRenderAll();

        // Fit on first draw and whenever the overall size changes (new style / size).
        const key = `${result.overallSize.width}x${result.overallSize.height}`;
        if (fittedFor.current !== key) {
            fittedFor.current = key;
            fit();
        }
    }, [result, side, material, faceColors, selectedPanelId, fit]);

    return (
        <div ref={containerRef} className="absolute inset-0 overflow-hidden">
            <canvas ref={canvasElRef} />
        </div>
    );
}
