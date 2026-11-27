import { CanvasTexture, RepeatWrapping, type Texture } from 'three';
import type { Design } from '../../types/design';
import { MATERIAL_COLORS } from './materials';

// Only the lazy 3D chunk imports this file (see the note at the top of materials.ts).

const bumpCache = new Map<string, Texture>();

/**
 * Generates a tileable procedural bump map for textured papers (linen, leatherette, kraft).
 * Returns null in non-DOM test environments.
 */
export function getMaterialBumpMap(material: Design['material']): Texture | null {
    if (typeof document === 'undefined') return null;
    // Built-in papers have their own grain; an admin material with a texture strength gets the
    // generic paper grain (the last branch below).
    if (!((MATERIAL_COLORS[material]?.bumpScale ?? 0) > 0)) {
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
