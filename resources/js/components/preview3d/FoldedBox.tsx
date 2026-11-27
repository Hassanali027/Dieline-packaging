import { buildFoldTree, nodeQuaternion, type FoldNode } from '@/lib/three/foldTree';
import type { DielineResult } from '@/types/design';
import { useEffect, useMemo } from 'react';
import { DoubleSide, ExtrudeGeometry, Shape } from 'three';

type Props = {
    result: DielineResult;
    progress: number;
    thickness: number;
    outsideColor: string;
    insideColor: string;
    faceColors: Record<string, string>;
    selectedPanelId: string | null;
    onSelectPanel?: (id: string) => void;
};

/** Extruded board for one panel, authored relative to the panel's pivot (hinge start). */
function usePanelGeometry(node: FoldNode, thickness: number) {
    const geometry = useMemo(() => {
        const shape = new Shape();
        node.panel.polygon.forEach((p, i) => {
            const x = p.x - node.origin.x;
            const y = p.y - node.origin.y;
            if (i === 0) shape.moveTo(x, y);
            else shape.lineTo(x, y);
        });
        shape.closePath();
        // Extrude along +Z; the mesh is rotated so +Z becomes -Y (board thickness below the sheet).
        return new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
    }, [node, thickness]);

    useEffect(() => () => geometry.dispose(), [geometry]);
    return geometry;
}

function PanelNode({ node, ...props }: Props & { node: FoldNode }) {
    const geometry = usePanelGeometry(node, props.thickness);
    const quaternion = useMemo(() => nodeQuaternion(node, props.progress), [node, props.progress]);
    const selected = props.selectedPanelId === node.panel.id;
    const outside = props.faceColors[node.panel.id] ?? props.outsideColor;

    return (
        <group position={node.offset} quaternion={quaternion}>
            {/* Shape XY → world XZ: rotate +90° about X so (x, y, 0) lands on (x, 0, y). */}
            <mesh
                geometry={geometry}
                rotation={[Math.PI / 2, 0, 0]}
                castShadow
                receiveShadow
                onClick={(e) => {
                    e.stopPropagation();
                    props.onSelectPanel?.(node.panel.id);
                }}
            >
                {/* ExtrudeGeometry groups: 0 = caps (top/bottom faces), 1 = side walls. */}
                <meshStandardMaterial
                    attach="material-0"
                    color={outside}
                    emissive={selected ? '#4f46e5' : '#000000'}
                    emissiveIntensity={selected ? 0.25 : 0}
                    roughness={0.85}
                    side={DoubleSide}
                />
                <meshStandardMaterial attach="material-1" color={props.insideColor} roughness={0.9} />
            </mesh>
            {node.children.map((child) => (
                <PanelNode key={child.panel.id} node={child} {...props} />
            ))}
        </group>
    );
}

/**
 * Folds the dieline panels around their hinges. Week 1 prototype: both faces of a panel
 * share one colour; Sprint 1 swaps the cap material for the 2D canvas texture.
 */
export default function FoldedBox(props: Props) {
    const roots = useMemo(() => buildFoldTree(props.result.panels), [props.result]);
    const base = props.result.panels.find((p) => !p.parentId);

    // Centre the box on the base panel so camera presets can look at the origin.
    const centre = useMemo(() => {
        if (!base) return { x: 0, y: 0 };
        const xs = base.polygon.map((p) => p.x);
        const ys = base.polygon.map((p) => p.y);
        return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    }, [base]);

    return (
        <group position={[-centre.x, props.thickness, -centre.y]}>
            {roots.map((root) => (
                <PanelNode key={root.panel.id} node={root} {...props} />
            ))}
        </group>
    );
}
