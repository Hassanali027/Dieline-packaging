import type { BoxParams, BoxSource, CanvasObject, Design } from '@/types/design';
import { temporal } from 'zundo';
import { create } from 'zustand';

export type EditorTab = 'box' | 'uploads' | 'elements' | 'text' | 'inspirations' | 'qr';
export type BoxSide = 'outside' | 'inside';
export type CameraPreset = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
export type ZOrderMove = 'forward' | 'backward' | 'front' | 'back';

/** A partial update for one canvas object: props are merged, other fields replaced. */
export type ObjectPatch = { id: string; props?: Record<string, unknown>; locked?: boolean };

let idCounter = 0;
export function newObjectId(): string {
    idCounter += 1;
    return `obj-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export interface EditorState {
    activeTab: EditorTab;
    activeSide: BoxSide;
    foldProgress: number;
    xRay: boolean;
    cameraPreset: CameraPreset;
    selectedObjectIds: string[];
    selectedPanelId: string | null;
    design: Design;
    setActiveTab: (tab: EditorTab) => void;
    setActiveSide: (side: BoxSide) => void;
    setFoldProgress: (value: number) => void;
    toggleXRay: () => void;
    setCameraPreset: (preset: CameraPreset) => void;
    setSelectedObjectIds: (ids: string[]) => void;
    setSelectedPanelId: (panelId: string | null) => void;
    updateParams: (params: Partial<BoxParams>) => void;
    setSource: (source: BoxSource) => void;
    setMaterial: (material: Design['material']) => void;
    setFaceColor: (panelId: string, color: string) => void;
    setObjects: (side: BoxSide, objects: CanvasObject[]) => void;
    /** Adds an object on top and selects it. */
    addObject: (side: BoxSide, object: CanvasObject) => void;
    /** Applies several patches as one undo step (e.g. moving a multi-selection). */
    updateObjects: (side: BoxSide, patches: ObjectPatch[]) => void;
    removeObjects: (side: BoxSide, ids: string[]) => void;
    /** Copies the objects slightly offset, puts them on top and selects the copies. */
    duplicateObjects: (side: BoxSide, ids: string[]) => void;
    moveObjects: (side: BoxSide, ids: string[], move: ZOrderMove) => void;
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
        (set) => ({
            activeTab: 'box',
            activeSide: 'outside',
            foldProgress: 0.9,
            xRay: false,
            cameraPreset: 'front',
            selectedObjectIds: [],
            selectedPanelId: null,
            design: {
                source: { kind: 'parametric', params: defaultParams },
                outside: [],
                inside: [],
                faceColors: {},
                material: 'white',
            },
            setActiveTab: (activeTab) => set({ activeTab }),
            setActiveSide: (activeSide) => set({ activeSide }),
            setFoldProgress: (foldProgress) => set({ foldProgress: Math.max(0, Math.min(1, foldProgress)) }),
            toggleXRay: () => set((state) => ({ xRay: !state.xRay })),
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
            setFaceColor: (panelId, color) =>
                set((state) => ({
                    design: {
                        ...state.design,
                        faceColors: { ...state.design.faceColors, [panelId]: color },
                    },
                })),
            setObjects: (side, objects) =>
                set((state) => ({
                    design: { ...state.design, [side]: objects },
                })),
            addObject: (side, object) =>
                set((state) => ({
                    design: { ...state.design, [side]: [...state.design[side], { ...object, side }] },
                    selectedObjectIds: [object.id],
                })),
            updateObjects: (side, patches) =>
                set((state) => {
                    const byId = new Map(patches.map((p) => [p.id, p]));
                    let changed = false;
                    const next = state.design[side].map((o) => {
                        const p = byId.get(o.id);
                        if (!p) return o;
                        changed = true;
                        return {
                            ...o,
                            ...(p.locked !== undefined ? { locked: p.locked } : {}),
                            props: p.props ? { ...o.props, ...p.props } : o.props,
                        };
                    });
                    return changed ? { design: { ...state.design, [side]: next } } : state;
                }),
            removeObjects: (side, ids) =>
                set((state) => ({
                    design: { ...state.design, [side]: state.design[side].filter((o) => !ids.includes(o.id)) },
                    selectedObjectIds: state.selectedObjectIds.filter((id) => !ids.includes(id)),
                })),
            duplicateObjects: (side, ids) =>
                set((state) => {
                    const copies = state.design[side]
                        .filter((o) => ids.includes(o.id))
                        .map((o) => ({
                            ...o,
                            id: newObjectId(),
                            locked: false,
                            props: {
                                ...o.props,
                                left: Number(o.props.left ?? 0) + DUPLICATE_OFFSET,
                                top: Number(o.props.top ?? 0) + DUPLICATE_OFFSET,
                            },
                        }));
                    if (!copies.length) return state;
                    return {
                        design: { ...state.design, [side]: [...state.design[side], ...copies] },
                        selectedObjectIds: copies.map((c) => c.id),
                    };
                }),
            moveObjects: (side, ids, move) =>
                set((state) => ({
                    design: { ...state.design, [side]: reorder(state.design[side], ids, move) },
                })),
        }),
        {
            limit: 50,
            partialize: (state) => ({ design: state.design }),
            // Only real design changes become undo steps (not tab switches, selection, sliders).
            equality: (past, current) => past.design === current.design,
        },
    ),
);
