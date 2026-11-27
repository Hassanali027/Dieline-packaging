import type { SheetTextures } from '@/hooks/use-sheet-textures';
import { materialColor } from '@/lib/three/materials';
import type { CameraPreset } from '@/store/useEditorStore';
import type { BoxStyle, DielineResult } from '@/types/design';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Vector3 } from 'three';
import FoldedBox from './FoldedBox';

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

function CameraRig({ preset, size }: { preset: CameraPreset; size: NonNullable<Props['size']> }) {
    const camera = useThree((s) => s.camera);
    const controls = useThree((s) => s.controls) as unknown as { target: Vector3; update: () => void } | null;
    const { length, width, depth } = size;

    useEffect(() => {
        const [dx, dy, dz] = PRESET_DIRECTIONS[preset];
        const len = Math.hypot(dx, dy, dz);
        const distance = Math.max(length, width, depth) * 2.4;
        const target: [number, number, number] = [0, depth / 2, 0];
        camera.position.set(target[0] + (dx / len) * distance, target[1] + (dy / len) * distance, target[2] + (dz / len) * distance);
        camera.lookAt(...target);
        if (controls) {
            controls.target.set(...target);
            controls.update();
        }
    }, [preset, length, width, depth, camera, controls]);

    return null;
}

/**
 * Wraps a texture canvas for three.js and re-uploads it when the editor redraws it.
 * The inside sheet is drawn mirrored (as the editor shows it), so it is flipped back here.
 */
function useSheetTexture(canvas: HTMLCanvasElement | null | undefined, version: number, mirrored: boolean) {
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
    const outsideTexture = useSheetTexture(textures?.outside, textures?.version ?? 0, false);
    const insideTexture = useSheetTexture(textures?.inside, textures?.version ?? 0, true);
    const extent = size ? Math.max(size.length, size.width, size.depth) : 200;

    return (
        <div ref={containerRef} className="relative h-full w-full">
            <Canvas
                shadows="percentage"
                dpr={[1, 2]}
                camera={{ fov: 35, near: 1, far: extent * 50, position: [extent, extent, extent * 2] }}
                onPointerMissed={() => onSelectPanel?.(null)}
                gl={{ preserveDrawingBuffer: true, antialias: true }}
            >
                <color attach="background" args={['#f1f5f9']} />
                <hemisphereLight args={['#ffffff', '#cbd5e1', 0.9]} />
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

                {result && size && (
                    <FoldedBox
                        result={result}
                        style={style}
                        outsideTexture={outsideTexture}
                        insideTexture={insideTexture}
                        transparent={material === 'transparent'}
                        progress={progress}
                        thickness={size.thickness}
                        outsideColor={materialColor(material, 'outside')}
                        insideColor={materialColor(material, 'inside')}
                        faceColors={faceColors}
                        selectedPanelId={selectedPanelId}
                        onSelectPanel={(id) => onSelectPanel?.(id)}
                    />
                )}

                <ContactShadows position={[0, -0.5, 0]} scale={extent * 6} far={extent} blur={2.5} opacity={0.35} resolution={512} />
                <OrbitControls makeDefault enableDamping minDistance={extent * 0.6} maxDistance={extent * 8} />
                {size && <CameraRig preset={cameraPreset} size={size} />}
            </Canvas>
        </div>
    );
}
