import { buildFoldTree, nodeQuaternion, type FoldNode } from '@/lib/three/foldTree';
import { layerFade, panelLayers } from '@/lib/three/layers';
import type { ResolvedFinishProps } from '@/lib/three/materials';
import type { DielineResult } from '@/types/design';
import { useEffect, useMemo } from 'react';
import { ExtrudeGeometry, Quaternion, Shape, Vector2, Vector3, type BufferGeometry, type Texture } from 'three';

type Props = {
    result: DielineResult;
    /** Where the assembly put this piece (see lib/three/assembly.ts). */
    orientation: Quaternion;
    position: [number, number, number];
    hingeRotation?: {
        pivot: [number, number, number];
        axis: [number, number, number];
        angle: number;
    };
    /** 0 = flat, 1 = folded. */
    progress: number;
    thickness: number;
    outsideColor: string;
    insideColor: string;
    faceColors: Record<string, string>;
    /** Printed sheet textures in dieline space (Dev 2's texture canvases). */
    outsideTexture?: Texture | null;
    insideTexture?: Texture | null;
    bumpMap?: Texture | null;
    finishProps?: ResolvedFinishProps;
    transparent?: boolean;
    xRay?: boolean;
    selectedPanelId: string | null;
    onSelectPanel?: (id: string) => void;
};

const EDGE_COLOR = '#d6cfc4';

/**
 * Extruded board for one panel, authored relative to the panel's pivot (hinge start).
 * Shape space is world X/Z before the mesh rotation, so dieline X is mirrored (see foldTree).
 * Caps get UVs in sheet space (u = x / sheet width, v = 1 - y / sheet height) so one texture
 * of the whole printed sheet lands on every panel in the right place.
 */
function usePanelGeometry(node: FoldNode, thickness: number, sheet: { width: number; height: number }) {
    const geometry = useMemo(() => {
        const { x: ox, y: oy } = node.origin;
        const shape = new Shape();
        node.panel.polygon.forEach((p, i) => {
            const x = -(p.x - ox);
            const y = p.y - oy;
            if (i === 0) shape.moveTo(x, y);
            else shape.lineTo(x, y);
        });
        shape.closePath();

        const uv = (vertices: ArrayLike<number>, i: number) =>
            new Vector2((ox - vertices[i * 3]) / sheet.width, 1 - (vertices[i * 3 + 1] + oy) / sheet.height);

        const g: BufferGeometry = new ExtrudeGeometry(shape, {
            depth: thickness,
            bevelEnabled: false,
            curveSegments: 1,
            UVGenerator: {
                generateTopUV: (_g, vertices, a, b, c) => [uv(vertices, a), uv(vertices, b), uv(vertices, c)],
                generateSideWallUV: () => [new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1)],
            },
        });

        // ExtrudeGeometry puts both caps in group 0 (first half z = 0, second half z = depth).
        // After the mesh rotation z = 0 is the inside face and z = depth the printed outside.
        const caps = g.groups.find((gr) => gr.materialIndex === 0);
        if (caps) {
            const half = caps.count / 2;
            g.groups = g.groups.filter((gr) => gr !== caps);
            g.addGroup(caps.start, half, 0); // inside
            g.addGroup(caps.start + half, half, 2); // outside
        }
        return g;
    }, [node, thickness, sheet.width, sheet.height]);

    useEffect(() => () => geometry.dispose(), [geometry]);
    return geometry;
}

type NodeProps = Omit<Props, 'result' | 'orientation' | 'position' | 'hingeRotation'> & {
    node: FoldNode;
    sheet: { width: number; height: number };
    /** Stacking layer per panel when closed (lib/three/layers.ts). */
    layers: Map<string, number>;
};

