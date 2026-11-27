import { BLEED_MM, mirrorPathX, mirrorPolygonX } from '@/lib/dieline';
import { materialColor } from '@/lib/three/materials';
import { surfaceObjects, useEditorStore, type BoxSide } from '@/store/useEditorStore';
import type { CanvasObject, DielineResult, Pt } from '@/types/design';
import { ActiveSelection, Canvas, Group, Path, Point, Polygon, Textbox, type FabricObject, type TPointerEventInfo } from 'fabric';
import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { applyToFabric, buildGroup, createFabricObject, explodeGroup, propsKey, readText, readTransform, type BoundObject } from './objects';

export type CanvasController = {
    zoomIn: () => void;
    zoomOut: () => void;
    fit: () => void;
    getZoom: () => number;
    /** Groups the current multi-selection (Ctrl+G). */
    group: () => void;
    /** Splits the selected group back into its objects (Ctrl+Shift+G). */
    ungroup: () => void;
    /** True while a Fabric text object is actively being edited on the canvas. */
    isEditingText: () => boolean;
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
    readOnly?: boolean;
};

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 40;
/** Empty space kept around the bleed when fitting, in mm. */
const FIT_MARGIN_MM = 12;
/** Screen space reserved for the overlays when fitting, in CSS px. */
const FIT_INSET_PX = { top: 64, bottom: 84, side: 24 };

const COLORS = {
    cut: '#0f172a',
    crease: '#e11d48',
    bleed: '#38bdf8',
    safe: '#22c55e',
    selected: '#6366f1',
};

/** Marks objects that belong to the locked dieline layer (not user content, not exported as design). */
const DIELINE_LAYER = 'dieline-layer';

type LayerObject = FabricObject & { layer?: string; panelId?: string; taggedLineId?: string; taggedLineTag?: 'cut' | 'fold' };

