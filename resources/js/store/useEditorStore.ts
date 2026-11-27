import type { BoxParams, BoxSource, CanvasObject, Design, DesignPartKey, Panel } from '@/types/design';
import { temporal } from 'zundo';
import { create } from 'zustand';

export type EditorTab = 'box' | 'uploads' | 'elements' | 'text' | 'inspirations' | 'qr';
export type BoxSide = 'outside' | 'inside';
export type CameraPreset = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
export type ZOrderMove = 'forward' | 'backward' | 'front' | 'back';

/** Server copy of the design: its id, name and the design as last saved (to tell if there are unsaved changes). */
export type DesignMeta = { id: number | null; name: string; baseline: Design | null };

/** A partial update for one canvas object: props are merged, other fields replaced. */
export type ObjectPatch = { id: string; props?: Record<string, unknown>; locked?: boolean };

let idCounter = 0;
export function newObjectId(): string {
    idCounter += 1;
    return `obj-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/** Deep copy with fresh ids (group children too), so copies never share ids with originals. */
export function cloneWithNewIds(obj: CanvasObject): CanvasObject {
    const children = Array.isArray(obj.props.children) ? (obj.props.children as CanvasObject[]).map(cloneWithNewIds) : undefined;
    return { ...obj, id: newObjectId(), props: { ...obj.props, ...(children ? { children } : {}) } };
}

const NO_OBJECTS: CanvasObject[] = [];

/**
 * The objects of one printed surface. Folding boxes have one sheet (design.outside/inside);
 * rigid boxes keep each part's objects in design.parts[part]. Returns a stable empty array
 * so React selectors do not loop.
 */
export function surfaceObjects(design: Design, part: DesignPartKey | null, side: BoxSide): CanvasObject[] {
    if (!part) return design[side];
    return design.parts?.[part]?.[side] ?? NO_OBJECTS;
}

function objectsOf(state: Pick<EditorState, 'design' | 'activePart'>, side: BoxSide): CanvasObject[] {
    return surfaceObjects(state.design, state.activePart, side);
}

function withObjects(design: Design, part: DesignPartKey | null, side: BoxSide, objects: CanvasObject[]): Design {
    if (!part) return { ...design, [side]: objects };
    const current = design.parts?.[part] ?? { outside: [], inside: [] };
    return { ...design, parts: { ...design.parts, [part]: { ...current, [side]: objects } } };
}

/** In-memory clipboard for Ctrl+C / Ctrl+V (objects, not the system clipboard). */
let clipboard: CanvasObject[] = [];
let pasteCount = 0;

export interface EditorState {
    activeTab: EditorTab;
    activeSide: BoxSide;
    /** Rigid boxes: the part being designed (lid / base / liner). null for folding boxes. */
    activePart: DesignPartKey | null;
    foldProgress: number;
    xRay: boolean;
    showTurnInWarning: boolean;
    lineTaggingMode: boolean;
    cameraPreset: CameraPreset;
    selectedObjectIds: string[];
    selectedPanelId: string | null;
    design: Design;
    designMeta: DesignMeta;
    setDesignMeta: (meta: Partial<DesignMeta>) => void;
    setActiveTab: (tab: EditorTab) => void;
    setActiveSide: (side: BoxSide) => void;
    setActivePart: (part: DesignPartKey | null) => void;
    setFoldProgress: (value: number) => void;
    toggleXRay: () => void;
    toggleTurnInWarning: () => void;
    setLineTaggingMode: (on: boolean) => void;
    setUploadedLineTag: (lineId: string, tag: 'cut' | 'fold') => void;
    setCameraPreset: (preset: CameraPreset) => void;
    setSelectedObjectIds: (ids: string[]) => void;
    setSelectedPanelId: (panelId: string | null) => void;
    updateParams: (params: Partial<BoxParams>) => void;
    setSource: (source: BoxSource) => void;
    setMaterial: (material: Design['material']) => void;
    setFinish: (finish: Partial<NonNullable<Design['finish']>>) => void;
    updateUploadedPanels: (panels: Panel[], foldMapped?: boolean) => void;
    setFaceColor: (panelId: string, color: string) => void;
    setObjects: (side: BoxSide, objects: CanvasObject[]) => void;
    /** Adds an object on top and selects it. */
    addObject: (side: BoxSide, object: CanvasObject) => void;
    /** Adds several objects on top (e.g. a font combination) and selects them all. */
    addObjects: (side: BoxSide, objects: CanvasObject[]) => void;
    /** Applies several patches as one undo step (e.g. moving a multi-selection). */
    updateObjects: (side: BoxSide, patches: ObjectPatch[]) => void;
    removeObjects: (side: BoxSide, ids: string[]) => void;
    /** Copies the objects slightly offset, puts them on top and selects the copies. */
    duplicateObjects: (side: BoxSide, ids: string[]) => void;
    moveObjects: (side: BoxSide, ids: string[], move: ZOrderMove) => void;
    /**
     * Removes `removeIds` and puts `insert` where the top-most removed object was, as one undo
     * step, then selects the inserted objects. Used by group / ungroup.
     */
    replaceObjects: (side: BoxSide, removeIds: string[], insert: CanvasObject[]) => void;
    copyObjects: (side: BoxSide, ids: string[]) => void;
    pasteObjects: (side: BoxSide) => void;
    /** Replaces the whole design (loading a saved design or a draft) and clears the history. */
    loadDesign: (design: Design, meta?: Partial<DesignMeta>) => void;
}

/** Offset used for pasted / duplicated objects, in mm. */
const DUPLICATE_OFFSET = 5;

function reorder(list: CanvasObject[], ids: string[], move: ZOrderMove): CanvasObject[] {
    const picked = new Set(ids);
    if (move === 'front') return [...list.filter((o) => !picked.has(o.id)), ...list.filter((o) => picked.has(o.id))];
    if (move === 'back') return [...list.filter((o) => picked.has(o.id)), ...list.filter((o) => !picked.has(o.id))];
    const out = [...list];
    // Walk away from the direction of travel so neighbours in the selection keep their order.
    const indices = out.map((o, i) => (picked.has(o.id) ? i : -1)).filter((i) => i >= 0);
    if (move === 'forward') indices.reverse();
    for (const i of indices) {
        const j = move === 'forward' ? i + 1 : i - 1;
        if (j < 0 || j >= out.length || picked.has(out[j].id)) continue;
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

const defaultParams: BoxParams = {
    style: 'mailer',
    length: 220,
    width: 160,
    depth: 70,
    thickness: 1.5,
    unit: 'mm',
    construction: 'corrugated',
};

export const useEditorStore = create<EditorState>()(
    temporal(
        (set, get) => ({
            activeTab: 'box',
            activeSide: 'outside',
            activePart: null,
            foldProgress: 0.9,
            xRay: false,
            showTurnInWarning: true,
            lineTaggingMode: false,
            cameraPreset: 'front',
            selectedObjectIds: [],
            selectedPanelId: null,
            designMeta: { id: null, name: '', baseline: null },
            setDesignMeta: (meta) => set((state) => ({ designMeta: { ...state.designMeta, ...meta } })),
            design: {
                source: { kind: 'parametric', params: defaultParams },
                outside: [],
                inside: [],
                faceColors: {},
                material: 'white',
            },
            setActiveTab: (activeTab) => set({ activeTab }),
            setActiveSide: (activeSide) => set({ activeSide, selectedObjectIds: [] }),
            setActivePart: (activePart) => set({ activePart, selectedObjectIds: [] }),
            setFoldProgress: (foldProgress) => set({ foldProgress: Math.max(0, Math.min(1, foldProgress)) }),
            toggleXRay: () => set((state) => ({ xRay: !state.xRay })),
            toggleTurnInWarning: () => set((state) => ({ showTurnInWarning: !state.showTurnInWarning })),
            setLineTaggingMode: (lineTaggingMode) => set({ lineTaggingMode }),
            setUploadedLineTag: (lineId, tag) =>
                set((state) => {
                    if (state.design.source.kind !== 'uploaded-dieline' || !state.design.source.lines) {
                        return state;
                    }
                    const lines = state.design.source.lines.map((l) => (l.id === lineId ? { ...l, tag } : l));
                    return {
                        design: {
                            ...state.design,
                            source: {
                                ...state.design.source,
                                lines,
                                foldMapped: lines.some((l) => l.tag === 'fold'),
                            },
                        },
                    };
                }),
            setCameraPreset: (cameraPreset) => set({ cameraPreset }),
            setSelectedObjectIds: (selectedObjectIds) => set({ selectedObjectIds }),
            setSelectedPanelId: (selectedPanelId) => set({ selectedPanelId }),
            updateParams: (params) =>
                set((state) => {
                    if (state.design.source.kind !== 'parametric') {
                        return state;
                    }
                    return {
                        design: {
                            ...state.design,
                            source: {
                                kind: 'parametric',
                                params: { ...state.design.source.params, ...params },
                            },
                        },
                    };
                }),
            setSource: (source) =>
                set((state) => ({
                    design: { ...state.design, source },
                })),
            setMaterial: (material) =>
                set((state) => ({
                    design: { ...state.design, material },
                })),
            setFinish: (finish) =>
                set((state) => ({
                    design: { ...state.design, finish: { ...state.design.finish, ...finish } },
                })),
            updateUploadedPanels: (panels, foldMapped = true) =>
                set((state) => {
                    if (state.design.source.kind !== 'uploaded-dieline') return state;
                    return {
                        design: {
                            ...state.design,
                            source: { ...state.design.source, panels, foldMapped },
                        },
                    };
                }),
            setFaceColor: (panelId, color) =>
                set((state) => ({
                    design: {
                        ...state.design,
                        faceColors: { ...state.design.faceColors, [panelId]: color },
                    },
                })),
            setObjects: (side, objects) =>
                set((state) => ({
                    design: withObjects(state.design, state.activePart, side, objects),
                })),
            addObject: (side, object) =>
                set((state) => ({
                    design: withObjects(state.design, state.activePart, side, [...objectsOf(state, side), { ...object, side }]),
                    selectedObjectIds: [object.id],
                })),
            addObjects: (side, objects) =>
                set((state) => ({
                    design: withObjects(state.design, state.activePart, side, [...objectsOf(state, side), ...objects.map((o) => ({ ...o, side }))]),
                    selectedObjectIds: objects.map((o) => o.id),
                })),
            updateObjects: (side, patches) =>
                set((state) => {
                    const byId = new Map(patches.map((p) => [p.id, p]));
                    let changed = false;
                    const next = objectsOf(state, side).map((o) => {
                        const p = byId.get(o.id);
                        if (!p) return o;
                        changed = true;
                        return {
                            ...o,
                            ...(p.locked !== undefined ? { locked: p.locked } : {}),
                            props: p.props ? { ...o.props, ...p.props } : o.props,
                        };
                    });
                    return changed ? { design: withObjects(state.design, state.activePart, side, next) } : state;
                }),
            removeObjects: (side, ids) =>
                set((state) => ({
                    design: withObjects(
                        state.design,
                        state.activePart,
                        side,
                        objectsOf(state, side).filter((o) => !ids.includes(o.id)),
                    ),
                    selectedObjectIds: state.selectedObjectIds.filter((id) => !ids.includes(id)),
                })),
            duplicateObjects: (side, ids) =>
                set((state) => {
                    const copies = objectsOf(state, side)
                        .filter((o) => ids.includes(o.id))
                        .map(cloneWithNewIds)
                        .map((o) => ({
                            ...o,
                            locked: false,
                            props: {
                                ...o.props,
                                left: Number(o.props.left ?? 0) + DUPLICATE_OFFSET,
                                top: Number(o.props.top ?? 0) + DUPLICATE_OFFSET,
                            },
                        }));
                    if (!copies.length) return state;
                    return {
                        design: withObjects(state.design, state.activePart, side, [...objectsOf(state, side), ...copies]),
                        selectedObjectIds: copies.map((c) => c.id),
                    };
                }),
            moveObjects: (side, ids, move) =>
                set((state) => ({
                    design: withObjects(state.design, state.activePart, side, reorder(objectsOf(state, side), ids, move)),
                })),
            replaceObjects: (side, removeIds, insert) =>
                set((state) => {
                    const list = objectsOf(state, side);
                    const top = list.reduce((max, o, i) => (removeIds.includes(o.id) ? i : max), -1);
                    const before = list.slice(0, top + 1).filter((o) => !removeIds.includes(o.id));
                    const after = list.slice(top + 1).filter((o) => !removeIds.includes(o.id));
                    const placed = insert.map((o) => ({ ...o, side }));
                    return {
                        design: withObjects(state.design, state.activePart, side, [...before, ...placed, ...after]),
                        selectedObjectIds: placed.map((o) => o.id),
                    };
                }),
            copyObjects: (side, ids) => {
                clipboard = objectsOf(get(), side).filter((o) => ids.includes(o.id));
                pasteCount = 0;
            },
            pasteObjects: (side) =>
                set((state) => {
                    if (!clipboard.length) return state;
                    pasteCount += 1;
                    const offset = DUPLICATE_OFFSET * pasteCount;
                    const copies = clipboard.map(cloneWithNewIds).map((o) => ({
                        ...o,
                        side,
                        locked: false,
                        props: { ...o.props, left: Number(o.props.left ?? 0) + offset, top: Number(o.props.top ?? 0) + offset },
                    }));
                    return {
                        design: withObjects(state.design, state.activePart, side, [...objectsOf(state, side), ...copies]),
                        selectedObjectIds: copies.map((c) => c.id),
                    };
                }),
            loadDesign: (design, meta) => {
                set((state) => ({
                    design,
                    selectedObjectIds: [],
                    selectedPanelId: null,
                    designMeta: { ...state.designMeta, ...meta },
                }));
                useEditorStore.temporal.getState().clear();
            },
        }),
        {
            limit: 50,
            partialize: (state) => ({ design: state.design }),
            // Only real design changes become undo steps (not tab switches, selection, sliders).
            equality: (past, current) => past.design === current.design,
        },
    ),
);
