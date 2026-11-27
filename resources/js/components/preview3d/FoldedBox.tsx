import { buildFoldTree, foldedBounds, nodeQuaternion, styleOrientation, type FoldNode } from '@/lib/three/foldTree';
import type { BoxStyle, DielineResult } from '@/types/design';
import { useEffect, useMemo } from 'react';
import { ExtrudeGeometry, Shape, Vector2, Vector3, type BufferGeometry, type Texture } from 'three';

type Props = {
    result: DielineResult;
    style?: BoxStyle;
    progress: number;
    thickness: number;
    outsideColor: string;
    insideColor: string;
    faceColors: Record<string, string>;
    /** Printed sheet textures in dieline space (Dev 2's texture canvases). */
    outsideTexture?: Texture | null;
    insideTexture?: Texture | null;
    transparent?: boolean;
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

type NodeProps = Omit<Props, 'result' | 'style'> & { node: FoldNode; sheet: { width: number; height: number } };

function PanelNode({ node, sheet, ...props }: NodeProps) {
    const geometry = usePanelGeometry(node, props.thickness, sheet);
    const quaternion = useMemo(() => nodeQuaternion(node, props.progress), [node, props.progress]);
    const selected = props.selectedPanelId === node.panel.id;
    const faceColor = props.faceColors[node.panel.id];
    const transparency = props.transparent ? { transparent: true, opacity: 0.45, depthWrite: false } : {};
    const highlight = { emissive: selected ? '#4f46e5' : '#000000', emissiveIntensity: selected ? 0.25 : 0 };

    return (
        <group position={node.offset} quaternion={quaternion}>
            {/* Shape XY → world XZ: rotate +90° about X so (x, y, 0) lands on (x, 0, y). */}
            <mesh
                geometry={geometry}
                rotation={[Math.PI / 2, 0, 0]}
                castShadow={!props.transparent}
                receiveShadow
                onClick={(e) => {
                    e.stopPropagation();
                    props.onSelectPanel?.(node.panel.id);
                }}
            >
                <meshStandardMaterial
                    attach="material-0"
                    color={props.insideTexture ? '#ffffff' : props.insideColor}
                    map={props.insideTexture ?? null}
                    roughness={0.9}
                    {...transparency}
                    {...highlight}
                />
                <meshStandardMaterial attach="material-1" color={EDGE_COLOR} roughness={0.95} {...transparency} />
                <meshStandardMaterial
                    attach="material-2"
                    color={props.outsideTexture ? '#ffffff' : (faceColor ?? props.outsideColor)}
                    map={props.outsideTexture ?? null}
                    roughness={0.8}
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

/** Folds the dieline panels around their hinges and stands the box on the ground, centred. */
export default function FoldedBox({ result, style, ...props }: Props) {
    const roots = useMemo(() => buildFoldTree(result.panels), [result]);
    const orientation = useMemo(() => styleOrientation(style), [style]);
    const sheet = result.overallSize;

    // Centre on the fully folded box (not the current fold) so it does not drift while folding.
    const offset = useMemo<[number, number, number]>(() => {
        const box = foldedBounds(result.panels, 1, orientation);
        const centre = box.getCenter(new Vector3());
        return [-centre.x, -box.min.y + props.thickness, -centre.z];
    }, [result, orientation, props.thickness]);

    return (
        <group position={offset}>
            <group quaternion={orientation}>
                {roots.map((root) => (
                    <PanelNode key={root.panel.id} node={root} sheet={sheet} {...props} />
                ))}
            </group>
        </group>
    );
}
