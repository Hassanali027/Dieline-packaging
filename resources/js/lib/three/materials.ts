import type { Design } from '../../types/design';

// Keep this file free of `three` imports: the 2D editor bundles it (vite.config.js puts it in
// the 'editor-core' chunk), and importing Three.js here pulls all of Three into that chunk and
// drops resources/js/pages/editor.tsx from the Vite manifest (/editor then fails with a 500).
// Anything that needs Three.js objects goes in another lib/three file, e.g. bumpMaps.ts.

export type MaterialSpec = {
    label: string;
    outside: string;
    inside: string;
    roughness: number;
    bumpScale: number;
};

/** Base board and wrap-paper materials shared by the 2D canvas and the 3D preview. */
export const MATERIAL_COLORS: Record<string, MaterialSpec> = {
    white: { label: 'White', outside: '#f8fafc', inside: '#eef1f4', roughness: 0.78, bumpScale: 0 },
    kraft: { label: 'Kraft', outside: '#c8a27a', inside: '#b98f63', roughness: 0.92, bumpScale: 0.14 },
    transparent: { label: 'Transparent', outside: '#e6f0f7', inside: '#e6f0f7', roughness: 0.15, bumpScale: 0 },
    'wrap-paper': { label: 'Wrap Paper', outside: '#f4f1ea', inside: '#e9e4d8', roughness: 0.68, bumpScale: 0.08 },
    linen: { label: 'Linen', outside: '#ede7dc', inside: '#e2dacb', roughness: 0.88, bumpScale: 0.35 },
    leatherette: { label: 'Leatherette', outside: '#2b2d34', inside: '#3a3d45', roughness: 0.56, bumpScale: 0.45 },
};

export const MATERIAL_OPTIONS = Object.entries(MATERIAL_COLORS).map(([value, m]) => ({ value, label: m.label }));

export function materialColor(material: Design['material'], side: 'outside' | 'inside'): string {
    const known = MATERIAL_COLORS[material];
    if (known) return known[side];
    // A custom material is stored as a CSS colour (e.g. "#ff8800").
    return material;
}

export type ResolvedFinishProps = {
    roughness: number;
    metalness: number;
    clearcoat: number;
    clearcoatRoughness: number;
    bumpScale: number;
    foilTint: string | null;
};

/** Computes physical material properties for board + lamination + foil + spot UV. */
export function resolveFinishProps(material: Design['material'], finish?: Design['finish']): ResolvedFinishProps {
    const spec = MATERIAL_COLORS[material];
    let roughness = spec?.roughness ?? 0.78;
    let metalness = 0;
    let clearcoat = 0;
    let clearcoatRoughness = 0.4;
    const bumpScale = spec?.bumpScale ?? 0;
    let foilTint: string | null = null;

    if (finish?.lamination === 'gloss') {
        roughness = 0.22;
        clearcoat = 0.8;
        clearcoatRoughness = 0.12;
    } else if (finish?.lamination === 'soft-touch') {
        roughness = 0.96;
        clearcoat = 0.15;
        clearcoatRoughness = 0.78;
    } else if (finish?.lamination === 'matte') {
        roughness = Math.max(roughness, 0.84);
    }

    if (finish?.spotUv) {
        clearcoat = Math.max(clearcoat, 0.92);
        clearcoatRoughness = Math.min(clearcoatRoughness, 0.08);
    }

    if (finish?.foil === 'gold') {
        metalness = 0.85;
        roughness = 0.22;
        foilTint = '#d4af37';
    } else if (finish?.foil === 'silver') {
        metalness = 0.88;
        roughness = 0.2;
        foilTint = '#d8dee9';
    }

    return { roughness, metalness, clearcoat, clearcoatRoughness, bumpScale, foilTint };
}
