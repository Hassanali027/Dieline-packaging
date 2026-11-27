import type { SheetTextures } from '@/hooks/use-sheet-textures';
import { buildDielineResult } from '@/lib/dieline/result';
import { buildAssembly, type AssemblyPiece } from '@/lib/three/assembly';
import { getMaterialBumpMap } from '@/lib/three/bumpMaps';
import { foldedBounds } from '@/lib/three/foldTree';
import { materialColor, resolveFinishProps, type ResolvedFinishProps } from '@/lib/three/materials';
import { useEditorStore, type CameraPreset } from '@/store/useEditorStore';
import type { BoxStyle, Design, DielineResult } from '@/types/design';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Box3, CanvasTexture, PMREMGenerator, RepeatWrapping, SRGBColorSpace, Vector3 as ThreeVector3, type Texture } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import FoldedBox from './FoldedBox';

type Props = {
    result: DielineResult | null;
    style?: BoxStyle;
    textures?: SheetTextures | null;
    size: { length: number; width: number; depth: number; thickness: number } | null;
    progress: number;
    material: string;
    finish?: Design['finish'];
    xRay?: boolean;
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

/**
 * Frames the box from a preset direction. `bounds` covers the box both closed and fully open
 * (Dev 1): a drawer sliding out or a book cover swinging up stays in view.
 */
function CameraRig({ preset, bounds }: { preset: CameraPreset; bounds: Box3 }) {
    const camera = useThree((s) => s.camera);
    const controls = useThree((s) => s.controls) as unknown as { target: ThreeVector3; update: () => void } | null;

    useEffect(() => {
        const [dx, dy, dz] = PRESET_DIRECTIONS[preset];
        const len = Math.hypot(dx, dy, dz);
        const centre = bounds.getCenter(new ThreeVector3());
        const size = bounds.getSize(new ThreeVector3());
        // Same framing as before for a plain box (2.4 × its largest side), more room for open parts.
        const distance = Math.max(size.x, size.y, size.z, 1) * 2.4;
        const target: [number, number, number] = [centre.x, centre.y, centre.z];
        camera.position.set(target[0] + (dx / len) * distance, target[1] + (dy / len) * distance, target[2] + (dz / len) * distance);
        camera.lookAt(...target);
        if (controls) {
            controls.target.set(...target);
            controls.update();
        }
    }, [preset, bounds, camera, controls]);

    return null;
}

/** Everything the assembly ever occupies (closed and fully open), in world mm. */
function assemblyBounds(style: BoxStyle | undefined, result: DielineResult, thickness: number): Box3 {
    const box = new Box3();
    for (const progress of [0, 1]) {
        for (const piece of buildAssembly(style, result, progress, thickness)) {
            const local = foldedBounds(piece.result.panels, piece.fold, piece.orientation).translate(new ThreeVector3(...piece.position));
            box.union(local);
        }
    }
    return box;
}

/**
 * Soft studio reflections (three's built-in RoomEnvironment, nothing downloaded). Without an
 * environment, metals have nothing to reflect: gold / silver foil rendered dark brown, and
 * gloss, clearcoat and spot UV looked the same as matte.
 */
function StudioEnvironment() {
    const gl = useThree((s) => s.gl);
    const scene = useThree((s) => s.scene);

    useEffect(() => {
        const pmrem = new PMREMGenerator(gl);
        const room = new RoomEnvironment();
        const env = pmrem.fromScene(room, 0.04).texture;
        scene.environment = env;
        scene.environmentIntensity = ENVIRONMENT_INTENSITY;
        return () => {
            scene.environment = null;
            env.dispose();
            room.dispose();
            pmrem.dispose();
        };
    }, [gl, scene]);

    return null;
}

const ENVIRONMENT_INTENSITY = 0.45;

/** Folding thickness used for an uploaded dieline (it has no box params). */
const UPLOADED_BOARD_MM = 0.5;

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

/** How strongly the emboss / deboss height map lifts the surface in the 3D view. */
const RELIEF_BUMP_SCALE = 4;

/** The emboss / deboss height map as a texture (linear data, not a colour image). */
function useReliefTexture(canvas: HTMLCanvasElement | null | undefined, version: number) {
    const texture = useMemo(() => (canvas ? new CanvasTexture(canvas) : null), [canvas]);
    useEffect(() => {
        if (texture) texture.needsUpdate = true;
    }, [texture, version]);
    useEffect(() => () => texture?.dispose(), [texture]);
    return texture;
}

export default function Preview3D({
    result: generatedResult,
    style,
    textures,
    size,
    progress,
    material,
    finish,
    xRay = false,
    faceColors,
    cameraPreset,
    selectedPanelId,
    onSelectPanel,
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    // Fold mapping (Sprint 3): an uploaded dieline is folded straight from its mapped panels,
    // so changing the base panel or an angle in FoldMappingPanel updates the 3D view live.
    const source = useEditorStore((s) => s.design.source);
    const uploadedPanels = source.kind === 'uploaded-dieline' ? source.panels : null;
    const result = useMemo(
        () => (uploadedPanels ? (uploadedPanels.length ? buildDielineResult(uploadedPanels) : null) : generatedResult),
        [uploadedPanels, generatedResult],
    );
    // An uploaded dieline has no params: size the scene from its folded panels instead.
    const boxSize = useMemo(() => {
        if (size || !result) return size;
        const box = foldedBounds(result.panels, 1);
        return {
            length: box.max.x - box.min.x || 100,
            width: box.max.z - box.min.z || 100,
            depth: box.max.y - box.min.y || 50,
            thickness: UPLOADED_BOARD_MM,
        };
    }, [size, result]);
    const pieces = useMemo(
        () => (result && boxSize ? buildAssembly(style, result, progress, boxSize.thickness) : []),
        [result, style, progress, boxSize],
    );
    const finishProps = useMemo(() => resolveFinishProps(material, finish), [material, finish]);
    const bumpMap = useMemo(() => getMaterialBumpMap(material), [material]);
    const extent = boxSize ? Math.max(boxSize.length, boxSize.width, boxSize.depth) : 200;
    const cameraBounds = useMemo(() => (result && boxSize ? assemblyBounds(style, result, boxSize.thickness) : null), [result, style, boxSize]);

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
                {/* Neutral grey bounce from below: a blue-violet ground colour turned the box's underside navy. */}
                <hemisphereLight args={['#ffffff', '#a3a7ae', 0.85]} />
                <StudioEnvironment />
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

                {boxSize &&
                    pieces.map((piece) => (
                        <PieceBox
                            key={piece.key}
                            piece={piece}
                            textures={textures?.surfaces[piece.key]}
                            version={textures?.version ?? 0}
                            thickness={boxSize.thickness}
                            material={material}
                            finishProps={finishProps}
                            bumpMap={bumpMap}
                            xRay={xRay}
                            faceColors={faceColors}
                            selectedPanelId={selectedPanelId}
                            onSelectPanel={onSelectPanel}
                        />
                    ))}

                <ContactShadows position={[0, -0.5, 0]} scale={extent * 6} far={extent} blur={2.5} opacity={0.65} resolution={512} />
                <OrbitControls makeDefault enableDamping minDistance={extent * 0.6} maxDistance={extent * 8} />
                {cameraBounds && <CameraRig preset={cameraPreset} bounds={cameraBounds} />}
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
    finishProps,
    bumpMap,
    xRay,
    faceColors,
    selectedPanelId,
    onSelectPanel,
}: {
    piece: AssemblyPiece;
    textures?: { outside: HTMLCanvasElement | null; inside: HTMLCanvasElement | null; relief?: HTMLCanvasElement | null };
    version: number;
    thickness: number;
    material: string;
    finishProps: ResolvedFinishProps;
    bumpMap: Texture | null;
    xRay: boolean;
    faceColors: Record<string, string>;
    selectedPanelId: string | null;
    onSelectPanel?: (id: string | null) => void;
}) {
    const outsideTexture = useSheetTexture(textures?.outside, version, false);
    const insideTexture = useSheetTexture(textures?.inside, version, true);
    const reliefTexture = useReliefTexture(textures?.relief, version);
    return (
        <FoldedBox
            result={piece.result}
            orientation={piece.orientation}
            position={piece.position}
            hingeRotation={piece.hingeRotation}
            progress={piece.fold}
            outsideTexture={outsideTexture}
            insideTexture={insideTexture}
            // Emboss / deboss relief wins over the paper grain (one bump map per face).
            bumpMap={reliefTexture ?? bumpMap}
            finishProps={reliefTexture ? { ...finishProps, bumpScale: RELIEF_BUMP_SCALE } : finishProps}
            transparent={material === 'transparent'}
            xRay={xRay}
            thickness={thickness}
            outsideColor={materialColor(material, 'outside')}
            insideColor={materialColor(material, 'inside')}
            faceColors={faceColors}
            selectedPanelId={selectedPanelId}
            onSelectPanel={(id) => onSelectPanel?.(id)}
        />
    );
}