const isTyping = () => {
    const el = document.activeElement as HTMLElement | null;
    const tag = (el?.tagName ?? '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el?.isContentEditable;
};

export default function DielineCanvas({
    result,
    side,
    material,
    faceColors,
    selectedPanelId,
    onSelectPanel,
    onZoomChange,
    controllerRef,
    readOnly = false,
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const canvasRef = useRef<Canvas | null>(null);
    const resultRef = useRef<DielineResult | null>(null);
    const fittedFor = useRef<string | null>(null);
    const onSelectPanelRef = useRef(onSelectPanel);
    const onZoomChangeRef = useRef(onZoomChange);
    const readOnlyRef = useRef(readOnly);
    onSelectPanelRef.current = onSelectPanel;
    onZoomChangeRef.current = onZoomChange;
    readOnlyRef.current = readOnly;

    // User objects: the store is the source of truth, Fabric shows it.
    const activePart = useEditorStore((s) => s.activePart);
    const showTurnInWarning = useEditorStore((s) => s.showTurnInWarning);
    const lineTaggingMode = useEditorStore((s) => s.lineTaggingMode);
    const source = useEditorStore((s) => s.design.source);
    const objects = useEditorStore((s) => surfaceObjects(s.design, s.activePart, side));
    const selectedObjectIds = useEditorStore((s) => s.selectedObjectIds);
    const fabricObjects = useRef(new Map<string, BoundObject>());
    const latestObjects = useRef<CanvasObject[]>(objects);
    const latestSelection = useRef<string[]>(selectedObjectIds);
    const sideRef = useRef(side);
    /** Which printed surface (part + side) the Fabric objects currently show. */
    const shownSurface = useRef(`${activePart}:${side}`);
    const generation = useRef(0);
    const groupRef = useRef<() => void>(() => {});
    const ungroupRef = useRef<() => void>(() => {});
    /** True while we change the Fabric selection ourselves, so its events are not echoed back. */
    const selecting = useRef(false);
    latestObjects.current = objects;
    latestSelection.current = selectedObjectIds;
    sideRef.current = side;

    /** Panels at the bottom, user objects in store order, dieline lines on top as an overlay. */
    const restack = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const all = canvas.getObjects() as LayerObject[];
        const panels = all.filter((o) => o.layer === DIELINE_LAYER && o.panelId);
        const lines = all.filter((o) => o.layer === DIELINE_LAYER && !o.panelId);
        const users = latestObjects.current.map((o) => fabricObjects.current.get(o.id)).filter((o): o is BoundObject => !!o);
        [...panels, ...users, ...lines].forEach((o, i) => {
            if (canvas.getObjects().indexOf(o) !== i) canvas.moveObjectTo(o, i);
        });
    }, []);

    /** Makes the Fabric selection match the store's selectedObjectIds. */
    const syncSelection = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const wanted = latestSelection.current;
        const current = canvas.getActiveObjects().map((o) => (o as BoundObject).objectId);
        if (wanted.length === current.length && wanted.every((id) => current.includes(id))) return;
        selecting.current = true;
        canvas.discardActiveObject();
        const objs = wanted.map((id) => fabricObjects.current.get(id)).filter((o): o is BoundObject => !!o);
        if (objs.length === 1) canvas.setActiveObject(objs[0]);
        else if (objs.length > 1) canvas.setActiveObject(new ActiveSelection(objs, { canvas }));
        selecting.current = false;
        canvas.requestRenderAll();
    }, []);

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
        // Keep the sheet clear of the floating controls (view pill on top, toolbars at the bottom).
        const top = Math.min(FIT_INSET_PX.top, ch * 0.15);
        const bottom = Math.min(FIT_INSET_PX.bottom, ch * 0.2);
        const side = Math.min(FIT_INSET_PX.side, cw * 0.05);
        const zoom = Math.max(MIN_ZOOM, Math.min((cw - 2 * side) / w, (ch - top - bottom) / h));
        canvas.setViewportTransform([
            zoom,
            0,
            0,
            zoom,
            (cw - dieline.overallSize.width * zoom) / 2,
            top + (ch - top - bottom - dieline.overallSize.height * zoom) / 2,
        ]);
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

    const groupSelection = useCallback(() => {
        const canvas = canvasRef.current;
        const active = canvas?.getActiveObject();
        if (!canvas || !(active instanceof ActiveSelection)) return;
        const members = active.getObjects() as BoundObject[];
        const side = sideRef.current;
        const group = buildGroup(active, members, latestObjects.current, side);
        if (!group) return;
        selecting.current = true;
        canvas.discardActiveObject();
        selecting.current = false;
        useEditorStore.getState().replaceObjects(side, members.map((m) => m.objectId!).filter(Boolean), [group]);
    }, []);

    const ungroupSelection = useCallback(() => {
        const canvas = canvasRef.current;
        const active = canvas?.getActiveObject();
        if (!canvas || !(active instanceof Group) || active instanceof ActiveSelection) return;
        const objectId = (active as Group & BoundObject).objectId;
        const side = sideRef.current;
        const obj = latestObjects.current.find((o) => o.id === objectId);
        if (!obj || obj.type !== 'group') return;
        const children = explodeGroup(active, obj);
        selecting.current = true;
        canvas.discardActiveObject();
        selecting.current = false;
        useEditorStore.getState().replaceObjects(side, [obj.id], children);
    }, []);

    groupRef.current = groupSelection;
    ungroupRef.current = ungroupSelection;

    useImperativeHandle(
        controllerRef,
        () => ({
            zoomIn: () => zoomBy(1.2),
            zoomOut: () => zoomBy(1 / 1.2),
            fit,
            getZoom: () => canvasRef.current?.getZoom() ?? 1,
            group: groupSelection,
            ungroup: ungroupSelection,
            isEditingText: () => canvasRef.current?.getActiveObjects().some((o) => o instanceof Textbox && o.isEditing) ?? false,
        }),
        [fit, zoomBy, groupSelection, ungroupSelection],
    );

    // Create the Fabric canvas once, with zoom (wheel) and pan (Space/Alt + drag, or middle mouse).
    useEffect(() => {
        const el = canvasElRef.current;
        const container = containerRef.current;
        if (!el || !container) return;

        const canvas = new Canvas(el, {
            // Transparent: the dotted drafting grid behind the canvas is CSS (.editor-grid).
            backgroundColor: '',
            preserveObjectStacking: true,
            selection: true,
            fireMiddleClick: true,
            stopContextMenu: true,
            // Pixels of slack around thin strokes for objects that hit-test per pixel (tagged dieline lines).
            targetFindTolerance: 6,
        });
        canvasRef.current = canvas;
        const boundObjects = fabricObjects.current;

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
            const target = opt.target as LayerObject | undefined;
            if (target?.taggedLineId && target.taggedLineTag) {
                const nextTag = target.taggedLineTag === 'cut' ? 'fold' : 'cut';
                useEditorStore.getState().setUploadedLineTag(target.taggedLineId, nextTag);
                return;
            }
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

        const editingText = () => canvas.getActiveObjects().some((o) => o instanceof Textbox && o.isEditing);
        const onKeyDown = (e: KeyboardEvent) => {
            if (isTyping() || editingText()) return;
            if (e.code === 'Space') {
                spaceDown = true;
                canvas.defaultCursor = 'grab';
                canvas.setCursor('grab');
                e.preventDefault();
                return;
            }
            if (readOnlyRef.current) return;
            const store = useEditorStore.getState();
            const ids = store.selectedObjectIds;
            const mod = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();
            if (mod && key === 'v') {
                store.pasteObjects(sideRef.current);
                e.preventDefault();
                return;
            }
            if (!ids.length) return;
            const list = surfaceObjects(store.design, store.activePart, sideRef.current);
            const unlockedIds = ids.filter((id) => !list.find((o) => o.id === id)?.locked);
            if (e.key.startsWith('Arrow') && !mod && !e.altKey) {
                // Nudge 1 mm, or 10 mm with Shift.
                const step = e.shiftKey ? 10 : 1;
                const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
                const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
                const patches = unlockedIds.map((id) => {
                    const o = list.find((x) => x.id === id)!;
                    return { id, props: { left: Number(o.props.left ?? 0) + dx, top: Number(o.props.top ?? 0) + dy } };
                });
                if (patches.length) store.updateObjects(sideRef.current, patches);
                e.preventDefault();
                return;
            }
            if (mod && key === 'c') {
                store.copyObjects(sideRef.current, ids);
                e.preventDefault();
                return;
            }
            if (mod && key === 'g') {
                if (e.shiftKey) ungroupRef.current();
                else groupRef.current();
                e.preventDefault();
                return;
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const unlocked = ids.filter((id) => !list.find((o) => o.id === id)?.locked);
                if (unlocked.length) store.removeObjects(sideRef.current, unlocked);
                e.preventDefault();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
                store.duplicateObjects(sideRef.current, ids);
                e.preventDefault();
            }
        };

        // Fabric -> store: one undo step per finished drag / scale / rotate / text edit.
        const commit = (target: FabricObject | undefined) => {
            if (!target) return;
            const objs = (target instanceof ActiveSelection ? target.getObjects() : [target]) as BoundObject[];
            const patches = objs.filter((o) => o.objectId).map((o) => ({ id: o.objectId!, props: { ...readTransform(o), ...readText(o) } }));
            if (!patches.length) return;
            useEditorStore.getState().updateObjects(sideRef.current, patches);
            // Fabric already shows these values; mark them as applied so the store sync leaves them alone.
            const st = useEditorStore.getState();
            const fresh = surfaceObjects(st.design, st.activePart, sideRef.current);
            for (const o of objs) {
                const obj = fresh.find((x) => x.id === o.objectId);
                if (obj) o.propsKey = propsKey(obj);
            }
        };
        const onSelection = () => {
            if (selecting.current) return;
            const ids = canvas
                .getActiveObjects()
                .map((o) => (o as BoundObject).objectId)
                .filter((id): id is string => !!id);
            useEditorStore.getState().setSelectedObjectIds(ids);
        };
        canvas.on('object:modified', (e) => commit(e.target));
        canvas.on('text:editing:exited', (e) => commit(e.target));
        canvas.on('selection:created', onSelection);
        canvas.on('selection:updated', onSelection);
        canvas.on('selection:cleared', onSelection);
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
            boundObjects.clear();
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
            .filter((o) => (o as LayerObject).layer === DIELINE_LAYER)
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
        const turnInShades = showTurnInWarning
            ? result.panels
                  .filter((p) => p.id.includes('turnin-'))
                  .map(
                      (p) =>
                          new Polygon(polygon(p.polygon), {
                              ...locked,
                              evented: false,
                              fill: 'rgba(245, 158, 11, 0.22)',
                              stroke: '#d97706',
                              strokeWidth: 0.75,
                              strokeDashArray: [3, 2],
                          }),
                  )
            : [];

        const hasInteractiveUploadedLines = source.kind === 'uploaded-dieline' && !!source.lines?.length;
        const lines = [
            new Path(path(result.bleedPath), { ...lineStyle, stroke: COLORS.bleed, strokeWidth: 1, strokeDashArray: [6, 4] }),
            new Path(path(result.safePath), { ...lineStyle, stroke: COLORS.safe, strokeWidth: 0.75, strokeDashArray: [2, 3] }),
            ...(!hasInteractiveUploadedLines
                ? [
                      new Path(path(result.cutPath), { ...lineStyle, stroke: COLORS.cut, strokeWidth: 1.25 }),
                      ...result.creasePaths.map(
                          (d) => new Path(path(d), { ...lineStyle, stroke: COLORS.crease, strokeWidth: 1, strokeDashArray: [5, 4] }),
                      ),
                  ]
                : []),
        ];

        const uploadedLines = hasInteractiveUploadedLines
            ? source.lines!.map((l) =>
                  Object.assign(
                      new Path(path(l.path), {
                          ...locked,
                          fill: '',
                          evented: lineTaggingMode,
                          // Hit the stroke itself, not the bounding box: otherwise a click anywhere inside
                          // the outer cut outline (and on the fold lines within it) toggled the outline.
                          perPixelTargetFind: true,
                          hoverCursor: lineTaggingMode ? 'pointer' : 'default',
                          stroke: l.tag === 'cut' ? COLORS.cut : COLORS.crease,
                          strokeWidth: lineTaggingMode ? 2.2 : 1.25,
                          strokeDashArray: l.tag === 'fold' ? [5, 4] : null,
                      }),
                      { taggedLineId: l.id, taggedLineTag: l.tag },
                  ),
              )
            : [];

        // Panels stay separate objects so they can be clicked; the line work is one non-interactive group.
        const linesGroup = new Group([...turnInShades, ...lines], { ...locked, evented: false, subTargetCheck: false });

        const layer = [...panelObjects, linesGroup, ...uploadedLines];
        layer.forEach((obj) => Object.assign(obj, { layer: DIELINE_LAYER }));
        canvas.add(...layer);
        restack();
        canvas.requestRenderAll();

        // Fit on first draw and whenever the overall size changes (new style / size).
        const key = `${result.overallSize.width}x${result.overallSize.height}`;
        if (fittedFor.current !== key) {
            fittedFor.current = key;
            fit();
        }
    }, [result, side, material, faceColors, selectedPanelId, showTurnInWarning, lineTaggingMode, source, fit, restack]);

    // Store -> Fabric: add, update, remove and reorder user objects for the visible side.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        generation.current += 1;
        const map = fabricObjects.current;

        const surface = `${activePart}:${side}`;
        if (shownSurface.current !== surface) {
            selecting.current = true;
            canvas.discardActiveObject();
            selecting.current = false;
            map.forEach((fo) => canvas.remove(fo));
            map.clear();
            shownSurface.current = surface;
        }

        const wanted = new Map(objects.map((o) => [o.id, o]));
        const stale = objects.filter((o) => map.has(o.id) && map.get(o.id)!.propsKey !== propsKey(o));
        // Objects inside a multi-selection use selection-relative coordinates: drop it before updating them.
        if (stale.length && canvas.getActiveObject() instanceof ActiveSelection) {
            selecting.current = true;
            canvas.discardActiveObject();
            selecting.current = false;
        }

        for (const [id, fo] of map) {
            if (!wanted.has(id)) {
                canvas.remove(fo);
                map.delete(id);
            }
        }

        const pending: Promise<void>[] = [];
        for (const obj of objects) {
            const fo = map.get(obj.id);
            if (fo && applyToFabric(fo, obj)) continue;
            if (fo) {
                canvas.remove(fo);
                map.delete(obj.id);
            }
            pending.push(
                createFabricObject(obj).then((created) => {
                    const latest = latestObjects.current.find((o) => o.id === obj.id);
                    if (!created || !latest || shownSurface.current !== surface || map.has(obj.id)) return;
                    applyToFabric(created, latest);
                    map.set(obj.id, created);
                    canvas.add(created);
                }),
            );
        }

        const finish = () => {
            restack();
            syncSelection();
            canvas.requestRenderAll();
        };
        finish();
        if (pending.length) {
            void Promise.all(pending).then(() => {
                // finish() is idempotent, so a slower pass may still restack after a newer one.
                if (shownSurface.current === surface) finish();
            });
        }
    }, [objects, side, activePart, restack, syncSelection]);

    // Selection changed from outside the canvas (toolbar, sidebar, undo).
    useEffect(() => {
        syncSelection();
    }, [selectedObjectIds, syncSelection]);

    return (
        <div ref={containerRef} className="absolute inset-0 overflow-hidden">
            <canvas ref={canvasElRef} />
        </div>
    );
}
