import type { SheetTextures } from '@/hooks/use-sheet-textures';
import { buildAssembly, type AssemblyPiece } from '@/lib/three/assembly';
import { materialColor } from '@/lib/three/materials';
import type { CameraPreset } from '@/store/useEditorStore';
import type { BoxStyle, DielineResult } from '@/types/design';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Box3, CanvasTexture, Matrix4, RepeatWrapping, SRGBColorSpace, Vector3 } from 'three';
import FoldedBox from './FoldedBox';
import { foldedBounds } from '@/lib/three/foldTree';

type Props = {
    result: DielineResult | null;
    style?: BoxStyle;
    textures?: SheetTextures | null;
    size: { length: number; width: number; depth: number; thickness: number } | null;
    progress: number;
    material: string;
    faceColors: Record<string, string>;
    cameraPreset: CameraPreset;
    selectedPanelId: string | null;
    onSelectPanel?: (id: string | null) => void;
};

/** Direction from the box centre to the camera for each preset (Y up, +Z = front). */
const PRESET_DIRECTIONS: Record<CameraPreset, [number, number, number]> = {
    front: [0.35, 0.45, 1],
    back: [-0.35, 0.45, -1],
    left: [-1, 0.45, 0.35],
    right: [1, 0.45, -0.35],
    top: [0, 1, 0.0001],
    bottom: [0, -1, 0.0001],
};

function CameraRig({ preset, bounds }: { preset: CameraPreset; bounds: Box3 }) {
    const camera = useThree((s) => s.camera);
    const controls = useThree((s) => s.controls) as unknown as { target: Vector3; update: () => void } | null;
    useEffect(() => {
        const [dx, dy, dz] = PRESET_DIRECTIONS[preset];
        const len = Math.hypot(dx, dy, dz);
        const center = bounds.getCenter(new Vector3());
        const diagonal = Math.max(1, bounds.getSize(new Vector3()).length());
        const fov = (camera as typeof camera & { fov?: number }).fov ?? 35;
        const distance = (diagonal * 0.5) / Math.sin((fov * Math.PI) / 360) * 1.12;
        const target: [number, number, number] = [center.x, center.y, center.z];
        camera.position.set(target[0] + (dx / len) * distance, target[1] + (dy / len) * distance, target[2] + (dz / len) * distance);
        camera.lookAt(...target);
        if (controls) {
            controls.target.set(...target);
            controls.update();
        }
    }, [preset, bounds, camera, controls]);

    return null;
}

/**
 * Wraps a texture canvas for three.js and re-uploads it when the editor redraws it.
 * The inside sheet is drawn mirrored (as the editor shows it), so it is flipped back here.
 */
function useSheetTexture(canvas: HTMLCanvasElement | null | undefined, version: number, mirrored: boolean) {
    // (one texture per canvas; see PieceTextures for several printed parts)
    const texture = useMemo(() => {
        if (!canvas) return null;
        const t = new CanvasTexture(canvas);
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = 8;
        if (mirrored) {
            t.wrapS = RepeatWrapping;
            t.repeat.x = -1;
            t.offset.x = 1;
        }
        return t;
    }, [canvas, mirrored]);

    useEffect(() => {
        if (texture) texture.needsUpdate = true;
    }, [texture, version]);
    useEffect(() => () => texture?.dispose(), [texture]);
    return texture;
}

export default function Preview3D({
    result,
    style,
    textures,
    size,
    progress,
    material,
    faceColors,
    cameraPreset,
    selectedPanelId,
    onSelectPanel,
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const pieces = useMemo(() => (result && size ? buildAssembly(style, result, progress, size.thickness) : []), [result, style, progress, size]);
    const extent = size ? Math.max(size.length, size.width, size.depth) : 200;
    const cameraBounds = useMemo(() => {
        const box = new Box3();
        if (!result || !size) return box.setFromCenterAndSize(new Vector3(), new Vector3(extent, extent, extent));
        for (const endpoint of [0, 1]) {
            for (const piece of buildAssembly(style, result, endpoint, size.thickness)) {
                const pieceBounds = foldedBounds(piece.result.panels, piece.fold, piece.orientation);
                pieceBounds.applyMatrix4(new Matrix4().makeTranslation(...piece.position));
                box.union(pieceBounds);
            }
        }
        return box;
    }, [result, style, size?.length, size?.width, size?.depth, size?.thickness, extent]);

    return (
        <div ref={containerRef} className="relative h-full w-full">
            <Canvas
                shadows="percentage"
                dpr={[1, 2]}
                camera={{ fov: 35, near: 1, far: extent * 50, position: [extent, extent, extent * 2] }}
                onPointerMissed={() => onSelectPanel?.(null)}
                gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
            >
                {/* Transparent: the studio gradient behind the canvas is CSS (.editor-studio). */}
                <hemisphereLight args={['#ffffff', '#4c4f72', 1.1]} />
                <directionalLight
                    position={[extent, extent * 2, extent * 1.5]}
                    intensity={1.6}
                    castShadow
                    shadow-mapSize={[2048, 2048]}
                    shadow-camera-left={-extent * 2}
                    shadow-camera-right={extent * 2}
                    shadow-camera-top={extent * 2}
                    shadow-camera-bottom={-extent * 2}
                    shadow-camera-far={extent * 10}
                    // World units are mm; these stop self-shadow stripes ("acne") on thin boards.
                    shadow-bias={-0.0005}
                    shadow-normalBias={0.6}
                />
                <directionalLight position={[-extent, extent, -extent]} intensity={0.4} />

                {size &&
                    pieces.map((piece) => (
                        <PieceBox
                            key={piece.key}
                            piece={piece}
                            textures={textures?.surfaces[piece.key]}
                            version={textures?.version ?? 0}
                            thickness={size.thickness}
                            material={material}
                            faceColors={faceColors}
                            selectedPanelId={selectedPanelId}
                            onSelectPanel={onSelectPanel}
                        />
                    ))}

                <ContactShadows position={[0, -0.5, 0]} scale={extent * 6} far={extent} blur={2.5} opacity={0.65} resolution={512} />
                <OrbitControls makeDefault enableDamping minDistance={extent * 0.6} maxDistance={extent * 8} />
                {size && <CameraRig preset={cameraPreset} bounds={cameraBounds} />}
            </Canvas>
        </div>
    );
}

/** One assembly piece with its own outside / inside sheet textures. */
function PieceBox({
    piece,
    textures,
    version,
    thickness,
    material,
    faceColors,
    selectedPanelId,
    onSelectPanel,
}: {
    piece: AssemblyPiece;
    textures?: { outside: HTMLCanvasElement | null; inside: HTMLCanvasElement | null };
    version: number;
    thickness: number;
    material: string;
    faceColors: Record<string, string>;
    selectedPanelId: string | null;
    onSelectPanel?: (id: string | null) => void;
}) {
    const outsideTexture = useSheetTexture(textures?.outside, version, false);
    const insideTexture = useSheetTexture(textures?.inside, version, true);
    return (
        <FoldedBox
            result={piece.result}
            orientation={piece.orientation}
            position={piece.position}
            progress={piece.fold}
            outsideTexture={outsideTexture}
            insideTexture={insideTexture}
            transparent={material === 'transparent'}
            thickness={thickness}
            outsideColor={materialColor(material, 'outside')}
            insideColor={materialColor(material, 'inside')}
            faceColors={faceColors}
            selectedPanelId={selectedPanelId}
            onSelectPanel={(id) => onSelectPanel?.(id)}
        />
    );
}
