import { CanvasTexture, RepeatWrapping, type Texture } from 'three';
import type { Design } from '../../types/design';

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

const bumpCache = new Map<string, Texture>();

/**
 * Generates a tileable procedural bump map for textured papers (linen, leatherette, kraft).
 * Returns null in non-DOM test environments.
 */
export function getMaterialBumpMap(material: Design['material']): Texture | null {
    if (typeof document === 'undefined') return null;
    if (material !== 'linen' && material !== 'leatherette' && material !== 'kraft' && material !== 'wrap-paper') {
        return null;
    }
    const cached = bumpCache.get(material);
    if (cached) return cached;

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    if (material === 'linen') {
        for (let y = 0; y < size; y += 4) {
            ctx.fillStyle = y % 8 === 0 ? '#a8a8a8' : '#646464';
            ctx.fillRect(0, y, size, 2);
        }
        for (let x = 0; x < size; x += 4) {
            ctx.fillStyle = x % 8 === 0 ? 'rgba(200,200,200,0.45)' : 'rgba(60,60,60,0.45)';
            ctx.fillRect(x, 0, 2, size);
        }
    } else if (material === 'leatherette') {
        for (let y = 0; y < size; y += 8) {
            for (let x = 0; x < size; x += 8) {
                const jitterX = ((x * 13 + y * 7) % 5) - 2;
                const jitterY = ((x * 3 + y * 11) % 5) - 2;
                ctx.fillStyle = '#c4c4c4';
                ctx.beginPath();
                ctx.arc(x + 4 + jitterX, y + 4 + jitterY, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    } else {
        for (let i = 0; i < 220; i++) {
            const x = (i * 53) % size;
            const y = (i * 97) % size;
            ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)';
            ctx.fillRect(x, y, 4, 1);
        }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(6, 6);
    bumpCache.set(material, texture);
    return texture;
}
