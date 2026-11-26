import { create } from 'zustand';
import { temporal } from 'zundo';
import type { BoxParams, BoxSource, CanvasObject, Design } from '@/types/design';

export type EditorTab = 'uploads' | 'elements' | 'text' | 'inspirations' | 'qr';
export type BoxSide = 'outside' | 'inside';
export type CameraPreset = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

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
            activeTab: 'uploads',
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
        }),
        {
            limit: 50,
            partialize: (state) => ({ design: state.design }),
        },
    ),
);