function PanelNode({ node, sheet, ...props }: NodeProps) {
    const geometry = usePanelGeometry(node, props.thickness, sheet);
    const quaternion = useMemo(() => nodeQuaternion(node, props.progress), [node, props.progress]);
    const selected = props.selectedPanelId === node.panel.id;
    const faceColor = props.faceColors[node.panel.id];
    const translucent = props.transparent || props.xRay;
    // Always pass all three values: R3F does not reset a prop that disappears, so spreading {}
    // when X-Ray / Transparent is turned off left the box see-through.
    const transparency = {
        transparent: translucent,
        opacity: props.xRay ? 0.28 : props.transparent ? 0.45 : 1,
        depthWrite: !translucent,
    };
    // three.js compiles opaque materials with alpha forced to 1 and does not recompile when
    // `transparent` flips, so the materials are remounted (key) when translucency changes.
    const highlight = { emissive: selected ? '#4f46e5' : '#000000', emissiveIntensity: selected ? 0.25 : 0 };
    const finish = props.finishProps;
    const outsideBaseColor = finish?.foilTint ?? faceColor ?? props.outsideColor;
    // Flaps that close flat against a wall sit one board further in per layer (+Y = inwards),
    // instead of sharing the wall's plane and flickering through it.
    const lift = (props.layers.get(node.panel.id) ?? 0) * props.thickness * layerFade(props.progress);

    return (
        <group position={node.offset} quaternion={quaternion}>
            {/* Shape XY → world XZ: rotate +90° about X so (x, y, 0) lands on (x, 0, y). */}
            <mesh
                geometry={geometry}
                position={[0, lift, 0]}
                rotation={[Math.PI / 2, 0, 0]}
                castShadow={!translucent}
                receiveShadow
                onClick={(e) => {
                    e.stopPropagation();
                    props.onSelectPanel?.(node.panel.id);
                }}
            >
                <meshStandardMaterial
                    key={`m0-${translucent}`}
                    attach="material-0"
                    color={props.insideTexture ? '#ffffff' : props.insideColor}
                    map={props.insideTexture ?? null}
                    roughness={0.9}
                    wireframe={props.xRay}
                    {...transparency}
                    {...highlight}
                />
                <meshStandardMaterial
                    key={`m1-${translucent}`}
                    attach="material-1"
                    color={EDGE_COLOR}
                    roughness={0.95}
                    wireframe={props.xRay}
                    {...transparency}
                />
                <meshPhysicalMaterial
                    // A bump map appearing, going or changing needs a new shader too (paper grain,
                    // emboss / deboss relief): remount rather than leave three on the old program.
                    key={`m2-${translucent}-${props.bumpMap?.uuid ?? 'flat'}`}
                    attach="material-2"
                    color={props.outsideTexture ? (finish?.foilTint ?? '#ffffff') : outsideBaseColor}
                    map={props.outsideTexture ?? null}
                    bumpMap={props.bumpMap ?? null}
                    bumpScale={finish?.bumpScale ?? 0}
                    roughness={finish?.roughness ?? 0.8}
                    metalness={finish?.metalness ?? 0}
                    clearcoat={finish?.clearcoat ?? 0}
                    clearcoatRoughness={finish?.clearcoatRoughness ?? 0.4}
                    wireframe={props.xRay}
                    {...transparency}
                    {...highlight}
                />
            </mesh>
            {node.children.map((child) => (
                <PanelNode key={child.panel.id} node={child} sheet={sheet} {...props} />
            ))}
        </group>
    );
}

/** Folds one piece's panels around their hinges and puts it where the assembly says. */
export default function FoldedBox({ result, orientation, position, hingeRotation, ...props }: Props) {
    const roots = useMemo(() => buildFoldTree(result.panels), [result]);
    const layers = useMemo(() => panelLayers(result.panels), [result]);
    const sheet = result.overallSize;

    const hingeQuaternion = useMemo(() => {
        if (!hingeRotation) return null;
        return new Quaternion().setFromAxisAngle(new Vector3(...hingeRotation.axis), hingeRotation.angle);
    }, [hingeRotation]);

    if (hingeRotation && hingeQuaternion) {
        const [px, py, pz] = hingeRotation.pivot;
        const relPos: [number, number, number] = [position[0] - px, position[1] - py, position[2] - pz];
        return (
            <group position={hingeRotation.pivot} quaternion={hingeQuaternion}>
                <group position={relPos}>
                    <group quaternion={orientation}>
                        {roots.map((root) => (
                            <PanelNode key={root.panel.id} node={root} sheet={sheet} layers={layers} {...props} />
                        ))}
                    </group>
                </group>
            </group>
        );
    }

    return (
        <group position={position}>
            <group quaternion={orientation}>
                {roots.map((root) => (
                    <PanelNode key={root.panel.id} node={root} sheet={sheet} layers={layers} {...props} />
                ))}
            </group>
        </group>
    );
}
